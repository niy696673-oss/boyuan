---
name: project-material-intake
description: 处理经 BotMux 桥接送达的飞书项目资料与 Multica Issue 闭环。用于项目区路由读取、项目资料收件与分析、确认归档、修改项目或标签、重新分析、拒绝归档，或检索既有项目资料；建立可追溯 Issue，保留事实来源，并在成员明确确认前停在待确认状态。分析 BP/CIM/teaser、尽调、会议纪要、行业研究时，直接使用本运行已注入的 nei-pevc MCP（与 Mika 同一套），不要以工作区是否「已分配」为前置条件。
---

# Project Material Intake

把当前飞书聊天任务或 Multica Issue 作为唯一入口与回传面。飞书消息与附件由 BotMux 桥接投递；把第一阶段资料记录保存在 Multica Issue 的附件、评论和 metadata 中。保持项目隔离，原件与提取文本不进入 Git。

## 选择分支

- 收到新附件、资料链接或“分析/收件”请求时，执行完整收件流程。
- 收到确认归档、修改项目或标签、重新分析、不归档等后续指令时，定位原 Issue 并继续同一流程实例。
- 收到资料检索或项目区提问时，只检索已授权项目；提问项目情况时先读项目区路由再按需下钻。默认只返回已确认归档的记录，成员明确要求时可列出待确认记录。

普通与项目无关的闲聊不进入收件流程。

## 项目区路由

项目区是仓库外的资料容器。根目录默认 `~/.boyuan/areas`（`BOYUAN_AREA_ROOT` 可覆盖）。每个项目区有 `routes.json`，列出材料与历史分析的相对路径。

读取规则：

- 材料原件：`original`（如 `materials/MAT-A0001/original/<文件名>`）
- 提取正文：`extracted`（如 `materials/MAT-A0001/extracted/text.md`）
- 历史分析：`structured`（如 `analyses/ANL-0001.json`）；人读版为 `readable`

先读 `routes.json` 判断范围，再只打开当前问题需要的路径。Issue 内部引用可写相对路径（或 `areaRoot` + 相对路径）；飞书卡片只写文件名+页码/行号/幻灯片/工作表，不写 `materials/MAT-…` 等项目区内部路径。保留页码、幻灯片号、工作表/单元格、章节或时间码。不要一次加载整个项目区，不要把原件写进 Git。项目区是 Multica Issue 的本地投影，归档状态冲突时以 Issue 为准。

分析契约与资料分类仍以 [`references/analysis-contract.md`](references/analysis-contract.md) 与 [`references/document-taxonomy.md`](references/document-taxonomy.md) 为准，本节只补充路径读法。飞书卡片与 Issue 内部的分流见下文。

## 飞书卡片 vs Issue 内部

BotMux 会把最终评论里的 `schemaVersion` JSON 渲染成飞书卡片。两套出口不得混写。

### 飞书卡片 JSON（`schemaVersion` 代码块）

只允许用户可读结论：

- `title` / `summary`：材料结论与待确认状态
- `sections`：分类、事实、风险、缺失、来源定位。来源写文件名+页码/行号/幻灯片/工作表，不写 `materials/MAT-…` 路径
- `warnings`：只放材料风险（虚构、不得当投研归档、关键字段缺失）

飞书 JSON **禁止**：

- ATLAS / Multica Issue 标识、`mention://` 链接
- BotMux、批次号、`MAT-*`、`archive_state`、项目区内部路径（如 `area-3`）
- MCP 服务器名、工具探测、「本运行未连接/已跳过」
- SHA-256、MIME、字节数等收件核验细节

### Issue 内部

JSON 代码块之外的评论文本、metadata、以及 [`references/analysis-contract.md`](references/analysis-contract.md) 的 YAML 结构仍可记录：Issue 标识、重复哈希关联、MCP 跳过原因、`archive_state`、文件哈希与 MIME。

若仍回传原生飞书紧凑文本：不得含 `mention://` 或 BotMux 字样；「记录：」最多用人类可读短编号（如 `ATLAS-50`），不要写成可点击内部链接。紧凑文本的来源同样只用文件名+定位。

## 收件状态机

### 1. 确定项目与批次

确认所有文件属于哪个 Multica 项目以及是否为同一批次。项目不明确时列出候选并请求选择，把资料保持为待确认；不得把一个项目的内容用于另一个项目。

完成条件：每个文件都有唯一批次标识，以及已确认或明确待确认的项目归属。

### 2. 校验收件

从当前任务可见的附件或链接读取资料。逐项记录文件名、格式、字节数、SHA-256、可读性、重复或版本关系和处理状态；把损坏、加密、权限不足或不支持的文件标记为可恢复失败，并只询问继续处理必需的信息。

完成条件：每个文件都有哈希和可读性结论，或有可执行的补救请求。

