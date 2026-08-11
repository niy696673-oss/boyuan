import { z } from "zod";

const booleanValue = z
  .string()
  .optional()
  .transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PLATFORM_MODE: z.enum(["demo", "production"]).default("demo"),
  PORT: z.coerce.number().int().positive().default(4174),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z
    .string()
    .default("postgresql://boyuan:boyuan@127.0.0.1:5432/boyuan"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  OBJECT_STORAGE_ENDPOINT: z.string().default("http://127.0.0.1:9000"),
  OBJECT_STORAGE_REGION: z.string().default("us-east-1"),
  OBJECT_STORAGE_BUCKET: z.string().default("boyuan-documents"),
  OBJECT_STORAGE_ACCESS_KEY: z.string().default("boyuan"),
  OBJECT_STORAGE_SECRET_KEY: z.string().default("boyuan-secret"),
  OBJECT_STORAGE_FORCE_PATH_STYLE: booleanValue,
  AUTH_MODE: z.enum(["demo", "jwt"]).default("demo"),
  JWT_SECRET: z
    .string()
    .min(32)
    .default("boyuan-demo-secret-change-before-production"),
  JWT_ISSUER: z.string().default("boyuan-auth"),
  JWT_AUDIENCE: z.string().default("boyuan-workbench"),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().default("admin@boyuan.local"),
  BOOTSTRAP_ADMIN_PASSWORD: z
    .string()
    .min(12)
    .default("change-me-before-production"),
  LOCAL_MODEL_BASE_URL: z.string().default("http://127.0.0.1:11434/v1"),
  LOCAL_MODEL_NAME: z.string().default("qwen3:8b"),
  LOCAL_MODEL_API_KEY: z.string().default("ollama"),
  MODEL_ROUTE: z
    .enum(["local_only", "local_first", "external_only"])
    .default("local_first"),
  EXTERNAL_MODEL_BASE_URL: z.string().default("https://api.openai.com/v1"),
  EXTERNAL_MODEL_NAME: z.string().default("gpt-5-mini"),
  EXTERNAL_MODEL_API_KEY: z.string().optional(),
  EXTERNAL_MODELS_ENABLED: booleanValue,
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(16).max(4096).default(384),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type PlatformConfig = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const config = schema.parse(source);
  if (config.PLATFORM_MODE === "production") {
    if (config.AUTH_MODE !== "jwt")
      throw new Error("生产模式必须启用 AUTH_MODE=jwt");
    if (config.JWT_SECRET.includes("demo-secret"))
      throw new Error("生产模式必须设置独立 JWT_SECRET");
    if (config.BOOTSTRAP_ADMIN_PASSWORD.includes("change-me"))
      throw new Error("生产模式必须设置独立 BOOTSTRAP_ADMIN_PASSWORD");
    if (config.OBJECT_STORAGE_SECRET_KEY.includes("replace-with"))
      throw new Error("生产模式必须设置独立 OBJECT_STORAGE_SECRET_KEY");
    if (config.EMBEDDING_DIMENSIONS !== 384)
      throw new Error(
        "当前数据库向量索引固定为 384 维，请保持 EMBEDDING_DIMENSIONS=384",
      );
    if (
      config.MODEL_ROUTE === "external_only" &&
      !config.EXTERNAL_MODEL_API_KEY
    )
      throw new Error("外部模型直连模式必须设置 EXTERNAL_MODEL_API_KEY");
  }
  return config;
}
