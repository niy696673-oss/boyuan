import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";

export function mountSpa(app: Express, dist: string) {
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    return;
  }

  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) =>
    res.sendFile("index.html", { root: dist }),
  );
}
