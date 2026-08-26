export function normalizeUploadedFileName(fileName: string): string {
  if (/[\u3400-\u9fff]/u.test(fileName)) return fileName;
  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  return decoded.includes("�") ? fileName : decoded;
}
