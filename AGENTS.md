# AI 协作规则

## 分支与合并

- 开始开发前同步最新 `main`，并从 `main` 创建独立功能分支。
- 不直接在 `main` 上开发或推送代码。
- 完成后将功能分支推送到远端，通过 Pull Request 合并到 `main`。
- 提交信息使用 Conventional Commits 格式。

## 改动边界

- 能力开发以业务逻辑、数据、API 和服务端改动为主，尽量保持现有 UI 不变。
- UI 开发以布局、样式和展示交互为主，尽量保持现有业务逻辑不变。
- 能力开发需要修改 UI，或 UI 开发需要修改业务逻辑时，应在修改前说明原因、预计影响和涉及文件。
- 如果改动会删除或重做对方已有工作，则先暂停并协调。

## 改动范围

- 只修改当前任务需要的代码，避免顺带重构、重命名或格式化无关文件。
- PR 中说明主要改动、跨边界修改和验证结果。

## Agent skills

### Issue tracker

需求、规格和开发任务使用 GitHub Issues 管理。详见 `docs/agents/issue-tracker.md`。

### Triage labels

使用 Matt Pocock skills 默认的五类 triage 标签。详见 `docs/agents/triage-labels.md`。

### Domain docs

本仓库采用单一上下文，领域术语记录在根目录 `CONTEXT.md`，架构决策记录在 `docs/adr/`。详见 `docs/agents/domain.md`。
