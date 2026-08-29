# Boyuan AI Platform Intake

BotMux service plugin for routing Feishu BP files and explicit company-research commands to the Boyuan AI platform. Feishu immediately receives one processing card; the same message is replaced with the concise Luna result when analysis finishes while the independent deep-analysis task continues in the workbench. Thirty seconds is a performance target, not a delivery deadline.

## Configuration

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

## Runtime behavior

- Private-chat commands `分析 <公司名>` and `研究 <公司名>` start company research. Group-chat commands are accepted only when the bot is explicitly mentioned; ordinary chat text never enters the research path.
- A company command creates a durable platform conversation and starts the Sol deep-research task before requesting the independent Luna quick card. The quick card combines existing formal knowledge and material summaries with the same persisted public-search snapshot consumed by deep research, so a research run does not search twice.
- Company quick cards reuse the BP card's common identity, industry, financing, people, highlight, confidence, and navigation skeleton. Their company-specific section shows recent signals and source/material/formal-knowledge/pending-candidate counts; BP-mentioned competitor and upstream/downstream semantics are not reused.
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
- Feishu completion cards follow the BP fact-check design: a white main card, compact green confidence badge, grey fact/highlight panels, individual white fact rows, blue relation rows, company identity, industry/track, financing, key people, highlights, a deterministic confidence score, and BP-mentioned competitor/upstream/downstream counts. Evidence, the full 13-dimension analysis, and web-source details are intentionally omitted.
- Quick-card enrichment only reads existing company aliases and industry placements. It never creates a company, industry, node, or relation. A matched company links to its product network; a matched industry links to its chain. Missing targets link to the continuing deep-analysis conversation, which remains responsible for entity resolution and archiving.
