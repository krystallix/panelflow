import type { DinRail, GridSnapMm, RotationDeg, WireDuct } from "@/types/panel";

export const DIN_RAIL_HEIGHT_MM = 35;
export const DIN_RAIL_DEPTH_MM = 7.5;

export function rotateLocalPoint(
  localXMm: number,
  localYMm: number,
  rotationDeg: RotationDeg = 0
): { xMm: number; yMm: number } {
  const deg = ((rotationDeg % 360) + 360) % 360;
  if (deg === 90) return { xMm: localYMm, yMm: -localXMm };
  if (deg === 180) return { xMm: -localXMm, yMm: -localYMm };
  if (deg === 270) return { xMm: -localYMm, yMm: localXMm };
  return { xMm: localXMm, yMm: localYMm };
}

export function getRotatedDimensions(
  widthMm: number,
  heightMm: number,
  rotationDeg: RotationDeg = 0
): { widthMm: number; heightMm: number } {
  const deg = ((rotationDeg % 360) + 360) % 360;
  if (deg === 90 || deg === 270) {
    return { widthMm: heightMm, heightMm: widthMm };
  }
  return { widthMm, heightMm };
}

export function snapToGrid(valueMm: number, gridMm: GridSnapMm): number {
  if (!Number.isFinite(valueMm) || gridMm <= 0) return 0;
  return Math.round(valueMm / gridMm) * gridMm;
}

export function snapPointToGrid(
  xMm: number,
  yMm: number,
  gridMm: GridSnapMm
): { xMm: number; yMm: number } {
  return {
    xMm: snapToGrid(xMm, gridMm),
    yMm: snapToGrid(yMm, gridMm),
  };
}

export function clampToBackplate(
  xMm: number,
  yMm: number,
  itemWidthMm: number,
  itemHeightMm: number,
  backplateWidthMm: number,
  backplateHeightMm: number
): { xMm: number; yMm: number } {
  const halfW = Math.max(0, backplateWidthMm / 2 - itemWidthMm / 2);
  const halfH = Math.max(0, backplateHeightMm / 2 - itemHeightMm / 2);
  return {
    xMm: Math.max(-halfW, Math.min(halfW, xMm)),
    yMm: Math.max(-halfH, Math.min(halfH, yMm)),
  };
}

export interface RailSnapResult {
  railId: string | null;
  xMm: number;
  yMm: number;
  zMm: number;
  snappedToRail: boolean;
}

export function snapComponentToNearestRail(
  xMm: number,
  yMm: number,
  compWidthMm: number,
  compDepthMm: number,
  rails: DinRail[],
  gridMm: GridSnapMm,
  maxSnapDistanceMm = Infinity
): RailSnapResult {
  if (rails.length === 0) {
    return {
      railId: null,
      xMm: snapToGrid(xMm, gridMm),
      yMm: snapToGrid(yMm, gridMm),
      zMm: compDepthMm / 2,
      snappedToRail: false,
    };
  }

  let bestRail: DinRail | null = null;
  let bestScore = Infinity;

  for (const rail of rails) {
    const dy = Math.abs(yMm - rail.yMm);
    if (dy > maxSnapDistanceMm) continue;
    const dxOutside = Math.max(0, Math.abs(xMm - rail.xMm) - rail.lengthMm / 2);
    const score = dy + dxOutside * 0.25;
    if (score < bestScore) {
      bestScore = score;
      bestRail = rail;
    }
  }

  if (!bestRail) {
    return {
      railId: null,
      xMm: snapToGrid(xMm, gridMm),
      yMm: snapToGrid(yMm, gridMm),
      zMm: compDepthMm / 2,
      snappedToRail: false,
    };
  }

  const minX = bestRail.xMm - bestRail.lengthMm / 2 + compWidthMm / 2;
  const maxX = bestRail.xMm + bestRail.lengthMm / 2 - compWidthMm / 2;
  const snappedX = snapToGrid(xMm, gridMm);
  const clampedX =
    minX <= maxX ? Math.max(minX, Math.min(maxX, snappedX)) : bestRail.xMm;

  return {
    railId: bestRail.id,
    xMm: clampedX,
    yMm: bestRail.yMm,
    zMm: DIN_RAIL_DEPTH_MM + compDepthMm / 2,
    snappedToRail: true,
  };
}

