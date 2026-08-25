import { Readable } from "node:stream";
import express from "express";
import multer from "multer";
import type { PlatformModule } from "./contracts.js";
import {
  PlatformConflictError,
  PlatformInputError,
  PlatformNotFoundError,
} from "./contracts.js";

export function createResearchPlatformV1Router(
  platform: PlatformModule,
): express.Router {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1 },
  });

  router.post("/documents", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        throw new PlatformInputError("multipart_file_required", "请选择文件");
      }
      const result = await platform.ingestDocument({
        fileName: normalizeMultipartFileName(req.file.originalname),
        mimeType: req.file.mimetype,
        sourceChannel: "web",
        content: Readable.from([req.file.buffer]),
      });
      res.status(201).json(result);
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/conversations", async (_req, res, next) => {
    try {
      res.json(await platform.listConversations());
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  router.get("/conversations/:conversationId", async (req, res, next) => {
    try {
      res.json(await platform.getConversation(req.params.conversationId));
    } catch (error) {
      handlePlatformError(error, res, next);
    }
  });

  return router;
}

function normalizeMultipartFileName(fileName: string) {
  if (/[㐀-鿿]/u.test(fileName)) return fileName;
  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  return decoded.includes("�") ? fileName : decoded;
}

function handlePlatformError(
  error: unknown,
  response: express.Response,
  next: express.NextFunction,
) {
  if (error instanceof PlatformInputError) {
    response.status(400).json({ error: error.code, message: error.message });
    return;
  }
  if (error instanceof PlatformNotFoundError) {
    response.status(404).json({ error: "not_found", message: error.message });
    return;
  }
  if (error instanceof PlatformConflictError) {
    response.status(409).json({ error: error.code, message: error.message });
    return;
  }
  next(error);
}
