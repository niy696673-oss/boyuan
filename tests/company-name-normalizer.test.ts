import { describe, expect, it } from "vitest";
import {
  extractLegalCompanyName,
  normalizeCompanyNameCandidate,
} from "../server/research-platform/company-name-normalizer.js";

describe("公司名称规范化", () => {
  it("移除创新或创业分组前缀", () => {
    expect(
      normalizeCompanyNameCandidate("创新组11+航空发动机精细化测压系统.pdf"),
    ).toBe("航空发动机精细化测压系统");
    expect(
      normalizeCompanyNameCandidate("创业组05＋智能工厂管理系统.pdf"),
    ).toBe("智能工厂管理系统");
    expect(
      normalizeCompanyNameCandidate(
        "创新组16+热障涂层激光无裂纹上釉技术pptx.pdf",
      ),
    ).toBe("热障涂层激光无裂纹上釉技术");
  });

  it("移除推荐来源、标题括号和 BP 类后缀", () => {
    expect(
      normalizeCompanyNameCandidate("BP-云杉智能有限公司.pdf"),
    ).toBe("云杉智能有限公司");
    expect(
      normalizeCompanyNameCandidate(
        "毕友推荐-【星河科技有限公司】商业计划书.pdf",
      ),
    ).toBe("星河科技有限公司");
    expect(
      normalizeCompanyNameCandidate(
        "推荐方：博源资本_【云川半导体】融资计划书（1）.pdf",
      ),
    ).toBe("云川半导体");
    expect(
      normalizeCompanyNameCandidate("青桐资本推荐—泽声科技BP 2023年9月.pdf"),
    ).toBe("泽声科技");
    expect(
      normalizeCompanyNameCandidate("【金磁海纳】商业融资计划书-博源资本.pdf"),
    ).toBe("金磁海纳");
    expect(
      normalizeCompanyNameCandidate("一苇推荐-道芯科技商业计划书V2.1.pdf"),
    ).toBe("道芯科技");
    expect(normalizeCompanyNameCandidate("泽声科技BP23年9月.ocr")).toBe(
      "泽声科技",
    );
    expect(normalizeCompanyNameCandidate("艾可萨BP@20230907(1)")).toBe(
      "艾可萨",
    );
  });

  it("从叙述句中只提取有边界的法律主体", () => {
    expect(
      extractLegalCompanyName(
        "蒙皮已经纳入了国内领先的苏州星河航空科技有限公司的供应体系。",
      ),
    ).toBe("苏州星河航空科技有限公司");
    expect(
      extractLegalCompanyName(
        "公司主体为北京云杉智能科技有限公司，成立于2020年。",
      ),
    ).toBe("北京云杉智能科技有限公司");
    expect(extractLegalCompanyName("）受沈阳埃克斯邦科技有限公司")).toBe(
      "沈阳埃克斯邦科技有限公司",
    );
    expect(
      extractLegalCompanyName("蒙皮已经纳入中航工业成都飞机工业有限责任公司"),
    ).toBe("中航工业成都飞机工业有限责任公司");
  });

  it("多个法律主体并存时优先选择明确标注的项目公司", () => {
    expect(
      extractLegalCompanyName(
        "合作方为上海海纳材料有限公司。项目公司为北京星河航空科技有限公司。",
      ),
    ).toBe("北京星河航空科技有限公司");
  });

  it("需要明确主体时不会把合作方误当成项目公司", () => {
    expect(
      extractLegalCompanyName("合作方为上海海纳材料有限公司。", {
        requireExplicitSubject: true,
      }),
    ).toBeUndefined();
    expect(
      extractLegalCompanyName("项目公司为北京星河航空科技有限公司。", {
        requireExplicitSubject: true,
      }),
    ).toBe("北京星河航空科技有限公司");
  });

  it("没有明确主体边界时不会把成立计划误认成法律主体", () => {
    expect(
      extractLegalCompanyName(
        "材料提到团队仍计划成立有限公司，当前尚无注册主体。",
      ),
    ).toBeUndefined();
  });

  it("不会把通用文档标题当作公司名称", () => {
    expect(normalizeCompanyNameCandidate("商业计划书.pdf")).toBeUndefined();
    expect(normalizeCompanyNameCandidate("公司介绍.pdf")).toBeUndefined();
  });
});
