# 持久候选知识确认闭环：第二阶段规格

## 目标

沿用现有待确认页面的布局和交互，把研究平台 SQLite 中的候选知识接入 UI，打通“候选队列—确认/修改/驳回—正式知识版本”的持久闭环。

## 公共接缝

### HTTP

- `GET /api/v1/review-queue`：返回待处理候选，以及页面一次渲染所需的公司、证据、同主题正式知识和队列总数。
- `POST /api/v1/review-queue/:candidateId/decision`：接收 `expectedVersion`、`action`，以及修改确认时可选的 `statement`、`value`、`effectiveAt`；返回更新后的候选和剩余队列总数。

HTTP 接缝隐藏 `PlatformModule.listCandidates()`、`getCompany()` 和 `decideCandidate()` 的组合过程，页面不需要逐候选查询公司，也不直接依赖服务端领域模块。

### 浏览器

- `ReviewQueueClient` 是页面读取和提交决定的唯一数据接缝。
- 现有 `ConfirmationPage` 只观察队列 DTO、用户操作结果和错误，不读取 React 内部状态或 SQLite 表。

## 必须实现

- 队列只包含 `pending` 和 `conflicted` 候选。
- 候选展示真实公司名、陈述、支持/冲突证据、影响标签和同主题正式知识。
- 支持确认、修改确认和驳回；继续使用候选 `version` 做乐观并发控制。
- 确认或修改确认继续由研究平台内核生成正式知识版本；驳回不得生成正式知识。
- 提交成功后立即从页面队列移除，并同步更新全局待确认数量。
- 请求失败时保留当前候选并显示可读错误。
- 前后端共用项目级 v1 transport contracts，避免新增两份手写 DTO。

## 本阶段不做

- 不重做待确认页面 JSX 布局或 CSS。
- 不接 RBAC、多用户分配、批量确认或审批流。
- 不接真实 OpenCode、Exa、飞书或公司名单。
- 不拆分迁入的 `platform-module.ts` 大文件。

## 验收

1. 上传材料并生成候选后，队列接口和待确认页面都能看到该候选及其支持证据。
2. 确认候选后，候选离开队列，公司产生带证据的当前正式知识；服务重启后结果仍存在。
3. 修改确认保存修改后的陈述；驳回不创建正式知识。
4. 使用过期 `expectedVersion` 提交时返回 `409 version_conflict`，页面不丢失候选。
5. 全局待确认数量与队列同步。
6. 测试、TypeScript 检查和生产前端构建通过。
