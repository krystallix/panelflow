"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Circle,
  Grid,
  Hand,
  Hash,
  Layers,
  Maximize2,
  MousePointer2,
  Redo2,
  Route,
  Ruler,
  Square,
  Tag,
  Trash2,
  Undo2,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { SelectionFloatingBar } from "@/components/ui/SelectionFloatingBar";
import { ComponentSvg2D } from "@/components/viewport/ComponentSvg2D";
import { RailsDuctsLayer2D } from "@/components/viewport/RailsDuctsLayer2D";
import { WiresLayer2D } from "@/components/viewport/WiresLayer2D";
import {
  PANELFLOW_PART_DRAG_MIME,
  buildCadAssetFromLibraryItem,
  consumeDraggedCadLibraryItem,
  type PartDragPayload,
} from "@/lib/part-drag";
import { detectCollisionsAndBounds, getEffectiveCadBounds } from "@/lib/collision";
import { MATERIAL_PRESETS } from "@/types/panel";
import {
  buildAlignmentTargetBoxes,
  computeAlignmentGuides,
  type AlignmentGuideLine,
  type AlignmentTargetBox,
} from "@/lib/alignment-guides";
import {
  buildSvgObstacleBoxes,
  formatCadDisplayLabel,
  getComponentTagPlacement,
  getSmartCadLabelPosition,
  getSmartPinLabelLayout,
  type SvgRect,
} from "@/lib/cad-label";
import { getBackplateDimensions } from "@/lib/template-export";
import { EnclosureDoor2D } from "./EnclosureDoor2D";
import { calculateAllDuctFillRatios, getDuctFillStatusColor } from "@/lib/duct-fill";
import { parseDxfToMmSegments } from "@/lib/dxf-parser";
import { WIRE_COLOR_MAP } from "@/lib/sheet-export";
import {
  computePlateRulerSubTicks,
  computeSelectionFootprint,
  getRulerStepsMm,
  plateToWorldX,
  plateToWorldY,
  worldToPlateX,
  worldToPlateY,
} from "@/lib/ruler";
import { DIN_RAIL_HEIGHT_MM, getRotatedDimensions, rotateLocalPoint, snapToGrid } from "@/lib/snap";
import { formatDim } from "@/lib/units";
import {
  buildComponentObstacles,
  getWireOuterDiameterMm,
  pointsToRoundedSvgPath,
  pointsToSvgPath,
  resolvePinExitInfo,
  routeOrthogonalWire,
  routeWireThroughDucts,
} from "@/lib/wire-router";
import { usePanelStore } from "@/store/usePanelStore";
import type {
  CustomCadAsset,
  DinRail,
  GridSnapMm,
  PlacedComponent,
  RotationDeg,
  SelectedTarget,
  WireColorCode,
  WireDuct,
} from "@/types/panel";

const WIRE_GAUGES = ["0.75", "1.0", "1.5", "2.5", "4.0", "6.0", "10.0", "16.0"] as const;

const WIRE_COLORS: { code: WireColorCode; label: string; hex: string }[] = [
  { code: "R", label: "R (L1)", hex: "#dc2626" },
  { code: "S", label: "S (L2)", hex: "#eab308" },
  { code: "T", label: "T (L3)", hex: "#2563eb" },
  { code: "N", label: "N", hex: "#0284c7" },
  { code: "PE", label: "PE", hex: "#16a34a" },
  { code: "DC+", label: "+24V", hex: "#ef4444" },
  { code: "DC-", label: "0V", hex: "#1e293b" },
];

type DragState =
  | {
      type: "pan";
      startClientX: number;
      startClientY: number;
      startPanX: number;
      startPanY: number;
    }
  | {
      type: "component";
      id: string;
      offsetXMm: number;
      offsetYMm: number;
    }
  | {
      type: "cad";
      id: string;
      offsetXMm: number;
      offsetYMm: number;
    }
  | {
      type: "rail-move";
      id: string;
      offsetXMm: number;
      offsetYMm: number;
    }
  | {
      type: "rail-resize";
      id: string;
      edge: "left" | "right";
      initialXMm: number;
      initialLengthMm: number;
      startWorldXMm: number;
    }
  | {
      type: "duct-move";
      id: string;
      offsetXMm: number;
      offsetYMm: number;
    }
  | {
      type: "duct-resize";
      id: string;
      edge: "left" | "right" | "top" | "bottom";
      initialDuct: WireDuct;
      startWorldXMm: number;
      startWorldYMm: number;
    }
  | {
      type: "marquee";
      startWorldXMm: number;
      startWorldYMm: number;
      currentWorldXMm: number;
      currentWorldYMm: number;
      additive: boolean;
    }
  | {
      type: "multi-drag";
      startWorldXMm: number;
      startWorldYMm: number;
      lastDxMm: number;
      lastDyMm: number;
    }
  | {
      type: "draw";
      startWorldXMm: number;
      startWorldYMm: number;
      currentWorldXMm: number;
      currentWorldYMm: number;
    }
  | {
      type: "wire-waypoint";
      wireId: string;
      index: number;
      waypoints: Array<{ xMm: number; yMm: number }>;
    }
  | {
      type: "wire-segment";
      wireId: string;
      segIndex: number;
      orientation: "horizontal" | "vertical";
      waypoints: Array<{ xMm: number; yMm: number }>;
    }
  | {
      type: "wire-free-end";
      wireId: string;
    }
  | {
      type: "cad-resize";
      id: string;
      handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
      initialXMm: number;
      initialYMm: number;
      initialW: number;
      initialH: number;
      initialD: number;
      rotationDeg: number;
      startWorldXMm: number;
      startWorldYMm: number;
    };

