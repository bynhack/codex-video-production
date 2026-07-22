import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PreviewController } from "../src/preview-controller.mjs";

const exec = promisify(execFile);
const stages = ["clarification", "research", "proposal", "storyboard-production", "unit-video-production", "package-review", "assembly"];
const demoStage = process.argv[2] || "clarification";
if (!stages.includes(demoStage)) throw new Error(`Unsupported demo Stage: ${demoStage}`);

const demoRoot = path.resolve(".demo-output");
await mkdir(demoRoot, { recursive: true });
const outputDir = await mkdtemp(path.join(demoRoot, "file-tree-"));
const controller = new PreviewController();
const started = await controller.start({ title: "30 秒新品 TVC", outputDir });
const writeJson = (relativePath, value) => writeFile(path.join(outputDir, relativePath), `${JSON.stringify(value, null, 2)}\n`);
const storyboardSource = process.env.DEMO_STORYBOARD_PATH || process.argv[3];

await mkdir(path.join(outputDir, "assets"), { recursive: true });
await writeFile(path.join(outputDir, "request.md"), "为网易严选梅里雪峰茶车载出风口香氛制作一支 30 秒高质感 TVC，面向年轻消费者，突出温感变色、高级茶香与净化能力。\n");
await writeJson("assets/index.json", []);
await writeJson("clarification.json", { questions: [{ id: "ratio", label: "主要发布画幅" }, { id: "objective", label: "最重要目标" }, { id: "tone", label: "重点感受" }] });
await writeFile(path.join(outputDir, "brief.md"), "---\nproduct: 网易严选梅里雪峰茶车载出风口香氛\nobjective: 新品认知与卖点记忆\naudience: 关注质感与车内体验的年轻用户\nplatform: 品牌官网与社交媒体\ntotalDurationMs: 30000\naspectRatio: 16:9\nlanguage: zh-CN\naudioPolicy: native\nsourceAssetIds: []\n---\n\n# 制作 Brief\n\n以温感变色作为核心视觉事件，将茶香扩散和车内空气净化转译成可感知的电影化变化。全片高级、克制，但必须持续发生状态变化。\n");
await writeFile(path.join(outputDir, "research.md"), "# 调研结论\n\n年轻车主购买车载香氛时，同时在意气味品质、外观质感和净化效果。竞品多用静物棚拍与香调说明，画面精致但缺少可复述的事件。\n\n## 创意机会\n\n- 用温度触发颜色变化，建立产品独有的视觉记忆。\n- 把茶香表现成从局部向全车扩散的能量流，而不是参数字幕。\n- 让产品成为车内状态改变的起点，避免静态陈列。\n\n## 风险\n\n净化数据必须保持客户给定口径；视觉化扩散不能被理解成未经证明的医疗效果。\n");
await writeJson("research-sources.json", [
  { id: "S1", title: "客户产品资料与卖点说明", url: "https://you.163.com/", evidenceClass: "client" },
  { id: "S2", title: "车载香氛品类传播观察", url: "https://example.com/category", evidenceClass: "published" }
]);

