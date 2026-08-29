import type {
  ReviewDecisionInput,
  ReviewDecisionResponse,
  ReviewBatchDecisionInputV1,
  ReviewBatchDecisionResponseV1,
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
  decideBatch?(
    input: ReviewBatchDecisionInputV1,
    signal?: AbortSignal,
  ): Promise<ReviewBatchDecisionResponseV1>;
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
    decideBatch: (input, signal) =>
      requestPlatformJson<ReviewBatchDecisionResponseV1>(
        fetcher,
        "/api/v1/review-queue/batch-decision",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          signal,
        },
      ),
  };
}
