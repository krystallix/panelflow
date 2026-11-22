import { getEffectiveCadBounds } from "@/lib/collision";
import { DIN_RAIL_HEIGHT_MM, getRotatedDimensions } from "@/lib/snap";
import type {
  CustomCadAsset,
  DinRail,
  PlacedComponent,
  WireDuct,
} from "@/types/panel";

export type PlateAlignEdge = "top" | "bottom" | "left" | "right";
export type RailAlignEdge = "left" | "center" | "right";

interface RectBox {
  id: string;
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export function computeAlignToPlatePosition(
  itemWidthMm: number,
  itemHeightMm: number,
  currentXMm: number,
  currentYMm: number,
  plateWidthMm: number,
  plateHeightMm: number,
  edge: PlateAlignEdge
): { xMm: number; yMm: number } {
  switch (edge) {
    case "top":
      return { xMm: currentXMm, yMm: plateHeightMm / 2 - itemHeightMm / 2 };
    case "bottom":
      return { xMm: currentXMm, yMm: -plateHeightMm / 2 + itemHeightMm / 2 };
    case "left":
      return { xMm: -plateWidthMm / 2 + itemWidthMm / 2, yMm: currentYMm };
    case "right":
      return { xMm: plateWidthMm / 2 - itemWidthMm / 2, yMm: currentYMm };
  }
}

export function computeAlignToRailX(
  compWidthMm: number,
  rail: Pick<DinRail, "xMm" | "lengthMm">,
  edge: RailAlignEdge
): number {
  switch (edge) {
    case "left":
      return rail.xMm - rail.lengthMm / 2 + compWidthMm / 2;
    case "center":
      return rail.xMm;
    case "right":
      return rail.xMm + rail.lengthMm / 2 - compWidthMm / 2;
  }
}

function collectObstacleBoxes(
  excludeId: string,
  excludeRailComponentsId: string | null,
  rails: DinRail[],
  ducts: WireDuct[],
  components: PlacedComponent[],
  cadAssets: CustomCadAsset[]
): RectBox[] {
  const boxes: RectBox[] = [];

  for (const r of rails) {
    if (r.id === excludeId) continue;
    boxes.push({
      id: r.id,
      left: r.xMm - r.lengthMm / 2,
      right: r.xMm + r.lengthMm / 2,
      bottom: r.yMm - DIN_RAIL_HEIGHT_MM / 2,
      top: r.yMm + DIN_RAIL_HEIGHT_MM / 2,
    });
  }

  for (const d of ducts) {
    if (d.id === excludeId) continue;
    boxes.push({
      id: d.id,
      left: d.xMm - d.widthMm / 2,
      right: d.xMm + d.widthMm / 2,
      bottom: d.yMm - d.heightMm / 2,
      top: d.yMm + d.heightMm / 2,
    });
  }

  for (const c of components) {
    if (c.id === excludeId) continue;
    if (excludeRailComponentsId && c.railId === excludeRailComponentsId) continue;
    const { widthMm, heightMm } = getRotatedDimensions(
      c.widthMm,
      c.heightMm,
      c.rotationDeg
    );
    boxes.push({
      id: c.id,
      left: c.xMm - widthMm / 2,
      right: c.xMm + widthMm / 2,
      bottom: c.yMm - heightMm / 2,
      top: c.yMm + heightMm / 2,
    });
  }

  for (const a of cadAssets) {
    if (a.id === excludeId) continue;
    const bounds = getEffectiveCadBounds(a);
    const { widthMm, heightMm } = getRotatedDimensions(
      bounds.widthMm,
      bounds.heightMm,
      a.rotationDeg
    );
    const cx = a.xMm + bounds.offsetX;
    const cy = a.yMm + bounds.offsetY;
    boxes.push({
      id: a.id,
      left: cx - widthMm / 2,
      right: cx + widthMm / 2,
      bottom: cy - heightMm / 2,
      top: cy + heightMm / 2,
    });
  }

  return boxes;
}

/**
 * Computes auto-fit horizontal span (xMm, widthMm) for a DIN rail or horizontal wire duct,
 * expanding to mounting plate edges or stopping cleanly at adjacent vertical obstacles.
 */
export function computeAutoResizeWidth(params: {
  targetId: string;
  targetKind: "rail" | "duct";
  anchorXMm: number;
  yMm: number;
  bandHeightMm: number;
  plateWidthMm: number;
  rails: DinRail[];
  ducts: WireDuct[];
  components: PlacedComponent[];
  cadAssets: CustomCadAsset[];
}): { xMm: number; widthMm: number } {
  const {
    targetId,
    targetKind,
    anchorXMm,
    yMm,
    bandHeightMm,
    plateWidthMm,
    rails,
    ducts,
    components,
    cadAssets,
  } = params;

  const yMin = yMm - bandHeightMm / 2;
  const yMax = yMm + bandHeightMm / 2;
  let leftBound = -plateWidthMm / 2;
  let rightBound = plateWidthMm / 2;

  const obstacles = collectObstacleBoxes(
    targetId,
    targetKind === "rail" ? targetId : null,
    rails,
    ducts,
    components,
    cadAssets
  );

  for (const obs of obstacles) {
    const overlapsY = obs.top > yMin + 0.5 && obs.bottom < yMax - 0.5;
    if (!overlapsY) continue;

    const obsCenterX = (obs.left + obs.right) / 2;
    if (obs.right <= anchorXMm + 0.5 || obsCenterX < anchorXMm) {
      if (obs.right <= anchorXMm + 5) {
        leftBound = Math.max(leftBound, obs.right);
      }
    }
    if (obs.left >= anchorXMm - 0.5 || obsCenterX > anchorXMm) {
      if (obs.left >= anchorXMm - 5) {
        rightBound = Math.min(rightBound, obs.left);
      }
    }
  }

  if (rightBound - leftBound < 20) {
    return { xMm: anchorXMm, widthMm: Math.max(20, rightBound - leftBound) };
  }

  return {
    xMm: Number(((leftBound + rightBound) / 2).toFixed(2)),
    widthMm: Math.round(rightBound - leftBound),
  };
}

/**
 * Computes auto-fit vertical span (yMm, heightMm) for a vertical wire duct.
 */
export function computeAutoResizeHeight(params: {
  targetId: string;
  xMm: number;
  anchorYMm: number;
  bandWidthMm: number;
  plateHeightMm: number;
  rails: DinRail[];
  ducts: WireDuct[];
  components: PlacedComponent[];
  cadAssets: CustomCadAsset[];
}): { yMm: number; heightMm: number } {
  const {
    targetId,
    xMm,
    anchorYMm,
    bandWidthMm,
    plateHeightMm,
    rails,
    ducts,
    components,
    cadAssets,
  } = params;

  const xMin = xMm - bandWidthMm / 2;
  const xMax = xMm + bandWidthMm / 2;
  let bottomBound = -plateHeightMm / 2;
  let topBound = plateHeightMm / 2;

  const obstacles = collectObstacleBoxes(
    targetId,
    null,
    rails,
    ducts,
    components,
    cadAssets
  );

  for (const obs of obstacles) {
    const overlapsX = obs.right > xMin + 0.5 && obs.left < xMax - 0.5;
    if (!overlapsX) continue;

    const obsCenterY = (obs.bottom + obs.top) / 2;
    if (obs.top <= anchorYMm + 0.5 || obsCenterY < anchorYMm) {
      if (obs.top <= anchorYMm + 5) {
        bottomBound = Math.max(bottomBound, obs.top);
      }
    }
    if (obs.bottom >= anchorYMm - 0.5 || obsCenterY > anchorYMm) {
      if (obs.bottom >= anchorYMm - 5) {
        topBound = Math.min(topBound, obs.bottom);
      }
    }
  }

  if (topBound - bottomBound < 20) {
    return { yMm: anchorYMm, heightMm: Math.max(20, topBound - bottomBound) };
  }

  return {
    yMm: Number(((bottomBound + topBound) / 2).toFixed(2)),
    heightMm: Math.round(topBound - bottomBound),
  };
}
