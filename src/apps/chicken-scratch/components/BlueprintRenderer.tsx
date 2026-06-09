import type { RefObject } from "react";
import type { Shape, DimensionLabel } from "../types";
import "./BlueprintRenderer.css";

interface Props {
  elements: Shape[];
  labels: DimensionLabel[];
  svgRef: RefObject<SVGSVGElement | null>;
}

export function BlueprintRenderer({ elements, labels, svgRef }: Props) {
  const validElements = elements.filter(
    (el) => el.kind === "rect" || el.kind === "line",
  );
  const hasWarning = validElements.length < elements.length;

  return (
    <div className="blueprint-renderer">
      {hasWarning && (
        <p className="blueprint-warning">
          Some elements couldn't be drawn — check the downloaded SVG.
        </p>
      )}
      <svg
        ref={svgRef}
        viewBox="0 0 1000 1000"
        className="blueprint-svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        {validElements.map((el, i) =>
          el.kind === "rect" ? (
            <g key={i}>
              <rect
                x={el.x}
                y={el.y}
                width={el.width ?? 0}
                height={el.height ?? 0}
                stroke="var(--accent)"
                strokeWidth="8"
                fill="none"
              />
              {el.label && (
                <text
                  x={el.x + (el.width ?? 0) / 2}
                  y={el.y + (el.height ?? 0) / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="var(--muted)"
                  fontSize="24"
                >
                  {el.label}
                </text>
              )}
            </g>
          ) : (
            <line
              key={i}
              x1={el.x}
              y1={el.y}
              x2={el.x2 ?? el.x}
              y2={el.y2 ?? el.y}
              stroke="var(--accent)"
              strokeWidth="6"
            />
          ),
        )}
        {labels.map((lbl, i) => (
          <text
            key={i}
            x={lbl.x}
            y={lbl.y}
            textAnchor={lbl.anchor}
            fill="var(--text)"
            fontSize="20"
          >
            {lbl.text}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function serializeSvg(svgEl: SVGSVGElement): Blob {
  const svgString = new XMLSerializer().serializeToString(svgEl);
  return new Blob([svgString], { type: "image/svg+xml" });
}
