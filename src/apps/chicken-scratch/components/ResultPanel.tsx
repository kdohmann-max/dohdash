import { useRef } from "react";
import { marked } from "marked";
import { BlueprintRenderer, serializeSvg } from "./BlueprintRenderer";
import { createDoc, saveDoc } from "../../../storage/db";
import type { ProcessResult } from "../types";
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
  const svgRef = useRef<SVGSVGElement>(null);

  const detectedLabel =
    result.type === "handwriting" ? "handwriting ✓" : "blueprint sketch ✓";

  function handleCopy() {
    if (result.type === "handwriting") {
      void navigator.clipboard.writeText(result.markdown);
    } else if (svgRef.current) {
      void navigator.clipboard.writeText(
        new XMLSerializer().serializeToString(svgRef.current),
      );
    }
  }

  function handleDownload() {
    let blob: Blob;
    let name: string;
    if (result.type === "handwriting") {
      blob = new Blob([result.markdown], { type: "text/markdown" });
      name = fileName.replace(/\.[^.]+$/, "") + ".md";
    } else {
      blob = svgRef.current
        ? serializeSvg(svgRef.current)
        : new Blob([""], { type: "image/svg+xml" });
      name = fileName.replace(/\.[^.]+$/, "") + ".svg";
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
        const svgString = svgRef.current
          ? new XMLSerializer().serializeToString(svgRef.current)
          : "";
        const dimensionLines = result.labels.map((l) => `- ${l.text}`).join("\n");
        markdown = `# ${title}\n\n\`\`\`svg\n${svgString}\n\`\`\`\n\n## Dimensions\n\n${dimensionLines}`;
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
        <button className="btn-new" onClick={onNew}>↺ New</button>
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
            svgRef={svgRef}
          />
        )}
      </div>

      <div className="result-actions">
        <button className="btn-action" onClick={handleCopy}>📋 Copy</button>
        <button className="btn-action" onClick={handleDownload}>⬇️ Download</button>
        <button className="btn-action btn-dohdocs" onClick={() => void handleSendToDohDocs()}>
          → DohDocs
        </button>
      </div>
    </div>
  );
}
