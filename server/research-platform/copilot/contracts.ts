export interface CompanyCopilotContextItem {
  text: string;
  source?: string;
}

export interface CompanyCopilotContext {
  /** Facts that have already passed the platform's confirmation workflow. */
  confirmedKnowledge: CompanyCopilotContextItem[];
  /** Claims summarized from uploaded materials; these are not confirmed facts. */
  materialSummaries: CompanyCopilotContextItem[];
  /** Candidate facts, gaps, or conflicts that still require confirmation. */
  pendingInformation: CompanyCopilotContextItem[];
  /** Persisted turns used only when a merged company must start a replacement OpenCode session. */
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export interface CompanyCopilotInput {
  companyId: string;
  companyName: string;
  question: string;
  context: CompanyCopilotContext;
  /** Pass the previous result's sessionId to continue the same OpenCode conversation. */
  sessionId?: string;
}

export interface CompanyCopilotResult {
  sessionId: string;
  providerId: string;
  modelId: string;
  answer: string;
}

export interface CompanyCopilotPort {
  chat(input: CompanyCopilotInput): Promise<CompanyCopilotResult>;
}

export type CompanyCopilotErrorCode =
  | "copilot_invalid_input"
  | "copilot_opencode_http_error"
  | "copilot_opencode_message_error"
  | "copilot_empty_answer";

export class CompanyCopilotError extends Error {
  constructor(
    readonly code: CompanyCopilotErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CompanyCopilotError";
  }
}
