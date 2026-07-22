import { parseMarkdown } from "./markdown.js";

const app = document.querySelector("#app");
const sessionId = new URLSearchParams(location.search).get("session");
let selectedStage = null;
let lastInteraction = null;
let selectionInteractionId = null;
let railOpen = false;
const candidateSelections = new Map();
const stageLabels = {
  clarification: "需求确认", research: "市场调研", proposal: "创意提案", "video-structure": "视频结构",
  "storyboard-plan": "分镜策划", "storyboard-production": "分镜制作", "video-prompt-plan": "视频生成方案",
  "unit-video-production": "视频片段制作", "package-review": "成片检查", assembly: "成片交付"
};
const fieldLabels = {
  product: "产品名称", objective: "制作目标", audience: "目标受众", platform: "发布平台", totalDurationMs: "成片时长",
  aspectRatio: "画面比例", ratio: "画面比例", language: "视频语言", audioPolicy: "声音方案", sourceAssetIds: "使用素材",
  prompt: "画面描述", negativePrompt: "需要避免", durationMs: "时长", unitId: "视频段落", panelCount: "分镜格数",
  referencePaths: "参考素材", referenceImages: "参考图片", referenceVideos: "参考视频", referenceAudios: "参考音频",
  continuityInputs: "衔接参考", blockingIssues: "待解决问题", executable: "可以开始制作", quality: "画质",
  title: "名称", label: "名称", summary: "内容摘要", rationale: "设计思路", continuitySummary: "衔接说明",
  startMs: "开始时间", endMs: "结束时间", visibleEvent: "画面内容", storyFunction: "叙事作用", continuityMode: "衔接方式",
  startState: "开始状态", endState: "结束状态", storyboardPanelCount: "分镜格数", order: "顺序", units: "视频段落", pass: "检查结果", issues: "发现问题",
  orderedClipPaths: "成片片段顺序", deliveryFormat: "交付格式", mandatoryElements: "必须包含", audioSources: "声音来源",
  width: "画面宽度", height: "画面高度", frameRate: "帧率", videoCodec: "视频编码", container: "文件格式", hasAudio: "包含声音"
};
const valueLabels = { native: "视频原声", "model-native-and-user-supplied-only": "视频原声与已有音频素材", "zh-CN": "中文", "match-cut": "动作或构图匹配衔接", "tail-frame": "沿用上一段尾帧", "reference-only": "仅保持视觉参考", true: "是", false: "否" };
const taskStatusLabels = { submitting: "正在提交", submitted: "等待制作", running: "制作中", succeeded: "已完成", failed: "制作失败", cancelled: "已取消", submission_unknown: "正在确认提交结果" };
const stageIntros = {
  clarification: "确认这支片子的目标、受众、发布方式和必须遵守的要求。", research: "了解产品、市场、受众和同类内容，为创意找到可靠依据。",
  proposal: "比较不同创意方向，选择最适合继续制作的一版。", "video-structure": "确认整支片子的节奏，以及每个视频段落讲什么。",
  "storyboard-plan": "规划每个视频段落需要呈现的关键画面。", "storyboard-production": "查看每个视频段落将如何展开，并选择正式使用的整张分镜故事板。",
  "video-prompt-plan": "确认每个视频段落的生成描述与参考素材。", "unit-video-production": "对照已确认分镜检查每段生成视频；不满意时只需标记该段重做。",
  "package-review": "检查所有内容是否完整、一致并符合最初要求。", assembly: "查看完整成片并完成最终确认。"
};

function stageLabel(stage) { return stageLabels[stage.id] || stage.label; }
function fieldLabel(key) { return fieldLabels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2"); }
function friendlyValue(value) {
  if (valueLabels[String(value)] !== undefined) return valueLabels[String(value)];
  if (typeof value === "number" && value >= 1000 && value % 1000 === 0) return `${value / 1000} 秒`;
  return String(value ?? "—");
}
function friendlyFieldValue(key, value) {
  if (key === "totalDurationMs" && /^\d+$/.test(String(value))) return `${Number(value) / 1000} 秒`;
  if (key === "sourceAssetIds" && /^\[?\s*\]?$/.test(String(value))) return "暂未提供";
  return friendlyValue(value);
}
function unitLabel(path) { const match = path.match(/units\/([^/]+)/); return match ? `第 ${Number(match[1].match(/\d+/)?.[0] || 0) || match[1]} 段` : ""; }
function fileLabel(path) {
  const unit = unitLabel(path);
  if (path === "request.md") return "你最初的需求";
  if (path === "assets/index.json") return "已有产品素材";
  if (path === "brief.md") return "制作需求摘要";
  if (path === "research.md") return "调研结论";
  if (path === "structure.json") return "视频结构";
  if (path === "package-review.md") return "制作检查报告";
  if (path === "final/assembly.json") return "成片组成";
  if (path === "final/tvc.mp4") return "最终成片";
  if (path === "final/probe.json") return "成片信息";
  if (path.endsWith("storyboard-plan.json")) return `${unit}分镜策划`;
  if (path.endsWith("storyboard.png")) return `${unit}正式分镜`;
  if (path.includes("storyboard-candidates")) return `${unit}分镜候选`;
  if (path.endsWith("plan.json")) return `${unit}视频生成方案`;
  if (path.endsWith("clip.mp4") || path.includes("clip-candidates")) return `${unit}视频片段`;
  if (path.endsWith("tail-frame.png")) return `${unit}衔接画面`;
  return path.split("/").at(-1).replace(/[-_]/g, " ").replace(/\.[^.]+$/, "");
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}

function appendInline(node, source) {
  const parts = String(source).split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) node.append(part.startsWith("**") && part.endsWith("**") ? element("strong", "", part.slice(2, -2)) : document.createTextNode(part));
}

