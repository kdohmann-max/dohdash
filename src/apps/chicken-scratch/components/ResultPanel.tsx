import { useRef } from "react";
import { marked } from "marked";
import { BlueprintRenderer, canvasToBlob, canvasToDataUrl } from "./BlueprintRenderer";
import { createDoc, saveDoc } from "../../../storage/db";
import type { ProcessResult } from "../types";
import { ArrowRightIcon, CopyIcon, DownloadIcon, RefreshIcon } from "../../../icons";
import "./ResultPanel.css";

interface Props {
  result: ProcessResult;
  fileName: string;
  ownerId: string | null;
  onNew: () => void;
}

function deriveTitle(result: ProcessResult, fileName: string): string {
  if (result.type === "handwriting") {
    const first = result.markdown.split("\n").find((l) => l.trim());
    return (first?.replace(/^#+\s*/, "") ?? "").slice(0, 80) || "Untitled";
  }
  return fileName.replace(/\.[^.]+$/, "");
}

export function ResultPanel({ result, fileName, ownerId, onNew }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const detectedLabel =
    result.type === "handwriting" ? "handwriting ✓" : "blueprint sketch ✓";

  async function handleCopy() {
    if (result.type === "handwriting") {
      void navigator.clipboard.writeText(result.markdown);
      return;
    }
    if (!canvasRef.current) return;
    try {
      const blob = await canvasToBlob(canvasRef.current);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch {
      await handleDownload();
    }
  }

  async function handleDownload() {
    let blob: Blob;
    let name: string;
    if (result.type === "handwriting") {
      blob = new Blob([result.markdown], { type: "text/markdown" });
      name = fileName.replace(/\.[^.]+$/, "") + ".md";
    } else {
      if (!canvasRef.current) return;
      blob = await canvasToBlob(canvasRef.current);
      name = fileName.replace(/\.[^.]+$/, "") + ".png";
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSendToDohDocs() {
    try {
      const title = deriveTitle(result, fileName);
      let markdown: string;
      if (result.type === "handwriting") {
        markdown = result.markdown;
      } else {
        const dataUrl = canvasRef.current ? canvasToDataUrl(canvasRef.current) : "";
        const dimensionLines = result.labels.map((l) => `- ${l.text}`).join("\n");
        markdown = `# ${title}\n\n![Blueprint](${dataUrl})\n\n## Dimensions\n\n${dimensionLines}`;
      }
      const doc = await createDoc(null, ownerId);
      await saveDoc({ ...doc, title, markdown, updatedAt: Date.now() });
    } catch {
      alert("Couldn't save to DohDocs. Please try again.");
    }
  }

  const htmlContent =
    result.type === "handwriting"
      ? (marked.parse(result.markdown) as string)
      : null;

  return (
    <div className="result-panel">
      <div className="result-header">
        <div className="result-file-info">
          <span className="result-file-name">{fileName}</span>
          <span className="result-detected">Detected: {detectedLabel}</span>
        </div>
        <button className="btn-new" onClick={onNew}>
          <RefreshIcon size={14} /> New
        </button>
      </div>

      <div className="result-content">
        {result.type === "handwriting" && htmlContent !== null && (
          <div
            className="result-markdown"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
        {result.type === "blueprint" && (
          <BlueprintRenderer
            elements={result.elements}
            labels={result.labels}
            canvasRef={canvasRef}
          />
        )}
      </div>

      <div className="result-actions">
        <button className="btn-action" onClick={() => void handleCopy()}>
          <CopyIcon size={16} /> Copy
        </button>
        <button className="btn-action" onClick={() => void handleDownload()}>
          <DownloadIcon size={16} /> Download
        </button>
        <button className="btn-action btn-dohdocs" onClick={() => void handleSendToDohDocs()}>
          <ArrowRightIcon size={16} /> DohDocs
        </button>
      </div>
    </div>
  );
}
