import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { interactionSchema, parseInteractionResponse, requestInteractionInputSchema } from "../src/interaction-contract.mjs";
import { discoverPipelines, loadPipeline } from "../src/pipeline-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("immutable TVC revisions are packaged and revision 4 exposes seven user stages", async () => {
  const pipelines = await discoverPipelines(path.join(root, "skills/video-production/pipelines"));
  assert.deepEqual(pipelines.map(({ pipeline }) => [pipeline.id, pipeline.revision]), [["tvc", 1], ["tvc", 2], ["tvc", 3], ["tvc", 4]]);
  const loaded = await loadPipeline(path.join(root, "skills/video-production/pipelines/tvc/revisions/4/pipeline.yaml"));
  assert.equal(loaded.pipeline.version, 1);
  assert.equal(loaded.pipeline.stages.length, 7);
  assert.deepEqual(loaded.pipeline.stages.map((stage) => stage.id), ["clarification", "research", "proposal", "storyboard-production", "unit-video-production", "package-review", "assembly"]);
  assert.ok(loaded.pipeline.stages.every((stage) => stage.view && stage.produces.every((value) => !value.startsWith("extensions."))));
  const proposal = loaded.pipeline.stages.find((stage) => stage.id === "proposal");
  assert.ok(proposal.produces.includes("proposals/*-concept-storyboard.png"));
  const proposalPrompt = await readFile(path.join(root, "skills/video-production/pipelines/tvc/revisions/4/stages/proposal.md"), "utf8");
  const storyboardPrompt = await readFile(path.join(root, "skills/video-production/pipelines/tvc/revisions/4/stages/storyboard-production.md"), "utf8");
  for (const prompt of [proposalPrompt, storyboardPrompt]) {
    assert.match(prompt, /`frameAspectRatio` exactly to the confirmed delivery ratio/);
    assert.match(prompt, /Every panel's visible image aperture—not merely (?:a|a printed) label—must use that ratio/);
    assert.match(prompt, /`columns`.*`rows`|`columns × rows`/s);
    assert.match(prompt, /`sheetAspectRatio`/);
  }
  assert.doesNotMatch(storyboardPrompt, /indivisible 16:9 Storyboard Sheet/);
  assert.match(storyboardPrompt, /black-and-white rough pencil line art/);
  assert.match(storyboardPrompt, /red arrows.*blue arrows.*green text.*orange marks.*purple text.*black text/s);
  assert.match(storyboardPrompt, /do not hard-code a shot count/);
  assert.match(storyboardPrompt, /A Unit is one Provider generation clip, not one shot/);
  assert.match(storyboardPrompt, /30000ms film normally uses two approximately 15000ms Units/);
  assert.match(storyboardPrompt, /most shots roughly 0.8–3 seconds/);
  assert.match(storyboardPrompt, /role: product-reference/);
  assert.match(storyboardPrompt, /pass those exact files to Lovart/);
});

test("Interaction responses are strict and target reviews cover each stamped path", () => {
  const interaction = interactionSchema.parse({
    stageId: "clarification", kind: "form", title: "澄清", targetPaths: ["clarification.json"],
    fields: [{ id: "ratio", label: "画幅", type: "select", options: [{ id: "16:9", label: "横屏" }] }]
  });
  assert.equal(requestInteractionInputSchema.parse({ sessionId: "session-1", interaction }).interaction.stageId, "clarification");
  assert.throws(() => requestInteractionInputSchema.parse({ sessionId: "session-1", interaction: { ...interaction, stageId: undefined } }), /stageId/);
  assert.equal(parseInteractionResponse({ ...interaction, targets: [{ path: "clarification.json" }] }, { answers: { ratio: "16:9" } }).answers.ratio, "16:9");
  assert.throws(() => parseInteractionResponse({ ...interaction, targets: [{ path: "clarification.json" }] }, { answers: { ratio: "9:16" } }), /invalid option/);
  const dynamicForm = interactionSchema.parse({
    stageId: "clarification", kind: "form", title: "按当前需求澄清", targetPaths: ["clarification.json"],
    fields: [{ id: "tone", label: "希望重点体现哪些感受？", type: "multi-select", options: [{ id: "premium", label: "高级质感" }, { id: "memorable", label: "容易记住" }] }]
  });
  assert.deepEqual(parseInteractionResponse({ ...dynamicForm, targets: [{ path: "clarification.json" }] }, { answers: { tone: ["premium", "memorable"] } }).answers.tone, ["premium", "memorable"]);
  const batch = { kind: "batch-review", targets: [{ path: "units/u1/clip-candidates" }, { path: "units/u2/clip-candidates" }], allowedTaskActions: [] };
  assert.throws(() => parseInteractionResponse(batch, { actions: [{ path: batch.targets[0].path, action: "approve" }] }), /every declared target/);
  assert.throws(() => interactionSchema.parse({
    stageId: "unit-video-production", kind: "batch-review", title: "审片",
    targetPaths: ["units/u1/clip.mp4"], allowedTaskActions: ["redo"]
  }), /only valid for task-control-request/);
});

