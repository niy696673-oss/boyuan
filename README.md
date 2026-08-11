# 博源投资 AI 工作台 Demo

按照《博源投资AI工作台_Demo验证版_PRD_v0.1》实现的本地可运行 Demo。

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

1. 首页输入“帮我了解银河航天”。
2. 查看公司认知包中的知识类型、证据、冲突和产业位置。
3. 打开证据抽屉，核验原始片段和权限。
4. 修正任意知识陈述并形成新版本。
5. 确认完成研究任务。
6. 切换不同角色，验证私人和项目资料隔离。
7. 浏览商业航天产业链，查看来源图谱候选与已确认位置。
8. 使用系统管理员账号开启或关闭外部模型调用。
9. 在“知识管理”查看 105 份资料的处理轨迹、主体候选和质量指标。
10. 上传含 `支持:`、`更新:`、`冲突:` 或 `新增:` 的 TXT/Markdown 演示资料，验证知识合并与版本变化。

### 公司名关联产业链演示

1. 在首页输入“银河航天”，或直接点击“打开认知包”。
2. 系统将公司匹配到“卫星平台系统”节点。
3. 在“上下游知识关联”中查看上游材料、元器件企业，以及下游地面站、卫星互联网服务企业。
4. 每家关联企业均附带可展开的资料摘要；当前演示资料统一标记为“Demo 模拟资料”，不与真实知识库证据混用。

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

Demo 模式仍使用 `data/demo-store.json` 便于一键验证；生产模式不读写该文件，业务状态以 PostgreSQL 为准。运行 `pnpm seed` 可恢复 Demo 初始数据。

内置图谱原始文件：`../knowledge_sources/商业航天/【余香斋】【商业航天】图谱.pdf`。

## 验证

```bash
pnpm test
pnpm build
```

- [PRD 验收报告](./PRD验收报告.md)
- [UAT 业务验收记录](./UAT业务验收记录.md)
