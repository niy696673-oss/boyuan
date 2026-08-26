import type {
  ConversationDetail,
  ConversationSummary,
  UploadResult,
} from "./types";
import {
  authenticatedBrowserFetch,
  requestPlatformJson,
} from "../platform-http";

export { ResearchPlatformApiError } from "../platform-http";

export type PrivateMarketWorkflowSkill =
  | "diagnose-bp"
  | "screen-deal"
  | "extract-risk-flags";

export interface CompanyResearchWorkflowRequest {
  skill: PrivateMarketWorkflowSkill;
  scope: {
    asOfDate: string;
    transactionSide: string;
    stage: string;
    audience: string;
    confidentiality: "public" | "internal" | "restricted";
    decisionOwner: string;
    mode?: "one-minute" | "preliminary" | "re-screen" | "gp-fit";
    mandate?: string;
  };
  inputScopeApproval: {
    approved: true;
    approvedBy: string;
    approvedAt: string;
    sourceIds: string[];
  };
}

export interface CompanyResearchWorkflowSource {
  sourceId: string;
  title: string;
  locator?: string;
}

export interface ResearchPlatformClient {
  listConversations(signal?: AbortSignal): Promise<ConversationSummary[]>;
  getConversation(
    conversationId: string,
    signal?: AbortSignal,
  ): Promise<ConversationDetail>;
  uploadDocument(file: File, signal?: AbortSignal): Promise<UploadResult>;
  getCompanyResearchWorkflowSources?(
    companyId: string,
    signal?: AbortSignal,
  ): Promise<CompanyResearchWorkflowSource[]>;
  startCompanyResearch(
    input: {
      companyId?: string;
      companyName?: string;
      intent: string;
      explicitWebSearch: boolean;
      workflow?: CompanyResearchWorkflowRequest;
    },
    signal?: AbortSignal,
  ): Promise<ConversationDetail>;
  startIndustryResearch(
    input: {
      industryId: string;
      intent: string;
      explicitWebSearch: boolean;
    },
    signal?: AbortSignal,
  ): Promise<ConversationDetail>;
}

export function createResearchPlatformClient(
  fetcher: typeof fetch = authenticatedBrowserFetch,
): ResearchPlatformClient {
  return {
    listConversations: (signal) =>
      requestPlatformJson<ConversationSummary[]>(
        fetcher,
        "/api/v1/conversations",
        { signal },
      ),
    getConversation: (conversationId, signal) =>
      requestPlatformJson<ConversationDetail>(
        fetcher,
        `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
        { signal },
      ),
    uploadDocument: (file, signal) => {
      const body = new FormData();
      body.append("file", file, file.name);
      return requestPlatformJson<UploadResult>(fetcher, "/api/v1/documents", {
        method: "POST",
        body,
        signal,
      });
    },
    getCompanyResearchWorkflowSources: (companyId, signal) =>
      requestPlatformJson<CompanyResearchWorkflowSource[]>(
        fetcher,
        `/api/v1/companies/${encodeURIComponent(companyId)}/workflow-sources`,
        { signal },
      ),
    startCompanyResearch: (input, signal) =>
      requestPlatformJson<ConversationDetail>(
        fetcher,
        "/api/v1/company-research",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          signal,
        },
      ),
    startIndustryResearch: (input, signal) =>
      requestPlatformJson<ConversationDetail>(
        fetcher,
        "/api/v1/industry-research",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          signal,
        },
      ),
  };
}
