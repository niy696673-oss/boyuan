import { AnalysisAdapterError } from '../analysis/contracts.js';
import {
  createOpenCodeClient,
  type OpenCodeAssistantResponse,
  type OpenCodeConnectionOptions,
  type OpenCodeSessionMessage,
} from '../opencode/client.js';
import type {
  CompanyResearchInput,
  CompanyResearchPort,
  CompanyResearchResult,
  CompanyResearchWorkflowContext,
  CompanyResearchWorkflowSkill,
} from './contracts.js';
import { parseResearchJson } from './research-schema.js';
import { validateWorkflowResearchOutput } from './workflow-policy.js';

export interface OpenCodeResearchOptions extends OpenCodeConnectionOptions {
  model?: { providerId: string; modelId: string };
  variant?: string;
}

export function createOpenCodeResearchAdapter(options: OpenCodeResearchOptions): CompanyResearchPort {
  const client = createOpenCodeClient(
    options,
    (status) => new AnalysisAdapterError('opencode_http_error', `OpenCode returned HTTP ${status}`),
    600_000,
  );
  return {
    async analyze(input): Promise<CompanyResearchResult> {
      const workflow = workflowRequest(input);
      if (workflow) {
        const skills = await client.listSkills();
        if (!skills.some((skill) => skill.name === workflow.skill)) {
          throw new AnalysisAdapterError(
            'opencode_required_skill_unavailable',
            `OpenCode skill is unavailable: ${workflow.skill}`,
          );
        }
      }
      const sessionId = input.sessionId ?? await client.createSession(`博源公司研究：${input.companyName}`);
      let response: OpenCodeAssistantResponse;
      try {
        response = await client.sendMessage(sessionId, {
          ...(options.model ? { model: { providerID: options.model.providerId, modelID: options.model.modelId } } : {}),
          ...(options.variant ? { variant: options.variant } : {}),
          system: systemInstruction(Boolean(workflow)),
          tools: { '*': false, ...(workflow ? { skill: true } : {}) },
          parts: [{ type: 'text', text: researchPrompt(input, workflow) }],
        });
      } catch (error) {
        await client.abortSession(sessionId).catch(() => undefined);
        throw error;
      }
      if (response.info.error) throw new AnalysisAdapterError('opencode_message_error', 'OpenCode research message failed');
      if (workflow) {
        const messages = await client.listMessages(sessionId);
        assertWorkflowSkillCalled(messages, response, workflow.skill);
      }
      const rawText = response.parts.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n').trim();
      const parsed = parseResearchJson(rawText, {
        requireBlankDecision: Boolean(workflow),
        ...(workflow
          ? {
              workflowMaterials: workflow.context.materials.map((material) => ({
                sourceId: material.sourceId,
                excerpt: material.excerpt,
              })),
              workflowMethodApproved:
                workflow.context.gates.methodAssumptionApproval?.approved === true,
            }
          : {}),
      });
      const validated = workflow
        ? validateWorkflowResearchOutput(parsed, workflow.context)
        : parsed;
      return {
        providerId: response.info.providerID,
        modelId: response.info.modelID,
        sessionId,
        summary: validated.summary,
        candidates: validated.candidates,
        rawText,
      };
    },
  };
}

interface WorkflowRequest {
  skill: CompanyResearchWorkflowSkill;
  context: CompanyResearchWorkflowContext;
}

