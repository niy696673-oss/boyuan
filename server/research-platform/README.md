# Research platform core

本目录从旧博源 Demo 的 `server/platform` 迁入，源快照为提交 `551a33d`。除用 Express 替代旧的裸 Node HTTP 适配器外，业务内核保持原样，继续以 `PlatformModule` 作为公共接口。

当前仓库的第一阶段装配：

- `platform-module.ts`：SQLite 业务内核和持久 `TaskStep`；
- `platform-worker.ts`：同进程异步任务执行器；
- `express-router.ts`：当前 Express 服务的 `/api/v1` 适配层；
- `analysis/deterministic-analysis.ts`：第一阶段默认分析适配器。

真实 OpenCode、Exa 和飞书相关适配器随内核保留，但尚未在当前仓库运行时启用。当前阶段也没有把现有 RBAC 或生产基础设施接入该单用户业务内核。
