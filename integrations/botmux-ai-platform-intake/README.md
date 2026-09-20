# Boyuan AI Platform Intake

Channel adapters for routing Feishu or WeCom BP files and explicit company-research commands to the Boyuan AI platform. Each channel immediately acknowledges the request, returns the independent quick result through the same reply, and starts the durable workbench deep-analysis task in parallel. Thirty seconds is a performance target, not a delivery deadline.

## Feishu configuration

Save a JSON object using `botmux ai-platform-intake:configure <config.json>`:

```json
{
  "schemaVersion": 1,
  "larkAppId": "cli_replace_with_dedicated_bot_app_id",
  "botmuxConfigPath": "/Users/you/.botmux/bots.json",
  "platformBaseUrl": "http://127.0.0.1:4174",
  "platformIntakeKey": "replace-with-at-least-16-characters",
  "publicWorkbenchUrl": "https://demo.example.com/workbench",
  "publicProductUrl": "https://demo.example.com",
  "servicePort": 9470,
  "attachmentRoot": "./attachments",
  "statePath": "./state/jobs.json",
  "retryDelayMs": 1500,
  "timeoutMs": 600000
}
```

`larkAppId` must identify a dedicated BotMux bot whose `apiOnly` field is `true`. This prevents BotMux from opening its own Feishu WebSocket and guarantees that a file event cannot create a Codex/Sol chat session. The plugin reads the matching app secret from `botmuxConfigPath`; do not duplicate the secret in plugin configuration.

`attachmentRoot` is the service-owned download directory. Runtime directories and accepted files may not be symbolic links. There is deliberately no configurable file-size limit; the platform streams uploads and any operational limit should be added only after observed failures justify it.

The platform process must use the same `BOYUAN_FEISHU_INTAKE_KEY` value as `platformIntakeKey`. The plugin service only exposes a loopback health endpoint; Feishu files enter through the dedicated bot's long connection.

`publicWorkbenchUrl` is the new Boyuan workbench base used for the persistent deep-analysis conversation. `publicProductUrl` is the same product UI base used for company-network and industry-chain links. Existing configurations may omit `publicProductUrl`; it then defaults to the origin of `publicWorkbenchUrl`.

## WeCom intelligent bot configuration

Copy `wecom.config.example.json` to a local, untracked runtime path and set the platform and public URLs. The JSON file deliberately contains no WeCom credential. Configure the platform and start the separate WeCom long-connection service with:

```bash
export BOYUAN_WECOM_INTAKE_KEY=replace-with-a-random-secret
export BOYUAN_WECOM_INTAKE_CONFIG_PATH=/absolute/path/to/wecom.config.json
export WECOM_BOT_ID=replace-with-the-enterprise-wecom-bot-id
export WECOM_BOT_SECRET=replace-with-the-enterprise-wecom-bot-secret

npm run build
npm run start:wecom
```

`platformIntakeKey` in `wecom.config.json` must equal `BOYUAN_WECOM_INTAKE_KEY` on the platform process. Leave `wsUrl` unset in a real tenant so the official SDK uses `wss://openws.work.weixin.qq.com`; the optional field exists for an isolated test endpoint and only accepts `wss:` URLs. The local service binds to loopback and exposes `GET /health` on port `9480` by default.

The service uses the official `@wecom/aibot-node-sdk`. It receives `message.text` and `message.file` events over WebSocket, downloads and decrypts the five-minute file URL through the SDK, and never persists `botId` or `secret`. PDF, DOCX, XLSX, and CSV are accepted. WeCom receives normal Markdown-compatible text instead of an interactive card, but the company, identity, product/technology, industry, market, financing, team, highlights, risks, diligence questions, relations, deterministic fund match, confidence, and navigation semantics match the Feishu result.

The implementation can be verified without a real enterprise tenant:

```bash
pnpm exec vitest run tests/wecom-intake-e2e.test.ts
```

This test replays the official WebSocket event shape with a real generated PDF, a fake SDK download/decryption port, the HTTP intake API, SQLite, quick analysis, and the background worker. It does not claim real-tenant authentication or delivery.

## WeChat Customer Service configuration

微信用户可以把聊天中收到的 PDF 直接转发给微信客服账号。该入口使用企业微信“微信客服”API，不依赖企业微信智能机器人，也不要求用户安装企业微信。

Copy `wechat-kf.config.example.json` to a local, untracked runtime path. Keep the Corp ID, application secret, callback token, and EncodingAESKey outside JSON configuration and provide them only through the runtime environment:

