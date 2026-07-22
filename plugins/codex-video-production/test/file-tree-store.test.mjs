import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { PreviewController, TVC_PIPELINE } from "../src/preview-controller.mjs";

const exec = promisify(execFile);
async function git(cwd, ...args) { return (await exec("git", args, { cwd })).stdout.trim(); }
async function commit(cwd, message) { await git(cwd, "add", "-A"); await git(cwd, "commit", "-m", message, "--quiet"); return git(cwd, "rev-parse", "HEAD"); }
async function fixture(pipeline = TVC_PIPELINE) {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "file-production-"));
  const controller = new PreviewController({ preferredPort: 6100 + Math.floor(Math.random() * 500) });
  const started = await controller.start({ title: "测试 TVC", outputDir, pipeline });
  return { outputDir, controller, started, record: controller.store.record(started.sessionId) };
}

async function readEvent(reader, name) {
  const decoder = new TextDecoder();
  let source = "";
  while (!source.includes(`event: ${name}\n`)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`SSE ended before ${name}`);
    source += decoder.decode(value, { stream: true });
  }
  return source;
}

test("an active Production resumes idempotently after its installed Skill path disappears", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "preview-skill-"));
  const copiedSkill = path.join(tempRoot, "video-production");
  await cp(path.resolve("skills/video-production"), copiedSkill, { recursive: true });
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "active-production-"));
  const controller = new PreviewController({ preferredPort: 6100 + Math.floor(Math.random() * 500), skillRoot: copiedSkill });
  t.after(() => controller.close());
  const started = await controller.start({ title: "缓存恢复测试", outputDir });
  await rm(copiedSkill, { recursive: true });
  const restored = await controller.start({ title: "缓存恢复测试", outputDir, productionId: started.productionId });
  assert.equal(restored.sessionId, started.sessionId);
  assert.equal(restored.restored, true);
  assert.equal(restored.state.identity.productionId, started.productionId);
});

test("SSE immediately notifies Preview after a Store signal", async (t) => {
  const { controller, started } = await fixture();
  t.after(() => controller.close());
  const abort = new AbortController();
  t.after(() => abort.abort());
  const response = await fetch(`${new URL(started.url).origin}/api/sessions/${started.sessionId}/events`, { signal: abort.signal });
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const reader = response.body.getReader();
  await readEvent(reader, "ready");
  controller.publish({ sessionId: started.sessionId, stage: "clarification", notice: "即时刷新" });
  const changed = await Promise.race([readEvent(reader, "changed"), new Promise((_, reject) => setTimeout(() => reject(new Error("SSE notification timed out")), 1_000))]);
  assert.match(changed, /stateRevision/);
});

test("revision 2 Production keeps its approved Plan authorization contract", async (t) => {
  const legacy = { id: "tvc", version: 1, revision: 2, manifestRef: "pipelines/tvc/revisions/2/pipeline.yaml" };
  const { outputDir, controller, started, record } = await fixture(legacy);
  t.after(() => controller.close());
  await mkdir(path.join(outputDir, "units/u1"), { recursive: true });
  await writeFile(path.join(outputDir, "units/u1/plan.json"), '{"unitId":"u1","prompt":"legacy"}\n');
  const planCommit = await commit(outputDir, "legacy plan");
  const objectId = await git(outputDir, "rev-parse", `${planCommit}:units/u1/plan.json`);
  await writeFile(path.join(outputDir, "decisions.jsonl"), `${JSON.stringify({ sequence: 1, id: "legacy-plan-approval", type: "decision", stageId: "video-prompt-plan", interactionId: "i1", interactionKind: "approve", outcome: "approved", result: { action: "approve" }, targets: [{ path: "units/u1/plan.json", commit: planCommit, objectId }], createdAt: new Date().toISOString() })}\n`);
  const ids = record.loadedPipeline.pipeline.stages.map((stage) => stage.id); const at = ids.indexOf("unit-video-production");
  await controller.store.writeState(record, { ...record.state, currentStage: "unit-video-production", stages: Object.fromEntries(ids.map((id, index) => [id, index < at ? "complete" : index === at ? "active" : "pending"])), stateRevision: record.state.stateRevision + 1, updatedAt: new Date().toISOString() });
  await commit(outputDir, "enter legacy video production");
  const event = await controller.appendTaskEvent({ sessionId: started.sessionId, event: { type: "task-created", operation: "video-generation", targetPath: "units/u1/clip-candidates/a.mp4", provider: "lovart", requestRef: "units/u1/plan.json", requestSnapshot: { prompt: "legacy" } } });
  assert.equal(event.type, "task-created");
});

