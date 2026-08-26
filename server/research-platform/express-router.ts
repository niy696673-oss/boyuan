import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import express from "express";
import multer from "multer";
import { normalizeUploadedFileName } from "../upload-file-name.js";
import type {
  ConfirmCompanyListRowsInput,
  CompanyDetail,
  DecideCandidateInput,
  KnowledgeCandidateRecord,
  PlatformModule,
  StartCompanyResearchInput,
} from "./contracts.js";
import type {
  CompanyDirectoryResponse,
  IndustryDirectoryResponseV1,
  IndustryReclassificationResponseV1,
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
      const fileName = normalizeUploadedFileName(req.file.originalname);
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

  router.get("/documents/:documentId/content", async (req, res, next) => {
    try {
      const document = await platform.getDocumentContent(
        String(req.params.documentId),
      );
      res.setHeader("content-type", safeContentType(document.mimeType));
      res.setHeader("content-length", String(document.bytes));
      res.setHeader(
        "content-disposition",
        attachmentContentDisposition(document.fileName),
      );
      res.setHeader("cache-control", "private, no-store");
      res.setHeader("x-content-type-options", "nosniff");
      await pipeline(Readable.from(document.content), res);
    } catch (error) {
      if (res.headersSent) {
        next(error);
        return;
      }
      handlePlatformError(error, res, next);
    }
  });

  router.post("/company-lists", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        throw new PlatformInputError("multipart_file_required", "请选择文件");
      }
      const fileName = normalizeUploadedFileName(req.file.originalname);
      if (!/\.(?:csv|xlsx)$/iu.test(fileName)) {
        throw new PlatformInputError(
          "company_list_file_required",
          "公司名单仅支持 CSV 或 XLSX 文件",
        );
      }
      const result = await platform.ingestDocument({
        fileName,
        mimeType: req.file.mimetype,
        sourceChannel: "web",
        purpose: "company_list",
        content: Readable.from([req.file.buffer]),
      });
      res.status(201).json(result);
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/company-lists/:listId", async (req, res, next) => {
    try {
      res.json(await platform.getCompanyList(String(req.params.listId)));
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.post("/company-lists/:listId/confirmations", async (req, res, next) => {
    try {
      const input = companyListConfirmationInput(String(req.params.listId), req.body);
      res.json(await platform.confirmCompanyListRows(input));
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.post("/company-lists/:listId/research", async (req, res, next) => {
    try {
      const companyIds = companyListResearchInput(req.body);
      res.json(await platform.startCompanyListResearch({
        listId: String(req.params.listId),
        companyIds,
      }));
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

  router.post("/tasks/:taskId/cancel", async (req, res, next) => {
    try {
      res.json(await platform.cancelTask(String(req.params.taskId)));
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.post("/company-research", async (req, res, next) => {
    try {
      const input = companyResearchInput(req.body);
      res.status(201).json(await platform.startCompanyResearch(input));
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.post("/industry-research", async (req, res, next) => {
    try {
      const input = industryResearchInput(req.body);
      res.status(201).json(await platform.startIndustryResearch(input));
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

  router.get(
    "/companies/:companyId/workflow-sources",
    async (req, res, next) => {
      try {
        res.json(
          await platform.getCompanyResearchWorkflowSources(
            req.params.companyId,
          ),
        );
      } catch (error) {
        handlePlatformError(error, res, next);
      }
    },
  );

  router.post(
    "/companies/:companyId/documents",
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file) {
          throw new PlatformInputError("multipart_file_required", "请选择文件");
        }
        const fileName = normalizeUploadedFileName(req.file.originalname);
        if (/\.(?:csv|xlsx?)$/iu.test(fileName)) {
          throw new PlatformInputError(
            "company_list_not_available",
            "公司名单请使用名单导入能力",
          );
        }
        const result = await platform.ingestCompanyDocument(
          String(req.params.companyId),
          {
            fileName,
            mimeType: req.file.mimetype,
            sourceChannel: "web",
            content: Readable.from([req.file.buffer]),
          },
        );
        res.status(201).json(result);
      } catch (error) {
        handlePlatformError(error, res, next);
      }
    },
  );

  router.put("/companies/:companyId/watch", async (req, res, next) => {
    try {
      const input = companyWatchInput(req.body);
      res.json(
        await platform.setCompanyWatched(
          String(req.params.companyId),
          input.watched,
          input.expectedVersion,
        ),
      );
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/industries", async (_req, res, next) => {
    try {
      const [items, unclassifiedMaterialCount] = await Promise.all([
        platform.listIndustries(),
        platform.countUnclassifiedIndustryMaterials(),
      ]);
      const response = {
        items,
        total: items.length,
        unclassifiedMaterialCount,
      } satisfies IndustryDirectoryResponseV1;
      res.json(response);
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.post("/industries/reclassify", async (_req, res, next) => {
    try {
      const response =
        (await platform.reclassifyIndustries()) satisfies IndustryReclassificationResponseV1;
      res.json(response);
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/industries/:industryId", async (req, res, next) => {
    try {
      res.json(await platform.getIndustry(String(req.params.industryId)));
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.post(
    "/industries/:industryId/documents",
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file) {
          throw new PlatformInputError("multipart_file_required", "请选择文件");
        }
        const result = await platform.ingestIndustryDocument(
          String(req.params.industryId),
          {
            fileName: normalizeUploadedFileName(req.file.originalname),
            mimeType: req.file.mimetype,
            sourceChannel: "web",
            content: Readable.from([req.file.buffer]),
          },
        );
        res.status(201).json(result);
      } catch (error) {
        handlePlatformError(error, res, next);
      }
    },
  );

  router.put("/industries/:industryId/watch", async (req, res, next) => {
    try {
      const input = industryWatchInput(req.body);
      res.json(await platform.setIndustryWatched(
        String(req.params.industryId),
        input.watched,
        input.expectedVersion,
      ));
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/search", async (req, res, next) => {
    try {
      res.json(await platform.search(String(req.query.q ?? "")));
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/notifications", async (_req, res, next) => {
    try {
      const items = await platform.listNotifications();
      res.json({
        items,
        unreadCount: items.filter((item) => !item.readAt).length,
      });
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.post("/notifications/:notificationId/read", async (req, res, next) => {
    try {
      res.json(await platform.markNotificationRead(String(req.params.notificationId)));
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

function companyResearchInput(body: unknown): StartCompanyResearchInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformInputError("invalid_json", "请求内容必须是 JSON 对象");
  }
  const input = body as Record<string, unknown>;
  if (typeof input.intent !== "string") {
    throw new PlatformInputError(
      "invalid_research_intent",
      "研究意图必须是字符串",
    );
  }
  if (typeof input.explicitWebSearch !== "boolean") {
    throw new PlatformInputError(
      "invalid_search_preference",
      "必须明确是否执行外部搜索",
    );
  }
  if (
    typeof input.companyId !== "string" &&
    typeof input.companyName !== "string"
  ) {
    throw new PlatformInputError(
      "research_company_required",
      "请选择公司或提供公司名称",
    );
  }
  return {
    ...(typeof input.companyId === "string"
      ? { companyId: input.companyId }
      : {}),
    ...(typeof input.companyName === "string"
      ? { companyName: input.companyName }
      : {}),
    intent: input.intent,
    explicitWebSearch: input.explicitWebSearch,
    ...(input.workflow !== undefined
      ? { workflow: companyResearchWorkflowInput(input.workflow) }
      : {}),
  };
}

function companyResearchWorkflowInput(
  value: unknown,
): NonNullable<StartCompanyResearchInput["workflow"]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PlatformInputError(
      "invalid_workflow",
      "投研工作流配置必须是 JSON 对象",
    );
  }
  const workflow = value as Record<string, unknown>;
  if (
    workflow.skill !== "diagnose-bp" &&
    workflow.skill !== "screen-deal" &&
    workflow.skill !== "extract-risk-flags"
  ) {
    throw new PlatformInputError("invalid_workflow_skill", "不支持的投研 Skill");
  }
  if (
    typeof workflow.scope !== "object" ||
    workflow.scope === null ||
    Array.isArray(workflow.scope)
  ) {
    throw new PlatformInputError("workflow_scope_required", "请填写投研范围");
  }
  const scope = workflow.scope as Record<string, unknown>;
  const requiredStrings = [
    "asOfDate",
    "transactionSide",
    "stage",
    "audience",
    "decisionOwner",
  ] as const;
  if (requiredStrings.some((key) => typeof scope[key] !== "string")) {
    throw new PlatformInputError(
      "workflow_scope_required",
      "投研范围字段不完整",
    );
  }
  if (
    scope.confidentiality !== "public" &&
    scope.confidentiality !== "internal" &&
    scope.confidentiality !== "restricted"
  ) {
    throw new PlatformInputError(
      "workflow_confidentiality_invalid",
      "保密级别无效",
    );
  }
  if (
    typeof workflow.inputScopeApproval !== "object" ||
    workflow.inputScopeApproval === null ||
    Array.isArray(workflow.inputScopeApproval)
  ) {
    throw new PlatformInputError(
      "workflow_input_scope_approval_required",
      "请确认本次输入范围",
    );
  }
  const approval = workflow.inputScopeApproval as Record<string, unknown>;
  if (
    approval.approved !== true ||
    typeof approval.approvedBy !== "string" ||
    typeof approval.approvedAt !== "string" ||
    !Array.isArray(approval.sourceIds) ||
    approval.sourceIds.length === 0 ||
    approval.sourceIds.some(
      (sourceId) => typeof sourceId !== "string" || !sourceId.trim(),
    )
  ) {
    throw new PlatformInputError(
      "workflow_input_scope_approval_required",
      "输入范围审批记录无效",
    );
  }
  const sourceIds = [
    ...new Set((approval.sourceIds as string[]).map((sourceId) => sourceId.trim())),
  ];
  if (sourceIds.length !== approval.sourceIds.length) {
    throw new PlatformInputError(
      "workflow_input_scope_approval_invalid",
      "输入范围包含重复的材料来源",
    );
  }
  const methodApproval = workflow.methodAssumptionApproval;
  let parsedMethodApproval:
    | NonNullable<StartCompanyResearchInput["workflow"]>["methodAssumptionApproval"]
    | undefined;
  if (methodApproval !== undefined) {
    if (
      typeof methodApproval !== "object" ||
      methodApproval === null ||
      Array.isArray(methodApproval)
    ) {
      throw new PlatformInputError(
        "workflow_method_approval_invalid",
        "方法审批记录无效",
      );
    }
    const method = methodApproval as Record<string, unknown>;
    if (
      method.approved !== true ||
      typeof method.approvedBy !== "string" ||
      typeof method.approvedAt !== "string"
    ) {
      throw new PlatformInputError(
        "workflow_method_approval_invalid",
        "方法审批记录无效",
      );
    }
    parsedMethodApproval = {
      approved: true,
      approvedBy: method.approvedBy,
      approvedAt: method.approvedAt,
    };
  }
  const mode = scope.mode;
  const validMode = mode === "one-minute" || mode === "preliminary"
    || mode === "re-screen" || mode === "gp-fit";
  return {
    skill: workflow.skill,
    scope: {
      asOfDate: scope.asOfDate as string,
      transactionSide: scope.transactionSide as string,
      stage: scope.stage as string,
      audience: scope.audience as string,
      confidentiality: scope.confidentiality,
      decisionOwner: scope.decisionOwner as string,
      ...(validMode ? { mode } : {}),
      ...(typeof scope.mandate === "string" ? { mandate: scope.mandate } : {}),
    },
    inputScopeApproval: {
      approved: true,
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt,
      sourceIds,
    },
    ...(parsedMethodApproval
      ? { methodAssumptionApproval: parsedMethodApproval }
      : {}),
  };
}

function industryResearchInput(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformInputError("invalid_json", "请求内容必须是 JSON 对象");
  }
  const input = body as Record<string, unknown>;
  if (typeof input.industryId !== "string" || !input.industryId.trim()) {
    throw new PlatformInputError(
      "research_industry_required",
      "请选择需要研究的行业",
    );
  }
  if (typeof input.intent !== "string") {
    throw new PlatformInputError(
      "invalid_research_intent",
      "研究意图必须是字符串",
    );
  }
  if (typeof input.explicitWebSearch !== "boolean") {
    throw new PlatformInputError(
      "invalid_search_preference",
      "必须明确是否执行外部搜索",
    );
  }
  return {
    industryId: input.industryId,
    intent: input.intent,
    explicitWebSearch: input.explicitWebSearch,
  };
}

function companyWatchInput(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformInputError("invalid_json", "请求内容必须是 JSON 对象");
  }
  const input = body as Record<string, unknown>;
  if (typeof input.watched !== "boolean") {
    throw new PlatformInputError("invalid_watch_state", "关注状态必须是布尔值");
  }
  if (
    typeof input.expectedVersion !== "number" ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 1
  ) {
    throw new PlatformInputError("invalid_version", "公司版本必须是正整数");
  }
  return {
    watched: input.watched,
    expectedVersion: input.expectedVersion,
  };
}

function industryWatchInput(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformInputError("invalid_json", "请求内容必须是 JSON 对象");
  }
  const input = body as Record<string, unknown>;
  if (typeof input.watched !== "boolean") {
    throw new PlatformInputError("invalid_watch_state", "关注状态必须是布尔值");
  }
  if (
    typeof input.expectedVersion !== "number" ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 1
  ) {
    throw new PlatformInputError("invalid_version", "行业版本必须是正整数");
  }
  return {
    watched: input.watched,
    expectedVersion: input.expectedVersion,
  };
}

function companyListConfirmationInput(
  listId: string,
  body: unknown,
): ConfirmCompanyListRowsInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformInputError("invalid_json", "请求内容必须是 JSON 对象");
  }
  const rows = (body as Record<string, unknown>).rows;
  if (!Array.isArray(rows)) {
    throw new PlatformInputError("invalid_company_list_rows", "请选择需要确认的名单行");
  }
  return {
    listId,
    rows: rows.map((row) => {
      if (typeof row !== "object" || row === null || Array.isArray(row)) {
        throw new PlatformInputError("invalid_company_list_row", "名单行格式无效");
      }
      const item = row as Record<string, unknown>;
      if (typeof item.rowId !== "string") {
        throw new PlatformInputError("invalid_company_list_row", "名单行 ID 无效");
      }
      if (
        typeof item.expectedVersion !== "number" ||
        !Number.isSafeInteger(item.expectedVersion) ||
        item.expectedVersion < 1
      ) {
        throw new PlatformInputError("invalid_version", "名单行版本必须是正整数");
      }
      return {
        rowId: item.rowId,
        expectedVersion: item.expectedVersion,
        ...(typeof item.companyId === "string" ? { companyId: item.companyId } : {}),
        ...(typeof item.createName === "string" ? { createName: item.createName } : {}),
      };
    }),
  };
}

function companyListResearchInput(body: unknown): string[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformInputError("invalid_json", "请求内容必须是 JSON 对象");
  }
  const companyIds = (body as Record<string, unknown>).companyIds;
  if (!Array.isArray(companyIds) || companyIds.some((item) => typeof item !== "string")) {
    throw new PlatformInputError("invalid_company_ids", "请选择需要研究的公司");
  }
  return companyIds as string[];
}

function handlePlatformError(
  error: unknown,
  response: express.Response,
  next: express.NextFunction,
) {
  if (error instanceof PlatformInputError) {
    response
      .status(error.code === "feishu_intake_unauthorized" ? 401 : 400)
      .json({ error: error.code, message: error.message });
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

function safeContentType(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized && SAFE_DOWNLOAD_CONTENT_TYPES.has(normalized)
    ? normalized
    : "application/octet-stream";
}

const SAFE_DOWNLOAD_CONTENT_TYPES = new Set([
  "application/csv",
  "application/json",
  "application/octet-stream",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/x-markdown",
]);

function attachmentContentDisposition(fileName: string): string {
  const fallback = [...fileName]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 0x20 && codePoint <= 0x7e && character !== '"' && character !== "\\"
        ? character
        : "_";
    })
    .join("")
    .slice(0, 180) || "document";
  const encoded = encodeURIComponent(fileName).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
