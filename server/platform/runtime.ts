import { initialStoreData, Store } from "../store.js";
import { JwtAuthenticator } from "./auth.js";
import { loadConfig, type PlatformConfig } from "./config.js";
import { Database } from "./database.js";
import { DocumentProcessor } from "./document-processor.js";
import { BullDocumentJobs, InlineDocumentJobs } from "./jobs.js";
import { RoutedModelGateway } from "./model-gateway.js";
import { MemoryHybridSearch, PostgresHybridSearch } from "./search.js";
import { createObjectStorage } from "./storage.js";
import { PrometheusTelemetry } from "./telemetry.js";
import type { PlatformServices } from "./contracts.js";
import { hash } from "bcryptjs";

export async function createPlatformServices(
  store: Store,
  config: PlatformConfig = loadConfig(),
  existingDatabase?: Database,
): Promise<PlatformServices> {
  const storage = createObjectStorage(config);
  await storage.ensureBucket();
  const database =
    config.PLATFORM_MODE === "production"
      ? existingDatabase || new Database(config)
      : undefined;
  if (database) {
    await database.ping();
    await database.migrate();
  }
  const search = database
    ? new PostgresHybridSearch(database)
    : new MemoryHybridSearch(store);
  if (database) {
    for (const company of store.data.companies)
      for (const evidence of company.evidence)
        await search.indexEvidence({
          evidenceId: evidence.id,
          companyId: company.id,
          documentId: evidence.documentId,
          fileName: evidence.fileName,
          text: evidence.excerpt,
          visibility: evidence.visibility,
          ownerId: evidence.ownerId,
          projectId: evidence.projectId,
        });
  }
  const processor = new DocumentProcessor(store, storage, search, database);
  const jobs = database
    ? new BullDocumentJobs(config)
    : new InlineDocumentJobs(processor);
  const telemetry = new PrometheusTelemetry();
  return {
    storage,
    jobs,
    search,
    models: new RoutedModelGateway(config),
    telemetry,
    auth: new JwtAuthenticator(config, database),
    mode: config.PLATFORM_MODE,
    database,
    async close() {
      await jobs.close();
      await database?.close();
    },
  };
}

export async function createPlatformRuntime(
  config: PlatformConfig = loadConfig(),
) {
  if (config.PLATFORM_MODE === "demo") {
    const store = new Store();
    return { store, services: createDemoServices(store) };
  }
  const database = new Database(config);
  await database.ping();
  await database.migrate();
  await database.ensureBootstrapAdmin({
    email: config.BOOTSTRAP_ADMIN_EMAIL,
    passwordHash: await hash(config.BOOTSTRAP_ADMIN_PASSWORD, 12),
  });
  const state = (await database.loadPlatformState()) || initialStoreData();
  if (config.EXTERNAL_MODELS_ENABLED)
    state.settings.externalModelsEnabled = true;
  await database.savePlatformState(state);
  const store = new Store({
    initialData: state,
    onSave: (data) => database.savePlatformState(data),
  });
  const services = await createPlatformServices(store, config, database);
  return { store, services };
}

export function createDemoServices(store: Store): PlatformServices {
  const config = loadConfig({
    ...process.env,
    PLATFORM_MODE: "demo",
    AUTH_MODE: "demo",
  });
  const storage = createObjectStorage(config);
  const search = new MemoryHybridSearch(store);
  const telemetry = new PrometheusTelemetry();
  const processor = new DocumentProcessor(store, storage, search);
  const jobs = new InlineDocumentJobs(processor);
  return {
    storage,
    jobs,
    search,
    models: new RoutedModelGateway(config),
    telemetry,
    auth: new JwtAuthenticator(config),
    mode: "demo",
    async close() {
      await jobs.close();
    },
  };
}
