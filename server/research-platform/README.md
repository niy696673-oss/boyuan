# Research platform core

本目录从旧博源 Demo 的 `server/platform` 迁入，源快照为提交 `551a33d`。除用 Express 替代旧的裸 Node HTTP 适配器外，业务内核保持原样，继续以 `PlatformModule` 作为公共接口。

当前仓库的第一阶段装配：

- `platform-module.ts`：SQLite 业务内核和持久 `TaskStep`；
- `platform-worker.ts`：同进程异步任务执行器；
- `express-router.ts`：当前 Express 服务的 `/api/v1` 适配层；
- `analysis/runtime-analysis.ts`：按环境显式选择确定性或 OpenCode 分析适配器；
- `analysis/deterministic-analysis.ts`：未配置真实运行时时的开发测试适配器；
- `analysis/opencode-analysis.ts`：真实 BP 深度分析适配器，要求调用项目 BP skill 与 Sequential Thinking MCP。
- `copilot/`：公司详情页自由问答适配器；每家公司复用独立 OpenCode Session，并由 SQLite 保存页面消息历史。
- `shared/company-quick-card.ts`：平台与 BotMux、BP 与公司名研究共同使用的公司主体、产品技术、行业、市场、融资、团队、亮点、风险、尽调问题和基金匹配输入字段；两条入口共享字段契约，但关系线索分别保留“BP 提到”和“公开来源 / 已有资料”的来源语义。
- `fund-matching/`：把成都 4 只模拟基金清单作为带来源和基准日的 SQLite 基金画像，并在 Luna 提取之后本地过滤、评分和解释；不调用额外模型或搜索。

设置 `BOYUAN_ANALYSIS_ADAPTER=opencode` 与 `BOYUAN_OPENCODE_BASE_URL` 后启用真实 OpenCode。BP 原文分析的单次会话默认禁用全部工具，只放行项目 BP skill 与 Sequential Thinking；深度结果除 13 个维度外还提取带材料证据的人物实体和上游、下游、客户、竞品关系线索。公司详情页 Copilot 复用该 OpenCode 连接，但使用公司独立的自由对话 Session，且禁用全部工具。公司外部调研通过 `BOYUAN_RESEARCH_ADAPTER` 和 `BOYUAN_SEARCH_ADAPTER` 独立选择 OpenCode 与 Exa；OpenCode 研究会话不调用工具，只消费正式知识和带 URL 的搜索结果。项目级 OpenCode 还配置了 Exa 与 NEI MCP，供通用工作台任务使用；NEI 是投研 Skill/连接器目录，不作为公司事实搜索适配器。

飞书与企业微信入口通过 `feishu-intake-router.ts` 中的渠道适配器接入同一业务内核：上传 BP 或提交公司名研究都会立即创建持久工作台会话和后台深度任务，独立的 Luna 快速分析提取渠道展示字段与基金匹配输入，SQLite 本地规则随后计算基金匹配度并更新同一条渠道回复。公司快速分析与深度研究通过 `company_research_runs` 和 `web_search_results` 复用同一公开检索快照；快速结果另行持久化以支持重试，不写正式知识。30 秒仅用于观测与优化，不会成为 Luna 或 Exa 的硬截止。现有 RBAC 和生产基础设施仍未接入该单用户业务内核。
