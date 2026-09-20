# 机器人快速分析的 DeepSeek low 配置

BP 与公司名快速分析共用 `BOYUAN_QUICK_CARD_*`；公司专属覆盖项如已配置，需同时核对。搜索适配器独立配置，不随本次快速卡模型变更切换。

```dotenv
BOYUAN_QUICK_CARD_PROVIDER_ID=deepseek
BOYUAN_QUICK_CARD_MODEL_ID=deepseek-flash
BOYUAN_QUICK_CARD_VARIANT=low
```

在实际 OpenCode 工作目录的 `opencode.json` 中合并以下配置（保留原有 MCP、skills 和 provider 项）：

```json
{
  "provider": {
    "deepseek": {
      "models": {
        "deepseek-flash": {
          "variants": {
            "low": {
              "reasoningEffort": "low",
              "thinking": { "type": "enabled" }
            }
          }
        }
      }
    }
  }
}
```

2026-09-20 在 OpenCode 1.18.20 中验证：仅传 `variant=low` 的一次调用没有思考段；显式开启 `thinking` 后出现 reasoning 部分和非零 reasoning token。配置标签不是实际生效证据，部署后应检查新会话的模型、variant、思考部分与 token 统计，而不记录思考正文。

两个快速分析 prompt 从严格解析器使用的字段定义生成完整 JSON 模板，约束键名、空值、数组和数值类型。现有兼容逻辑只移除额外键并用缺失标记处理空文本；数组、金额或枚举无效仍失败。低强度思考与 prompt 约束不能保证模型永不输出错误，严格校验仍保留。

重载前检查在途会话与渠道待发任务，备份代码、构建产物与配置。运行端切换、公网 API 访问控制、深度任务调度不属于此配置变更。
