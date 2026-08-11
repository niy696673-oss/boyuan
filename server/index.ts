import { createApp } from "./app.js";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./platform/config.js";
import { createPlatformRuntime } from "./platform/runtime.js";
import { createHttpLogger } from "./platform/telemetry.js";

const config = loadConfig();
const port = config.PORT;
const { store, services } = await createPlatformRuntime(config);
const app = express();
app.use(createHttpLogger(config));
app.use(createApp(store, services));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
const server = app.listen(port, config.HOST, () =>
  console.log(`Boyuan API running at http://${config.HOST}:${port}`),
);
async function shutdown() {
  server.close();
  await store.flush();
  await services.close();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