function workflowRequest(input: CompanyResearchInput): WorkflowRequest | undefined {
  if (!input.workflowSkill) return undefined;
  if (input.webResults.length > 0 || (input.triggerReason && input.triggerReason !== 'not_needed')) {
    throw new AnalysisAdapterError(
      'workflow_external_evidence_disallowed',
      `Public search results must use a separate research run from skill: ${input.workflowSkill}`,
    );
  }
  if (!input.workflowContext) {
    throw new AnalysisAdapterError(
      'workflow_context_required',
      `Workflow context is required for skill: ${input.workflowSkill}`,
    );
  }
  if (!input.workflowContext.gates.inputScopeApproval.approved) {
    throw new AnalysisAdapterError(
      'workflow_input_scope_approval_required',
      `input_scope_approval is required for skill: ${input.workflowSkill}`,
    );
  }
  const scopeApproval = input.workflowContext.gates.inputScopeApproval;
  if (!scopeApproval.approvedBy.trim() || !scopeApproval.approvedAt.trim()) {
    throw new AnalysisAdapterError(
      'workflow_input_scope_approval_invalid',
      `input_scope_approval must identify its approver and time for skill: ${input.workflowSkill}`,
    );
  }
  const approvedSourceIds = new Set(scopeApproval.sourceIds);
  if (approvedSourceIds.size === 0) {
    throw new AnalysisAdapterError(
      'workflow_input_scope_approval_invalid',
      `input_scope_approval must freeze at least one source for skill: ${input.workflowSkill}`,
    );
  }
  const unapprovedMaterial = input.workflowContext.materials.find(
    (material) => !approvedSourceIds.has(material.sourceId),
  );
  if (unapprovedMaterial) {
    throw new AnalysisAdapterError(
      'workflow_material_scope_unapproved',
      `Material source is outside input_scope_approval: ${unapprovedMaterial.sourceId}`,
    );
  }
  const materialSourceIds = new Set(
    input.workflowContext.materials.map((material) => material.sourceId),
  );
  const unavailableApprovedSourceId = scopeApproval.sourceIds.find(
    (sourceId) => !materialSourceIds.has(sourceId),
  );
  if (unavailableApprovedSourceId) {
    throw new AnalysisAdapterError(
      'workflow_material_scope_unavailable',
      `Approved material source is unavailable: ${unavailableApprovedSourceId}`,
    );
  }
  for (const gate of [
    input.workflowContext.gates.methodAssumptionApproval,
    input.workflowContext.gates.externalReleaseApproval,
  ]) {
    if (gate?.approved && (!gate.approvedBy?.trim() || !gate.approvedAt?.trim())) {
      throw new AnalysisAdapterError(
        'workflow_gate_approval_invalid',
        'Approved workflow gates must identify their approver and time',
      );
    }
  }
  return { skill: input.workflowSkill, context: input.workflowContext };
}

function systemInstruction(hasWorkflow: boolean): string {
  if (!hasWorkflow) {
    return '你是博源 AI 平台的公司研究分析器。只使用输入的已确认知识和带 URL 公开来源；不使用工具，不把未确认内容写成事实。只输出 JSON。';
  }
  return '你是博源 AI 平台的内部投研分析器。必须先调用指定 Skill，并遵守它的证据状态、人类审批和停止条件。你只提供内部决策支持，不能替投资负责人作决定、形成机构审批或执行外部发布。除 skill 外不得调用任何工具。只输出 JSON。';
}

function researchPrompt(
  input: CompanyResearchInput,
  workflow?: WorkflowRequest,
): string {
  if (workflow) {
    return [
      ...workflowPrompt(workflow),
      `公司：${input.companyName}`,
      `用户研究意图：${input.intent}`,
      '本工作流只使用已审批的材料上下文和当前正式知识。不得请求、推断或混入公开搜索结果；公开信息必须通过独立的常规研究运行处理。',
      '标准 BP 深度分析由 boyuan-bp-deep-analysis 与 Sequential Thinking 的独立链路执行；本工作流不得替代或模仿该链路。',
      '本次仅返回结构化内部观察，candidates 必须返回空数组；知识候选由标准 BP 深度分析或独立外部研究链路生成。',
      'summary 必须是数组，且不允许任何自由结论 text。每项只允许：source_excerpt（必须是某个冻结材料 excerpt 中 4-600 字的逐字摘录）、evidence_gap（受控维度缺口）、pending_question（由服务端生成待确认问题）或 method_score（仅 method_assumption_approval 已批准时使用受控数字字段）。',
      'category 仅允许 company_stage、team_governance、product、technology_ip、maturity_capacity、market_policy、industry_chain、customers_orders、supply_chain、business_model、financing_equity、financials_risks、source_conflict。不得输出投资决定、推进推荐、外发已执行声明或其他外部状态变更。',
      `输出 schema：${JSON.stringify(workflowOutputSchema(workflow))}`,
      `当前正式知识：${JSON.stringify(input.existingKnowledge)}`,
    ].join('\n\n');
  }
  return [
    `公司：${input.companyName}`,
    `用户研究意图：${input.intent}`,
    `外部搜索触发原因：${input.triggerReason ?? '未触发'}`,
    '请给出简洁研究摘要和可确认候选。每条候选必须引用 webResults 中至少一个完整 URL。没有可靠公开证据时返回空 candidates。',
    `输出 schema：${JSON.stringify({ summary: '研究摘要', candidates: [{ knowledgeType: 'external_update', statement: '完整陈述', value: '可选', effectiveAt: '可选', evidenceUrls: ['https://example.com/source'], highImpact: false, sensitive: false }] })}`,
    `已确认知识：${JSON.stringify(input.existingKnowledge)}`,
    `本对话未确认候选（必须显式作为未确认内容对待）：${JSON.stringify(input.pendingCandidates)}`,
    `公开搜索结果：${JSON.stringify(input.webResults)}`,
  ].join('\n\n');
}

