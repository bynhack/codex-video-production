# 文件树 Production 与 Stage 视图库设计

状态：已确认并冻结。实现必须以本文为准，不在实现阶段重新扩大设计。

## 0. 冻结问题索引

| 必答问题 | 冻结结论 |
| --- | --- |
| 各 Stage 文件契约 | 第 5 节：七个用户 Stage 逐项列出路径、格式、字段和完成检查；内部结构与提示词文件合并在媒体 Stage 中 |
| Decision 与 commit | 第 6 节：Store 在发起交互时盖章；当前对象变化即 stale |
| 完整检查点 | 第 5、8 节：Stage 逐项检查，`complete` 另做终态检查 |
| git 不可用 | 第 9 节：硬阻塞，不提供降级模式 |
| Stage 视图库 | 第 10 节：七个 revision 4 主视图、旧 Production 只读视图、一个 fallback 和正交任务面板 |
| 复合视图规则 | 第 10 节：主视图 + 可选进度板 + Interaction panel |
| 并发与原子性 | 第 13 节：单 Session、独占 lease、互斥 append、原子 state 与固定 commit 时序 |

## 1. 设计目标与边界

一个绝对 `outputDir` 就是一条 Production。Host Agent（当前为 Codex）独占推理、Stage 推进、文件写入、媒体调用、批量轮询、重试判断和 git commit；Bridge 只管理轻量状态、交互证据、媒体任务账本、检查点校验与 Preview 文件读取。

设计只保留 TVC Pipeline。音频只来自视频模型原生音轨与用户提供文件。图片和视频生成只调用 `$lovart-unofficial`；Assembly 继续由项目内 ffmpeg/ffprobe 脚本确定性执行。

Bridge 不保存 Brief、Research、Proposal、Structure、Prompt 或媒体文件的领域副本，不把文件内容翻译成通用展示 payload，也不运行 Pipeline、Provider、git 修订策略或 Agent Loop。

## 2. Production 文件树

```text
outputDir/
  .git/
  .gitignore
  state.json
  decisions.jsonl
  tasks.jsonl
  request.md
  clarification.json
  brief.md
  research.md
  assets/
    index.json
    ...source files
  proposals/
    index.json
    proposal_01.md
    proposal_01-concept-request.json
    proposal_01-concept-storyboard.png
    proposal_02.md
    proposal_02-concept-request.json
    proposal_02-concept-storyboard.png
    proposal_03.md
    proposal_03-concept-request.json
    proposal_03-concept-storyboard.png
    proposal_04.md          # 可选
    proposal_04-concept-request.json      # 可选
    proposal_04-concept-storyboard.png    # 可选
    selected.json
  structure.json
  continuity/
    index.json
    ...shared character/product/scene references
  units/
    unit_01/
      storyboard-plan.json
      storyboard-candidates/
        candidate_01.png
        ...
      storyboard.png
      plan.json
      clip-candidates/
        candidate_01.mp4
        ...
      clip.mp4
      tail-frame.png        # 只有下游声明 tail-frame 时需要
    unit_02/
      ...
  package-review.md
  final/
    assembly.json
    probe.json
    tvc.mp4
```

历史只存在于 git commit。规范路径保存当前工作结果；修订直接重写规范文件并创建新 commit。禁止在文件名、JSON 或文档中维护 revision 链、supersedes 指针、内容 digest 或下游失效矩阵。

## 3. 通用文件规则

- 所有路径相对 `outputDir`，使用 `/`，禁止 `..`、绝对路径和 symlink 逃逸。
- JSON 使用 UTF-8、严格 JSON 和稳定 ID；Markdown 使用 UTF-8，并允许 YAML front matter。解析 YAML 复用项目已有 `yaml` 依赖。
- Host Agent 写 JSON、账本外的结构化文件和媒体下载时先写同目录临时文件，再原子 rename 到规范路径。Preview 只在 `publish` 信号后刷新。
- 每次 Review 前，目标文件必须已被 git 跟踪、Host-owned 文件无未提交改动且存在于当前 `HEAD`。`state.json`、`decisions.jsonl`、`tasks.jsonl` 的合法 pending checkpoint 不计入该判定，由第 13 节单独校验。
- `state.json`、`decisions.jsonl`、`tasks.jsonl` 只能由 MCP Store 写；其他文件只能由 Host Agent 写。
- Store 计算 commit hash、git object ID 和媒体请求哈希；Host Agent 不提交任何哈希值。
- `.production.lock` 与同目录原子写临时文件必须由 `.gitignore` 排除；它们不参与工作树 clean 判定，也不进入历史。
- 唯一初始化例外：`start` 可以创建固定内容的 `.gitignore`、空账本和首个 `state.json`；初始化完成后仍由 Host Agent 创建首个 commit，Bridge 不代为提交。

## 4. `state.json`

