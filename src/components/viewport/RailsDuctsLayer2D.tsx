"use client";

import React from "react";
import {
  getDuctFillStatusColor,
  type DuctFillStats,
} from "@/lib/duct-fill";
import type {
  CanvasTool2D,
  DinRail,
  SelectedTarget,
  WireDuct,
} from "@/types/panel";

function LockBadge2D({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <rect
        x={-4.5}
        y={-4.5}
        width={9}
        height={9}
        rx={2}
        fill="#fef3c7"
        stroke="#d97706"
        strokeWidth={0.6}
      />
      <path
        d="M -1.8 -0.4 V -1.7 A 1.8 1.8 0 0 1 1.8 -1.7 V -0.4"
        fill="none"
        stroke="#b45309"
        strokeWidth={0.85}
        strokeLinecap="round"
      />
      <rect
        x={-2.5}
        y={-0.5}
        width={5}
        height={3.6}
        rx={0.7}
        fill="#d97706"
      />
    </g>
  );
}

export interface RailsDuctsLayer2DProps {
  ducts: WireDuct[];
  rails: DinRail[];
  canvasTool2D: CanvasTool2D;
  spacePressed: boolean;
  activeWireStartPin: { componentId: string; pinId: string } | null;
  selectedIds: SelectedTarget[];
  isItemSelected: (kind: SelectedTarget["kind"], id: string) => boolean;
  collidingDuctIds: Set<string>;
  collidingRailIds: Set<string>;
  ductFillMap: Map<string, DuctFillStats>;
  screenToWorld: (clientX: number, clientY: number) => { xMm: number; yMm: number };
  toggleSelectId: (target: SelectedTarget) => void;
  setSelected: (target: SelectedTarget | null) => void;
  pushUndoSnapshot: () => void;
  onStartMultiDrag: (world: { xMm: number; yMm: number }) => void;
  onStartDuctMove: (id: string, offsetXMm: number, offsetYMm: number) => void;
  onStartDuctResize: (
    duct: WireDuct,
    edge: "right" | "top",
    world: { xMm: number; yMm: number }
  ) => void;
  onStartRailMove: (id: string, offsetXMm: number, offsetYMm: number) => void;
  onStartRailResize: (
    rail: DinRail,
    edge: "left" | "right",
    worldXMm: number
  ) => void;
  onOpenContextMenu: (
    x: number,
    y: number,
    target: import("@/components/ui/ContextMenu").ContextMenuTarget
  ) => void;
}

