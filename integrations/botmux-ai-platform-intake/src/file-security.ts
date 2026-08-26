import { lstatSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import type { IntakeAttachment } from './types.js';

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function validateAttachmentPath(
  input: Pick<IntakeAttachment, 'fileKey' | 'name' | 'path'>,
  attachmentRoot: string,
): IntakeAttachment {
  if (!input.fileKey.trim() || input.fileKey.length > 500) throw new Error('invalid_file_key');
  if (!input.name.trim() || input.name.length > 500 || /[\r\n]/u.test(input.name)) throw new Error('invalid_file_name');
  if (!isAbsolute(input.path)) throw new Error('attachment_path_not_absolute');
  const linkStat = lstatSync(input.path);
  if (linkStat.isSymbolicLink()) throw new Error('attachment_symlink_rejected');
  const lexicalRoot = resolve(attachmentRoot);
  const root = realpathSync(attachmentRoot);
  const lexicalRel = relative(lexicalRoot, input.path);
  if (!lexicalRel || lexicalRel.startsWith('..') || isAbsolute(lexicalRel)) throw new Error('attachment_outside_botmux_root');
  let lexicalComponent = lexicalRoot;
  for (const segment of lexicalRel.split(/[\\/]/u)) {
    lexicalComponent = join(lexicalComponent, segment);
    if (lstatSync(lexicalComponent).isSymbolicLink()) throw new Error('attachment_symlink_rejected');
  }
  const path = realpathSync(input.path);
  const rel = relative(root, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('attachment_outside_botmux_root');
  const fileStat = statSync(path);
  if (!fileStat.isFile()) throw new Error('attachment_not_regular_file');
  if (fileStat.size <= 0) throw new Error('attachment_empty');
  const mimeType = MIME_BY_EXTENSION[extname(input.name).toLowerCase()];
  if (!mimeType) throw new Error('attachment_type_unsupported');
  return { ...input, path, size: fileStat.size, mimeType };
}
