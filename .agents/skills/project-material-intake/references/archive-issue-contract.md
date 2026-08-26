# Archive and Issue contract

## Issue 生命周期

| 场景 | Issue 状态 | `archive_state` | 说明 |
| --- | --- | --- | --- |
| 收件/分析中 | `in_progress` | `received` 或 `analyzing` | 已建流程记录，尚未给出待确认结果 |
| 等待成员决定 | `in_review` | `pending_confirmation` | 完整结果已写入，但未归档 |
| 明确确认归档 | `done` | `confirmed` | 第一阶段以 Issue 为可追溯归档记录 |
| 明确不归档 | `cancelled` | `rejected` | 保留审计轨迹，不伪装为已归档 |
| 文件/权限/项目阻塞 | `in_progress` 或 `blocked` | `blocked` | 写清可恢复条件；仅在确实无法推进时使用 `blocked` |

创建资料 Issue 时先不带 assignee，再以 `--no-start` 指派当前 Agent 并更新状态，避免为当前原生聊天再触发重复 Agent 任务。后续操作更新同一 Issue。

## Metadata

仅在值已知且非敏感时设置下列键：

- `source_channel`: `native_feishu` 或 `multica_issue`
- `source_chat_session_id`: 当前聊天会话标识
- `source_message_id`: 来源消息标识
- `batch_id`: 同一收件批次的稳定短标识
- `file_hashes`: 文件名到 SHA-256 的短 JSON 映射
- `document_types`: 主资料类型列表
- `archive_state`: `received`、`analyzing`、`pending_confirmation`、`confirmed`、`rejected` 或 `blocked`
- `archive_backend`: 第一阶段固定为 `multica_issue_phase1`
- `analysis_schema_version`: `1`

metadata 不保存 token、cookie、凭据、文件正文、提取文本、个人敏感信息或长篇分析。长内容放在 Issue 附件或评论中。

## 确认语义

只有成员明确表示“确认归档”或等价语义，并能唯一对应到 Issue/批次时，才把 `archive_state` 改为 `confirmed`。点赞、收到、谢谢、继续、默认选项和超时都不构成确认。回复含糊或同时可能指向多个批次时，先请求澄清。

修改项目或标签、重新分析、补充文件都保持或恢复为 `pending_confirmation`，必须再次明确确认。拒绝归档设置 `rejected` 并取消 Issue。

## 重复与版本

- 同一项目中 SHA-256 相同的文件视为内容重复；关联已有 Issue 或在同一批次记录重复，不创建第二份归档。
- 同名但哈希不同的文件视为候选新版本；记录 `supersedes`/`superseded_by` 关系，不覆盖旧分析。
- 来源消息、批次或 Issue 已存在时，后续指令更新原 Issue。
- 跨项目相同哈希仍保持独立的项目可见性和记录，不跨项目复用正文或分析。

## 原生飞书结果文本

待确认回复的 **Issue 内部紧凑文本**使用以下顺序。该文本可以含人类可读短编号，但若被回传到飞书，仍须遵守禁止清单。

```text
资料已分析，当前为待确认，尚未归档。
项目：<项目名或待确认>
文件：<文件与资料类型>
摘要：<一至三句>
风险/缺失：<最重要项目>
来源：<文件名 + 页码/幻灯片/工作表/章节>
记录：<人类可读短编号，如 ATLAS-50>

请回复以下任一指令：
1. 确认归档
2. 修改项目或标签：<内容>
3. 重新分析：<要求>
4. 不归档
```

「记录：」只用短编号，不要写成 `mention://` 链接。紧凑文本 **禁止** BotMux 字样、批次号、`MAT-*`、`archive_state`、项目区内部路径。重复哈希、MCP 跳过原因写在紧凑文本之后、JSON 代码块之外，不要写进飞书卡片 JSON。

确认、修改、重分析或拒绝后的 Issue 回复必须包含同一短编号、最新状态和下一步。飞书卡片只渲染 `schemaVersion` JSON；JSON 缺失导致文本回退时，回传文本仍须遵守禁止清单。无需另行调用消息发送工具。

## 完成条件

- Issue 状态、`archive_state`、回复措辞一致。
- 原件、结构化分析、来源定位和成员决定可从同一 Issue 追溯。
- 重复/版本关系清楚，待确认记录未被检索成已归档资料。