```bash
export BOYUAN_WECHAT_KF_INTAKE_CONFIG_PATH=/absolute/path/to/wechat-kf.config.json
export BOYUAN_WECOM_INTAKE_KEY=replace-with-the-platform-intake-secret
export WECOM_CORP_ID=replace-with-the-enterprise-corp-id
export WECHAT_KF_APP_SECRET=replace-with-the-authorized-application-secret
export WECHAT_KF_CALLBACK_TOKEN=replace-with-1-to-32-alphanumeric-characters
export WECHAT_KF_ENCODING_AES_KEY=replace-with-exactly-43-alphanumeric-characters
# Optional: callback-gap recovery; valid range 30000-3600000 ms, default 60000.
export WECHAT_KF_RECOVERY_POLL_INTERVAL_MS=60000

npm run build
npm run start:wechat-kf
```

The service binds to loopback on port `9481` by default. Publish only its `/callback` path behind HTTPS, then enter that URL, the same callback token, and the same EncodingAESKey under the self-built application's “接收消息服务器” setting. Enterprise WeChat verifies the URL immediately with an encrypted GET request, so the service and HTTPS endpoint must already be running. After the callback is saved, add the server's stable public egress IP under “企业可信 IP”. The application must also be selected under 微信客服 → API → 可调用接口的应用.

When a callback arrives, the service verifies its SHA-1 signature and AES-256-CBC envelope, responds `success` before analysis starts, and uses `kf/sync_msg` with a durable per-account cursor. A low-frequency cursor poll recovers gaps when callback delivery is unavailable; callbacks remain the primary low-latency path because tokenless sync is rate-limited by Enterprise WeChat. Each sync window is collected before ingestion so files recalled later in the same window are skipped, remaining PDFs are processed sequentially, and the cursor advances only after ingestion succeeds. Only customer-originated PDF files enter phase one. The media file is capped at the official 20 MB limit, checked by PDF magic bytes, written with mode `0600`, uploaded to the existing `wecom` platform intake API, and then removed. The customer gets one processing message followed by the same BP quick-result fields used by the intelligent-bot channel. Long results are split on line boundaries below the official 2,048-byte text limit, while the workbench deep-analysis conversation starts independently in the background.

Customer text also enters company research: send `宁德时代`, `分析宁德时代`, or `研究一下：宁德时代`. Short single-line company names (2–80 characters) are accepted, including English names; common greetings, acknowledgements, URLs, and questions are ignored. This lightweight syntax check is not company-entity verification; identity resolution remains part of research. The customer receives processing text, then the existing company quick-result fields and a workbench link while deep research runs in the background. Company messages share the callback/poll queue, recall filtering, and durable message-id deduplication with PDFs; restart recovery retains the original receipt. No extra LLM classification call is added.

Company lists may be sent as multiline/numbered text, comma-separated names, or PNG/JPEG/WebP image messages (up to 2MB). A single tool-free Luna vision/text extraction pass identifies names; uncertain image fragments are reported but not researched. Duplicate names are removed. Up to 20 companies per batch are supported; larger batches receive an explicit split request without partially starting research. At most two companies run concurrently. A batch sends one receipt and up to four ordinary-text summary messages (each at most 2048 UTF-8 bytes), including each company's business summary, verification concern, and workbench link. Full quick-result fields and background deep research remain in individual workbench conversations. Batch state and successful reply progress are persisted beside `statePath` in `.company-batches.json`; startup and the recovery poll resume unfinished batches. A failed company does not prevent other companies from completing. Already delivered pages are not intentionally resent; a process crash after remote delivery but before the local checkpoint can still repeat that page.

Configure the list extractor in the service environment using `BOYUAN_OPENCODE_BASE_URL` and `BOYUAN_OPENCODE_DIRECTORY`, plus `BOYUAN_QUICK_CARD_PROVIDER_ID` / `BOYUAN_QUICK_CARD_MODEL_ID` (defaults `openai` / `gpt-5.6-luna`, must support image input). Optional OpenCode HTTP credentials use `BOYUAN_OPENCODE_USERNAME` and `BOYUAN_OPENCODE_PASSWORD`. The existing OpenCode transport is bundled into this integration; no platform server deployment or extra provider credential is required. Missing extraction configuration returns an actionable failure for lists/images while preserving single-company and PDF inputs.

The complete local integration can be verified without a real tenant:

```bash
pnpm exec vitest run tests/wechat-kf-intake-e2e.test.ts
```

This verifies the callback-independent message pump, official message shape, PDF materialization, HTTP platform intake, SQLite-backed conversation, quick result, background deep task, ordinary-text delivery, and duplicate-notification behavior. Real-tenant callback verification, media download, and reply delivery remain separate deployment checks.

## Runtime behavior