await mkdir(path.join(outputDir, "proposals"), { recursive: true });
const proposals = [
  { id: "A", title: "雪峰醒茶", summary: "车内热量唤醒雪峰茶香，颜色变化触发一次贯穿全片的感官旅程。", path: "proposals/a.md", tradeoffs: "视觉记忆最强，对光影与变色连续性要求高。" },
  { id: "B", title: "气味有形", summary: "把不可见的茶香变成穿越车厢的能量流，逐层清理压迫与异味。", path: "proposals/b.md", tradeoffs: "动态冲击最强，需要控制特效不过度科技化。" },
  { id: "C", title: "一程静下来", summary: "从拥挤焦躁到安静呼吸，以人物状态变化证明香氛带来的体验。", path: "proposals/c.md", tradeoffs: "情绪共鸣最好，产品功能爆点相对克制。" }
];
for (const proposal of proposals) {
  proposal.conceptRequestPath = `proposals/${proposal.id.toLowerCase()}-concept-request.json`;
  proposal.conceptStoryboardPath = `proposals/${proposal.id.toLowerCase()}-concept-storyboard.png`;
}
await writeJson("proposals/index.json", { proposals });
await writeFile(path.join(outputDir, "proposals/a.md"), "## 核心创意\n\n车内温度像一只看不见的手，唤醒来自梅里雪峰的茶香。产品颜色发生变化，茶叶、冰蓝光束与空气流动依次被激活，让观众看到一次完整的视嗅觉转变。\n\n## 30 秒叙事\n\n- **0–4 秒：** 闷热、压迫的车内，产品仍处于冷色状态。\n- **4–15 秒：** 出风口启动，颜色变化，茶叶与香气能量被唤醒。\n- **15–25 秒：** 能量穿越车厢，环境从浑浊转为通透，人物状态松弛。\n- **25–30 秒：** 能量收束回产品，温感变色与品牌完成记忆闭环。\n\n## 视觉与声音\n\n低饱和暗场、冰蓝与白光、手持推进和侵略性微距。声音从机械低频逐渐转为清晰风声与茶叶摩擦。\n\n## 产品角色\n\n产品始终是变化的触发器，而不是被动出现的静物。温感变色、茶香层次和净化能力分别通过颜色、能量和空间状态变化被感知。\n\n## 风险与控制\n\n避免把香气画成廉价粒子特效；净化效果以环境观感变化表达，不追加未经证实的数据。\n");
await writeFile(path.join(outputDir, "proposals/b.md"), "## 核心创意\n\n一缕茶香像具有方向的能量，在车内连接、扩散和重组。每次镜头运动都推动气味跨越一个空间边界。\n\n## 30 秒叙事\n\n从局部微距出发，穿过出风口与座舱，在一次全局扩散后回到产品。\n\n## 视觉与声音\n\n高速穿越、环绕运动、湿地反射与强烈负空间。\n\n## 风险与控制\n\n避免科技 UI 与说明式参数展示。\n");
await writeFile(path.join(outputDir, "proposals/c.md"), "## 核心创意\n\n驾驶者从城市噪声中进入一段安静旅程，香氛的变化与呼吸节奏同步。\n\n## 30 秒叙事\n\n焦躁进入、安装触发、呼吸松弛、雪峰意象与产品收束。\n\n## 视觉与声音\n\n人物侧影、长焦压缩、克制环境声和留白。\n\n## 风险与控制\n\n情绪成立依赖人物一致性，产品爆点需要额外强化。\n");
for (const proposal of proposals) {
  await writeJson(proposal.conceptRequestPath, { proposalId: proposal.id, proposalPath: proposal.path, prompt: `将“${proposal.title}”完整文字提案视觉化为一张 16:9 全片故事板表格，动态格数，黑白电影铅笔绘制并保留彩色运动标注。`, referencePaths: [] });
  if (storyboardSource) await copyFile(storyboardSource, path.join(outputDir, proposal.conceptStoryboardPath));
}
await writeJson("proposals/selected.json", { proposalId: "A", proposalPath: "proposals/a.md", conceptRequestPath: "proposals/a-concept-request.json", conceptStoryboardPath: "proposals/a-concept-storyboard.png", decisionId: "demo-proposal-decision", acceptedComment: "强化温感变色的第一次视觉爆点。" });

const units = [
  { id: "u1", order: 1, startMs: 0, endMs: 15000, durationMs: 15000, label: "温度唤醒茶香", storyFunction: "建立压迫状态并让产品触发第一次变化", visibleEvent: "出风口启动，产品由冷色变为暖色，茶叶与冰蓝能量从局部飞出并扩散", startState: "闷热、低能见度、人物紧绷", endState: "茶香被唤醒，能量开始覆盖车厢", continuityMode: "match-cut", storyboardPanelCount: 10 },
  { id: "u2", order: 2, startMs: 15000, endMs: 30000, durationMs: 15000, label: "全车净化收束", storyFunction: "完成全局扩散并回到产品与品牌", visibleEvent: "能量穿越全车，浑浊空气被推开，人物松弛，最后回旋收束至产品", startState: "能量位于车厢前部", endState: "空间通透、产品定格、品牌记忆完成", continuityMode: "reference-only", storyboardPanelCount: 10 }
];
await writeJson("structure.json", { totalDurationMs: 30000, aspectRatio: "16:9", rationale: "两个 15 秒单元分别完成触发与收束，叙事边界与视频模型时长一致。", units });
await mkdir(path.join(outputDir, "continuity"), { recursive: true });
await writeJson("continuity/index.json", { references: [], note: "当前 Demo 使用全片概念故事板与每段正式分镜维持产品和场景一致性。" });

for (const unit of units) {
  const root = path.join(outputDir, "units", unit.id); await mkdir(path.join(root, "storyboard-candidates"), { recursive: true }); await mkdir(path.join(root, "clip-candidates"), { recursive: true });
  await writeJson(`units/${unit.id}/storyboard-plan.json`, { unitId: unit.id, label: unit.label, durationMs: unit.durationMs, aspectRatio: "16:9", panelCount: unit.storyboardPanelCount, prompt: `为“${unit.label}”生成一张完整黑白电影铅笔故事板，所有面板按时间顺序绘制在同一张图内。`, referencePaths: ["proposals/a-concept-storyboard.png"], continuityInputs: [], blockingIssues: [] });
  if (storyboardSource) { await copyFile(storyboardSource, path.join(root, "storyboard-candidates", "v1.png")); await copyFile(storyboardSource, path.join(root, "storyboard.png")); }
  await writeJson(`units/${unit.id}/plan.json`, { unitId: unit.id, durationMs: unit.durationMs, ratio: "16:9", quality: "1080p", prompt: `[图片1] 作为完整分镜参考。${unit.visibleEvent}。镜头持续推进、穿越与环绕，保持产品几何和光线方向一致。`, negativePrompt: "静态展示、说明式画面、UI、HUD、错误文字", referenceImages: [`units/${unit.id}/storyboard.png`], referenceVideos: [], referenceAudios: [], executable: true, blockingIssues: [] });
}

