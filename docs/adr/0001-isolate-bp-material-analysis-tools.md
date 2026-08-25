# 隔离 BP 材料分析的 OpenCode 工具

BP 材料分析只允许使用项目的 `boyuan-bp-deep-analysis` skill 和 Sequential Thinking MCP：会话启动前检查二者可用，并在单次会话中默认禁用全部工具后显式放行它们。这样即使项目后续接入 Exa、NEI 等外部调研 MCP，也不会把外部信息混入以 BP 为唯一事实源的材料分析；外部调研通过独立链路执行。
