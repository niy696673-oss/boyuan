import type { ConversationAgent } from './conversation-agent.js';
import type { UsageCollector } from './telemetry/usage-collector.js';
import { createConversationWorkflows, type ConversationPlatform } from './conversation-workflows.js';
import { DirectWechatKfCompanyResearchIngress, DirectWechatKfFileIngress } from './direct-wechat-kf-intake.js';
import { IntakeService } from './intake-service.js';
import { JsonJobStore } from './job-store.js';
import { HttpPlatformClient } from './platform-client.js';
import { WechatConversationDelivery } from './wechat-conversation-delivery.js';
import { WechatConversationIngress, wechatFileInput, wechatRoute } from './wechat-conversation.js';
import { WechatKfFileMaterializer } from './wechat-kf-runtime.js';
import type { WechatKfClient } from './wechat-kf-client.js';
import type { WechatKfIntakeConfig } from './types.js';

/** Exact production composition, also exercised by channel integration tests. */
export function createWechatConversationRuntime(options: {
  config: WechatKfIntakeConfig;
  client: Pick<WechatKfClient, 'sendText' | 'downloadMedia'>;
  agent: ConversationAgent;
  platform?: ConversationPlatform;
  telemetry?: UsageCollector;
  onError(error: unknown): void;
}) {
  const { config, client } = options;
  const store = new JsonJobStore(config.statePath);
  const platform = options.platform ?? new HttpPlatformClient(config.platformBaseUrl,
    config.platformIntakeKey, config.timeoutMs, fetch, 'wecom');
  const materializer = new WechatKfFileMaterializer(config, client);
  const delivery = new WechatConversationDelivery({ client, statePath: `${config.statePath}.outbox.json` });
  const service = new IntakeService({ config, platform, delivery, store,
    releaseAttachment: (attachment) => materializer.release(attachment) });
  const receipts = {
    statusReceiptId: (id: string, key: string) => service.statusCardId(id, key),
    statusReceiptTerminal: (id: string, key: string) => service.isStatusCardTerminal(id, key),
    rememberStatusReceipt: (input: { chatId: string; messageId: string; fileKey: string;
      fileName: string; receipt: string; createdAt: string; senderId: string; metadata?: Record<string, string> }) => {
      const { receipt, ...rest } = input;
      service.rememberStatusCard({ ...rest, cardMessageId: receipt });
    },
    markStatusReceiptTerminal: (id: string, key: string) => service.markStatusCardTerminal(id, key),
  };
  const ingress = new DirectWechatKfFileIngress({ delivery, ...receipts,
    materialize: (message, key) => materializer.materialize(message, key),
    ingestTurn: (turn) => service.ingestTurn(turn) });
  const companyIngress = new DirectWechatKfCompanyResearchIngress({ delivery, ...receipts,
    researchCompany: (turn) => service.researchCompany(turn) });
  const conversation = new WechatConversationIngress({
    statePath: `${config.statePath}.conversations.json`, agent: options.agent,
    telemetry: options.telemetry,
    channel: '微信客服',
    reply: (message, text) => delivery.reply(message, text),
    finish: (message) => delivery.flush(message.messageId),
    ...createConversationWorkflows({ store, platform, service,
      ingestFile: (message) => ingress.handle(wechatFileInput(message)),
      research: (message) => companyIngress.handleResearch({
        ...wechatRoute(message), conversationChatId: message.chatId,
        messageId: message.messageId, receivedAt: message.receivedAt, companyName: message.companyName,
        ...(message.researchKey ? { researchKey: message.researchKey } : {}),
        ...(message.researchFocus ? { researchFocus: message.researchFocus } : {}),
      }),
    }),
    onError: options.onError,
  });
  return { conversation, ingress, companyIngress, delivery, service, store, platform };
}
