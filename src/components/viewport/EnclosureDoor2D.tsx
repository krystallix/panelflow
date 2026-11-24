import React from "react";
import type { EnclosureConfig, PlacedComponent, ThemeMode } from "@/types/panel";
import { computeDoorCutouts, getDoorDimensions } from "@/lib/door-cutout";

interface EnclosureDoor2DProps {
  enclosure: EnclosureConfig;
  components: PlacedComponent[];
  theme: ThemeMode;
  showDimensions?: boolean;
}

export function EnclosureDoor2D({
  enclosure,
  components,
  theme,
  showDimensions = true,
}: EnclosureDoor2DProps) {
  const spec = computeDoorCutouts(enclosure, components);
  const { doorWidthMm, doorHeightMm, cutouts, exclusionZones, hingeSide, violations } =
    spec;

  const isDark = theme === "dark";

  // Coordinates: (0,0) is center of door face.
  // Door bounds: x from -W/2 to +W/2, y from -H/2 to +H/2 (in SVG y is flipped: top is -H/2, bottom is +H/2)
  const halfW = doorWidthMm / 2;
  const halfH = doorHeightMm / 2;

  // Colors
  const sheetFill = isDark ? "#11141c" : "#f8fafc";
  const sheetStroke = isDark ? "#334155" : "#0f172a";
  const bevelStroke = isDark ? "#1e293b" : "#cbd5e1";
  const centerlineColor = isDark ? "#ef4444" : "#dc2626";
  const dimColor = isDark ? "#38bdf8" : "#0284c7";
  const dimLineColor = isDark ? "#0284c7" : "#38bdf8";
  const textColor = isDark ? "#f1f5f9" : "#0f172a";

  return (
    <g className="enclosure-door-2d pointer-events-none select-none">
      {/* 1. Outer Door Sheet Face with Bevel Edge */}
      <rect
        x={-halfW}
        y={-halfH}
        width={doorWidthMm}
        height={doorHeightMm}
        fill={sheetFill}
        stroke={sheetStroke}
        strokeWidth={1.8}
        rx={3}
      />
      {/* Sheet metal inner bevel border (3mm bend relief) */}
      <rect
        x={-halfW + 4}
        y={-halfH + 4}
        width={doorWidthMm - 8}
        height={doorHeightMm - 8}
        fill="none"
        stroke={bevelStroke}
        strokeWidth={0.8}
        strokeDasharray="4,3"
      />

      {/* 2. Symmetry Centerlines (X & Y) */}
      <g stroke={centerlineColor} strokeWidth={0.6} strokeDasharray="8,3,1.5,3" opacity={0.65}>
        <line x1={0} y1={-halfH - 12} x2={0} y2={halfH + 12} />
        <line x1={-halfW - 12} y1={0} x2={halfW + 12} y2={0} />
      </g>
      <text
        x={0}
        y={-halfH - 16}
        fontSize={6.5}
        fontFamily="monospace"
        fill={centerlineColor}
        textAnchor="middle"
        opacity={0.8}
      >
        CL-Y (SYMMETRY)
      </text>

      {/* 3. Exclusion Zones (Hinges & Handle Latch) */}
      {exclusionZones.map((zone) => {
        // zone coordinates in door-cutout are (0,0) at bottom-left of door plate.
        // Convert to center-origin: svgX = zone.xMm - halfW, svgY = -(zone.yMm + zone.heightMm - halfH)
        const zx = zone.xMm - halfW;
        const zy = -(zone.yMm + zone.heightMm - halfH);

        const hasViolation = violations.some((v) => v.zoneName === zone.name);

        return (
          <g key={zone.id}>
            <rect
              x={zx}
              y={zy}
              width={zone.widthMm}
              height={zone.heightMm}
              fill={hasViolation ? "rgba(239, 68, 68, 0.28)" : "rgba(245, 158, 11, 0.12)"}
              stroke={hasViolation ? "#ef4444" : "#f59e0b"}
              strokeWidth={hasViolation ? 1.4 : 0.9}
              strokeDasharray={hasViolation ? "none" : "3,2"}
              rx={2}
            />
            {/* Diagonal hazard stripes or pattern icon */}
            <line
              x1={zx}
              y1={zy}
              x2={zx + zone.widthMm}
              y2={zy + zone.heightMm}
              stroke={hasViolation ? "#ef4444" : "#f59e0b"}
              strokeWidth={0.5}
              opacity={0.5}
            />
            <line
              x1={zx + zone.widthMm}
              y1={zy}
              x2={zx}
              y2={zy + zone.heightMm}
              stroke={hasViolation ? "#ef4444" : "#f59e0b"}
              strokeWidth={0.5}
              opacity={0.5}
            />
            <text
              x={zx + zone.widthMm / 2}
              y={zy + zone.heightMm / 2}
              fontSize={4.8}
              fontFamily="monospace"
              fontWeight="bold"
              fill={hasViolation ? "#ef4444" : "#d97706"}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {zone.type === "hinge" ? "HINGE ZONE" : "HANDLE ZONE"}
            </text>
          </g>
        );
      })}

      {/* 4. Cutouts & Precise Crosshairs & Auto Dimension Lines */}
      {cutouts.map((item) => {
        // center in SVG coordinates (0,0 is center of door):
        const cx = item.centerXMm - halfW;
        const cy = -(item.centerYMm - halfH);

        const leftEdgeX = -halfW;
        const topEdgeY = -halfH;

        const distLeft = item.centerXMm;
        const distTop = doorHeightMm - item.centerYMm;

        return (
          <g key={item.componentId} className="door-cutout-item">
            {/* Auto Dimension Lines (Center to Edge) */}
            {showDimensions && (
              <g stroke={dimLineColor} strokeWidth={0.6} strokeDasharray="2,2" opacity={0.85}>
                {/* Horizontal line to left edge */}
                <line x1={leftEdgeX} y1={cy} x2={cx} y2={cy} />
                {/* Vertical line to top edge */}
                <line x1={cx} y1={topEdgeY} x2={cx} y2={cy} />

                {/* Left dimension text */}
                <rect
                  x={(leftEdgeX + cx) / 2 - 12}
                  y={cy - 7}
                  width={24}
                  height={5}
                  rx={1}
                  fill={isDark ? "#090b10" : "#ffffff"}
                  stroke={dimColor}
                  strokeWidth={0.4}
                />
                <text
                  x={(leftEdgeX + cx) / 2}
                  y={cy - 3.2}
                  fontSize={3.8}
                  fontFamily="monospace"
                  fill={dimColor}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {distLeft.toFixed(1)}mm
                </text>

                {/* Top dimension text */}
                <rect
                  x={cx + 2}
                  y={(topEdgeY + cy) / 2 - 2.5}
                  width={26}
                  height={5}
                  rx={1}
                  fill={isDark ? "#090b10" : "#ffffff"}
                  stroke={dimColor}
                  strokeWidth={0.4}
                />
                <text
                  x={cx + 15}
                  y={(topEdgeY + cy) / 2 + 1}
                  fontSize={3.8}
                  fontFamily="monospace"
                  fill={dimColor}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  T={distTop.toFixed(1)}mm
                </text>
              </g>
            )}

            {/* Shape Crosshair & Cutout Outline */}
            {item.kind === "circle" && (
              <g>
                <circle
                  cx={cx}
                  cy={cy}
                  r={(item.mainDiameterMm || 22) / 2}
                  fill={isDark ? "#171a21" : "#ffffff"}
                  stroke="#ef4444"
                  strokeWidth={1.2}
                />
                {/* Precision Crosshair */}
                <line
                  x1={cx - 16}
                  y1={cy}
                  x2={cx + 16}
                  y2={cy}
                  stroke="#ef4444"
                  strokeWidth={0.7}
                />
                <line
                  x1={cx}
                  y1={cy - 16}
                  x2={cx}
                  y2={cy + 16}
                  stroke="#ef4444"
                  strokeWidth={0.7}
                />
                <circle cx={cx} cy={cy} r={1.2} fill="#ef4444" />
                <text
                  x={cx}
                  y={cy + 17}
                  fontSize={4.2}
                  fontFamily="monospace"
                  fontWeight="bold"
                  fill={textColor}
                  textAnchor="middle"
                >
                  {item.label}
                </text>
              </g>
            )}

            {item.kind === "rect" && (
              <g>
                <rect
                  x={cx - (item.rectWidthMm || 92) / 2}
                  y={cy - (item.rectHeightMm || 92) / 2}
                  width={item.rectWidthMm || 92}
                  height={item.rectHeightMm || 92}
                  fill={isDark ? "#0b0f19" : "#e2e8f0"}
                  stroke="#0284c7"
                  strokeWidth={1.4}
                  strokeDasharray="4,2"
                />
                {/* Center Crosshairs */}
                <line
                  x1={cx - 12}
                  y1={cy}
                  x2={cx + 12}
                  y2={cy}
                  stroke="#0284c7"
                  strokeWidth={0.7}
                />
                <line
                  x1={cx}
                  y1={cy - 12}
                  x2={cx}
                  y2={cy + 12}
                  stroke="#0284c7"
                  strokeWidth={0.7}
                />
                <circle cx={cx} cy={cy} r={1.5} fill="#0284c7" />
                <text
                  x={cx}
                  y={cy + (item.rectHeightMm || 92) / 2 + 7}
                  fontSize={5}
                  fontFamily="monospace"
                  fontWeight="bold"
                  fill={textColor}
                  textAnchor="middle"
                >
                  {item.label}
                </text>
              </g>
            )}

            {item.kind === "fan-filter" && (
              <g>
                <circle
                  cx={cx}
                  cy={cy}
                  r={(item.mainDiameterMm || 116) / 2}
                  fill={isDark ? "#171a21" : "#e2e8f0"}
                  stroke="#10b981"
                  strokeWidth={1.4}
                  strokeDasharray="4,2"
                />
                {/* Center Crosshair */}
                <line
                  x1={cx - 65}
                  y1={cy}
                  x2={cx + 65}
                  y2={cy}
                  stroke="#10b981"
                  strokeWidth={0.7}
                />
                <line
                  x1={cx}
                  y1={cy - 65}
                  x2={cx}
                  y2={cy + 65}
                  stroke="#10b981"
                  strokeWidth={0.7}
                />
                {/* 4 Corner Screw Holes */}
                {item.holes.map((h, i) => {
                  const hx = h.xMm - halfW;
                  const hy = -(h.yMm - halfH);
                  return (
                    <g key={i}>
                      <circle
                        cx={hx}
                        cy={hy}
                        r={h.diameterMm / 2}
                        fill="#ffffff"
                        stroke="#10b981"
                        strokeWidth={1}
                      />
                      <line
                        x1={hx - 4}
                        y1={hy}
                        x2={hx + 4}
                        y2={hy}
                        stroke="#10b981"
                        strokeWidth={0.5}
                      />
                      <line
                        x1={hx}
                        y1={hy - 4}
                        x2={hx}
                        y2={hy + 4}
                        stroke="#10b981"
                        strokeWidth={0.5}
                      />
                    </g>
                  );
                })}
                <text
                  x={cx}
                  y={cy + 68}
                  fontSize={4.8}
                  fontFamily="monospace"
                  fontWeight="bold"
                  fill={textColor}
                  textAnchor="middle"
                >
                  {item.label}
                </text>
              </g>
            )}

            {item.kind === "double-d" && (
              <g>
                <circle
                  cx={cx}
                  cy={cy}
                  r={(item.mainDiameterMm || 22) / 2}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={0.6}
                  strokeDasharray="2,2"
                />
                {/* Double-D flats */}
                {(() => {
                  const r = (item.mainDiameterMm || 22.5) / 2;
                  const flatHalf = (item.flatToFlatMm || 20.1) / 2;
                  return (
                    <>
                      <line
                        x1={cx - flatHalf}
                        y1={cy - r}
                        x2={cx - flatHalf}
                        y2={cy + r}
                        stroke="#f59e0b"
                        strokeWidth={1.3}
                      />
                      <line
                        x1={cx + flatHalf}
                        y1={cy - r}
                        x2={cx + flatHalf}
                        y2={cy + r}
                        stroke="#f59e0b"
                        strokeWidth={1.3}
                      />
                    </>
                  );
                })()}
                <line
                  x1={cx - 15}
                  y1={cy}
                  x2={cx + 15}
                  y2={cy}
                  stroke="#f59e0b"
                  strokeWidth={0.7}
                />
                <line
                  x1={cx}
                  y1={cy - 15}
                  x2={cx}
                  y2={cy + 15}
                  stroke="#f59e0b"
                  strokeWidth={0.7}
                />
                <text
                  x={cx}
                  y={cy + 16}
                  fontSize={4}
                  fontFamily="monospace"
                  fontWeight="bold"
                  fill={textColor}
                  textAnchor="middle"
                >
                  {item.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* 5. Door Title / Mode Indicator Banner */}
      <text
        x={0}
        y={halfH + 18}
        fontSize={8}
        fontFamily="monospace"
        fontWeight="bold"
        fill={textColor}
        textAnchor="middle"
      >
        ENCLOSURE DOOR FACE ({doorWidthMm} x {doorHeightMm} mm) · HINGE:{" "}
        {hingeSide.toUpperCase()} · T={enclosure.doorThicknessMm ?? 2.0}mm
      </text>
    </g>
  );
}
