import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";

describe("博源投资 AI 工作台 API", () => {
  let store: Store;
  beforeEach(() => {
    store = new Store(true);
  });

  it("健康检查可用", async () => {
    const res = await request(createApp(store)).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("不同用户只获得有权限的证据和知识", async () => {
    const app = createApp(store);
    const investor = await request(app)
      .get("/api/companies/c-galaxy")
      .set("x-user-id", "u-investor");
    const partner = await request(app)
      .get("/api/companies/c-galaxy")
      .set("x-user-id", "u-partner");
    expect(investor.body.evidence.map((x: { id: string }) => x.id)).toContain(
      "e-g3",
    );
    expect(
      partner.body.evidence.map((x: { id: string }) => x.id),
    ).not.toContain("e-g3");
    expect(partner.body.claims.map((x: { id: string }) => x.id)).not.toContain(
      "cl-g4",
    );
  });

  it("可从公司名称发起研究并生成可理解步骤", async () => {
    const res = await request(createApp(store))
      .post("/api/research")
      .set("x-user-id", "u-investor")
      .send({ query: "帮我了解银河航天" });
    expect(res.status).toBe(201);
    expect(res.body.company.id).toBe("c-galaxy");
    expect(res.body.task.status).toBe("待用户确认");
    expect(
      res.body.task.steps.some((x: { name: string }) => x.name === "权限过滤"),
    ).toBe(true);
  });

  it("人工修正形成新版本并留下审计记录", async () => {
    const app = createApp(store);
    const res = await request(app)
      .post("/api/claims/cl-g3/correct")
      .set("x-user-id", "u-investor")
      .send({
        text: "规模化批产能力仍待现场验证。",
        reason: "企业表述缺少交付数据",
      });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.status).toBe("confirmed");
    expect(store.data.audits[0].action).toBe("修正知识");
  });

  it("待确认中心可确认或驳回候选知识并保留版本记录", async () => {
    const app = createApp(store);
    const confirmed = await request(app)
      .post("/api/claims/cl-g4/review")
      .set("x-user-id", "u-investor")
      .send({ action: "confirm", reason: "已核验内部材料" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("confirmed");
    expect(confirmed.body.version).toBe(2);

    const rejected = await request(app)
      .post("/api/claims/cl-g3/review")
      .set("x-user-id", "u-investor")
      .send({ action: "reject", reason: "证据不足" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe("rejected");
    expect(store.data.audits.map((row) => row.action)).toEqual(
      expect.arrayContaining(["确认候选知识", "驳回候选知识"]),
    );
  });

  it("只有系统管理员可以切换外部模型", async () => {
    const app = createApp(store);
    const denied = await request(app)
      .post("/api/admin/settings")
      .set("x-user-id", "u-investor")
      .send({ externalModelsEnabled: true });
    expect(denied.status).toBe(403);
    const allowed = await request(app)
      .post("/api/admin/settings")
      .set("x-user-id", "u-system")
      .send({ externalModelsEnabled: true });
    expect(allowed.status).toBe(200);
    expect(allowed.body.externalModelsEnabled).toBe(true);
  });

  it("完成任务后状态更新为已完成", async () => {
    const res = await request(createApp(store))
      .post("/api/tasks/t-demo/complete")
      .set("x-user-id", "u-investor")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("已完成");
  });

  it("上传资料后完成索引、识别主体并写入审计", async () => {
    const res = await request(createApp(store))
      .post("/api/upload")
      .set("x-user-id", "u-investor")
      .attach("file", Buffer.from("银河航天测试资料"), "银河航天测试.txt");
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("已索引");
    expect(res.body.detectedCompanies).toContain("银河航天");
    expect(store.data.audits[0].action).toBe("上传资料");
  });

  it("以公司名匹配产业链，并关联上下游企业与模拟资料", async () => {
    const app = createApp(store);
    const search = await request(app)
      .get("/api/companies?q=银河航天")
      .set("x-user-id", "u-investor");
    expect(search.body[0].id).toBe("c-galaxy");
    const context = await request(app)
      .get("/api/companies/c-galaxy/industry-context")
      .set("x-user-id", "u-investor");
    expect(context.status).toBe(200);
    expect(
      context.body.centerNodes.some(
        (x: { id: string }) => x.id === "sat-platform",
      ),
    ).toBe(true);
    expect(
      context.body.upstream.some(
        (x: { company: { id: string } }) =>
          x.company.id === "c-aero-electronics",
      ),
    ).toBe(true);
    expect(
      context.body.downstream.some(
        (x: { company: { id: string } }) => x.company.id === "c-ground-network",
      ),
    ).toBe(true);
    const documents = [
      ...context.body.upstream,
      ...context.body.downstream,
    ].flatMap((x: { documents: { fileName: string }[] }) => x.documents);
    expect(
      documents.some((x: { fileName: string }) =>
        x.fileName.includes("Demo模拟"),
      ),
    ).toBe(true);
  });

  it("相同内容再次上传时按哈希识别重复文件", async () => {
    const app = createApp(store);
    const body = Buffer.from("重复资料内容");
    const first = await request(app)
      .post("/api/upload")
      .attach("file", body, "资料A.txt");
    const second = await request(app)
      .post("/api/upload")
      .attach("file", body, "资料B.txt");
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.status).toBe("重复文件");
  });

  it("不支持的资料保留失败原因并允许重试", async () => {
    const app = createApp(store);
    const failed = await request(app)
      .post("/api/upload")
      .attach("file", Buffer.from("binary"), "资料.pptx");
    expect(failed.status).toBe(422);
    expect(failed.body.status).toBe("解析失败");
    expect(failed.body.failureReason).toContain("暂不支持");
    const retry = await request(app).post(
      `/api/documents/${failed.body.id}/retry`,
    );
    expect(retry.status).toBe(200);
    expect(retry.body.failureReason).toContain("重试失败");
  });

  it("公司名单可区分精确匹配、待确认和新主体", async () => {
    const rows = "银河航天\n长光\n尚未收录公司";
    const res = await request(createApp(store))
      .post("/api/company-list")
      .attach("file", Buffer.from(rows), "companies.csv");
    expect(res.status).toBe(201);
    expect(res.body.result.map((x: { status: string }) => x.status)).toEqual([
      "existing",
      "needs-review",
      "new",
    ]);
  });

  it("知识修正可以恢复上一版本", async () => {
    const app = createApp(store);
    const before = store.data.companies
      .find((x) => x.id === "c-galaxy")!
      .claims.find((x) => x.id === "cl-g3")!.text;
    await request(app)
      .post("/api/claims/cl-g3/correct")
      .send({ text: "修正后的结论", reason: "验收版本历史" });
    const rollback = await request(app).post("/api/claims/cl-g3/rollback");
    expect(rollback.status).toBe(200);
    expect(rollback.body.text).toBe(before);
    expect(rollback.body.version).toBe(1);
  });

  it("质量指标返回证据覆盖率与待确认数量", async () => {
    const res = await request(createApp(store)).get("/api/admin/quality");
    expect(res.status).toBe(200);
    expect(res.body.evidenceCoverage).toBeGreaterThan(0);
    expect(res.body).toHaveProperty("pendingEntities");
    expect(res.body.permissionLeaks).toBe(0);
  });

  it("验收数据包含 20 家公司、84 份资料和五家核心公司的十条事实", async () => {
    expect(store.data.companies).toHaveLength(20);
    expect(store.data.documents.length).toBeGreaterThanOrEqual(80);
    expect(store.data.documents.length).toBeLessThanOrEqual(120);
    for (const company of store.data.companies.slice(0, 5))
      expect(company.claims.length).toBeGreaterThanOrEqual(10);
  });

  it("简称、英文名和标准名均归并到同一 Company ID", async () => {
    const app = createApp(store);
    for (const query of [
      "银河航天",
      "GalaxySpace",
      "银河航天（北京）科技有限公司",
    ]) {
      const res = await request(app).post("/api/research").send({ query });
      expect(res.status).toBe(201);
      expect(res.body.company.id).toBe("c-galaxy");
    }
  });

  it("同名简称返回候选主体和判断依据，不直接串错", async () => {
    const res = await request(createApp(store))
      .post("/api/research")
      .send({ query: "研究星舟科技" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ENTITY_AMBIGUOUS");
    expect(res.body.candidates).toHaveLength(2);
    expect(
      res.body.candidates.every((x: { reason: string }) =>
        x.reason.includes("产业位置"),
      ),
    ).toBe(true);
  });

  it("上传相同事实只增加证据，不重复创建当前事实", async () => {
    const app = createApp(store);
    const company = store.data.companies.find((x) => x.id === "c-galaxy")!;
    const beforeClaims = company.claims.length;
    const beforeEvidence = company.claims.find((x) => x.id === "cl-g1")!
      .evidenceIds.length;
    const res = await request(app)
      .post("/api/upload")
      .attach("file", Buffer.from("银河航天\n[支持:cl-g1]"), "支持事实.txt");
    expect(res.status).toBe(201);
    expect(res.body.knowledgeChanges[0].action).toBe("support");
    expect(company.claims.length).toBe(beforeClaims);
    expect(
      company.claims.find((x) => x.id === "cl-g1")!.evidenceIds.length,
    ).toBe(beforeEvidence + 1);
  });

  it("新资料更新形成新版本并在新任务中复用", async () => {
    const app = createApp(store);
    const res = await request(app)
      .post("/api/upload")
      .attach(
        "file",
        Buffer.from("银河航天\n更新：主营新一代低轨宽带通信卫星平台。"),
        "更新资料.txt",
      );
    expect(res.body.knowledgeChanges[0].action).toBe("update");
    const company = store.data.companies.find((x) => x.id === "c-galaxy")!;
    expect(company.claims[0].version).toBe(3);
    expect(company.claims[0].history?.at(-1)?.text).toContain(
      "低轨宽带通信卫星",
    );
    const task = await request(app)
      .post("/api/research")
      .send({ query: "银河航天" });
    expect(task.body.company.claims[0].text).toContain("新一代");
  });

  it("冲突资料并列保留新旧来源", async () => {
    const app = createApp(store);
    const before = store.data.companies.find((x) => x.id === "c-galaxy")!.claims
      .length;
    const res = await request(app)
      .post("/api/upload")
      .attach(
        "file",
        Buffer.from("银河航天\n冲突：公司尚未具备规模化批产条件。"),
        "冲突资料.txt",
      );
    expect(res.body.knowledgeChanges[0].action).toBe("conflict");
    const company = store.data.companies.find((x) => x.id === "c-galaxy")!;
    expect(company.claims.length).toBe(before + 1);
    expect(
      company.claims.filter((x) => x.status === "disputed").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("产业位置修正保留旧位置且新任务复用当前版本", async () => {
    const app = createApp(store);
    const position = await request(app).post("/api/positions").send({
      companyId: "c-galaxy",
      nodeId: "sat-payload",
      reason: "现场核验主营载荷",
    });
    expect(position.status).toBe(200);
    expect(position.body[0].nodeId).toBe("sat-payload");
    expect(
      position.body.some(
        (x: { nodeId: string; status: string }) =>
          x.nodeId === "sat-platform" && x.status === "rejected",
      ),
    ).toBe(true);
    const research = await request(app)
      .post("/api/research")
      .send({ query: "银河航天" });
    expect(research.body.company.positions[0].nodeId).toBe("sat-payload");
    expect(store.data.audits.some((x) => x.action === "发起研究")).toBe(true);
    expect(store.data.audits.some((x) => x.action === "模型调用")).toBe(true);
    expect(store.data.audits.some((x) => x.action === "修正产业位置")).toBe(
      true,
    );
  });

  it("核心资料召回、引用完整率与首屏接口性能达到验收阈值", async () => {
    const app = createApp(store);
    const started = performance.now();
    const company = await request(app)
      .get("/api/companies/c-galaxy")
      .set("x-user-id", "u-investor");
    const elapsed = performance.now() - started;
    const quality = await request(app).get("/api/admin/quality");
    expect(company.status).toBe(200);
    expect(elapsed).toBeLessThan(15_000);
    expect(quality.body.coreRecallRate).toBe(1);
    expect(quality.body.citationIntegrityRate).toBe(1);
  });

  it("未知公司创建待识别主体，不会错误归到默认公司", async () => {
    const res = await request(createApp(store))
      .post("/api/research")
      .send({ query: "尚未收录的量子星航公司" });
    expect(res.status).toBe(201);
    expect(res.body.company.standardName).toBe("尚未收录的量子星航公司");
    expect(res.body.company.cognitionStatus).toBe("待识别");
    expect(res.body.company.positions).toHaveLength(0);
  });

  it("查看证据时再次校验权限并记录审计", async () => {
    const app = createApp(store);
    const allowed = await request(app)
      .get("/api/evidence/e-g3/view")
      .set("x-user-id", "u-investor");
    const denied = await request(app)
      .get("/api/evidence/e-g3/view")
      .set("x-user-id", "u-partner");
    expect(allowed.status).toBe(200);
    expect(denied.status).toBe(403);
    expect(store.data.audits.some((x) => x.action === "查看原文")).toBe(true);
    expect(store.data.audits.some((x) => x.action === "权限拦截")).toBe(true);
  });

  it("导出认知包只包含当前用户可见内容并留下审计", async () => {
    const app = createApp(store);
    const partner = await request(app)
      .get("/api/companies/c-galaxy/export")
      .set("x-user-id", "u-partner");
    expect(partner.status).toBe(200);
    expect(
      partner.body.company.evidence.map((x: { id: string }) => x.id),
    ).not.toContain("e-g3");
    expect(store.data.audits[0].action).toBe("导出认知包");
  });

  it("主体候选仅管理员可处理", async () => {
    const app = createApp(store);
    const denied = await request(app)
      .post("/api/admin/candidates/ec-1/resolve")
      .set("x-user-id", "u-investor")
      .send({ companyId: "c-charming", action: "confirm" });
    const allowed = await request(app)
      .post("/api/admin/candidates/ec-1/resolve")
      .set("x-user-id", "u-admin")
      .send({ companyId: "c-charming", action: "confirm" });
    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
  });

  it("关注状态更新后可在公司认知中持续复用", async () => {
    const app = createApp(store);
    const changed = await request(app)
      .post("/api/companies/c-galaxy/attention")
      .send({ status: "储备项目" });
    const company = await request(app).get("/api/companies/c-galaxy");
    expect(changed.body.attentionStatus).toBe("储备项目");
    expect(company.body.attentionStatus).toBe("储备项目");
    expect(store.data.audits.some((x) => x.action === "更新关注状态")).toBe(
      true,
    );
  });

  it("无权限用户不能通过知识 ID 修正或回滚私人内容", async () => {
    const app = createApp(store);
    const correct = await request(app)
      .post("/api/claims/cl-g4/correct")
      .set("x-user-id", "u-partner")
      .send({ text: "尝试越权修正", reason: "权限测试" });
    const rollback = await request(app)
      .post("/api/claims/cl-g4/rollback")
      .set("x-user-id", "u-partner");
    expect(correct.status).toBe(403);
    expect(rollback.status).toBe(403);
  });

  it("单文件失败不影响同批其他文件完成索引", async () => {
    const app = createApp(store);
    const [valid, invalid] = await Promise.all([
      request(app)
        .post("/api/upload")
        .attach("file", Buffer.from("银河航天有效资料"), "有效资料.txt"),
      request(app)
        .post("/api/upload")
        .attach("file", Buffer.from("invalid"), "失败资料.pptx"),
    ]);
    expect(valid.status).toBe(201);
    expect(valid.body.status).toBe("已索引");
    expect(invalid.status).toBe(422);
    expect(invalid.body.status).toBe("解析失败");
  });

  it("关闭外部模型时研究任务仍通过本地路由运行并留痕", async () => {
    const app = createApp(store);
    expect(store.data.settings.externalModelsEnabled).toBe(false);
    const task = await request(app)
      .post("/api/research")
      .send({ query: "银河航天" });
    expect(task.status).toBe(201);
    expect(
      store.data.audits.find((x) => x.action === "模型调用")?.detail,
    ).toContain("本地 Demo 推理");
  });

  it("候选图谱位置保留来源日期且不会显示为已确认", async () => {
    const company = await request(createApp(store)).get(
      "/api/companies/c-charming",
    );
    const candidate = company.body.positions.find(
      (x: { nodeId: string }) => x.nodeId === "remote-sensing",
    );
    expect(candidate.status).toBe("candidate");
    expect(candidate.source).toBe("source_map");
    expect(candidate.sourceDate).toBe("2025-12-03");
  });

  it("20 家公司规模下连续首屏查询均显著低于 15 秒", async () => {
    const app = createApp(store);
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      const res = await request(app).get("/api/companies/c-galaxy");
      durations.push(performance.now() - started);
      expect(res.status).toBe(200);
    }
    expect(Math.max(...durations)).toBeLessThan(15_000);
  });
});