export const RailsDuctsLayer2D = React.memo(function RailsDuctsLayer2D({
  ducts,
  rails,
  canvasTool2D,
  spacePressed,
  activeWireStartPin,
  selectedIds,
  isItemSelected,
  collidingDuctIds,
  collidingRailIds,
  ductFillMap,
  screenToWorld,
  toggleSelectId,
  setSelected,
  pushUndoSnapshot,
  onStartMultiDrag,
  onStartDuctMove,
  onStartDuctResize,
  onStartRailMove,
  onStartRailResize,
  onOpenContextMenu,
}: RailsDuctsLayer2DProps) {
  return (
    <>
      {/* Wire Ducts Layer */}
      <g>
        {ducts.map((d) => {
          const x = d.xMm - d.widthMm / 2;
          const y = -(d.yMm + d.heightMm / 2);
          const isSelected = isItemSelected("duct", d.id);
          const hasDuctOverlap = collidingDuctIds.has(d.id);

          return (
            <g key={d.id}>
              <g
                onPointerDown={(e) => {
                  if (activeWireStartPin) return;
                  if (e.button !== 0 || canvasTool2D !== "select" || spacePressed) return;
                  e.stopPropagation();
                  if (e.shiftKey) {
                    toggleSelectId({ kind: "duct", id: d.id });
                    return;
                  }
                  const w = screenToWorld(e.clientX, e.clientY);
                  if (selectedIds.length > 1 && isSelected) {
                    pushUndoSnapshot();
                    onStartMultiDrag(w);
                    return;
                  }
                  setSelected({ kind: "duct", id: d.id });
                  if (d.locked) return;
                  pushUndoSnapshot();
                  onStartDuctMove(d.id, w.xMm - d.xMm, w.yMm - d.yMm);
                }}
                onContextMenu={(e) => {
                  if (activeWireStartPin) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (selectedIds.length > 1 && isSelected) {
                    onOpenContextMenu(e.clientX, e.clientY, { kind: "multi" });
                    return;
                  }
                  setSelected({ kind: "duct", id: d.id });
                  onOpenContextMenu(e.clientX, e.clientY, { kind: "duct", id: d.id });
                }}
                className={d.locked ? "cursor-default" : "cursor-move"}
              >
                {hasDuctOverlap && (
                  <rect
                    x={x - 1.2}
                    y={y - 1.2}
                    width={d.widthMm + 2.4}
                    height={d.heightMm + 2.4}
                    fill="#ef4444"
                    fillOpacity={0.12}
                    stroke="#ef4444"
                    strokeWidth={1.1}
                    strokeDasharray="3,2"
                    rx={1}
                    pointerEvents="none"
                  />
                )}
                <rect
                  x={x}
                  y={y}
                  width={d.widthMm}
                  height={d.heightMm}
                  fill="url(#duct-hatch)"
                  fillOpacity={0.35}
                  stroke={
                    hasDuctOverlap
                      ? "#ef4444"
                      : isSelected
                        ? "#0284c7"
                        : d.locked
                          ? "#d97706"
                          : "#64748b"
                  }
                  strokeWidth={hasDuctOverlap ? 1.3 : isSelected ? 1.2 : 0.7}
                  strokeDasharray="3,2"
                />
                <text
                  x={x + 4}
                  y={y + 10}
                  fontSize={5.5}
                  fontFamily="monospace"
                  fill="#475569"
                >
                  {d.name} ({d.widthMm}x{d.heightMm})
                </text>
                {d.locked && <LockBadge2D x={x + d.widthMm - 7} y={y + 7} />}
                {(() => {
                  const fillStats = ductFillMap.get(d.id);
                  if (!fillStats) return null;
                  const colors = getDuctFillStatusColor(fillStats.status);
                  const isHoriz = d.orientation === "horizontal";
                  const crossW = isHoriz ? d.heightMm : d.widthMm;
                  const crossH = d.depthMm || crossW;
                  const badgeText = `${crossW}x${crossH} [${fillStats.fillRatioPercent}%]`;
                  const badgeW = 34;
                  const badgeH = 9;
                  const bx = isHoriz
                    ? x + d.widthMm - badgeW - (d.locked ? 15 : 3)
                    : x + (d.widthMm - badgeW) / 2;
                  const by = isHoriz ? y + 3 : y + d.heightMm - badgeH - 4;
                  return (
                    <g pointerEvents="none">
                      <rect
                        x={bx}
                        y={by}
                        width={badgeW}
                        height={badgeH}
                        rx={2}
                        fill={colors.badgeBg}
                        stroke={colors.badgeBorder}
                        strokeWidth={0.5}
                      />
                      <text
                        x={bx + badgeW / 2}
                        y={by + badgeH / 2 + 0.3}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={4}
                        fontFamily="monospace"
                        fontWeight="bold"
                        fill={colors.badgeText}
                      >
                        {badgeText}
                      </text>
                    </g>
                  );
                })()}
              </g>

              {/* Duct Resize Handles (hidden when locked) */}
              {isSelected && canvasTool2D === "select" && !d.locked && (
                <>
                  <rect
                    x={x + d.widthMm - 3}
                    y={-d.yMm - 3}
                    width={6}
                    height={6}
                    fill="#0284c7"
                    className="cursor-ew-resize"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      pushUndoSnapshot();
                      onStartDuctResize(d, "right", screenToWorld(e.clientX, e.clientY));
                    }}
                  />
                  <rect
                    x={d.xMm - 3}
                    y={y - 3}
                    width={6}
                    height={6}
                    fill="#0284c7"
                    className="cursor-ns-resize"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      pushUndoSnapshot();
                      onStartDuctResize(d, "top", screenToWorld(e.clientX, e.clientY));
                    }}
                  />
                </>
              )}
            </g>
          );
        })}
      </g>

      {/* DIN Rails Layer (TH35) */}
      <g>
        {rails.map((r: DinRail) => {
          const x = r.xMm - r.lengthMm / 2;
          const y = -(r.yMm + 17.5);
          const isSelected = isItemSelected("rail", r.id);
          const hasRailOverlap = collidingRailIds.has(r.id);

          const holes: number[] = [];
          for (let hx = x + 12.5; hx <= x + r.lengthMm - 12.5; hx += 25) {
            holes.push(hx);
          }

          return (
            <g key={r.id}>
              <g
                onPointerDown={(e) => {
                  if (activeWireStartPin) return;
                  if (e.button !== 0 || canvasTool2D !== "select" || spacePressed) return;
                  e.stopPropagation();
                  if (e.shiftKey) {
                    toggleSelectId({ kind: "rail", id: r.id });
                    return;
                  }
                  const w = screenToWorld(e.clientX, e.clientY);
                  if (selectedIds.length > 1 && isSelected) {
                    pushUndoSnapshot();
                    onStartMultiDrag(w);
                    return;
                  }
                  setSelected({ kind: "rail", id: r.id });
                  if (r.locked) return;
                  pushUndoSnapshot();
                  onStartRailMove(r.id, w.xMm - r.xMm, w.yMm - r.yMm);
                }}
                onContextMenu={(e) => {
                  if (activeWireStartPin) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (selectedIds.length > 1 && isSelected) {
                    onOpenContextMenu(e.clientX, e.clientY, { kind: "multi" });
                    return;
                  }
                  setSelected({ kind: "rail", id: r.id });
                  onOpenContextMenu(e.clientX, e.clientY, { kind: "rail", id: r.id });
                }}
                className={r.locked ? "cursor-default" : "cursor-move"}
              >
                {hasRailOverlap && (
                  <rect
                    x={x - 1.2}
                    y={y - 1.2}
                    width={r.lengthMm + 2.4}
                    height={37.4}
                    fill="#ef4444"
                    fillOpacity={0.12}
                    stroke="#ef4444"
                    strokeWidth={1.1}
                    strokeDasharray="3,2"
                    rx={1}
                    pointerEvents="none"
                  />
                )}
                <rect
                  x={x}
                  y={y}
                  width={r.lengthMm}
                  height={35}
                  fill="#94a3b8"
                  fillOpacity={0.22}
                  stroke={
                    hasRailOverlap
                      ? "#ef4444"
                      : isSelected
                        ? "#0284c7"
                        : r.locked
                          ? "#d97706"
                          : "#475569"
                  }
                  strokeWidth={hasRailOverlap ? 1.3 : isSelected ? 1.2 : 0.8}
                />
                <line
                  x1={x}
                  y1={y + 6}
                  x2={x + r.lengthMm}
                  y2={y + 6}
                  stroke="#64748b"
                  strokeWidth={0.4}
                />
                <line
                  x1={x}
                  y1={y + 29}
                  x2={x + r.lengthMm}
                  y2={y + 29}
                  stroke="#64748b"
                  strokeWidth={0.4}
                />
                {holes.map((hx, idx) => (
                  <circle
                    key={idx}
                    cx={hx}
                    cy={y + 17.5}
                    r={1.6}
                    fill="#ffffff"
                    stroke="#475569"
                    strokeWidth={0.4}
                  />
                ))}
                <text
                  x={x + 6}
                  y={y + 13}
                  fontSize={6}
                  fontFamily="monospace"
                  fontWeight="bold"
                  fill="#1e293b"
                >
                  {r.name} ({r.lengthMm}mm)
                </text>
                {r.locked && <LockBadge2D x={x + r.lengthMm - 7} y={y + 7} />}
              </g>

              {/* Rail Resize Handles (hidden when locked) */}
              {isSelected && canvasTool2D === "select" && !r.locked && (
                <>
                  <rect
                    x={x - 3}
                    y={y + 14.5}
                    width={6}
                    height={6}
                    fill="#0284c7"
                    className="cursor-ew-resize"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      pushUndoSnapshot();
                      onStartRailResize(r, "left", screenToWorld(e.clientX, e.clientY).xMm);
                    }}
                  />
                  <rect
                    x={x + r.lengthMm - 3}
                    y={y + 14.5}
                    width={6}
                    height={6}
                    fill="#0284c7"
                    className="cursor-ew-resize"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      pushUndoSnapshot();
                      onStartRailResize(r, "right", screenToWorld(e.clientX, e.clientY).xMm);
                    }}
                  />
                </>
              )}
            </g>
          );
        })}
      </g>
    </>
  );
});