/**
 * Magnetic 0mm side-by-side snapping for modular DIN rail components
 * (MCBs, SPD, Fuse, Terminal Blocks, End Clamps, Contactors, etc.).
 */
export function snapSideBySideOnRail(
  xMm: number,
  compWidthMm: number,
  railId: string | null,
  otherComponents: Array<{
    id: string;
    railId: string | null;
    xMm: number;
    widthMm: number;
    heightMm: number;
    rotationDeg?: RotationDeg;
  }>,
  selfId: string,
  railBounds?: { minX: number; maxX: number },
  thresholdMm = 7
): { xMm: number; snappedToNeighborId: string | null } {
  if (!railId) return { xMm, snappedToNeighborId: null };

  let bestX = xMm;
  let bestDist = thresholdMm;
  let snappedToNeighborId: string | null = null;

  for (const other of otherComponents) {
    if (other.id === selfId || other.railId !== railId) continue;
    const otherW = getRotatedDimensions(
      other.widthMm,
      other.heightMm,
      other.rotationDeg ?? 0
    ).widthMm;

    const rightCandidate = other.xMm + otherW / 2 + compWidthMm / 2;
    const leftCandidate = other.xMm - otherW / 2 - compWidthMm / 2;

    const distRight = Math.abs(xMm - rightCandidate);
    if (distRight <= bestDist) {
      const clamped = railBounds
        ? Math.max(railBounds.minX, Math.min(railBounds.maxX, rightCandidate))
        : rightCandidate;
      if (Math.abs(clamped - rightCandidate) < 0.01) {
        bestDist = distRight;
        bestX = rightCandidate;
        snappedToNeighborId = other.id;
      }
    }

    const distLeft = Math.abs(xMm - leftCandidate);
    if (distLeft <= bestDist) {
      const clamped = railBounds
        ? Math.max(railBounds.minX, Math.min(railBounds.maxX, leftCandidate))
        : leftCandidate;
      if (Math.abs(clamped - leftCandidate) < 0.01) {
        bestDist = distLeft;
        bestX = leftCandidate;
        snappedToNeighborId = other.id;
      }
    }
  }

  return { xMm: bestX, snappedToNeighborId };
}

const DUCT_EPSILON_MM = 0.05;

/**
 * Returns true if a component bounding box at (xMm, yMm) overlaps any WireDuct.
 */
export function overlapsAnyDuct(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  ducts: WireDuct[]
): boolean {
  for (const d of ducts) {
    const overlapX =
      Math.abs(xMm - d.xMm) < (widthMm + d.widthMm) / 2 - DUCT_EPSILON_MM;
    const overlapY =
      Math.abs(yMm - d.yMm) < (heightMm + d.heightMm) / 2 - DUCT_EPSILON_MM;
    if (overlapX && overlapY) return true;
  }
  return false;
}

/**
 * Clamps a desired X position along a DIN rail so the component stays strictly
 * inside the rail AND never overlaps any WireDuct.
 * Returns null if the entire rail is blocked by ducts for this component size.
 */