`state.json` 是唯一状态镜像。常态只保存身份、Pipeline 引用、七个 revision 4 状态值和门禁，目标保持在约 1 KB；等待交互时会临时增加当前 Interaction，但不复制 Stage 正文：

```json
{
  "version": 1,
  "stateRevision": 12,
  "identity": {
    "productionId": "string",
    "title": "string",
    "createdAt": "ISO-8601"
  },
  "pipeline": {
    "id": "tvc",
    "revision": 4,
    "manifestRef": "pipelines/tvc/revisions/4/pipeline.yaml"
  },
  "status": "active | paused | completed",
  "currentStage": "stage-id",
  "stages": {
    "clarification": "active",
    "research": "pending"
  },
  "executionGate": {
    "state": "open"
  },
  "interaction": {
    "id": "interaction-id",
    "stageId": "proposal",
    "kind": "select",
    "status": "pending | submitted",
    "targets": [
      { "path": "proposals/proposal_01.md", "commit": "Store-computed", "objectId": "Store-computed" }
    ],
    "result": null
  },
  "updatedAt": "ISO-8601"
}
```

Stage label、view、promptRef、promptVersion、requires/produces 和 review 全部按 `pipeline.manifestRef` 即时读取，不在 state 中重复保存。

暂停门禁使用 `{state:"paused", atStageId, reasonCode, requiredCapability, pausedAt}`。显式恢复只能把同一门禁改为 `open`；Store 不决定何时恢复。

`interaction` 只保存当前一个待处理或刚提交的轻量交互，以及 Store 盖章的 target；问题正文、候选内容和媒体都仍从 Stage 文件读取。浏览器提交时 Store 原子更新该字段，因此在 `append_decision` 前进程退出也不会丢失用户回答。Decision 成功追加后清空该字段；历史交互只由 `decisions.jsonl` 保留。

`update_state` 必须携带 `expectedStateRevision`。Store 在单 Production 写锁内读取当前状态、检查 git/账本/Stage 检查点、递增 revision、原子 rename。过期 revision 直接拒绝，不合并调用方状态。

## 5. Stage 文件契约

本节“完成检查”是该 Stage 的完整领域验收，Host Agent 必须按 Stage Prompt 执行并在提交前自检。Store 不把这些字段全部重建成领域 Schema；它只执行第 8 节列出的文件、最小索引、Review 证据和终态检查。

### 5.1 Clarification

必需文件：

- `request.md`：用户原始要求原文；只追加附件说明，不改写原意。
- `assets/index.json`：数组；每项含 `id`, `kind`, `label`, `source`, `role?`, `note?`。`source` 是 `{type:"file", path}` 或 `{type:"url", url, localPath?}`；下载后的 URL 素材必须补 `localPath`。产品参考图统一标记为 `kind: image, role: product-reference`，以便后续 Storyboard Plan、媒体任务和 Preview 可靠引用。无素材时为空数组。
- `clarification.json`：`questions[]`；每项含 `id`, `question`, `reason`, `required`, `type: select | multi-select | text`, `options[]`。
- `brief.md`：front matter 必含 `product`, `objective`, `audience`, `platform`, `totalDurationMs`, `aspectRatio`, `language`, `audioPolicy`, `sourceAssetIds[]`；正文写 core message、强制元素、限制、假设和风险。

完成检查：四个文件存在并已提交；`totalDurationMs` 为正整数，`audioPolicy` 固定为 `model-native-and-user-supplied-only`；required form Decision 绑定当前 `clarification.json` 且 outcome 为 `submitted`。

### 5.2 Research

必需文件：`research.md`。front matter 必含 `sources[]`，每个 Source 含 `id`, `title`, `url`, `accessedAt`, `evidenceClass`。正文必须分开写产品事实、客户声明、推断、受众/品类/竞品发现、创意含义和风险；重要 Finding 用 Source ID 引用来源。

完成检查：文件已提交；至少一个真实 Source；正文中出现的 Source ID 均在 front matter 声明。无例行 Review。

### 5.3 Proposal

必需文件：

- `proposals/index.json`：`proposals[]` 恰有 3–4 项，每项含 `id`, `path`, `title`, `summary`, `recommended`, `conceptRequestPath`, `conceptStoryboardPath`。
- 每个 `proposal_XX.md`：front matter 含 `id`, `title`；正文固定包含 Big Idea、Opening Hook、Narrative Arc、Visual Strategy、Mandatory Elements、Source Asset Use、Why It Works、Feasibility、Risks、Research Refs。
- 每个 `<id>-concept-request.json`：该方向的概念故事板图片请求，至少含 `proposalId`, `proposalPath`, `frameAspectRatio`, `panelCount`, `grid`, `sheetAspectRatio`, `layoutRationale`, `prompt`, `referencePaths[]`；每个镜头格严格使用 Brief 画幅，Host 在镜头数确定后根据镜头格比例、行列利用率和标注空间推导整图比例。文字提案是语义权威，该文件只是可恢复的视觉化请求。
- 每个 `<id>-concept-storyboard.png`：一次图片调用生成的全片概念故事板整图；用于普通用户理解该文字提案，不是 Unit 视频生成的正式参考图。
- `proposals/selected.json`：`proposalId`, `proposalPath`, `conceptRequestPath`, `conceptStoryboardPath`, `decisionId`。

