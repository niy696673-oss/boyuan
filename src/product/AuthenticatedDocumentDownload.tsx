import { useState } from "react";
import { Download } from "lucide-react";
import { downloadPlatformDocument } from "../capabilities/platform-http";

export function AuthenticatedDocumentDownload({
  documentId,
  fileName,
  className,
}: {
  documentId: string;
  fileName?: string;
  className?: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setError("");
    try {
      await downloadPlatformDocument({ documentId, fileName });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "原始文件下载失败，请稍后重试",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <span className="by-authenticated-download">
      <button
        type="button"
        className={className}
        disabled={downloading}
        onClick={() => void download()}
      >
        <Download />
        {downloading ? "下载中…" : "下载原文"}
      </button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
