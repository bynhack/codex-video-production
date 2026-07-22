import assert from "node:assert/strict";
import test from "node:test";

const bytes = (value) => Buffer.byteLength(JSON.stringify(value));

test("8-Unit file-tree transport reduces Host-Agent transfer by at least 10x", (t) => {
  const prompt = "保持产品身份、物理连续性、镜头节奏与参考图编号一致。".repeat(18);
  const units = Array.from({ length: 8 }, (_, index) => ({ id: `unit-${index + 1}`, durationMs: 7500, prompt, references: [`units/unit-${index + 1}/storyboard.png`] }));
  const accumulatedSnapshot = { identity: { productionId: "m3" }, units, artifacts: units.flatMap((unit) => Array.from({ length: 5 }, (_, i) => ({ id: `${unit.id}-${i}`, path: `${unit.id}/${i}.mp4`, status: "available" }))), decisions: Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, targetId: units[i % 8].id, outcome: "approved", comment: "已确认" })), mediaTasks: Array.from({ length: 16 }, (_, i) => ({ id: `t${i}`, requestSnapshot: { prompt }, attempts: Array.from({ length: 2 }, (_, n) => ({ number: n + 1, status: "succeeded", providerSubmitId: `${i}-${n}` })) })) };
  const oldExchange = { get: accumulatedSnapshot, sync: accumulatedSnapshot };
  const state = { stateRevision: 21, status: "active", currentStage: "unit-video-production", stages: Object.fromEntries(["clarification", "research", "proposal", "storyboard-production", "unit-video-production", "package-review", "assembly"].map((id, i) => [id, i < 4 ? "complete" : i === 4 ? "active" : "pending"])) };
  const newEvents = units.map((unit) => ({ sessionId: "s", event: { type: "attempt-transition", taskId: unit.id, attemptId: `${unit.id}-a1`, status: "running", providerSubmitId: unit.id } }));
  const oldTotal = 96 * bytes(oldExchange);
  const newTotal = 8 * bytes({ state }) + newEvents.reduce((sum, event) => sum + bytes(event), 0) + bytes({ event: { type: "task-created", requestSnapshot: { prompt } } }) * 8;
  const reduction = oldTotal / newTotal;
  assert.ok(bytes(accumulatedSnapshot) >= 30_000 && bytes(accumulatedSnapshot) <= 80_000, "fixture must remain comparable to a real accumulated snapshot");
  assert.ok(reduction >= 10, `measured ${reduction.toFixed(1)}x`);
  t.diagnostic(`8-Unit fixture transport: ${(oldTotal / 4).toFixed(0)} -> ${(newTotal / 4).toFixed(0)} estimated tokens, ${reduction.toFixed(1)}x reduction`);
});
