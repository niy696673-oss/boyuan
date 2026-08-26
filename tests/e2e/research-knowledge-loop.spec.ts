import { expect, test } from "@playwright/test";

const companyName = "星河智能有限公司";
const companyDisplayName = "星河智能";
const fileName = "星河智能 BP.md";

test("材料、Skill、行业研究和通知深链在刷新后保持", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天想研究什么？" }),
  ).toBeVisible();

  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "添加文件" }).click();
  await (
    await fileChooser
  ).setFiles({
    name: fileName,
    mimeType: "text/markdown",
    buffer: Buffer.from(
      `# ${companyName}\n\n公司专注企业智能化服务，并为制造业客户提供智能决策软件。\n\n公司位于人工智能产业链中游，提供智能决策产品与解决方案。`,
      "utf8",
    ),
  });

  await expect(page.getByText("1 份材料已保存，后台分析已开始")).toBeVisible();
  await expect(page.getByText("1 项候选知识等待确认")).toBeVisible({
    timeout: 30_000,
  });

  const notificationButton = page.getByRole("button", { name: "通知" });
  await expect(notificationButton.locator("i")).toBeVisible({
    timeout: 30_000,
  });
  await notificationButton.click();
  await page
    .getByRole("button", {
      name: new RegExp(`${companyName}有待确认知识`),
    })
    .click();
  await expect(page).toHaveURL(/\/confirmations\?candidateId=.+/u);
  await expect(
    page.getByRole("heading", { name: "核验候选知识" }),
  ).toBeVisible();
  await expect(
    page.getByText(companyName, { exact: true }).first(),
  ).toBeVisible();

  const confirm = page.getByRole("button", { name: "确认并入库" });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    page.getByRole("heading", { name: "待确认内容已处理完毕" }),
  ).toBeVisible();

  const search = page.getByRole("textbox", { name: "全局搜索" });
  await search.fill("星河智能");
  const companyResult = page
    .getByRole("listbox")
    .getByRole("button")
    .filter({ hasText: companyName });
  await expect(companyResult).toBeVisible();
  await companyResult.click();

  await expect(page).toHaveURL(/\/companies\//u);
  await expect(
    page.getByRole("heading", { name: companyDisplayName }),
  ).toBeVisible();
  await expect(page.getByText(fileName, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /已确认知识\s*1/u }),
  ).toBeVisible();

  await page.reload();

  await expect(
    page.getByRole("heading", { name: companyDisplayName }),
  ).toBeVisible();
  await expect(page.getByText(fileName, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /已确认知识\s*1/u }),
  ).toBeVisible();

  await page.getByRole("button", { name: "发起研究" }).click();
  await expect(
    page.getByRole("heading", { name: "今天想研究什么？" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "BP 材料完整性复核" })
    .click();
  await page
    .getByRole("textbox", { name: "融资或交易阶段" })
    .fill("A 轮内部复核");
  await page
    .getByRole("textbox", { name: "研究问题" })
    .fill("诊断当前 BP 的证据完整性");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText("运行投研 Skill 前，请确认本次输入材料范围"),
  ).toBeVisible();

  await page.getByRole("checkbox").check();
  const workflowRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().endsWith("/api/v1/company-research"),
  );
  await page.getByRole("button", { name: "发送问题" }).click();
  const workflowRequest = await workflowRequestPromise;
  expect(workflowRequest.postDataJSON()).toMatchObject({
    explicitWebSearch: false,
    workflow: {
      skill: "diagnose-bp",
      scope: { stage: "A 轮内部复核" },
      inputScopeApproval: { approved: true },
    },
  });
  await expect(
    page
      .locator(".by-step-accordion button")
      .filter({ hasText: "AI 公司研究" })
      .getByText("已完成"),
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "行业" }).click();
  await expect(
    page.getByRole("heading", { name: "行业与产业链" }),
  ).toBeVisible();
  await page.getByRole("heading", { name: "人工智能" }).click();
  await expect(page.getByRole("heading", { name: "人工智能" })).toBeVisible();

  await page.getByRole("button", { name: "订阅更新" }).click();
  await expect(page.getByRole("button", { name: "已订阅" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "已订阅" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "发起研究" }).click();
  await expect(
    page.getByRole("heading", { name: "今天想研究什么？" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "研究问题" })
    .fill("分析人工智能产业链结构与关键趋势");
  const industryRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().endsWith("/api/v1/industry-research"),
  );
  await page.getByRole("button", { name: "发送问题" }).click();
  const industryRequest = await industryRequestPromise;
  expect(industryRequest.postDataJSON()).toMatchObject({
    intent: "分析人工智能产业链结构与关键趋势",
    explicitWebSearch: true,
  });
  await expect(
    page
      .locator(".by-step-accordion button")
      .filter({ hasText: "AI 行业研究" })
      .getByText("已完成"),
  ).toBeVisible({ timeout: 30_000 });

  await notificationButton.click();
  await expect(
    page.getByRole("button", { name: /人工智能行业研究已完成/ }),
  ).toBeVisible();
});
