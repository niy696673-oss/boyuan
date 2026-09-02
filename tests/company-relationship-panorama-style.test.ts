// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("关联性全景布局", () => {
  it("关系分组始终保持固定三列，不因 hover 改变列宽", () => {
    const stylesheet = readFileSync(
      join(process.cwd(), "src/product/company-entity-page.css"),
      "utf8",
    );
    const columnsRule = stylesheet.match(/\.by-relation-columns\s*\{([^}]*)\}/)?.[1];

    expect(columnsRule).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(columnsRule).not.toMatch(/transition\s*:\s*grid-template-columns/);
    expect(stylesheet).not.toMatch(
      /\.by-relation-columns:has\([^{}]*:hover\)\s*\{/,
    );
  });
});
