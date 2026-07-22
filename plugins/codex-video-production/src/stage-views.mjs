import path from "node:path";

const MEDIA = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mov"]);
const PRIVATE = new Set(["state.json", "decisions.jsonl", "tasks.jsonl"]);

function matches(pattern, value) {
  const source = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]+");
  return new RegExp(`^${source}$`).test(value);
}

function classify(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)) return "image";
  if ([".mp4", ".webm", ".mov"].includes(extension)) return "video";
  if (extension === ".json") return "json";
  if (extension === ".md") return "markdown";
  return "file";
}

function collectReferences(value, known, found) {
  if (typeof value === "string") { if (known.has(value) && !PRIVATE.has(value) && !value.startsWith(".git/")) found.add(value); return; }
  if (Array.isArray(value)) { for (const item of value) collectReferences(item, known, found); return; }
  if (value && typeof value === "object") for (const item of Object.values(value)) collectReferences(item, known, found);
}

export class StageViews {
  constructor(store) { this.store = store; }

  async resolve(record, stageId) {
    const stage = record.loadedPipeline.pipeline.stages.find((candidate) => candidate.id === stageId);
    if (!stage) throw new Error(`Unknown Stage: ${stageId}`);
    const status = record.state.stages[stageId];
    if (!(["complete", "active"].includes(status))) throw new Error("Pending Stages are not visible");
    const all = await this.store.filesAtHead(record);
    const patterns = [...stage.requires, ...stage.produces];
    const known = new Set(all);
    const visible = new Set(all.filter((file) => patterns.some((pattern) => matches(pattern, file))));
    for (const relativePath of [...visible].filter((file) => path.extname(file).toLowerCase() === ".json")) {
      collectReferences(JSON.parse(await this.store.readHead(record, relativePath)), known, visible);
    }
    const files = [];
    record.allowedPaths ??= new Set();
    for (const relativePath of [...visible].sort()) {
      const kind = classify(relativePath);
      if (MEDIA.has(path.extname(relativePath).toLowerCase())) {
        record.allowedPaths.add(relativePath);
        files.push({ path: relativePath, kind, url: `/api/sessions/${encodeURIComponent(record.sessionId)}/files?path=${encodeURIComponent(relativePath)}` });
      } else if (["json", "markdown"].includes(kind)) {
        const source = await this.store.readHead(record, relativePath);
        files.push({ path: relativePath, kind, content: kind === "json" ? JSON.parse(source) : source });
      } else files.push({ path: relativePath, kind });
    }
    const view = {
      production: { id: record.state.identity.productionId, title: record.state.identity.title, status: record.state.status },
      stage: { id: stage.id, label: stage.label, goal: stage.goal, view: stage.view, status, readOnly: status === "complete" || record.state.status !== "active" },
      stages: record.loadedPipeline.pipeline.stages.filter((candidate) => record.state.stages[candidate.id] !== "pending").map((candidate) => ({ id: candidate.id, label: candidate.label, status: record.state.stages[candidate.id] })),
      signal: record.signal,
      files,
      interaction: stageId === record.state.currentStage ? record.state.interaction : null
    };
    if (["proposal", "storyboard-production", "unit-video-production", "assembly"].includes(stageId)) {
      view.tasks = [...(await this.store.taskMap(record, false)).values()].filter((task) => {
        if (["proposal", "storyboard-production"].includes(stageId)) return task.operation === "image-generation";
        if (stageId === "unit-video-production") return ["video-generation", "tail-frame"].includes(task.operation);
        return ["assembly", "media-probe"].includes(task.operation);
      });
    }
    return view;
  }
}