提案只有一次用户动作。Host 先为全部 3–4 个方向生成各自概念图，再请求一个 select。完成检查：index 与每组文字/请求/图片一一对应；ID 和路径唯一；每张图都有成功图片 Task，Task 请求依赖匹配的 Proposal Markdown 当前字节；select Decision 同时绑定当前 index、全部 Proposal Markdown、全部概念请求和全部概念整图，selection 恰为一个 index 内 ID；`selected.json` 与该 Decision 一致并已提交。任何 Proposal Markdown 变化都会使对应概念图任务和整体 Decision 失效，必须更新该图并重新确认。

### 5.4 Storyboard Production（含内部 Structure、Continuity 与 Plan）

必需文件：`structure.json`：

```text
totalDurationMs, aspectRatio, rationale, continuitySummary
units[]: id, order, label, startMs, endMs, durationMs,
         storyFunction, sceneContext, visibleEvent,
         startState, endState, stateChange,
         continuityMode, requiredAssetPaths[], storyboardPanelCount
```

Structure 是本 Stage 的内部文件。Unit 表示一次 Provider 视频生成，不表示一个镜头、卖点、场景标签或故事板面板。Host 必须最小化 Unit 数并优先使用 15000ms 容量：30000ms 通常为两个约 15000ms Unit，60000ms 通常为四个；额外或更短 Unit 必须在 `rationale` 中记录具体生成边界，叙事变化本身不足以成为拆分理由。完成检查：Unit order 为 `1..n`；区间从 0 开始、连续、无重叠；`durationMs = endMs - startMs`；每 Unit `0 < durationMs <= 15000`；总和精确等于 Brief；比例等于 Brief。它不单独请求用户批准。

共享人物、产品或场景一致性记录在 `continuity/index.json` 的 `references[]`；即使无需额外参考图，也提交空数组。每条引用至少包含稳定 ID、kind、真实 path、source paths 和 `usedByUnitIds`，不得引用未来文件。

每个当前 Unit 必需 `units/<unit>/storyboard-plan.json`：`unitId`, `durationMs`, `frameAspectRatio`, `panelCount`, `grid`, `sheetAspectRatio`, `layoutRationale`, `prompt`, `referencePaths[]`, `continuityInputs[]`, `blockingIssues[]`。`frameAspectRatio` 必须等于 Brief/Structure 成片画幅并用于每一个镜头格的实际可见区域；`grid` 与 `sheetAspectRatio` 在 `panelCount` 确定后按镜头格比例、空格利用率和标注可读性推导，整张 Sheet 不要求等于成片画幅。`referencePaths[]` 必须同时追溯已选文字提案、该方向的全片概念故事板和适用的用户素材；存在 `role: product-reference` 的产品图时，每个 Unit 至少包含一张该类本地图片，即使该段暂时不露出产品也用于身份连续性，未提供时必须显式记录缺失事实。`panelCount` 由 Unit 内状态变化与叙事密度决定，不是固定镜头数；这些面板表示同一个 Unit 内的多个镜头与时间节拍，不能据此一对一增加 Unit。

Storyboard Plan 同样是本 Stage 的内部文件。完成检查：当前 `structure.json` 的每个 Unit 恰有一个文件；时长、比例、panel 数一致；所有引用路径存在且受 outputDir containment 保护；无 blocker 才能进入图片生成。它不单独请求用户批准。

revision 4 的默认 Storyboard 视觉契约是黑白粗铅笔手绘、最小细节、快速姿态能量和清晰轮廓，不得以写实摄影或成片级渲染替代。绘图保持黑白，只有标注系统使用颜色：红色物体/身体运动、蓝色摄影机运动、绿色构图、橙色灯光、紫色声音/卖点情绪、黑色中文台词。每个面板必须表现正在发生的状态、物理/能量变化和镜头参与；面板数量随叙事密度变化，不以 12 或其他固定数字写死。

每个 Unit 必需：

- `storyboard-candidates/*.png`：一个或多个真实候选；
- `storyboard.png`：用户选中的规范文件；每个候选和规范文件都是一次调用生成的一张完整故事板大图，面板、时间、动作/运镜/灯光/声音/台词标注已画在图内，Preview 不拆分面板；
- `tasks.jsonl` 中存在成功图片任务/Attempt，结果路径覆盖被选候选；revision 4 图片任务的 `requestRef` 必须是当前 Unit Storyboard Plan，dependencies 覆盖 Plan 的全部 `referencePaths`，从而证明产品图等素材确实随本次可恢复请求受控；若规范分镜直接来自用户素材，则以已提交的 `assets/index.json` 条目和源文件作为来源证据，不伪造 Provider 任务。

