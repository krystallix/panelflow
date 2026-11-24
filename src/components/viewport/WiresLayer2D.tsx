"use client";

import React, { useMemo, useState } from "react";
import {
  buildComponentObstacles,
  getWireOuterDiameterMm,
  pointsToRoundedSvgPath,
  pointsToSvgPath,
  resolvePinExitInfo,
  routeOrthogonalWire,
  routeWireThroughDucts,
} from "@/lib/wire-router";
import type {
  CanvasTool2D,
  CustomCadAsset,
  DinRail,
  PlacedComponent,
  SelectedTarget,
  ThemeMode,
  WireColorCode,
  WireConnection,
  WireDuct,
} from "@/types/panel";

const WIRE_COLOR_MAP: Record<WireColorCode, string> = {
  R: "#dc2626",
  S: "#eab308",
  T: "#2563eb",
  N: "#0284c7",
  PE: "#16a34a",
  "DC+": "#ef4444",
  "DC-": "#1e293b",
};

export interface WiresLayer2DProps {
  wires: WireConnection[];
  components: PlacedComponent[];
  cadAssets: CustomCadAsset[];
  ducts: WireDuct[];
  rails: DinRail[];
  pinMap: Map<string, { x: number; y: number }>;
  canvasTool2D: CanvasTool2D;
  spacePressed: boolean;
  theme: ThemeMode;
  autoRouteDuctsEnabled: boolean;
  activeWireStartPin: { componentId: string; pinId: string } | null;
  activeWireColor: WireColorCode;
  cursorWorld: { xMm: number; yMm: number } | null;
  freeEndSnapTarget: { componentId: string; pinId: string; xMm: number; yMm: number } | null;
  selectedIds: SelectedTarget[];
  isItemSelected: (kind: SelectedTarget["kind"], id: string) => boolean;
  findNearestPin: (
    worldXMm: number,
    worldYMm: number,
    maxDistMm?: number,
    excludePin?: { componentId: string; pinId: string } | null
  ) => { componentId: string; pinId: string; xMm: number; yMm: number } | null;
  toggleSelectId: (target: SelectedTarget) => void;
  setSelected: (target: SelectedTarget | null) => void;
  pushUndoSnapshot: () => void;
  updateWire: (
    id: string,
    partial: Partial<WireConnection>,
    options?: { skipHistory?: boolean }
  ) => void;
  onStartWireFreeEndDrag: (wireId: string) => void;
  onStartWireSegmentDrag: (
    wireId: string,
    segIndex: number,
    orientation: "horizontal" | "vertical",
    waypoints: Array<{ xMm: number; yMm: number }>
  ) => void;
  onStartWireWaypointDrag: (
    wireId: string,
    index: number,
    waypoints: Array<{ xMm: number; yMm: number }>
  ) => void;
  onOpenContextMenu: (
    x: number,
    y: number,
    target: import("@/components/ui/ContextMenu").ContextMenuTarget
  ) => void;
}

