# N.E.I. 分析策略

N.E.I. PEVC Skill Hub（MCP 名 `nei-pevc`）只分发公开 Skill / Workflow / 纪律文本。材料原件、提取正文和分析结果留在项目区与 Multica Issue。

## 何时使用

分类结果的主类型为 `bp_cim_teaser`、`due_diligence`、`meeting_record` 或 `industry_research` 时，直接调用 `nei-pevc` 工具。归档确认、标签修改、检索与项目区路由不走本节。

## 步骤

### 1. 加载纪律

调用 `get_default_discipline`，后续分析遵守：不编造数据或来源；区分已确认事实、材料披露、推断与待核实；信息不足就写缺口。

完成条件：已取得默认纪律，或该调用失败并已决定跳过本节。

### 2. 按任务检索 Skill

用资料类型和行业（若材料已披露）构造简短任务描述，调用 `recommend_skills_for_task` 或 `search_skills`。任务描述不得包含文件正文、客户名单、财务数字原文、LP 信息或任何凭据。

优先标题（按返回的精确 title 使用，不要改写）：

- BP / CIM / teaser：`BP 快速拆解与项目事实卡`
- 要用基金标准判断是否深看：`Anthropic项目初筛：用投资标准快速判断要不要深看`

完成条件：得到至少一条精确 Skill title，或检索失败并跳过本节。

### 3. 在本地套用

对选中的精确 title 调用 `get_skill` 或 `apply_skill`。把返回的框架填进 [`analysis-contract.md`](analysis-contract.md) 的现有字段（`summary`、`facts`、`risks`、`missing_information`、`citations`）。事实仍须带来源定位；框架与材料冲突时以材料为准，并标为待核实。

完成条件：N.E.I. 框架已映射进统一契约，或已在 Issue 内部记录跳过原因；没有任何资料字节发往 N.E.I.。跳过原因只写工具调用失败等事实，禁止写成「工作区未分配 / 本运行未连接」。跳过原因只写 JSON 代码块之外的评论文本或 metadata，禁止写入飞书卡片 JSON 的 `title` / `summary` / `sections` / `warnings`。

## 边界

- 继续完成收件主流程：分类、统一契约、Issue 待确认、四种成员指令。
- 不安装、不配置外部 Connector，不调用 `get_connector_setup_prompt`。
- 不接入 Memory Node。
- 不把 Token 写入 Issue、评论或 metadata。
- 未经成员明确要求，不 `favorite_skill`。
- 不把 MCP 服务器名、工具探测或跳过原因写进飞书卡片。