用户只审阅实际 Storyboard。Host 在 Review 前把当前候选原字节复制到规范 `storyboard.png`，Interaction 按 Structure 顺序直接 target 每个规范路径。Preview 默认所有目标为 approve；用户只标记需修改的整图并填写意见。完成检查：每个当前 Unit 都有可读取的 `storyboard.png`；batch/target review 对全部规范路径有当前 `approve` 证据；规范图与某个成功候选或导入源 object ID 相同；任务来源可追溯。完成后下一 Stage paused，要求 `tvc.unit-video-production@1`。revision 3 Production 继续按候选目录 + selectedPath 的旧证据恢复，不迁移。

### 5.5 Unit Video Production（含内部 Video Prompt Plan）

每个 Unit 必需 `units/<unit>/plan.json`：

```text
unitId, durationMs, ratio, quality, prompt, negativePrompt?,
referenceImages[], referenceVideos[], referenceAudios[],
executable, blockingIssues[]
```

路径按 Provider 调用顺序排列；Storyboard 必须是第一张图片引用。Prompt 的 `[图片N]`、`[视频N]`、`[音频N]` 与数组一一对应。音频引用只能指向用户素材。

Plan 是本 Stage 的内部执行文件，不单独请求用户批准。每 Unit 恰有一个 Plan；时长/比例匹配 Structure；引用存在；可执行状态与 blockers 一致。尚未得到前序尾帧时 Plan 保持 `executable: false`；真实尾帧写入后再更新 Plan。创建付费任务时 `requestRef` 指向当前 Plan，并在 `dependencyPaths` 中包含当前 `storyboard.png`；Store 必须找到该规范 Storyboard 路径的当前批准证据。

Plan 必须把 Storyboard 的全部内部镜头/节拍转写为一个带时间点的连续视频过程，明确开场即发生的动作、镜头/事件变化节奏和精确结尾状态。不得把多面板 Storyboard 简化成一次慢推镜，也不得以静态定格、重复动作或延长尾帧填满时长。常规高能产品 TVC 的多数镜头约 0.8–3 秒；更长镜头只在已选 Proposal 和已批准 Storyboard 明确要求时成立。

每个 Unit 必需：

- `clip-candidates/*.mp4`；
- `clip.mp4`：选中规范文件；
- 后续 Unit 使用 tail-frame 时还需 `tail-frame.png`；
- `tasks.jsonl` 中存在成功视频任务及结果来源。

默认全部当前可执行 Unit 先提交，统一批量轮询，候选齐备后一次 batch-review。只有 tail-frame 依赖或 correction 可迫使局部串行。

用户只审阅每个 Unit 的一个当前视频。revision 4 完成检查：每个 `clip.mp4` 可读取且具有当前 approve 证据；其成功 Task 的 requestRef 指向当前 `plan.json`，依赖盖章包含获批 Storyboard；规范文件与成功候选 object ID 相同；tail-frame 依赖引用真实前序文件。revisions 1–3 保留候选目录与 selectedPath 的旧检查方式。

### 5.6 Package Review

必需文件：`package-review.md`。front matter 含 `pass: boolean`, `issues[]`；每个 issue 含 `severity`, `paths[]`, `summary`, `suggestedFix`。正文报告 Brief → Proposal → Structure → Storyboard → Plan → Clip 的映射、时长、比例、引用和来源。

完成检查：文件已提交；Store 在检查时以当前 `HEAD` 为被审计版本，不接受 Host 提交的 commit/hash；`pass: true` 且无 high issue；全部当前 Unit 路径被覆盖。无例行 Review。

### 5.7 Assembly

必需文件：

- `final/assembly.json`：`orderedClipPaths[]`, `durationMs`, `ratio`, `deliveryFormat`, `mandatoryElements[]`, `audioSources[]`；
- `final/tvc.mp4`；
- `final/probe.json`：`durationMs`, `width`, `height`, `videoCodec`, `container`, `hasAudio`；
- 成功的 assembly Task 事件。

完成检查：Clip 顺序等于 Structure Unit order；所有 Clip 已通过当前 Review；`assembly.json.durationMs` 精确等于 Brief，ffprobe 时长误差不超过一个视频帧且最多 100ms，比例和交付格式匹配；approve Decision 同时绑定当前 `final/tvc.mp4` 与 `final/probe.json`。`complete` 还要求七个 Stage 全部 complete。

## 6. Decision 与 git commit 绑定

### 6.1 绑定时点

