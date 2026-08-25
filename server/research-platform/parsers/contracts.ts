export type ParsedBlockKind = 'paragraph' | 'heading' | 'table_cell' | 'page_text';

export interface ParsedBlock {
  blockId: string;
  kind: ParsedBlockKind;
  text: string;
  page?: number;
  paragraph?: number;
  headingPath?: string[];
  sheet?: string;
  row?: number;
  cellRange?: string;
}

export interface ParseDocumentInput {
  fileName: string;
  mimeType?: string;
  path: string;
}

export interface ParsedDocument {
  format: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'text' | 'image';
  blocks: ParsedBlock[];
}

export interface DocumentParser {
  parse(input: ParseDocumentInput): Promise<ParsedDocument>;
}

export class DocumentParserError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DocumentParserError';
    this.code = code;
  }
}