test("form result survives first, Decision is Store-derived, committed evidence completes Stage", async (t) => {
  const { outputDir, controller, started, record } = await fixture();
  t.after(() => controller.close());
  await mkdir(path.join(outputDir, "assets"));
  await writeFile(path.join(outputDir, "request.md"), "30 秒产品广告\n");
  await writeFile(path.join(outputDir, "assets/product.png"), Buffer.from([137, 80, 78, 71]));
  await writeFile(path.join(outputDir, "assets/index.json"), '[{"id":"product","source":{"path":"assets/product.png"}}]\n');
  await writeFile(path.join(outputDir, "clarification.json"), '{"questions":[{"id":"ratio"}]}\n');
  await writeFile(path.join(outputDir, "brief.md"), "---\ntotalDurationMs: 30000\naspectRatio: 16:9\n---\n已确认\n");
  await commit(outputDir, "initialize clarification");
  const requested = await controller.requestInteraction({ sessionId: started.sessionId, interaction: {
    stageId: "clarification", kind: "form", title: "确认画幅", targetPaths: ["clarification.json"],
    fields: [{ id: "ratio", label: "画幅", type: "select", options: [{ id: "16:9", label: "横屏" }] }]
  }});
  const base = new URL(started.url).origin;
  const view = await fetch(`${base}/api/sessions/${started.sessionId}/views/clarification`).then((response) => response.json());
  assert.ok(view.files.some((file) => file.path === "assets/product.png" && file.kind === "image"));
  const media = await fetch(`${base}${view.files.find((file) => file.path === "assets/product.png").url}`);
  assert.equal(media.status, 200);
  assert.equal((await media.arrayBuffer()).byteLength, 4);
  await controller.store.respond(record, requested.interactionId, { answers: { ratio: "16:9" } });
  const persistedBeforeDecision = JSON.parse(await readFile(path.join(outputDir, "state.json"), "utf8"));
  assert.equal(persistedBeforeDecision.interaction.response.answers.ratio, "16:9");
  const decision = await controller.appendDecision({ sessionId: started.sessionId, interactionId: requested.interactionId });
  assert.equal(decision.outcome, "submitted");
  assert.equal(decision.result.answers.ratio, "16:9");
  await commit(outputDir, `decision ${decision.id}`);
  const state = await controller.updateState({ sessionId: started.sessionId, expectedStateRevision: record.state.stateRevision, actions: [{ type: "complete-stage", stageId: "clarification" }, { type: "activate-stage", stageId: "research" }] });
  assert.equal(state.stages.clarification, "complete");
  assert.equal(state.currentStage, "research");
});

test("revision 4 Storyboard Task requires the supplied product reference", async (t) => {
  const { outputDir, controller, started, record } = await fixture();
  t.after(() => controller.close());
  await mkdir(path.join(outputDir, "assets"), { recursive: true });
  await mkdir(path.join(outputDir, "proposals"), { recursive: true });
  await mkdir(path.join(outputDir, "units/u1/storyboard-candidates"), { recursive: true });
  await writeFile(path.join(outputDir, "assets/product.png"), "product reference\n");
  await writeFile(path.join(outputDir, "assets/index.json"), '[{"id":"product","kind":"image","role":"product-reference","source":{"type":"file","path":"assets/product.png"}}]\n');
  await writeFile(path.join(outputDir, "proposals/concept.png"), "concept reference\n");
  await writeFile(path.join(outputDir, "units/u1/storyboard-plan.json"), '{"unitId":"u1","prompt":"draw","referencePaths":["assets/product.png","proposals/concept.png"]}\n');
  const ids = record.loadedPipeline.pipeline.stages.map((stage) => stage.id); const at = ids.indexOf("storyboard-production");
  await controller.store.writeState(record, { ...record.state, currentStage: "storyboard-production", stages: Object.fromEntries(ids.map((id, index) => [id, index < at ? "complete" : index === at ? "active" : "pending"])), stateRevision: record.state.stateRevision + 1, updatedAt: new Date().toISOString() });
  await commit(outputDir, "enter storyboard production with product reference");
  const event = { type: "task-created", operation: "image-generation", targetPath: "units/u1/storyboard-candidates/a.png", provider: "lovart", requestRef: "units/u1/storyboard-plan.json", requestSnapshot: { prompt: "draw" } };
  await assert.rejects(controller.appendTaskEvent({ sessionId: started.sessionId, event: { ...event, dependencyPaths: ["proposals/concept.png"] } }), /stamp every Plan reference/);
  const created = await controller.appendTaskEvent({ sessionId: started.sessionId, event: { ...event, dependencyPaths: ["assets/product.png", "proposals/concept.png"] } });
  assert.equal(created.type, "task-created");
});