1. Host Agent 完成待审文件，校验格式并创建内容 commit A。
2. 工作树必须干净。Host 调用 `request_interaction`，只提交目标相对路径，不提交 hash。
3. Store 在写入 Interaction 前验证路径在 `HEAD` 中存在，计算 `HEAD` commit 与每个路径的 git blob/tree object ID，并把它们固化到 `state.json.interaction`。该次状态写入可以使工作树变脏，但不会改变已绑定的 `HEAD`。
4. 用户提交后，Host 调用 `append_decision(interactionId)`。Store从已提交 Interaction 推导 kind、outcome、selection/answers/actions/comment 和目标，先追加一条 Decision 并 fsync，再原子清空 `state.json.interaction`；Host不能自行构造 Decision。若两步间崩溃，恢复时按 interaction ID 识别已有 Decision 并只完成清理，禁止重复追加。
5. Host 立即 commit `decisions.jsonl`，commit message 包含 Decision ID。Stage checkpoint 只接受已经存在于当前 `HEAD` 的 ledger 行。

### 6.2 Decision 记录

```json
{
  "id": "decision-id",
  "stageId": "proposal",
  "interactionId": "interaction-id",
  "interactionKind": "select",
  "outcome": "selected",
  "result": {},
  "targets": [
    { "path": "proposals/index.json", "commit": "...", "objectId": "..." }
  ],
  "createdAt": "ISO-8601"
}
```

### 6.3 Staleness

Decision 的基础有效条件是：其 ledger 行已在当前 `HEAD`；target commit 是当前 `HEAD` 的祖先；kind/outcome 满足 Stage Review；目标覆盖规则满足当前 Unit 集合。对象失效按交互语义分两种：

- form/select/整体 approve 使用 atomic binding：全部 target 的当前 `HEAD:<path>` object ID 都与 Store 盖章值一致才有效；任一上下文文件变化，整个 Decision stale。
- target-review/batch-review 使用 per-target binding：每个 target 的 action/outcome 独立有效；某个文件变化只使该 target 证据 stale，其他 target 继续覆盖对应 Unit。检查点可以组合多条 Decision 中仍有效的 target 证据。

文件内容改变、删除或换路径会使对应证据 stale；若 later correction 把同一路径恢复为完全相同的原字节，git object ID 也恢复，原 target 证据自动重新有效。这样未受影响 Unit 可以从 git 恢复并复用既有批准，不需要重新打扰用户。不存在额外的手写失效矩阵。

目录 target 仅用于不可变集合快照；默认审阅使用具体文件，避免在同目录写入选择标记时误伤已有 Decision。

## 7. `tasks.jsonl` 媒体任务账本

账本是事件流，Store 通过回放单个 Task 的事件验证状态，不构造领域 Production：

- `task-created`：Host 提交 operation、target path、provider、已在 `HEAD` 的 `requestRef`（概念故事板请求、Storyboard Plan、Clip Plan 或 Assembly 文件）、可选 `dependencyPaths[]`、本次将实际传给媒体工具的 request snapshot 和 redoOfTaskId?。Store 为 request 与 dependencies 盖 commit/object ID，不解释或转换 Provider 参数，只计算 requestHash，并同时写入 Task ID、Attempt 1 ID/number、clientRequestId 和 `submitting`。每张全片概念故事板必须把匹配的文字 Proposal 放入 dependencies，Proposal 字节改变即使 Task 失效；`video-generation` 的 requestRef 必须是当前 Unit Plan，dependencies 必须包含该 Unit 的规范 Storyboard，Store 还必须找到该规范路径的当前 approve 证据，否则在付费调用前拒绝。该事件落盘并 fsync 后返回持久化结果；Host 才能以同一 snapshot 和 clientRequestId 调用 Provider。
- `attempt-submitted | attempt-running | attempt-succeeded | attempt-failed | attempt-cancel-requested | attempt-cancelled | attempt-submission-unknown`：只允许契约规定的状态转换；submit ID 和 submittedAt 写入一次。
- `attempt-created`：仅在 failed/cancelled 后为同 Task 创建下一 number Attempt，`retryOfAttemptId` 指向前一 Attempt；正常路径直接以 `submitting` 落盘。
- Redo 使用新的 `task-created` 和 `redoOfTaskId`，可以改变 request identity。

Retry 不再次传输 request snapshot；Store 从原 Task 回放并返回同一 requestHash 的请求。Redo 必须引用新 `requestRef` 的当前 git object，并提交新的实际 request snapshot。请求快照只在 Task 创建时穿过 MCP 一次，这是付费调用可恢复性的必要成本；Bridge 不为减少这一次传输而变成 Provider adapter。

`submission_unknown` 必须以 Provider 查询、clientRequestId 或其他证据对账；未证明 `not-created` 时禁止新 Attempt。无状态变化的 poll 不要求事件；状态、submit ID、结果、失败、取消或 reconciliation 变化必须立即追加。

