import type {
  ReviewDecisionInput,
  ReviewDecisionResponse,
  ReviewQueueResponse,
} from "../../../shared/research-platform-v1";
import {
  authenticatedBrowserFetch,
  requestPlatformJson,
} from "../platform-http";

export interface ReviewQueueClient {
  list(signal?: AbortSignal): Promise<ReviewQueueResponse>;
  decide(
    candidateId: string,
    input: ReviewDecisionInput,
    signal?: AbortSignal,
  ): Promise<ReviewDecisionResponse>;
}

export function createReviewQueueClient(
  fetcher: typeof fetch = authenticatedBrowserFetch,
): ReviewQueueClient {
  return {
    list: (signal) =>
      requestPlatformJson<ReviewQueueResponse>(
        fetcher,
        "/api/v1/review-queue",
        { signal },
      ),
    decide: (candidateId, input, signal) =>
      requestPlatformJson<ReviewDecisionResponse>(
        fetcher,
        `/api/v1/review-queue/${encodeURIComponent(candidateId)}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          signal,
        },
      ),
  };
}
