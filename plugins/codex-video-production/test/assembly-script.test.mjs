import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("deterministic TVC assembly trims provider overshoot to the exact planned duration", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "tvc-assembly-test-"));
  await Promise.all(["one", "two"].map((name, index) => exec("ffmpeg", [
    "-y", "-f", "lavfi", "-i", `color=c=${index ? "blue" : "red"}:s=320x180:d=1.1:r=24`,
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1.1", "-shortest",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(outputDir, `${name}.mp4`)
  ])));
  const { stdout } = await exec(process.execPath, [
    new URL("../scripts/assemble-tvc.mjs", import.meta.url).pathname,
    "--output-dir", outputDir,
    "--input", "one.mp4",
    "--input", "two.mp4",
    "--output", "final/tvc.mp4",
    "--expected-duration-ms", "2000",
    "--ratio", "16:9"
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.durationMs, 2000);
  assert.equal(result.width, 320);
  assert.equal(result.height, 180);
  assert.equal(result.hasAudio, true);
  assert.equal(result.output, "final/tvc.mp4");
  assert.ok((await stat(path.join(outputDir, result.output))).size > 0);

  await assert.rejects(exec(process.execPath, [
    new URL("../scripts/assemble-tvc.mjs", import.meta.url).pathname,
    "--output-dir", outputDir, "--input", "../outside.mp4", "--output", "final/bad.mp4",
    "--expected-duration-ms", "1000", "--ratio", "16:9"
  ]), /escapes outputDir/);
});
