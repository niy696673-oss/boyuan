import { loadConfig } from "./platform/config.js";
import { Database } from "./platform/database.js";

const database = new Database(loadConfig());
try {
  await database.migrate();
  console.log("数据库迁移已完成");
} finally {
  await database.close();
}