if (["unit-video-production", "package-review", "assembly"].includes(demoStage)) {
  for (const [index, unit] of units.entries()) {
    const candidate = path.join(outputDir, "units", unit.id, "clip-candidates", "v1.mp4");
    await exec("ffmpeg", ["-y", "-f", "lavfi", "-i", `color=c=${index ? "1f3442" : "5d3028"}:s=960x540:r=24`, "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-loglevel", "error", candidate]);
    await copyFile(candidate, path.join(outputDir, "units", unit.id, "clip.mp4"));
  }
}
await writeFile(path.join(outputDir, "package-review.md"), "---\npass: true\nissues: []\n---\n\n# 制作包检查结论\n\n两个视频段落的时长、顺序、分镜、生成方案和正式片段映射完整，核心卖点与品牌收束均已覆盖，可以进入成片合成。\n");
if (demoStage === "assembly") {
  await mkdir(path.join(outputDir, "final"), { recursive: true }); await copyFile(path.join(outputDir, "units/u1/clip.mp4"), path.join(outputDir, "final/tvc.mp4"));
  await writeJson("final/assembly.json", { orderedClipPaths: ["units/u1/clip.mp4", "units/u2/clip.mp4"], durationMs: 30000, ratio: "16:9", deliveryFormat: "mp4", mandatoryElements: ["温感变色", "高级茶香", "品牌收束"], audioSources: ["视频模型原声"] });
  await writeJson("final/probe.json", { durationMs: 30000, width: 1920, height: 1080, frameRate: 24, videoCodec: "h264", container: "mp4", hasAudio: false });
}

await exec("git", ["add", "-A"], { cwd: outputDir }); await exec("git", ["commit", "-m", "complete UI demo fixture", "--quiet"], { cwd: outputDir });
const record = controller.store.record(started.sessionId); const at = stages.indexOf(demoStage); const now = new Date().toISOString();
await controller.store.writeState(record, { ...record.state, stateRevision: record.state.stateRevision + 1, currentStage: demoStage, stages: Object.fromEntries(stages.map((stage, index) => [stage, index < at ? "complete" : index === at ? "active" : "pending"])), interaction: null, updatedAt: now });

const interactions = {
  clarification: { kind: "form", title: "确认关键制作条件", description: "只确认会改变创意和交付的信息。", targetPaths: ["clarification.json"], fields: [
    { id: "ratio", label: "主要发布画幅", type: "select", options: [{ id: "16:9", label: "横屏 16:9" }, { id: "9:16", label: "竖屏 9:16" }] },
    { id: "objective", label: "最重要目标", type: "select", options: [{ id: "awareness", label: "新品认知" }, { id: "feature", label: "突出功能" }, { id: "conversion", label: "促进购买" }] },
    { id: "tone", label: "希望重点体现哪些感受？", type: "multi-select", options: [{ id: "premium", label: "高级质感" }, { id: "memorable", label: "容易记住" }, { id: "dynamic", label: "动态冲击" }] }
  ] },
  proposal: { kind: "select", title: "选择创意方向", description: "每个方向都已经包含完整文字提案和全片故事板，请选择最适合继续制作的一版。", targetPaths: ["proposals/index.json", ...proposals.flatMap(({ path, conceptRequestPath, conceptStoryboardPath }) => [path, conceptRequestPath, conceptStoryboardPath])], options: proposals.map(({ id, title, summary }) => ({ id, label: title, description: summary })) },
  "storyboard-production": { kind: "batch-review", title: "确认连续分镜", description: "所有段落默认通过；只勾选需要修改的段落并填写意见。", targetPaths: units.map((unit) => `units/${unit.id}/storyboard.png`) },
  "unit-video-production": { kind: "batch-review", title: "确认每段生成的视频", description: "满意的片段直接通过；不满意的片段填写意见并要求重做。", targetPaths: units.map((unit) => `units/${unit.id}/clip.mp4`) },
  assembly: { kind: "approve", title: "确认最终成片", description: "请完整播放成片，并确认画面、节奏和品牌收束。", targetPaths: ["final/tvc.mp4", "final/probe.json"] }
};
if (interactions[demoStage]) await controller.requestInteraction({ sessionId: started.sessionId, interaction: { stageId: demoStage, ...interactions[demoStage] } });

process.stdout.write(`Demo: ${started.url}\nOutput: ${outputDir}\n`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await controller.close(); process.exit(0); });
