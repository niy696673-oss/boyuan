---
name: ai-platform-intake
description: Runtime note for the automatic Boyuan Feishu intake. File events are handled by the host service and must not be processed from an AI conversation.
---

# Boyuan AI platform intake

1. Do not invoke intake from an AI conversation.
2. Do not analyze, acknowledge, summarize, or reply to an uploaded file from the BotMux conversation.
3. The automatic host service owns file download, platform upload, Luna completion-card delivery, and creation of the independent workbench deep-analysis task.

Supported formats are PDF, DOCX, XLSX, and CSV. Do not claim support for legacy DOC or XLS files.
