import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createApp,
  inferCompanyNameFromFile,
  normalizeUploadedFileName,
} from "../server/app.js";
import { initialStoreData, Store } from "../server/store.js";

describe("博源 AI 平台空库 API", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store({
      initialData: initialStoreData(),
      persistToDisk: false,
    });
  });

  it("健康检查可用", async () => {
    const response = await request(createApp(store)).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("可以从 BP 文件名推断待确认主体名称", () => {
    expect(inferCompanyNameFromFile("毕友推荐-星河科技.pdf")).toBe("星河科技");
    expect(inferCompanyNameFromFile("云川半导体BP(1).pdf")).toBe("云川半导体");
    expect(inferCompanyNameFromFile("创业组05+智能工厂管理系统.pdf")).toBe(
      "智能工厂管理系统",
    );
  });

  it("可以恢复 multipart 中被 Latin-1 解码的中文文件名", () => {
    const garbled = Buffer.from("星河科技BP.pdf", "utf8").toString("latin1");
    expect(normalizeUploadedFileName(garbled)).toBe("星河科技BP.pdf");
    expect(normalizeUploadedFileName("ComputeNet-BP.pdf")).toBe(
      "ComputeNet-BP.pdf",
    );
  });

  it("首次进入时业务数据为空", async () => {
    const response = await request(createApp(store))
      .get("/api/bootstrap")
      .set("x-user-id", "u-investor");

    expect(response.status).toBe(200);
    expect(response.body.companies).toEqual([]);
    expect(response.body.industryNodes).toEqual([]);
    expect(response.body.industryEdges).toEqual([]);
    expect(response.body.tasks).toEqual([]);
    expect(store.data.documents).toEqual([]);
    expect(store.data.audits).toEqual([]);
    expect(store.data.entityCandidates).toEqual([]);
  });

  it("空库可以从研究请求创建待识别公司", async () => {
    const response = await request(createApp(store))
      .post("/api/research")
      .set("x-user-id", "u-investor")
      .send({ query: "示例待研究公司" });

    expect(response.status).toBe(201);
    expect(response.body.company.standardName).toBe("示例待研究公司");
    expect(response.body.company.cognitionStatus).toBe("待识别");
    expect(response.body.company.positions).toEqual([]);
    expect(response.body.company.claims).toEqual([]);
    expect(response.body.company.evidence).toEqual([]);
    expect(store.data.tasks).toHaveLength(1);
  });

  it("空库导入名单时全部标记为新主体", async () => {
    const response = await request(createApp(store))
      .post("/api/company-list")
      .attach(
        "file",
        Buffer.from("待研究公司甲\n待研究公司乙"),
        "companies.csv",
      );

    expect(response.status).toBe(201);
    expect(
      response.body.result.map((row: { status: string }) => row.status),
    ).toEqual(["new", "new"]);
  });

  it("空库质量指标均从零开始", async () => {
    const response = await request(createApp(store))
      .get("/api/admin/quality")
      .set("x-user-id", "u-system");

    expect(response.status).toBe(200);
    expect(response.body.documents).toBe(0);
    expect(response.body.companies).toBe(0);
    expect(response.body.pendingEntities).toBe(0);
    expect(response.body.conflicts).toBe(0);
    expect(response.body.permissionLeaks).toBe(0);
  });

  it("只有系统管理员可以切换外部模型", async () => {
    const app = createApp(store);
    const denied = await request(app)
      .post("/api/admin/settings")
      .set("x-user-id", "u-investor")
      .send({ externalModelsEnabled: true });
    const allowed = await request(app)
      .post("/api/admin/settings")
      .set("x-user-id", "u-system")
      .send({ externalModelsEnabled: true });

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(allowed.body.externalModelsEnabled).toBe(true);
  });

  it("非管理员无法查看审计记录", async () => {
    const response = await request(createApp(store))
      .get("/api/admin/audits")
      .set("x-user-id", "u-investor");
    expect(response.status).toBe(403);
  });

  it("不存在的公司、任务和证据均返回明确错误", async () => {
    const app = createApp(store);
    const company = await request(app).get("/api/companies/not-found");
    const task = await request(app)
      .post("/api/tasks/not-found/complete")
      .send({});
    const evidence = await request(app).get("/api/evidence/not-found/view");

    expect(company.status).toBe(404);
    expect(task.status).toBe(404);
    expect(evidence.status).toBe(404);
  });
});
