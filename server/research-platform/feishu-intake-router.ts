import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import express from "express";
import multer from "multer";
import { normalizeUploadedFileName } from "../upload-file-name.js";
import type { PlatformModule } from "./contracts.js";
import {
  PlatformConflictError,
  PlatformInputError,
  PlatformNotFoundError,
} from "./contracts.js";

export function createFeishuIntakeRouter(
  platform: PlatformModule,
  intakeKey: string | undefined,
): express.Router {
  const router = express.Router();
  const upload = multer({ dest: tmpdir(), limits: { files: 1 } });
  const authorize: express.RequestHandler = (request, response, next) => {
    if (!intakeKey) {
      response.status(503).json({ error: "feishu_intake_unavailable" });
      return;
    }
    if (!secureHeaderMatch(request.header("x-boyuan-intake-key"), intakeKey)) {
      response.status(401).json({ error: "invalid_intake_key" });
      return;
    }
    next();
  };

  router.post(
    "/documents",
    authorize,
    upload.single("file"),
    async (request, response, next) => {
      try {
        if (!request.file) {
          throw new PlatformInputError("multipart_file_required", "请选择文件");
        }
        const sourceMessageId = requiredMetadataHeader(
          request.header("x-boyuan-message-id"),
          "source message",
        );
        const senderId = optionalMetadataHeader(
          request.header("x-boyuan-sender-id"),
          "sender",
        );
        const sourceAttachmentKey = optionalMetadataHeader(
          request.header("x-boyuan-file-key"),
          "file key",
        );
        try {
          const result = await platform.ingestDocument({
            fileName: normalizeUploadedFileName(request.file.originalname),
            mimeType: request.file.mimetype,
            sourceChannel: "feishu",
            sourceMessageId,
            ...(sourceAttachmentKey ? { sourceAttachmentKey } : {}),
            ...(senderId ? { senderId } : {}),
            content: createReadStream(request.file.path),
          });
          response.status(201).json(result);
        } finally {
          await unlink(request.file.path).catch(() => undefined);
        }
      } catch (error) {
        handlePlatformError(error, response, next);
      }
    },
  );

  router.post(
    "/conversations/:conversationId/quick-card",
    authorize,
    async (request, response, next) => {
      try {
        const result = await platform.quickAnalyzeConversation(
          requiredPathParameter(request.params.conversationId),
        );
        response.json(result);
      } catch (error) {
        handlePlatformError(error, response, next);
      }
    },
  );

  return router;
}

function requiredPathParameter(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !value) {
    throw new PlatformInputError("invalid_path", "conversation id is required");
  }
  return value;
}

function secureHeaderMatch(value: string | undefined, expected: string): boolean {
  if (!value) return false;
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.byteLength === expectedBuffer.byteLength &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function requiredMetadataHeader(
  value: string | undefined,
  label: string,
): string {
  const result = optionalMetadataHeader(value, label);
  if (!result) {
    throw new PlatformInputError(
      "missing_feishu_metadata",
      `${label} header is required`,
    );
  }
  return result;
}

function optionalMetadataHeader(
  value: string | undefined,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 500 ||
    /[\r\n]/u.test(normalized)
  ) {
    throw new PlatformInputError(
      "invalid_feishu_metadata",
      `${label} header is invalid`,
    );
  }
  return normalized;
}

function handlePlatformError(
  error: unknown,
  response: express.Response,
  next: express.NextFunction,
): void {
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
