import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PlatformConfig } from "./config.js";
import type { ObjectMetadata, ObjectStorage } from "./contracts.js";

export class LocalObjectStorage implements ObjectStorage {
  private readonly root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "data",
    "objects",
  );
  async ensureBucket() {
    await fs.mkdir(this.root, { recursive: true });
  }
  private resolve(key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(`${this.root}${path.sep}`))
      throw new Error("INVALID_OBJECT_KEY");
    return target;
  }
  async put(key: string, content: Buffer, metadata: ObjectMetadata) {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
    await fs.writeFile(
      `${target}.metadata.json`,
      JSON.stringify(metadata, null, 2),
    );
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async signedGetUrl(key: string) {
    return `/api/objects/${encodeURIComponent(key)}`;
  }
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  constructor(private readonly config: PlatformConfig) {
    this.client = new S3Client({
      endpoint: config.OBJECT_STORAGE_ENDPOINT,
      region: config.OBJECT_STORAGE_REGION,
      forcePathStyle: config.OBJECT_STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY,
      },
    });
  }
  async ensureBucket() {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.OBJECT_STORAGE_BUCKET }),
      );
    } catch {
      await this.client.send(
        new CreateBucketCommand({ Bucket: this.config.OBJECT_STORAGE_BUCKET }),
      );
    }
  }
  async put(key: string, content: Buffer, metadata: ObjectMetadata) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.OBJECT_STORAGE_BUCKET,
        Key: key,
        Body: content,
        ContentType: metadata.contentType,
        Metadata: {
          file_name_uri: encodeURIComponent(metadata.fileName),
          uploaded_by: metadata.uploadedBy,
          visibility: metadata.visibility,
          ...(metadata.projectId ? { project_id: metadata.projectId } : {}),
        },
      }),
    );
  }
  async get(key: string) {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.OBJECT_STORAGE_BUCKET,
        Key: key,
      }),
    );
    if (!result.Body) throw new Error("OBJECT_NOT_FOUND");
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async signedGetUrl(key: string, expiresInSeconds = 300) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.OBJECT_STORAGE_BUCKET,
        Key: key,
      }),
      { expiresIn: expiresInSeconds },
    );
  }
}

export function createObjectStorage(config: PlatformConfig): ObjectStorage {
  return config.PLATFORM_MODE === "production"
    ? new S3ObjectStorage(config)
    : new LocalObjectStorage();
}
