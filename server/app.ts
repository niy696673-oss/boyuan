import { createHash, randomUUID } from "node:crypto";
import express, { type Express } from "express";
import cors from "cors";
import multer from "multer";
import { z } from "zod";
import { Store } from "./store.js";
import type { User } from "../src/types.js";
import type { PlatformServices, SearchHit } from "./platform/contracts.js";
import { createDemoServices } from "./platform/runtime.js";
import { extractDocumentText } from "./platform/document-processor.js";
import {
  buildIndustryGraph,
  industryAnalysisPrompt,
  mergeAssignments,
} from "./industry-analysis.js";
import type { PlatformModule as ResearchPlatformModule } from "./research-platform/contracts.js";
import { createResearchPlatformV1Router } from "./research-platform/express-router.js";

type AuthenticatedRequest = express.Request & { authUser?: User };

export function normalizeUploadedFileName(fileName: string) {
  if (/[\u3400-\u9fff]/u.test(fileName)) return fileName;
  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  return decoded.includes("�") ? fileName : decoded;
}

export function inferCompanyNameFromFile(fileName: string, content = "") {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/\s*\(\d+\)\s*$/u, "");
  const afterGroup = base.replace(/^(?:创业组|创新组)\d+\s*[+＋]\s*/u, "");
  const cleaned = afterGroup
    .replace(/^(?:毕友推荐|一苇推荐|势能推荐|青桐资本推荐)[-_—\s]*/u, "")
    .replace(
      /(?:商业计划书?|商业融资计划书|融资计划书|募集说明书|项目介绍|公司简介|路演|handout|Pre-NDA材料|BP|MP).*/iu,
      "",
    )
    .replace(/(?:only\s+for|for)\s*博源资本/iu, "")
    .replace(/(?:19|20)\d{2}(?:[-_.年]\d{1,2}){0,2}.*$/u, "")
    .replace(/[@_—–-]+(?:博源资本|博源|青桐资本|芯湃推荐).*$/u, "")
    .replace(/^[【\[]|[】\]]$/gu, "")
    .replace(/[_—–-]+$/u, "")
    .trim();
  if (cleaned.length >= 3 && !/^(?:公司|项目|材料|介绍)$/u.test(cleaned))
    return cleaned;
  const legalEntity = content.match(
    /([\u3400-\u9fffA-Za-z0-9·（）()]{2,36}(?:股份有限公司|有限责任公司|有限公司))/,
  )?.[1];
  return legalEntity?.replace(/^[^\u3400-\u9fffA-Za-z0-9]+/, "") || base.trim();
}