Storyboard 图片任务不要求事前批准；其成本和返工路径由 Host 控制。Assembly 是本地确定性 ffmpeg 操作，且用户最终审批发生在成片生成之后，因此也不要求不存在的“Assembly 事前批准”；它仍必须通过 Package Review 文件与终态检查。

## 8. Stage 检查点与 correction

`update_state` 只接受以下动作：`complete-stage`, `activate-stage`, `pause-gate`, `resume-gate`, `reopen-from-stage`。调用方给出动作、Stage ID、Decision IDs/原因和 `expectedStateRevision`；不提交完整 state。

Store 对 `complete-stage` 只执行以下检查；表内没有列出的第 5 节领域规则由 Host 自检：

| Stage | Store checkpoint |
| --- | --- |
| clarification | Manifest produces 全部存在并在 `HEAD`；form Decision 为 `submitted`，绑定当前 `clarification.json` |
| research | `research.md` 存在并在 `HEAD`；不解析正文，不要求 Review |
| proposal | index 可解析出 3–4 个唯一 Proposal ID/路径；每个方向的概念请求和概念整图全部存在；每个成功图片 Task 绑定匹配请求与匹配 Proposal 当前字节；单一 select Decision 绑定 index + 全部图文替代项，选择值与 `selected.json` 一致 |
| storyboard-production | `structure.json` 含非空唯一 Unit ID；`continuity/index.json` 和每 Unit `storyboard-plan.json` 存在；每个 Unit 的 `storyboard.png` 存在并与成功候选/导入源同字节；batch/target Decision 对全部当前规范路径为 approve；完成后门禁状态正确 |
| unit-video-production | 每 Unit `plan.json` 与 `clip.mp4` 存在；成功 Task 覆盖这些路径且盖章依赖包含获批当前 Storyboard；batch/target Decision 的当前有效 target 证据覆盖全部当前 Unit；声明 tail-frame 依赖的 Unit 对应路径存在 |
| package-review | `package-review.md` 存在并在 `HEAD`；不解析审计正文或 front matter；无用户 Review |
| assembly | `assembly.json`、`probe.json`、`tvc.mp4` 存在；成功 Assembly Task；approve Decision 绑定 tvc + probe；执行第 5.7 节的时长、比例、顺序和格式终态检查 |

所有路径还统一经过相对路径/realpath containment，所有文件与 Decision ledger 行必须在当前 `HEAD`，required review 再执行第 6 节的 commit/object/staleness 规则。除此之外 Store 不评价创意质量，不解析 Markdown 正文，不校验 Prompt 语义，也不生成文件。

`complete` 携带 `expectedStateRevision`，并额外要求：七个 Stage 均 complete、无 pending Interaction、最终输出对应 Task 已 succeeded、不存在仍会改变当前交付物的 submitting/running/submission_unknown Attempt、工作树干净、当前 `HEAD` 通过第 9 节历史检查。通过后只把 status 改为 completed 并递增 state revision；Host 再提交最终 state commit。

`reopen-from-stage` 必须引用一个已提交且明确要求修改的 comment/approve/target-review/batch-review Decision，或给出系统失败等无需用户决策的明确 correction reason。Store只把该 Stage 设为 active、后续 Stage 设为 pending，并记录 reopening evidence。Host 随后按 Pipeline 顺序删除被 reopen Stage 之后各 Stage 的当前 `produces` 路径并提交 correction commit，再从 git 恢复确认不受影响的原字节、重写真正受影响的文件；Bridge 不维护或执行失效矩阵。恢复为原字节的 per-target Decision 自动复活，改变或未恢复的目标保持 stale。

## 9. Git 要求与失败行为

Git 是本设计的硬性运行依赖，不提供无历史降级模式。

- `start` 首先执行 `git --version`；不可用即阻塞并给出明确错误。
- `outputDir` 必须自身是 git top-level；若不是，初始化独立仓库。若路径被外层仓库吸收但自身没有 `.git`，仍初始化嵌套独立仓库。
- `user.name`/`user.email` 缺失时使用仅限该 outputDir 的本地配置，不修改全局配置。
- Store 维护 git 内部引用 `refs/codex-video-production/last-seen`。每次恢复或检查点只允许当前 `HEAD` 是该引用的后代，验证成功后才快进该引用；这使 reset/rebase 后的非快进历史改写可以被稳定拒绝，而不另建业务 revision 链。
- Review、Stage complete、correction 和恢复时只要存在 Host-owned dirty path 就暂停；Host先完成或撤销明确的当前写入，不由 Bridge自动 stash/reset/commit。三个 Store-owned 文件允许处于第 13 节可验证的 pending checkpoint，不能以普通 `git status --porcelain` 非空直接判定失败。
- 检测到非 fast-forward/改写历史、target commit 不再可达或 `.git` 损坏时硬阻塞。Bridge不尝试修复历史。

## 10. Preview Stage 视图库