test("revision 4 presents one Proposal choice and defaults canonical Storyboards to approve", async () => {
  const skill = await readFile(path.join(root, "skills/video-production/SKILL.md"), "utf8");
  const proposalPrompt = await readFile(path.join(root, "skills/video-production/pipelines/tvc/revisions/4/stages/proposal.md"), "utf8");
  const store = await readFile(path.join(root, "src/session-store.mjs"), "utf8");
  const preview = await readFile(path.join(root, "preview/app.js"), "utf8");
  const demo = await readFile(path.join(root, "scripts/demo.mjs"), "utf8");
  assert.doesNotMatch(skill, /two-step review|preliminary direction choice/);
  assert.match(proposalPrompt, /request exactly one `select` Interaction/);
  assert.match(proposalPrompt, /Never create a preliminary Interaction/);
  assert.match(preview, /target\.path\.endsWith\("\/storyboard\.png"\)/);
  assert.match(preview, /checkbox\.checked \? "revise" : "approve"/);
  assert.match(preview, /storyboard-sequence-item/);
  assert.match(preview, /storyboard-production-notes/);
  assert.match(preview, /storyboard-reference-item/);
  assert.match(preview, /proposal-tab-card/);
  assert.match(preview, /Array\.isArray\(index\) \? index : index\?\.proposals \?\? index\?\.entries/);
  assert.match(skill, /Do not end the turn merely to ask the user to open or submit Preview/);
  assert.match(skill, /send the returned Preview URL to the user in commentary before any other tool call/);
  assert.match(skill, /Do not end the turn with a final answer merely because media is still submitting, queued, or running/);
  assert.match(skill, /Never download or write the artifact before recording success/);
  assert.match(skill, /never write the index as a bare JSON array/);
  assert.match(skill, /Never add `mediaTaskId` or `allowedTaskActions`/);
  const unitVideoPrompt = await readFile(path.join(root, "skills/video-production/pipelines/tvc/revisions/4/stages/unit-video-production.md"), "utf8");
  assert.match(unitVideoPrompt, /Do not reduce a multi-panel Storyboard to one slow camera move/);
  assert.match(unitVideoPrompt, /most internal shots roughly 0.8–3 seconds/);
  assert.match(unitVideoPrompt, /request one `batch-review` targeting those canonical Clip paths/);
  assert.match(unitVideoPrompt, /must not contain task-control-only `mediaTaskId` or `allowedTaskActions`/);
  assert.match(store, /revision >= 4\s*\? await this\.evidenceForPath\(record, stageId, canonical\)\s*:\s*await this\.evidenceForPath\(record, stageId, directory, \{ selectedPath: selected \}\)/);
  assert.doesNotMatch(store, /Clip \$\{unitId\} lacks selected current approval/);
  assert.match(preview, /showProposal\(proposal\.id\).*selectProposal\(proposal\.id\)/s);
  assert.match(preview, /files\.find\(\(file\) => file\.path\.endsWith\("\/clip\.mp4"\)\)/);
  assert.match(preview, /canonicalClipReview.*确认通过.*需要重做/s);
  assert.doesNotMatch(preview, /选择这一段最终使用的视频|正式片段|视频候选/);
  assert.match(demo, /unit-video-production.*units\/\$\{unit\.id\}\/clip\.mp4/);
  assert.doesNotMatch(demo, /unit-video-production.*clip-candidates/);
});
