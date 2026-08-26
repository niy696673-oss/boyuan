# Analysis contract

本 YAML 是 **Issue 内部**分析结构，不是飞书卡片。字段保持齐全；没有数据时使用空数组、`null` 或带原因的 `unknown`，不删除字段。哈希、MIME、Issue 标识、MCP 跳过原因可以出现在本 YAML 或 JSON 代码块之外的评论文本中，但不得复制进飞书卡片 JSON。

```yaml
status: received | analyzed | needs_input | failed | pending_confirmation | confirmed | rejected
project:
  id: string | null
  name: string | null
  state: confirmed | pending
files:
  - name: string
    media_type: string
    size_bytes: number | null
    sha256: string | null
    readability: readable | partial | unreadable
    document_type: string
    version_relation: new | duplicate | supersedes | unknown
    processing_status: analyzed | needs_input | failed
summary:
  one_line: string
  overview: string
facts:
  - statement: string
    value: string | number | null
    unit: string | null
    period: string | null
    evidence_state: fact | calculated | inference | unknown
    citation_ids: [string]
risks:
  - title: string
    severity: low | medium | high | unknown
    basis: string
    evidence_state: fact | inference | unknown
    citation_ids: [string]
missing_information:
  - item: string
    why_needed: string
tags: [string]
citations:
  - id: string
    file: string
    locator_type: page | slide | sheet_cell | section | timestamp | message
    locator: string
    support: string
warnings: [string]
next_actions:
  - action: string
    owner: member | agent | unknown
    due: YYYY-MM-DD | null
```

## 证据规则

- `fact` 直接来自资料；`calculated` 写出输入和算法；`inference` 说明推理基础；`unknown` 说明缺口。
- 一条 citation 只指向一个可复核位置。页码使用文件页码；页码与印刷页码不同则同时注明。表格使用工作表和单元格/范围，演示文稿使用幻灯片号，音视频使用时间码。
- 每个关键事实和高风险项至少引用一条 citation；没有可用定位时把该项标记为 `unknown` 或 warning。
- 摘要只能概括已列出的事实和推断，不引入新事实。
- 文件名、哈希、Issue 标识等来源信息可记录在 Issue 内部；token、cookie、凭据、整篇提取文本和其他秘密不得进入 metadata。

## 飞书卡片 JSON

飞书卡片是另一套出口，形状为 `schemaVersion` / `title` / `summary` / `sections` / `warnings`。它不是对本 YAML 的逐字段投影。

`sections` 只放分类、事实、风险、缺失、来源定位（文件名+页码/行号/幻灯片/工作表）。

`warnings` **只允许**材料风险，例如：

- 材料为虚构或验收夹具
- 不得当作真实投研资料归档
- 关键字段缺失，无法支撑投资判断

`warnings` 与 `sections` **禁止**：

- ATLAS / Multica Issue 标识、`mention://`
- BotMux、批次号、`MAT-*`、`archive_state`、项目区内部路径
- MCP 服务器名、工具探测、「本运行未连接/已跳过」
- SHA-256、MIME、字节数

## 分析完成条件

- 所有顶层字段存在且状态彼此一致。
- 每个文件都有处理状态，每个事实都有证据状态。
- 关键事实、高风险和缺失信息可追溯到文件或明确缺口。
