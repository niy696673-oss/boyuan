import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "vite";

const workspace = process.cwd();
const dataRoot = join(
  workspace,
  "node_modules",
  ".cache",
  "boyuan-playwright-data",
);
await rm(dataRoot, { recursive: true, force: true });
await mkdir(dataRoot, { recursive: true });
let apiServer;
let viteServer;
let stopping = false;

const cleanup = async () => {
  await rm(dataRoot, { recursive: true, force: true });
};

const waitForApi = async () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:4185/api/health");
      if (response.ok) return;
    } catch {
      // The API process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Playwright API did not become ready on port 4185");
};

const shutdown = async (signal = "SIGTERM", exitCode = 0) => {
  if (stopping) return;
  stopping = true;
  await viteServer?.close();
  if (apiServer && apiServer.exitCode === null) {
    const exited = new Promise((resolve) => apiServer.once("exit", resolve));
    apiServer.kill(signal);
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  }
  await cleanup();
  process.exit(exitCode);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  apiServer = spawn("pnpm", ["exec", "tsx", "server/index.ts"], {
    cwd: workspace,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      PLATFORM_MODE: "demo",
      AUTH_MODE: "demo",
      HOST: "127.0.0.1",
      PORT: "4185",
      LOG_LEVEL: "warn",
      BOYUAN_RESEARCH_DATA_ROOT: dataRoot,
      BOYUAN_ANALYSIS_ADAPTER: "deterministic",
      BOYUAN_RESEARCH_ADAPTER: "deterministic",
      BOYUAN_SEARCH_ADAPTER: "deterministic",
    },
  });
  apiServer.once("error", (error) => {
    console.error(error);
    void shutdown("SIGTERM", 1);
  });
  apiServer.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(`Playwright API exited with ${code ?? signal}`);
      void shutdown("SIGTERM", code ?? 1);
    }
  });

  await waitForApi();
  viteServer = await createServer({
    root: workspace,
    server: {
      host: "127.0.0.1",
      port: 4184,
      strictPort: true,
      proxy: { "/api": "http://127.0.0.1:4185" },
    },
  });
  await viteServer.listen();
  viteServer.printUrls();
} catch (error) {
  console.error(error);
  await shutdown("SIGTERM", 1);
}
