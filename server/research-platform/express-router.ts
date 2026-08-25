import { Readable } from "node:stream";
import express from "express";
import multer from "multer";
import type {
  CompanyDetail,
  DecideCandidateInput,
  KnowledgeCandidateRecord,
  PlatformModule,
} from "./contracts.js";
import type {
  CompanyDirectoryResponse,
  ReviewDecisionResponse,
  ReviewQueueItem,
  ReviewQueueResponse,
} from "../../shared/research-platform-v1.js";
import {
  PlatformConflictError,
  PlatformInputError,
  PlatformNotFoundError,
} from "./contracts.js";

export function createResearchPlatformV1Router(
  platform: PlatformModule,
): express.Router {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1 },
  });

  router.post("/documents", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        throw new PlatformInputError("multipart_file_required", "请选择文件");
      }
      const fileName = normalizeMultipartFileName(req.file.originalname);
      if (/\.(?:csv|xlsx?)$/iu.test(fileName)) {
        throw new PlatformInputError(
          "company_list_not_available",
          "公司名单能力将在后续阶段接入",
        );
      }
      const result = await platform.ingestDocument({
        fileName,
        mimeType: req.file.mimetype,
        sourceChannel: "web",
        content: Readable.from([req.file.buffer]),
      });
      res.status(201).json(result);
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/conversations", async (_req, res, next) => {
    try {
      res.json(await platform.listConversations());
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/conversations/:conversationId", async (req, res, next) => {
    try {
      res.json(await platform.getConversation(req.params.conversationId));
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/companies", async (_req, res, next) => {
    try {
      const items = await platform.listCompanies();
      const response = {
        items,
        total: items.length,
      } satisfies CompanyDirectoryResponse;
      res.json(response);
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/companies/:companyId", async (req, res, next) => {
    try {
      res.json(await platform.getCompany(req.params.companyId));
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/review-queue", async (_req, res, next) => {
    try {
      const candidates = (await platform.listCandidates()).filter(
        isReviewableCandidate,
      );
      const companyIds = [...new Set(candidates.map((item) => item.companyId))];
      const companies = new Map(
        await Promise.all(
          companyIds.map(async (companyId) => {
            const company = await platform.getCompany(companyId);
            return [companyId, company] as const;
          }),
        ),
      );
      const items = candidates.map((candidate) => {
        const company = companies.get(candidate.companyId);
        if (!company) throw new Error("review_queue_company_missing");
        return toReviewQueueItem(candidate, company);
      });
      const response = {
        items,
        total: items.length,
      } satisfies ReviewQueueResponse;
      res.json(response);
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.post("/review-queue/:candidateId/decision", async (req, res, next) => {
    try {
      const input = reviewDecisionInput(req.params.candidateId, req.body);
      const candidate = await platform.decideCandidate(input);
      const company = await platform.getCompany(candidate.companyId);
      const remainingCount = (await platform.listCandidates()).filter(
        isReviewableCandidate,
      ).length;
      const item = toReviewQueueItem(candidate, company);
      const response = {
        candidate,
        company: item.company,
        currentKnowledge: item.currentKnowledge,
        remainingCount,
      } satisfies ReviewDecisionResponse;
      res.json(response);
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  return router;
}

function isReviewableCandidate(candidate: KnowledgeCandidateRecord) {
  return candidate.status === "pending" || candidate.status === "conflicted";
}

function toReviewQueueItem(
  candidate: KnowledgeCandidateRecord,
  company: CompanyDetail,
): ReviewQueueItem {
  return {
    ...candidate,
    company: {
      companyId: company.companyId,
      canonicalName: company.canonicalName,
      aliases: company.aliases,
      version: company.version,
    },
    currentKnowledge: company.knowledge.filter(
      (knowledge) =>
        knowledge.knowledgeType === candidate.knowledgeType &&
        knowledge.status !== "superseded",
    ),
  };
}

function reviewDecisionInput(
  candidateId: string,
  body: unknown,
): DecideCandidateInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformInputError("invalid_json", "请求内容必须是 JSON 对象");
  }
  const input = body as Record<string, unknown>;
  if (
    typeof input.expectedVersion !== "number" ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 1
  ) {
    throw new PlatformInputError("invalid_version", "候选版本必须是正整数");
  }
  if (
    input.action !== "confirm" &&
    input.action !== "modify" &&
    input.action !== "reject"
  ) {
    throw new PlatformInputError(
      "invalid_confirmation_action",
      "候选操作必须是确认、修改确认或驳回",
    );
  }
  return {
    candidateId,
    expectedVersion: input.expectedVersion as number,
    action: input.action,
    ...(typeof input.statement === "string"
      ? { statement: input.statement }
      : {}),
    ...(typeof input.value === "string" ? { value: input.value } : {}),
    ...(typeof input.effectiveAt === "string"
      ? { effectiveAt: input.effectiveAt }
      : {}),
  };
}

function normalizeMultipartFileName(fileName: string) {
  if (/[㐀-鿿]/u.test(fileName)) return fileName;
  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  return decoded.includes("�") ? fileName : decoded;
}

function handlePlatformError(
  error: unknown,
  response: express.Response,
  next: express.NextFunction,
) {
  if (error instanceof PlatformInputError) {
    response.status(400).json({ error: error.code, message: error.message });
    return;
  }
  if (error instanceof PlatformNotFoundError) {
    response.status(404).json({ error: "not_found", message: error.message });
    return;
  }
  if (error instanceof PlatformConflictError) {
    response.status(409).json({ error: error.code, message: error.message });
    return;
  }
  next(error);
}
