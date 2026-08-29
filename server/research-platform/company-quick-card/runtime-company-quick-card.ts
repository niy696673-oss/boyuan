import {
  optional,
  required,
  runtimeOpenCodeOptions,
  type RuntimeEnvironment,
} from '../opencode/runtime-options.js';
import type { CompanyQuickCardAnalysisPort } from './contracts.js';
import { createOpenCodeCompanyQuickCardAdapter } from './opencode-company-quick-card.js';

export function createRuntimeCompanyQuickCardAdapter(
  environment: RuntimeEnvironment,
  options: { directory: string; fetcher?: typeof fetch },
): CompanyQuickCardAnalysisPort | undefined {
  const adapter = optional(environment, 'BOYUAN_COMPANY_QUICK_CARD_ADAPTER')
    ?? optional(environment, 'BOYUAN_QUICK_CARD_ADAPTER')
    ?? 'disabled';
  if (adapter === 'disabled') return undefined;
  if (adapter !== 'opencode') {
    throw new Error(
      `BOYUAN_COMPANY_QUICK_CARD_ADAPTER must be "disabled" or "opencode", received "${adapter}"`,
    );
  }
  const connection = runtimeOpenCodeOptions(environment, options);
  return createOpenCodeCompanyQuickCardAdapter({
    ...connection,
    model: {
      providerId: optional(environment, 'BOYUAN_COMPANY_QUICK_CARD_PROVIDER_ID')
        ?? required(environment, 'BOYUAN_QUICK_CARD_PROVIDER_ID'),
      modelId: optional(environment, 'BOYUAN_COMPANY_QUICK_CARD_MODEL_ID')
        ?? required(environment, 'BOYUAN_QUICK_CARD_MODEL_ID'),
    },
    variant: optional(environment, 'BOYUAN_COMPANY_QUICK_CARD_VARIANT')
      ?? optional(environment, 'BOYUAN_QUICK_CARD_VARIANT')
      ?? 'none',
  });
}
