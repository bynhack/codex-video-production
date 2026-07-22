#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const parsed = { inputs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--input") parsed.inputs.push(value);
    else if (key === "--output-dir") parsed.outputDir = value;
    else if (key === "--output") parsed.output = value;
    else if (key === "--expected-duration-ms") parsed.expectedDurationMs = Number(value);
    else if (key === "--ratio") parsed.ratio = value;
    else throw new Error(`Unknown argument: ${key}`);
    index += 1;
  }
  if (!path.isAbsolute(parsed.outputDir ?? "")) throw new Error("--output-dir must be absolute");
  if (!parsed.inputs.length || !parsed.output || !Number.isInteger(parsed.expectedDurationMs) || !/^\d+:\d+$/.test(parsed.ratio ?? "")) throw new Error("inputs, output, expected duration, and ratio are required");
  return parsed;
}

function contained(root, relative, label) {
  if (!relative || path.isAbsolute(relative) || relative.includes("\0") || relative.includes("\n") || relative.includes("\r")) throw new Error(`${label} must be a safe relative path`);
  const resolved = path.resolve(root, relative);
  const prefix = `${path.resolve(root)}${path.sep}`;
  if (!resolved.startsWith(prefix)) throw new Error(`${label} escapes outputDir`);
  return resolved;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr.trim()}`)));
  });
}

async function probeMedia(mediaPath) {
  const raw = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration,format_name:stream=codec_type,codec_name,width,height", "-of", "json", mediaPath]);
  return JSON.parse(raw);
}

const args = parseArgs(process.argv.slice(2));
const inputs = args.inputs.map((input, index) => contained(args.outputDir, input, `input ${index + 1}`));
const output = contained(args.outputDir, args.output, "output");
await Promise.all(inputs.map((input) => readFile(input)));
await mkdir(path.dirname(output), { recursive: true });
const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "tvc-assembly-"));
try {
  const listPath = path.join(temporaryDir, "concat.txt");
  const quote = (value) => value.replaceAll("'", "'\\''");
  await writeFile(listPath, `${inputs.map((input) => `file '${quote(input)}'`).join("\n")}\n`, "utf8");
  const expectedSeconds = (args.expectedDurationMs / 1000).toFixed(3);
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-t", expectedSeconds, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output]);
  let probe = await probeMedia(output);
  let durationMs = Math.round(Number(probe.format.duration) * 1000);
  if (durationMs !== args.expectedDurationMs && Math.abs(durationMs - args.expectedDurationMs) <= 120) {
    const normalizedPath = path.join(temporaryDir, "normalized.mp4");
    const normalizeArgs = ["-y", "-i", output, "-t", expectedSeconds, "-c:v", "copy"];
    if (probe.streams.some((stream) => stream.codec_type === "audio")) {
      normalizeArgs.push("-af", `atrim=0:${expectedSeconds},asetpts=PTS-STARTPTS`, "-c:a", "aac");
    } else {
      normalizeArgs.push("-an");
    }
    normalizeArgs.push("-movflags", "+faststart", normalizedPath);
    await run("ffmpeg", normalizeArgs);
    await rename(normalizedPath, output);
    probe = await probeMedia(output);
    durationMs = Math.round(Number(probe.format.duration) * 1000);
  }
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error("Assembly output has no video stream");
  if (durationMs !== args.expectedDurationMs) throw new Error(`Assembly duration ${durationMs}ms does not match expected ${args.expectedDurationMs}ms`);
  const [ratioWidth, ratioHeight] = args.ratio.split(":").map(Number);
  if (video.width * ratioHeight !== video.height * ratioWidth) throw new Error(`Assembly dimensions ${video.width}x${video.height} do not match ${args.ratio}`);
  process.stdout.write(`${JSON.stringify({
    output: args.output,
    durationMs,
    width: video.width,
    height: video.height,
    videoCodec: video.codec_name,
    container: probe.format.format_name,
    hasAudio: probe.streams.some((stream) => stream.codec_type === "audio")
  })}\n`);
} finally {
  await rm(temporaryDir, { recursive: true, force: true });
}
