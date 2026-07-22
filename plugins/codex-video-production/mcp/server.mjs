#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PreviewController, TVC_PIPELINE } from "../src/preview-controller.mjs";
import { requestInteractionInputSchema } from "../src/interaction-contract.mjs";

const controller = new PreviewController();
const server = new McpServer({ name: "video-preview", version: "0.1.0" });
const result = (value, summary) => ({ content: [{ type: "text", text: summary }], structuredContent: value });
const pipelineSchema = z.strictObject({ id: z.literal("tvc"), version: z.number().int().positive(), revision: z.number().int().positive(), manifestRef: z.string().min(1) });

server.registerTool("video_preview_start", {
  title: "Start or restore Production",
  description: "Open one file-tree TVC Production and its local Stage preview. Share the returned Preview URL with the user before any further tool call.",
  inputSchema: z.strictObject({ title: z.string().min(1), outputDir: z.string().min(1), productionId: z.string().min(1).optional(), pipeline: pipelineSchema.default(TVC_PIPELINE) })
}, async (input) => { const value = await controller.start(input); return result(value, `Preview ready: ${value.url}. Share this URL with the user now, before any further tool call.`); });

server.registerTool("video_preview_publish", {
  title: "Publish a light preview signal",
  description: "Tell the Preview which committed Stage files deserve attention; does not carry production content.",
  inputSchema: z.strictObject({ sessionId: z.string(), stage: z.string(), notice: z.string().default(""), focusPaths: z.array(z.string()).default([]) })
}, async (input) => result({ signal: controller.publish(input) }, `Published ${input.stage}.`));

server.registerTool("video_preview_request_interaction", {
  title: "Request a durable user interaction",
  description: "Stamp committed target files and show controls in Preview. Then immediately call video_preview_wait_interaction and keep waiting in the same turn.",
  inputSchema: requestInteractionInputSchema
}, async (input) => { const value = await controller.requestInteraction(input); return result(value, `Waiting for a decision at ${value.url}. Share the URL, then immediately call video_preview_wait_interaction; do not end the turn.`); });

server.registerTool("video_preview_wait_interaction", {
  title: "Wait for user input",
  description: "Wait up to 55 seconds; call again when still pending.",
  inputSchema: z.strictObject({ sessionId: z.string(), interactionId: z.string(), timeoutSeconds: z.number().min(1).max(55).default(45) })
}, async (input) => { const interaction = await controller.wait(input); return result(interaction ? { status: "submitted", interaction } : { status: "pending", interactionId: input.interactionId }, interaction ? "The user submitted." : "Still pending."); });

server.registerTool("video_preview_get", {
  title: "Read scoped Production state",
  description: "Read only a small summary, state, one Decision, one Task, or a ledger tail.",
  inputSchema: z.strictObject({
    sessionId: z.string(),
    scope: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("summary") }), z.strictObject({ kind: z.literal("state") }),
      z.strictObject({ kind: z.literal("decision"), id: z.string() }), z.strictObject({ kind: z.literal("task"), id: z.string() }),
      z.strictObject({ kind: z.literal("tail"), ledger: z.enum(["decisions", "tasks"]), limit: z.number().int().min(1).max(100).default(20) })
    ]).default({ kind: "summary" })
  })
}, async (input) => result(await controller.get(input), "Read scoped Production state."));

server.registerTool("video_preview_append_decision", {
  title: "Append Decision evidence",
  description: "Derive one immutable Decision from the current submitted Interaction.",
  inputSchema: z.strictObject({ sessionId: z.string(), interactionId: z.string() })
}, async (input) => result({ decision: await controller.appendDecision(input) }, "Decision appended."));

const taskEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("task-created"), operation: z.enum(["image-generation", "video-generation", "tail-frame", "assembly", "media-probe"]), targetPath: z.string(), provider: z.string(), requestRef: z.string(), dependencyPaths: z.array(z.string()).default([]), requestSnapshot: z.unknown(), redoOfTaskId: z.string().optional() }),
  z.strictObject({ type: z.literal("attempt-created"), taskId: z.string() }),
  z.strictObject({ type: z.literal("attempt-transition"), taskId: z.string(), attemptId: z.string(), status: z.enum(["submitted", "running", "succeeded", "failed", "cancel_requested", "cancelled", "submission_unknown"]), providerSubmitId: z.string().optional(), submittedAt: z.string().optional(), result: z.unknown().optional(), error: z.unknown().optional(), cancellation: z.unknown().optional(), reconciliation: z.unknown().optional() }),
  z.strictObject({ type: z.literal("artifact-unrecoverable"), taskId: z.string(), attemptId: z.string(), reason: z.string().min(1) })
]);

server.registerTool("video_preview_append_task_event", {
  title: "Append media task event",
  description: "Validate and append one durable Task or Attempt event; never calls or retries a Provider. Commit request/dependency files before task-created, and record succeeded before downloading its artifact.",
  inputSchema: z.strictObject({ sessionId: z.string(), event: taskEventSchema })
}, async (input) => {
  const event = await controller.appendTaskEvent(input);
  const nonterminal = ["task-created", "attempt-created"].includes(input.event.type)
    || (input.event.type === "attempt-transition" && ["submitted", "running", "cancel_requested", "submission_unknown"].includes(input.event.status));
  return result({ event }, nonterminal
    ? "Task event appended. Provider work is still nonterminal; keep polling or reconciling in this turn and do not end it."
    : input.event.type === "attempt-transition" && input.event.status === "succeeded"
      ? "Provider success is durable. Download the artifact now, then commit it together with the pending Task ledger."
      : "Task event appended.");
});

const stateActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("complete-stage"), stageId: z.string() }),
  z.strictObject({ type: z.literal("activate-stage"), stageId: z.string() }),
  z.strictObject({ type: z.literal("pause-gate"), stageId: z.string(), reasonCode: z.string(), requiredCapability: z.string().optional() }),
  z.strictObject({ type: z.literal("resume-gate"), evidence: z.string() }),
  z.strictObject({ type: z.literal("reopen-from-stage"), stageId: z.string(), evidence: z.string(), decisionId: z.string().optional() })
]);

server.registerTool("video_preview_update_state", {
  title: "Update small Production state",
  description: "CAS-update Stage lifecycle, correction, or execution gate state after Store checkpoint validation.",
  inputSchema: z.strictObject({ sessionId: z.string(), expectedStateRevision: z.number().int().nonnegative(), actions: z.array(stateActionSchema).min(1) })
}, async (input) => result({ state: await controller.updateState(input) }, "Production state updated."));

server.registerTool("video_preview_complete", {
  title: "Complete Production",
  description: "Validate final files, evidence, Tasks, and mark the Production completed.",
  inputSchema: z.strictObject({ sessionId: z.string(), expectedStateRevision: z.number().int().nonnegative() })
}, async (input) => result({ state: await controller.complete(input) }, "Production completed."));

process.on("SIGINT", async () => { await controller.close(); process.exit(0); });
process.on("SIGTERM", async () => { await controller.close(); process.exit(0); });
await server.connect(new StdioServerTransport());