function renderMarkdown(source) {
  const parsed = parseMarkdown(source);
  const container = element("div", "markdown-document");
  if (parsed.fields.length) {
    const fields = element("dl", "front-matter");
    for (const field of parsed.fields) fields.append(element("dt", "", fieldLabel(field.key)), element("dd", "", friendlyFieldValue(field.key, field.value)));
    container.append(fields);
  }
  const body = element("div", "markdown-body");
  for (const block of parsed.blocks) {
    if (block.type === "heading") { const heading = element(`h${block.level}`); appendInline(heading, block.text === "制作 Brief" ? "制作需求说明" : block.text); body.append(heading); }
    else if (["ul", "ol"].includes(block.type)) { const list = element(block.type); for (const item of block.items) { const row = element("li"); appendInline(row, item); list.append(row); } body.append(list); }
    else { const paragraph = element("p"); appendInline(paragraph, block.text); body.append(paragraph); }
  }
  container.append(body);
  return container;
}

function renderData(value) {
  if (Array.isArray(value)) {
    if (!value.length) return element("p", "data-empty", "暂未提供");
    const list = element("div", "data-list");
    for (const item of value) { const row = element("div", "data-item"); row.append(typeof item === "object" ? renderData(item) : document.createTextNode(friendlyValue(item))); list.append(row); }
    return list;
  }
  if (value && typeof value === "object") {
    const fields = element("dl", "data-fields");
    for (const [key, item] of Object.entries(value)) {
      fields.append(element("dt", "", fieldLabel(key))); const detail = element("dd");
      if (key === "unitId" && typeof item === "string") detail.append(document.createTextNode(unitLabel(`units/${item}`)));
      else if ((key.endsWith("Paths") || key.startsWith("reference")) && Array.isArray(item)) detail.append(renderData(item.map((path) => typeof path === "string" ? fileLabel(path) : path)));
      else if (typeof item !== "object" || item === null) detail.append(document.createTextNode(friendlyFieldValue(key, item)));
      else detail.append(renderData(item));
      fields.append(detail);
    }
    return fields;
  }
  return document.createTextNode(friendlyValue(value));
}

function targetForFile(view, file) {
  const interaction = view.interaction;
  if (!interaction || interaction.status !== "waiting" || view.stage.readOnly || !["target-review", "batch-review"].includes(interaction.kind) || !["image", "video"].includes(file.kind)) return null;
  return interaction.targets.find((target) => file.path.startsWith(`${target.path}/`)) ?? null;
}

function selectCandidate(targetPath, filePath) {
  candidateSelections.set(targetPath, filePath);
  for (const card of document.querySelectorAll(".candidate-card")) {
    const selected = card.dataset.candidatePath === filePath && card.dataset.targetPath === targetPath;
    if (card.dataset.targetPath === targetPath) card.classList.toggle("selected", selected);
    const button = card.querySelector(".candidate-select"); if (button && card.dataset.targetPath === targetPath) button.textContent = selected ? "已选择" : "选择这版";
  }
  for (const row of document.querySelectorAll(".target-action")) if (row.dataset.path === targetPath) {
    row.querySelector('[name="target-action"]').value = "select";
    row.querySelector('[name="selected-path"]').value = filePath;
    row.querySelector(".selected-candidate").textContent = fileLabel(filePath);
  }
}

function selectProposal(proposalId) {
  for (const input of document.querySelectorAll('[name="selection"]')) if (input.value === proposalId) input.checked = true;
  for (const card of document.querySelectorAll(".proposal-view-card, .proposal-option, .proposal-tab-card")) card.classList.toggle("selected", card.dataset.proposalId === proposalId);
  for (const detail of document.querySelectorAll(".selected-proposal")) detail.hidden = detail.dataset.proposalId !== proposalId;
}

function showProposal(proposalId) {
  for (const card of document.querySelectorAll(".proposal-tab-card")) card.classList.toggle("active", card.dataset.proposalId === proposalId);
  for (const detail of document.querySelectorAll(".proposal-detail")) detail.hidden = detail.dataset.proposalId !== proposalId;
}

function storyboardReviewControl(targetPath) {
  const control = element("fieldset", "storyboard-inline-review");
  control.dataset.reviewPath = targetPath;
  const label = element("label", "storyboard-change-toggle");
  const checkbox = element("input"); checkbox.type = "checkbox";
  const copy = element("span"); copy.append(element("strong", "", "这段需要修改"), element("small", "", "不勾选即表示这段可以使用"));
  label.append(checkbox, copy);
  const note = element("textarea"); note.placeholder = "请说明需要修改的画面、动作或表达"; note.hidden = true;
  const sync = () => {
    control.classList.toggle("needs-revision", checkbox.checked); note.hidden = !checkbox.checked; note.required = checkbox.checked;
    const source = document.querySelector(`.storyboard-action-source[data-path="${CSS.escape(targetPath)}"]`);
    if (source) { source.querySelector('[name="target-action"]').value = checkbox.checked ? "revise" : "approve"; source.querySelector('[name="target-comment"]').value = checkbox.checked ? note.value : ""; }
  };
  checkbox.addEventListener("change", sync); note.addEventListener("input", sync);
  control.append(label, note); return control;
}

