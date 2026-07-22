import { createHash, randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { parseInteractionResponse } from "./interaction-contract.mjs";

const execFile = promisify(execFileCallback);
const SYSTEM_PATHS = new Set(["state.json", "decisions.jsonl", "tasks.jsonl"]);
const ATTEMPT_TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const ATTEMPT_TRANSITIONS = new Map([
  ["submitting", new Set(["submitted", "succeeded", "failed", "cancelled", "submission_unknown"])],
  ["submission_unknown", new Set(["submitted", "running", "succeeded", "failed", "cancelled"])],
  ["submitted", new Set(["running", "succeeded", "failed", "cancel_requested"])],
  ["running", new Set(["succeeded", "failed", "cancel_requested"])],
  ["cancel_requested", new Set(["cancelled", "running", "succeeded", "failed"])],
  ["succeeded", new Set()], ["failed", new Set()], ["cancelled", new Set()]
]);

const safePathSchema = z.string().min(1).superRefine((value, context) => {
  if (path.posix.isAbsolute(value) || value.includes("\\") || value.split("/").includes("..") || path.posix.normalize(value) !== value || value === ".git" || value.startsWith(".git/")) {
    context.addIssue({ code: "custom", message: "path must be canonical, relative, and contained" });
  }
});

const targetStampSchema = z.strictObject({ path: safePathSchema, commit: z.string().min(1), objectId: z.string().min(1) });
const interactionStoredSchema = z.strictObject({
  id: z.string().min(1), stageId: z.string().min(1), kind: z.string().min(1), title: z.string().min(1), description: z.string().optional(),
  status: z.enum(["waiting", "submitted"]), targets: z.array(targetStampSchema), mediaTaskId: z.string().optional(),
  fields: z.array(z.unknown()).default([]), options: z.array(z.unknown()).default([]),
  allowedTaskActions: z.array(z.string()).optional(), response: z.unknown().optional(), createdAt: z.string(), submittedAt: z.string().optional()
});
const stateSchema = z.strictObject({
  version: z.number().int().positive(), stateRevision: z.number().int().nonnegative(),
  identity: z.strictObject({ productionId: z.string().min(1), title: z.string().min(1), createdAt: z.string() }),
  pipeline: z.strictObject({ id: z.string().min(1), version: z.number().int().positive(), revision: z.number().int().positive(), manifestRef: z.string().min(1) }),
  status: z.enum(["active", "paused", "completed"]), currentStage: z.string().min(1),
  stages: z.record(z.string(), z.enum(["pending", "active", "complete"])),
  executionGate: z.union([
    z.strictObject({ state: z.literal("open") }),
    z.strictObject({ state: z.literal("paused"), atStageId: z.string(), reasonCode: z.string(), requiredCapability: z.string().optional(), pausedAt: z.string() })
  ]),
  interaction: interactionStoredSchema.nullable(),
  correction: z.strictObject({ stageId: z.string(), evidence: z.string(), openedAt: z.string() }).nullable().default(null),
  updatedAt: z.string()
});

function clone(value) { return structuredClone(value); }
function now() { return new Date().toISOString(); }
function digest(value) { return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
function isMissingHead(error) { return error?.code === 128 || /unknown revision|does not have any commits|bad revision|invalid object name|exists on disk, but not in/.test(error?.stderr || error?.message || ""); }
function assetSourcePath(asset) { return asset?.source?.path || asset?.source?.localPath || null; }
function productReferencePaths(assets) {
  return (assets ?? []).filter((asset) => ["product", "product-reference"].includes(String(asset.role || "").toLowerCase()) && ["image", "product-image"].includes(String(asset.kind || "image").toLowerCase())).map(assetSourcePath).filter(Boolean);
}

async function git(cwd, args, { allowFailure = false, trim = true } = {}) {
  try {
    const stdout = (await execFile("git", args, { cwd, encoding: "utf8", maxBuffer: 8_000_000 })).stdout;
    return trim ? stdout.trimEnd() : stdout;
  }
  catch (error) { if (allowFailure) return null; throw new Error(`git ${args.join(" ")} failed: ${(error.stderr || error.message).trim()}`); }
}

async function atomicWrite(target, value) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(value, "utf8"); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, target);
  const directory = await open(path.dirname(target), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

async function readJson(target) { return JSON.parse(await readFile(target, "utf8")); }

function parseLedger(source, label) {
  if (!source) return [];
  const lines = source.endsWith("\n") ? source.slice(0, -1).split("\n") : source.split("\n");
  return lines.filter(Boolean).map((line, index) => {
    let event;
    try { event = JSON.parse(line); } catch { throw new Error(`${label} line ${index + 1} is not valid JSON`); }
    if (event.sequence !== index + 1) throw new Error(`${label} sequence must be contiguous`);
    return event;
  });
}

function patternRegex(pattern) {
  return new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]+")}$`);
}

function validateStateLifecycle(state, stages) {
  const ids = stages.map((stage) => stage.id);
  if (Object.keys(state.stages).length !== ids.length || ids.some((id) => !(id in state.stages))) throw new Error("state Stage IDs must match the Pipeline");
  if (state.status === "completed") {
    if (ids.some((id) => state.stages[id] !== "complete") || state.currentStage !== ids.at(-1) || state.executionGate.state !== "open") throw new Error("completed state requires every Stage complete");
    return;
  }
  const active = ids.filter((id) => state.stages[id] === "active");
  if (active.length !== 1 || active[0] !== state.currentStage) throw new Error("active or paused state requires one current active Stage");
  const activeIndex = ids.indexOf(active[0]);
  if (ids.slice(0, activeIndex).some((id) => state.stages[id] !== "complete") || ids.slice(activeIndex + 1).some((id) => state.stages[id] !== "pending")) throw new Error("Stage lifecycle must be complete prefix, active current, pending suffix");
  if (state.status === "paused") {
    if (state.executionGate.state !== "paused" || state.executionGate.atStageId !== state.currentStage) throw new Error("paused state requires a matching execution gate");
  } else if (state.executionGate.state !== "open") throw new Error("active state requires an open execution gate");
}

function applyTaskEvent(tasks, event) {
  if (event.type === "task-created") {
    if (tasks.has(event.task.id)) throw new Error(`Task already exists: ${event.task.id}`);
    if (event.task.redoOfTaskId && !tasks.has(event.task.redoOfTaskId)) throw new Error("Redo must reference an existing Task");
    tasks.set(event.task.id, clone({ ...event.task, attempts: [event.attempt], currentAttemptId: event.attempt.id, artifactUnrecoverable: null }));
    return;
  }
  const task = tasks.get(event.taskId);
  if (!task) throw new Error(`Unknown Task: ${event.taskId}`);
  if (event.type === "attempt-created") {
    const current = task.attempts.find((attempt) => attempt.id === task.currentAttemptId);
    if (!current || !["failed", "cancelled"].includes(current.status)) throw new Error("Retry requires a failed or cancelled current Attempt");
    if (event.attempt.number !== current.number + 1 || event.attempt.retryOfAttemptId !== current.id) throw new Error("Retry Attempt identity is invalid");
    task.attempts.push(clone(event.attempt)); task.currentAttemptId = event.attempt.id; return;
  }
  const attempt = task.attempts.find((candidate) => candidate.id === event.attemptId);
  if (!attempt) throw new Error(`Unknown Attempt: ${event.attemptId}`);
  if (event.type === "artifact-unrecoverable") {
    if (attempt.status !== "succeeded") throw new Error("Only a succeeded Attempt can have an unrecoverable artifact");
    task.artifactUnrecoverable = { attemptId: attempt.id, reason: event.reason, observedAt: event.createdAt }; return;
  }
  if (event.type !== "attempt-transition") throw new Error(`Unknown Task event type: ${event.type}`);
  if (!ATTEMPT_TRANSITIONS.get(attempt.status)?.has(event.status)) throw new Error(`Invalid Attempt transition ${attempt.status} -> ${event.status}`);
  if (attempt.status === "submission_unknown" && !event.reconciliation) throw new Error("Leaving submission_unknown requires reconciliation evidence");
  if (["failed", "cancelled"].includes(event.status) && attempt.status === "submitting" && !event.reconciliation) throw new Error("Ambiguous submission cannot become terminal without reconciliation");
  const submitId = event.providerSubmitId ?? attempt.providerSubmitId;
  if (["submitted", "running", "cancel_requested"].includes(event.status) && !submitId) throw new Error(`${event.status} requires providerSubmitId`);
  if (attempt.providerSubmitId && event.providerSubmitId && attempt.providerSubmitId !== event.providerSubmitId) throw new Error("providerSubmitId is write-once");
  if (event.status === "failed" && !event.error) throw new Error("failed requires an error");
  if (event.status === "cancelled" && !event.cancellation) throw new Error("cancelled requires cancellation evidence");
  if (event.status === "succeeded" && !event.result) throw new Error("succeeded requires a result");
  Object.assign(attempt, {
    status: event.status,
    ...(submitId ? { providerSubmitId: submitId } : {}),
    ...(event.submittedAt ? { submittedAt: event.submittedAt } : {}),
    ...(event.result ? { result: clone(event.result) } : {}),
    ...(event.error ? { error: clone(event.error) } : {}),
    ...(event.cancellation ? { cancellation: clone(event.cancellation) } : {}),
    ...(event.reconciliation ? { reconciliation: clone(event.reconciliation) } : {}),
    updatedAt: event.createdAt
  });
}

function projectTasks(events) {
  const tasks = new Map();
  for (const event of events) applyTaskEvent(tasks, event);
  return tasks;
}

export class SessionStore {
  constructor({ skillRoot }) {
    this.skillRoot = skillRoot;
    this.sessions = new Map();
    this.outputSessions = new Map();
    this.waiters = new Map();
  }

  async initializeRepository(outputDir) {
    await execFile("git", ["--version"], { encoding: "utf8" });
    await mkdir(outputDir, { recursive: true });
    if (!await stat(path.join(outputDir, ".git")).then((entry) => entry.isDirectory()).catch(() => false)) await git(outputDir, ["init", "--quiet"]);
    const top = await realpath(await git(outputDir, ["rev-parse", "--show-toplevel"]));
    if (top !== await realpath(outputDir)) throw new Error("outputDir must be its own git top-level repository");
    if (!await git(outputDir, ["config", "user.name"], { allowFailure: true })) await git(outputDir, ["config", "user.name", "Codex Video Production"]);
    if (!await git(outputDir, ["config", "user.email"], { allowFailure: true })) await git(outputDir, ["config", "user.email", "video-production@localhost"]);
    const ignorePath = path.join(outputDir, ".gitignore");
    const existing = await readFile(ignorePath, "utf8").catch((error) => error.code === "ENOENT" ? "" : Promise.reject(error));
    const lines = new Set(existing.split(/\r?\n/).filter(Boolean));
    lines.add("/.production.lock"); lines.add("/.*.tmp");
    await atomicWrite(ignorePath, `${[...lines].join("\n")}\n`);
  }

  async acquireLock(outputDir, sessionId, allowStale) {
    const lockPath = path.join(outputDir, ".production.lock");
    const claim = async () => {
      const handle = await open(lockPath, "wx");
      try { await handle.writeFile(`${JSON.stringify({ pid: process.pid, sessionId, createdAt: now() })}\n`); await handle.sync(); } finally { await handle.close(); }
    };
    try { await claim(); return lockPath; } catch (error) { if (error.code !== "EEXIST") throw error; }
    let existing;
    try { existing = await readJson(lockPath); } catch { existing = {}; }
    let alive = false;
    if (Number.isInteger(existing.pid)) try { process.kill(existing.pid, 0); alive = true; } catch (error) { if (error.code !== "ESRCH") alive = true; }
    if (!allowStale || alive) throw new Error(`Production is locked by active session ${existing.sessionId || "unknown"}`);
    await rm(lockPath); await claim(); return lockPath;
  }

  async open({ sessionId, title, outputDir, productionId, pipeline, loadedPipeline }) {
    if (!path.isAbsolute(outputDir)) throw new Error("outputDir must be absolute");
    const outputReal = await realpath(await mkdir(outputDir, { recursive: true }).then(() => outputDir));
    if (this.outputSessions.has(outputReal)) throw new Error("This outputDir already has an active Session in this process");
    await this.initializeRepository(outputReal);
    const lockPath = await this.acquireLock(outputReal, sessionId, Boolean(productionId));
    try {
      const statePath = path.join(outputReal, "state.json");
      let state;
      try {
        state = stateSchema.parse(await readJson(statePath));
        if (!productionId) throw new Error(`Production ${state.identity.productionId} exists; pass productionId to restore`);
        if (state.identity.productionId !== productionId) throw new Error(`Production identity mismatch: expected ${state.identity.productionId}`);
        if (JSON.stringify(state.pipeline) !== JSON.stringify(pipeline)) throw new Error("Pipeline identity does not match persisted state");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        if (productionId) throw new Error("Cannot restore: state.json does not exist");
        for (const ledger of ["decisions.jsonl", "tasks.jsonl"]) {
          const source = await readFile(path.join(outputReal, ledger), "utf8").catch((readError) => readError.code === "ENOENT" ? "" : Promise.reject(readError));
          if (source) throw new Error(`Cannot create over existing ${ledger}`);
        }
        const createdAt = now();
        state = {
          version: 1, stateRevision: 0,
          identity: { productionId: randomUUID(), title, createdAt }, pipeline,
          status: "active", currentStage: loadedPipeline.pipeline.stages[0].id,
          stages: Object.fromEntries(loadedPipeline.pipeline.stages.map((stage, index) => [stage.id, index ? "pending" : "active"])),
          executionGate: { state: "open" }, interaction: null, correction: null, updatedAt: createdAt
        };
        await atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
        for (const ledger of ["decisions.jsonl", "tasks.jsonl"]) {
          const target = path.join(outputReal, ledger);
          await writeFile(target, "", { flag: "wx" }).catch((writeError) => { if (writeError.code !== "EEXIST") throw writeError; });
        }
      }
      validateStateLifecycle(state, loadedPipeline.pipeline.stages);
      const record = { sessionId, outputDir: outputReal, lockPath, state, loadedPipeline, signal: { stage: state.currentStage, notice: "", focusPaths: [], updatedAt: now() }, listeners: new Set(), queue: Promise.resolve() };
      this.sessions.set(sessionId, record); this.outputSessions.set(outputReal, sessionId);
      await this.assertLedgers(record); await this.verifyHistory(record, false);
      return this.snapshot(record);
    } catch (error) {
      await rm(lockPath, { force: true }); throw error;
    }
  }

  async active({ outputDir, productionId, pipeline }) {
    if (!path.isAbsolute(outputDir)) return null;
    const outputReal = await realpath(outputDir).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
    const sessionId = outputReal && this.outputSessions.get(outputReal);
    if (!sessionId) return null;
    const record = this.record(sessionId);
    if (!productionId) throw new Error(`Production ${record.state.identity.productionId} exists; pass productionId to restore`);
    if (record.state.identity.productionId !== productionId) throw new Error(`Production identity mismatch: expected ${record.state.identity.productionId}`);
    if (JSON.stringify(record.state.pipeline) !== JSON.stringify(pipeline)) throw new Error("Pipeline identity does not match persisted state");
    return record;
  }

  record(sessionId) {
    const record = this.sessions.get(sessionId);
    if (!record) throw new Error(`Unknown session: ${sessionId}`);
    return record;
  }

  snapshot(record) {
    return { state: clone(record.state), pipeline: clone(record.loadedPipeline.pipeline), signal: clone(record.signal) };
  }

  async serialize(record, operation) {
    const run = record.queue.then(operation, operation);
    record.queue = run.catch(() => {});
    return run;
  }

  async head(record) { return git(record.outputDir, ["rev-parse", "HEAD"], { allowFailure: true }); }

  async verifyHistory(record, advance = true) {
    const head = await this.head(record);
    if (!head) return null;
    const ref = "refs/codex-video-production/last-seen";
    const anchor = await git(record.outputDir, ["rev-parse", "--verify", ref], { allowFailure: true });
    if (anchor && await git(record.outputDir, ["merge-base", "--is-ancestor", anchor, head], { allowFailure: true }) === null) throw new Error("git history is not a fast-forward from the Production anchor");
    if (advance && anchor !== head) await git(record.outputDir, ["update-ref", ref, head, ...(anchor ? [anchor] : [])]);
    return head;
  }

  async dirtyPaths(record) {
    const values = new Set();
    for (const args of [["diff", "--name-only"], ["diff", "--cached", "--name-only"], ["ls-files", "--others", "--exclude-standard"]]) {
      for (const value of (await git(record.outputDir, args, { allowFailure: true }) || "").split("\n").filter(Boolean)) values.add(value);
    }
    return values;
  }

  async assertHostClean(record, guidance = "") {
    await this.assertStateDisk(record);
    const dirty = [...await this.dirtyPaths(record)].filter((value) => !SYSTEM_PATHS.has(value));
    if (dirty.length) throw new Error(`Host-owned paths must be committed first: ${dirty.join(", ")}${guidance ? `. ${guidance}` : ""}`);
    await this.assertLedgers(record);
  }

  async assertStateDisk(record) {
    const disk = stateSchema.parse(await readJson(path.join(record.outputDir, "state.json")));
    if (JSON.stringify(disk) !== JSON.stringify(record.state)) throw new Error("state.json is Store-owned and does not match the active Session");
  }

  async ledgerAtHead(record, name) {
    const head = await this.head(record);
    if (!head) return "";
    return (await git(record.outputDir, ["show", `HEAD:${name}`], { allowFailure: true, trim: false })) ?? "";
  }

  async assertLedger(record, name) {
    const target = path.join(record.outputDir, name);
    const disk = await readFile(target, "utf8");
    const committed = await this.ledgerAtHead(record, name);
    if (!disk.startsWith(committed)) throw new Error(`${name} is not append-only relative to HEAD`);
    parseLedger(disk, name);
    return disk;
  }

  async assertLedgers(record) {
    const decisions = parseLedger(await this.assertLedger(record, "decisions.jsonl"), "decisions.jsonl");
    const taskEvents = parseLedger(await this.assertLedger(record, "tasks.jsonl"), "tasks.jsonl");
    projectTasks(taskEvents);
    return { decisions, taskEvents };
  }

  async appendLedger(record, name, value) {
    const source = await this.assertLedger(record, name);
    const sequence = parseLedger(source, name).length + 1;
    const stored = { sequence, ...value, createdAt: now() };
    const handle = await open(path.join(record.outputDir, name), "a");
    try { await handle.write(`${JSON.stringify(stored)}\n`); await handle.sync(); } finally { await handle.close(); }
    this.notify(record);
    return stored;
  }

  subscribe(record, listener) {
    record.listeners.add(listener);
    return () => record.listeners.delete(listener);
  }

  notify(record) {
    const event = { stateRevision: record.state.stateRevision, updatedAt: now() };
    for (const listener of record.listeners) try { listener(event); } catch {}
  }

  async writeState(record, next) {
    const parsed = stateSchema.parse(next);
    validateStateLifecycle(parsed, record.loadedPipeline.pipeline.stages);
    await atomicWrite(path.join(record.outputDir, "state.json"), `${JSON.stringify(parsed, null, 2)}\n`);
    record.state = parsed;
    this.notify(record);
    return clone(parsed);
  }

  async objectStamp(record, relativePath) {
    const safePath = safePathSchema.parse(relativePath);
    const commit = await this.head(record);
    if (!commit) throw new Error("Review targets require an initial git commit");
    const objectId = await git(record.outputDir, ["rev-parse", `${commit}:${safePath}`], { allowFailure: true });
    if (!objectId) throw new Error(`Review target is not committed at HEAD: ${safePath}`);
    return { path: safePath, commit, objectId };
  }

  async currentObject(record, relativePath) {
    const head = await this.head(record);
    return head ? git(record.outputDir, ["rev-parse", `${head}:${relativePath}`], { allowFailure: true }) : null;
  }

  async requestInteraction(record, interaction) {
    return this.serialize(record, async () => {
      if (record.state.interaction) throw new Error("Another Interaction is still active");
      if (record.state.status === "completed") throw new Error("Completed Production cannot request Interaction");
      await this.assertHostClean(record); await this.verifyHistory(record);
      if (record.state.currentStage !== interaction.stageId) throw new Error("Interaction Stage must be current");
      const targets = [];
      for (const targetPath of interaction.targetPaths ?? []) targets.push(await this.objectStamp(record, targetPath));
      if (interaction.kind === "task-control-request") {
        const tasks = await this.taskMap(record, false);
        if (!tasks.has(interaction.mediaTaskId)) throw new Error("Unknown Media Task");
      }
      const stored = {
        id: interaction.id || randomUUID(), stageId: interaction.stageId, kind: interaction.kind, title: interaction.title,
        ...(interaction.description ? { description: interaction.description } : {}), status: "waiting", targets,
        fields: clone(interaction.fields), options: clone(interaction.options),
        ...(interaction.mediaTaskId ? { mediaTaskId: interaction.mediaTaskId, allowedTaskActions: interaction.allowedTaskActions } : {}), createdAt: now()
      };
      const next = { ...record.state, stateRevision: record.state.stateRevision + 1, interaction: stored, updatedAt: now() };
      await this.writeState(record, next);
      return clone(stored);
    });
  }

  async respond(record, interactionId, input) {
    return this.serialize(record, async () => {
      await this.assertStateDisk(record);
      const interaction = record.state.interaction;
      if (!interaction || interaction.id !== interactionId || interaction.status !== "waiting") throw new Error("This Interaction is no longer waiting");
      const response = parseInteractionResponse(interaction, input);
      const nextInteraction = { ...interaction, status: "submitted", response, submittedAt: now() };
      await this.writeState(record, { ...record.state, stateRevision: record.state.stateRevision + 1, interaction: nextInteraction, updatedAt: now() });
      const key = `${record.sessionId}:${interactionId}`;
      for (const resolve of this.waiters.get(key) ?? []) resolve(clone(nextInteraction));
      this.waiters.delete(key);
      return clone(nextInteraction);
    });
  }

  wait(record, interactionId, timeoutMs) {
    const interaction = record.state.interaction;
    if (!interaction || interaction.id !== interactionId) throw new Error("This Interaction is no longer active");
    if (interaction.status === "submitted") return Promise.resolve(clone(interaction));
    const key = `${record.sessionId}:${interactionId}`;
    return new Promise((resolve) => {
      const listeners = this.waiters.get(key) ?? new Set();
      let timer;
      const listener = (value) => { clearTimeout(timer); resolve(value); };
      listeners.add(listener); this.waiters.set(key, listeners);
      timer = setTimeout(() => { listeners.delete(listener); if (!listeners.size) this.waiters.delete(key); resolve(null); }, timeoutMs);
    });
  }

  decisionOutcome(interaction) {
    const response = interaction.response;
    if (interaction.kind === "form") return "submitted";
    if (interaction.kind === "select") return "selected";
    if (interaction.kind === "comment") return "submitted";
    if (interaction.kind === "approve") return ({ approve: "approved", revise: "revision-requested", reject: "rejected" })[response.action];
    if (["target-review", "batch-review"].includes(interaction.kind)) return "reviewed";
    return ({ cancel: "cancel-requested", retry: "retry-requested", redo: "redo-requested" })[response.taskAction];
  }

  async appendDecision(record, interactionId) {
    return this.serialize(record, async () => {
      await this.assertStateDisk(record);
      const { decisions } = await this.assertLedgers(record);
      const existing = decisions.find((decision) => decision.interactionId === interactionId);
      if (existing) {
        if (record.state.interaction?.id === interactionId) await this.writeState(record, { ...record.state, stateRevision: record.state.stateRevision + 1, interaction: null, updatedAt: now() });
        return clone(existing);
      }
      const interaction = record.state.interaction;
      if (!interaction || interaction.id !== interactionId || interaction.status !== "submitted") throw new Error("Decision requires the current submitted Interaction");
      const decision = await this.appendLedger(record, "decisions.jsonl", {
        id: randomUUID(), type: "decision", stageId: interaction.stageId, interactionId: interaction.id,
        interactionKind: interaction.kind, outcome: this.decisionOutcome(interaction), result: clone(interaction.response), targets: clone(interaction.targets)
      });
      await this.writeState(record, { ...record.state, stateRevision: record.state.stateRevision + 1, interaction: null, updatedAt: now() });
      return clone(decision);
    });
  }

  async committedDecisions(record) { return parseLedger(await this.ledgerAtHead(record, "decisions.jsonl"), "decisions.jsonl"); }

  async targetCurrent(record, target) {
    const head = await this.head(record);
    if (!head || await git(record.outputDir, ["merge-base", "--is-ancestor", target.commit, head], { allowFailure: true }) === null) return false;
    return await this.currentObject(record, target.path) === target.objectId;
  }

  async decisionAtomicValid(record, decision) {
    for (const target of decision.targets) if (!await this.targetCurrent(record, target)) return false;
    return true;
  }

  async evidenceForPath(record, stageId, relativePath, { selectedPath } = {}) {
    for (const decision of await this.committedDecisions(record)) {
      if (decision.stageId !== stageId) continue;
      if (["target-review", "batch-review"].includes(decision.interactionKind)) {
        const target = decision.targets.find((candidate) => candidate.path === relativePath);
        const action = decision.result?.actions?.find((candidate) => candidate.path === relativePath);
        if (target && action && ["approve", "select"].includes(action.action) && (!selectedPath || action.selectedPath === selectedPath) && await this.targetCurrent(record, target)) return decision;
      } else if (decision.interactionKind === "approve" && decision.outcome === "approved" && decision.targets.some((target) => target.path === relativePath) && await this.decisionAtomicValid(record, decision)) return decision;
    }
    return null;
  }

  async stageReviewValid(record, stage) {
    if (!stage.review.required) return true;
    for (const decision of await this.committedDecisions(record)) {
      if (decision.stageId !== stage.id) continue;
      if (stage.review.kind === "form" && decision.interactionKind === "form" && decision.outcome === "submitted" && await this.decisionAtomicValid(record, decision)) return true;
      if (stage.review.kind === "select" && decision.interactionKind === "select" && decision.outcome === "selected" && decision.result?.selection && await this.decisionAtomicValid(record, decision)) return true;
      if (stage.review.kind === "comment" && decision.interactionKind === "comment" && decision.result?.comment?.trim() && await this.decisionAtomicValid(record, decision)) return true;
      if (stage.review.kind === "approve" && decision.interactionKind === "approve" && decision.outcome === "approved" && await this.decisionAtomicValid(record, decision)) return true;
    }
    return false;
  }

  async filesAtHead(record) {
    const head = await this.head(record);
    return head ? (await git(record.outputDir, ["ls-tree", "-r", "--name-only", head])).split("\n").filter(Boolean) : [];
  }

  async readHead(record, relativePath) {
    const head = await this.head(record);
    const source = head && await git(record.outputDir, ["show", `${head}:${safePathSchema.parse(relativePath)}`], { allowFailure: true });
    if (source === null || source === undefined) throw new Error(`Required committed file is missing: ${relativePath}`);
    return source;
  }

  async readHeadJson(record, relativePath) { return JSON.parse(await this.readHead(record, relativePath)); }

  async unitIds(record) {
    const structure = await this.readHeadJson(record, "structure.json");
    const ids = structure.units?.map((unit) => unit.id);
    if (!ids?.length || new Set(ids).size !== ids.length || ids.some((id) => !/^[a-zA-Z0-9_-]+$/.test(id))) throw new Error("structure.json requires unique safe Unit IDs");
    return ids;
  }

  async taskMap(record, committed) {
    const source = committed ? await this.ledgerAtHead(record, "tasks.jsonl") : await this.assertLedger(record, "tasks.jsonl");
    return projectTasks(parseLedger(source, "tasks.jsonl"));
  }

  successfulTaskFor(tasks, targetPath, operation) {
    return [...tasks.values()].find((task) => task.targetPath === targetPath && (!operation || task.operation === operation) && task.attempts.some((attempt) => attempt.status === "succeeded") && !task.artifactUnrecoverable);
  }

  async taskInputsCurrent(record, task) {
    if (await this.currentObject(record, task.requestRef) !== task.requestObjectId) return false;
    return (await Promise.all((task.dependencies ?? []).map((target) => this.targetCurrent(record, target)))).every(Boolean);
  }

  async selectedCandidate(record, directory, canonicalPath) {
    const files = (await this.filesAtHead(record)).filter((file) => file.startsWith(`${directory}/`));
    const canonicalObject = await this.currentObject(record, canonicalPath);
    for (const file of files) if (await this.currentObject(record, file) === canonicalObject) return file;
    return null;
  }

  async assertStageCheckpoint(record, stageId) {
    await this.assertHostClean(record); await this.verifyHistory(record);
    const stage = record.loadedPipeline.pipeline.stages.find((candidate) => candidate.id === stageId);
    if (!stage) throw new Error(`Unknown Stage: ${stageId}`);
    const files = await this.filesAtHead(record);
    for (const pattern of stage.produces) if (!files.some((file) => patternRegex(pattern).test(file))) throw new Error(`Stage ${stageId} is missing committed output ${pattern}`);
    if (!await this.stageReviewValid(record, stage) && !["storyboard-production", "video-prompt-plan", "unit-video-production"].includes(stageId)) throw new Error(`Stage ${stageId} lacks current Review evidence`);

    if (stageId === "proposal") {
      const index = await this.readHeadJson(record, "proposals/index.json");
      const proposals = Array.isArray(index) ? index : index.proposals ?? index.entries;
      if (![3, 4].includes(proposals?.length) || new Set(proposals.map((item) => item.id)).size !== proposals.length) throw new Error("Proposal index requires 3-4 unique proposals");
      const selected = await this.readHeadJson(record, "proposals/selected.json");
      const proposal = proposals.find((item) => item.id === selected.proposalId);
      const revision = record.loadedPipeline.pipeline.revision;
      const tasks = await this.taskMap(record, true);
      let requiredTargets;
      if (revision >= 4) {
        if (!proposal || selected.proposalPath !== proposal.path || selected.conceptRequestPath !== proposal.conceptRequestPath || selected.conceptStoryboardPath !== proposal.conceptStoryboardPath) throw new Error("Selected Proposal must reference its current text and Concept Storyboard files");
        requiredTargets = new Set(["proposals/index.json"]);
        for (const item of proposals) {
          if (![item.path, item.conceptRequestPath, item.conceptStoryboardPath].every((relativePath) => typeof relativePath === "string" && files.includes(relativePath))) throw new Error(`Proposal ${item.id} is missing its complete image-plus-text alternative`);
          const task = this.successfulTaskFor(tasks, item.conceptStoryboardPath, "image-generation");
          if (!task || task.requestRef !== item.conceptRequestPath || !task.dependencies?.some((target) => target.path === item.path) || !await this.taskInputsCurrent(record, task)) throw new Error(`Proposal ${item.id} Concept Storyboard lacks current Task provenance`);
          requiredTargets.add(item.path); requiredTargets.add(item.conceptRequestPath); requiredTargets.add(item.conceptStoryboardPath);
        }
      } else {
        if (!proposal || selected.proposalPath !== proposal.path || selected.conceptStoryboardPath !== "proposals/concept-storyboard.png") throw new Error("Selected Proposal must reference the current text Proposal and Concept Storyboard");
        const task = this.successfulTaskFor(tasks, selected.conceptStoryboardPath, "image-generation");
        if (!task || !task.dependencies?.some((target) => target.path === proposal.path) || !await this.taskInputsCurrent(record, task)) throw new Error("Concept Storyboard lacks a successful Task derived from the current selected Proposal");
        requiredTargets = new Set(["proposals/index.json", ...proposals.map((item) => item.path), "proposals/concept-storyboard-request.json", selected.conceptStoryboardPath]);
      }
      let valid = false;
      for (const decision of await this.committedDecisions(record)) {
        const reviewed = new Set(decision.targets?.map((target) => target.path));
        if (decision.id === selected.decisionId && decision.stageId === stageId && decision.interactionKind === "select" && decision.result?.selection === selected.proposalId && [...requiredTargets].every((target) => reviewed.has(target)) && await this.decisionAtomicValid(record, decision)) {
          valid = true;
          break;
        }
      }
      if (!valid) throw new Error("Proposal selection lacks current Decision evidence");
    }
    if (stageId === "video-structure") await this.unitIds(record);
    if (["storyboard-plan", "storyboard-production", "video-prompt-plan", "unit-video-production"].includes(stageId)) {
      const units = await this.unitIds(record);
      for (const unitId of units) {
        if (stageId === "storyboard-plan" && !files.includes(`units/${unitId}/storyboard-plan.json`)) throw new Error(`Missing Storyboard Plan for ${unitId}`);
        if (stageId === "video-prompt-plan") {
          const planPath = `units/${unitId}/plan.json`;
          if (!files.includes(planPath) || !await this.evidenceForPath(record, stageId, planPath)) throw new Error(`Clip Plan ${unitId} lacks current approval`);
        }
        if (stageId === "storyboard-production") {
          if (!files.includes("continuity/index.json")) throw new Error("Storyboard Production requires continuity/index.json");
          const planPath = `units/${unitId}/storyboard-plan.json`;
          if (!files.includes(planPath)) throw new Error(`Missing Storyboard Plan for ${unitId}`);
          const plan = await this.readHeadJson(record, planPath);
          const referencePaths = Array.isArray(plan.referencePaths) ? plan.referencePaths : [];
          const productPaths = productReferencePaths(await this.readHeadJson(record, "assets/index.json"));
          if (record.loadedPipeline.pipeline.revision >= 4 && productPaths.length && !productPaths.some((productPath) => referencePaths.includes(productPath))) throw new Error(`Storyboard Plan ${unitId} must include a supplied product reference image`);
          const canonical = `units/${unitId}/storyboard.png`;
          const directory = `units/${unitId}/storyboard-candidates`;
          const selected = files.includes(canonical) && await this.selectedCandidate(record, directory, canonical);
          const evidence = record.loadedPipeline.pipeline.revision >= 4
            ? await this.evidenceForPath(record, stageId, canonical)
            : await this.evidenceForPath(record, stageId, directory, { selectedPath: selected });
          if (!selected || !evidence) throw new Error(`Storyboard ${unitId} lacks current approval`);
          const tasks = await this.taskMap(record, true);
          const storyboardTask = this.successfulTaskFor(tasks, selected, "image-generation");
          if (storyboardTask && record.loadedPipeline.pipeline.revision >= 4 && (storyboardTask.requestRef !== planPath || !referencePaths.every((referencePath) => storyboardTask.dependencies?.some((dependency) => dependency.path === referencePath)) || !await this.taskInputsCurrent(record, storyboardTask))) throw new Error(`Storyboard ${unitId} Task must use the current Plan and its reference materials`);
          if (!storyboardTask) {
            const assets = await this.readHeadJson(record, "assets/index.json");
            const imported = await Promise.all((assets ?? []).map(async (asset) => {
              const sourcePath = asset.source?.path || asset.source?.localPath;
              return sourcePath && files.includes(sourcePath) && await this.currentObject(record, sourcePath) === await this.currentObject(record, canonical);
            }));
            if (!imported.some(Boolean)) throw new Error(`Storyboard ${unitId} has no successful Task or imported source`);
          }
        }
        if (stageId === "unit-video-production") {
          if (!files.includes(`units/${unitId}/plan.json`)) throw new Error(`Missing Clip Plan for ${unitId}`);
          const canonical = `units/${unitId}/clip.mp4`;
          const directory = `units/${unitId}/clip-candidates`;
          const selected = files.includes(canonical) && await this.selectedCandidate(record, directory, canonical);
          const evidence = record.loadedPipeline.pipeline.revision >= 4
            ? await this.evidenceForPath(record, stageId, canonical)
            : await this.evidenceForPath(record, stageId, directory, { selectedPath: selected });
          if (!selected || !evidence) throw new Error(`Clip ${unitId} lacks current approval`);
          if (!this.successfulTaskFor(await this.taskMap(record, true), selected, "video-generation")) throw new Error(`Clip ${unitId} lacks a successful video Task`);
        }
      }
    }
    if (stageId === "assembly") await this.assertAssembly(record);
  }

  async assertAssembly(record) {
    const files = await this.filesAtHead(record);
    for (const file of ["final/assembly.json", "final/probe.json", "final/tvc.mp4"]) if (!files.includes(file)) throw new Error(`Missing final output ${file}`);
    const assembly = await this.readHeadJson(record, "final/assembly.json");
    const probe = await this.readHeadJson(record, "final/probe.json");
    const brief = await this.readHead(record, "brief.md");
    const durationMatch = /^totalDurationMs:\s*(\d+)$/m.exec(brief);
    const ratioMatch = /^aspectRatio:\s*["']?([^\n"']+)/m.exec(brief);
    if (!durationMatch || Number(durationMatch[1]) !== assembly.durationMs) throw new Error("Assembly duration must equal Brief duration");
    const tolerance = Math.min(100, 1000 / Math.max(1, Number(probe.frameRate || 25)));
    if (Math.abs(Number(probe.durationMs) - assembly.durationMs) > tolerance) throw new Error("Final probe duration is outside tolerance");
    if (ratioMatch && assembly.ratio !== ratioMatch[1].trim()) throw new Error("Assembly ratio must equal Brief ratio");
    const tasks = await this.taskMap(record, true);
    if (!this.successfulTaskFor(tasks, "final/tvc.mp4", "assembly")) throw new Error("Final film lacks a successful Assembly Task");
    const decisions = await this.committedDecisions(record);
    const approved = await Promise.all(decisions.filter((decision) => decision.stageId === "assembly" && decision.interactionKind === "approve" && decision.outcome === "approved").map((decision) => this.decisionAtomicValid(record, decision)));
    if (!approved.some(Boolean)) throw new Error("Final film lacks current approval");
  }

  async updateState(record, { expectedStateRevision, actions }) {
    return this.serialize(record, async () => {
      await this.assertStateDisk(record);
      if (expectedStateRevision !== record.state.stateRevision) throw new Error(`Stale state revision: expected ${record.state.stateRevision}`);
      if (!Array.isArray(actions) || !actions.length) throw new Error("update_state requires actions");
      const next = clone(record.state);
      for (const action of actions) {
        if (action.type === "complete-stage") {
          if (next.currentStage !== action.stageId || next.stages[action.stageId] !== "active") throw new Error("Only the current active Stage can complete");
          await this.assertStageCheckpoint(record, action.stageId); next.stages[action.stageId] = "complete";
        } else if (action.type === "activate-stage") {
          const stages = record.loadedPipeline.pipeline.stages.map((stage) => stage.id);
          const index = stages.indexOf(action.stageId);
          if (index < 0 || next.stages[action.stageId] !== "pending" || stages.slice(0, index).some((id) => next.stages[id] !== "complete")) throw new Error("Activated Stage must be the next pending Stage after a complete prefix");
          next.stages[action.stageId] = "active"; next.currentStage = action.stageId;
        } else if (action.type === "pause-gate") {
          if (next.status !== "active" || next.executionGate.state !== "open" || action.stageId !== next.currentStage) throw new Error("Gate can pause only the current active Stage");
          next.status = "paused"; next.executionGate = { state: "paused", atStageId: action.stageId, reasonCode: action.reasonCode, ...(action.requiredCapability ? { requiredCapability: action.requiredCapability } : {}), pausedAt: now() };
        } else if (action.type === "resume-gate") {
          if (next.status !== "paused" || next.executionGate.state !== "paused" || !action.evidence?.trim()) throw new Error("Resume requires a paused gate and evidence");
          next.status = "active"; next.executionGate = { state: "open" };
        } else if (action.type === "reopen-from-stage") {
          const ids = record.loadedPipeline.pipeline.stages.map((stage) => stage.id);
          const index = ids.indexOf(action.stageId);
          if (index < 0 || !action.evidence?.trim()) throw new Error("Correction requires a declared Stage and evidence");
          if (action.decisionId) {
            const decision = (await this.committedDecisions(record)).find((candidate) => candidate.id === action.decisionId);
            if (!decision || !["revision-requested", "rejected", "reviewed", "redo-requested"].includes(decision.outcome)) throw new Error("Correction Decision must be committed and request change");
          }
          ids.forEach((id, position) => { next.stages[id] = position < index ? "complete" : position === index ? "active" : "pending"; });
          next.status = "active"; next.executionGate = { state: "open" }; next.currentStage = action.stageId;
          next.correction = { stageId: action.stageId, evidence: action.decisionId || action.evidence.trim(), openedAt: now() };
        } else throw new Error(`Unknown state action: ${action.type}`);
      }
      next.stateRevision += 1; next.updatedAt = now();
      const saved = await this.writeState(record, next);
      record.signal = { ...record.signal, stage: saved.currentStage, updatedAt: now() };
      return saved;
    });
  }

  async appendTaskEvent(record, input) {
    return this.serialize(record, async () => {
      if (record.state.status === "completed" || record.state.executionGate.state !== "open") throw new Error("Media Task changes require an open active Production");
      const guidance = input.type === "task-created"
        ? "Commit requestRef and dependency files before creating the Task"
        : input.type === "attempt-transition" && input.status === "succeeded"
          ? "Record Provider success before downloading or writing the artifact"
          : "Commit Host-owned work before appending the Task event";
      await this.assertHostClean(record, guidance); await this.verifyHistory(record);
      const taskEvents = parseLedger(await this.assertLedger(record, "tasks.jsonl"), "tasks.jsonl");
      const tasks = projectTasks(taskEvents);
      let event;
      if (input.type === "task-created") {
        const requestRef = safePathSchema.parse(input.requestRef);
        const requestStamp = await this.objectStamp(record, requestRef);
        safePathSchema.parse(input.targetPath);
        const operationStages = {
          "image-generation": ["proposal", "storyboard-production"],
          "video-generation": ["unit-video-production"],
          "tail-frame": ["unit-video-production"],
          assembly: ["assembly"],
          "media-probe": ["assembly"]
        }[input.operation];
        if (!operationStages?.includes(record.state.currentStage)) throw new Error(`${input.operation} is not allowed in the current Stage`);
        const dependencies = await Promise.all((input.dependencyPaths ?? []).map((relativePath) => this.objectStamp(record, relativePath)));
        if (input.operation === "image-generation" && record.state.currentStage === "storyboard-production" && record.loadedPipeline.pipeline.revision >= 4) {
          const match = /^units\/([a-zA-Z0-9_-]+)\/storyboard-plan\.json$/.exec(requestRef);
          if (!match) throw new Error("Storyboard image-generation requestRef must be a Unit Storyboard Plan");
          const plan = await this.readHeadJson(record, requestRef);
          const referencePaths = Array.isArray(plan.referencePaths) ? plan.referencePaths : [];
          if (!referencePaths.every((referencePath) => dependencies.some((dependency) => dependency.path === referencePath))) throw new Error("Storyboard image-generation must stamp every Plan reference as a dependency");
          const productPaths = productReferencePaths(await this.readHeadJson(record, "assets/index.json"));
          if (productPaths.length && !productPaths.some((productPath) => referencePaths.includes(productPath))) throw new Error("Storyboard image-generation requires a supplied product reference image");
        }
        if (input.operation === "video-generation" && record.loadedPipeline.pipeline.revision >= 3) {
          const match = /^units\/([a-zA-Z0-9_-]+)\/plan\.json$/.exec(requestRef);
          if (!match) throw new Error("video-generation requestRef must be a Unit Clip Plan");
          const canonical = `units/${match[1]}/storyboard.png`;
          if (!dependencies.some((target) => target.path === canonical)) throw new Error("video-generation requires the current Storyboard as a dependency");
          const directory = `units/${match[1]}/storyboard-candidates`;
          const selected = await this.selectedCandidate(record, directory, canonical);
          const evidence = record.loadedPipeline.pipeline.revision >= 4
            ? await this.evidenceForPath(record, "storyboard-production", canonical)
            : await this.evidenceForPath(record, "storyboard-production", directory, { selectedPath: selected });
          if (!selected || !evidence) throw new Error("video-generation requires current approved Storyboard evidence");
        } else if (input.operation === "video-generation" && !await this.evidenceForPath(record, "video-prompt-plan", requestRef)) {
          throw new Error("video-generation requires current approved Clip Plan evidence");
        }
        const taskId = randomUUID();
        const attempt = { id: randomUUID(), number: 1, status: "submitting", clientRequestId: randomUUID(), retryOfAttemptId: null, createdAt: now(), updatedAt: now() };
        event = { type: "task-created", task: { id: taskId, operation: input.operation, targetPath: input.targetPath, provider: input.provider, requestRef, requestObjectId: requestStamp.objectId, dependencies, requestSnapshot: clone(input.requestSnapshot), requestHash: digest(input.requestSnapshot), redoOfTaskId: input.redoOfTaskId || null }, attempt };
      } else if (input.type === "attempt-transition") {
        event = { type: "attempt-transition", taskId: input.taskId, attemptId: input.attemptId, status: input.status,
          ...(input.providerSubmitId ? { providerSubmitId: input.providerSubmitId, submittedAt: input.submittedAt || now() } : {}),
          ...(input.result ? { result: clone(input.result) } : {}), ...(input.error ? { error: clone(input.error) } : {}),
          ...(input.cancellation ? { cancellation: clone(input.cancellation) } : {}), ...(input.reconciliation ? { reconciliation: clone(input.reconciliation) } : {}) };
      } else if (input.type === "attempt-created") {
        const task = tasks.get(input.taskId);
        if (!task) throw new Error("Unknown Task");
        const current = task.attempts.find((attempt) => attempt.id === task.currentAttemptId);
        event = { type: "attempt-created", taskId: task.id, attempt: { id: randomUUID(), number: current.number + 1, status: "submitting", clientRequestId: randomUUID(), retryOfAttemptId: current.id, createdAt: now(), updatedAt: now() } };
      } else if (input.type === "artifact-unrecoverable") {
        event = { type: "artifact-unrecoverable", taskId: input.taskId, attemptId: input.attemptId, reason: input.reason };
      } else throw new Error(`Unknown Task event type: ${input.type}`);
      const trial = { sequence: taskEvents.length + 1, ...event, createdAt: now() };
      applyTaskEvent(tasks, trial);
      return clone(await this.appendLedger(record, "tasks.jsonl", event));
    });
  }

  async complete(record, expectedStateRevision) {
    return this.serialize(record, async () => {
      if (record.state.stateRevision !== expectedStateRevision) throw new Error(`Stale state revision: expected ${record.state.stateRevision}`);
      if (record.state.interaction) throw new Error("Complete requires no pending Interaction");
      const stages = record.loadedPipeline.pipeline.stages;
      const final = stages.at(-1);
      if (record.state.currentStage !== final.id || record.state.stages[final.id] !== "active" || stages.slice(0, -1).some((stage) => record.state.stages[stage.id] !== "complete")) throw new Error("Complete requires the final active Stage and complete prefix");
      await this.assertStageCheckpoint(record, final.id);
      const tasks = await this.taskMap(record, false);
      if ([...tasks.values()].some((task) => task.attempts.some((attempt) => !ATTEMPT_TERMINAL.has(attempt.status)))) throw new Error("Complete requires no non-terminal Media Attempts");
      const next = clone(record.state); next.stages[final.id] = "complete"; next.status = "completed"; next.executionGate = { state: "open" }; next.stateRevision += 1; next.updatedAt = now();
      return this.writeState(record, next);
    });
  }

  publish(record, { stage, notice = "", focusPaths = [] }) {
    if (stage !== record.state.currentStage) throw new Error("Publish Stage must be current");
    record.signal = { stage, notice, focusPaths: focusPaths.map((value) => safePathSchema.parse(value)), updatedAt: now() };
    this.notify(record);
    return clone(record.signal);
  }

  async get(record, scope = { kind: "summary" }) {
    if (scope.kind === "summary") return this.snapshot(record);
    if (scope.kind === "state") return { state: clone(record.state) };
    if (scope.kind === "decision") {
      const decision = (await this.assertLedgers(record)).decisions.find((candidate) => candidate.id === scope.id);
      if (!decision) throw new Error("Unknown Decision"); return { decision: clone(decision) };
    }
    if (scope.kind === "task") {
      const task = (await this.taskMap(record, false)).get(scope.id);
      if (!task) throw new Error("Unknown Task"); return { task: clone(task) };
    }
    if (scope.kind === "tail") {
      const values = scope.ledger === "decisions" ? (await this.assertLedgers(record)).decisions : (await this.assertLedgers(record)).taskEvents;
      return { ledger: scope.ledger, records: clone(values.slice(-Math.min(scope.limit || 20, 100))) };
    }
    throw new Error("Unknown get scope");
  }

  async closeSession(record) {
    this.sessions.delete(record.sessionId); this.outputSessions.delete(record.outputDir);
    const lock = await readJson(record.lockPath).catch(() => null);
    if (lock?.sessionId === record.sessionId) await rm(record.lockPath, { force: true });
  }

  async close() { for (const record of [...this.sessions.values()]) await this.closeSession(record); }
}
