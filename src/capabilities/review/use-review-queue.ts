import { useEffect, useState } from "react";
import type {
  ReviewDecisionInput,
  ReviewQueueItem,
} from "../../../shared/research-platform-v1";
import type { ReviewQueueClient } from "./client";

export function useReviewQueue(
  client: ReviewQueueClient,
  onCountChange?: (count: number) => void,
  requestedCandidateId?: string,
) {
  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const selected =
    items?.find((item) => item.candidateId === selectedId) || items?.[0];

  useEffect(() => {
    const controller = new AbortController();
    void client
      .list(controller.signal)
      .then((queue) => {
        setItems(queue.items);
        onCountChange?.(queue.total);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : "无法读取待确认内容",
          );
        }
      });
    return () => controller.abort();
  }, [client, onCountChange]);

  useEffect(() => {
    if (
      requestedCandidateId &&
      items?.some((item) => item.candidateId === requestedCandidateId)
    ) {
      setSelectedId(requestedCandidateId);
      setNotice("");
    }
  }, [items, requestedCandidateId]);

  const select = (candidateId: string) => {
    setSelectedId(candidateId);
    setNotice("");
  };

  const decide = async (input: ReviewDecisionInput) => {
    if (!selected || busy) return false;
    const candidateId = selected.candidateId;
    setBusy(true);
    setNotice("");
    try {
      const result = await client.decide(candidateId, input);
      const remainingItems = (items || []).filter(
        (item) => item.candidateId !== candidateId,
      );
      setItems(remainingItems);
      setSelectedId(remainingItems[0]?.candidateId || "");
      onCountChange?.(result.remainingCount);
      setNotice(
        input.action === "reject" ? "候选已驳回" : "候选已确认并写入正式知识",
      );
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "候选处理失败，请重试",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    items,
    selected,
    selectedId,
    loadError,
    busy,
    notice,
    select,
    decide,
  };
}
