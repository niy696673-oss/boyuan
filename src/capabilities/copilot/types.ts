export type CompanyCopilotMessageRole = "user" | "assistant";

export interface CompanyCopilotMessage {
  messageId: string;
  role: CompanyCopilotMessageRole;
  content: string;
  createdAt: string;
}

export interface CompanyCopilotThread {
  threadId: string;
  messages: CompanyCopilotMessage[];
  status: string;
}
