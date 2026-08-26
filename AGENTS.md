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

### Private-market skills

- Multica“研图”同步的投研与 BP Skills 位于 `.agents/skills`，来源清单见 `docs/agents/multica-research-skills.json`。
- 请求含糊或跨多个产物时，先使用对应的 `*-router` 选择路径，再只加载完成任务所需的最小原子 Skill 和它明确要求的 References；不要一次加载全部业务 Skills。
- 若原子 Skill 的 `agents/openai.yaml` 设置 `policy.allow_implicit_invocation: false`，仅在用户明确点名该 Skill，或 Router 已明确选择它后调用。
- 工作台 BP 材料分析固定路由到 `boyuan-bp-deep-analysis` 和 Sequential Thinking，运行时只放行这两项。同步导入的投研 Skills 仅服务于明确路由的投研产物；`project-material-intake` 仅服务于 BotMux/Multica 收件闭环；Exa 服务于外部调研，NEI 服务于明确路由的投研或收件方法调用。
