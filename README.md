# 博源 AI 平台 Demo v0.3

按照《博源 AI 平台产品需求文档 v0.3》重构的本地可运行项目。平台以对话为工作入口、以公司为长期知识主体、以行业为组织骨架；AI 分析与 Web Search 结果经人工确认后才进入正式知识。仓库默认以空业务数据启动，不包含预置公司、材料或研究结论。

## 启动

```bash
pnpm install
pnpm dev
```

- Web：http://127.0.0.1:4173
- API：http://127.0.0.1:4174/api/health

## Demo 账号

页面左下角可以切换四类角色：投资经理、投资合伙人、知识库管理员、系统管理员。不同角色看到的公司证据和任务范围不同。

## 核心演示路径

1. 从顶部“工作台”进入研究入口，上传第一份材料或输入待研究的公司、行业问题。
2. 在输入区选择材料、公司或行业上下文并发起研究。
3. 在右侧查看文件接收、主体识别、材料分析和候选知识进度。
4. 打开顶部“待确认”，核验证据后执行确认、修改确认或驳回。
5. 在“公司”浏览卡片、筛选关注状态，并进入公司详情的材料、正式知识、待确认、研究记录和产业关系页签。
6. 在“行业”查看最新材料、重点公司、产业链骨架和行业公司。
7. 切换不同角色，验证私人、项目与机构三级权限隔离。
8. 使用系统管理员账号进入管理后台，检查材料处理、主体候选、质量指标与审计记录。
9. 上传含 `支持:`、`更新:`、`冲突:` 或 `新增:` 的 TXT/Markdown 资料，验证知识合并与版本变化。

## v0.3 重构范围

- 顶部一级导航、全局搜索、待确认入口、通知和用户菜单。
- 工作台会话侧栏、材料/公司/行业上下文、任务步骤与公司认知侧栏。
- 公司卡片列表和统一公司实体页签。
- 行业概览、材料、产业链和公司入口。
- 可写回版本与审计记录的待确认中心。
- 桌面端与移动端响应式布局、键盘焦点、空状态和错误反馈。

## 生产化架构（v0.2）

当 `PLATFORM_MODE=production` 时，系统启用以下正式链路：

- PostgreSQL + pgvector：业务状态主存储、资料元数据、关键词/向量混合索引和运行监控事件。
- MinIO/S3：原始文件对象存储，服务端加密，下载前再做资料级权限校验。
- Redis + BullMQ Worker：上传请求立即返回，PDF/DOCX/TXT/Markdown/CSV 在独立 Worker 中解析、切分和建索引，失败可重试。
- JWT 认证 + RBAC + 项目成员关系：组织、项目、私有三级可见性在检索召回前过滤。
- 模型网关：默认调用本地 OpenAI-compatible 模型；仅在管理员授权且上下文允许时回退到外部模型。
- Prometheus + 结构化日志：监控模型调用、token、延迟、检索命中数和引用有效率；`/api/metrics` 仅系统管理员可见。

### 本地启动正式链路

```bash
cp .env.example .env
# 先替换 .env 内的密码和 JWT 密钥
pnpm infra:up
set -a && source .env && set +a
pnpm migrate
pnpm dev:server
# 另开一个终端
set -a && source .env && set +a && pnpm dev:worker
```

首次登录使用 `.env` 中的 `BOOTSTRAP_ADMIN_EMAIL` 和 `BOOTSTRAP_ADMIN_PASSWORD`。本地模型默认指向 Ollama 的 OpenAI-compatible 端点，未启动时会使用仅基于已召回证据的确定性降级答案。

## 数据说明

本地模式使用 Git 忽略的 `data/runtime-store.json` 保存实际运行数据，导入的 BP 原文、主体与证据不会进入代码仓库。仓库内的 `data/demo-store.json` 仅作为空库基线，包含访问平台所需的角色账号，业务数组全部为空。生产模式不读写本地文件，业务状态以 PostgreSQL 为准。运行 `pnpm seed` 会把本地业务数据恢复为空状态。

启动本地服务后，可将一个目录中的 PDF、DOCX、TXT、Markdown、CSV 或 PPTX 材料批量送入知识库：

```bash
pnpm import:knowledge -- "/absolute/path/to/bp-directory"
```

每次导入会在 `data/import-reports/` 生成本地报告。当前 PPTX 会明确记录为解析失败；扫描版或损坏的 PDF 需要先做 OCR 或修复，不会被静默标记为已索引。

## OpenCode BP 深度分析

项目默认使用确定性适配器，便于不依赖模型运行普通开发和测试。启用真实 BP 深度分析时，先启动 OpenCode，并让服务端读取以下配置：

```bash
export BOYUAN_ANALYSIS_ADAPTER=opencode
export BOYUAN_OPENCODE_BASE_URL=http://127.0.0.1:4173/opencode-api/
export BOYUAN_OPENCODE_TIMEOUT_MS=600000
export BOYUAN_DEEP_OPENCODE_PROVIDER_ID=openai
export BOYUAN_DEEP_OPENCODE_MODEL_ID=gpt-5.6-sol
export BOYUAN_DEEP_OPENCODE_VARIANT=xhigh
pnpm dev:server
```

这里的 `4173/opencode-api/` 是本机已有工作台提供的 OpenCode 代理，不需要把服务密码复制到本项目。若改为直连受保护的 OpenCode Server，再同时配置 `BOYUAN_OPENCODE_USERNAME` 和 `BOYUAN_OPENCODE_PASSWORD`。`BOYUAN_OPENCODE_TIMEOUT_MS` 默认 10 分钟，适配深度模型慢链路；超时会主动终止仍在运行的 OpenCode 会话。项目级 `boyuan-bp-deep-analysis` skill 位于 `.agents/skills`，Sequential Thinking MCP 位于 `opencode.json`；真实分析缺少任一调用都会失败，不会回退为演示结果。

## 验证

```bash
pnpm test
pnpm build
```

- [PRD 验收报告](./PRD验收报告.md)
- [UAT 业务验收记录](./UAT业务验收记录.md)