test("paid video Task requires the current approved Storyboard and keeps Plan internal", async (t) => {
  const { outputDir, controller, started, record } = await fixture();
  t.after(() => controller.close());
  await mkdir(path.join(outputDir, "units/u1/storyboard-candidates"), { recursive: true });
  await writeFile(path.join(outputDir, "units/u1/plan.json"), '{"unitId":"u1","prompt":"approved"}\n');
  await writeFile(path.join(outputDir, "units/u1/storyboard-candidates/a.png"), "approved storyboard\n");
  await writeFile(path.join(outputDir, "units/u1/storyboard.png"), "approved storyboard\n");
  await writeFile(path.join(outputDir, "structure.json"), '{"units":[{"id":"u1"}]}\n');
  const storyboardCommit = await commit(outputDir, "storyboard and internal plan");
  const objectId = await git(outputDir, "rev-parse", `${storyboardCommit}:units/u1/storyboard.png`);
  await writeFile(path.join(outputDir, "decisions.jsonl"), `${JSON.stringify({ sequence: 1, id: "storyboard-approval", type: "decision", stageId: "storyboard-production", interactionId: "i1", interactionKind: "batch-review", outcome: "reviewed", result: { actions: [{ path: "units/u1/storyboard.png", action: "approve" }] }, targets: [{ path: "units/u1/storyboard.png", commit: storyboardCommit, objectId }], createdAt: new Date().toISOString() })}\n`);
  const ids = record.loadedPipeline.pipeline.stages.map((stage) => stage.id);
  const at = ids.indexOf("unit-video-production");
  await controller.store.writeState(record, { ...record.state, currentStage: "unit-video-production", stages: Object.fromEntries(ids.map((id, index) => [id, index < at ? "complete" : index === at ? "active" : "pending"])), stateRevision: record.state.stateRevision + 1, updatedAt: new Date().toISOString() });
  await commit(outputDir, "approve plan and enter video production");
  const event = await controller.appendTaskEvent({ sessionId: started.sessionId, event: { type: "task-created", operation: "video-generation", targetPath: "units/u1/clip-candidates/a.mp4", provider: "lovart", requestRef: "units/u1/plan.json", dependencyPaths: ["units/u1/storyboard.png"], requestSnapshot: { prompt: "approved" } } });
  assert.equal(event.type, "task-created");
  await writeFile(path.join(outputDir, "units/u1/plan.json"), '{"unitId":"u1","prompt":"changed"}\n');
  await commit(outputDir, "change plan");
  const changedPlan = await controller.appendTaskEvent({ sessionId: started.sessionId, event: { type: "task-created", operation: "video-generation", targetPath: "units/u1/clip-candidates/b.mp4", provider: "lovart", requestRef: "units/u1/plan.json", dependencyPaths: ["units/u1/storyboard.png"], requestSnapshot: { prompt: "changed" } } });
  assert.equal(changedPlan.type, "task-created");
  await assert.rejects(controller.appendTaskEvent({ sessionId: started.sessionId, event: { type: "task-created", operation: "video-generation", targetPath: "units/u1/clip-candidates/c.mp4", provider: "lovart", requestRef: "units/u1/plan.json", requestSnapshot: { prompt: "changed" } } }), /Storyboard as a dependency/);
  await writeFile(path.join(outputDir, "units/u1/storyboard.png"), "unapproved storyboard\n");
  await commit(outputDir, "replace storyboard without review");
  await assert.rejects(controller.appendTaskEvent({ sessionId: started.sessionId, event: { type: "task-created", operation: "video-generation", targetPath: "units/u1/clip-candidates/d.mp4", provider: "lovart", requestRef: "units/u1/plan.json", dependencyPaths: ["units/u1/storyboard.png"], requestSnapshot: { prompt: "changed" } } }), /approved Storyboard evidence/);
});