function Component2DSymbol({
  comp,
  isSelected,
  isWireMode,
  canQuickWire,
  isDark,
  zoom,
  showAllPinLabels,
  obstacleBoxes,
  activeWireStartPin,
  onPointerDown,
  onContextMenu,
  onPinClick,
  onPinDoubleClick,
  onPinContextMenu,
  hasCollision,
  isOutOfBounds,
}: {
  comp: PlacedComponent;
  isSelected: boolean;
  isWireMode: boolean;
  canQuickWire: boolean;
  isDark: boolean;
  zoom: number;
  showAllPinLabels: boolean;
  obstacleBoxes: SvgRect[];
  activeWireStartPin: { componentId: string; pinId: string } | null;
  onPointerDown: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPinClick: (e: React.PointerEvent, pinId: string) => void;
  onPinDoubleClick?: (e: React.MouseEvent, pin: import("@/types/panel").PinTerminal, worldCoords: { xMm: number; yMm: number }) => void;
  onPinContextMenu?: (e: React.MouseEvent, pin: import("@/types/panel").PinTerminal, worldCoords: { xMm: number; yMm: number }) => void;
  hasCollision?: boolean;
  isOutOfBounds?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  // SVG Y is down, world Y is up
  const x = comp.xMm - comp.widthMm / 2;
  const y = -(comp.yMm + comp.heightMm / 2);

  const bodyFill = comp.color || "#f8fafc";
  const accent = comp.accentColor || "#334155";
  const rot = comp.rotationDeg ?? 0;

  const tagPlacement = useMemo(
    () =>
      getComponentTagPlacement({
        comp,
        x,
        y,
        otherBoxes: obstacleBoxes,
      }),
    [comp, x, y, obstacleBoxes]
  );

  const isWiringActive = isWireMode || Boolean(activeWireStartPin);
  const shouldShowPins =
    showAllPinLabels || isWiringActive || isSelected || isHovered || zoom >= 1.6;

  return (
    <g
      onPointerDown={onPointerDown}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onContextMenu={onContextMenu}
      transform={rot ? `rotate(${rot} ${comp.xMm} ${-comp.yMm})` : undefined}
      className={isWireMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}
    >
      {/* Collision / Out-of-Bounds Warning Highlight */}
      {(hasCollision || isOutOfBounds) && (
        <g className="pointer-events-none">
          <rect
            x={x - 1.5}
            y={y - 1.5}
            width={comp.widthMm + 3}
            height={comp.heightMm + 3}
            fill="#ef4444"
            fillOpacity={0.12}
            stroke="#ef4444"
            strokeWidth={1.6}
            strokeDasharray={isOutOfBounds ? "4,2" : undefined}
            rx={1}
          />
          <rect
            x={x + comp.widthMm - 18}
            y={y - 6}
            width={18}
            height={6}
            rx={1}
            fill="#dc2626"
          />
          <text
            x={x + comp.widthMm - 9}
            y={y - 1.5}
            fontSize={3.8}
            fontFamily="monospace"
            fontWeight="bold"
            fill="#ffffff"
            textAnchor="middle"
          >
            {isOutOfBounds ? "! OOB" : "! OVL"}
          </text>
        </g>
      )}

      {/* Selection halo */}
      {isSelected && (
        <rect
          x={x - 1.2}
          y={y - 1.2}
          width={comp.widthMm + 2.4}
          height={comp.heightMm + 2.4}
          fill="none"
          stroke={comp.locked ? "#f59e0b" : "#0284c7"}
          strokeWidth={0.55}
          strokeOpacity={0.85}
          strokeDasharray="2,1.5"
          rx={1}
        />
      )}

      {/* Locked / Group Badge */}
      {(comp.locked || comp.groupId) && (
        <g className="pointer-events-none">
          {comp.locked && (
            <text
              x={x + 2}
              y={y + 8}
              fontSize={6}
              fontFamily="sans-serif"
              fill="#f59e0b"
              fontWeight="bold"
            >
              🔒
            </text>
          )}
          {comp.groupId && (
            <circle
              cx={x + comp.widthMm - 4}
              cy={y + 4}
              r={2.5}
              fill="#8b5cf6"
              stroke="#ffffff"
              strokeWidth={0.5}
            />
          )}
        </g>
      )}

      {/* Clean Monochrome CAD 2D Component Hardware Artwork */}
      <ComponentSvg2D
        comp={comp}
        x={x}
        y={y}
        bodyFill={bodyFill}
        accent={accent}
        isSelected={isSelected}
      />

      {/* Clean Readable IEC Component Tag Pill */}
      <g
        className="pointer-events-none select-none"
        transform={
          rot === 180
            ? `rotate(180 ${tagPlacement.x} ${tagPlacement.y})`
            : undefined
        }
      >
        <rect
          x={tagPlacement.x - tagPlacement.pillWidth / 2}
          y={tagPlacement.y - tagPlacement.pillHeight / 2}
          width={tagPlacement.pillWidth}
          height={tagPlacement.pillHeight}
          rx={1.5}
          fill={
            isSelected
              ? "#0284c7"
              : isDark
              ? "#0f172a"
              : "#ffffff"
          }
          fillOpacity={isSelected ? 0.96 : 0.92}
          stroke={
            isSelected
              ? "#0369a1"
              : isDark
              ? "#475569"
              : "#cbd5e1"
          }
          strokeWidth={0.55}
        />
        <text
          x={tagPlacement.x}
          y={tagPlacement.y + 0.15}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={tagPlacement.fontSize}
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          fontWeight={700}
          fill={isSelected ? "#ffffff" : isDark ? "#f8fafc" : "#0f172a"}
        >
          {tagPlacement.text}
        </text>
      </g>

      {/* Pins with Smart Auto-LOD Anti-Overlap Labels */}
      {comp.pins.map((pin, pinIdx) => {
        const px = comp.xMm + pin.localXMm;
        const py = -(comp.yMm + pin.localYMm);
        const isStartPin =
          activeWireStartPin?.componentId === comp.id &&
          activeWireStartPin?.pinId === pin.id;
        const pinLayout = getSmartPinLabelLayout(comp, pin, pinIdx);

        return (
          <g
            key={pin.id}
            onPointerDown={(e) => {
              if (e.button === 0 && (isWireMode || canQuickWire)) {
                e.stopPropagation();
                onPinClick(e, pin.id);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onPinDoubleClick?.(e, pin, { xMm: px, yMm: comp.yMm + pin.localYMm });
            }}
            onContextMenu={(e) => {
              if (isWiringActive || canQuickWire) {
                e.stopPropagation();
                e.preventDefault();
                onPinContextMenu?.(e, pin, { xMm: px, yMm: comp.yMm + pin.localYMm });
              }
            }}
            className="cursor-crosshair"
          >
            {/* Expanded transparent hit target so clicking a pin is effortless and never drags the component */}
            <circle
              cx={px}
              cy={py}
              r={isWiringActive ? 5.0 : 3.6}
              fill="transparent"
              pointerEvents="all"
            />
            {isWiringActive && !isStartPin && (
              <circle
                cx={px}
                cy={py}
                r={3.2}
                fill="#0284c7"
                fillOpacity={0.14}
                stroke="#0284c7"
                strokeOpacity={0.55}
                strokeWidth={0.45}
                pointerEvents="none"
              />
            )}
            <circle
              cx={px}
              cy={py}
              r={isWiringActive ? 2.2 : isSelected || isHovered ? 1.8 : 1.4}
              fill={isStartPin ? "#0284c7" : "#ffffff"}
              stroke={isStartPin ? "#0369a1" : isWiringActive ? "#0284c7" : "#334155"}
              strokeWidth={isWiringActive ? 0.75 : 0.55}
              pointerEvents="none"
            />
            {shouldShowPins && (
              <text
                x={pinLayout.x}
                y={pinLayout.y}
                fontSize={pinLayout.fontSize}
                fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace"
                fontWeight={700}
                fill={isWiringActive ? "#0369a1" : isDark ? "#f1f5f9" : "#0f172a"}
                stroke={isDark ? "#0b0f19" : "#ffffff"}
                strokeWidth={1.1}
                strokeLinejoin="round"
                style={{ paintOrder: "stroke fill" }}
                textAnchor={pinLayout.textAnchor}
                dominantBaseline={pinLayout.dominantBaseline}
                pointerEvents="none"
              >
                {pin.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function CadAsset2DSymbol({
  asset,
  isSelected,
  isMarkingThis,
  isWireMode,
  canQuickWire,
  isDark,
  obstacleBoxes,
  activeWireStartPin,
  onPointerDown,
  onContextMenu,
  onPinClick,
  onPinDoubleClick,
  onPinContextMenu,
  onStartResize,
}: {
  asset: CustomCadAsset;
  isSelected: boolean;
  isMarkingThis: boolean;
  isWireMode: boolean;
  canQuickWire: boolean;
  isDark: boolean;
  obstacleBoxes: SvgRect[];
  activeWireStartPin: { componentId: string; pinId: string } | null;
  onPointerDown: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPinClick: (e: React.PointerEvent, pinId: string) => void;
  onPinDoubleClick?: (e: React.MouseEvent, pin: import("@/types/panel").PinTerminal, worldCoords: { xMm: number; yMm: number }) => void;
  onPinContextMenu?: (e: React.MouseEvent, pin: import("@/types/panel").PinTerminal, worldCoords: { xMm: number; yMm: number }) => void;
  onStartResize?: (
    e: React.PointerEvent,
    handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"
  ) => void;
}) {
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);

  const dxfParsed = useMemo(() => {
    if (asset.format !== "dxf" || !asset.rawText) return null;
    return parseDxfToMmSegments(asset.rawText, asset.sourceUnit);
  }, [asset.format, asset.rawText, asset.sourceUnit]);

  const w = dxfParsed ? dxfParsed.boundingBoxMm.w : asset.boundingBoxMm.w;
  const h = dxfParsed ? dxfParsed.boundingBoxMm.h : asset.boundingBoxMm.h;

  const effBounds = getEffectiveCadBounds({
    boundingBoxMm: { w, h },
    cropMm: asset.cropMm,
  });
  const effW = effBounds.widthMm;
  const effH = effBounds.heightMm;

  // SVG Y is down, world Y is up
  const effX = asset.xMm + effBounds.offsetX - effW / 2;
  const effY = -(asset.yMm + effBounds.offsetY + effH / 2);
  const hasCrop = Boolean(
    asset.cropMm &&
      (asset.cropMm.top > 0 ||
        asset.cropMm.bottom > 0 ||
        asset.cropMm.left > 0 ||
        asset.cropMm.right > 0)
  );
  const clipId = `cad-crop-${asset.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  const cleanLabel = formatCadDisplayLabel(asset.name, 28);
  const rot = asset.rotationDeg ?? 0;

  const smartPos = useMemo(() => {
    return getSmartCadLabelPosition({
      assetId: asset.id,
      effX,
      effY,
      effW,
      effH,
      cropMm: asset.cropMm,
      labelPosition: asset.labelPosition,
      otherBoxes: obstacleBoxes,
    });
  }, [
    asset.id,
    effX,
    effY,
    effW,
    effH,
    asset.cropMm,
    asset.labelPosition,
    obstacleBoxes,
  ]);

  return (
    <g
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      transform={rot ? `rotate(${rot} ${asset.xMm} ${-asset.yMm})` : undefined}
      className={
        isMarkingThis || isWireMode
          ? "cursor-crosshair"
          : "cursor-grab active:cursor-grabbing"
      }
    >
      <title>{asset.fileName}</title>

      {hasCrop && (
        <defs>
          <clipPath id={clipId}>
            <rect x={effX} y={effY} width={effW} height={effH} />
          </clipPath>
        </defs>
      )}

      {/* Interactive Hitbox & Background (Uniform Monochrome CAD Light Gray) */}
      {(() => {
        const isShape = Boolean(asset.materialType || asset.drawShape);
        const fill = isShape ? "#f1f5f9" : asset.format === "dxf" ? "#f0f9ff" : "#f8fafc";
        const strokeColor = isMarkingThis
          ? "#f59e0b"
          : isSelected
          ? "#0284c7"
          : isShape
          ? "#0f172a"
          : "#94a3b8";

        if (asset.drawShape === "circle") {
          return (
            <ellipse
              cx={effX + effW / 2}
              cy={effY + effH / 2}
              rx={effW / 2}
              ry={effH / 2}
              fill={fill}
              fillOpacity={asset.imageOverlayUrl ? 0.0 : isShape ? 0.96 : asset.format === "dxf" ? 0.35 : 0.85}
              stroke={strokeColor}
              strokeWidth={isMarkingThis || isSelected ? 1.1 : 0.85}
            />
          );
        }

        return (
          <g>
            <rect
              x={effX}
              y={effY}
              width={effW}
              height={effH}
              fill={fill}
              fillOpacity={asset.imageOverlayUrl ? 0.0 : isShape ? 0.96 : asset.format === "dxf" ? 0.35 : 0.85}
              stroke={strokeColor}
              strokeWidth={isMarkingThis || isSelected ? 1.1 : 0.85}
              strokeDasharray={asset.imageOverlayUrl || isShape ? undefined : asset.format === "dxf" ? "2,1.5" : undefined}
              rx={isShape ? 1.2 : 0}
            />
            {isShape && !asset.imageOverlayUrl && effW >= 12 && effH >= 12 && (
              <rect
                x={effX + 1}
                y={effY + 1}
                width={effW - 2}
                height={effH - 2}
                rx={0.7}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth={0.4}
                pointerEvents="none"
              />
            )}
          </g>
        );
      })()}

      {/* Direct Crisp Photo / Image Component Overlay */}
      {asset.imageOverlayUrl && (asset.showImageOverlay ?? true) && (
        <image
          href={asset.imageOverlayUrl}
          x={effX}
          y={effY}
          width={effW}
          height={effH}
          preserveAspectRatio="none"
          clipPath={hasCrop ? `url(#${clipId})` : undefined}
          opacity={asset.imageOpacity ?? 1.0}
          style={{ imageRendering: "crisp-edges" }}
          className="pointer-events-none"
        />
      )}

      {/* Selection / Marking Halo */}
      {(isSelected || isMarkingThis) && (
        <rect
          x={effX - 1.2}
          y={effY - 1.2}
          width={effW + 2.4}
          height={effH + 2.4}
          fill="none"
          stroke={isMarkingThis ? "#f59e0b" : asset.locked ? "#f59e0b" : "#0284c7"}
          strokeWidth={0.55}
          strokeOpacity={0.85}
          strokeDasharray="2,1.5"
          rx={1}
          pointerEvents="none"
        />
      )}

      {/* Vector-Editor 8-Handle Direct Resize Controls (4 Corners + 4 Edges) */}
      {isSelected && !isMarkingThis && !asset.locked && !isWireMode && !activeWireStartPin && onStartResize && (
        <g>
          {(
            [
              { id: "nw", hx: effX, hy: effY, cursor: "cursor-nwse-resize" },
              { id: "n", hx: effX + effW / 2, hy: effY, cursor: "cursor-ns-resize" },
              { id: "ne", hx: effX + effW, hy: effY, cursor: "cursor-nesw-resize" },
              { id: "e", hx: effX + effW, hy: effY + effH / 2, cursor: "cursor-ew-resize" },
              { id: "se", hx: effX + effW, hy: effY + effH, cursor: "cursor-nwse-resize" },
              { id: "s", hx: effX + effW / 2, hy: effY + effH, cursor: "cursor-ns-resize" },
              { id: "sw", hx: effX, hy: effY + effH, cursor: "cursor-nesw-resize" },
              { id: "w", hx: effX, hy: effY + effH / 2, cursor: "cursor-ew-resize" },
            ] as const
          ).map((h) => (
            <g
              key={`cad-rh-${h.id}`}
              className={h.cursor}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onStartResize(e, h.id);
              }}
            >
              <rect
                x={h.hx - 4}
                y={h.hy - 4}
                width={8}
                height={8}
                fill="transparent"
                pointerEvents="all"
              />
              <rect
                x={h.hx - 2.1}
                y={h.hy - 2.1}
                width={4.2}
                height={4.2}
                rx={0.8}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={0.85}
                pointerEvents="none"
              />
            </g>
          ))}
        </g>
      )}

      {/* Locked / Group Badge */}
      {(asset.locked || asset.groupId) && (
        <g className="pointer-events-none">
          {asset.locked && (
            <text
              x={effX + 2}
              y={effY + 8}
              fontSize={6}
              fontFamily="sans-serif"
              fill="#f59e0b"
              fontWeight="bold"
            >
              🔒
            </text>
          )}
          {asset.groupId && (
            <circle
              cx={effX + effW - 4}
              cy={effY + 4}
              r={2.5}
              fill="#8b5cf6"
              stroke="#ffffff"
              strokeWidth={0.5}
            />
          )}
        </g>
      )}

      {/* DXF Vector Segments or 3D Mesh Silhouette (Skipped if clean image component exists) */}
      {dxfParsed && dxfParsed.segments.length > 0 ? (
        <g
          clipPath={hasCrop ? `url(#${clipId})` : undefined}
          stroke="#0369a1"
          strokeWidth={0.75}
          strokeLinecap="round"
        >
          {dxfParsed.segments.map((seg, idx) => (
            <line
              key={idx}
              x1={asset.xMm + seg.x1}
              y1={-(asset.yMm + seg.y1)}
              x2={asset.xMm + seg.x2}
              y2={-(asset.yMm + seg.y2)}
            />
          ))}
        </g>
      ) : asset.imageOverlayUrl || asset.materialType ? null : (
        <g
          clipPath={hasCrop ? `url(#${clipId})` : undefined}
          stroke="#64748b"
          strokeWidth={0.6}
          fill="none"
        >
          <line x1={effX} y1={effY} x2={effX + effW} y2={effY + effH} strokeDasharray="2,2" />
          <line x1={effX + effW} y1={effY} x2={effX} y2={effY + effH} strokeDasharray="2,2" />
          <circle cx={asset.xMm} cy={-asset.yMm} r={Math.min(w, h) * 0.2} />
        </g>
      )}

      {/* Smart Positioned CAD Label (Clean, no [DXF] suffix, with contrast halo) */}
      <g pointerEvents="none">
        <text
          x={smartPos.x}
          y={smartPos.y}
          textAnchor={smartPos.textAnchor}
          dominantBaseline={smartPos.dominantBaseline}
          fontSize={4.6}
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          fontWeight={600}
          fill="#0284c7"
          stroke={isDark ? "#0b0f19" : "#ffffff"}
          strokeWidth={1.2}
          strokeLinejoin="round"
          style={{ paintOrder: "stroke fill" }}
        >
          {cleanLabel}
        </text>
      </g>

      {/* Screw Terminal Pin Markers (Matching Contactor / Standard Component Pins) */}
      <g className="cad-pin-markers">
        {asset.pins.map((pin) => {
          const px = asset.xMm + pin.localXMm;
          const py = -(asset.yMm + pin.localYMm);
          const isStartPin =
            activeWireStartPin?.componentId === asset.id &&
            activeWireStartPin?.pinId === pin.id;
          const isHovered = hoveredPinId === pin.id;
          const isWiringActive = isWireMode || Boolean(activeWireStartPin);
          const screwR = 2.0;

          return (
            <g
              key={pin.id}
              onPointerEnter={() => setHoveredPinId(pin.id)}
              onPointerLeave={() =>
                setHoveredPinId((curr) => (curr === pin.id ? null : curr))
              }
              onPointerDown={(e) => {
                if (e.button === 0 && !isMarkingThis && (isWireMode || canQuickWire)) {
                  e.stopPropagation();
                  onPinClick(e, pin.id);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onPinDoubleClick?.(e, pin, { xMm: px, yMm: asset.yMm + pin.localYMm });
              }}
              onContextMenu={(e) => {
                if (isWiringActive || canQuickWire || isMarkingThis) {
                  e.stopPropagation();
                  e.preventDefault();
                  onPinContextMenu?.(e, pin, { xMm: px, yMm: asset.yMm + pin.localYMm });
                }
              }}
              className="cursor-crosshair"
            >
              {/* Screw Terminal Visual (identical to Contactor / MCB) */}
              <g pointerEvents="none">
                <circle
                  cx={px}
                  cy={py}
                  r={screwR + 0.45}
                  fill="#e2e8f0"
                  stroke="#475569"
                  strokeWidth={0.4}
                />
                <circle
                  cx={px}
                  cy={py}
                  r={screwR * 0.72}
                  fill="#cbd5e1"
                  stroke="#334155"
                  strokeWidth={0.35}
                />
                <line
                  x1={px - screwR * 0.48}
                  y1={py - screwR * 0.48}
                  x2={px + screwR * 0.48}
                  y2={py + screwR * 0.48}
                  stroke="#1e293b"
                  strokeWidth={0.45}
                  strokeLinecap="round"
                />
              </g>

              {/* Expanded transparent hit target for effortless click-to-wire */}
              <circle
                cx={px}
                cy={py}
                r={isWiringActive ? 5.0 : 3.6}
                fill="transparent"
                pointerEvents="all"
              />
              {isWiringActive && !isStartPin && (
                <circle
                  cx={px}
                  cy={py}
                  r={3.2}
                  fill="#0284c7"
                  fillOpacity={0.14}
                  stroke="#0284c7"
                  strokeOpacity={0.55}
                  strokeWidth={0.45}
                  pointerEvents="none"
                />
              )}
              <circle
                cx={px}
                cy={py}
                r={isWiringActive ? 2.2 : isSelected || isHovered || isMarkingThis ? 1.8 : 1.4}
                fill={isStartPin ? "#0284c7" : "#ffffff"}
                stroke={
                  isStartPin
                    ? "#0369a1"
                    : isWiringActive
                      ? "#0284c7"
                      : isMarkingThis
                        ? "#d97706"
                        : "#334155"
                }
                strokeWidth={isWiringActive ? 0.75 : 0.55}
                pointerEvents="none"
              />

              {/* Crisp Pin Label with halo stroke (same style as Contactor / MCB) */}
              <text
                x={px + 3.2}
                y={py + 0.3}
                fontSize={3.6}
                fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace"
                fontWeight={700}
                fill={isWiringActive ? "#0369a1" : isDark ? "#f1f5f9" : "#0f172a"}
                stroke={isDark ? "#0b0f19" : "#ffffff"}
                strokeWidth={1.1}
                strokeLinejoin="round"
                style={{ paintOrder: "stroke fill" }}
                textAnchor="start"
                dominantBaseline="central"
                pointerEvents="none"
              >
                {pin.label}
              </text>
            </g>
          );
        })}
      </g>
    </g>
  );
}

export function Panel2DCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  const theme = usePanelStore((s) => s.theme);
  const activeSheetType = usePanelStore((s) => s.activeSheetType);
  const enclosure = usePanelStore((s) => s.enclosure);
  const plateConfig = usePanelStore((s) => s.plateConfig);
  const displayUnit = usePanelStore((s) => s.displayUnit);
  const rails = usePanelStore((s) => s.rails);
  const ducts = usePanelStore((s) => s.ducts);
  const components = usePanelStore((s) => s.components);
  const cadAssets = usePanelStore((s) => s.cadAssets);
  const wires = usePanelStore((s) => s.wires);
  const titleBlock = usePanelStore((s) => s.titleBlock);
  const gridSnapMm = usePanelStore((s) => s.gridSnapMm);
  const selected = usePanelStore((s) => s.selected);
  const selectedIds = usePanelStore((s) => s.selectedIds);
  const canvasTool2D = usePanelStore((s) => s.canvasTool2D);
  const activeWireColor = usePanelStore((s) => s.activeWireColor);
  const activeWireGauge = usePanelStore((s) => s.activeWireGauge);
  const activeWireStartPin = usePanelStore((s) => s.activeWireStartPin);
  const autoRouteDuctsEnabled = usePanelStore((s) => s.autoRouteDuctsEnabled);
  const showPinLabels = usePanelStore((s) => s.showPinLabels);
  const toggleShowPinLabels = usePanelStore((s) => s.toggleShowPinLabels);
  const autoNumberWires = usePanelStore((s) => s.autoNumberWires);
  const setAutoRouteDuctsEnabled = usePanelStore((s) => s.setAutoRouteDuctsEnabled);
  const isPinMarkingMode = usePanelStore((s) => s.isPinMarkingMode);
  const activeMarkingAssetId = usePanelStore((s) => s.activeMarkingAssetId);

  const setSelected = usePanelStore((s) => s.setSelected);
  const setSelectedIds = usePanelStore((s) => s.setSelectedIds);
  const toggleSelectId = usePanelStore((s) => s.toggleSelectId);
  const clearSelection = usePanelStore((s) => s.clearSelection);
  const moveSelectedItems = usePanelStore((s) => s.moveSelectedItems);
  const nudgeSelectedItems = usePanelStore((s) => s.nudgeSelectedItems);
  const deleteSelectedItems = usePanelStore((s) => s.deleteSelectedItems);
  const copySelectedToClipboard = usePanelStore((s) => s.copySelectedToClipboard);
  const pasteFromClipboard = usePanelStore((s) => s.pasteFromClipboard);
  const groupSelectedItems = usePanelStore((s) => s.groupSelectedItems);
  const ungroupSelectedItems = usePanelStore((s) => s.ungroupSelectedItems);
  const toggleLockSelectedItems = usePanelStore((s) => s.toggleLockSelectedItems);
  const pushUndoSnapshot = usePanelStore((s) => s.pushUndoSnapshot);
  const setCanvasTool2D = usePanelStore((s) => s.setCanvasTool2D);
  const setActiveWireColor = usePanelStore((s) => s.setActiveWireColor);
  const setActiveWireGauge = usePanelStore((s) => s.setActiveWireGauge);
  const setActiveWireStartPin = usePanelStore((s) => s.setActiveWireStartPin);
  const moveComponent = usePanelStore((s) => s.moveComponent);
  const moveCadAsset = usePanelStore((s) => s.moveCadAsset);
  const addPinToAsset = usePanelStore((s) => s.addPinToAsset);
  const updatePinInAsset = usePanelStore((s) => s.updatePinInAsset);
  const removePinFromAsset = usePanelStore((s) => s.removePinFromAsset);
  const updateComponentPin = usePanelStore((s) => s.updateComponentPin);
  const removePinFromComponent = usePanelStore((s) => s.removePinFromComponent);
  const updateRail = usePanelStore((s) => s.updateRail);
  const updateDuct = usePanelStore((s) => s.updateDuct);
  const addWire = usePanelStore((s) => s.addWire);
  const updateWire = usePanelStore((s) => s.updateWire);
  const removeWire = usePanelStore((s) => s.removeWire);
  const autoRouteAllWires = usePanelStore((s) => s.autoRouteAllWires);
  const addComponent = usePanelStore((s) => s.addComponent);
  const addCadAsset = usePanelStore((s) => s.addCadAsset);
  const updateCadAsset = usePanelStore((s) => s.updateCadAsset);
  const addCustomDrawnComponent = usePanelStore((s) => s.addCustomDrawnComponent);
  const drawShapeMode = usePanelStore((s) => s.drawShapeMode);
  const setDrawShapeMode = usePanelStore((s) => s.setDrawShapeMode);
  const setGridSnapMm = usePanelStore((s) => s.setGridSnapMm);
  const undo = usePanelStore((s) => s.undo);
  const redo = usePanelStore((s) => s.redo);
  const canUndo = usePanelStore((s) => s.canUndo);
  const canRedo = usePanelStore((s) => s.canRedo);

  // Camera state: zoom (px per mm), pan (px offset of world origin (0,0) from top-left of container)
  const [zoom, setZoom] = useState(1.1);
  const [pan, setPan] = useState({ x: 480, y: 380 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuideLine[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: import("@/components/ui/ContextMenu").ContextMenuTarget;
  } | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ xMm: number; yMm: number } | null>(
    null
  );
  const [measureStart, setMeasureStart] = useState<{ xMm: number; yMm: number } | null>(
    null
  );
  const [measureEnd, setMeasureEnd] = useState<{ xMm: number; yMm: number } | null>(
    null
  );
  const [measureHover, setMeasureHover] = useState<{ xMm: number; yMm: number } | null>(
    null
  );
  const [viewportSize, setViewportSize] = useState({ width: 960, height: 760 });
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [isLibraryDragOver, setIsLibraryDragOver] = useState(false);
  const [gridPopoverOpen, setGridPopoverOpen] = useState(false);
  const [freeEndSnapTarget, setFreeEndSnapTarget] = useState<{
    componentId: string;
    pinId: string;
    xMm: number;
    yMm: number;
  } | null>(null);
  const gridPopoverRef = useRef<HTMLDivElement>(null);
  const lastWireCanvasClickRef = useRef<{ time: number; xMm: number; yMm: number } | null>(null);

  useEffect(() => {
    if (!gridPopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (gridPopoverRef.current && !gridPopoverRef.current.contains(e.target as Node)) {
        setGridPopoverOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGridPopoverOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [gridPopoverOpen]);
  const [inlinePinEdit, setInlinePinEdit] = useState<{
    targetKind: "component" | "cad";
    targetId: string;
    pinId: string;
    initialLabel: string;
    label: string;
    worldX: number;
    worldY: number;
  } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);

  const { widthMm: plateW, heightMm: plateH } = useMemo(
    () => getBackplateDimensions(enclosure, plateConfig),
    [enclosure, plateConfig]
  );

  const selectionTopCenter = useMemo(() => {
    const targets =
      selectedIds.length > 0
        ? selectedIds
        : selected
          ? [selected]
          : [];
    if (targets.length === 0) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const t of targets) {
      if (t.kind === "wire") {
        const w = wires.find((item) => item.id === t.id);
        if (!w) continue;
        if (w.waypoints && w.waypoints.length >= 2) {
          let bestMid = w.waypoints[0];
          let bestLen = -1;
          for (let i = 0; i < w.waypoints.length - 1; i++) {
            const a = w.waypoints[i];
            const b = w.waypoints[i + 1];
            const len = Math.hypot(b.xMm - a.xMm, b.yMm - a.yMm);
            if (len > bestLen) {
              bestLen = len;
              bestMid = { xMm: (a.xMm + b.xMm) / 2, yMm: (a.yMm + b.yMm) / 2 };
            }
          }
          minX = Math.min(minX, bestMid.xMm);
          maxX = Math.max(maxX, bestMid.xMm);
          minY = Math.min(minY, bestMid.yMm - 6);
          maxY = Math.max(maxY, bestMid.yMm + 6);
        } else {
          const fromComp =
            components.find((c) => c.id === w.fromComponentId) ??
            cadAssets.find((a) => a.id === w.fromComponentId);
          const toPos = w.toFreePoint
            ? w.toFreePoint
            : components.find((c) => c.id === w.toComponentId) ??
              cadAssets.find((a) => a.id === w.toComponentId);
          if (fromComp && toPos) {
            const midX = (fromComp.xMm + toPos.xMm) / 2;
            const midY = (fromComp.yMm + toPos.yMm) / 2;
            minX = Math.min(minX, midX);
            maxX = Math.max(maxX, midX);
            minY = Math.min(minY, midY - 6);
            maxY = Math.max(maxY, midY + 6);
          }
        }
      } else if (t.kind === "component") {
        const c = components.find((item) => item.id === t.id);
        if (!c) continue;
        const dims = getRotatedDimensions(c.widthMm, c.heightMm, c.rotationDeg ?? 0);
        minX = Math.min(minX, c.xMm - dims.widthMm / 2);
        maxX = Math.max(maxX, c.xMm + dims.widthMm / 2);
        minY = Math.min(minY, c.yMm - dims.heightMm / 2);
        maxY = Math.max(maxY, c.yMm + dims.heightMm / 2);
      } else if (t.kind === "cad") {
        const a = cadAssets.find((item) => item.id === t.id);
        if (!a) continue;
        const eff = getEffectiveCadBounds(a);
        const rot = a.rotationDeg ?? 0;
        const dims = getRotatedDimensions(eff.widthMm, eff.heightMm, rot);
        const rotOffset = rotateLocalPoint(eff.offsetX, eff.offsetY, rot);
        const cx = a.xMm + rotOffset.xMm;
        const cy = a.yMm + rotOffset.yMm;
        minX = Math.min(minX, cx - dims.widthMm / 2);
        maxX = Math.max(maxX, cx + dims.widthMm / 2);
        minY = Math.min(minY, cy - dims.heightMm / 2);
        maxY = Math.max(maxY, cy + dims.heightMm / 2);
      } else if (t.kind === "rail") {
        const r = rails.find((item) => item.id === t.id);
        if (!r) continue;
        minX = Math.min(minX, r.xMm - r.lengthMm / 2);
        maxX = Math.max(maxX, r.xMm + r.lengthMm / 2);
        minY = Math.min(minY, r.yMm - DIN_RAIL_HEIGHT_MM / 2);
        maxY = Math.max(maxY, r.yMm + DIN_RAIL_HEIGHT_MM / 2);
      } else if (t.kind === "duct") {
        const d = ducts.find((item) => item.id === t.id);
        if (!d) continue;
        minX = Math.min(minX, d.xMm - d.widthMm / 2);
        maxX = Math.max(maxX, d.xMm + d.widthMm / 2);
        minY = Math.min(minY, d.yMm - d.heightMm / 2);
        maxY = Math.max(maxY, d.yMm + d.heightMm / 2);
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return null;
    const screenX = pan.x + ((minX + maxX) / 2) * zoom;
    const screenTopY = pan.y + -maxY * zoom;
    const screenBottomY = pan.y + -minY * zoom;
    const isNearTop = screenTopY < 76;
    const placement: "top" | "bottom" = isNearTop ? "bottom" : "top";
    const rawY = isNearTop ? screenBottomY + 14 : screenTopY - 28;
    return {
      x: Math.max(120, Math.min(viewportSize.width - 120, screenX)),
      y: Math.max(76, Math.min(viewportSize.height - 70, rawY)),
      placement,
    };
  }, [selected, selectedIds, components, cadAssets, rails, ducts, wires, pan, zoom, viewportSize]);

  const collisionReport = useMemo(
    () => detectCollisionsAndBounds(components, cadAssets, plateW, plateH),
    [components, cadAssets, plateW, plateH]
  );

  // Detect overlaps for DIN rails and Wire Ducts against components, rails, and ducts
  const { collidingRailIds, collidingDuctIds } = useMemo(() => {
    const railIds = new Set<string>();
    const ductIds = new Set<string>();

    const overlapAmt = (aCenter: number, aSize: number, bCenter: number, bSize: number) =>
      (aSize + bSize) / 2 - Math.abs(aCenter - bCenter);

    const plateComps = components
      .filter((c) => c.mountingType !== "door_cutout")
      .map((c) => {
        const dims = getRotatedDimensions(c.widthMm, c.heightMm, c.rotationDeg ?? 0);
        return { ...c, w: dims.widthMm, h: dims.heightMm };
      });

    // 1. Check each DIN Rail against ducts, other rails, and unbound components
    for (let i = 0; i < rails.length; i++) {
      const r = rails[i];
      for (const d of ducts) {
        const ox = overlapAmt(r.xMm, r.lengthMm, d.xMm, d.widthMm);
        const oy = overlapAmt(r.yMm, DIN_RAIL_HEIGHT_MM, d.yMm, d.heightMm);
        const xThreshold = d.orientation === "vertical" ? 22 : 2;
        if (ox > xThreshold && oy > 2) {
          railIds.add(r.id);
          ductIds.add(d.id);
        }
      }
      for (let j = i + 1; j < rails.length; j++) {
        const other = rails[j];
        if (
          overlapAmt(r.xMm, r.lengthMm, other.xMm, other.lengthMm) > 2 &&
          overlapAmt(r.yMm, DIN_RAIL_HEIGHT_MM, other.yMm, DIN_RAIL_HEIGHT_MM) > 2
        ) {
          railIds.add(r.id);
          railIds.add(other.id);
        }
      }
      for (const c of plateComps) {
        const parentOnThisRail =
          c.mountedToComponentId &&
          components.some((p) => p.id === c.mountedToComponentId && p.railId === r.id);
        if (c.railId === r.id || parentOnThisRail) continue;
        if (
          overlapAmt(r.xMm, r.lengthMm, c.xMm, c.w) > 2 &&
          overlapAmt(r.yMm, DIN_RAIL_HEIGHT_MM, c.yMm, c.h) > 2
        ) {
          railIds.add(r.id);
        }
      }
    }

    // 2. Check each Wire Duct against components and same-orientation ducts
    for (let i = 0; i < ducts.length; i++) {
      const d = ducts[i];
      for (const c of plateComps) {
        if (
          overlapAmt(d.xMm, d.widthMm, c.xMm, c.w) > 3 &&
          overlapAmt(d.yMm, d.heightMm, c.yMm, c.h) > 3
        ) {
          ductIds.add(d.id);
        }
      }
      for (let j = i + 1; j < ducts.length; j++) {
        const other = ducts[j];
        if (d.orientation !== other.orientation) continue;
        if (
          overlapAmt(d.xMm, d.widthMm, other.xMm, other.widthMm) > 2 &&
          overlapAmt(d.yMm, d.heightMm, other.yMm, other.heightMm) > 2
        ) {
          ductIds.add(d.id);
          ductIds.add(other.id);
        }
      }
    }

    return { collidingRailIds: railIds, collidingDuctIds: ductIds };
  }, [rails, ducts, components]);

  const cadObstacleBoxes = useMemo(
    () => buildSvgObstacleBoxes(components, cadAssets),
    [components, cadAssets]
  );

  const ductFillMap = useMemo(
    () => calculateAllDuctFillRatios(ducts, wires),
    [ducts, wires]
  );

  // Sheet dimensions around backplate
  const sheetW = Math.max(841, plateW + 220);
  const sheetH = Math.max(594, plateH + 140);

  // Fit sheet on initial mount (reserve top clearance for ruler + floating toolbar)
  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setViewportSize({ width: rect.width, height: rect.height });
    const topPad = 92;
    const bottomPad = 44;
    const sidePad = 72;
    const availW = Math.max(200, rect.width - sidePad * 2);
    const availH = Math.max(200, rect.height - topPad - bottomPad);
    const scaleX = availW / sheetW;
    const scaleY = availH / sheetH;
    const nextZoom = Math.max(0.25, Math.min(3, Math.min(scaleX, scaleY)));
    setZoom(nextZoom);
    setPan({
      x: rect.width / 2 + 12,
      y: topPad + availH / 2,
    });
  }, [sheetW, sheetH]);

  useEffect(() => {
    fitToView();
    const onResize = () => {
      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitToView]);

  // Spacebar pan & Delete/Backspace bulk delete, Arrow nudge, Copy/Paste & Group shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (e.code === "Space" && !isEditingText) {
        setSpacePressed(true);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isEditingText) {
        if (selectedIds.length > 0 || selected) {
          e.preventDefault();
          deleteSelectedItems();
        }
      }
      if (e.code === "Escape") {
        if (inlinePinEdit) {
          setInlinePinEdit(null);
          return;
        }
        setActiveWireStartPin(null);
        setMeasureStart(null);
        setMeasureEnd(null);
        setMeasureHover(null);
        clearSelection();
      }

      if (isEditingText) return;

      const mod = e.ctrlKey || e.metaKey;

      // Copy: Ctrl+C / Cmd+C
      if (mod && !e.shiftKey && e.key.toLowerCase() === "c") {
        if (selectedIds.length > 0 || selected) {
          e.preventDefault();
          copySelectedToClipboard();
        }
        return;
      }

      // Paste: Ctrl+V / Cmd+V
      if (mod && !e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteFromClipboard();
        return;
      }

      // Group: Ctrl+G (not Shift)
      if (mod && !e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        groupSelectedItems();
        return;
      }

      // Ungroup: Ctrl+Shift+G
      if (mod && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        ungroupSelectedItems();
        return;
      }

      // Lock / Unlock: Ctrl+L / Cmd+L
      if (mod && !e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        toggleLockSelectedItems();
        return;
      }

      // Arrow Keyboard Nudge (1mm, Shift=5mm)
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        if (selectedIds.length > 0 || selected) {
          e.preventDefault();
          const step = e.shiftKey ? 5 : 1;
          let dx = 0;
          let dy = 0;
          if (e.key === "ArrowLeft") dx = -step;
          if (e.key === "ArrowRight") dx = step;
          if (e.key === "ArrowUp") dy = step;
          if (e.key === "ArrowDown") dy = -step;
          nudgeSelectedItems(dx, dy);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpacePressed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    inlinePinEdit,
    setActiveWireStartPin,
    clearSelection,
    deleteSelectedItems,
    selectedIds,
    selected,
    copySelectedToClipboard,
    pasteFromClipboard,
    groupSelectedItems,
    ungroupSelectedItems,
    toggleLockSelectedItems,
    nudgeSelectedItems,
  ]);

  const isItemSelected = useCallback(
    (kind: SelectedTarget["kind"], id: string) =>
      selectedIds.some((s) => s.kind === kind && s.id === id) ||
      (selected?.kind === kind && selected.id === id),
    [selectedIds, selected]
  );

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return { xMm: 0, yMm: 0 };
      const rect = el.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        xMm: (sx - pan.x) / zoom,
        yMm: -(sy - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextZoom = Math.max(0.2, Math.min(8, zoom * factor));
    const scaleRatio = nextZoom / zoom;

    setPan({
      x: sx - (sx - pan.x) * scaleRatio,
      y: sy - (sy - pan.y) * scaleRatio,
    });
    setZoom(nextZoom);
  };

  const handleContainerPointerDownCapture = (e: React.PointerEvent) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const rect = containerRef.current?.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0);
      const midY = (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0);
      pinchRef.current = {
        dist,
        midX,
        midY,
        zoom,
        panX: pan.x,
        panY: pan.y,
      };
      setDragState(null);
      return;
    }

    // Intercept Drawing tool at container capture level so child SVGs never steal pointer
    if (e.button === 0 && canvasTool2D === "draw") {
      const raw = screenToWorld(e.clientX, e.clientY);
      const snappedX = snapToGrid(raw.xMm, gridSnapMm);
      const snappedY = snapToGrid(raw.yMm, gridSnapMm);
      setDragState({
        type: "draw",
        startWorldXMm: snappedX,
        startWorldYMm: snappedY,
        currentWorldXMm: snappedX,
        currentWorldYMm: snappedY,
      });
      // Capture pointer so moving outside container still updates smoothly
      try {
        (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (activePointersRef.current.size >= 2) return;
    if (e.button === 1 || spacePressed || canvasTool2D === "pan") {
      e.preventDefault();
      setDragState({
        type: "pan",
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      });
      return;
    }
    if (e.button === 0 && canvasTool2D === "measure") {
      e.stopPropagation();
      const raw = screenToWorld(e.clientX, e.clientY);
      // Measure tool snaps to 1mm precision (or free unconstrained float if Alt/Shift)
      const pt = {
        xMm: Math.round(raw.xMm * 10) / 10,
        yMm: Math.round(raw.yMm * 10) / 10,
      };
      if (!measureStart || (measureStart && measureEnd)) {
        setMeasureStart(pt);
        setMeasureEnd(null);
        setMeasureHover(pt);
      } else {
        setMeasureEnd(pt);
        setMeasureHover(null);
      }
      return;
    }
    if (e.button === 0 && canvasTool2D === "draw") {
      e.stopPropagation();
      const raw = screenToWorld(e.clientX, e.clientY);
      const snappedX = snapToGrid(raw.xMm, gridSnapMm);
      const snappedY = snapToGrid(raw.yMm, gridSnapMm);
      setDragState({
        type: "draw",
        startWorldXMm: snappedX,
        startWorldYMm: snappedY,
        currentWorldXMm: snappedX,
        currentWorldYMm: snappedY,
      });
      return;
    }
    if (e.button === 0) {
      const raw = screenToWorld(e.clientX, e.clientY);
      if (activeWireStartPin) {
        // Only snap to a pin when clicked directly on/very close to it (3.8mm)
        const nearest = findNearestPin(raw.xMm, raw.yMm, 3.8, activeWireStartPin);
        if (nearest) {
          e.stopPropagation();
          lastWireCanvasClickRef.current = null;
          handlePinClick(nearest.componentId, nearest.pinId);
          return;
        }
        e.stopPropagation();
        handleWiringNonPinClick(raw.xMm, raw.yMm, e.detail);
        return;
      }
      setDragState({
        type: "marquee",
        startWorldXMm: raw.xMm,
        startWorldYMm: raw.yMm,
        currentWorldXMm: raw.xMm,
        currentWorldYMm: raw.yMm,
        additive: e.shiftKey,
      });
      if (!e.shiftKey) {
        clearSelection();
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (activePointersRef.current.size === 2 && pinchRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const rect = containerRef.current?.getBoundingClientRect();
      const newMidX = (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0);
      const newMidY = (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0);
      const start = pinchRef.current;
      if (start.dist > 0) {
        const nextZoom = Math.max(0.2, Math.min(8, start.zoom * (newDist / start.dist)));
        const scaleRatio = nextZoom / start.zoom;
        setZoom(nextZoom);
        setPan({
          x: newMidX - (start.midX - start.panX) * scaleRatio,
          y: newMidY - (start.midY - start.panY) * scaleRatio,
        });
      }
      return;
    }

    const world = screenToWorld(e.clientX, e.clientY);
    setCursorWorld(world);
    if (canvasTool2D === "measure" && measureStart && !measureEnd) {
      setMeasureHover({
        xMm: Math.round(world.xMm * 10) / 10,
        yMm: Math.round(world.yMm * 10) / 10,
      });
    }

    if (!dragState) return;

    if (dragState.type === "pan") {
      setPan({
        x: dragState.startPanX + (e.clientX - dragState.startClientX),
        y: dragState.startPanY + (e.clientY - dragState.startClientY),
      });
      return;
    }

    if (dragState.type === "draw") {
      setDragState({
        ...dragState,
        currentWorldXMm: snapToGrid(world.xMm, gridSnapMm),
        currentWorldYMm: snapToGrid(world.yMm, gridSnapMm),
      });
      return;
    }

    if (dragState.type === "marquee") {
      setDragState({
        ...dragState,
        currentWorldXMm: world.xMm,
        currentWorldYMm: world.yMm,
      });
      return;
    }

    if (dragState.type === "multi-drag") {
      const rawDx = world.xMm - dragState.startWorldXMm;
      const rawDy = world.yMm - dragState.startWorldYMm;
      const targetDx = snapToGrid(rawDx, gridSnapMm);
      const targetDy = snapToGrid(rawDy, gridSnapMm);
      const deltaDx = targetDx - dragState.lastDxMm;
      const deltaDy = targetDy - dragState.lastDyMm;
      if (deltaDx !== 0 || deltaDy !== 0) {
        moveSelectedItems(deltaDx, deltaDy);
        setDragState({
          ...dragState,
          lastDxMm: targetDx,
          lastDyMm: targetDy,
        });
      }
      return;
    }

    if (dragState.type === "component") {
      const comp = components.find((c) => c.id === dragState.id);
      if (!comp) return;

      const rawTargetX = world.xMm - dragState.offsetXMm;
      const rawTargetY = world.yMm - dragState.offsetYMm;
      const dims = getRotatedDimensions(comp.widthMm, comp.heightMm, comp.rotationDeg ?? 0);

      const excludeIds = new Set<string>([comp.id]);
      if (comp.groupId) {
        for (const c of components) {
          if (c.groupId === comp.groupId) excludeIds.add(c.id);
        }
        for (const a of cadAssets) {
          if (a.groupId === comp.groupId) excludeIds.add(a.id);
        }
      }

      const targets = buildAlignmentTargetBoxes(
        components,
        cadAssets,
        rails,
        ducts,
        excludeIds
      );

      const alignResult = computeAlignmentGuides(
        {
          xMm: rawTargetX,
          yMm: rawTargetY,
          widthMm: dims.widthMm,
          heightMm: dims.heightMm,
        },
        targets
      );

      setAlignmentGuides(alignResult.guides);

      moveComponent(
        dragState.id,
        alignResult.xMm,
        alignResult.yMm,
        {
          skipGridSnapX: alignResult.snappedX,
          skipGridSnapY: alignResult.snappedY,
        }
      );
      return;
    }

    if (dragState.type === "cad") {
      const asset = cadAssets.find((a) => a.id === dragState.id);
      if (!asset) return;

      const rawTargetX = world.xMm - dragState.offsetXMm;
      const rawTargetY = world.yMm - dragState.offsetYMm;
      const eff = getEffectiveCadBounds(asset);
      const rot = asset.rotationDeg ?? 0;
      const dims = getRotatedDimensions(eff.widthMm, eff.heightMm, rot);
      const rotOff = rotateLocalPoint(eff.offsetX, eff.offsetY, rot);

      const excludeIds = new Set<string>([asset.id]);
      if (asset.groupId) {
        for (const c of components) {
          if (c.groupId === asset.groupId) excludeIds.add(c.id);
        }
        for (const a of cadAssets) {
          if (a.groupId === asset.groupId) excludeIds.add(a.id);
        }
      }

      const targets = buildAlignmentTargetBoxes(
        components,
        cadAssets,
        rails,
        ducts,
        excludeIds
      );

      const alignResult = computeAlignmentGuides(
        {
          xMm: rawTargetX + rotOff.xMm,
          yMm: rawTargetY + rotOff.yMm,
          widthMm: dims.widthMm,
          heightMm: dims.heightMm,
        },
        targets
      );

      setAlignmentGuides(alignResult.guides);

      moveCadAsset(
        dragState.id,
        alignResult.xMm - rotOff.xMm,
        alignResult.yMm - rotOff.yMm,
        {
          skipGridSnapX: alignResult.snappedX,
          skipGridSnapY: alignResult.snappedY,
        }
      );
      return;
    }

    if (dragState.type === "rail-move") {
      updateRail(
        dragState.id,
        {
          xMm: snapToGrid(world.xMm - dragState.offsetXMm, gridSnapMm),
          yMm: snapToGrid(world.yMm - dragState.offsetYMm, gridSnapMm),
        },
        { skipHistory: true }
      );
      return;
    }

    if (dragState.type === "rail-resize") {
      const dx = snapToGrid(world.xMm - dragState.startWorldXMm, gridSnapMm);
      const nextLen = Math.max(
        60,
        dragState.edge === "right"
          ? dragState.initialLengthMm + dx
          : dragState.initialLengthMm - dx
      );
      const nextX =
        dragState.edge === "right"
          ? dragState.initialXMm + (nextLen - dragState.initialLengthMm) / 2
          : dragState.initialXMm - (nextLen - dragState.initialLengthMm) / 2;
      updateRail(
        dragState.id,
        {
          lengthMm: nextLen,
          xMm: nextX,
        },
        { skipHistory: true }
      );
      return;
    }

    if (dragState.type === "duct-move") {
      updateDuct(
        dragState.id,
        {
          xMm: snapToGrid(world.xMm - dragState.offsetXMm, gridSnapMm),
          yMm: snapToGrid(world.yMm - dragState.offsetYMm, gridSnapMm),
        },
        { skipHistory: true }
      );
      return;
    }

    if (dragState.type === "duct-resize") {
      const d = dragState.initialDuct;
      const dx = snapToGrid(world.xMm - dragState.startWorldXMm, gridSnapMm);
      const dy = snapToGrid(world.yMm - dragState.startWorldYMm, gridSnapMm);
      if (dragState.edge === "right" || dragState.edge === "left") {
        const nextW = Math.max(
          20,
          dragState.edge === "right" ? d.widthMm + dx : d.widthMm - dx
        );
        const nextX =
          dragState.edge === "right"
            ? d.xMm + (nextW - d.widthMm) / 2
            : d.xMm - (nextW - d.widthMm) / 2;
        updateDuct(d.id, { widthMm: nextW, xMm: nextX }, { skipHistory: true });
      } else {
        const nextH = Math.max(
          20,
          dragState.edge === "top" ? d.heightMm + dy : d.heightMm - dy
        );
        const nextY =
          dragState.edge === "top"
            ? d.yMm + (nextH - d.heightMm) / 2
            : d.yMm - (nextH - d.heightMm) / 2;
        updateDuct(d.id, { heightMm: nextH, yMm: nextY }, { skipHistory: true });
      }
      return;
    }

    if (dragState.type === "wire-waypoint") {
      // Multi-bend orthogonal corner drag: never freezes near pins, propagates 90° to interior neighbors,
      // and inserts a clean 90° elbow if dragged off a pin's axis.
      const targetX = e.shiftKey
        ? Math.round(world.xMm)
        : snapToGrid(world.xMm, gridSnapMm);
      const targetY = e.shiftKey
        ? Math.round(world.yMm)
        : snapToGrid(world.yMm, gridSnapMm);

      const pts = dragState.waypoints.map((p) => ({ ...p }));
      const idx = dragState.index;
      if (idx > 0 && idx < pts.length - 1) {
        const oldCorner = pts[idx];
        const prev = pts[idx - 1];
        const next = pts[idx + 1];
        const prevIsPin = idx - 1 === 0;
        const nextIsPin = idx + 1 === pts.length - 1;

        pts[idx] = { xMm: targetX, yMm: targetY };

        if (!prevIsPin) {
          if (Math.abs(prev.xMm - oldCorner.xMm) < 1) prev.xMm = targetX;
          else if (Math.abs(prev.yMm - oldCorner.yMm) < 1) prev.yMm = targetY;
        }
        if (!nextIsPin) {
          if (Math.abs(next.xMm - oldCorner.xMm) < 1) next.xMm = targetX;
          else if (Math.abs(next.yMm - oldCorner.yMm) < 1) next.yMm = targetY;
        }

        // If dragged away from a fixed pin's axis, keep a clean 90° elbow between pin and dragged corner
        const resultPts: Array<{ xMm: number; yMm: number }> = [];
        for (let k = 0; k < pts.length; k++) {
          resultPts.push(pts[k]);
          if (k < pts.length - 1) {
            const a = pts[k];
            const b = pts[k + 1];
            if (Math.abs(a.xMm - b.xMm) > 0.5 && Math.abs(a.yMm - b.yMm) > 0.5) {
              // Keep vertical exit/entry at pins (k===0 or k+1===pts.length-1)
              if (k === 0) {
                resultPts.push({ xMm: a.xMm, yMm: b.yMm });
              } else {
                resultPts.push({ xMm: b.xMm, yMm: a.yMm });
              }
            }
          }
        }

        updateWire(
          dragState.wireId,
          { waypoints: resultPts },
          { skipHistory: true }
        );
        return;
      }

      updateWire(
        dragState.wireId,
        { waypoints: pts },
        { skipHistory: true }
      );
      return;
    }

    if (dragState.type === "wire-segment") {
      // Slide an orthogonal wire segment smoothly perpendicular to its axis
      const pts = dragState.waypoints.map((p) => ({ ...p }));
      const i = dragState.segIndex;
      if (i > 0 && i + 1 < pts.length - 1) {
        if (dragState.orientation === "horizontal") {
          const nextY = e.shiftKey
            ? Math.round(world.yMm)
            : snapToGrid(world.yMm, gridSnapMm);
          pts[i].yMm = nextY;
          pts[i + 1].yMm = nextY;
        } else {
          const nextX = e.shiftKey
            ? Math.round(world.xMm)
            : snapToGrid(world.xMm, gridSnapMm);
          pts[i].xMm = nextX;
          pts[i + 1].xMm = nextX;
        }
        updateWire(
          dragState.wireId,
          { waypoints: pts },
          { skipHistory: true }
        );
      }
      return;
    }

    if (dragState.type === "cad-resize") {
      const dxWorld = world.xMm - dragState.startWorldXMm;
      const dyWorld = world.yMm - dragState.startWorldYMm;
      // Rotate world delta into shape's local coordinate space
      const invRot = (((360 - dragState.rotationDeg) % 360) as RotationDeg);
      const localDelta = rotateLocalPoint(dxWorld, dyWorld, invRot);
      const snapVal = (v: number) =>
        e.altKey ? Math.round(v) : snapToGrid(v, gridSnapMm);
      const dLocalX = snapVal(localDelta.xMm);
      const dLocalY = snapVal(localDelta.yMm);

      const minSize = 10;
      const h = dragState.handle;
      let left = -dragState.initialW / 2;
      let right = dragState.initialW / 2;
      let top = dragState.initialH / 2;
      let bottom = -dragState.initialH / 2;

      if (h.includes("e")) right = Math.max(left + minSize, right + dLocalX);
      if (h.includes("w")) left = Math.min(right - minSize, left + dLocalX);
      if (h.includes("n")) top = Math.max(bottom + minSize, top + dLocalY);
      if (h.includes("s")) bottom = Math.min(top - minSize, bottom + dLocalY);

      let nextW = Math.max(minSize, Math.round((right - left) * 10) / 10);
      let nextH = Math.max(minSize, Math.round((top - bottom) * 10) / 10);

      // Hold Shift on corner handles to preserve aspect ratio
      if (e.shiftKey && h.length === 2 && dragState.initialW > 0 && dragState.initialH > 0) {
        const aspect = dragState.initialW / dragState.initialH;
        if (Math.abs(nextW - dragState.initialW) >= Math.abs(nextH - dragState.initialH)) {
          nextH = Math.max(minSize, Math.round((nextW / aspect) * 10) / 10);
          if (h.includes("n")) top = bottom + nextH;
          else bottom = top - nextH;
        } else {
          nextW = Math.max(minSize, Math.round(nextH * aspect * 10) / 10);
          if (h.includes("e")) right = left + nextW;
          else left = right - nextW;
        }
      }

      const localShiftX = (left + right) / 2;
      const localShiftY = (top + bottom) / 2;
      const worldShift = rotateLocalPoint(
        localShiftX,
        localShiftY,
        dragState.rotationDeg as RotationDeg
      );

      updateCadAsset(
        dragState.id,
        {
          xMm: Math.round((dragState.initialXMm + worldShift.xMm) * 10) / 10,
          yMm: Math.round((dragState.initialYMm + worldShift.yMm) * 10) / 10,
          boundingBoxMm: {
            w: nextW,
            h: nextH,
            d: dragState.initialD,
          },
        },
        { skipHistory: true }
      );
      return;
    }

    if (dragState.type === "wire-free-end") {
      const targetWire = wires.find((item) => item.id === dragState.wireId);
      const excludeFrom = targetWire
        ? { componentId: targetWire.fromComponentId, pinId: targetWire.fromPinId }
        : null;
      const nearest = findNearestPin(world.xMm, world.yMm, 10, excludeFrom);
      setFreeEndSnapTarget(nearest);
      const nextX = nearest
        ? nearest.xMm
        : e.shiftKey
          ? Math.round(world.xMm)
          : snapToGrid(world.xMm, gridSnapMm);
      const nextY = nearest
        ? nearest.yMm
        : e.shiftKey
          ? Math.round(world.yMm)
          : snapToGrid(world.yMm, gridSnapMm);
      updateWire(
        dragState.wireId,
        { toFreePoint: { xMm: nextX, yMm: nextY }, waypoints: undefined },
        { skipHistory: true }
      );
      return;
    }
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    if (dragState?.type === "wire-free-end" && freeEndSnapTarget) {
      updateWire(
        dragState.wireId,
        {
          toComponentId: freeEndSnapTarget.componentId,
          toPinId: freeEndSnapTarget.pinId,
          toFreePoint: undefined,
          toFreeLabel: undefined,
          waypoints: undefined,
        },
        { skipHistory: true }
      );
      setFreeEndSnapTarget(null);
    } else if (freeEndSnapTarget) {
      setFreeEndSnapTarget(null);
    }
    if (e) {
      activePointersRef.current.delete(e.pointerId);
    } else {
      activePointersRef.current.clear();
    }
    if (activePointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    if (dragState?.type === "draw") {
      const minX = Math.min(dragState.startWorldXMm, dragState.currentWorldXMm);
      const maxX = Math.max(dragState.startWorldXMm, dragState.currentWorldXMm);
      const minY = Math.min(dragState.startWorldYMm, dragState.currentWorldYMm);
      const maxY = Math.max(dragState.startWorldYMm, dragState.currentWorldYMm);
      const rawW = Math.round(maxX - minX);
      const rawH = Math.round(maxY - minY);

      // Only create if user dragged at least 4mm to prevent accidental tiny clicks
      if (rawW >= 4 || rawH >= 4) {
        const w = Math.max(10, rawW);
        const h = Math.max(10, rawH);
        const centerX = Math.round(minX + w / 2);
        const centerY = Math.round(minY + h / 2);

        addCustomDrawnComponent({
          name: "Shape",
          xMm: centerX,
          yMm: centerY,
          widthMm: w,
          heightMm: h,
          depthMm: 5,
          materialType: "copper",
          drawShape: drawShapeMode,
        });
      }
      setDragState(null);
      return;
    }

    if (dragState?.type === "marquee") {
      const minX = Math.min(dragState.startWorldXMm, dragState.currentWorldXMm);
      const maxX = Math.max(dragState.startWorldXMm, dragState.currentWorldXMm);
      const minY = Math.min(dragState.startWorldYMm, dragState.currentWorldYMm);
      const maxY = Math.max(dragState.startWorldYMm, dragState.currentWorldYMm);

      if (maxX - minX > 1 || maxY - minY > 1) {
        const hits: SelectedTarget[] = [];

        for (const c of components) {
          const dims = getRotatedDimensions(c.widthMm, c.heightMm, c.rotationDeg ?? 0);
          const cx1 = c.xMm - dims.widthMm / 2;
          const cx2 = c.xMm + dims.widthMm / 2;
          const cy1 = c.yMm - dims.heightMm / 2;
          const cy2 = c.yMm + dims.heightMm / 2;
          if (cx1 <= maxX && cx2 >= minX && cy1 <= maxY && cy2 >= minY) {
            hits.push({ kind: "component", id: c.id });
          }
        }

        for (const a of cadAssets) {
          const eff = getEffectiveCadBounds(a);
          const rot = a.rotationDeg ?? 0;
          const dims = getRotatedDimensions(eff.widthMm, eff.heightMm, rot);
          const rotOffset = rotateLocalPoint(eff.offsetX, eff.offsetY, rot);
          const effCenterXMm = a.xMm + rotOffset.xMm;
          const effCenterYMm = a.yMm + rotOffset.yMm;
          const ax1 = effCenterXMm - dims.widthMm / 2;
          const ax2 = effCenterXMm + dims.widthMm / 2;
          const ay1 = effCenterYMm - dims.heightMm / 2;
          const ay2 = effCenterYMm + dims.heightMm / 2;
          if (ax1 <= maxX && ax2 >= minX && ay1 <= maxY && ay2 >= minY) {
            hits.push({ kind: "cad", id: a.id });
          }
        }

        if (dragState.additive) {
          const merged = [...selectedIds];
          for (const hit of hits) {
            if (!merged.some((s) => s.kind === hit.kind && s.id === hit.id)) {
              merged.push(hit);
            }
          }
          setSelectedIds(merged);
        } else {
          setSelectedIds(hits);
        }
      }
    }
    setAlignmentGuides([]);
    setDragState(null);
  };

  const findNearestPin = (
    worldXMm: number,
    worldYMm: number,
    maxDistMm = 10,
    excludePin?: { componentId: string; pinId: string } | null
  ): { componentId: string; pinId: string; xMm: number; yMm: number } | null => {
    let best: { componentId: string; pinId: string; xMm: number; yMm: number } | null = null;
    let bestDist = maxDistMm;

    for (const c of components) {
      const rot = c.rotationDeg ?? 0;
      for (const p of c.pins) {
        if (excludePin && excludePin.componentId === c.id && excludePin.pinId === p.id) {
          continue;
        }
        const rp = rotateLocalPoint(p.localXMm, p.localYMm, rot);
        const px = c.xMm + rp.xMm;
        const py = c.yMm + rp.yMm;
        const d = Math.hypot(px - worldXMm, py - worldYMm);
        if (d <= bestDist) {
          bestDist = d;
          best = { componentId: c.id, pinId: p.id, xMm: px, yMm: py };
        }
      }
    }

    for (const a of cadAssets) {
      const rot = a.rotationDeg ?? 0;
      for (const p of a.pins) {
        if (excludePin && excludePin.componentId === a.id && excludePin.pinId === p.id) {
          continue;
        }
        const rp = rotateLocalPoint(p.localXMm, p.localYMm, rot);
        const px = a.xMm + rp.xMm;
        const py = a.yMm + rp.yMm;
        const d = Math.hypot(px - worldXMm, py - worldYMm);
        if (d <= bestDist) {
          bestDist = d;
          best = { componentId: a.id, pinId: p.id, xMm: px, yMm: py };
        }
      }
    }

    return best;
  };

  const handleWiringNonPinClick = (rawXMm: number, rawYMm: number, detail: number) => {
    if (!activeWireStartPin) return;
    const now = Date.now();
    const prev = lastWireCanvasClickRef.current;
    const isDouble =
      detail >= 2 ||
      (prev !== null &&
        now - prev.time < 380 &&
        Math.hypot(rawXMm - prev.xMm, rawYMm - prev.yMm) < 14);

    if (isDouble) {
      lastWireCanvasClickRef.current = null;
      const endX = snapToGrid(rawXMm, gridSnapMm);
      const endY = snapToGrid(rawYMm, gridSnapMm);
      const wireNum = wires.length + 1;
      const prefix = activeWireColor === "PE" ? "PE" : activeWireColor === "N" ? "N" : "W";
      addWire({
        label: `${prefix}${String(wireNum).padStart(2, "0")}`,
        colorCode: activeWireColor,
        gaugeMm2: activeWireGauge,
        fromComponentId: activeWireStartPin.componentId,
        fromPinId: activeWireStartPin.pinId,
        toComponentId: "__free__",
        toPinId: "__free__",
        toFreePoint: { xMm: endX, yMm: endY },
        toFreeLabel: "",
      });
      setActiveWireStartPin(null);
      return;
    }

    lastWireCanvasClickRef.current = { time: now, xMm: rawXMm, yMm: rawYMm };
  };

  const handlePinClick = (componentId: string, pinId: string) => {
    if (!activeWireStartPin) {
      setActiveWireStartPin({ componentId, pinId });
      return;
    }
    if (
      activeWireStartPin.componentId === componentId &&
      activeWireStartPin.pinId === pinId
    ) {
      setActiveWireStartPin(null);
      return;
    }

    const wireNum = wires.length + 1;
    const prefix = activeWireColor === "PE" ? "PE" : activeWireColor === "N" ? "N" : "W";
    addWire({
      label: `${prefix}${String(wireNum).padStart(2, "0")}`,
      colorCode: activeWireColor,
      gaugeMm2: activeWireGauge,
      fromComponentId: activeWireStartPin.componentId,
      fromPinId: activeWireStartPin.pinId,
      toComponentId: componentId,
      toPinId: pinId,
    });
    setActiveWireStartPin(null);
  };

  // Pin lookup map for wire rendering (SVG coordinates: xMm, -yMm)
  const pinMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const c of components) {
      const rot = c.rotationDeg ?? 0;
      for (const p of c.pins) {
        const rotated = rotateLocalPoint(p.localXMm, p.localYMm, rot);
        map.set(`${c.id}:${p.id}`, {
          x: c.xMm + rotated.xMm,
          y: -(c.yMm + rotated.yMm),
        });
      }
    }
    for (const a of cadAssets) {
      const rot = a.rotationDeg ?? 0;
      for (const p of a.pins) {
        const rotated = rotateLocalPoint(p.localXMm, p.localYMm, rot);
        map.set(`${a.id}:${p.id}`, {
          x: a.xMm + rotated.xMm,
          y: -(a.yMm + rotated.yMm),
        });
      }
    }
    return map;
  }, [components, cadAssets]);

  // Plate-relative ruler ticks computation (origin 0,0 at top-left of mounting plate)
  const rulerSteps = getRulerStepsMm(zoom);
  const worldXMin = -pan.x / zoom;
  const worldXMax = (viewportSize.width - pan.x) / zoom;
  const worldYMax = pan.y / zoom;
  const worldYMin = (pan.y - viewportSize.height) / zoom;

  const plateXMin = worldToPlateX(worldXMin, plateW);
  const plateXMax = worldToPlateX(worldXMax, plateW);
  const plateYMin = worldToPlateY(worldYMax, plateH);
  const plateYMax = worldToPlateY(worldYMin, plateH);

  const xSubTicks = computePlateRulerSubTicks(plateXMin, plateXMax, rulerSteps);
  const ySubTicks = computePlateRulerSubTicks(plateYMin, plateYMax, rulerSteps);

  const plateLeftRulerPx = pan.x + plateToWorldX(0, plateW) * zoom;
  const plateRightRulerPx = pan.x + plateToWorldX(plateW, plateW) * zoom;
  const plateTopRulerPx = pan.y - plateToWorldY(0, plateH) * zoom;
  const plateBottomRulerPx = pan.y - plateToWorldY(plateH, plateH) * zoom;

  const selectionFootprint = useMemo(
    () =>
      computeSelectionFootprint({
        selected,
        selectedIds,
        components,
        cadAssets,
        rails,
        ducts,
        plateWidthMm: plateW,
        plateHeightMm: plateH,
      }),
    [selected, selectedIds, components, cadAssets, rails, ducts, plateW, plateH]
  );

  const cursorPlate = cursorWorld
    ? {
        xMm: worldToPlateX(cursorWorld.xMm, plateW),
        yMm: worldToPlateY(cursorWorld.yMm, plateH),
        topRulerLeftPx: pan.x + cursorWorld.xMm * zoom,
        leftRulerTopPx: pan.y - cursorWorld.yMm * zoom,
      }
    : null;

  // Title block geometry (bottom-right of sheet)
  const tbW = 264;
  const tbH = 44;
  const tbX = sheetW / 2 - 12 - tbW;
  const tbY = sheetH / 2 - 12 - tbH;

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-white dark:bg-[#090b10] select-none touch-none transition-shadow ${
        isLibraryDragOver ? "ring-2 ring-inset ring-sky-500/50" : ""
      }`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(PANELFLOW_PART_DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!isLibraryDragOver) setIsLibraryDragOver(true);
        setCursorWorld(screenToWorld(e.clientX, e.clientY));
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsLibraryDragOver(false);
        }
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(PANELFLOW_PART_DRAG_MIME);
        setIsLibraryDragOver(false);
        if (!raw) return;
        e.preventDefault();
        try {
          const payload = JSON.parse(raw) as PartDragPayload;
          const world = screenToWorld(e.clientX, e.clientY);
          if (payload.kind === "component" && payload.templateId) {
            addComponent(payload.templateId, undefined, world);
          } else if (payload.kind === "cad_library") {
            const item = consumeDraggedCadLibraryItem();
            if (item && item.id === payload.libraryId) {
              addCadAsset(
                buildCadAssetFromLibraryItem(item, {
                  xMm: snapToGrid(world.xMm, gridSnapMm),
                  yMm: snapToGrid(world.yMm, gridSnapMm),
                })
              );
            }
          }
        } catch {
          // Ignore malformed drag payload
        }
      }}
      onWheel={handleWheel}
      onPointerDownCapture={handleContainerPointerDownCapture}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => {
        setCursorWorld(null);
        handlePointerUp();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (activeWireStartPin) {
          setActiveWireStartPin(null);
          lastWireCanvasClickRef.current = null;
          return;
        }
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          target: { kind: "canvas", worldPos },
        });
      }}
    >
      {/* Top Engineering Ruler (Plate Top-Left Origin: 0 -> plateW) */}
      <div className="pointer-events-none absolute top-0 right-0 left-0 z-20 h-6 overflow-hidden border-b border-[#e2e8f0] dark:border-white/10 bg-white/95 dark:bg-[#0c0e14]/90 font-sans text-[9px] text-[#64748b] dark:text-slate-400 backdrop-blur-md">
        {/* Dimmed out-of-plate zones */}
        {plateLeftRulerPx > 0 && (
          <div
            style={{ left: 0, width: plateLeftRulerPx }}
            className="absolute top-0 bottom-0 bg-slate-200/45 dark:bg-black/45"
          />
        )}
        <div
          style={{ left: Math.max(0, plateRightRulerPx), right: 0 }}
          className="absolute top-0 bottom-0 bg-slate-200/45 dark:bg-black/45"
        />

        {/* Selection Footprint Highlight (X1..X2) */}
        {selectionFootprint && (() => {
          const fpLeft = pan.x + plateToWorldX(selectionFootprint.x1Mm, plateW) * zoom;
          const fpRight = pan.x + plateToWorldX(selectionFootprint.x2Mm, plateW) * zoom;
          const fpWidth = Math.max(2, fpRight - fpLeft);
          return (
            <div
              style={{ left: fpLeft, width: fpWidth }}
              className="absolute top-0 bottom-0 border-x border-sky-500/80 bg-sky-500/20 dark:border-sky-400/80 dark:bg-sky-400/20"
            />
          );
        })()}

        {/* Ruler Sub-Ticks (Major 10px + label, Medium 6px, Minor 3px) */}
        {xSubTicks.map((tick) => {
          const left = pan.x + plateToWorldX(tick.mm, plateW) * zoom;
          if (left < 0) return null;
          const isOutsidePlate = tick.mm < 0 || tick.mm > plateW;
          const isOrigin = tick.mm === 0;
          if (tick.kind === "major") {
            return (
              <div
                key={tick.mm}
                style={{ transform: `translateX(${left}px)` }}
                className="absolute top-0 bottom-0"
              >
                <div
                  className={`absolute bottom-0 left-0 h-[10px] w-px ${
                    isOrigin
                      ? "bg-sky-500/90 dark:bg-sky-400"
                      : isOutsidePlate
                        ? "bg-[#cbd5e1]/60 dark:bg-white/10"
                        : "bg-[#64748b] dark:bg-slate-400"
                  }`}
                />
                <span
                  className={`absolute top-0.5 left-1 leading-none ${
                    isOrigin
                      ? "font-bold text-sky-600 dark:text-sky-400"
                      : isOutsidePlate
                        ? "text-[#94a3b8]/70 dark:text-slate-600"
                        : "text-[#475569] dark:text-slate-300"
                  }`}
                >
                  {tick.mm}
                </span>
              </div>
            );
          }
          const tickHeightClass = tick.kind === "medium" ? "h-[6px]" : "h-[3px]";
          const tickColorClass = isOutsidePlate
            ? "bg-[#cbd5e1]/40 dark:bg-white/5"
            : tick.kind === "medium"
              ? "bg-[#94a3b8] dark:bg-slate-500"
              : "bg-[#cbd5e1] dark:bg-slate-600";
          return (
            <div
              key={tick.mm}
              style={{ transform: `translateX(${left}px)` }}
              className={`absolute bottom-0 w-px ${tickHeightClass} ${tickColorClass}`}
            />
          );
        })}

        {/* Cursor Hairline Tracker */}
        {cursorPlate && cursorPlate.topRulerLeftPx >= 0 && (
          <div
            style={{ transform: `translateX(${cursorPlate.topRulerLeftPx}px)` }}
            className="absolute top-0 bottom-0 z-10 w-[1.5px] bg-rose-500 dark:bg-rose-400"
          >
            <span className="absolute top-0.5 left-1 rounded bg-rose-500 px-1 py-[1px] text-[8px] font-semibold leading-none text-white shadow-xs dark:bg-rose-400 dark:text-slate-950">
              {Math.round(cursorPlate.xMm)}
            </span>
          </div>
        )}
      </div>

      {/* Left Engineering Ruler (Plate Top-Left Origin: 0 -> plateH downward) */}
      <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-6 overflow-hidden border-r border-[#e2e8f0] dark:border-white/10 bg-white/95 dark:bg-[#0c0e14]/90 font-sans text-[9px] text-[#64748b] dark:text-slate-400 backdrop-blur-md">
        {/* Dimmed out-of-plate zones */}
        {plateTopRulerPx > 0 && (
          <div
            style={{ top: 0, height: plateTopRulerPx }}
            className="absolute right-0 left-0 bg-slate-200/45 dark:bg-black/45"
          />
        )}
        <div
          style={{ top: Math.max(0, plateBottomRulerPx), bottom: 0 }}
          className="absolute right-0 left-0 bg-slate-200/45 dark:bg-black/45"
        />

        {/* Selection Footprint Highlight (Y1..Y2) */}
        {selectionFootprint && (() => {
          const fpTop = pan.y - plateToWorldY(selectionFootprint.y1Mm, plateH) * zoom;
          const fpBottom = pan.y - plateToWorldY(selectionFootprint.y2Mm, plateH) * zoom;
          const fpHeight = Math.max(2, fpBottom - fpTop);
          return (
            <div
              style={{ top: fpTop, height: fpHeight }}
              className="absolute right-0 left-0 border-y border-sky-500/80 bg-sky-500/20 dark:border-sky-400/80 dark:bg-sky-400/20"
            />
          );
        })()}

        {/* Ruler Sub-Ticks (Major 10px + label, Medium 6px, Minor 3px) */}
        {ySubTicks.map((tick) => {
          const top = pan.y - plateToWorldY(tick.mm, plateH) * zoom;
          if (top < 0) return null;
          const isOutsidePlate = tick.mm < 0 || tick.mm > plateH;
          const isOrigin = tick.mm === 0;
          if (tick.kind === "major") {
            return (
              <div
                key={tick.mm}
                style={{ transform: `translateY(${top}px)` }}
                className="absolute right-0 left-0"
              >
                <div
                  className={`absolute top-0 right-0 h-px w-[10px] ${
                    isOrigin
                      ? "bg-sky-500/90 dark:bg-sky-400"
                      : isOutsidePlate
                        ? "bg-[#cbd5e1]/60 dark:bg-white/10"
                        : "bg-[#64748b] dark:bg-slate-400"
                  }`}
                />
                <span
                  className={`block pt-0.5 pr-1 text-center text-[8px] leading-none ${
                    isOrigin
                      ? "font-bold text-sky-600 dark:text-sky-400"
                      : isOutsidePlate
                        ? "text-[#94a3b8]/70 dark:text-slate-600"
                        : "text-[#475569] dark:text-slate-300"
                  }`}
                >
                  {tick.mm}
                </span>
              </div>
            );
          }
          const tickWidthClass = tick.kind === "medium" ? "w-[6px]" : "w-[3px]";
          const tickColorClass = isOutsidePlate
            ? "bg-[#cbd5e1]/40 dark:bg-white/5"
            : tick.kind === "medium"
              ? "bg-[#94a3b8] dark:bg-slate-500"
              : "bg-[#cbd5e1] dark:bg-slate-600";
          return (
            <div
              key={tick.mm}
              style={{ transform: `translateY(${top}px)` }}
              className={`absolute right-0 h-px ${tickWidthClass} ${tickColorClass}`}
            />
          );
        })}

        {/* Cursor Hairline Tracker */}
        {cursorPlate && cursorPlate.leftRulerTopPx >= 0 && (
          <div
            style={{ transform: `translateY(${cursorPlate.leftRulerTopPx}px)` }}
            className="absolute right-0 left-0 z-10 h-[1.5px] bg-rose-500 dark:bg-rose-400"
          >
            <span className="absolute top-0.5 left-0.5 rounded bg-rose-500 px-0.5 py-[1px] text-[7px] font-semibold leading-none text-white shadow-xs dark:bg-rose-400 dark:text-slate-950">
              {Math.round(cursorPlate.yMm)}
            </span>
          </div>
        )}
      </div>

      {/* Corner Origin Badge */}
      <div className="pointer-events-none absolute top-0 left-0 z-30 flex h-6 w-6 items-center justify-center border-r border-b border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#111318] font-sans text-[8px] font-bold text-[#0f172a] dark:text-slate-300">
        mm
      </div>

      {/* Top-Left Vertical Floating Island Toolbar + Contextual Sub-Bar */}
      <div className="absolute top-8 sm:top-9 left-8 sm:left-9 z-30 flex items-start gap-2 select-none">
        {/* Vertical Floating Toolbar */}
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-slate-200/90 dark:border-white/15 bg-white/85 dark:bg-[#11141c]/80 px-1.5 py-2 shadow-2xl shadow-slate-900/15 dark:shadow-black/60 backdrop-blur-md">
          {/* Tools: Select, Measure, Draw, Pan (Icon-only + Right Tooltip) */}
          <div className="flex flex-col items-center gap-0.5">
            {(
              [
                { id: "select", label: "Select & Move (Click Pin to Wire)", Icon: MousePointer2 },
                { id: "measure", label: "Measure", Icon: Ruler },
                { id: "draw", label: "Shape", Icon: Square },
                { id: "pan", label: "Pan Canvas", Icon: Hand },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = canvasTool2D === id;
              return (
                <div key={id} className="relative group/tip">
                  <button
                    type="button"
                    aria-label={label}
                    onClick={() => setCanvasTool2D(id)}
                    className={`p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                      active
                        ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/10"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-medium opacity-0 scale-95 transition-all duration-100 group-hover/tip:opacity-100 group-hover/tip:scale-100 shadow-xl bg-slate-900 text-slate-100 border-slate-800 dark:bg-[#161922] dark:text-zinc-200 dark:border-white/15"
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Separator */}
          <div className="h-[1px] w-5 my-0.5 bg-slate-200 dark:bg-white/10 shrink-0" />

          {/* Undo / Redo (Icon-only + Right Tooltip) */}
          <div className="flex flex-col items-center gap-0.5">
            <div className="relative group/tip">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                aria-label="Undo (Ctrl+Z)"
                className="p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-medium opacity-0 scale-95 transition-all duration-100 group-hover/tip:opacity-100 group-hover/tip:scale-100 shadow-xl bg-slate-900 text-slate-100 border-slate-800 dark:bg-[#161922] dark:text-zinc-200 dark:border-white/15"
              >
                Undo (Ctrl+Z)
              </span>
            </div>
            <div className="relative group/tip">
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                aria-label="Redo (Ctrl+Y)"
                className="p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none"
              >
                <Redo2 className="h-4 w-4" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-medium opacity-0 scale-95 transition-all duration-100 group-hover/tip:opacity-100 group-hover/tip:scale-100 shadow-xl bg-slate-900 text-slate-100 border-slate-800 dark:bg-[#161922] dark:text-zinc-200 dark:border-white/15"
              >
                Redo (Ctrl+Y)
              </span>
            </div>
          </div>

          {/* Separator */}
          <div className="h-[1px] w-5 my-0.5 bg-slate-200 dark:bg-white/10 shrink-0" />

          {/* Grid Snap Icon + Popover (1, 5, 10, 20 mm) */}
          <div ref={gridPopoverRef} className="relative group/tip">
            <button
              type="button"
              aria-label={`Grid Snap (${gridSnapMm}mm)`}
              onClick={() => setGridPopoverOpen((v) => !v)}
              className={`p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                gridPopoverOpen
                  ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/10"
              }`}
            >
              <Grid className="h-4 w-4" />
            </button>
            {!gridPopoverOpen && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-medium opacity-0 scale-95 transition-all duration-100 group-hover/tip:opacity-100 group-hover/tip:scale-100 shadow-xl bg-slate-900 text-slate-100 border-slate-800 dark:bg-[#161922] dark:text-zinc-200 dark:border-white/15"
              >
                Grid Snap ({gridSnapMm}mm)
              </span>
            )}

            {gridPopoverOpen && (
              <div className="absolute left-full top-0 ml-2.5 z-50 w-32 rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#161a23] p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2 py-1 mb-1 text-[11px] font-semibold text-slate-700 dark:text-zinc-200 border-b border-slate-200 dark:border-white/10">
                  Grid Snap
                </div>
                <div className="flex flex-col gap-0.5">
                  {([1, 5, 10, 20] as GridSnapMm[]).map((snap) => (
                    <button
                      key={snap}
                      type="button"
                      onClick={() => {
                        setGridSnapMm(snap);
                        setGridPopoverOpen(false);
                      }}
                      className={`w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer ${
                        gridSnapMm === snap
                          ? "bg-slate-900 text-white dark:bg-white dark:text-black font-semibold"
                          : "text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10"
                      }`}
                    >
                      <span>{snap} mm</span>
                      {gridSnapMm === snap && <Check className="h-3 w-3" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Toggle Show All Pin Labels (Smart Auto-LOD vs Always On) */}
          <div className="relative group/tip">
            <button
              type="button"
              aria-label={showPinLabels ? "Pin Labels: Always On" : "Pin Labels: Smart Auto"}
              onClick={toggleShowPinLabels}
              className={`p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                showPinLabels
                  ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/10"
              }`}
            >
              <Tag className="h-4 w-4" />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-medium opacity-0 scale-95 transition-all duration-100 group-hover/tip:opacity-100 group-hover/tip:scale-100 shadow-xl bg-slate-900 text-slate-100 border-slate-800 dark:bg-[#161922] dark:text-zinc-200 dark:border-white/15"
            >
              Pin Labels: {showPinLabels ? "All Visible" : "Smart Auto"}
            </span>
          </div>

          {/* Toggle Auto Wire Duct Routing */}
          <div className="relative group/tip">
            <button
              type="button"
              aria-label={autoRouteDuctsEnabled ? "Auto Wire Duct: ON" : "Auto Wire Duct: OFF"}
              onClick={() => setAutoRouteDuctsEnabled(!autoRouteDuctsEnabled)}
              className={`p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                autoRouteDuctsEnabled
                  ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/10"
              }`}
            >
              <Route className="h-4 w-4" />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-medium opacity-0 scale-95 transition-all duration-100 group-hover/tip:opacity-100 group-hover/tip:scale-100 shadow-xl bg-slate-900 text-slate-100 border-slate-800 dark:bg-[#161922] dark:text-zinc-200 dark:border-white/15"
            >
              Auto Wire Duct: {autoRouteDuctsEnabled ? "ON" : "OFF"}
            </span>
          </div>
        </div>

        {/* Contextual Tool Options Pill next to Vertical Toolbar */}
        {(() => {
          const showWireControls = Boolean(activeWireStartPin);

          const showBar =
            showWireControls ||
            canvasTool2D === "measure" ||
            canvasTool2D === "draw" ||
            collisionReport.overlappingIds.size > 0 ||
            collisionReport.outOfBoundsIds.size > 0;

          if (!showBar) return null;

          return (
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/90 dark:border-white/15 bg-white/90 dark:bg-[#11141c]/85 px-2.5 py-1.5 shadow-2xl shadow-slate-900/15 dark:shadow-black/60 backdrop-blur-md">

        {/* Wire Options while Quick-Wiring from Pin */}
        {showWireControls && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Pure Circle Color Swatches */}
            <div className="flex items-center gap-1.5">
              {WIRE_COLORS.map((wc) => {
                const isActive = activeWireColor === wc.code;
                return (
                  <button
                    key={wc.code}
                    type="button"
                    title={wc.label}
                    aria-label={wc.label}
                    onClick={() => setActiveWireColor(wc.code)}
                    style={{ backgroundColor: wc.hex }}
                    className={`h-4 w-4 rounded-full transition-transform cursor-pointer border ${
                      isActive
                        ? "scale-115 border-white ring-2 ring-slate-900 dark:ring-white shadow-xs"
                        : "border-black/20 hover:scale-110 opacity-85 hover:opacity-100"
                    }`}
                  />
                );
              })}
            </div>

            <div className="h-4 w-px bg-slate-200 dark:bg-white/10" />

            {/* Compact Wire Gauge Dropdown */}
            <select
              aria-label="Wire Gauge (mm²)"
              value={activeWireGauge}
              onChange={(e) => setActiveWireGauge(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-white/15 bg-[#f8fafc] dark:bg-[#0c0e14] px-2 py-0.5 font-mono text-[10px] font-medium text-[#0f172a] dark:text-slate-200 outline-none cursor-pointer"
            >
              {WIRE_GAUGES.map((g) => (
                <option key={g} value={g}>
                  {g} mm²
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setAutoRouteDuctsEnabled(!autoRouteDuctsEnabled)}
              title="Auto-route new wires through nearby Wire Ducts"
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-[10px] transition-all cursor-pointer ${
                autoRouteDuctsEnabled && ducts.length > 0
                  ? "border-sky-500/60 bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold"
                  : "border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#0c0e14] text-[#64748b] dark:text-slate-400"
              }`}
            >
              <span>{autoRouteDuctsEnabled && ducts.length > 0 ? "Duct Route: ON" : "Duct Route: OFF"}</span>
            </button>

            <span className="font-sans text-[10px] font-semibold text-sky-600 dark:text-sky-400 animate-pulse">
              Klik/lepas di pin tujuan...
            </span>
          </div>
        )}

        {canvasTool2D === "measure" && (
          <div className="flex items-center gap-2 border-l border-[#e2e8f0] dark:border-white/10 pl-2">
            <span className="font-sans text-[10px] font-semibold text-sky-600 dark:text-sky-400">
              {!measureStart
                ? "Click point A"
                : !measureEnd
                ? "Click point B"
                : "Measured (Esc clear)"}
            </span>
          </div>
        )}

        {canvasTool2D === "draw" && (
          <div className="flex items-center gap-1.5 border-l border-[#e2e8f0] dark:border-white/10 pl-2">
            <span className="font-sans text-[10px] font-semibold text-amber-600 dark:text-amber-400 mr-1">
              Shape:
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDrawShapeMode("rectangle")}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-sans text-[10px] transition-all ${
                  drawShapeMode === "rectangle"
                    ? "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold"
                    : "border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#0c0e14] text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-slate-200"
                }`}
              >
                <Square className="h-3 w-3" />
                <span>Rectangle</span>
              </button>
              <button
                type="button"
                onClick={() => setDrawShapeMode("circle")}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-sans text-[10px] transition-all ${
                  drawShapeMode === "circle"
                    ? "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold"
                    : "border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#0c0e14] text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-slate-200"
                }`}
              >
                <Circle className="h-3 w-3" />
                <span>Circle</span>
              </button>
            </div>
          </div>
        )}

        {(collisionReport.overlappingIds.size > 0 ||
          collisionReport.outOfBoundsIds.size > 0) && (
          <div className="flex items-center gap-1.5 border-l border-[#e2e8f0] dark:border-white/10 pl-2">
            <span className="rounded-full border border-rose-500/40 bg-rose-50 dark:bg-rose-950/80 px-2 py-0.5 font-sans text-[10px] font-semibold text-rose-700 dark:text-rose-300">
              {collisionReport.overlappingIds.size > 0 &&
                `${collisionReport.overlapPairs.length} overlap`}
              {collisionReport.overlappingIds.size > 0 &&
                collisionReport.outOfBoundsIds.size > 0 &&
                " · "}
              {collisionReport.outOfBoundsIds.size > 0 &&
                `${collisionReport.outOfBoundsIds.size} OOB`}
            </span>
          </div>
        )}
          </div>
          );
        })()}
      </div>

      {/* Selection Floating Action Popover Bar (Centered above selected item) */}
      <SelectionFloatingBar
        anchorPos={selectionTopCenter}
        placement={selectionTopCenter?.placement ?? "top"}
        visible={Boolean(!dragState && selectionTopCenter)}
      />

      {/* Bottom Floating Status Pills (Senada RelayFlow) */}
      {/* Bottom Left / Center: Cursor & Snap Coordinates + Zoom Controls */}
      <div className="absolute bottom-2 sm:bottom-3 left-7 sm:left-9 z-20 flex max-w-[calc(100vw-3.5rem)] flex-wrap items-center gap-1.5 sm:gap-2">
        <div className="hidden sm:inline-flex rounded-full border border-[#e2e8f0] dark:border-white/10 bg-white/95 dark:bg-[#171a21]/95 px-3 py-1 font-sans text-[11px] tabular-nums text-[#0f172a] dark:text-slate-300 shadow-sm dark:shadow-xl backdrop-blur-xl">
          {cursorPlate
            ? `X: ${Math.round(cursorPlate.xMm)}mm | Y: ${Math.round(
                cursorPlate.yMm
              )}mm | Snap: ${gridSnapMm}mm`
            : `Snap: ${gridSnapMm}mm`}
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 rounded-full border border-[#e2e8f0] dark:border-white/10 bg-white/95 dark:bg-[#171a21]/95 p-0.5 shadow-sm dark:shadow-xl backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}
            className="rounded-full p-1 text-[#64748b] dark:text-slate-400 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[36px] sm:min-w-[42px] text-center font-sans text-[10px] sm:text-[11px] font-medium tabular-nums text-[#0f172a] dark:text-slate-200">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(8, z * 1.2))}
            className="rounded-full p-1 text-[#64748b] dark:text-slate-400 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={fitToView}
            className="flex items-center gap-1 rounded-full px-1.5 sm:px-2 py-0.5 font-sans text-[10px] text-[#64748b] dark:text-slate-400 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white transition-colors"
            title="Fit Sheet to View"
          >
            <Maximize2 className="h-3 w-3" />
            <span className="hidden sm:inline">Fit</span>
          </button>
        </div>
      </div>

      {/* Bottom Right: Parts & Wires Count & Collisions Pill */}
      <div className="pointer-events-none absolute right-2 sm:right-4 bottom-2 sm:bottom-3 z-20 flex items-center gap-1.5 sm:gap-2 rounded-full border border-[#e2e8f0] dark:border-white/10 bg-white/95 dark:bg-[#171a21]/95 px-2.5 sm:px-3 py-1 font-sans text-[10px] sm:text-[11px] text-[#0f172a] dark:text-slate-300 shadow-sm dark:shadow-xl backdrop-blur-xl">
        <span>Parts: {components.length + cadAssets.length}</span>
        <span className="text-[#cbd5e1] dark:text-white/20">|</span>
        <span>Wires: {wires.length}</span>
        {collisionReport.overlappingIds.size > 0 && (
          <>
            <span className="text-[#cbd5e1] dark:text-white/20">|</span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">
              {collisionReport.overlapPairs.length} <span className="hidden sm:inline">Overlaps</span><span className="sm:hidden">Ovl</span>
            </span>
          </>
        )}
      </div>

      {/* Main Interactive SVG Canvas */}
      <svg
        className={`h-full w-full touch-none ${
          spacePressed || canvasTool2D === "pan"
            ? "cursor-grab active:cursor-grabbing"
            : canvasTool2D === "wire"
            ? "cursor-crosshair"
            : "cursor-default"
        }`}
        onPointerDown={handleCanvasPointerDown}
      >
        <defs>
          <pattern
            id="grid-dots"
            width={gridSnapMm}
            height={gridSnapMm}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={0}
              cy={0}
              r={0.7}
              fill={theme === "light" ? "#cbd5e1" : "#161920"}
            />
          </pattern>
          <pattern
            id="duct-hatch"
            width="6"
            height="6"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke={theme === "light" ? "#cbd5e1" : "#252932"}
              strokeWidth="1"
            />
          </pattern>
          <marker
            id="measure-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 1 L 10 5 L 0 9 z"
              fill={theme === "light" ? "#0f172a" : "#ffffff"}
            />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Technical Drawing Sheet Outline (Dark Obsidian / Light Clean White) */}
          <g>
            <rect
              x={-sheetW / 2}
              y={-sheetH / 2}
              width={sheetW}
              height={sheetH}
              fill={theme === "light" ? "#ffffff" : "#090b10"}
              stroke={theme === "light" ? "#e2e8f0" : "#1a1e27"}
              strokeWidth={1.2}
              filter={
                theme === "light"
                  ? "drop-shadow(0 6px 20px rgba(15,23,42,0.08))"
                  : "drop-shadow(0 8px 24px rgba(0,0,0,0.6))"
              }
            />
            <rect
              x={-sheetW / 2 + 8}
              y={-sheetH / 2 + 8}
              width={sheetW - 16}
              height={sheetH - 16}
              fill="none"
              stroke={theme === "light" ? "#edf2f7" : "#161920"}
              strokeWidth={0.5}
            />
          </g>

          {/* Dedicated Door Cutout Canvas or Backplate Boundary */}
          {activeSheetType === "door-cutout" ? (
            <EnclosureDoor2D
              enclosure={enclosure}
              components={components}
              theme={theme}
              showDimensions={true}
            />
          ) : (
            <g>
              <rect
                x={-plateW / 2}
                y={-plateH / 2}
                width={plateW}
                height={plateH}
                fill="url(#grid-dots)"
                stroke={theme === "light" ? "#94a3b8" : "#252932"}
                strokeWidth={1.4}
              />
              {/* Backplate Dimension Annotations */}
              <text
                x={0}
                y={-plateH / 2 - 8}
                fontSize={8}
                fontFamily="monospace"
                fill={theme === "light" ? "#334155" : "#64748b"}
                textAnchor="middle"
              >
                MOUNTING PLATE: {plateW} x {plateH} mm
              </text>
            </g>
          )}

          {/* Wire Ducts & DIN Rails Layer (Memoized) */}
          <RailsDuctsLayer2D
            ducts={ducts}
            rails={rails}
            canvasTool2D={canvasTool2D}
            spacePressed={spacePressed}
            activeWireStartPin={activeWireStartPin}
            selectedIds={selectedIds}
            isItemSelected={isItemSelected}
            collidingDuctIds={collidingDuctIds}
            collidingRailIds={collidingRailIds}
            ductFillMap={ductFillMap}
            screenToWorld={screenToWorld}
            toggleSelectId={toggleSelectId}
            setSelected={setSelected}
            pushUndoSnapshot={pushUndoSnapshot}
            onStartMultiDrag={(w) =>
              setDragState({
                type: "multi-drag",
                startWorldXMm: w.xMm,
                startWorldYMm: w.yMm,
                lastDxMm: 0,
                lastDyMm: 0,
              })
            }
            onStartDuctMove={(id, offsetXMm, offsetYMm) =>
              setDragState({ type: "duct-move", id, offsetXMm, offsetYMm })
            }
            onStartDuctResize={(initialDuct, edge, w) =>
              setDragState({
                type: "duct-resize",
                id: initialDuct.id,
                edge,
                initialDuct,
                startWorldXMm: w.xMm,
                startWorldYMm: w.yMm,
              })
            }
            onStartRailMove={(id, offsetXMm, offsetYMm) =>
              setDragState({ type: "rail-move", id, offsetXMm, offsetYMm })
            }
            onStartRailResize={(rail, edge, startWorldXMm) =>
              setDragState({
                type: "rail-resize",
                id: rail.id,
                edge,
                initialXMm: rail.xMm,
                initialLengthMm: rail.lengthMm,
                startWorldXMm,
              })
            }
            onOpenContextMenu={(x, y, target) => setContextMenu({ x, y, target })}
          />

          {/* Visual Group Boxes Layer */}
          {(() => {
            // Find unique groupIds present in components or cadAssets
            const groupsMap = new Map<string, {
              groupId: string;
              groupName?: string;
              items: Array<{ kind: "component" | "cad" | "rail" | "duct"; id: string; x1: number; y1: number; x2: number; y2: number }>;
            }>();

            for (const c of components) {
              if (c.groupId) {
                if (!groupsMap.has(c.groupId)) {
                  groupsMap.set(c.groupId, { groupId: c.groupId, groupName: c.groupName, items: [] });
                }
                const g = groupsMap.get(c.groupId)!;
                if (!g.groupName && c.groupName) g.groupName = c.groupName;
                const minX = c.xMm - c.widthMm / 2;
                const maxX = c.xMm + c.widthMm / 2;
                const minY = -(c.yMm + c.heightMm / 2);
                const maxY = -(c.yMm - c.heightMm / 2);
                g.items.push({ kind: "component", id: c.id, x1: minX, y1: minY, x2: maxX, y2: maxY });
              }
            }

            for (const a of cadAssets) {
              if (a.groupId) {
                if (!groupsMap.has(a.groupId)) {
                  groupsMap.set(a.groupId, { groupId: a.groupId, groupName: a.groupName, items: [] });
                }
                const g = groupsMap.get(a.groupId)!;
                if (!g.groupName && a.groupName) g.groupName = a.groupName;
                const eff = getEffectiveCadBounds(a);
                const minX = a.xMm - eff.widthMm / 2;
                const maxX = a.xMm + eff.widthMm / 2;
                const minY = -(a.yMm + eff.heightMm / 2);
                const maxY = -(a.yMm - eff.heightMm / 2);
                g.items.push({ kind: "cad", id: a.id, x1: minX, y1: minY, x2: maxX, y2: maxY });
              }
            }

            for (const r of rails) {
              if (r.groupId) {
                if (!groupsMap.has(r.groupId)) {
                  groupsMap.set(r.groupId, { groupId: r.groupId, groupName: r.groupName, items: [] });
                }
                const g = groupsMap.get(r.groupId)!;
                if (!g.groupName && r.groupName) g.groupName = r.groupName;
                g.items.push({
                  kind: "rail",
                  id: r.id,
                  x1: r.xMm - r.lengthMm / 2,
                  y1: -(r.yMm + 17.5),
                  x2: r.xMm + r.lengthMm / 2,
                  y2: -(r.yMm - 17.5),
                });
              }
            }

            for (const d of ducts) {
              if (d.groupId) {
                if (!groupsMap.has(d.groupId)) {
                  groupsMap.set(d.groupId, { groupId: d.groupId, groupName: d.groupName, items: [] });
                }
                const g = groupsMap.get(d.groupId)!;
                if (!g.groupName && d.groupName) g.groupName = d.groupName;
                g.items.push({
                  kind: "duct",
                  id: d.id,
                  x1: d.xMm - d.widthMm / 2,
                  y1: -(d.yMm + d.heightMm / 2),
                  x2: d.xMm + d.widthMm / 2,
                  y2: -(d.yMm - d.heightMm / 2),
                });
              }
            }

            return Array.from(groupsMap.values()).map((group) => {
              const isGroupHovered = hoveredGroupId === group.groupId;
              const hasItemSelected = group.items.some((item) => isItemSelected(item.kind, item.id));

              if (!isGroupHovered && !hasItemSelected) return null;

              let minX = Infinity;
              let minY = Infinity;
              let maxX = -Infinity;
              let maxY = -Infinity;

              for (const it of group.items) {
                minX = Math.min(minX, it.x1);
                minY = Math.min(minY, it.y1);
                maxX = Math.max(maxX, it.x2);
                maxY = Math.max(maxY, it.y2);
              }

              const pad = 4;
              const bx = minX - pad;
              const by = minY - pad;
              const bw = maxX - minX + pad * 2;
              const bh = maxY - minY + pad * 2;

              return (
                <g
                  key={group.groupId}
                  onPointerEnter={() => setHoveredGroupId(group.groupId)}
                  onPointerLeave={() => setHoveredGroupId((curr) => curr === group.groupId ? null : curr)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    // Select first child component/cad in group to allow sub-selection
                    const first = group.items[0];
                    if (first) {
                      setSelected({ kind: first.kind, id: first.id });
                    }
                  }}
                  className="cursor-pointer"
                >
                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    fill="rgba(99, 102, 241, 0.04)"
                    stroke="#818cf8"
                    strokeWidth={1.2}
                    strokeDasharray="4 2"
                    rx={3}
                  />
                  {/* Badge tag on top edge */}
                  <g transform={`translate(${bx}, ${by - 6.5})`}>
                    <rect
                      x={0}
                      y={0}
                      width={Math.max(28, (group.groupName || group.groupId).length * 2.8 + 14)}
                      height={6}
                      rx={2}
                      fill="#6366f1"
                    />
                    <text
                      x={3}
                      y={4.5}
                      fontSize={3.2}
                      fontFamily="system-ui, -apple-system, sans-serif"
                      fontWeight="bold"
                      fill="#ffffff"
                    >
                      Group: {group.groupName || group.groupId}
                    </text>
                  </g>
                </g>
              );
            });
          })()}

          {/* Components Layer */}
          <g>
            {components.map((comp) => {
              const isSelected = isItemSelected("component", comp.id);
              return (
              <Component2DSymbol
                key={comp.id}
                comp={comp}
                isSelected={isSelected}
                isWireMode={canvasTool2D === "wire"}
                canQuickWire={canvasTool2D === "select" && !spacePressed}
                isDark={theme === "dark"}
                zoom={zoom}
                showAllPinLabels={showPinLabels}
                obstacleBoxes={cadObstacleBoxes}
                activeWireStartPin={activeWireStartPin}
                hasCollision={collisionReport.overlappingIds.has(comp.id)}
                isOutOfBounds={collisionReport.outOfBoundsIds.has(comp.id)}
                onPointerDown={(e) => {
                  if (e.button !== 0 || spacePressed) return;
                  if (activeWireStartPin && (canvasTool2D === "select" || canvasTool2D === "wire")) {
                    e.stopPropagation();
                    // Magnetic snap: if user clicks near any pin on this component while wiring, finish wire to nearest pin
                    const w = screenToWorld(e.clientX, e.clientY);
                    const rot = comp.rotationDeg ?? 0;
                    let nearestPinId: string | null = null;
                    let bestDist = 3.8;
                    for (const p of comp.pins) {
                      const rp = rotateLocalPoint(p.localXMm, p.localYMm, rot);
                      const d = Math.hypot(
                        comp.xMm + rp.xMm - w.xMm,
                        comp.yMm + rp.yMm - w.yMm
                      );
                      if (d <= bestDist) {
                        bestDist = d;
                        nearestPinId = p.id;
                      }
                    }
                    if (nearestPinId) {
                      lastWireCanvasClickRef.current = null;
                      handlePinClick(comp.id, nearestPinId);
                    } else {
                      handleWiringNonPinClick(w.xMm, w.yMm, e.detail);
                    }
                    return;
                  }
                  if (canvasTool2D !== "select") return;
                  e.stopPropagation();
                  if (e.shiftKey) {
                    toggleSelectId({ kind: "component", id: comp.id });
                    return;
                  }
                  const w = screenToWorld(e.clientX, e.clientY);
                  if (selectedIds.length > 1 && isSelected) {
                    pushUndoSnapshot();
                    setDragState({
                      type: "multi-drag",
                      startWorldXMm: w.xMm,
                      startWorldYMm: w.yMm,
                      lastDxMm: 0,
                      lastDyMm: 0,
                    });
                    return;
                  }
                  setSelected({ kind: "component", id: comp.id });
                  if (!comp.locked) {
                    pushUndoSnapshot();
                    setDragState({
                      type: "component",
                      id: comp.id,
                      offsetXMm: w.xMm - comp.xMm,
                      offsetYMm: w.yMm - comp.yMm,
                    });
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (selectedIds.length > 1 && isSelected) {
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      target: { kind: "multi" },
                    });
                    return;
                  }
                  setSelected({ kind: "component", id: comp.id });
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    target: { kind: "component", id: comp.id },
                  });
                }}
                onPinClick={(e, pinId) => {
                  e.stopPropagation();
                  handlePinClick(comp.id, pinId);
                }}
                onPinDoubleClick={(e, pin, worldCoords) => {
                  setInlinePinEdit({
                    targetKind: "component",
                    targetId: comp.id,
                    pinId: pin.id,
                    initialLabel: pin.label,
                    label: pin.label,
                    worldX: worldCoords.xMm,
                    worldY: worldCoords.yMm,
                  });
                }}
                onPinContextMenu={(e, pin, worldCoords) => {
                  setInlinePinEdit({
                    targetKind: "component",
                    targetId: comp.id,
                    pinId: pin.id,
                    initialLabel: pin.label,
                    label: pin.label,
                    worldX: worldCoords.xMm,
                    worldY: worldCoords.yMm,
                  });
                }}
              />
              );
            })}
          </g>

          {/* Custom CAD Assets Layer */}
          <g>
            {cadAssets.map((asset) => {
              const isMarkingThis =
                isPinMarkingMode && activeMarkingAssetId === asset.id;
              const isSelected = isItemSelected("cad", asset.id);
              return (
                <CadAsset2DSymbol
                  key={asset.id}
                  asset={asset}
                  isSelected={isSelected}
                  isMarkingThis={isMarkingThis}
                  isWireMode={canvasTool2D === "wire"}
                  canQuickWire={canvasTool2D === "select" && !spacePressed}
                  isDark={theme === "dark"}
                  obstacleBoxes={cadObstacleBoxes}
                  activeWireStartPin={activeWireStartPin}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || spacePressed) return;
                    if (canvasTool2D === "draw") return; // Allow drawing over existing assets
                    if (isMarkingThis) {
                      e.stopPropagation();
                      const w = screenToWorld(e.clientX, e.clientY);
                      addPinToAsset(asset.id, {
                        label: `P${asset.pins.length + 1}`,
                        localXMm: Number((w.xMm - asset.xMm).toFixed(1)),
                        localYMm: Number((w.yMm - asset.yMm).toFixed(1)),
                        localZMm: 0,
                      });
                      return;
                    }
                    if (canvasTool2D !== "select") return;
                    e.stopPropagation();
                    if (e.shiftKey) {
                      toggleSelectId({ kind: "cad", id: asset.id });
                      return;
                    }
                    const w = screenToWorld(e.clientX, e.clientY);
                    if (selectedIds.length > 1 && isSelected) {
                      pushUndoSnapshot();
                      setDragState({
                        type: "multi-drag",
                        startWorldXMm: w.xMm,
                        startWorldYMm: w.yMm,
                        lastDxMm: 0,
                        lastDyMm: 0,
                      });
                      return;
                    }
                    setSelected({ kind: "cad", id: asset.id });
                    if (!asset.locked) {
                      pushUndoSnapshot();
                      setDragState({
                        type: "cad",
                        id: asset.id,
                        offsetXMm: w.xMm - asset.xMm,
                        offsetYMm: w.yMm - asset.yMm,
                      });
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (selectedIds.length > 1 && isSelected) {
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        target: { kind: "multi" },
                      });
                      return;
                    }
                    setSelected({ kind: "cad", id: asset.id });
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      target: { kind: "cad", id: asset.id },
                    });
                  }}
                  onPinClick={(e, pinId) => {
                    e.stopPropagation();
                    handlePinClick(asset.id, pinId);
                  }}
                  onPinDoubleClick={(e, pin, worldCoords) => {
                    setInlinePinEdit({
                      targetKind: "cad",
                      targetId: asset.id,
                      pinId: pin.id,
                      initialLabel: pin.label,
                      label: pin.label,
                      worldX: worldCoords.xMm,
                      worldY: worldCoords.yMm,
                    });
                  }}
                  onPinContextMenu={(e, pin, worldCoords) => {
                    setInlinePinEdit({
                      targetKind: "cad",
                      targetId: asset.id,
                      pinId: pin.id,
                      initialLabel: pin.label,
                      label: pin.label,
                      worldX: worldCoords.xMm,
                      worldY: worldCoords.yMm,
                    });
                  }}
                  onStartResize={(e, handle) => {
                    if (asset.locked) return;
                    pushUndoSnapshot();
                    const w = screenToWorld(e.clientX, e.clientY);
                    setDragState({
                      type: "cad-resize",
                      id: asset.id,
                      handle,
                      initialXMm: asset.xMm,
                      initialYMm: asset.yMm,
                      initialW: asset.boundingBoxMm.w,
                      initialH: asset.boundingBoxMm.h,
                      initialD: asset.boundingBoxMm.d,
                      rotationDeg: asset.rotationDeg ?? 0,
                      startWorldXMm: w.xMm,
                      startWorldYMm: w.yMm,
                    });
                  }}
                />
              );
            })}
          </g>

          {/* Wires / Netlist Layer (Memoized) */}
          <WiresLayer2D
            wires={wires}
            components={components}
            cadAssets={cadAssets}
            ducts={ducts}
            rails={rails}
            pinMap={pinMap}
            canvasTool2D={canvasTool2D}
            spacePressed={spacePressed}
            theme={theme}
            autoRouteDuctsEnabled={autoRouteDuctsEnabled}
            activeWireStartPin={activeWireStartPin}
            activeWireColor={activeWireColor}
            cursorWorld={cursorWorld}
            freeEndSnapTarget={freeEndSnapTarget}
            selectedIds={selectedIds}
            isItemSelected={isItemSelected}
            findNearestPin={findNearestPin}
            toggleSelectId={toggleSelectId}
            setSelected={setSelected}
            pushUndoSnapshot={pushUndoSnapshot}
            updateWire={updateWire}
            onStartWireFreeEndDrag={(wireId) =>
              setDragState({ type: "wire-free-end", wireId })
            }
            onStartWireSegmentDrag={(wireId, segIndex, orientation, waypoints) =>
              setDragState({
                type: "wire-segment",
                wireId,
                segIndex,
                orientation,
                waypoints,
              })
            }
            onStartWireWaypointDrag={(wireId, index, waypoints) =>
              setDragState({
                type: "wire-waypoint",
                wireId,
                index,
                waypoints,
              })
            }
            onOpenContextMenu={(x, y, target) => setContextMenu({ x, y, target })}
          />

          {/* Measuring Dimension Overlay */}
          {measureStart && (measureEnd || measureHover) && (() => {
            const b = measureEnd ?? measureHover!;
            const sx1 = measureStart.xMm;
            const sy1 = -measureStart.yMm;
            const sx2 = b.xMm;
            const sy2 = -b.yMm;
            const dx = Math.abs(b.xMm - measureStart.xMm);
            const dy = Math.abs(b.yMm - measureStart.yMm);
            const dist = Math.hypot(dx, dy);
            const midX = (sx1 + sx2) / 2;
            const midY = (sy1 + sy2) / 2;
            return (
              <g className="pointer-events-none">
                {/* Orthogonal ΔX & ΔY guides */}
                {dx > 0.1 && dy > 0.1 && (
                  <>
                    <line
                      x1={sx1}
                      y1={sy1}
                      x2={sx2}
                      y2={sy1}
                      stroke="#64748b"
                      strokeWidth={0.7}
                      strokeDasharray="3,2"
                    />
                    <line
                      x1={sx2}
                      y1={sy1}
                      x2={sx2}
                      y2={sy2}
                      stroke="#64748b"
                      strokeWidth={0.7}
                      strokeDasharray="3,2"
                    />
                  </>
                )}
                {/* Main dimension line */}
                <line
                  x1={sx1}
                  y1={sy1}
                  x2={sx2}
                  y2={sy2}
                  stroke="#0284c7"
                  strokeWidth={1.2}
                  markerStart="url(#measure-arrow)"
                  markerEnd="url(#measure-arrow)"
                />
                <circle cx={sx1} cy={sy1} r={2.2} fill="#0284c7" />
                <circle cx={sx2} cy={sy2} r={2.2} fill="#0284c7" />
                {/* Dimension Label */}
                <rect
                  x={midX - 42}
                  y={midY - 12}
                  width={84}
                  height={16}
                  rx={2.5}
                  fill="#0f172a"
                  fillOpacity={0.92}
                  stroke="#0284c7"
                  strokeWidth={0.7}
                />
                <text
                  x={midX}
                  y={midY - 5}
                  fontSize={5}
                  fontFamily="monospace"
                  fontWeight="bold"
                  fill="#f8fafc"
                  textAnchor="middle"
                >
                  L={formatDim(dist, displayUnit)}
                </text>
                <text
                  x={midX}
                  y={midY + 1.5}
                  fontSize={3.8}
                  fontFamily="monospace"
                  fill="#93c5fd"
                  textAnchor="middle"
                >
                  ΔX:{formatDim(dx, displayUnit)} ΔY:{formatDim(dy, displayUnit)}
                </text>
              </g>
            );
          })()}

          {/* Smart Alignment Guides Overlay (Cyan/Sky dotted lines) */}
          {alignmentGuides.length > 0 && (
            <g className="pointer-events-none">
              {alignmentGuides.map((guide, idx) => {
                if (guide.orientation === "vertical") {
                  return (
                    <line
                      key={`guide-v-${idx}`}
                      x1={guide.coordinate}
                      y1={-guide.start}
                      x2={guide.coordinate}
                      y2={-guide.end}
                      stroke="#0ea5e9"
                      strokeWidth={1.5 / zoom}
                      strokeDasharray={`${6 / zoom},${4 / zoom}`}
                      strokeOpacity={0.9}
                    />
                  );
                }
                return (
                  <line
                    key={`guide-h-${idx}`}
                    x1={guide.start}
                    y1={-guide.coordinate}
                    x2={guide.end}
                    y2={-guide.coordinate}
                    stroke="#0ea5e9"
                    strokeWidth={1.5 / zoom}
                    strokeDasharray={`${6 / zoom},${4 / zoom}`}
                    strokeOpacity={0.9}
                  />
                );
              })}
            </g>
          )}

          {/* Live Drawing Preview Overlay (Busbar / Custom Component) */}
          {dragState?.type === "draw" && (() => {
            const sx = Math.min(dragState.startWorldXMm, dragState.currentWorldXMm);
            const sy = -Math.max(dragState.startWorldYMm, dragState.currentWorldYMm);
            const sw = Math.max(1, Math.abs(dragState.currentWorldXMm - dragState.startWorldXMm));
            const sh = Math.max(1, Math.abs(dragState.currentWorldYMm - dragState.startWorldYMm));
            return (
              <g className="pointer-events-none">
                {drawShapeMode === "circle" ? (
                  <ellipse
                    cx={sx + sw / 2}
                    cy={sy + sh / 2}
                    rx={sw / 2}
                    ry={sh / 2}
                    fill="#d97706"
                    fillOpacity={0.25}
                    stroke="#f59e0b"
                    strokeWidth={1.5 / zoom}
                    strokeDasharray={`${4 / zoom},${3 / zoom}`}
                  />
                ) : (
                  <rect
                    x={sx}
                    y={sy}
                    width={sw}
                    height={sh}
                    fill="#d97706"
                    fillOpacity={0.25}
                    stroke="#f59e0b"
                    strokeWidth={1.5 / zoom}
                    strokeDasharray={`${4 / zoom},${3 / zoom}`}
                    rx={2 / zoom}
                  />
                )}
                {/* Live Dimension Badge (W x H mm) */}
                <g transform={`translate(${sx + sw / 2}, ${sy - 8 / zoom})`}>
                  <rect
                    x={-35 / zoom}
                    y={-10 / zoom}
                    width={70 / zoom}
                    height={14 / zoom}
                    fill="#0f172a"
                    rx={3 / zoom}
                    stroke="#f59e0b"
                    strokeWidth={0.8 / zoom}
                  />
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#fbbf24"
                    fontSize={8.5 / zoom}
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {Math.round(sw)} × {Math.round(sh)} mm
                  </text>
                </g>
              </g>
            );
          })()}

          {/* Marquee Box Selection Overlay */}
          {dragState?.type === "marquee" && (() => {
            const sx = Math.min(dragState.startWorldXMm, dragState.currentWorldXMm);
            const sy = -Math.max(dragState.startWorldYMm, dragState.currentWorldYMm);
            const sw = Math.abs(dragState.currentWorldXMm - dragState.startWorldXMm);
            const sh = Math.abs(dragState.currentWorldYMm - dragState.startWorldYMm);
            if (sw < 1 && sh < 1) return null;
            return (
              <rect
                x={sx}
                y={sy}
                width={sw}
                height={sh}
                fill="#38bdf8"
                fillOpacity={0.14}
                stroke="#0284c7"
                strokeWidth={1.2 / zoom}
                strokeDasharray={`${4 / zoom},${3 / zoom}`}
                className="pointer-events-none"
              />
            );
          })()}

          {/* ISO/IEC Title Block (Plot Frame) */}
          <g>
            <rect
              x={tbX}
              y={tbY}
              width={tbW}
              height={tbH}
              fill={theme === "light" ? "#f8fafc" : "#0c0e14"}
              stroke={theme === "light" ? "#cbd5e1" : "#252932"}
              strokeWidth={0.9}
            />
            <line
              x1={tbX}
              y1={tbY + 15}
              x2={tbX + tbW}
              y2={tbY + 15}
              stroke={theme === "light" ? "#cbd5e1" : "#252932"}
              strokeWidth={0.5}
            />
            <line
              x1={tbX}
              y1={tbY + 30}
              x2={tbX + tbW}
              y2={tbY + 30}
              stroke={theme === "light" ? "#cbd5e1" : "#252932"}
              strokeWidth={0.5}
            />
            <line
              x1={tbX + 158}
              y1={tbY}
              x2={tbX + 158}
              y2={tbY + tbH}
              stroke={theme === "light" ? "#cbd5e1" : "#252932"}
              strokeWidth={0.5}
            />
            <line
              x1={tbX + 214}
              y1={tbY + 15}
              x2={tbX + 214}
              y2={tbY + tbH}
              stroke={theme === "light" ? "#cbd5e1" : "#252932"}
              strokeWidth={0.5}
            />
            <defs>
              <clipPath id="tb-project-clip">
                <rect x={tbX + 2} y={tbY + 1} width={153} height={13} />
              </clipPath>
              <clipPath id="tb-drawer-clip">
                <rect x={tbX + 2} y={tbY + 16} width={153} height={13} />
              </clipPath>
            </defs>
            <text
              x={tbX + 5}
              y={tbY + 10}
              fontSize={5.5}
              fontFamily="sans-serif"
              fontWeight="bold"
              clipPath="url(#tb-project-clip)"
              fill={theme === "light" ? "#0f172a" : "#f1f5f9"}
            >
              PROJECT:{" "}
              {titleBlock.projectName.length > 34
                ? `${titleBlock.projectName.slice(0, 32)}…`
                : titleBlock.projectName}
            </text>
            <text
              x={tbX + 5}
              y={tbY + 24}
              fontSize={5.5}
              fontFamily="sans-serif"
              clipPath="url(#tb-drawer-clip)"
              fill={theme === "light" ? "#475569" : "#94a3b8"}
            >
              DRAWER:{" "}
              {titleBlock.drawer.length > 34
                ? `${titleBlock.drawer.slice(0, 32)}…`
                : titleBlock.drawer}
            </text>
            <text
              x={tbX + 5}
              y={tbY + 39}
              fontSize={5}
              fontFamily="sans-serif"
              fill="#64748b"
            >
              PANELFLOW 2D MOUNTING LAYOUT (.PFLOW)
            </text>
            <text
              x={tbX + 163}
              y={tbY + 10}
              fontSize={5.5}
              fontFamily="sans-serif"
              fill={theme === "light" ? "#475569" : "#94a3b8"}
            >
              DATE: {titleBlock.date}
            </text>
            <text
              x={tbX + 163}
              y={tbY + 24}
              fontSize={5.5}
              fontFamily="sans-serif"
              fill={theme === "light" ? "#475569" : "#94a3b8"}
            >
              SCALE: {titleBlock.scale}
            </text>
            <text
              x={tbX + 163}
              y={tbY + 39}
              fontSize={5.5}
              fontFamily="sans-serif"
              fill={theme === "light" ? "#475569" : "#94a3b8"}
            >
              REV: {titleBlock.rev}
            </text>
            <text
              x={tbX + 219}
              y={tbY + 24}
              fontSize={5.5}
              fontFamily="sans-serif"
              fontWeight="bold"
              fill={theme === "light" ? "#334155" : "#cbd5e1"}
            >
              SHEET:
            </text>
            <text
              x={tbX + 219}
              y={tbY + 39}
              fontSize={6.5}
              fontFamily="monospace"
              fontWeight="bold"
              fill={theme === "light" ? "#0f172a" : "#ffffff"}
            >
              {titleBlock.sheetNo}
            </text>
          </g>
        </g>
      </svg>

      {/* Inline Pin Quick Rename & Delete Popup Badge */}
      {inlinePinEdit && (() => {
        const sx = pan.x + inlinePinEdit.worldX * zoom;
        const sy = pan.y - inlinePinEdit.worldY * zoom;

        const handleSave = () => {
          const finalLabel = inlinePinEdit.label.trim() || inlinePinEdit.initialLabel;
          if (inlinePinEdit.targetKind === "component") {
            updateComponentPin(inlinePinEdit.targetId, inlinePinEdit.pinId, { label: finalLabel });
          } else {
            updatePinInAsset(inlinePinEdit.targetId, inlinePinEdit.pinId, { label: finalLabel });
          }
          setInlinePinEdit(null);
        };

        const handleDelete = () => {
          if (inlinePinEdit.targetKind === "component") {
            removePinFromComponent(inlinePinEdit.targetId, inlinePinEdit.pinId);
          } else {
            removePinFromAsset(inlinePinEdit.targetId, inlinePinEdit.pinId);
          }
          setInlinePinEdit(null);
        };

        return (
          <div
            className="fixed inset-0 z-50 pointer-events-auto"
            onClick={handleSave}
          >
            <div
              className="absolute z-50 flex items-center gap-1 rounded-lg border border-amber-500/60 bg-white/95 dark:bg-[#111318]/95 px-2 py-1 shadow-2xl backdrop-blur-md"
              style={{
                left: `${sx}px`,
                top: `${sy - 38}px`,
                transform: "translateX(-50%)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                type="text"
                value={inlinePinEdit.label}
                onChange={(e) =>
                  setInlinePinEdit({ ...inlinePinEdit, label: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSave();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setInlinePinEdit(null);
                  }
                }}
                className="w-16 rounded border border-amber-400 bg-white dark:bg-[#1e222d] px-1.5 py-0.5 font-sans text-xs font-bold text-amber-600 dark:text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="Label"
              />
              <button
                type="button"
                onClick={handleSave}
                title="Save Pin Label (Enter)"
                className="rounded p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                title="Delete Pin"
                className="rounded p-1 text-rose-500 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })()}

      <ContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onFitToScreen={fitToView}
      />
    </div>
  );
}
