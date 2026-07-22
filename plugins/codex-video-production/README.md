# Codex Video Production

一个 Codex Plugin：从模糊需求和可选产品素材推进到完整 TVC 成片。Codex 是唯一编排运行时；本项目只提供声明式 TVC Pipeline、领域 Stage Prompts、本地 Preview 和窄职责持久化 Bridge。

Production 是用户选择的绝对输出目录及其 Git 历史。Stage 内容是普通文件；`state.json` 与两个 JSONL 账本保存最小运行状态和证据。Preview 直接读取已提交 Stage 文件，不接收完整 Production payload。

新开发任务按 [AGENTS.md](AGENTS.md) 阅读 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)、[产品设计](docs/product.md)、[架构](docs/architecture.md) 和 [冻结设计](docs/file-tree-production-design.md)。

```bash
npm install
npm run check
```