| View ID | Stage | 文件输入 | 呈现 |
| --- | --- | --- | --- |
| `clarification-form` | clarification | request.md, assets/index.json, clarification.json, brief.md | 原始需求、素材、问题与 Brief 预览 |
| `research-document` | research | research.md | Markdown、来源列表、Finding 引用 |
| `proposal-comparison` | proposal | proposals/index.json + 每个方向的 markdown + concept request/storyboard | 顶部文字方向卡；点击即选中并只展开当前方向的整张全片故事板与完整文字；底部一次确认，不做预选/复选或额外选择按钮 |
| `storyboard-workspace` | storyboard-production | selected proposal, concept storyboard, structure.json, storyboard plans, referenced assets, storyboard.png | 已确认全片方向；顶部以文字制作卡概览所有 Unit，点击后只显示当前 Unit 的规范故事板、生成提示词和参考素材；默认通过并只标记需修改目标；不重复候选/规范副本 |
| `clip-review` | unit-video-production | storyboard.png, clip candidates, clip.mp4, tail-frame.png | 播放器 + 已批准分镜对照 + 衔接信息；不显示内部 Plan |
| `package-review-document` | package-review | package-review.md | Markdown 审计与按路径问题列表 |
| `final-review` | assembly | assembly.json, probe.json, tvc.mp4, ordered clips | 成片播放器、探测事实、Unit 构成与强制元素 |
| `document` | 任意 fallback | Manifest 声明的首个 Markdown produce | 原样 Markdown，不伪装成卡片 |

`generation-board` 是媒体 Stage 的正交辅助面板：只读 `tasks.jsonl` 回放后的当前 Task/Attempt 状态，在 storyboard/clip/final 主视图上方或侧栏组合；它不是第二个 Stage 主视图。

页面组合为：Stage 主视图 + 可选 generation board + 嵌入内容底部的当前 Interaction，不使用重复的技术右栏。Proposal 确认整体方向；随后 Structure、连续性参考和 Storyboard Prompt 在一个 storyboard-production Stage 内自动完成。用户先通过文字制作卡扫完整片结构，再聚焦一个 Unit 查看实际故事板、生成提示词与参考素材；Prompt 作为制作解释可见，但不是独立审批点。Clip Plan 同样留在 unit-video-production 内部，页面只显示“播放器 + 已确认 Storyboard 对照”。故事板查看器围绕当前整图提供适应窗口、缩放、查看原图和修改批注。`package-review-document` 只显示结论、制作目标与逐 Unit 准备情况；`final-review` 只显示成片、交付事实和最终确认。

制作流程抽屉默认收起，只在顶部保留当前步数。展开后，当前 Stage 使用正常可交互视图；已完成 Stage 可点击并以同一 View 只读打开，便于在 Proposal 审阅时回看 Brief/Research、在成片审阅时回看 Structure/Storyboard/Clip；pending Stage 只显示业务名称和顺序且不可点击，不解析或提供文件。历史只读视图不改变 `currentStage`、不显示 Interaction panel、不触发 publish，也不能提交 Decision 或 Task Control。默认 UI 把文件、字段与任务状态翻译为业务语言，不显示原始路径、JSON 或协议术语。

`publish` 输入只有 `{stage, notice?, focusPaths[]}`；它只更新 Session 内可重建的轻量信号并通过 SSE 通知 Browser 重新读取文件，不写 Production 文件。Store 状态或账本变化使用同一轻量通知通道，事件不携带领域内容或工作流指令；浏览器断线自动重连，并保留 30 秒读取兜底。进程重启后 Browser 从 `state.json.currentStage` 和 Manifest 重建主视图，旧 notice 不保证保留。智能体写文件即内容更新。

浏览器不接受任意磁盘路径。HTTP 层只接受当前 Stage 或用户选中的已完成 Stage view resolver 解析出的文件、这些文件显式引用的素材，以及当前 Interaction target；随后再做相对路径语法校验、`realpath` containment、symlink escape 拒绝和受控 MIME，视频继续支持 byte Range。Markdown/JSON 返回文本并在前端安全解析、禁止执行内嵌 HTML/脚本，图片、音频、视频返回原始媒体流。隐藏文件、`.git/**`、账本、`state.json` 与临时文件默认不可由该路由读取；视图需要的轻量状态和 Task 投影走专用 Session API。

## 11. Pipeline Manifest

每个 Stage 声明：

```yaml
- id: proposal
  label: 策划提案
  view: proposal-comparison
  prompt: stages/proposal.md
  promptVersion: 1
  requires:
    - brief.md
    - research.md
  produces:
    - proposals/index.json
    - proposals/*.md
    - proposals/selected.json
  review:
    kind: select
    required: true
```

`requires/produces` 是安全相对路径或受限 glob，只描述文件存在契约。Manifest 不声明 next、工具、分支、重试或执行动作。六段式 Stage Prompt 的 Output Contract 只说明写哪些文件及格式。