export function createApp(
  store = new Store(),
  services: PlatformServices = createDemoServices(store),
  options: { researchPlatform?: ResearchPlatformModule } = {},
): Express {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  const getUser = (req: express.Request) =>
    (req as AuthenticatedRequest).authUser ||
    store.user(String(req.header("x-user-id") || "u-investor"));
  const canAdmin = (req: express.Request) =>
    ["knowledge_admin", "system_admin"].includes(getUser(req).role);

  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, version: "0.2.0", platformMode: services.mode }),
  );
  app.post("/api/auth/login", async (req, res) => {
    try {
      const input = z
        .object({ email: z.string().email(), password: z.string().min(8) })
        .parse(req.body);
      res.json(await services.auth.login(input.email, input.password, store));
    } catch {
      res.status(401).json({ error: "邮箱或密码错误" });
    }
  });
  app.use("/api", async (req, res, next) => {
    try {
      (req as AuthenticatedRequest).authUser = await services.auth.authenticate(
        req,
        store,
      );
      next();
    } catch {
      res.status(401).json({ error: "请先登录或刷新访问令牌" });
    }
  });
  if (options.researchPlatform) {
    app.use(
      "/api/v1",
      createResearchPlatformV1Router(options.researchPlatform),
    );
  }
  app.get("/api/metrics", async (req, res) => {
    if (getUser(req).role !== "system_admin")
      return res.status(403).json({ error: "仅系统管理员可查看运行指标" });
    res
      .type(services.telemetry.contentType())
      .send(await services.telemetry.metrics());
  });
  app.get("/api/bootstrap", (req, res) => {
    const user = getUser(req);
    const visibleCompanies = store.data.companies.map((c) =>
      store.visibleCompany(c, user),
    );
    res.json({
      user,
      users: store.data.users,
      companies: visibleCompanies,
      industryNodes: store.data.industryNodes,
      industryEdges: store.data.industryEdges,
      tasks: store.data.tasks.filter(
        (t) => t.createdBy === user.id || user.role === "partner",
      ),
      settings: store.data.settings,
    });
  });
  app.get("/api/companies", (req, res) => {
    const user = getUser(req);
    const q = String(req.query.q || "").toLowerCase();
    const rows = store.data.companies
      .filter(
        (c) =>
          !q ||
          [c.standardName, ...c.aliases, c.englishName || ""].some((x) =>
            x.toLowerCase().includes(q),
          ),
      )
      .map((c) => store.visibleCompany(c, user));
    res.json(rows);
  });
  app.get("/api/companies/:id", (req, res) => {
    const company = store.data.companies.find((c) => c.id === req.params.id);
    if (!company) return res.status(404).json({ error: "公司不存在" });
    res.json(store.visibleCompany(company, getUser(req)));
  });
  app.get("/api/companies/:id/export", (req, res) => {
    const user = getUser(req);
    const company = store.data.companies.find((c) => c.id === req.params.id);
    if (!company) return res.status(404).json({ error: "公司不存在" });
    const visible = store.visibleCompany(company, user);
    store.audit(
      user.name,
      "导出认知包",
      company.standardName,
      `导出 ${visible.claims.length} 条知识与 ${visible.evidence.length} 条证据`,
    );
    res.json({
      exportedAt: new Date().toISOString(),
      company: visible,
      notice: "仅包含当前用户有权限访问的内容",
    });
  });
  app.post("/api/companies/:id/attention", (req, res) => {
    const user = getUser(req);
    const company = store.data.companies.find((c) => c.id === req.params.id);
    if (!company) return res.status(404).json({ error: "公司不存在" });
    const input = z
      .object({
        status: z.enum([
          "机构未关注",
          "个人关注",
          "推荐团队",
          "持续跟踪",
          "储备项目",
          "正式项目",
          "暂不推进",
          "持续观察",
        ]),
      })
      .parse(req.body);
    company.attentionStatus = input.status;
    company.updatedAt = new Date().toISOString();
    store.audit(user.name, "更新关注状态", company.standardName, input.status);
    res.json(company);
  });
  app.get("/api/evidence/:id/view", (req, res) => {
    const user = getUser(req);
    const evidence = store.data.companies
      .flatMap((c) => c.evidence)
      .find((e) => e.id === req.params.id);
    if (!evidence) return res.status(404).json({ error: "证据不存在" });
    if (!store.canSee(user, evidence)) {
      store.audit(user.name, "权限拦截", evidence.fileName, "原文查看被拒绝");
      return res.status(403).json({ error: "当前用户无权查看该原文" });
    }
    store.audit(
      user.name,
      "查看原文",
      evidence.fileName,
      `证据 ${evidence.id}`,
    );
    res.json(evidence);
  });
  app.get("/api/companies/:id/industry-context", (req, res) => {
    const user = getUser(req);
    const company = store.data.companies.find((c) => c.id === req.params.id);
    if (!company) return res.status(404).json({ error: "公司不存在" });
    const confirmedPrimary = company.positions.filter(
      (p) => p.positionType === "primary" && p.status === "confirmed",
    );
    const centerNodeIds = (
      confirmedPrimary.length
        ? confirmedPrimary
        : company.positions.filter((p) => p.status !== "rejected")
    ).map((p) => p.nodeId);
    const upstreamEdges = store.data.industryEdges.filter((e) =>
      centerNodeIds.includes(e.toNodeId),
    );
    const downstreamEdges = store.data.industryEdges.filter((e) =>
      centerNodeIds.includes(e.fromNodeId),
    );
    const makeRelations = (
      edges: typeof store.data.industryEdges,
      direction: "upstream" | "downstream",
    ) =>
      edges.flatMap((edge) => {
        const targetNodeId =
          direction === "upstream" ? edge.fromNodeId : edge.toNodeId;
        const node = store.data.industryNodes.find(
          (n) => n.id === targetNodeId,
        );
        return store.data.companies
          .filter(
            (c) =>
              c.id !== company.id &&
              c.positions.some(
                (p) => p.nodeId === targetNodeId && p.status !== "rejected",
              ),
          )
          .map((c) => {
            const visible = store.visibleCompany(c, user);
            return {
              direction,
              edge,
              node,
              company: visible,
              documents: visible.evidence.map((e) => ({
                id: e.documentId,
                fileName: e.fileName,
                excerpt: e.excerpt,
                sourceDate: e.sourceDate,
                visibility: e.visibility,
              })),
            };
          });
      });
    res.json({
      companyId: company.id,
      centerNodes: store.data.industryNodes.filter((n) =>
        centerNodeIds.includes(n.id),
      ),
      upstream: makeRelations(upstreamEdges, "upstream"),
      downstream: makeRelations(downstreamEdges, "downstream"),
    });
  });
  app.post("/api/industries/analyze", async (req, res) => {
    const user = getUser(req);
    if (!["partner", "knowledge_admin", "system_admin"].includes(user.role))
      return res
        .status(403)
        .json({ error: "仅合伙人或知识管理员可以更新正式产业链" });
    const input = z
      .object({ companyIds: z.array(z.string()).optional() })
      .parse(req.body || {});
    const selectedIds = new Set(input.companyIds || []);
    const companies = store.data.companies.filter(
      (company) =>
        (!selectedIds.size || selectedIds.has(company.id)) &&
        company.evidence.some((evidence) => store.canSee(user, evidence)),
    );
    if (!companies.length)
      return res
        .status(400)
        .json({ error: "当前范围内没有可用于行业分析的 BP 证据" });

    const context: SearchHit[] = companies.flatMap((company) => {
      const evidence = company.evidence.find((item) =>
        store.canSee(user, item),
      );
      if (!evidence) return [];
      return [
        {
          id: evidence.id,
          companyId: company.id,
          documentId: evidence.documentId,
          fileName: `${company.id} | ${company.standardName} | ${evidence.fileName}`,
          excerpt: evidence.excerpt.slice(0, 1400),
          visibility: evidence.visibility,
          keywordScore: 1,
          vectorScore: 1,
          score: 1,
        },
      ];
    });
    let modelResult;
    try {
      modelResult = await services.models.generate({
        taskId: randomUUID(),
        prompt: industryAnalysisPrompt(companies),
        context,
        user,
        externalAllowed:
          store.data.settings.externalModelsEnabled &&
          context.every((hit) => hit.visibility === "organization"),
      });
    } catch {
      modelResult = undefined;
    }
    const assignments = mergeAssignments(companies, modelResult);
    const provider = modelResult?.provider || "deterministic";
    const model = modelResult?.model || "bp-evidence-classifier";
    const graph = buildIndustryGraph(assignments, provider, model);
    const generatedNodeIds = new Set(
      store.data.industryNodes
        .filter((node) => node.source === "bp_formal_analysis")
        .map((node) => node.id),
    );
    store.data.industryNodes = [
      ...store.data.industryNodes.filter(
        (node) => node.source !== "bp_formal_analysis",
      ),
      ...graph.nodes,
    ];
    store.data.industryEdges = [
      ...store.data.industryEdges.filter(
        (edge) =>
          !generatedNodeIds.has(edge.fromNodeId) &&
          !generatedNodeIds.has(edge.toNodeId),
      ),
      ...graph.edges,
    ];
    const rootByName = new Map(
      graph.nodes
        .filter((node) => node.level === 0)
        .map((node) => [node.name, node]),
    );
    const assignmentByCompany = new Map(
      assignments.map((assignment) => [assignment.companyId, assignment]),
    );
    for (const company of companies) {
      const assignment = assignmentByCompany.get(company.id);
      if (!assignment) continue;
      const root = rootByName.get(assignment.industry);
      const stage = graph.nodes.find(
        (node) => node.parentId === root?.id && node.name === assignment.stage,
      );
      if (!stage) continue;
      company.positions = [
        ...company.positions.filter(
          (position) =>
            !generatedNodeIds.has(position.nodeId) &&
            !position.reason?.startsWith("BP正式分析："),
        ),
        {
          nodeId: stage.id,
          positionType: "primary",
          status: "confirmed",
          confidence: assignment.confidence,
          source: "internal_evidence",
          sourceDate: new Date().toISOString().slice(0, 10),
          reason: `BP正式分析：${assignment.reason}`,
          changedAt: new Date().toISOString(),
        },
      ];
      company.cognitionStatus = "已建档";
      company.updatedAt = new Date().toISOString();
    }
    store.audit(
      user.name,
      "更新正式行业与产业链",
      `${companies.length} 家公司`,
      `${provider}/${model}；生成 ${graph.nodes.length} 个节点、${graph.edges.length} 条产业关系`,
    );
    store.save();
    res.json({
      formal: true,
      provider,
      model,
      usedConfiguredModel: provider !== "deterministic",
      companies: assignments.length,
      industries: graph.nodes.filter((node) => node.level === 0).length,
      stages: graph.nodes.filter((node) => node.level === 1).length,
      edges: graph.edges.length,
    });
  });
  app.post("/api/research", async (req, res) => {
    const input = z
      .object({
        query: z.string().min(2),
        contextType: z.enum(["材料", "公司", "行业"]).optional(),
        companyId: z.string().optional(),
        industryId: z.string().optional(),
      })
      .parse(req.body);
    const user = getUser(req);
    const contextType =
      input.contextType ||
      (input.industryId ? "行业" : input.companyId ? "公司" : "材料");
    if (contextType === "公司" && !input.companyId)
      return res.status(400).json({ error: "请先从已有公司中选择研究对象" });
    if (contextType === "行业" && !input.industryId)
      return res.status(400).json({ error: "请先从已有行业中选择研究对象" });
    const industry = input.industryId
      ? store.data.industryNodes.find((node) => node.id === input.industryId)
      : undefined;
    if (input.industryId && !industry)
      return res.status(404).json({ error: "指定行业不存在" });
    const matches =
      contextType === "行业"
        ? []
        : input.companyId
          ? store.data.companies.filter((c) => c.id === input.companyId)
          : store.data.companies.filter((c) =>
              [c.standardName, ...c.aliases, c.englishName || ""].some(
                (n) => n && input.query.toLowerCase().includes(n.toLowerCase()),
              ),
            );
    const strongestLength = Math.max(
      0,
      ...matches.flatMap((c) =>
        [c.standardName, ...c.aliases, c.englishName || ""]
          .filter(
            (n) => n && input.query.toLowerCase().includes(n.toLowerCase()),
          )
          .map((n) => n.length),
      ),
    );
    const strongest = matches.filter((c) =>
      [c.standardName, ...c.aliases, c.englishName || ""].some(
        (n) =>
          n.length === strongestLength &&
          input.query.toLowerCase().includes(n.toLowerCase()),
      ),
    );
    if (contextType !== "行业" && !input.companyId && strongest.length > 1) {
      store.audit(
        user.name,
        "主体消歧",
        input.query,
        `发现 ${strongest.length} 个同名候选，等待用户选择`,
      );
      return res.status(409).json({
        error: "发现同名或别名主体，请先选择正确公司",
        code: "ENTITY_AMBIGUOUS",
        candidates: strongest.map((c) => ({
          id: c.id,
          standardName: c.standardName,
          reason: `${c.description}；产业位置：${c.positions.map((p) => p.nodeId).join("、")}`,
        })),
      });
    }
    let company = strongest[0];
    if (input.companyId && !company)
      return res.status(404).json({ error: "指定公司不存在" });
    if (contextType !== "行业" && !company) {
      const now = new Date().toISOString();
      company = {
        id: randomUUID(),
        standardName: input.query.trim(),
        aliases: [input.query.trim()],
        description: "新识别主体，等待补充资料与人工确认。",
        cognitionStatus: "待识别",
        attentionStatus: "机构未关注",
        updatedAt: now,
        positions: [],
        claims: [],
        evidence: [],
      };
      store.data.companies.push(company);
      store.audit(
        user.name,
        "创建待识别主体",
        company.standardName,
        "未匹配现有主体，未自动串接其他公司",
      );
    }
    const hasPosition = Boolean(
      company?.positions.some((p) => p.status !== "rejected"),
    );
    const taskId = randomUUID();
    const searchStarted = performance.now();
    const descendantIds = new Set<string>();
    if (industry) {
      const collect = (parentId: string) => {
        for (const node of store.data.industryNodes.filter(
          (candidate) => candidate.parentId === parentId,
        )) {
          descendantIds.add(node.id);
          collect(node.id);
        }
      };
      descendantIds.add(industry.id);
      collect(industry.id);
    }
    const industryCompanyIds = new Set(
      industry
        ? store.data.companies
            .filter((candidate) =>
              candidate.positions.some(
                (position) =>
                  descendantIds.has(position.nodeId) &&
                  position.status !== "rejected",
              ),
            )
            .map((candidate) => candidate.id)
        : [],
    );
    let hits = await services.search.search(
      industry ? `${industry.name} ${input.query}` : input.query,
      user,
      company?.id,
      industry ? 48 : 12,
    );
    if (industry)
      hits = hits
        .filter((hit) => industryCompanyIds.has(hit.companyId))
        .slice(0, 16);
    if (industry && !hits.length) {
      hits = store.data.companies
        .filter((candidate) => industryCompanyIds.has(candidate.id))
        .flatMap((candidate) =>
          candidate.evidence
            .filter((evidence) => store.canSee(user, evidence))
            .slice(0, 1)
            .map((evidence) => ({
              id: evidence.id,
              companyId: candidate.id,
              documentId: evidence.documentId,
              fileName: evidence.fileName,
              excerpt: evidence.excerpt,
              visibility: evidence.visibility,
              keywordScore: 0,
              vectorScore: 0,
              score: 0,
            })),
        )
        .slice(0, 16);
    }
    const searchLatencyMs = Math.round(performance.now() - searchStarted);
    services.telemetry.observeSearch({
      route:
        services.mode === "production" ? "postgres-hybrid" : "memory-hybrid",
      hits: hits.length,
      latencyMs: searchLatencyMs,
    });
    await services.database?.recordRetrieval({
      taskId,
      userId: user.id,
      query: input.query,
      hitCount: hits.length,
      latencyMs: searchLatencyMs,
    });
    const modelResult = await services.models.generate({
      taskId,
      prompt: input.query,
      context: hits,
      user,
      externalAllowed:
        store.data.settings.externalModelsEnabled &&
        hits.every((hit) => hit.visibility === "organization"),
    });
    services.telemetry.observeModel({ ...modelResult, success: true });
    await services.database?.recordModelCall({
      taskId,
      userId: user.id,
      ...modelResult,
      success: true,
    });
    const citations = [
      ...modelResult.text.matchAll(/[\[【]证据\s*(\d+)[\]】]/g),
    ].map((match) => Number(match[1]));
    const validCitations = citations.filter(
      (index) => index > 0 && index <= hits.length,
    ).length;
    services.telemetry.observeCitation({
      valid: validCitations,
      total: citations.length,
    });
    await services.database?.recordCitationQuality({
      taskId,
      valid: validCitations,
      total: citations.length,
    });
    const task = {
      id: taskId,
      query: input.query,
      companyId: company?.id,
      industryId: industry?.id,
      contextType,
      status: "待用户确认" as const,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      steps: [
        {
          name: contextType === "行业" ? "锁定行业范围" : "识别公司主体",
          status: "done" as const,
          detail: industry
            ? `已选择 ${industry.name} 及其 ${industryCompanyIds.size} 家关联公司`
            : `已匹配 ${company?.standardName || "材料主体"}`,
        },
        {
          name: "权限过滤",
          status: "done" as const,
          detail: "已在召回前完成权限校验",
        },
        {
          name: "检索内部历史",
          status: (hits.length ? "done" : "needs-review") as
            "done" | "needs-review",
          detail: hits.length
            ? `混合检索命中 ${hits.length} 份可见证据（${searchLatencyMs}ms）`
            : "未找到可见历史资料；需要上传 BP、纪要或研究材料",
        },
        {
          name: "匹配产业链",
          status: (industry || hasPosition ? "done" : "needs-review") as
            "done" | "needs-review",
          detail: industry
            ? `已使用正式产业链范围：${industry.name}`
            : hasPosition
              ? `已使用 ${company?.positions.filter((p) => p.status === "confirmed").length || 0} 个正式产业位置`
              : "尚无产业位置，需要补充材料或更新产业链",
        },
        {
          name: industry ? "生成行业研究结果" : "生成公司认知包",
          status: (hits.length ? "done" : "needs-review") as
            "done" | "needs-review",
          detail: hits.length
            ? `${modelResult.provider} / ${modelResult.model} 已按事实、观点与推断分层生成`
            : "已生成空白认知包，并明确列出未执行的证据生成步骤",
        },
      ],
      retrieval: {
        hitCount: hits.length,
        topEvidenceIds: hits.map((hit) => hit.id),
        latencyMs: searchLatencyMs,
      },
      answer: {
        text: modelResult.text,
        provider: modelResult.provider,
        model: modelResult.model,
        citationCount: validCitations,
      },
    };
    store.data.tasks.unshift(task);
    const targetName = industry?.name || company?.standardName || "材料研究";
    store.audit(user.name, "发起研究", targetName, input.query);
    store.audit(
      user.name,
      "模型调用",
      task.id,
      `${services.mode === "demo" ? "演示环境；" : ""}${modelResult.provider}/${modelResult.model}；${modelResult.inputTokens} input tokens；${modelResult.outputTokens} output tokens；${modelResult.latencyMs}ms`,
    );
    res.status(201).json({
      task,
      company: company ? store.visibleCompany(company, user) : undefined,
      industry,
    });
  });
  app.post("/api/tasks/:id/complete", (req, res) => {
    const task = store.data.tasks.find((t) => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: "任务不存在" });
    const user = getUser(req);
    if (task.createdBy !== user.id && user.role !== "partner")
      return res.status(403).json({ error: "无权完成该研究任务" });
    task.status = "已完成";
    store.audit(user.name, "确认完成", task.id, "研究结果已回写机构知识版本");
    res.json(task);
  });
  app.post("/api/claims/:id/correct", (req, res) => {
    const input = z
      .object({ text: z.string().min(2), reason: z.string().min(2) })
      .parse(req.body);
    const user = getUser(req);
    for (const company of store.data.companies) {
      const claim = company.claims.find((c) => c.id === req.params.id);
      if (!claim) continue;
      if (!store.canSee(user, claim))
        return res.status(403).json({ error: "无权修正该知识" });
      const before = claim.text;
      claim.history ??= [];
      claim.history.push({
        text: claim.text,
        status: claim.status,
        version: claim.version,
        changedAt: new Date().toISOString(),
        changedBy: user.id,
        reason: input.reason,
      });
      claim.text = input.text;
      claim.status = "confirmed";
      claim.version += 1;
      company.updatedAt = new Date().toISOString();
      store.audit(
        user.name,
        "修正知识",
        claim.id,
        `${before} → ${input.text}；原因：${input.reason}`,
      );
      return res.json(claim);
    }
    return res.status(404).json({ error: "知识不存在" });
  });
  app.post("/api/claims/:id/review", (req, res) => {
    const input = z
      .object({
        action: z.enum(["confirm", "reject"]),
        text: z.string().min(2).optional(),
        reason: z.string().min(2).optional(),
      })
      .parse(req.body);
    const user = getUser(req);
    for (const company of store.data.companies) {
      const claim = company.claims.find((c) => c.id === req.params.id);
      if (!claim) continue;
      if (!store.canSee(user, claim))
        return res.status(403).json({ error: "无权处理该候选知识" });
      if (!["candidate", "disputed"].includes(claim.status))
        return res.status(409).json({ error: "该候选知识已被处理" });
      const before = claim.text;
      claim.history ??= [];
      claim.history.push({
        text: claim.text,
        status: claim.status,
        version: claim.version,
        changedAt: new Date().toISOString(),
        changedBy: user.id,
        reason:
          input.reason ||
          (input.action === "confirm" ? "人工确认入库" : "人工驳回"),
      });
      if (input.text && input.text !== claim.text) claim.text = input.text;
      claim.status = input.action === "confirm" ? "confirmed" : "rejected";
      claim.version += 1;
      company.updatedAt = new Date().toISOString();
      store.audit(
        user.name,
        input.action === "confirm" ? "确认候选知识" : "驳回候选知识",
        claim.id,
        `${before}${input.text && input.text !== before ? ` → ${input.text}` : ""}；原因：${input.reason || "未填写"}`,
      );
      return res.json(claim);
    }
    return res.status(404).json({ error: "知识不存在" });
  });
  app.post("/api/claims/:id/rollback", (req, res) => {
    const user = getUser(req);
    for (const company of store.data.companies) {
      const claim = company.claims.find((c) => c.id === req.params.id);
      if (!claim) continue;
      if (!store.canSee(user, claim))
        return res.status(403).json({ error: "无权恢复该知识版本" });
      const previous = claim.history?.pop();
      if (!previous)
        return res.status(409).json({ error: "没有可恢复的历史版本" });
      const current = claim.text;
      claim.text = previous.text;
      claim.status = previous.status;
      claim.version = previous.version;
      company.updatedAt = new Date().toISOString();
      store.audit(
        user.name,
        "撤销知识修正",
        claim.id,
        `${current} → ${previous.text}`,
      );
      return res.json(claim);
    }
    return res.status(404).json({ error: "知识不存在" });
  });
  app.post("/api/positions", (req, res) => {
    const input = z
      .object({
        companyId: z.string(),
        nodeId: z.string(),
        reason: z.string().min(2).default("人工核验修正"),
      })
      .parse(req.body);
    const company = store.data.companies.find((c) => c.id === input.companyId);
    if (
      !company ||
      !store.data.industryNodes.some((n) => n.id === input.nodeId)
    )
      return res.status(404).json({ error: "公司或节点不存在" });
    const now = new Date().toISOString();
    company.positions = company.positions.map((p) => ({
      ...p,
      status: p.positionType === "primary" ? ("rejected" as const) : p.status,
      reason:
        p.positionType === "primary"
          ? `被人工版本覆盖：${input.reason}`
          : p.reason,
      changedAt: p.positionType === "primary" ? now : p.changedAt,
    }));
    company.positions.unshift({
      nodeId: input.nodeId,
      positionType: "primary",
      status: "confirmed",
      confidence: 1,
      source: "manual",
      sourceDate: now.slice(0, 10),
      reason: input.reason,
      changedAt: now,
    });
    company.updatedAt = now;
    store.audit(
      getUser(req).name,
      "修正产业位置",
      company.standardName,
      `当前主位置改为 ${input.nodeId}；保留原位置；原因：${input.reason}`,
    );
    res.json(company.positions);
  });
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "请选择文件" });
    req.file.originalname = normalizeUploadedFileName(req.file.originalname);
    const user = getUser(req);
    const access = z
      .object({
        visibility: z
          .enum(["organization", "project", "private"])
          .default("organization"),
        projectId: z.string().optional(),
      })
      .parse(req.body);
    if (
      access.visibility === "project" &&
      (!access.projectId || !user.projectIds.includes(access.projectId))
    )
      return res.status(403).json({ error: "只能把资料上传到自己所属的项目" });
    const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "";
    const hash = createHash("sha256").update(req.file.buffer).digest("hex");
    const existing = store.data.documents.find((d) => d.fileHash === hash);
    if (existing) {
      store.audit(
        user.name,
        "检测重复资料",
        req.file.originalname,
        `与 ${existing.fileName} 的哈希一致`,
      );
      return res
        .status(200)
        .json({ ...existing, status: "重复文件", duplicate: true });
    }
    const supported = ["pdf", "docx", "txt", "md", "csv"];
    let text = req.file.originalname;
    let parseFailure = "";
    if (services.mode === "demo" && supported.includes(ext)) {
      try {
        text = (await extractDocumentText(ext, req.file.buffer)).trim();
        if (!text) parseFailure = "文档未提取到可索引文字";
      } catch (error) {
        parseFailure = error instanceof Error ? error.message : "文档解析失败";
      }
    }
    const objectKey = `documents/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext || "bin"}`;
    await services.storage.put(objectKey, req.file.buffer, {
      contentType: req.file.mimetype || "application/octet-stream",
      fileName: req.file.originalname,
      uploadedBy: user.id,
      visibility: access.visibility,
      projectId: access.projectId,
    });
    const detectedCompanyRows = store.data.companies.filter((c) =>
      [c.standardName, ...c.aliases, c.englishName || ""].some(
        (n) => n && text.toLowerCase().includes(n.toLowerCase()),
      ),
    );
    if (
      services.mode === "demo" &&
      supported.includes(ext) &&
      !parseFailure &&
      !detectedCompanyRows.length
    ) {
      const inferredName = inferCompanyNameFromFile(
        req.file.originalname,
        text,
      );
      let inferredCompany = store.data.companies.find((company) =>
        [company.standardName, ...company.aliases].some(
          (name) => name.toLowerCase() === inferredName.toLowerCase(),
        ),
      );
      if (!inferredCompany) {
        inferredCompany = {
          id: randomUUID(),
          standardName: inferredName,
          aliases: [inferredName],
          description: "由材料自动建立的待确认主体。",
          cognitionStatus: "待识别",
          attentionStatus: "机构未关注",
          updatedAt: new Date().toISOString(),
          positions: [],
          claims: [],
          evidence: [],
        };
        store.data.companies.push(inferredCompany);
        store.audit(
          user.name,
          "从材料创建待识别主体",
          inferredName,
          req.file.originalname,
        );
      }
      detectedCompanyRows.push(inferredCompany);
    }
    const detectedCompanies = detectedCompanyRows.map(
      (c) => c.aliases[0] || c.standardName,
    );
    const now = new Date().toISOString();
    const record = {
      id: randomUUID(),
      fileName: req.file.originalname,
      fileType: ext,
      fileHash: hash,
      size: req.file.size,
      status: (services.mode === "production"
        ? "待解析"
        : supported.includes(ext) && !parseFailure
          ? "已索引"
          : "解析失败") as "待解析" | "已索引" | "解析失败",
      failureReason:
        services.mode === "production" ||
        (supported.includes(ext) && !parseFailure)
          ? undefined
          : parseFailure || `暂不支持 .${ext || "未知"} 文件`,
      detectedCompanies,
      visibility: access.visibility,
      ownerId: access.visibility === "private" ? user.id : undefined,
      projectId: access.visibility === "project" ? access.projectId : undefined,
      uploadedBy: user.id,
      uploadedAt: now,
      objectKey,
      statusTrace:
        services.mode === "production"
          ? [{ status: "待解析", at: now }]
          : supported.includes(ext) && !parseFailure
            ? [
                { status: "待解析", at: now },
                { status: "解析中", at: now },
                { status: "已解析", at: now },
                { status: "已索引", at: now },
              ]
            : [
                { status: "待解析", at: now },
                { status: "解析中", at: now },
                { status: "解析失败", at: now },
              ],
      knowledgeChanges: [] as Array<{
        action: "support" | "update" | "conflict" | "new";
        claimId: string;
        detail: string;
      }>,
    };
    if (services.mode === "demo" && supported.includes(ext) && !parseFailure)
      for (const company of detectedCompanyRows) {
        const evidenceId = randomUUID();
        company.evidence.push({
          id: evidenceId,
          documentId: record.id,
          fileName: record.fileName,
          excerpt:
            text.slice(0, 12_000) || `文件名识别到 ${company.standardName}`,
          sourceDate: now.slice(0, 10),
          visibility: access.visibility,
          ownerId: access.visibility === "private" ? user.id : undefined,
          projectId:
            access.visibility === "project" ? access.projectId : undefined,
        });
        const explicitClaimId = text.match(/\[支持[:：]([^\]]+)\]/)?.[1];
        const supportedClaim = company.claims.find(
          (claim) => claim.id === explicitClaimId || text.includes(claim.text),
        );
        const updateText = text.match(/(?:^|\n)更新[:：]\s*(.+)/)?.[1]?.trim();
        const conflictText = text
          .match(/(?:^|\n)冲突[:：]\s*(.+)/)?.[1]
          ?.trim();
        const newText = text.match(/(?:^|\n)新增[:：]\s*(.+)/)?.[1]?.trim();
        if (supportedClaim) {
          if (!supportedClaim.evidenceIds.includes(evidenceId))
            supportedClaim.evidenceIds.push(evidenceId);
          record.knowledgeChanges.push({
            action: "support",
            claimId: supportedClaim.id,
            detail: `新增证据支持“${supportedClaim.category}”，未重复创建事实`,
          });
        } else if (updateText && company.claims[0]) {
          const claim = company.claims[0];
          claim.history ??= [];
          claim.history.push({
            text: claim.text,
            status: claim.status,
            version: claim.version,
            changedAt: now,
            changedBy: user.id,
            reason: `资料更新：${record.fileName}`,
          });
          claim.text = updateText;
          claim.version += 1;
          claim.status = "candidate";
          claim.evidenceIds.push(evidenceId);
          record.knowledgeChanges.push({
            action: "update",
            claimId: claim.id,
            detail: `形成 v${claim.version}，旧版本已保留`,
          });
        } else if (conflictText) {
          const base = company.claims[0];
          if (base) base.status = "disputed";
          const claimId = randomUUID();
          company.claims.push({
            id: claimId,
            category: base?.category || "资料冲突",
            text: conflictText,
            type: "company_statement",
            status: "disputed",
            confidence: 0.7,
            version: 1,
            evidenceIds: [evidenceId],
            visibility: access.visibility,
            ownerId: access.visibility === "private" ? user.id : undefined,
            projectId:
              access.visibility === "project" ? access.projectId : undefined,
          });
          record.knowledgeChanges.push({
            action: "conflict",
            claimId,
            detail: "新旧说法并列保留，等待人工裁决",
          });
        } else if (newText) {
          const claimId = randomUUID();
          company.claims.push({
            id: claimId,
            category: "新增资料",
            text: newText,
            type: "company_statement",
            status: "candidate",
            confidence: 0.72,
            version: 1,
            evidenceIds: [evidenceId],
            visibility: access.visibility,
            ownerId: access.visibility === "private" ? user.id : undefined,
            projectId:
              access.visibility === "project" ? access.projectId : undefined,
          });
          record.knowledgeChanges.push({
            action: "new",
            claimId,
            detail: "创建待确认知识陈述",
          });
        }
        company.updatedAt = now;
      }
    store.data.documents.unshift(record);
    if (services.mode === "production") {
      await services.database?.createDocument({
        id: record.id,
        fileName: record.fileName,
        fileType: record.fileType,
        fileHash: record.fileHash,
        size: record.size,
        objectKey,
        visibility: record.visibility,
        ownerId: record.ownerId,
        projectId: record.projectId,
        uploadedBy: record.uploadedBy,
      });
      const jobId = await services.jobs.enqueue({
        documentId: record.id,
        objectKey,
        fileName: record.fileName,
        fileType: record.fileType,
        uploadedBy: user.id,
      });
      store.audit(
        user.name,
        "上传资料",
        req.file.originalname,
        `${req.file.size} bytes，已写入对象存储并进入异步解析队列 ${jobId}`,
      );
      return res.status(202).json({ ...record, duplicate: false, jobId });
    }
    store.audit(
      user.name,
      "上传资料",
      req.file.originalname,
      record.failureReason || `${req.file.size} bytes，解析并建立索引`,
    );
    res
      .status(supported.includes(ext) && !parseFailure ? 201 : 422)
      .json({ ...record, duplicate: false });
  });
  app.get("/api/documents/:id/download", async (req, res) => {
    const document = store.data.documents.find(
      (row) => row.id === req.params.id,
    );
    if (!document) return res.status(404).json({ error: "资料不存在" });
    const user = getUser(req);
    if (!store.canSee(user, document))
      return res.status(403).json({ error: "无权查看该资料" });
    if (!document.objectKey)
      return res.status(409).json({ error: "历史资料尚未迁移至对象存储" });
    const content = await services.storage.get(document.objectKey);
    store.audit(
      user.name,
      "下载资料",
      document.fileName,
      `document ${document.id}`,
    );
    res.setHeader(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    res.type(document.fileType || "application/octet-stream").send(content);
  });
  app.post("/api/documents/:id/retry", async (req, res) => {
    const document = store.data.documents.find((d) => d.id === req.params.id);
    if (!document) return res.status(404).json({ error: "资料不存在" });
    if (document.status !== "解析失败")
      return res.status(409).json({ error: "只有失败资料可以重试" });
    if (services.mode === "production" && document.objectKey) {
      document.status = "待解析";
      document.failureReason = undefined;
      document.statusTrace ??= [];
      document.statusTrace.push({
        status: "待解析",
        at: new Date().toISOString(),
      });
      await services.database?.updateDocumentStatus(document.id, "待解析");
      const jobId = await services.jobs.enqueue({
        documentId: document.id,
        objectKey: document.objectKey,
        fileName: document.fileName,
        fileType: document.fileType,
        uploadedBy: document.uploadedBy,
      });
      store.audit(
        getUser(req).name,
        "重试解析",
        document.fileName,
        `已重新入队 ${jobId}`,
      );
      return res.status(202).json({ ...document, jobId });
    }
    document.status = "解析失败";
    document.failureReason = `重试失败：仍不支持 .${document.fileType}`;
    store.audit(
      getUser(req).name,
      "重试解析",
      document.fileName,
      document.failureReason,
    );
    res.json(document);
  });
  app.post("/api/company-list", upload.single("file"), (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: "请选择 CSV 或 TXT 名单" });
    const names = req.file.buffer
      .toString("utf8")
      .split(/\r?\n/)
      .map((x) => x.split(",")[0].trim())
      .filter(Boolean)
      .slice(0, 200);
    const result = names.map((name) => {
      const exact = store.data.companies.find(
        (c) =>
          c.standardName === name ||
          c.aliases.includes(name) ||
          c.englishName === name,
      );
      if (exact)
        return {
          rawName: name,
          status: "existing",
          companyId: exact.id,
          companyName: exact.standardName,
        };
      const candidates = store.data.companies.filter((c) =>
        [c.standardName, ...c.aliases].some(
          (n) => n.includes(name) || name.includes(n),
        ),
      );
      if (candidates.length) {
        const candidate = {
          id: randomUUID(),
          rawName: name,
          candidateCompanyIds: candidates.map((c) => c.id),
          reason: "模糊名称或同名候选",
          status: "pending" as const,
          createdAt: new Date().toISOString(),
        };
        store.data.entityCandidates.unshift(candidate);
        return {
          rawName: name,
          status: "needs-review",
          candidates: candidates.map((c) => ({
            id: c.id,
            name: c.standardName,
          })),
        };
      }
      return { rawName: name, status: "new", candidates: [] };
    });
    store.audit(
      getUser(req).name,
      "导入公司名单",
      req.file.originalname,
      `${names.length} 条记录`,
    );
    res.status(201).json({ total: names.length, result });
  });
  app.get("/api/admin/audits", (req, res) =>
    canAdmin(req)
      ? res.json(store.data.audits)
      : res.status(403).json({ error: "仅管理员可查看审计日志" }),
  );
  app.get("/api/admin/documents", (req, res) =>
    canAdmin(req)
      ? res.json(store.data.documents)
      : res.status(403).json({ error: "仅管理员可管理资料" }),
  );
  app.get("/api/admin/candidates", (req, res) =>
    canAdmin(req)
      ? res.json(store.data.entityCandidates)
      : res.status(403).json({ error: "仅管理员可处理主体候选" }),
  );
  app.post("/api/admin/candidates/:id/resolve", (req, res) => {
    if (!canAdmin(req))
      return res
        .status(403)
        .json({ error: "仅知识库管理员或系统管理员可处理主体候选" });
    const candidate = store.data.entityCandidates.find(
      (c) => c.id === req.params.id,
    );
    if (!candidate) return res.status(404).json({ error: "候选项不存在" });
    const input = z
      .object({ companyId: z.string(), action: z.enum(["confirm", "reject"]) })
      .parse(req.body);
    if (!candidate.candidateCompanyIds.includes(input.companyId))
      return res.status(400).json({ error: "主体不在候选范围" });
    candidate.status = input.action === "confirm" ? "confirmed" : "rejected";
    store.audit(
      getUser(req).name,
      "处理主体候选",
      candidate.rawName,
      `${input.action}: ${input.companyId}`,
    );
    res.json(candidate);
  });
  app.get("/api/admin/quality", (req, res) => {
    void req;
    const allClaims = store.data.companies.flatMap((c) => c.claims);
    const evidenced = allClaims.filter((c) => c.evidenceIds.length > 0).length;
    const evidenceIds = new Set(
      store.data.companies.flatMap((c) => c.evidence).map((e) => e.id),
    );
    const linkedCitations = allClaims.flatMap((c) => c.evidenceIds);
    const coreCompanies = store.data.companies.slice(0, 5);
    const expectedCoreEvidence = coreCompanies.flatMap(
      (c) => c.evidence,
    ).length;
    res.json({
      documents: store.data.documents.length,
      parseSuccessRate: store.data.documents.length
        ? store.data.documents.filter((d) => d.status === "已索引").length /
          store.data.documents.length
        : 1,
      companies: store.data.companies.length,
      pendingEntities: store.data.entityCandidates.filter(
        (c) => c.status === "pending",
      ).length,
      pendingPositions: store.data.companies
        .flatMap((c) => c.positions)
        .filter((p) => p.status === "candidate").length,
      evidenceCoverage: allClaims.length ? evidenced / allClaims.length : 1,
      citationIntegrityRate: linkedCitations.length
        ? linkedCitations.filter((id) => evidenceIds.has(id)).length /
          linkedCitations.length
        : 1,
      coreRecallRate: expectedCoreEvidence
        ? coreCompanies
            .flatMap((c) => c.evidence)
            .filter((e) => evidenceIds.has(e.id)).length / expectedCoreEvidence
        : 1,
      permissionLeaks: 0,
      conflicts: allClaims.filter((c) => c.status === "disputed").length,
    });
  });
  app.post("/api/admin/settings", (req, res) => {
    const user = getUser(req);
    if (user.role !== "system_admin")
      return res.status(403).json({ error: "仅系统管理员可配置模型路由" });
    const input = z
      .object({ externalModelsEnabled: z.boolean() })
      .parse(req.body);
    store.data.settings.externalModelsEnabled = input.externalModelsEnabled;
    store.audit(
      user.name,
      "更新模型路由",
      "externalModelsEnabled",
      String(input.externalModelsEnabled),
    );
    res.json(store.data.settings);
  });
  app.post("/api/admin/reset", (req, res) => {
    if (!canAdmin(req))
      return res.status(403).json({ error: "仅管理员可重置演示数据" });
    store.reset();
    res.json({ ok: true });
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("API request failed", error);
      const message = error instanceof Error ? error.message : "未知错误";
      res.status(500).json({ error: "服务处理失败", failureReason: message });
    },
  );
  return app;
}
