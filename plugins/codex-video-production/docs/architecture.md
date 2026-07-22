# 架构：文件树 Production 与薄 Preview Bridge

## 不变量

1. 存在且仅存在一个 Host Agent 编排运行时；当前交付以 Codex Plugin 分发和验收。
2. Host Agent 负责推理、Stage 推进、工具调用、重试、纠错和交付。
3. Preview 只展示已提交文件并收集结构化输入。
4. MCP/HTTP Bridge 只做窄校验、持久化、等待和安全文件服务，不包含 Agent Loop、DAG、调度器或 Provider adapter。

## 组件

```text
Codex / Host Agent
  ├─ native files + git ──> outputDir (Production authority)
  ├─ Lovart Skill ────────> media Provider
  └─ narrow MCP calls ────> Preview Bridge
                                ├─ Store: state + ledgers + checkpoints
                                ├─ Stage View resolver
                                └─ localhost Browser Preview
```

`outputDir` 本身是独立 Git 仓库。Host 写普通 Stage 文件并提交；Store 独占写 `state.json`、`decisions.jsonl`、`tasks.jsonl`。Git commit/object ID 提供内容版本和审批失效，不再维护一套领域 revision/pointer 图。

## 状态与恢复

`state.json` 仅保存 Production/Pipeline identity、Stage complete-prefix 生命周期、execution gate、当前 Interaction 和 correction marker。Decision 与 Task 是 append-only JSONL。Store 对写入 fsync，state 使用临时文件 + fsync + rename，三个文件通过 pending-checkpoint 协议进入下一 Git commit。

`.production.lock` 防止同一目录被两个活动进程写。Git 内部 `last-seen` ref 只允许快进历史。恢复时重放账本、验证状态和 Git，重建 Stage View；不依赖 Codex 私有会话。同一 MCP 进程对已经活动的 `outputDir + productionId + Pipeline identity` 重复 start 是幂等恢复，直接返回原 Session；该路径先于重新读取 Skill 文件，因此插件重装清理旧缓存目录时，不会中断仍在该进程中的 Production。跨进程恢复仍从当前安装快照按已记录的 Pipeline identity 重新解析同一 revision，并受独占锁保护。

## Pipeline 与 Stage Prompt

单一 `tvc` Pipeline 当前默认发布 revision 4，声明七个有序用户 Stage、文件 `requires/produces`、View、Review 和 Prompt 引用；revision 1–3 仅供已有 Production 按记录恢复。Stage Prompt 可以在当前 revision 内更新，但必须递增对应 `promptVersion`；Stage 顺序、ID、View、requires/produces、Review 等结构变化必须发布新 revision。运行中的 Production 使用启动时安装的 Plugin 快照，重新安装后恢复则读取该 revision 最新打包的 Prompt。Pipeline 不声明 next、工具、条件、分支或重试。Host 每到一个 Stage 才加载对应六段式领域 Prompt。文字 Proposal 是创意语义权威；每个方向在选择前各有一张全片 Concept Storyboard，并通过一次 atomic select 共同确认。结构、连续性参考与媒体 Prompt 是 Host 内部可审计文件，不形成用户审批页面；每个 Unit 的规范 `storyboard.png` 是用户实际审阅对象、视频生成正式图片参考和付费任务授权证据。

扩展新的制作流程时创建新的声明包和 Stage Prompt，不在 Bridge 中实现流程。扩展 View 时只增加从约定文件到安全展示的读取器，不增加业务编排。

## Review 证据

Store 在 Interaction 创建时对已提交 target 记录 commit 和 Git object ID。浏览器响应先落 state，再由 `append_decision` 派生账本行。整体表单/选择/批准使用 atomic validity；批量/逐目标审阅使用 per-target validity。Stage complete 由 Store 兜底 required review、文件存在、关键引用与终态事实，但不评价创意质量。

## 媒体任务

Task 事件在 Provider 调用前以 `submitting` 落盘，含 Store 生成的 Task/Attempt/clientRequestId、requestRef 对象 ID、可选依赖文件 object stamp、请求摘要和一次必要的 request snapshot。每个概念故事板任务依赖其对应文字 Proposal，文本变更会结构性失效。状态变化才记账；无变化轮询不写。Retry 是同 Task 新 Attempt，Redo 是新 Task，`submission_unknown` 必须对账。

Bridge 不调 Provider。Host 只用 Lovart Skill，默认批量提交、批量轮询、批量审阅。付费视频任务由 Store 验证请求 Plan 已提交、依赖包含该 Unit 当前 Storyboard，且该 Storyboard 的用户批准仍有效。Assembly 使用本地 ffmpeg/ffprobe，也写任务证据。

## Preview 与文件安全

Stage View 从当前或已完成 Stage 的 Manifest 路径解析已提交文件。历史 Stage 只读；未来 Stage 只在默认收起的流程抽屉中显示业务名称和顺序，不能读取 View。前端把字段、文件和状态投影为业务文案，原始标识仍只留在协议内。媒体路由只接受 View 已解析路径，再执行相对路径、realpath containment、symlink escape、MIME 和 Range 校验；`.git`、Store 文件与隐藏文件不对浏览器开放。

浏览器通过单条 SSE 连接接收轻量状态变化通知，收到后重新读取 summary 和 Stage View；用户回答仍以 HTTP POST 原子落盘并唤醒 MCP waiter。SSE 不携带领域内容或工作流指令，30 秒轮询只作为断线兜底。所有审阅控件嵌入对应业务内容；提案页用文字方向卡切换且直接选中，只展开当前方向的一张图和完整文字。分镜页用按 Structure 排列的文字制作卡概览全片，点击后只显示当前 Unit 的规范图、生成提示词与参考素材，并将未标记目标提交为 approve；不以候选/规范重复副本或原始路径充当默认 UI。

精确冻结设计见 [File-tree Production Design](file-tree-production-design.md)，精确协议见 Skill references。