export function clampToDuctFreeRailX(
  targetXMm: number,
  rail: DinRail,
  compWidthMm: number,
  compHeightMm: number,
  ducts: WireDuct[]
): number | null {
  const railMinX = rail.xMm - rail.lengthMm / 2 + compWidthMm / 2;
  const railMaxX = rail.xMm + rail.lengthMm / 2 - compWidthMm / 2;
  if (railMinX > railMaxX + DUCT_EPSILON_MM) return null;

  let intervals: Array<[number, number]> = [[railMinX, railMaxX]];

  for (const duct of ducts) {
    // Horizontal ducts above/below a DIN rail only block the rail if they actually
    // overlap the 35mm DIN rail strip itself; vertical ducts cross the rail and block full component width.
    const effectiveCompH =
      duct.orientation === "horizontal" ? DIN_RAIL_HEIGHT_MM : compHeightMm;
    const overlapY =
      Math.abs(rail.yMm - duct.yMm) <
      (effectiveCompH + duct.heightMm) / 2 - DUCT_EPSILON_MM;
    if (!overlapY) continue;

    const forbidMin = duct.xMm - duct.widthMm / 2 - compWidthMm / 2;
    const forbidMax = duct.xMm + duct.widthMm / 2 + compWidthMm / 2;

    const nextIntervals: Array<[number, number]> = [];
    for (const [a, b] of intervals) {
      if (forbidMax <= a || forbidMin >= b) {
        nextIntervals.push([a, b]);
      } else {
        if (forbidMin > a + DUCT_EPSILON_MM) {
          nextIntervals.push([a, forbidMin]);
        }
        if (forbidMax < b - DUCT_EPSILON_MM) {
          nextIntervals.push([forbidMax, b]);
        }
      }
    }
    intervals = nextIntervals;
    if (intervals.length === 0) return null;
  }

  let bestX = intervals[0][0];
  let bestDist = Infinity;
  for (const [a, b] of intervals) {
    const clamped = Math.max(a, Math.min(b, targetXMm));
    const dist = Math.abs(targetXMm - clamped);
    if (dist < bestDist) {
      bestDist = dist;
      bestX = clamped;
    }
  }
  return bestX;
}

/**
 * Resolves a duct-free position on the backplate for screw_plate components.
 * If (targetXMm, targetYMm) overlaps a duct, pushes out to the nearest non-overlapping duct edge.
 */
export function resolveDuctFreePlatePosition(
  targetXMm: number,
  targetYMm: number,
  compWidthMm: number,
  compHeightMm: number,
  ducts: WireDuct[],
  fallback?: { xMm: number; yMm: number }
): { xMm: number; yMm: number } | null {
  if (!overlapsAnyDuct(targetXMm, targetYMm, compWidthMm, compHeightMm, ducts)) {
    return { xMm: targetXMm, yMm: targetYMm };
  }

  const candidates: Array<{ xMm: number; yMm: number }> = [];
  for (const d of ducts) {
    const overlapX =
      Math.abs(targetXMm - d.xMm) < (compWidthMm + d.widthMm) / 2 - DUCT_EPSILON_MM;
    const overlapY =
      Math.abs(targetYMm - d.yMm) < (compHeightMm + d.heightMm) / 2 - DUCT_EPSILON_MM;
    if (!overlapX || !overlapY) continue;

    candidates.push(
      { xMm: d.xMm - d.widthMm / 2 - compWidthMm / 2, yMm: targetYMm },
      { xMm: d.xMm + d.widthMm / 2 + compWidthMm / 2, yMm: targetYMm },
      { xMm: targetXMm, yMm: d.yMm - d.heightMm / 2 - compHeightMm / 2 },
      { xMm: targetXMm, yMm: d.yMm + d.heightMm / 2 + compHeightMm / 2 }
    );
  }

  let best: { xMm: number; yMm: number } | null = null;
  let bestDist = Infinity;
  for (const cand of candidates) {
    if (overlapsAnyDuct(cand.xMm, cand.yMm, compWidthMm, compHeightMm, ducts)) {
      continue;
    }
    const dist = Math.hypot(cand.xMm - targetXMm, cand.yMm - targetYMm);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }

  if (best) return best;
  if (
    fallback &&
    !overlapsAnyDuct(fallback.xMm, fallback.yMm, compWidthMm, compHeightMm, ducts)
  ) {
    return fallback;
  }
  return null;
}