test("revision 3 recovery retains candidate-directory Storyboard authorization", async (t) => {
  const legacy = { id: "tvc", version: 1, revision: 3, manifestRef: "pipelines/tvc/revisions/3/pipeline.yaml" };
  const { outputDir, controller, started, record } = await fixture(legacy);
  t.after(() => controller.close());
  await mkdir(path.join(outputDir, "units/u1/storyboard-candidates"), { recursive: true });
  await writeFile(path.join(outputDir, "units/u1/plan.json"), '{"unitId":"u1","prompt":"legacy r3"}\n');
  await writeFile(path.join(outputDir, "units/u1/storyboard-candidates/a.png"), "legacy storyboard\n");
  await writeFile(path.join(outputDir, "units/u1/storyboard.png"), "legacy storyboard\n");
  await writeFile(path.join(outputDir, "structure.json"), '{"units":[{"id":"u1"}]}\n');
  const storyboardCommit = await commit(outputDir, "legacy r3 storyboard");
  const objectId = await git(outputDir, "rev-parse", `${storyboardCommit}:units/u1/storyboard-candidates`);
  await writeFile(path.join(outputDir, "decisions.jsonl"), `${JSON.stringify({ sequence: 1, id: "legacy-storyboard-approval", type: "decision", stageId: "storyboard-production", interactionId: "i1", interactionKind: "batch-review", outcome: "reviewed", result: { actions: [{ path: "units/u1/storyboard-candidates", action: "select", selectedPath: "units/u1/storyboard-candidates/a.png" }] }, targets: [{ path: "units/u1/storyboard-candidates", commit: storyboardCommit, objectId }], createdAt: new Date().toISOString() })}\n`);
  const ids = record.loadedPipeline.pipeline.stages.map((stage) => stage.id); const at = ids.indexOf("unit-video-production");
  await controller.store.writeState(record, { ...record.state, currentStage: "unit-video-production", stages: Object.fromEntries(ids.map((id, index) => [id, index < at ? "complete" : index === at ? "active" : "pending"])), stateRevision: record.state.stateRevision + 1, updatedAt: new Date().toISOString() });
  await commit(outputDir, "enter legacy r3 video production");
  const event = await controller.appendTaskEvent({ sessionId: started.sessionId, event: { type: "task-created", operation: "video-generation", targetPath: "units/u1/clip-candidates/a.mp4", provider: "lovart", requestRef: "units/u1/plan.json", dependencyPaths: ["units/u1/storyboard.png"], requestSnapshot: { prompt: "legacy r3" } } });
  assert.equal(event.type, "task-created");
});

test("a Concept Storyboard Task is invalidated when its text Proposal changes", async (t) => {
  const { outputDir, controller, started, record } = await fixture();
  t.after(() => controller.close());
  await mkdir(path.join(outputDir, "proposals"), { recursive: true });
  await writeFile(path.join(outputDir, "proposals/a.md"), "# Direction A\n");
  await writeFile(path.join(outputDir, "proposals/concept-storyboard-request.json"), '{"proposalId":"A"}\n');
  await commit(outputDir, "proposal request");
  const ids = record.loadedPipeline.pipeline.stages.map((stage) => stage.id); const at = ids.indexOf("proposal");
  await controller.store.writeState(record, { ...record.state, currentStage: "proposal", stages: Object.fromEntries(ids.map((id, index) => [id, index < at ? "complete" : index === at ? "active" : "pending"])), stateRevision: record.state.stateRevision + 1, updatedAt: new Date().toISOString() });
  await commit(outputDir, "enter proposal");
  const event = await controller.appendTaskEvent({ sessionId: started.sessionId, event: { type: "task-created", operation: "image-generation", targetPath: "proposals/concept-storyboard.png", provider: "lovart", requestRef: "proposals/concept-storyboard-request.json", dependencyPaths: ["proposals/a.md"], requestSnapshot: { prompt: "visualize A" } } });
  await writeFile(path.join(outputDir, "proposals/concept-storyboard.png"), "downloaded too early\n");
  await assert.rejects(controller.appendTaskEvent({ sessionId: started.sessionId, event: { type: "attempt-transition", taskId: event.task.id, attemptId: event.attempt.id, status: "succeeded", result: { artifactUrl: "https://example.invalid/result.png" } } }), /Record Provider success before downloading or writing the artifact/);
  await commit(outputDir, "recover early artifact");
  const task = (await controller.get({ sessionId: started.sessionId, scope: { kind: "task", id: event.task.id } })).task;
  assert.equal(await controller.store.taskInputsCurrent(record, task), true);
  await writeFile(path.join(outputDir, "proposals/a.md"), "# Direction A changed\n"); await commit(outputDir, "change proposal");
  assert.equal(await controller.store.taskInputsCurrent(record, task), false);
});

test("restore replays Store ledgers and rejects an actively locked Production", async (t) => {
  const { outputDir, controller, started } = await fixture();
  t.after(() => controller.close());
  await assert.rejects(new PreviewController({ preferredPort: 6700 }).start({ title: "locked", outputDir, productionId: started.productionId }), /locked/);
  await controller.close();
  const restoredController = new PreviewController({ preferredPort: 6701 });
  t.after(() => restoredController.close());
  const restored = await restoredController.start({ title: "restored", outputDir, productionId: started.productionId });
  assert.equal(restored.productionId, started.productionId);
  assert.equal(restored.state.currentStage, "clarification");
});