## 12. MCP 工具面

1. `video_preview_start`：验证 Pipeline、git 与 outputDir，创建/恢复轻量 Session 和 `state.json`。同一 Bridge 进程内，完全相同的 `outputDir + productionId + Pipeline identity` 重复 start 幂等返回已有 Session，并且该查找先于重读安装目录中的 Pipeline 文件；这样插件重装清理旧 cachebuster 目录时不会卡断仍活动的 Production。跨进程恢复继续从当前安装快照解析已记录 revision，并获取独占锁。
2. `video_preview_publish`：提交 Stage、notice、focusPaths 信号。
3. `video_preview_request_interaction`：创建交互；Store绑定当前 git targets。
4. `video_preview_wait_interaction`：等待结构化响应。
5. `video_preview_get`：默认返回 state 摘要、当前 Interaction 和 publish 信号；scope 可读完整 state、一个 Decision、一个 Task 或 ledger tail，不返回 Stage 文件正文。
6. `video_preview_append_decision`：从 submitted Interaction 生成并追加 Decision。
7. `video_preview_append_task_event`：追加并验证 Task/Attempt 事件。
8. `video_preview_update_state`：执行窄状态动作及 Stage 检查点。
9. `video_preview_complete`：执行 Assembly 终态检查并完成 Session。

## 13. 并发、原子性与 commit 时序

- 每个 outputDir 同时只允许一个活动 Session。Store持有 `.production.lock` 独占 lease；第二进程启动直接拒绝。崩溃遗留 lock 仅在同机 PID 不存在且显式恢复时回收。
- 账本追加与 state 写入共享该 Production 的进程内 mutex。每个 JSONL 事件的 ID、sequence 和 createdAt 由 Store 分配；每次只写一个完整 JSON 行和换行，并 `fsync`。追加前，Store 要求工作文件以当前 `HEAD` 中的账本字节为严格前缀，并完整回放所有尚未 commit 的尾部事件；任何删除、替换、截断、sequence 跳跃或非法事件都拒绝。
- `state.json` 使用同目录临时文件、文件 `fsync`、rename、目录 `fsync`；CAS 比较 `expectedStateRevision` 后才递增。账本和 state 都不接受 Host 提供的时间戳、sequence、hash 或服务端 ID。
- 账本与 state 不尝试跨文件事务；操作顺序使崩溃可判定：
  1. Stage 内容：Host 原子写文件 → 校验 → git commit → publish。
  2. Review：内容 commit → request/wait → append Decision → commit ledger → update state → commit state。
  3. Provider：append `task-created/submitting` → 调 Provider → 每次状态迁移立即 append 对应事件；Provider 成功时先把结果 URL/元数据记入 `attempt-succeeded` 并 fsync，再临时下载 → rename 媒体 → commit 媒体与 ledger → publish。若下载前崩溃，恢复时先从 succeeded 事件重下，不重提任务；若 URL 已过期且 Provider 无法刷新，追加 task-level `artifact-unrecoverable` 事件并要求显式 redo。旧 Attempt 仍保持 succeeded（表示 Provider 已完成），不把本地取件失败伪装成 Attempt 状态回退。
  4. Stage complete：确认 Decision 已提交 → update_state checkpoint → commit state。
- commit message 使用固定、可搜索的最小格式：Stage 内容 `stage(<stageId>): content`，Decision `decision(<decisionId>): <stageId>`，媒体 `task(<taskId>): <target>`，状态完成 `stage(<stageId>): complete [decisionId...]`，correction `correction(<stageId>): <evidenceId-or-reason>`。Bridge 只验证相关 ID 出现在对应提交信息，不自行 commit。
- 恢复时若 `state.json` 或两个账本有未提交改动，视为可恢复的 pending checkpoint，Host必须先核对并 commit；其他 dirty 文件要求 Host判断完成或撤销。Bridge不自动 commit、stash、reset 或删除。

## 14. 实现删除预算与验收

实现必须删除单文件 Production Schema/validator、领域 revision 链、内容联合体、通用 payload 翻译、product-ad Pipeline 和相关测试。目标不是在旧系统旁新增文件树适配层。

代码量门禁：以 `src + mcp + preview + test` 下 `.mjs/.js` 为统一口径，设计确认时基线为 7,040 行；完成后必须低于该值，并且删除行数大于新增行数。若检查点重新实现全过程领域 Schema 或 View 重新要求 Host 发送完整领域 payload，则验收失败。

真实验收使用一条 8-Unit TVC：记录九个 MCP 工具的请求/响应 bytes 与近似 token；相对当前整本读写节拍至少下降 10 倍；七 Stage、所有 Review、两次 capability gate、跨进程恢复、tail-frame、后期 correction、Assembly 和最终批准都必须在全新 Codex CLI 任务中完成。
