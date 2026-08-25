# Research platform core

本目录从旧博源 Demo 的 `server/platform` 迁入，源快照为提交 `551a33d`。除用 Express 替代旧的裸 Node HTTP 适配器外，业务内核保持原样，继续以 `PlatformModule` 作为公共接口。

当前仓库的第一阶段装配：

- `platform-module.ts`：SQLite 业务内核和持久 `TaskStep`；
- `platform-worker.ts`：同进程异步任务执行器；
- `express-router.ts`：当前 Express 服务的 `/api/v1` 适配层；
- `analysis/runtime-analysis.ts`：按环境显式选择确定性或 OpenCode 分析适配器；
- `analysis/deterministic-analysis.ts`：未配置真实运行时时的开发测试适配器；
- `analysis/opencode-analysis.ts`：真实 BP 深度分析适配器，要求调用项目 BP skill 与 Sequential Thinking MCP。

设置 `BOYUAN_ANALYSIS_ADAPTER=opencode` 与 `BOYUAN_OPENCODE_BASE_URL` 后启用真实 OpenCode。BP 原文分析禁止外部搜索；Exa 等外部搜索只属于后续调研链路。飞书相关适配器和现有 RBAC/生产基础设施尚未接入该单用户业务内核。
