"use client";

import { useMemo } from "react";
import { getCadPreviewSvgData } from "@/lib/cad-preview";
import { type CadFormat, type CadImportUnit, type DrawShapeMode, MATERIAL_PRESETS, type MaterialType, type PinTerminal } from "@/types/panel";

interface CadPreviewThumbnailProps {
  format: CadFormat;
  rawText?: string;
  imageOverlayUrl?: string;
  materialType?: MaterialType;
  drawShape?: DrawShapeMode;
  sourceUnit?: CadImportUnit;
  boundingBoxMm: { w: number; h: number; d: number };
  pins?: PinTerminal[];
  className?: string;
}

export function CadPreviewThumbnail({
  format,
  rawText,
  imageOverlayUrl,
  materialType,
  drawShape,
  sourceUnit = "mm",
  boundingBoxMm,
  pins = [],
  className = "h-14 w-full",
}: CadPreviewThumbnailProps) {
  // If item is a custom drawn Shape (uniform monochrome light gray matching library)
  if ((materialType || drawShape) && !imageOverlayUrl) {
    const isCircle = drawShape === "circle";
    return (
      <div className={`relative flex items-center justify-center p-2 ${className}`}>
        <div
          className={`${isCircle ? "h-8 w-8 rounded-full" : "h-7 w-4/5 rounded-xs"} border border-slate-700 bg-slate-100 shadow-xs flex items-center justify-center`}
        >
          <span className="font-sans text-[8px] font-semibold text-slate-700">
            Shape
          </span>
        </div>
        {pins.length > 0 && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-slate-900/80 px-1 py-0.2 font-sans text-[8px] font-bold text-white">
            {pins.length}P
          </span>
        )}
      </div>
    );
  }

  // If item is an Image Component with a valid imageOverlayUrl / dataUrl
  if (imageOverlayUrl) {
    return (
      <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
        <img
          src={imageOverlayUrl}
          alt="Component Thumbnail"
          className="h-full w-full object-contain pointer-events-none select-none"
          style={{ imageRendering: "crisp-edges" }}
        />
        {pins.length > 0 && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 py-0.2 font-sans text-[8px] font-bold text-amber-400">
            {pins.length}P
          </span>
        )}
      </div>
    );
  }

  const preview = useMemo(
    () =>
      getCadPreviewSvgData({
        format,
        rawText,
        sourceUnit,
        boundingBoxMm,
        pins,
      }),
    [format, rawText, sourceUnit, boundingBoxMm, pins]
  );

  // Compute proportional pin dot radius from viewBox dimensions
  const pinRadius = useMemo(() => {
    const parts = preview.viewBox.split(" ").map(Number);
    const maxDim = Math.max(parts[2] || 100, parts[3] || 100);
    return maxDim * 0.032;
  }, [preview.viewBox]);

  if (preview.type === "wireframe") {
    return (
      <svg
        viewBox={preview.viewBox}
        preserveAspectRatio="xMidYMid meet"
        className={className}
        aria-label={`${format.toUpperCase()} preview`}
      >
        <g
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-sky-600 dark:text-sky-400"
        >
          {preview.segments.map((seg, i) => (
            <line
              key={i}
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {preview.pins.map((pin) => (
          <circle
            key={pin.id}
            cx={pin.x}
            cy={pin.y}
            r={pinRadius}
            fill="#f59e0b"
            stroke="#dc2626"
            strokeWidth={0.9}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    );
  }

  // Silhouette for GLB / GLTF or fallback
  const { w, h } = preview;
  const inset = Math.min(w, h) * 0.08;
  const depthOffset = Math.min(w, h) * 0.14;
  const boxX = inset;
  const boxY = inset + depthOffset * 0.6;
  const boxW = Math.max(2, w - inset * 2 - depthOffset * 0.6);
  const boxH = Math.max(2, h - inset * 2 - depthOffset * 0.6);

  return (
    <svg
      viewBox={preview.viewBox}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-label={`${format.toUpperCase()} 3D silhouette`}
    >
      {/* Isometric top & side depth faces */}
      <polygon
        points={`${boxX},${boxY} ${boxX + depthOffset * 0.6},${boxY - depthOffset * 0.6} ${boxX + boxW + depthOffset * 0.6},${boxY - depthOffset * 0.6} ${boxX + boxW},${boxY}`}
        fill="currentColor"
        fillOpacity={0.18}
        stroke="currentColor"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className="text-sky-500 dark:text-sky-400"
      />
      <polygon
        points={`${boxX + boxW},${boxY} ${boxX + boxW + depthOffset * 0.6},${boxY - depthOffset * 0.6} ${boxX + boxW + depthOffset * 0.6},${boxY + boxH - depthOffset * 0.6} ${boxX + boxW},${boxY + boxH}`}
        fill="currentColor"
        fillOpacity={0.1}
        stroke="currentColor"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className="text-sky-500 dark:text-sky-400"
      />
      {/* Front orthographic face */}
      <rect
        x={boxX}
        y={boxY}
        width={boxW}
        height={boxH}
        rx={Math.min(boxW, boxH) * 0.04}
        fill="currentColor"
        fillOpacity={0.08}
        stroke="currentColor"
        strokeWidth={1.3}
        vectorEffect="non-scaling-stroke"
        className="text-sky-600 dark:text-sky-400"
      />
      {/* Pin indicators centered on silhouette */}
      {preview.pins.map((pin) => (
        <circle
          key={pin.id}
          cx={w / 2 + pin.x}
          cy={h / 2 + pin.y}
          r={pinRadius}
          fill="#f59e0b"
          stroke="#dc2626"
          strokeWidth={0.9}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