function renderWholeImage(file, title, description = "") {
  const section = element("section", "whole-sheet");
  const header = element("header", "whole-sheet-head");
  const copy = element("div"); copy.append(element("p", "eyebrow", "整张查看"), element("h3", "", title));
  if (description) copy.append(element("p", "muted", description));
  const controls = element("div", "sheet-controls");
  const frame = element("div", "whole-sheet-frame");
  const image = element("img"); image.src = file.url; image.alt = title; image.loading = "eager"; frame.append(image);
  let zoom = 1;
  const setZoom = (next) => { zoom = Math.max(1, Math.min(2.5, next)); image.style.width = `${zoom * 100}%`; };
  const fit = element("button", "", "适合宽度"); fit.type = "button"; fit.addEventListener("click", () => setZoom(1));
  const minus = element("button", "", "缩小"); minus.type = "button"; minus.addEventListener("click", () => setZoom(zoom - .25));
  const plus = element("button", "", "放大"); plus.type = "button"; plus.addEventListener("click", () => setZoom(zoom + .25));
  const original = element("a", "", "查看原图 ↗"); original.href = file.url; original.target = "_blank"; original.rel = "noreferrer";
  controls.append(fit, minus, plus, original); header.append(copy, controls); section.append(header, frame); return section;
}

function unitFiles(view) {
  const groups = new Map();
  for (const file of view.files.filter((candidate) => candidate.path.startsWith("units/"))) {
    const id = file.path.split("/")[1]; const group = groups.get(id) ?? []; group.push(file); groups.set(id, group);
  }
  return groups;
}

function renderFile(file, view) {
  const card = element("article", `file-card ${file.kind}`);
  const target = targetForFile(view, file);
  if (target) {
    card.classList.add("candidate-card"); card.dataset.candidatePath = file.path; card.dataset.targetPath = target.path;
    card.classList.toggle("selected", candidateSelections.get(target.path) === file.path);
    card.addEventListener("click", (event) => { if (!event.target.closest("video")) selectCandidate(target.path, file.path); });
  }
  card.append(element("h3", "file-title", fileLabel(file.path)));
  if (file.kind === "image") {
    const image = element("img"); image.src = file.url; image.alt = file.path; card.append(image);
  } else if (file.kind === "video") {
    const video = element("video"); video.src = file.url; video.controls = true; video.preload = "metadata"; card.append(video);
  } else if (file.kind === "markdown") card.append(renderMarkdown(file.content));
  else if (file.kind === "json") card.append(renderData(file.content));
  else { const pre = element("pre"); pre.textContent = String(file.content ?? ""); card.append(pre); }
  if (target) { const choose = element("button", "candidate-select", candidateSelections.get(target.path) === file.path ? "已选择" : "选择这版"); choose.type = "button"; choose.addEventListener("click", () => selectCandidate(target.path, file.path)); card.append(choose); }
  return card;
}

