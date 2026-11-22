import { getEffectiveCadBounds } from "@/lib/collision";
import { getRotatedDimensions, rotateLocalPoint } from "@/lib/snap";
import type {
  CadCropMm,
  CadLabelPosition,
  CustomCadAsset,
  PlacedComponent,
} from "@/types/panel";

export interface SvgRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SmartCadLabelResult {
  placement: "top" | "bottom" | "right" | "left";
  x: number;
  y: number;
  textAnchor: "start" | "middle" | "end";
  dominantBaseline: "auto" | "hanging" | "central";
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * Builds SVG-space bounding boxes for all placed components and CAD assets
 * so smart label placement can detect overlaps above/beside/below an asset.
 */
export function buildSvgObstacleBoxes(
  components: PlacedComponent[],
  cadAssets: CustomCadAsset[],
  toSvgX: (worldXMm: number) => number = (x) => x,
  toSvgY: (worldYMm: number) => number = (y) => -y
): SvgRect[] {
  const boxes: SvgRect[] = [];

  for (const c of components) {
    const dims = getRotatedDimensions(c.widthMm, c.heightMm, c.rotationDeg ?? 0);
    boxes.push({
      id: c.id,
      x: toSvgX(c.xMm - dims.widthMm / 2),
      y: toSvgY(c.yMm + dims.heightMm / 2),
      w: dims.widthMm,
      h: dims.heightMm,
    });
  }

  for (const a of cadAssets) {
    const eff = getEffectiveCadBounds(a);
    const rot = a.rotationDeg ?? 0;
    const dims = getRotatedDimensions(eff.widthMm, eff.heightMm, rot);
    const rotOffset = rotateLocalPoint(eff.offsetX, eff.offsetY, rot);
    const cx = a.xMm + rotOffset.xMm;
    const cy = a.yMm + rotOffset.yMm;
    boxes.push({
      id: a.id,
      x: toSvgX(cx - dims.widthMm / 2),
      y: toSvgY(cy + dims.heightMm / 2),
      w: dims.widthMm,
      h: dims.heightMm,
    });
  }

  return boxes;
}

export function formatCadDisplayLabel(name: string, maxLen = 36): string {
  const clean = name.trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 2)}…`;
}

/**
 * Computes smart CAD label coordinates in SVG space (Y down).
 * Shifts label to right or bottom if top area (effY - 12 .. effY) is cropped or occluded.
 */
export function getSmartCadLabelPosition(params: {
  assetId: string;
  effX: number;
  effY: number;
  effW: number;
  effH: number;
  cropMm?: CadCropMm;
  labelPosition?: CadLabelPosition;
  otherBoxes: SvgRect[];
}): SmartCadLabelResult {
  const {
    assetId,
    effX,
    effY,
    effW,
    effH,
    cropMm,
    labelPosition = "auto",
    otherBoxes,
  } = params;

  const makePos = (
    placement: "top" | "bottom" | "right" | "left"
  ): SmartCadLabelResult => {
    switch (placement) {
      case "right":
        return {
          placement: "right",
          x: effX + effW + 3,
          y: effY + 5,
          textAnchor: "start",
          dominantBaseline: "hanging",
        };
      case "bottom":
        return {
          placement: "bottom",
          x: effX + 2,
          y: effY + effH + 5,
          textAnchor: "start",
          dominantBaseline: "hanging",
        };
      case "left":
        return {
          placement: "left",
          x: effX - 3,
          y: effY + 5,
          textAnchor: "end",
          dominantBaseline: "hanging",
        };
      case "top":
      default:
        return {
          placement: "top",
          x: effX + 2,
          y: effY - 3,
          textAnchor: "start",
          dominantBaseline: "auto",
        };
    }
  };

  if (labelPosition !== "auto") {
    return makePos(labelPosition);
  }

  const obstacles = otherBoxes.filter((b) => b.id !== assetId);

  const topCropped = (cropMm?.top ?? 0) > 0;
  const topZone = {
    x: effX,
    y: effY - 12,
    w: Math.max(effW, 24),
    h: 12,
  };
  const topOccluded = obstacles.some((b) => rectsOverlap(topZone, b));

  if (!topCropped && !topOccluded) {
    return makePos("top");
  }

  const rightZone = {
    x: effX + effW + 1,
    y: effY,
    w: 28,
    h: Math.max(effH, 10),
  };
  const rightOccluded = obstacles.some((b) => rectsOverlap(rightZone, b));
  if (!rightOccluded) {
    return makePos("right");
  }

  const bottomZone = {
    x: effX,
    y: effY + effH + 1,
    w: Math.max(effW, 24),
    h: 12,
  };
  const bottomOccluded = obstacles.some((b) => rectsOverlap(bottomZone, b));
  if (!bottomOccluded) {
    return makePos("bottom");
  }

  const leftZone = {
    x: effX - 29,
    y: effY,
    w: 28,
    h: Math.max(effH, 10),
  };
  const leftOccluded = obstacles.some((b) => rectsOverlap(leftZone, b));
  if (!leftOccluded) {
    return makePos("left");
  }

  return makePos("right");
}

export interface ComponentTagPlacement {
  x: number;
  y: number;
  placement: "top" | "bottom" | "inside";
  fontSize: number;
  pillWidth: number;
  pillHeight: number;
  text: string;
}

/**
 * Computes a clean, high-readability tag badge position for a PlacedComponent in SVG space.
 * Avoids overlapping adjacent obstacles and keeps text legible even on narrow 6.2mm terminals.
 */
export function getComponentTagPlacement(params: {
  comp: PlacedComponent;
  x: number;
  y: number;
  otherBoxes: SvgRect[];
}): ComponentTagPlacement {
  const { comp, x, y, otherBoxes } = params;
  const w = comp.widthMm;
  const h = comp.heightMm;
  const cx = x + w / 2;
  const text = formatCadDisplayLabel(comp.name, 16);

  const fontSize = w < 14 ? 3.2 : w < 30 ? 3.8 : 4.4;
  const pillHeight = fontSize + 2.6;
  const pillWidth = Math.max(10, text.length * fontSize * 0.62 + 4.4);

  const obstacles = otherBoxes.filter((b) => b.id !== comp.id);

  // Explicit override
  if (comp.labelPosition === "bottom") {
    return {
      x: cx,
      y: y + h + pillHeight / 2 + 2.5,
      placement: "bottom",
      fontSize,
      pillWidth,
      pillHeight,
      text,
    };
  }
  if (comp.labelPosition === "top") {
    return {
      x: cx,
      y: y - pillHeight / 2 - 2.5,
      placement: "top",
      fontSize,
      pillWidth,
      pillHeight,
      text,
    };
  }

  // Try top above component first (standard IEC CAD callout)
  const topRect = {
    x: cx - pillWidth / 2,
    y: y - pillHeight - 2.5,
    w: pillWidth,
    h: pillHeight,
  };
  const topOccluded = obstacles.some((b) => rectsOverlap(topRect, b));
  if (!topOccluded) {
    return {
      x: cx,
      y: y - pillHeight / 2 - 2.5,
      placement: "top",
      fontSize,
      pillWidth,
      pillHeight,
      text,
    };
  }

  // Fallback to bottom below component
  const botRect = {
    x: cx - pillWidth / 2,
    y: y + h + 2.5,
    w: pillWidth,
    h: pillHeight,
  };
  const botOccluded = obstacles.some((b) => rectsOverlap(botRect, b));
  if (!botOccluded) {
    return {
      x: cx,
      y: y + h + pillHeight / 2 + 2.5,
      placement: "bottom",
      fontSize,
      pillWidth,
      pillHeight,
      text,
    };
  }

  // Final fallback: centered inside body
  return {
    x: cx,
    y: y + h / 2,
    placement: "inside",
    fontSize: Math.min(fontSize, 3.8),
    pillWidth,
    pillHeight,
    text,
  };
}

export interface SmartPinLabelLayout {
  x: number;
  y: number;
  textAnchor: "start" | "middle" | "end";
  dominantBaseline: "auto" | "hanging" | "central";
  fontSize: number;
}

/**
 * Computes non-overlapping pin label placement in SVG space (Y down).
 * Top-row pins place labels centered above/inside; bottom-row pins place labels centered below/inside;
 * tightly spaced pins (< 11mm apart horizontally) alternate vertical offsets so labels never collide.
 */
export function getSmartPinLabelLayout(
  comp: PlacedComponent,
  pin: PlacedComponent["pins"][number],
  pinIndex: number
): SmartPinLabelLayout {
  const px = comp.xMm + pin.localXMm;
  const py = -(comp.yMm + pin.localYMm);

  // Check nearest horizontal neighbor in the same row (within 6mm vertically)
  let minHorizGap = Infinity;
  for (let i = 0; i < comp.pins.length; i++) {
    if (i === pinIndex) continue;
    const other = comp.pins[i];
    if (Math.abs(other.localYMm - pin.localYMm) <= 6) {
      minHorizGap = Math.min(minHorizGap, Math.abs(other.localXMm - pin.localXMm));
    }
  }

  const isTight = minHorizGap < 11 || comp.widthMm < 14;
  const fontSize = isTight ? 2.4 : 2.9;
  const stagger = isTight && pinIndex % 2 === 1 ? 3.2 : 0;

  if (pin.localYMm > 2) {
    // Top-side terminal: place label cleanly below the pin dot (inside terminal bay)
    return {
      x: px,
      y: py + 3.4 + stagger,
      textAnchor: "middle",
      dominantBaseline: "hanging",
      fontSize,
    };
  }

  if (pin.localYMm < -2) {
    // Bottom-side terminal: place label cleanly above the pin dot (inside terminal bay)
    return {
      x: px,
      y: py - 3.4 - stagger,
      textAnchor: "middle",
      dominantBaseline: "auto",
      fontSize,
    };
  }

  // Center-row pins (e.g. Pilot Lamps X1 / X2)
  if (pin.localXMm < 0) {
    return {
      x: px - 2.6,
      y: py,
      textAnchor: "end",
      dominantBaseline: "central",
      fontSize,
    };
  }
  return {
    x: px + 2.6,
    y: py,
    textAnchor: "start",
    dominantBaseline: "central",
    fontSize,
  };
}
