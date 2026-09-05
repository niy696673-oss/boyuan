# Semantica 调研：Context Graph、决策溯源及对博源 AI 平台的适配判断

> 调研日期：2026-08-29
>
> 调研对象：以 [`getsemantica.ai`](https://www.getsemantica.ai/) / [`semantica-agi/semantica`](https://github.com/semantica-agi/semantica) 为主
>
> 证据口径：官网、官方文档、官方 GitHub/PyPI、官方法律与安全页面；涉及成熟度与博源适配的内容明确标为判断或建议

## 一句话结论

Semantica 不是新的大模型，也不是一套现成的研究工作台；它是一套 Python 开源基础设施，用 Context Graph/Knowledge Graph 保存 AI 使用过的结构化知识，把系统显式记录的决策、因果关系、证据来源、时间和规则校验做成可查询、可导出的对象。它与博源“公司长期知识、证据引用、人工确认、知识版本、产业关系”的方向高度相似，但项目仍处于快速迭代的 `0.x` 阶段，依赖面重，近期仍在密集修复安全和正确性问题。因此建议只做隔离的 Python sidecar/离线镜像 PoC，保持博源现有 SQLite 业务内核为唯一事实源，不直接替换正式知识与审核闭环。

## 1. 名称消歧

“Semantica” 至少对应四个不同项目，不能只按名称默认指向：

| 对象 | 是什么 | 本报告处理 |
| --- | --- | --- |
| [Semantica / getsemantica.ai](https://www.getsemantica.ai/) | Python 开源 Context Graph、Knowledge Graph、Decision Intelligence 与 provenance 基础设施；对应 [GitHub 主仓](https://github.com/semantica-agi/semantica) 和 [PyPI 包](https://pypi.org/project/semantica/) | **主调查对象**。它有完整产品站、文档、PyPI 包和约 1.1 万 GitHub stars，并且与博源知识/研究工作台语境最相关。 |
| [Semantica / semantica.sh](https://www.semantica.sh/) | 记录 AI 编程会话、commit/PR 与代码行归因的 Go CLI；代码在 [`semanticash/cli`](https://github.com/semanticash/cli) | 同名但完全不同的“AI 代码来源追踪”产品，不是知识图谱平台。 |
| [Semantica Pro / Cortex Edge](https://saitraining.semantic-ai.com/Pro_Basic/Probasic.htm) | Semantic AI 的老牌语义网络/调查分析桌面产品，现称 Cortex Edge | 同名的商业调查分析产品，不是本报告主对象。 |
| [semantica.ai](https://semantica.ai/) | Chair of Transitions 的 Computational Humanities 交互项目 | 与 AI 知识基础设施无关。 |

选择 `getsemantica.ai` 作为主对象不是因为它“唯一叫 Semantica”，而是因为它在当前公开项目中可见度最高，且其知识图谱、证据溯源和决策审计能力与博源当前问题最接近。

## 2. 主体、创始人与定位

### 可确认事实

- 官方博客把 [Kaif Ahmad 标为 Founder](https://www.getsemantica.ai/blog/why-semantica)，其官方 GitHub 账号以 “Mohd Kaif” 展示，并标注 [Founder & Core Maintainer](https://github.com/KaifAhmad1)。GitHub 组织 [`semantica-agi`](https://github.com/semantica-agi) 已验证控制 `getsemantica.ai` 域名。
- 官方 LinkedIn 页面自述公司 [成立于 2026 年、团队规模 2–10 人、为私营公司](https://www.linkedin.com/company/semantica-ai)。这属于主体自报信息，不等于独立工商核验。
- 官方定位是 AI 的 “accountability and context layer”：放在 LLM、向量库和 agent framework 旁边或下方，增加结构化上下文、决策记录、来源追踪、时间与规则推理；它不替代 LLM、LangChain 或 LlamaIndex。[官方概念说明](https://docs.getsemantica.ai/concepts/)
- 官方明确区分系统级可解释性和模型内部可解释性：它记录送给模型的 context、系统产出的 decision、provenance 和 audit trail，但不暴露或重建 LLM 的隐藏 chain-of-thought。[官网说明](https://www.getsemantica.ai/)

### 当前不能确认

本轮在 `getsemantica.ai` 的公开一手资料中没有确认到登记法律主体名称、注册地、融资情况或可供采购审查的 DPA。若进入商务或生产采购，应让对方补充公司登记、数据处理协议、支持责任、补丁策略和 SLA，而不能只依据品牌站与 GitHub 组织。

## 3. 产品形态与核心功能

Semantica 不是单一 UI。当前公开产品由以下形态组成：

- Python SDK / PyPI 包：`pip install semantica`；
- `semantica` CLI、FastAPI REST server、MCP server；
- Knowledge Explorer 浏览器 UI；
- Docker、自托管及图/向量数据库适配；
- Agno、CrewAI、LangChain 和多个 AI 开发工具的集成入口。

这些入口可由 [`pyproject.toml` 的 console scripts](https://github.com/semantica-agi/semantica/blob/v0.6.7/pyproject.toml#L262-L268)、[官方架构](https://github.com/semantica-agi/semantica/blob/v0.6.7/ARCHITECTURE.md) 和 [模块总览](https://docs.getsemantica.ai/modules/) 交叉确认。

其主要功能可分成六组：

1. **接入与处理**：读取 PDF、DOCX、PPTX、网页、数据库、流、Snowflake、Databricks、SAP 等；解析、规范化，并按语义、实体、关系或结构切分。[架构文档](https://docs.getsemantica.ai/architecture/)
2. **语义抽取**：NER、关系、事件和三元组抽取；可用无 API key 的 pattern、本地 HuggingFace 或外部 LLM 三种路径。[Semantic Extract 文档](https://docs.getsemantica.ai/reference/semantic_extract/)
3. **知识质量**：实体消歧/去重、冲突检测、ontology、SHACL 校验、版本和时间事实。[Deduplication 文档](https://docs.getsemantica.ai/reference/deduplication/)
4. **Context Graph / GraphRAG**：把实体、关系、事实、agent memory 与 decision 组合为图，并用向量检索加图遍历形成 hybrid retrieval。[Context 文档](https://docs.getsemantica.ai/reference/context/)
5. **决策与规则**：decision 是一等图对象，可显式连接 causal edge，查询相似先例、影响范围和 policy compliance；规则引擎包括 forward chaining、Rete、Datalog 与 SPARQL。[官方模块总览](https://docs.getsemantica.ai/modules/)
6. **溯源与导出**：保存来源、时间、抽取方法、置信度、checksum 等元数据，并导出 RDF、OWL、JSON-LD、Parquet、Cypher、CSV 等。[Provenance 文档](https://docs.getsemantica.ai/reference/provenance/)

## 4. 工作原理与技术架构

官方代码和架构文档给出的主链路是：

```text
Sources
  → Ingest → Parse → Normalize → Split → Extract
  → Conflict Detection → Deduplication → Knowledge Graph
  → Ontology / Reasoning / Provenance / Decisions
  → Vector Store + RDF/LPG Graph Store
  → Export / Explorer / REST / MCP / CLI
```

来源：[v0.6.7 ARCHITECTURE.md](https://github.com/semantica-agi/semantica/blob/v0.6.7/ARCHITECTURE.md)

关键边界如下：

- 图构建、规则推理和 provenance 可以走确定性路径，并不强制调用 LLM；复杂语义抽取则可在 pattern、本地模型和外部 LLM 之间选择。[官方 README](https://github.com/semantica-agi/semantica/tree/v0.6.7#readme)
- Context 层不是“读取模型真实想法”。`record_decision()` 保存的是系统传入的 scenario、reasoning、outcome、confidence 等显式字段，因果边也要由应用显式建立。因此它能审计“系统记录了什么”，不能证明“模型内部实际为何这样想”。[Context API](https://docs.getsemantica.ai/reference/context/)
- 存储是可插拔的，但不同后端并非能力完全等价。官方矩阵把 Neo4j 的 reasoning/analytics 标为完整支持，而多数 RDF/LPG 后端的 provenance 与 reasoning 标为 `Partial`，并要求调用方验证关系属性、named graph、IRI 和查询行为。[存储兼容矩阵](https://github.com/semantica-agi/semantica/blob/v0.6.7/docs/storage-backends.md)
- 小规模可使用内存图、FAISS、本地文件、SQLite provenance 或嵌入式 Oxigraph；生产可接 Neo4j、FalkorDB、Apache AGE、Neptune、Jena/RDF4J/Blazegraph，以及 Qdrant、Weaviate、Milvus、Pinecone、PgVector 或 `sqlite-vec`。[`pyproject.toml` backends](https://github.com/semantica-agi/semantica/blob/v0.6.7/pyproject.toml#L142-L165)

### 一个容易被营销表述掩盖的工程事实

“支持完整 provenance”不等于调用任意抽取器后自动形成持久审计链。官方 reference 明确说明：`NERExtractor(provenance=True)` 只把 provenance metadata 放进抽取对象，仍需应用逐条调用 `ProvenanceManager.track_entity()`；`ProvenanceManager()` 默认还是进程退出即丢失的内存存储，需显式使用 `SQLiteStorage` 才能跨重启保存。[官方 provenance 集成说明](https://github.com/semantica-agi/semantica/blob/v0.6.7/docs/reference/provenance.md#L413-L442)、[SQLite 保存说明](https://github.com/semantica-agi/semantica/blob/v0.6.7/docs/reference/provenance.md#L38-L81)

这意味着若博源试用，必须把 document/block/evidence/candidate/knowledge/decision 的 ID 映射、写入时机和失败事务设计清楚，不能把“装上依赖”当作证据链已完成。

## 5. 定价与商业模式

### 事实

- 开源核心为 MIT License，官网称免费且不锁定供应商。[LICENSE](https://github.com/semantica-agi/semantica/blob/v0.6.7/LICENSE)、[官网 Pricing 区](https://www.getsemantica.ai/)
- `Hosting` 当前为 Early Access，实际仍部署在客户自有 VPC，包含协作、分析和优先支持；官网没有公开金额。
- `Custom Enterprise Deployment` 面向 on-prem / private cloud、定制集成、专业服务和 SLA，同样为询价。
- [安全页面](https://www.getsemantica.ai/security) 明确说它没有 managed cloud；加密、VPC 隔离、审计与 SOC 2 readiness 是协助客户在自有环境配置的事项，不是 Semantica 已持有的认证。

### 推断

其商业模式应是“MIT 开源核心 + 自有基础设施上的部署支持/团队功能 + 企业定制与服务”。由于 Hosting 尚处 Early Access、没有公开价格，当前无法建立可靠 TCO；真正成本会同时包括 Python 运行环境、图/向量后端、模型调用、维护升级和企业支持。

## 6. 数据、隐私与安全

### 官方承诺

- 开源 Python library 不向 Semantica 服务器传输数据，不收集 library telemetry；图计算运行在用户环境。[官方安全页](https://www.getsemantica.ai/security)
- Hosting 和 Enterprise 也部署在客户控制的 VPC/on-prem 环境，官方称没有 managed cloud。[官方安全页](https://www.getsemantica.ai/security)
- 可以使用 HuggingFace/Ollama 等本地模型；也可以主动配置 OpenAI、Anthropic、Groq、LiteLLM 或托管向量/图服务。[LLM 集成文档](https://docs.getsemantica.ai/reference/llms/)

### 必须自己承担的边界

- 一旦选择外部 LLM、托管向量库、网页抓取或企业 connector，输入内容会按所配置第三方的路径离开本机；“Semantica 自身不收集”并不等于“整条链路无外发”。
- 公开安全页没有宣称 Semantica 自身已取得 SOC 2、ISO 27001、HIPAA 等认证；W3C PROV-O 数据模型和 checksum 也不自动等于满足具体监管合规。
- 最近版本包含真实安全修复：[`v0.6.5`](https://github.com/semantica-agi/semantica/releases/tag/v0.6.5) 修复 Explorer 缺失认证、Cypher injection 等问题，翌版 [`v0.6.7`](https://github.com/semantica-agi/semantica/releases/tag/v0.6.7) 仍包含 SSRF hardening。敏感 BP 数据场景必须锁版本、仅绑定内网、复核认证、输入解析和 connector 出站策略。
- `v0.6.7` tag 中的 [`SECURITY.md`](https://github.com/semantica-agi/semantica/blob/v0.6.7/SECURITY.md#L3-L15) 仍把“支持版本”停留在 `0.1.x–0.2.3`，与当前 `0.6.7` 明显不一致。这是安全治理文档漂移，不应忽略。

## 7. 开放性与集成

开放性是 Semantica 的明显优势：

- MIT 开源，PyPI `0.6.7` 由 GitHub Actions Trusted Publishing 发布，并提供来源 commit 与 attestation。[PyPI v0.6.7](https://pypi.org/project/semantica/0.6.7/)
- 同时支持 REST、MCP、CLI 与 Python API；图、RDF、向量、LLM 和 agent framework 均提供适配层。[官方 Integrations](https://github.com/semantica-agi/semantica/tree/v0.6.7#integrations)
- 可以用本地模型和嵌入式存储，也能接企业图数据库与云模型，退出路径包括 RDF、JSON-LD、Parquet、Cypher 等开放格式。

但“模块独立”不代表基础安装轻量。`v0.6.7` 的默认 dependencies 已包含 Torch、Transformers、spaCy、sentence-transformers、FAISS、OpenCV、librosa、PyArrow、绘图库等；即便不用全部功能，`pip install semantica` 的供应链、镜像体积和冷启动面仍然较大。[默认依赖清单](https://github.com/semantica-agi/semantica/blob/v0.6.7/pyproject.toml#L45-L90)

## 8. 成熟度与近期状态

### 2026-08-29 快照事实

- 最新 PyPI/Release 为 [`v0.6.7`，发布于 2026-08-28](https://github.com/semantica-agi/semantica/releases/tag/v0.6.7)；2026-08-29 主分支仍有新合并。
- GitHub API 快照约为 11,179 stars、1,221 forks；32 个 open issues 与 35 个 open PR，合计 67 个 open items。[仓库](https://github.com/semantica-agi/semantica)、[open issues](https://github.com/semantica-agi/semantica/issues?q=is%3Aissue%20state%3Aopen)、[open PRs](https://github.com/semantica-agi/semantica/pulls?q=is%3Apr%20is%3Aopen)
- 仓库创建于 2025-06-25；`v0.6.7` release 自报合并 82 个 PR、来自 37 位贡献者，社区增长和修复速度很快。[GitHub API](https://api.github.com/repos/semantica-agi/semantica)、[`v0.6.7` release](https://github.com/semantica-agi/semantica/releases/tag/v0.6.7)
- 对 `v0.6.7` tag 的本地只读计数为：379 个包内文件、327 个测试目录 Python 文件、约 186,825 行包内 Python、109,296 行测试 Python、5,734 个以 `test_` 命名的测试函数/方法。这里只证明代码与测试规模，**未运行完整测试套件**。
- PyPI metadata 自标 `Development Status :: 5 - Production/Stable`，但版本仍为 `0.x`。[包元数据](https://github.com/semantica-agi/semantica/blob/v0.6.7/pyproject.toml#L5-L34)

### 判断

这是一个关注度高、开发和修复都非常活跃的年轻项目，而不是低变化、高确定性的成熟企业底座。支持这一判断的信号包括：

- 正向信号：MIT、公开源码、活跃贡献、发布 attestation、大量自动化测试、持续安全扫描和快速响应问题；
- 风险信号：`0.x`、发布节奏快、最近仍有核心安全与序列化/embedding/ontology 正确性修复、默认依赖面很大、官网/Quickstart 仍有 `0.5.0/0.6.6` 文案而包已到 `0.6.7`、`SECURITY.md` 支持版本严重滞后。

所以 GitHub stars、绿色 CI、测试数量与官网 “Production Ready” 都只能作为积极信号，不能替代博源自己的中文 BP、页码证据、增量更新、重启恢复、权限与数据不外发 E2E。

## 9. 主要竞品与替代路线

| 对象 | 更擅长什么 | 与 Semantica 的差异 |
| --- | --- | --- |
| [Cognee](https://docs.cognee.ai/getting-started/introduction) | 用 `remember / recall / improve / forget` 把原始数据快速变为 graph + vector agent memory | 更偏成品化的 agent memory 生命周期；Semantica 更强调 ontology、deterministic rules、decision/provenance。 |
| [Graphiti / Zep](https://github.com/getzep/graphiti) | 实时 temporal context graph，处理会话和事实随时间失效/更新；Zep 提供托管规模化能力 | 与 Semantica 的 temporal context 最接近；Graphiti/Zep 更聚焦 agent memory 与低延迟上下文，Semantica 范围更广。 |
| [Microsoft GraphRAG](https://github.com/microsoft/graphrag) | 从语料抽取实体/关系/claims、社区检测和多层社区摘要，用于复杂语料问答 | 更像特定 GraphRAG indexing/retrieval 方法；官方仓库已说明处于 maintenance mode。Semantica 还覆盖决策对象、规则、provenance 和多后端。 |
| [LlamaIndex PropertyGraphIndex](https://docs.llamaindex.ai/en/stable/module_guides/indexing/lpg_index_guide/) | 在 LlamaIndex 体系中编排 property graph 构建、存储和检索 | 对已有 LlamaIndex 应用集成更自然；Semantica 更像通用图/治理基础设施。 |

Semantica 官网自己的[九框架比较](https://www.getsemantica.ai/blog/why-semantica)把 per-claim provenance、W3C PROV-O、deterministic reasoning、decision/causal/policy 作为差异点，但它是厂商自述，不是独立 benchmark。实际选型应围绕博源问题验证，不应按功能表宽度决定。

## 10. 对博源 AI 平台的启发与适配

博源当前事实边界是：对话为入口、公司为长期知识主体、候选经人工确认后成为正式知识；第一阶段以单用户 SQLite、持久任务和刷新恢复为核心，并明确暂不引入 PostgreSQL、Redis/BullMQ 等生产迁移。[仓库 README](../../README.md)、[领域语言](../../CONTEXT.md)、[第一阶段规格](../specs/2026-08-26-research-platform-ui-migration.md)

### 概念映射

| 博源对象 | 可借鉴的 Semantica 概念 | 适配判断 |
| --- | --- | --- |
| BP 材料、证据块 | source document、chunk、provenance entry | 高适配；重点是保住 document/block/page/evidence ID，而非重新解析 UI。 |
| 公司、人物、行业、产业链关系 | entity、typed edge、ontology | 高适配；适合做关系查询与跨材料实体统一。 |
| 知识候选、支持/冲突证据 | fact、conflict、provenance | 中高适配；Semantica 可辅助发现与溯源，但不能替代博源人工确认状态机。 |
| 正式知识版本、历史恢复 | temporal fact、change management | 中适配；需以博源现有 `knowledge` 版本为准，图只是可重建投影。 |
| 确认/修改/驳回 | decision、policy gate、audit trail | 概念适配；记录的是明确操作、证据和规则版本，不应保存隐藏 chain-of-thought。 |
| 工作台任务与会话 | AgentContext / decision history | 低到中适配；Semantica 不是完整任务编排、审批队列或产品工作台。 |

### 最值得吸收的三个设计点

1. **把来源链做成一等对象**：从 document → parsed block → extracted entity/relation → candidate → confirmed knowledge 全程保留不可变 ID、来源位置、抽取器版本和 checksum。
2. **把知识状态和时间分开**：同时记录事实在业务世界何时有效、平台何时获知/确认，而不是只靠一列 `updated_at`。
3. **把系统决策写成结构化审计记录**：记录输入证据、应用的规则/模型版本、操作者、输出和后续影响；不把模型隐藏推理冒充可审计证据。

### 不建议现在做的事

- 不把 SQLite 业务内核迁成 Neo4j/Oxigraph，也不让 Semantica 成为正式知识的主存储；
- 不把现有 TypeScript `PlatformModule`、TaskStep、会话刷新和确认队列整体改写为 Python；
- 不让它直接读取全部 BP 原文并默认调用外部 LLM；
- 不把 Semantica 的通用 conflict/dedup 结果自动写成正式知识；
- 不把 Knowledge Explorer 当作现有博源 UI 的替代品。

原因是博源当前内核已经有候选、证据关联、知识版本、确认记录、公司/行业关系与审计表，真正缺口更可能是标准化的跨对象 provenance、图查询与时间语义，而不是再造一套存储和工作流。[当前研究内核说明](../../server/research-platform/README.md)、[`platform-module.ts`](../../server/research-platform/platform-module.ts)

## 11. 建议的 PoC

### 形态

做一个**只读 Python sidecar 或离线镜像任务**：从博源 SQLite 导出一小批已确认知识和证据，构建 Semantica 图；所有结果写入独立临时目录，原 SQLite 保持唯一事实源，图可随时删除和重建。

### 最小样本

- 1–3 份真实结构不同的中文 BP：文本 PDF、表格较多 PDF、扫描/OCR PDF 各一份；
- 至少两个公司别名、一个同名歧义、一组支持/冲突事实、一个知识更新/替代案例；
- 20 个固定问题，覆盖精确事实、跨实体关系、时间变化、来源页码和“未知”回答。

### 必须通过的验收

1. 任一回答都能回到博源 `documentId → block/evidenceId → candidate/knowledgeId`，去重/merge/export 后页码和来源不丢；
2. 中文公司、人名、行业、融资关系的抽取与别名合并达到人工可接受水平，并明确 false merge / missed merge；
3. 知识替代、冲突和时间点查询可复现，且不越过人工确认边界；
4. 进程重启后图与 provenance 可读取；删除 sidecar 数据不影响博源；
5. 在禁网环境证明无外发；启用外部模型时能列出每个出站目标和发送字段；
6. 与现有语义检索比较召回质量、引用准确率、P50/P95 延迟、构建耗时、磁盘和内存；
7. 固定 `0.6.7` 版本完成真实 E2E，再评估升级；不能只跑 Semantica 自带单测。

### Go / No-Go

- **Go**：图查询或 provenance 明显提升关系研究与审计能力，且 sidecar 可隔离、可重建、中文质量和运维成本可接受；
- **No-Go**：价值主要来自现有 SQLite 已能表达的版本/审计信息，或者页码 provenance 在抽取/merge/export 后丢失，中文实体质量不足，依赖/安全成本超过收益。

## 12. 风险清单

1. **年轻且变化快**：`0.x`、密集 release 与近期核心修复意味着 API 和行为仍可能变化。
2. **安全边界不能靠默认值**：近期已有 Explorer 缺失认证、注入与 SSRF 修复；生产必须自行限制网络、认证和 connector。
3. **provenance 需要显式接线**：metadata、manager、持久存储和导出不是所有路径自动打通。
4. **后端语义不一致**：官方矩阵已承认多数后端的 provenance/reasoning 只有 `Partial`。
5. **默认依赖重**：Python sidecar 会引入较大的镜像、供应链与运行资源面；不宜塞进现有 Node 进程。
6. **中文与 BP 质量未证实**：官方示例和 self-reported case studies 不能替代中文 BP、表格、扫描件与公司别名的真实验证。
7. **领域工作流缺失**：没有开箱即用的博源候选确认、组织权限、会话任务和飞书闭环。
8. **合规表达易被误读**：支持 PROV-O、SHACL 或 audit export 不等于自动取得监管合规或第三方认证。
9. **主体与支持责任仍需采购核验**：公开一手材料不足以确认法律主体、DPA、补丁 backport 和 SLA。

## 13. 最终建议

建议把 Semantica 定位为“值得借鉴并做小样本验证的知识图谱/证据链组件”，而不是“博源下一代底座”。优先级依次为：

1. 先借鉴 provenance、双时态和结构化 decision record 的数据设计；
2. 再用隔离 sidecar 验证中文实体关系、页级来源链与 hybrid graph retrieval；
3. 只有 PoC 证明增益显著，才讨论长期依赖或某个独立模块的生产接入；
4. 无论是否采用 Semantica，SQLite 中的业务状态、候选确认和正式知识版本在第一阶段都保持不变。

## 14. 验证边界

- 已检查：官网、官方 docs、GitHub 主仓与 `v0.6.7` tag、PyPI metadata/release attestation、官方安全页、官方 GitHub/LinkedIn 主体资料、主要竞品官方文档。
- 已做：仓库与 tag 元数据核验、源码/测试文件和行数的只读计数、架构/依赖/存储/provenance 文档与近期 release 对照。
- 未做：安装并运行 Semantica、运行其完整测试套件、真实中文 BP PoC、性能 benchmark、安全渗透、工商/融资独立核验、企业报价与合同核验。
- 官网 case studies、性能和“trusted in production”均为厂商自述；本报告没有把它们当作独立客户证明或采购验收结论。