- Private-chat commands `分析 <公司名>` and `研究 <公司名>` start company research. Group-chat commands are accepted only when the bot is explicitly mentioned; ordinary chat text never enters the research path.
- A company command creates a durable platform conversation and starts the Sol deep-research task before requesting the independent Luna quick card. The quick card combines existing formal knowledge and material summaries with the same persisted public-search snapshot consumed by deep research, so a research run does not search twice.
- Company quick cards reuse the BP card's common identity, product/technology, industry, market, financing, people, highlight, risk, diligence-question, fund-match, confidence, and navigation skeleton. Their relation section only shows signals explicitly supported by public sources or existing materials and never labels them as BP-mentioned facts.
- Active matched companies may link to existing company-network and confirmed industry-chain pages. New provisional companies and ambiguous matches link only to the deep conversation. Ambiguous matches pause without calling search or Luna and require identity confirmation in the workbench.
- Every Feishu file creates an independent receipt and conversation. Byte-identical files may reuse the stored document. Conversation reuse is a non-blocking platform relevance proposal followed by user confirmation; no fixed time window is used, and the concise Feishu result does not wait for that decision.
- The auto-start service owns the dedicated bot's Feishu long connection and consumes file events before any AI conversation exists. Ordinary BotMux Sol status cards and text replies are structurally absent from this path.
- The direct ingress replies with one processing card before downloading the file. Its Feishu message ID and the minimal source-message metadata needed to redownload are persisted immediately, before file download or platform upload. Startup resumes an orphan receipt after a crash, and completion, failure, and delivery retries update that same card instead of adding another bot reply.
- After a successful upload, the conversation job is persisted first and local cleanup runs immediately afterward, before Luna analysis and card delivery. A cleanup failure becomes an independent durable `cleanupPending` retry and never causes a second upload or conversation. Failed uploads also attempt cleanup before retry. Once a complete job is durable, the redundant processing-card receipt is deleted; retryable pre-upload failures are retained for restart recovery, while permanently unsupported files are marked terminal and skipped at startup.
- An exact BotMux retry resumes the saved job without uploading again.
- A new Feishu message containing identical bytes creates a new receipt/conversation while reusing the platform document by SHA-256.
- Upload acceptance creates the workbench deep-analysis task. The plugin then calls the independent Luna quick-card analysis and never polls the Sol task for the Feishu reply.
- The plugin records end-to-end completion time from the original Feishu event through card delivery. Thirty seconds is an optimization target only: crossing it does not abort Luna or replace a successful result with a fallback card. A fallback card is reserved for an actual quick-analysis failure while the deep task continues.
- `timeoutMs` protects bounded infrastructure operations such as file upload. It is deliberately not applied to the Luna quick-analysis request.
- The durable job store retries completion-card delivery after service restarts without rerunning a successful quick analysis.
- Feishu completion cards use a narrow vertical Card 2.0 layout: company identity, product/technology, industry, market, financing, key people, relation previews, highlights, deterministic fund match, preliminary risks, diligence questions, source summary, confidence, and navigation. Fund match is calculated locally from SQLite fund profiles and is displayed separately from analysis confidence. Evidence, full biographies, the full 13-dimension analysis, and detailed web-source records remain in the workbench.
- Quick-card enrichment only reads existing company aliases and industry placements. It never creates a company, industry, node, or relation. A matched company links to its product network; a matched industry links to its chain. Missing targets link to the continuing deep-analysis conversation, which remains responsible for entity resolution and archiving.
- WeCom follows the same quick/deep split. The first stream reply says the request is processing; the final quick result finishes that same stream. It never creates an intermediate BotMux model turn or adds a separate status narration.
- WeCom file event metadata and the opaque stream receipt are persisted before download. Once platform acceptance is durable, the receipt is removed and only the durable job remains. A pre-acceptance failure finishes the stream with retry guidance; accepted jobs keep retrying final delivery without restarting quick or deep analysis.
# 飞书卡片一致性与外部试用

飞书处理、完成、失败和主体待确认卡片由 `src/cards.ts` 统一渲染。完成卡保留主仓库的灰白分区、产品技术、风险与尽调、基金匹配和模拟清单来源；不展示内部工作台跳转，不承诺后台深度研究。微信文本渠道有独立 renderer，不应把飞书卡片变更视为微信文案已同步。

压测和预览使用同一完成卡入口，禁止额外拼卡或在缺少基金结果时补造分数。构建后通过 stdin 传入实际后端结果：

```sh
node dist/cli/render-card.js < request.json
```

`request.json` 格式为 `{ "kind": "bp", "result": <完整后端 quick-card 响应> }`，公司研究的 `kind` 为 `company_research`。字段缺失会退出失败。该命令只渲染 JSON，不发送消息，也不能证明真人消息接收链路通过。
