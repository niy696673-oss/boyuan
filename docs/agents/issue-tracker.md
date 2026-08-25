# Issue tracker: GitHub

本仓库的需求、规格和开发任务使用 GitHub Issues 管理。所有操作使用 `gh` CLI，并由当前仓库的 Git remote 自动确定目标仓库。

## 常用操作

- 创建：`gh issue create --title "..." --body "..."`
- 查看：`gh issue view <number> --comments`
- 列表：`gh issue list --state open`
- 评论：`gh issue comment <number> --body "..."`
- 添加标签：`gh issue edit <number> --add-label "..."`
- 移除标签：`gh issue edit <number> --remove-label "..."`
- 关闭：`gh issue close <number> --comment "..."`

多行正文使用 heredoc，避免命令行转义破坏 Markdown。

## Pull requests as a triage surface

**PRs as a request surface: no.**

Pull Request 用于代码评审和合并，不作为需求或问题的 triage 入口。

## Skill 约定

- “发布到 issue tracker”表示创建 GitHub Issue。
- “读取相关 ticket”表示运行 `gh issue view <number> --comments`。
- Issue 标签使用 `docs/agents/triage-labels.md` 中的映射。
- GitHub Issue 与 Pull Request 共用编号；不确定 `#<number>` 类型时，先运行 `gh pr view <number>`，失败后再运行 `gh issue view <number>`。

## Wayfinding

`wayfinder` 使用一个 GitHub Issue 作为 map，并使用子 Issue 表示决策任务。

- Map 使用 `wayfinder:map` 标签。
- 子任务使用 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task` 标签。
- 优先使用 GitHub 原生 sub-issues 和 issue dependencies。
- 原生能力不可用时，在子 Issue 顶部记录 `Part of #<map>` 和 `Blocked by: #<number>`。
- 领取任务时使用 `gh issue edit <number> --add-assignee @me`。
- 完成后在 Issue 中记录结论并关闭。
