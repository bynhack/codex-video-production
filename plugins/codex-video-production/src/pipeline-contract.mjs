import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const relativePathSchema = z.string().min(1).superRefine((value, context) => {
  if (path.posix.isAbsolute(value) || value.includes("\\") || value.split("/").includes("..") || path.posix.normalize(value) !== value) {
    context.addIssue({ code: "custom", message: "path must be canonical, relative, and contained" });
  }
});

export const reviewKindSchema = z.enum(["none", "form", "select", "comment", "approve"]);
export const pipelineStageSchema = z.strictObject({
  id: idSchema,
  label: z.string().min(1),
  goal: z.string().min(1),
  view: idSchema,
  prompt: relativePathSchema.refine((value) => value.endsWith(".md"), "prompt must end in .md"),
  promptVersion: z.number().int().positive(),
  requires: z.array(relativePathSchema).default([]),
  produces: z.array(relativePathSchema).min(1),
  review: z.strictObject({ kind: reviewKindSchema, required: z.boolean() }),
  optional: z.literal(false)
}).superRefine((stage, context) => {
  if (stage.review.kind === "none" && stage.review.required) {
    context.addIssue({ code: "custom", path: ["review"], message: "none review cannot be required" });
  }
  for (const key of ["requires", "produces"]) {
    if (new Set(stage[key]).size !== stage[key].length) context.addIssue({ code: "custom", path: [key], message: `${key} must be unique` });
  }
});

export const pipelineSchema = z.strictObject({
  version: z.number().int().positive(),
  revision: z.number().int().positive(),
  id: idSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  stages: z.array(pipelineStageSchema).min(1)
}).superRefine((pipeline, context) => {
  if (new Set(pipeline.stages.map((stage) => stage.id)).size !== pipeline.stages.length) {
    context.addIssue({ code: "custom", path: ["stages"], message: "stage IDs must be unique" });
  }
});

export const REQUIRED_STAGE_PROMPT_HEADINGS = [
  "Stage goal", "Required inputs", "Domain instructions", "Output contract", "Review and completion", "Boundaries"
];

export function parsePipeline(value) {
  return pipelineSchema.parse(value);
}

export function parsePipelineYaml(source) {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors.map((error) => error.message).join("; "));
  return parsePipeline(document.toJS());
}

export function validateStagePrompt(source, stageId = "unknown") {
  if (!/^# .+/m.test(source)) throw new Error(`Stage ${stageId} prompt requires one level-one title`);
  const headings = [...source.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  if (headings.length !== REQUIRED_STAGE_PROMPT_HEADINGS.length || headings.some((heading, index) => heading !== REQUIRED_STAGE_PROMPT_HEADINGS[index])) {
    throw new Error(`Stage ${stageId} prompt must contain the six required headings in order`);
  }
  return source;
}

async function containedPath(root, relative, label) {
  const rootReal = await realpath(root);
  const target = await realpath(path.resolve(root, relative));
  if (target !== rootReal && !target.startsWith(`${rootReal}${path.sep}`)) throw new Error(`${label} escapes its package`);
  return target;
}

export async function loadPipeline(manifestPath) {
  const absolute = path.resolve(manifestPath);
  const pipeline = parsePipelineYaml(await readFile(absolute, "utf8"));
  const packageDir = path.dirname(absolute);
  const expected = path.join("pipelines", pipeline.id, "revisions", String(pipeline.revision), "pipeline.yaml");
  const normalized = absolute.split(path.sep).join("/");
  if (!normalized.endsWith(`/${expected}`)) throw new Error(`Pipeline manifest must use ${expected}`);
  for (const stage of pipeline.stages) {
    const promptPath = await containedPath(packageDir, stage.prompt, `Prompt ${stage.id}`);
    validateStagePrompt(await readFile(promptPath, "utf8"), stage.id);
  }
  return { manifestPath: absolute, packageDir, pipeline };
}

export async function loadStagePrompt(loadedPipeline, stageId) {
  const stage = loadedPipeline.pipeline.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`Unknown Stage: ${stageId}`);
  const promptPath = await containedPath(loadedPipeline.packageDir, stage.prompt, `Prompt ${stageId}`);
  return validateStagePrompt(await readFile(promptPath, "utf8"), stageId);
}

export async function validatePipelinePackage(manifestPath) {
  return (await loadPipeline(manifestPath)).pipeline;
}

export async function validatePipelineDeclaration({ skillRoot, pipeline }) {
  const declaration = z.strictObject({
    id: idSchema,
    version: z.number().int().positive(),
    revision: z.number().int().positive(),
    manifestRef: relativePathSchema
  }).parse(pipeline);
  const expectedRef = `pipelines/${declaration.id}/revisions/${declaration.revision}/pipeline.yaml`;
  if (declaration.manifestRef !== expectedRef) throw new Error(`manifestRef must be ${expectedRef}`);
  const rootReal = await realpath(skillRoot);
  const manifestPath = await containedPath(rootReal, declaration.manifestRef, "Pipeline manifest");
  const loaded = await loadPipeline(manifestPath);
  if (loaded.pipeline.id !== declaration.id || loaded.pipeline.version !== declaration.version || loaded.pipeline.revision !== declaration.revision) {
    throw new Error("Installed Pipeline identity does not match the declaration");
  }
  return loaded;
}

export async function discoverPipelines(pipelinesDir) {
  const results = [];
  for (const entry of await readdir(pipelinesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const revisionsDir = path.join(pipelinesDir, entry.name, "revisions");
    let revisions;
    try { revisions = await readdir(revisionsDir, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const revision of revisions) {
      if (revision.isDirectory() && /^\d+$/.test(revision.name)) results.push(await loadPipeline(path.join(revisionsDir, revision.name, "pipeline.yaml")));
    }
  }
  return results.sort((a, b) => a.pipeline.id.localeCompare(b.pipeline.id) || a.pipeline.revision - b.pipeline.revision);
}