function renderStageFiles(view) {
  const container = element("section", `file-grid view-${view.stage.view}`);
  if (view.stage.view === "clarification-form") {
    for (const path of ["request.md", "assets/index.json", "brief.md"]) { const file = view.files.find((candidate) => candidate.path === path); if (file) container.append(renderFile(file, view)); }
  } else if (view.stage.view === "research-document") {
    const report = view.files.find((file) => file.path === "research.md");
    if (report) { const article = element("article", "research-report"); article.append(renderMarkdown(report.content)); container.append(article); }
    const sources = view.files.find((file) => file.path === "research-sources.json")?.content;
    if (Array.isArray(sources) && sources.length) {
      const section = element("section", "research-sources"); section.append(element("p", "eyebrow", `${sources.length} 项调研依据`), element("h3", "", "来源与可信度"));
      const list = element("div", "source-list");
      const evidenceLabels = { primary: "官方资料", authoritative: "权威资料", published: "公开资料", client: "客户资料", inference: "分析推断" };
      for (const source of sources) { const item = element("article", "source-card"); item.append(element("span", "source-type", evidenceLabels[source.evidenceClass] || source.evidenceClass || "调研来源"), element("h4", "", source.title || source.id)); if (source.url) { const link = element("a", "", "查看原始来源 ↗"); link.href = source.url; link.target = "_blank"; link.rel = "noreferrer"; item.append(link); } list.append(item); }
      section.append(list); container.append(section);
    }
  } else if (view.stage.view === "proposal-comparison") {
    const index = view.files.find((file) => file.path === "proposals/index.json")?.content;
    const proposals = Array.isArray(index) ? index : index?.proposals ?? index?.entries ?? [];
    const selected = view.files.find((file) => file.path === "proposals/selected.json")?.content;
    const concept = view.files.find((file) => file.path === "proposals/concept-storyboard.png");
    const selectableIds = new Set(view.interaction?.options?.map((option) => option.id) ?? []);
    const selectedId = selected?.proposalId || document.querySelector('[name="selection"]:checked')?.value;
    const completeAlternatives = proposals.length && proposals.every((proposal) => proposal.conceptStoryboardPath);
    if (completeAlternatives) {
      const activeId = selectedId || proposals[0].id;
      const navigation = element("nav", "proposal-tabs"); navigation.setAttribute("aria-label", "创意方向"); navigation.style.setProperty("--proposal-count", String(Math.min(4, proposals.length)));
      const alternatives = element("div", "proposal-details");
      for (const [proposalIndex, proposal] of proposals.entries()) {
        const proposalFile = view.files.find((file) => file.path === proposal.path);
        const storyboard = view.files.find((file) => file.path === proposal.conceptStoryboardPath);
        if (!proposalFile || !storyboard) continue;
        const tab = element("button", `proposal-tab-card${proposal.id === activeId ? " active" : ""}${proposal.id === selectedId ? " selected" : ""}`); tab.type = "button"; tab.dataset.proposalId = proposal.id;
        tab.append(element("span", "proposal-tab-order", `方向 ${proposalIndex + 1}${proposal.recommended ? " · 推荐" : ""}`), element("strong", "", proposal.title), element("p", "", proposal.summary || ""));
        tab.addEventListener("click", () => { showProposal(proposal.id); if (!view.stage.readOnly && view.interaction?.kind === "select" && view.interaction.status === "waiting" && selectableIds.has(proposal.id)) selectProposal(proposal.id); }); navigation.append(tab);
        const option = element("article", "proposal-option proposal-detail"); option.dataset.proposalId = proposal.id; option.hidden = proposal.id !== activeId;
        const heading = element("header", "proposal-option-head");
        heading.append(element("p", "eyebrow", `方向 ${proposalIndex + 1}${proposal.recommended ? " · 推荐" : ""}`), element("h3", "", proposal.title), element("p", "proposal-summary", proposal.summary || ""));
        option.append(heading, renderWholeImage(storyboard, `${proposal.title} · 全片故事板`, "从头到尾理解这个方向的画面推进与产品角色。"));
        const text = element("section", "proposal-full-text"); text.append(element("p", "eyebrow", "完整文字提案"), renderMarkdown(proposalFile.content)); option.append(text); alternatives.append(option);
      }
      container.append(navigation, alternatives);
      return container;
    }
    const cards = element("div", "proposal-cards proposal-summaries");
    for (const proposal of proposals) {
      const file = view.files.find((candidate) => candidate.path === proposal.path);
      const card = element("article", "proposal-view-card");
      card.dataset.proposalId = proposal.id;
      card.append(element("span", "eyebrow", proposal.id), element("h3", "", proposal.title), element("p", "", proposal.summary || ""));
      if (!view.stage.readOnly && view.interaction?.kind === "select" && view.interaction.status === "waiting" && selectableIds.has(proposal.id)) { const choose = element("button", "proposal-select", concept ? "确认这个方向" : "选择这个方向"); choose.type = "button"; choose.addEventListener("click", () => selectProposal(proposal.id)); card.append(choose); }
      if (proposal.id === selectedId) card.classList.add("selected");
      cards.append(card);
    }
    if (cards.childElementCount) container.append(cards);
    const currentId = selectedId || proposals[0]?.id;
    const proposalDetails = [];
    for (const proposalData of proposals) {
      const proposalFile = view.files.find((file) => file.path === proposalData.path); if (!proposalFile) continue;
      const proposal = element(concept ? "details" : "section", "selected-proposal"); proposal.dataset.proposalId = proposalData.id; proposal.hidden = proposalData.id !== currentId;
      if (concept) proposal.append(element("summary", "", `查看完整文字提案：${proposalData.title}`), renderMarkdown(proposalFile.content));
      else proposal.append(element("p", "eyebrow", "完整文字提案 · 内容依据"), element("h3", "", proposalData.title), renderMarkdown(proposalFile.content));
      proposalDetails.push(proposal);
    }
    const currentFile = view.files.find((file) => file.path === proposals.find((proposal) => proposal.id === currentId)?.path);
    if (concept) container.append(renderWholeImage(concept, "全片概念故事板", "把完整文字提案转成一张可直观看懂的视觉稿；后续结构仍以文字提案为内容依据。"), ...proposalDetails);
    else if (currentFile) { container.append(...proposalDetails); const pending = element("section", "concept-pending"); pending.append(element("p", "eyebrow", "下一步"), element("h3", "", "生成这一方向的全片概念故事板"), element("p", "", "确认方向后，系统会把完整文字提案一次生成成整张故事板，供你结合文字共同判断。")); container.append(pending); }
  } else if (view.stage.view === "structure-timeline") {
    const structure = view.files.find((file) => file.path === "structure.json")?.content;
    if (structure?.units?.length) {
      const summary = element("div", "structure-head"); summary.append(element("div", "structure-stat", `${structure.totalDurationMs / 1000} 秒`), element("div", "structure-stat", `${structure.units.length} 个生成段落`), element("div", "structure-stat", structure.aspectRatio || "")); container.append(summary);
      const timeline = element("div", "timeline");
      for (const [index, unit] of structure.units.entries()) { const card = element("article", "timeline-unit"); card.style.flexGrow = String(unit.durationMs || 1); card.append(element("small", "", `第 ${index + 1} 段 · ${unit.startMs / 1000}–${unit.endMs / 1000} 秒`), element("strong", "", unit.label || unit.id), element("p", "", unit.visibleEvent || unit.storyFunction || "")); const meta = element("dl", "unit-meta"); for (const [label, value] of [["开始状态", unit.startState], ["结束状态", unit.endState], ["衔接方式", unit.continuityMode], ["分镜格数", unit.storyboardPanelCount]]) if (value !== undefined) meta.append(element("dt", "", label), element("dd", "", friendlyValue(value))); card.append(meta); timeline.append(card); }
      container.append(timeline);
    }
  } else if (view.stage.view === "storyboard-workspace") {
    const selectedProposal = view.files.find((file) => file.path === "proposals/selected.json")?.content;
    const concept = view.files.find((file) => file.path === (selectedProposal?.conceptStoryboardPath || "proposals/concept-storyboard.png"));
    const structure = view.files.find((file) => file.path === "structure.json")?.content;
    const canonicalReview = view.interaction?.status === "waiting" && view.interaction?.kind === "batch-review" && view.interaction.targets?.length && view.interaction.targets.every((target) => target.path.endsWith("/storyboard.png"));
    if (concept) container.append(renderWholeImage(concept, "已确认的全片视觉方向", "下面每张正式分镜会沿用这个方向，并展开一个完整视频段落。"));
    const grouped = unitFiles(view);
    const orderedIds = structure?.units?.map((unit) => unit.id) ?? [...grouped.keys()];
    if (canonicalReview) { const intro = element("section", "storyboard-review-intro"); intro.append(element("p", "eyebrow", "全片分段导航"), element("h3", "", "先看完整节奏，再聚焦检查某一段"), element("p", "", "顶部一次呈现全部片段和时间范围；点击任一段，只在下方放大这一张。所有段落默认通过，只需标记需要调整的片段。")); container.append(intro); }
    const sequence = canonicalReview ? element("nav", "storyboard-sequence") : null;
    const focus = canonicalReview ? element("div", "storyboard-focus") : null;
    if (sequence) {
      sequence.setAttribute("aria-label", "全片故事板片段");
      sequence.style.setProperty("--unit-count", String(Math.min(4, orderedIds.length)));
    }
    const focusUnits = [];
    for (const [unitIndex, id] of orderedIds.entries()) {
      const files = grouped.get(id) ?? [];
      const unit = element("section", "unit-view storyboard-unit");
      unit.dataset.unitId = id;
      const definition = structure?.units?.find((candidate) => candidate.id === id);
      const timing = definition ? `${definition.startMs / 1000}–${definition.endMs / 1000} 秒` : "";
      unit.append(element("p", "eyebrow", `${unitLabel(`units/${id}`)} · ${timing}`), element("h3", "", definition?.label || "这一段的正式分镜"));
      if (definition?.visibleEvent) unit.append(element("p", "unit-story-summary", definition.visibleEvent));
      const images = files.filter((candidate) => candidate.kind === "image" && (!canonicalReview || candidate.path.endsWith("/storyboard.png")));
      for (const file of images) {
        if (file.path.endsWith("storyboard.png")) {
          if (canonicalReview) {
            const tab = element("button", `storyboard-sequence-item${unitIndex === 0 ? " active" : ""}`); tab.type = "button"; tab.dataset.unitId = id;
            const label = element("span", "storyboard-sequence-label");
            label.append(element("span", "storyboard-sequence-time", `第 ${unitIndex + 1} 段 · ${timing}`), element("strong", "", definition?.label || "正式分镜"));
            if (definition?.storyFunction) label.append(element("small", "", definition.storyFunction));
            if (definition?.visibleEvent) label.append(element("p", "", definition.visibleEvent));
            tab.append(label);
            tab.addEventListener("click", () => {
              for (const item of sequence.querySelectorAll(".storyboard-sequence-item")) item.classList.toggle("active", item === tab);
              for (const candidate of focusUnits) candidate.hidden = candidate.dataset.unitId !== id;
            });
            sequence.append(tab);
          }
          const sheet = renderWholeImage(file, `${unitLabel(file.path)}整张分镜`, "这是一张完整故事板图片，画格不会被拆分。");
          if (canonicalReview) {
            const target = view.interaction.targets.find((candidate) => candidate.path === file.path);
            if (target) { const control = storyboardReviewControl(target.path); sheet.append(control); sheet.querySelector(".whole-sheet-frame").addEventListener("click", () => control.querySelector('input[type="checkbox"]').click()); }
          }
          unit.append(sheet);
        } else unit.append(renderFile(file, view));
      }
      const storyboardPlan = files.find((file) => file.path.endsWith("/storyboard-plan.json"))?.content;
      if (canonicalReview && storyboardPlan) {
        const productionNotes = element("section", "storyboard-production-notes");
        productionNotes.append(element("p", "eyebrow", "这张故事板如何生成"), element("h4", "", "分镜提示词与参考素材"));
        const prompt = element("article", "storyboard-prompt");
        prompt.append(element("strong", "", "图片生成提示词"), element("p", "", storyboardPlan.prompt || "暂无提示词"));
        productionNotes.append(prompt);
        const referencePaths = [...new Set([...(storyboardPlan.referencePaths ?? []), ...(storyboardPlan.continuityInputs ?? [])].filter((value) => typeof value === "string"))];
        if (referencePaths.length) {
          const references = element("div", "storyboard-references");
          const assets = view.files.find((file) => file.path === "assets/index.json")?.content ?? [];
          for (const referencePath of referencePaths) {
            const reference = view.files.find((file) => file.path === referencePath);
            if (!reference) continue;
            const asset = assets.find((item) => (item.source?.path || item.source?.localPath) === referencePath);
            const item = element("article", "storyboard-reference-item");
            const role = asset?.role === "product-reference" ? "产品参考" : asset?.role === "character-reference" ? "人物参考" : referencePath.includes("concept-storyboard") ? "全片视觉方向" : "制作参考";
            const copy = element("div"); copy.append(element("span", "storyboard-reference-role", role), element("strong", "", asset?.label || fileLabel(referencePath)));
            item.append(copy);
            if (reference.url) { const open = element("a", "", "查看原素材 ↗"); open.href = reference.url; open.target = "_blank"; open.rel = "noreferrer"; item.append(open); }
            references.append(item);
          }
          if (references.childElementCount) productionNotes.append(references);
        }
        unit.append(productionNotes);
      }
      if (canonicalReview) { unit.hidden = unitIndex !== 0; focusUnits.push(unit); focus.append(unit); }
      else container.append(unit);
    }
    if (canonicalReview) container.append(sequence, focus);
  } else if (view.stage.view === "clip-plan-review") {
    for (const [id, files] of unitFiles(view)) {
      const unit = element("section", "unit-view clip-plan-unit"); unit.append(element("p", "eyebrow", unitLabel(`units/${id}`)), element("h3", "", "视频生成方案"));
      const body = element("div", "clip-plan-layout");
      const storyboard = files.find((file) => file.path.endsWith("storyboard.png")); const plan = files.find((file) => file.path.endsWith("plan.json"));
      if (storyboard) body.append(renderWholeImage(storyboard, "本段正式分镜"));
      if (plan) { const details = element("article", "plan-details"); details.append(element("h4", "", "画面运动与生成说明"), renderData(plan.content)); body.append(details); }
      unit.append(body); container.append(unit);
    }
  } else if (view.stage.view === "clip-review") {
    for (const [id, files] of unitFiles(view)) {
      const unit = element("section", "unit-view clip-review-unit"); unit.append(element("p", "eyebrow", unitLabel(`units/${id}`)), element("h3", "", "确认这一段视频"));
      const storyboard = files.find((file) => file.path.endsWith("storyboard.png")); if (storyboard) unit.append(renderWholeImage(storyboard, "本段分镜参考"));
      const video = files.find((file) => file.path.endsWith("/clip.mp4")); if (video) unit.append(renderFile(video, view));
      container.append(unit);
    }
  } else if (view.stage.view === "package-review-document") {
    const report = view.files.find((file) => file.path === "package-review.md");
    const brief = view.files.find((file) => file.path === "brief.md");
    const structure = view.files.find((file) => file.path === "structure.json")?.content;
    const hero = element("section", "package-result"); hero.append(element("p", "eyebrow", "自动检查完成"), element("h3", "", "制作内容已经可以进入成片合成")); if (report) hero.append(renderMarkdown(report.content)); container.append(hero);
    if (brief) { const summary = element("section", "package-summary"); summary.append(element("h3", "", "本片制作目标"), renderMarkdown(brief.content)); container.append(summary); }
    if (structure?.units?.length) {
      const checklist = element("section", "package-checklist"); checklist.append(element("h3", "", "各视频段落准备情况"));
      for (const [index, unit] of structure.units.entries()) { const row = element("article", "package-unit"); row.append(element("span", "package-ok", "✓"), element("div", "", `第 ${index + 1} 段`), element("strong", "", unit.label || unit.id), element("span", "", `${unit.durationMs / 1000} 秒`), element("small", "", "分镜、生成方案和视频片段已齐")); checklist.append(row); }
      container.append(checklist);
    }
  } else if (view.stage.view === "final-review") {
    const final = view.files.find((file) => file.path === "final/tvc.mp4");
    if (final) { const hero = element("section", "final-film"); hero.append(element("p", "eyebrow", "完整成片"), element("h3", "", "TVC 最终预览"), renderFile(final, view)); container.append(hero); }
    const facts = element("div", "final-facts"); for (const file of view.files.filter((candidate) => ["final/assembly.json", "final/probe.json"].includes(candidate.path))) facts.append(renderFile(file, view)); if (facts.childElementCount) container.append(facts);
  }
  if (!container.childElementCount) for (const file of view.files) container.append(renderFile(file, view));
  return container;
}