function workflowOutputSchema(workflow: WorkflowRequest) {
  const firstMaterial = workflow.context.materials[0];
  if (!firstMaterial) throw new Error('workflow_material_missing');
  const summary: Array<Record<string, unknown>> = [
    {
      state: 'source_excerpt',
      category: 'company_stage',
      sourceId: firstMaterial.sourceId,
      quote: firstMaterial.excerpt.slice(0, 120),
    },
    { state: 'evidence_gap', category: 'financials_risks' },
    { state: 'pending_question', category: 'financing_equity' },
  ];
  if (workflow.context.gates.methodAssumptionApproval?.approved === true) {
    summary.push({
      state: 'method_score',
      category: 'financials_risks',
      score: 0,
      scale: 100,
      riskLevel: 'unknown',
      sourceIds: [firstMaterial.sourceId],
    });
  }
  return { summary, decision: null, candidates: [] };
}

function workflowPrompt(workflow: WorkflowRequest): string[] {
  const methodApproved = workflow.context.gates.methodAssumptionApproval?.approved === true;
  const externalReleaseApproved = workflow.context.gates.externalReleaseApproval?.approved === true;
  return [
    `第一步必须调用 skill 工具加载“${workflow.skill}”；在 Skill 成功加载前不得开始分析。`,
    `工作流范围：${JSON.stringify(workflow.context.scope)}`,
    `审批状态：${JSON.stringify({
      input_scope_approval: true,
      method_assumption_approval: methodApproved,
      external_release_approval: externalReleaseApproved,
    })}`,
    `材料上下文：${JSON.stringify(workflow.context.materials)}`,
    workflowBoundary(workflow.skill, methodApproved),
    '本次调用只生成内部草稿，不执行对外分享或任何外部状态写入；即使 external_release_approval 已存在，也必须由调用方另行执行发布。',
    '材料上下文和正式知识必须保持各自来源与证据状态；未披露信息保持未知，不得用外部信息补齐。材料发现只写入内部摘要及待人工处理说明。',
  ];
}

function workflowBoundary(skill: CompanyResearchWorkflowSkill, methodApproved: boolean): string {
  if (skill === 'diagnose-bp') {
    return `输出是材料诊断与修复建议，不重写 BP、不作投资决定。${methodApproved ? '可使用已批准的方法锚点，但须披露方法与不确定性。' : 'method_assumption_approval 未批准，不得使用机构评分、权重、基准或严重度锚点。'}`;
  }
  if (skill === 'screen-deal') {
    return `只提供明确标注为“AI 准备、负责人决策”的筛选选项，不得输出机构性的推进、搁置或拒绝决定。${methodApproved ? '可使用已批准的筛选方法，但须保留证据和不确定性。' : 'method_assumption_approval 未批准，不得自行引入评分、权重、基准或 kill criterion。'}`;
  }
  return `只提取候选风险并区分覆盖缺口与实质风险；严重度和专业结论必须待投资负责人及相应专业人员确认。${methodApproved ? '可应用已批准的严重度方法，但结果仍是候选。' : 'method_assumption_approval 未批准，不得自行定级、降级或引入损失方法。'}`;
}

function assertWorkflowSkillCalled(
  messages: OpenCodeSessionMessage[],
  response: OpenCodeAssistantResponse,
  skill: CompanyResearchWorkflowSkill,
): void {
  if (!response.info.parentID) {
    throw new AnalysisAdapterError(
      'opencode_tool_trace_missing',
      `OpenCode research did not return a verifiable tool trace for skill: ${skill}`,
    );
  }
  const turnMessages = messages.filter((message) => (
    message.info.role === 'assistant' && message.info.parentID === response.info.parentID
  ));
  const toolParts = turnMessages.flatMap((message) => message.parts).filter((part) => part.type === 'tool');
  const firstTool = toolParts[0];
  if (
    firstTool?.tool !== 'skill'
    || firstTool.state?.status !== 'completed'
    || firstTool.state.input?.name !== skill
  ) {
    throw new AnalysisAdapterError(
      'opencode_required_tool_missing',
      `OpenCode research did not first call required skill: ${skill}`,
    );
  }
  const unexpectedTool = toolParts.find((part) => part.tool !== 'skill');
  if (unexpectedTool) {
    throw new AnalysisAdapterError(
      'opencode_unexpected_tool_used',
      `OpenCode research used a disallowed tool: ${unexpectedTool.tool ?? 'unknown'}`,
    );
  }
  const unexpectedSkill = toolParts.find((part) => (
    part.tool === 'skill' && part.state?.input?.name !== skill
  ));
  if (unexpectedSkill) {
    throw new AnalysisAdapterError(
      'opencode_unexpected_skill_used',
      `OpenCode research loaded a disallowed skill: ${String(unexpectedSkill.state?.input?.name ?? 'unknown')}`,
    );
  }
}
