import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { mountSpa } from "../server/spa-static.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe("SPA 静态资源", () => {
  it("深链接返回 index.html", async () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), ".boyuan-spa-"));
    temporaryDirectories.push(dist);
    fs.writeFileSync(
      path.join(dist, "index.html"),
      "<!doctype html><title>Boyuan Workbench</title>",
    );
    const app = express();
    mountSpa(app, dist);

    const response = await request(app).get(
      "/workbench/conversations/conversation-id",
    );

    expect(response.status).toBe(200);
    expect(response.text).toContain("Boyuan Workbench");
  });
});