export const WiresLayer2D = React.memo(function WiresLayer2D({
  wires,
  components,
  cadAssets,
  ducts,
  rails,
  pinMap,
  canvasTool2D,
  spacePressed,
  theme,
  autoRouteDuctsEnabled,
  activeWireStartPin,
  activeWireColor,
  cursorWorld,
  freeEndSnapTarget,
  selectedIds,
  isItemSelected,
  findNearestPin,
  toggleSelectId,
  setSelected,
  pushUndoSnapshot,
  updateWire,
  onStartWireFreeEndDrag,
  onStartWireSegmentDrag,
  onStartWireWaypointDrag,
  onOpenContextMenu,
}: WiresLayer2DProps) {
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);

  const wireObstacles = useMemo(
    () => buildComponentObstacles(components, cadAssets),
    [components, cadAssets]
  );

  // Determine whether any wire is currently focused (hovered or selected) for Net Highlighting
  const hasWireFocus =
    hoveredWireId !== null ||
    wires.some((w) => isItemSelected("wire", w.id));

  return (
    <g
      pointerEvents={
        canvasTool2D === "wire" || Boolean(activeWireStartPin) ? "none" : undefined
      }
    >
      {wires.map((w) => {
        const p1 = pinMap.get(`${w.fromComponentId}:${w.fromPinId}`);
        const p2 = w.toFreePoint
          ? { x: w.toFreePoint.xMm, y: -w.toFreePoint.yMm }
          : pinMap.get(`${w.toComponentId}:${w.toPinId}`);
        if (!p1 || !p2) return null;

        // Live pin-bound routing: verify cached waypoints still match live p1 & p2
        const hasSyncedWaypoints =
          w.waypoints &&
          w.waypoints.length >= 2 &&
          Math.hypot(w.waypoints[0].xMm - p1.x, -w.waypoints[0].yMm - p1.y) < 0.5 &&
          Math.hypot(
            w.waypoints[w.waypoints.length - 1].xMm - p2.x,
            -w.waypoints[w.waypoints.length - 1].yMm - p2.y
          ) < 0.5;

        const exit1 = resolvePinExitInfo(
          components,
          cadAssets,
          w.fromComponentId,
          w.fromPinId
        );
        const exit2 = w.toFreePoint
          ? null
          : resolvePinExitInfo(components, cadAssets, w.toComponentId, w.toPinId);
        const waypoints = hasSyncedWaypoints
          ? w.waypoints!.map((pt) => ({ x: pt.xMm, y: -pt.yMm }))
          : autoRouteDuctsEnabled && ducts.length > 0
            ? routeWireThroughDucts(
                { x: p1.x, y: -p1.y },
                { x: p2.x, y: -p2.y },
                ducts,
                rails,
                0,
                {
                  startExitDir: exit1?.exitDir,
                  endExitDir: exit2?.exitDir,
                  startStubPt: exit1?.stubPt,
                  endStubPt: exit2?.stubPt,
                  obstacles: wireObstacles,
                }
              ).map((pt) => ({ x: pt.x, y: -pt.y }))
            : routeOrthogonalWire(p1, p2, "horizontal-first");
        const pathD = pointsToRoundedSvgPath(waypoints, 4);
        const stroke = WIRE_COLOR_MAP[w.colorCode] || "#2563eb";
        const wireDiaMm = getWireOuterDiameterMm(w.gaugeMm2);
        const isSelected = isItemSelected("wire", w.id);
        const isHovered = hoveredWireId === w.id;
        const isHighlighted = isSelected || isHovered;
        const wireOpacity = hasWireFocus ? (isHighlighted ? 1 : 0.25) : 1;

        return (
          <g
            key={w.id}
            style={{ opacity: wireOpacity, transition: "opacity 120ms ease" }}
            onPointerEnter={() => setHoveredWireId(w.id)}
            onPointerLeave={() =>
              setHoveredWireId((prev) => (prev === w.id ? null : prev))
            }
            onPointerDown={(e) => {
              if (e.button !== 0 || canvasTool2D !== "select" || spacePressed) return;
              e.stopPropagation();
              if (e.shiftKey) {
                toggleSelectId({ kind: "wire", id: w.id });
                return;
              }
              setSelected({ kind: "wire", id: w.id });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (selectedIds.length > 1 && isSelected) {
                onOpenContextMenu(e.clientX, e.clientY, { kind: "multi" });
                return;
              }
              setSelected({ kind: "wire", id: w.id });
              onOpenContextMenu(e.clientX, e.clientY, { kind: "wire", id: w.id });
            }}
            className="cursor-pointer"
          >
            <path
              d={pathD}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(8, wireDiaMm + 4)}
            />
            {isHighlighted && (
              <path
                d={pathD}
                fill="none"
                stroke={isSelected ? "#0284c7" : stroke}
                strokeWidth={wireDiaMm + 2.2}
                strokeOpacity={isSelected ? 0.35 : 0.25}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            <path
              d={pathD}
              fill="none"
              stroke={stroke}
              strokeWidth={isHovered && !isSelected ? wireDiaMm + 0.55 : wireDiaMm}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Highlight start/end pin rings when wire is hovered or selected */}
            {isHighlighted && (
              <g pointerEvents="none">
                <circle
                  cx={p1.x}
                  cy={p1.y}
                  r={3.2}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={0.9}
                />
                {!w.toFreePoint && (
                  <circle
                    cx={p2.x}
                    cy={p2.y}
                    r={3.2}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={0.9}
                  />
                )}
              </g>
            )}

            {/* Free-end Terminal Circle & Optional Label (e.g. "Power Source R") */}
            {w.toFreePoint && (() => {
              const prevPt =
                waypoints.length >= 2 ? waypoints[waypoints.length - 2] : p1;
              const dx = p2.x - prevPt.x;
              const dy = p2.y - prevPt.y;
              const horizontalEnd = Math.abs(dx) >= Math.abs(dy);
              const labelText = (w.toFreeLabel ?? "").trim();
              const pillW = Math.max(14, labelText.length * 2.45 + 6);
              const pillH = 7.4;
              const labelX = horizontalEnd
                ? dx >= 0
                  ? p2.x + 5.5
                  : p2.x - 5.5 - pillW
                : p2.x - pillW / 2;
              const labelY = horizontalEnd
                ? p2.y - pillH / 2
                : dy >= 0
                  ? p2.y + 5.5
                  : p2.y - 5.5 - pillH;
              return (
                <g>
                  <circle
                    cx={p2.x}
                    cy={p2.y}
                    r={6}
                    fill="transparent"
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => {
                      if (e.button !== 0 || spacePressed) return;
                      e.stopPropagation();
                      setSelected({ kind: "wire", id: w.id });
                      pushUndoSnapshot();
                      onStartWireFreeEndDrag(w.id);
                    }}
                  />
                  {isSelected && (
                    <circle
                      cx={p2.x}
                      cy={p2.y}
                      r={4.5}
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth={0.9}
                      strokeOpacity={0.75}
                      pointerEvents="none"
                    />
                  )}
                  <circle
                    cx={p2.x}
                    cy={p2.y}
                    r={2.9}
                    fill={theme === "dark" ? "#0f172a" : "#ffffff"}
                    stroke={stroke}
                    strokeWidth={1.35}
                    pointerEvents="none"
                  />
                  <circle
                    cx={p2.x}
                    cy={p2.y}
                    r={1.05}
                    fill={stroke}
                    pointerEvents="none"
                  />
                  {labelText && (
                    <g pointerEvents="none" className="select-none">
                      <rect
                        x={labelX}
                        y={labelY}
                        width={pillW}
                        height={pillH}
                        rx={1.8}
                        fill={theme === "dark" ? "#0f172a" : "#ffffff"}
                        fillOpacity={0.95}
                        stroke={isSelected ? "#0284c7" : stroke}
                        strokeWidth={0.65}
                      />
                      <text
                        x={labelX + pillW / 2}
                        y={labelY + pillH / 2 + 0.25}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={3.7}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        fontWeight={700}
                        fill={theme === "dark" ? "#f8fafc" : "#0f172a"}
                      >
                        {labelText}
                      </text>
                    </g>
                  )}
                </g>
              );
            })()}

            {/* Interactive Draggable Segments, Corner Nodes & Midpoint Handles when Wire is Selected */}
            {isSelected && !spacePressed && (() => {
              const worldWaypoints = waypoints.map((pt) => ({
                xMm: pt.x,
                yMm: -pt.y,
              }));
              return (
                <g>
                  {waypoints.slice(0, -1).map((a, segIdx) => {
                    const b = waypoints[segIdx + 1];
                    const isInterior = segIdx > 0 && segIdx + 1 < waypoints.length - 1;
                    if (!isInterior) return null;
                    const isHoriz = Math.abs(a.y - b.y) < 1;
                    const isVert = Math.abs(a.x - b.x) < 1;
                    if (!isHoriz && !isVert) return null;
                    return (
                      <line
                        key={`wseg-${w.id}-${segIdx}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="transparent"
                        strokeWidth={8}
                        className={isHoriz ? "cursor-ns-resize" : "cursor-ew-resize"}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          pushUndoSnapshot();
                          onStartWireSegmentDrag(
                            w.id,
                            segIdx,
                            isHoriz ? "horizontal" : "vertical",
                            worldWaypoints
                          );
                        }}
                      />
                    );
                  })}

                  {waypoints.slice(0, -1).map((a, segIdx) => {
                    const b = waypoints[segIdx + 1];
                    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
                    if (segLen < 16) return null;
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2;
                    return (
                      <g
                        key={`wmid-${w.id}-${segIdx}`}
                        className="cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          pushUndoSnapshot();
                          const inserted = [
                            ...worldWaypoints.slice(0, segIdx + 1),
                            { xMm: mx, yMm: -my },
                            ...worldWaypoints.slice(segIdx + 1),
                          ];
                          updateWire(
                            w.id,
                            { waypoints: inserted },
                            { skipHistory: true }
                          );
                          onStartWireWaypointDrag(w.id, segIdx + 1, inserted);
                        }}
                      >
                        <circle cx={mx} cy={my} r={5} fill="transparent" />
                        <circle
                          cx={mx}
                          cy={my}
                          r={2.2}
                          fill="#e0f2fe"
                          stroke="#0284c7"
                          strokeWidth={0.7}
                          pointerEvents="none"
                        />
                        <line
                          x1={mx - 1.1}
                          y1={my}
                          x2={mx + 1.1}
                          y2={my}
                          stroke="#0284c7"
                          strokeWidth={0.55}
                          pointerEvents="none"
                        />
                        <line
                          x1={mx}
                          y1={my - 1.1}
                          x2={mx}
                          y2={my + 1.1}
                          stroke="#0284c7"
                          strokeWidth={0.55}
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}

                  {waypoints.slice(1, -1).map((pt, offsetIdx) => {
                    const nodeIdx = offsetIdx + 1;
                    return (
                      <g
                        key={`wnode-${w.id}-${nodeIdx}`}
                        className="cursor-move"
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          pushUndoSnapshot();
                          onStartWireWaypointDrag(w.id, nodeIdx, worldWaypoints);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (worldWaypoints.length <= 2) return;
                          const pruned = worldWaypoints.filter(
                            (_, idx) => idx !== nodeIdx
                          );
                          updateWire(w.id, { waypoints: pruned });
                        }}
                      >
                        <circle cx={pt.x} cy={pt.y} r={5.5} fill="transparent" />
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={2.8}
                          fill="#ffffff"
                          stroke="#0284c7"
                          strokeWidth={0.95}
                          pointerEvents="none"
                        />
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={1.0}
                          fill="#0284c7"
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })()}
          </g>
        );
      })}

      {/* Magnetic Snap-to-Pin Ring when Dragging a Free-End Terminal Circle */}
      {freeEndSnapTarget && (
        <circle
          cx={freeEndSnapTarget.xMm}
          cy={-freeEndSnapTarget.yMm}
          r={4.5}
          fill="#10b981"
          fillOpacity={0.22}
          stroke="#10b981"
          strokeWidth={1.1}
          pointerEvents="none"
        />
      )}

      {/* Live Wire Preview with Magnetic Pin Snap */}
      {activeWireStartPin && cursorWorld && (() => {
        const p1 = pinMap.get(
          `${activeWireStartPin.componentId}:${activeWireStartPin.pinId}`
        );
        if (!p1) return null;
        const snappedTarget = findNearestPin(
          cursorWorld.xMm,
          cursorWorld.yMm,
          3.8,
          activeWireStartPin
        );
        const endWorldX = snappedTarget ? snappedTarget.xMm : cursorWorld.xMm;
        const endWorldY = snappedTarget ? snappedTarget.yMm : cursorWorld.yMm;
        const startExit = resolvePinExitInfo(
          components,
          cadAssets,
          activeWireStartPin.componentId,
          activeWireStartPin.pinId
        );
        const endExit = snappedTarget
          ? resolvePinExitInfo(
              components,
              cadAssets,
              snappedTarget.componentId,
              snappedTarget.pinId
            )
          : null;
        const previewPts =
          autoRouteDuctsEnabled && ducts.length > 0
            ? routeWireThroughDucts(
                { x: p1.x, y: -p1.y },
                { x: endWorldX, y: endWorldY },
                ducts,
                rails,
                wires.length,
                {
                  startExitDir: startExit?.exitDir,
                  endExitDir: endExit?.exitDir,
                  startStubPt: startExit?.stubPt,
                  endStubPt: endExit?.stubPt,
                  obstacles: wireObstacles,
                }
              ).map((pt) => ({ x: pt.x, y: -pt.y }))
            : routeOrthogonalWire(
                p1,
                { x: endWorldX, y: -endWorldY },
                "horizontal-first"
              );
        return (
          <g className="pointer-events-none">
            <path
              d={pointsToSvgPath(previewPts)}
              fill="none"
              stroke={WIRE_COLOR_MAP[activeWireColor] || "#0284c7"}
              strokeWidth={snappedTarget ? 1.4 : 1.1}
              strokeDasharray={snappedTarget ? undefined : "3,2"}
            />
            {snappedTarget && (
              <circle
                cx={snappedTarget.xMm}
                cy={-snappedTarget.yMm}
                r={4.2}
                fill="#0284c7"
                fillOpacity={0.22}
                stroke="#0284c7"
                strokeWidth={0.9}
              />
            )}
          </g>
        );
      })()}
    </g>
  );
});