function inputFor(field) {
  let control;
  if (field.type === "textarea") control = element("textarea");
  else if (field.type === "select") {
    control = element("select"); control.append(new Option("请选择", ""));
    for (const option of field.options) control.append(new Option(option.label, option.id));
  } else { control = element("input"); control.type = "text"; }
  control.name = field.id; control.required = field.required;
  return control;
}

function interactionPanel(view, mode = "side") {
  const interaction = view.interaction;
  const embedded = mode !== "side";
  const panel = element(embedded ? "section" : "aside", embedded ? `stage-confirmation ${mode}-confirmation` : "interaction-panel");
  if (!interaction || interaction.status !== "waiting" || view.stage.readOnly) {
    panel.append(element("h3", "", view.stage.readOnly ? "这一阶段已经完成" : "现在不需要你操作"));
    panel.append(element("p", "muted", view.stage.readOnly ? "你可以查看当时确认过的制作内容。" : "新的内容准备好后，需要确认的事项会显示在这里。"));
    return panel;
  }
  const count = interaction.kind === "form" ? interaction.fields.length : ["target-review", "batch-review"].includes(interaction.kind) ? interaction.targets.length : null;
  panel.append(element("h3", "", embedded ? interaction.title : count ? `请确认 ${count} 项信息` : interaction.title));
  if (embedded && interaction.kind === "form") panel.append(element("p", "question-count", `共 ${count} 个问题，请按实际情况选择`));
  panel.append(element("p", "muted", embedded ? interaction.description || "确认后继续下一步制作。" : count ? interaction.title : interaction.description || "请确认当前制作内容后继续。"));
  if (!embedded && count && interaction.description) panel.append(element("p", "muted", interaction.description));
  const form = element("form", "review-form");
  form.dataset.interactionId = interaction.id;
  if (interaction.kind === "form") for (const field of interaction.fields) {
    if (["select", "multi-select"].includes(field.type)) {
      const group = element("fieldset", `option-group ${field.type === "multi-select" ? "multi-options" : "single-options"}`); group.append(element("legend", "", field.label));
      if (field.type === "multi-select") group.append(element("small", "question-help", "可多选"));
      const choices = element("div", "option-pills");
      for (const option of field.options) { const choice = element("label", "option-pill"); const input = element("input"); input.type = field.type === "multi-select" ? "checkbox" : "radio"; input.name = field.id; input.value = option.id; input.required = field.required && field.type === "select"; const copy = element("span"); copy.append(element("strong", "", option.label)); if (option.description) copy.append(element("small", "", option.description)); choice.append(input, copy); choices.append(choice); }
      group.append(choices);
      form.append(group);
    } else { const label = element("label"); label.append(element("span", "", field.label), inputFor(field)); form.append(label); }
  }
  if (interaction.kind === "select") for (const option of interaction.options) {
    const label = element("label", "choice"); const radio = element("input"); radio.type = "radio"; radio.name = "selection"; radio.value = option.id; radio.required = true;
    radio.checked = view.files.find((file) => file.path === "proposals/selected.json")?.content?.proposalId === option.id;
    radio.addEventListener("change", () => selectProposal(option.id));
    const copy = element("span"); copy.append(element("strong", "", option.label)); if (option.description) copy.append(element("small", "", option.description)); label.append(radio, copy); form.append(label);
  }
  if (interaction.kind === "approve") {
    const select = element("select"); select.name = "action"; select.required = true;
    select.append(new Option("批准", "approve"), new Option("要求修改", "revise"), new Option("拒绝", "reject")); form.append(select);
  }
  const canonicalStoryboardReview = view.stage.id === "storyboard-production" && interaction.kind === "batch-review" && interaction.targets.every((target) => target.path.endsWith("/storyboard.png"));
  const canonicalClipReview = view.stage.id === "unit-video-production" && interaction.kind === "batch-review" && interaction.targets.every((target) => target.path.endsWith("/clip.mp4"));
  if (["target-review", "batch-review"].includes(interaction.kind)) for (const target of interaction.targets) {
    const row = element("fieldset", "target-action"); row.dataset.path = target.path; row.append(element("legend", "", fileLabel(target.path)));
    const select = element("select"); select.name = "target-action";
    if (canonicalClipReview) select.append(new Option("确认通过", "approve"), new Option("需要重做", "redo"));
    else select.append(new Option("确认使用", "approve"), new Option("选择其他版本", "select"), new Option("需要调整", "revise"), new Option("重新制作", "redo"));
    const chosen = element("input"); chosen.type = "hidden"; chosen.name = "selected-path"; chosen.value = candidateSelections.get(target.path) || "";
    if (chosen.value && !canonicalClipReview) select.value = "select";
    const selected = element("output", "selected-candidate", chosen.value ? fileLabel(chosen.value) : "尚未选择其他版本");
    const note = element("textarea"); note.name = "target-comment"; note.placeholder = "批注（可选）"; row.append(select, chosen, note); form.append(row);
    if (!canonicalClipReview) row.insertBefore(selected, note);
    if (canonicalStoryboardReview) row.classList.add("storyboard-action-source");
  }
  if (interaction.kind === "task-control-request") {
    const select = element("select"); select.name = "taskAction";
    const labels = { cancel: "取消任务", retry: "重试", redo: "重做" };
    for (const action of interaction.allowedTaskActions) select.append(new Option(labels[action] || action, action)); form.append(select);
  }
  if (["comment", "approve", "select", "target-review", "batch-review"].includes(interaction.kind)) {
    const comment = element("textarea"); comment.name = "comment"; comment.placeholder = "补充意见（可选）"; form.append(comment);
  }
  const submit = element("button", "primary", "确认并继续"); submit.type = "submit"; form.append(submit, element("p", "form-hint", "确认后仍可以返回已完成的阶段查看内容"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); submit.disabled = true;
    try {
      const data = new FormData(form);
      const body = { selection: data.get("selection") || null, comment: data.get("comment") || "", answers: {}, actions: [] };
      if (interaction.kind === "form") for (const field of interaction.fields) {
        const answer = field.type === "multi-select" ? data.getAll(field.id) : data.get(field.id) || "";
        if (field.required && (Array.isArray(answer) ? !answer.length : !answer)) throw new Error(`请完成“${field.label}”`);
        body.answers[field.id] = answer;
      }
      if (interaction.kind === "approve") body.action = data.get("action");
      if (["target-review", "batch-review"].includes(interaction.kind)) body.actions = [...form.querySelectorAll(".target-action")].map((row) => {
        const action = row.querySelector('[name="target-action"]').value;
        const selectedPath = row.querySelector('[name="selected-path"]').value;
        if (action === "select" && !selectedPath) throw new Error(`请先为${fileLabel(row.dataset.path)}选择一个版本`);
        if ((action === "revise" || (canonicalClipReview && action === "redo")) && !row.querySelector('[name="target-comment"]').value.trim()) throw new Error(`请填写${fileLabel(row.dataset.path)}的修改意见`);
        return { path: row.dataset.path, action, selectedPath: action === "select" ? selectedPath : undefined, comment: row.querySelector('[name="target-comment"]').value };
      });
      if (interaction.kind === "task-control-request") body.taskAction = data.get("taskAction");
      await getJson(`/api/sessions/${encodeURIComponent(sessionId)}/interactions/${encodeURIComponent(interaction.id)}/respond`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      lastInteraction = interaction.id; await refresh();
    } catch (error) { alert(error.message); submit.disabled = false; }
  });
  panel.append(form);
  return panel;
}