### 3. 建立流程记录

先查找同一项目、批次、来源消息或文件哈希对应的已有 Issue。需要新建时：

1. 在目标项目下创建不带 assignee 的资料 Issue，并附上原文件。
2. 使用 `multica issue assign <issue-id> --to-id 35a89fe3-0aae-4ddc-ae8f-66eaf9a19f3c --no-start` 记录归属。
3. 使用 `multica issue status <issue-id> in_progress --no-start` 进入处理态。
4. 按 [`references/archive-issue-contract.md`](references/archive-issue-contract.md) 写入非敏感 metadata；agent 生成的评论先写入当前工作目录的 UTF-8 文件，再通过 `--content-file` 发布。

同一流程的确认、修改、重新分析和拒绝都更新原 Issue，不重复建单。

完成条件：有唯一 Issue 标识，原件或其可追溯来源已记录，归属、状态和必需 metadata 均可读。

### 4. 分类与分析

先读 [`references/document-taxonomy.md`](references/document-taxonomy.md) 选择资料类型和最低提取字段，再按格式调用平台内置 PDF、文档、表格或演示文稿能力。分析前读 [`references/analysis-contract.md`](references/analysis-contract.md)，按统一契约输出。

为关键事实保留页码、幻灯片号、工作表/单元格、章节或时间码。把原文事实、计算结果、推断和未知明确分开；没有证据时保留未知。分析 `bp_cim_teaser`、`due_diligence`、`meeting_record`、`industry_research` 时，使用 `nei-pevc` MCP。按 [`references/nei-pevc.md`](references/nei-pevc.md) 加载纪律并套用推荐 Skill，在本地填入分析契约。仅当工具调用失败或资料类型不在上述列表时，跳过 N.E.I.，主流程照旧完成。跳过原因只写入 Issue 内部（JSON 代码块之外的评论文本或 metadata），不得进入飞书卡片 JSON 的 `title` / `summary` / `sections` / `warnings`。

完成条件：每个可读文件都有资料类型和分析状态；统一字段全部出现；关键事实与风险均有来源定位，或明确说明没有可用来源。

### 5. 进入待确认

把完整结构化结果写入 Issue，把 `archive_state` 设为 `pending_confirmation`，再将 Issue 设为 `in_review`。最终评论必须同时包含：

1. Issue 内部文本：简洁摘要、风险、缺失、来源、短编号「记录：」和四种指令。重复哈希关联、MCP 跳过原因、收件核验细节放在这里，不要放进 JSON。
2. 一个 `schemaVersion` JSON 代码块：只含飞书卡片允许字段，遵守上文禁止清单。

四种明确指令：

- 确认归档
- 修改项目或标签
- 重新分析
- 不归档

此时资料仍是待确认记录。

完成条件：Issue 可复核且停在 `in_review`，回复包含四种指令和符合禁止清单的卡片 JSON，没有把待确认资料称为已归档。

### 6. 处理成员决定

- **确认归档**：仅在成员明确指向该 Issue 或可唯一定位的批次并表示确认时，把 `archive_state` 设为 `confirmed`、记录第一阶段后端并将 Issue 设为 `done`。
- **修改项目或标签**：在同一 Issue 中记录修订；涉及换项目时重新检查隔离和权限，再分析受影响部分并回到 `in_review`。
- **重新分析**：保留旧结果与版本关系，追加新结果并回到 `in_review`。
- **不归档**：把 `archive_state` 设为 `rejected`，将 Issue 设为 `cancelled`。
- **含糊回复**：请求必要澄清，保持可恢复状态。

完成条件：成员决定、Issue 状态和 `archive_state` 一致，修改历史可追溯。

## 项目资料检索

按项目、资料类型、标签、文件哈希、Issue 或关键词检索 Issue 记录。默认只返回 `archive_state=confirmed`；成员明确要求时可单独列出待确认记录。结果必须包含 Issue 标识、文件/版本、状态、匹配摘要和来源定位。没有匹配时明确返回未找到，不跨项目补足结果。

完成条件：每条结果均属于已授权项目且可回到原 Issue；待确认与已确认记录清楚分栏。

## 安全边界

- 飞书入口由 BotMux 桥接投递；Issue 任务在 Multica 内完成分析与回写。飞书卡片只回传用户可读结论；内部审计不进卡片。不要持有飞书 token、cookie 或应用凭据，也不要绕过桥接另行向真实飞书会话发消息。
- 只在当前任务和成员明确授权的项目范围内读取、分析和记录资料。
- metadata 只保存短小索引值；文件正文、提取文本、凭据和秘密保存在附件/受控评论或成员批准的后端中。
- 对外发送、权限变更、项目资源变更、部署、付费操作和破坏性处理均先取得对应授权。
