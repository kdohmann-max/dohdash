import { useEffect, type RefObject } from "react";
import type { Shape, DimensionLabel } from "../types";
import { CANVAS_SIZE, RENDER_SCALE, renderBlueprint } from "./blueprintDraw";
import "./BlueprintRenderer.css";

interface Props {
  elements: Shape[];
  labels: DimensionLabel[];
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function BlueprintRenderer({ elements, labels, canvasRef }: Props) {
  const validElements = elements.filter((el) => el.kind === "line");
  const hasWarning = validElements.length < elements.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderBlueprint(canvas, validElements, labels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, labels, canvasRef]);

  return (
    <div className="blueprint-renderer">
      {hasWarning && (
        <p className="blueprint-warning">
          Some elements couldn't be drawn — check the downloaded image.
        </p>
      )}
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE * RENDER_SCALE}
        height={CANVAS_SIZE * RENDER_SCALE}
        className="blueprint-canvas"
      />
    </div>
  );
}

/** Converts the rendered canvas to a PNG blob for download/clipboard. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to create image"));
    }, "image/png");
  });
}

/** Converts the rendered canvas to a PNG data URL for embedding in Markdown. */
export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}
