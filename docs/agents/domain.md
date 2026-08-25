# Domain Docs

本仓库采用单一上下文领域文档布局。

## 开始探索前

按需读取：

- 根目录 `CONTEXT.md`：项目领域术语和定义。
- `docs/adr/`：影响当前改动的架构决策记录。

文件不存在时继续工作，无需提醒或提前创建。`domain-modeling`、`grill-with-docs` 和 `improve-codebase-architecture` 会在真正形成术语或决策时按需创建。

## 文件结构

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

## 使用统一术语

Issue 标题、规格、测试名称、代码和重构方案应使用 `CONTEXT.md` 中定义的领域术语。

如果需要的概念尚未定义，应先判断：

- 是否正在引入项目并未使用的新说法；
- 是否确实存在需要通过 `domain-modeling` 补充的领域概念。

## ADR 冲突

如果当前方案与已有 ADR 冲突，应明确指出冲突及重新讨论的原因，不得静默覆盖已有决策。