function render(view) {
  if (view.interaction?.status === "waiting" && view.interaction.id !== selectionInteractionId) { selectionInteractionId = view.interaction.id; candidateSelections.clear(); }
  document.title = `${view.production.title} · ${stageLabel(view.stage)}`;
  const embeddedClarification = view.stage.id === "clarification" && !view.stage.readOnly && view.interaction?.kind === "form" && view.interaction.status === "waiting";
  const embeddedInteraction = !view.stage.readOnly && view.interaction?.status === "waiting";
  const shell = element("div", `shell no-review-panel${railOpen ? " rail-open" : ""}${embeddedInteraction ? " embedded-review" : ""}`);
  const activeIndex = view.stages.findIndex((stage) => stage.status === "active");
  const currentIndex = activeIndex >= 0 ? activeIndex : view.stages.length - 1;
  const top = element("header", "topbar"); const brand = element("div", "brand"); brand.append(element("h1", "", view.production.title), element("span", "project-progress", `正在${stageLabel(view.stages[currentIndex])} · 全流程共 ${view.stages.length} 步`));
  const flowToggle = element("button", "flow-toggle", `制作流程 ${currentIndex + 1}/${view.stages.length}`); flowToggle.type = "button"; flowToggle.setAttribute("aria-expanded", String(railOpen)); flowToggle.addEventListener("click", () => { railOpen = !railOpen; shell.classList.toggle("rail-open", railOpen); flowToggle.setAttribute("aria-expanded", String(railOpen)); });
  top.append(flowToggle, brand, element("div", "connection", "● 同步正常"));
  const rail = element("nav", "rail"); rail.setAttribute("aria-label", "制作流程"); const list = element("ol", "stages");
  for (const [index, stage] of view.stages.entries()) { const item = element("li", `stage ${stage.status}`); const button = element("button", "stage-link"); button.type = "button"; button.disabled = stage.status === "pending" || stage.id === view.stage.id; button.append(element("span", "stage-name", stageLabel(stage)), element("small", "stage-status", stage.status === "complete" ? "已完成" : stage.status === "active" ? "正在进行" : "稍后开始")); button.addEventListener("click", () => { selectedStage = stage.id; railOpen = false; refresh(); }); item.append(element("span", "stage-dot", stage.status === "complete" ? "✓" : String(index + 1)), button); list.append(item); }
  rail.append(list);
  const workspace = element("main", "workspace"); workspace.append(element("p", "step-context", view.stage.readOnly ? "已完成的制作内容" : `第 ${Math.max(0, currentIndex) + 1} 步`), element("h2", "", stageLabel(view.stage)), element("p", "lede", view.signal.notice || stageIntros[view.stage.id] || view.stage.goal));
  if (view.tasks?.length) { const board = element("section", "task-board"); board.append(element("h3", "", "制作进度")); for (const task of view.tasks) { const attempt = task.attempts.find((value) => value.id === task.currentAttemptId); board.append(element("div", "task-row", `${fileLabel(task.targetPath)} · ${taskStatusLabels[attempt?.status] || "正在处理"}`)); } workspace.append(board); }
  if (embeddedClarification) workspace.append(interactionPanel(view, "clarification"));
  workspace.append(renderStageFiles(view));
  if (embeddedInteraction && !embeddedClarification) workspace.append(interactionPanel(view, view.stage.id === "proposal" ? "proposal" : "review"));
  shell.append(top, rail, workspace); app.replaceChildren(shell);
}

async function refresh() {
  if (!sessionId) throw new Error("URL 缺少 session 参数");
  const summary = await getJson(`/api/sessions/${encodeURIComponent(sessionId)}`);
  const visible = summary.pipeline.stages.filter((stage) => summary.state.stages[stage.id] !== "pending").map((stage) => stage.id);
  if (!selectedStage || !visible.includes(selectedStage)) selectedStage = summary.state.currentStage;
  const view = await getJson(`/api/sessions/${encodeURIComponent(sessionId)}/views/${encodeURIComponent(selectedStage)}`);
  view.stages = summary.pipeline.stages.map((stage) => ({ ...stage, status: summary.state.stages[stage.id] }));
  if (view.interaction?.status === "waiting" && view.interaction.id === app.querySelector(".review-form")?.dataset.interactionId) return;
  render(view);
}

refresh().catch((error) => app.replaceChildren(element("section", "empty-state", error.message)));
const events = sessionId && new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
for (const event of ["ready", "changed"]) events?.addEventListener(event, () => refresh().catch(() => {}));
setInterval(() => refresh().catch(() => {}), 30_000);
