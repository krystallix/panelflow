import type { CustomCadAsset, DinRail, PlacedComponent, WireDuct } from "@/types/panel";
import { getRotatedDimensions, rotateLocalPoint } from "./snap";

export interface WirePoint {
  x: number;
  y: number;
}

export type PinExitDirection = "up" | "down" | "left" | "right";

export interface WireObstacleBox {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface PinExitInfo {
  xMm: number;
  yMm: number;
  exitDir: PinExitDirection;
  stubPt: WirePoint;
  ownerId: string;
}

export interface DuctRouteOptions {
  startExitDir?: PinExitDirection;
  endExitDir?: PinExitDirection;
  startStubPt?: WirePoint;
  endStubPt?: WirePoint;
  obstacles?: WireObstacleBox[];
}

export function buildComponentObstacles(
  components: PlacedComponent[],
  cadAssets: CustomCadAsset[]
): WireObstacleBox[] {
  const out: WireObstacleBox[] = [];
  const inset = 1.5;
  for (const c of components) {
    if (c.mountingType === "door_cutout") continue;
    const dims = getRotatedDimensions(c.widthMm, c.heightMm, c.rotationDeg ?? 0);
    out.push({
      id: c.id,
      minX: c.xMm - dims.widthMm / 2 + inset,
      maxX: c.xMm + dims.widthMm / 2 - inset,
      minY: c.yMm - dims.heightMm / 2 + inset,
      maxY: c.yMm + dims.heightMm / 2 - inset,
    });
  }
  for (const a of cadAssets) {
    const dims = getRotatedDimensions(
      a.boundingBoxMm.w,
      a.boundingBoxMm.h,
      a.rotationDeg ?? 0
    );
    out.push({
      id: a.id,
      minX: a.xMm - dims.widthMm / 2 + inset,
      maxX: a.xMm + dims.widthMm / 2 - inset,
      minY: a.yMm - dims.heightMm / 2 + inset,
      maxY: a.yMm + dims.heightMm / 2 - inset,
    });
  }
  return out;
}

export function resolvePinExitInfo(
  components: PlacedComponent[],
  cadAssets: CustomCadAsset[],
  componentId: string,
  pinId: string
): PinExitInfo | null {
  const stubMargin = 5;
  const comp = components.find((c) => c.id === componentId);
  if (comp) {
    const pin = comp.pins.find((p) => p.id === pinId);
    if (!pin) return null;
    const rot = comp.rotationDeg ?? 0;
    const rotated = rotateLocalPoint(pin.localXMm, pin.localYMm, rot);
    const dims = getRotatedDimensions(comp.widthMm, comp.heightMm, rot);
    const xMm = Number((comp.xMm + rotated.xMm).toFixed(2));
    const yMm = Number((comp.yMm + rotated.yMm).toFixed(2));

    let exitDir: PinExitDirection;
    let stubPt: WirePoint;
    if (Math.abs(rotated.yMm) >= Math.abs(rotated.xMm)) {
      if (rotated.yMm >= 0) {
        exitDir = "up";
        stubPt = { x: xMm, y: Number((comp.yMm + dims.heightMm / 2 + stubMargin).toFixed(2)) };
      } else {
        exitDir = "down";
        stubPt = { x: xMm, y: Number((comp.yMm - dims.heightMm / 2 - stubMargin).toFixed(2)) };
      }
    } else if (rotated.xMm >= 0) {
      exitDir = "right";
      stubPt = { x: Number((comp.xMm + dims.widthMm / 2 + stubMargin).toFixed(2)), y: yMm };
    } else {
      exitDir = "left";
      stubPt = { x: Number((comp.xMm - dims.widthMm / 2 - stubMargin).toFixed(2)), y: yMm };
    }

    return { xMm, yMm, exitDir, stubPt, ownerId: comp.id };
  }

  const asset = cadAssets.find((a) => a.id === componentId);
  if (asset) {
    const pin = asset.pins.find((p) => p.id === pinId);
    if (!pin) return null;
    const rot = asset.rotationDeg ?? 0;
    const rotated = rotateLocalPoint(pin.localXMm, pin.localYMm, rot);
    const dims = getRotatedDimensions(asset.boundingBoxMm.w, asset.boundingBoxMm.h, rot);
    const xMm = Number((asset.xMm + rotated.xMm).toFixed(2));
    const yMm = Number((asset.yMm + rotated.yMm).toFixed(2));

    let exitDir: PinExitDirection;
    let stubPt: WirePoint;
    if (Math.abs(rotated.yMm) >= Math.abs(rotated.xMm)) {
      if (rotated.yMm >= 0) {
        exitDir = "up";
        stubPt = { x: xMm, y: Number((asset.yMm + dims.heightMm / 2 + stubMargin).toFixed(2)) };
      } else {
        exitDir = "down";
        stubPt = { x: xMm, y: Number((asset.yMm - dims.heightMm / 2 - stubMargin).toFixed(2)) };
      }
    } else if (rotated.xMm >= 0) {
      exitDir = "right";
      stubPt = { x: Number((asset.xMm + dims.widthMm / 2 + stubMargin).toFixed(2)), y: yMm };
    } else {
      exitDir = "left";
      stubPt = { x: Number((asset.xMm - dims.widthMm / 2 - stubMargin).toFixed(2)), y: yMm };
    }

    return { xMm, yMm, exitDir, stubPt, ownerId: asset.id };
  }

  return null;
}

function verticalSegmentHitsObstacle(
  x: number,
  y1: number,
  y2: number,
  obstacles: WireObstacleBox[]
): WireObstacleBox | null {
  const loY = Math.min(y1, y2);
  const hiY = Math.max(y1, y2);
  if (hiY - loY < 0.5) return null;
  for (const obs of obstacles) {
    if (x > obs.minX && x < obs.maxX && hiY > obs.minY && loY < obs.maxY) {
      return obs;
    }
  }
  return null;
}

function horizontalSegmentHitsObstacle(
  y: number,
  x1: number,
  x2: number,
  obstacles: WireObstacleBox[]
): WireObstacleBox | null {
  const loX = Math.min(x1, x2);
  const hiX = Math.max(x1, x2);
  if (hiX - loX < 0.5) return null;
  for (const obs of obstacles) {
    if (y > obs.minY && y < obs.maxY && hiX > obs.minX && loX < obs.maxX) {
      return obs;
    }
  }
  return null;
}

/**
 * Finds the nearest X coordinate that allows a vertical run from y1 to y2
 * without intersecting any component obstacle.
 */
function findClearVerticalX(
  desiredX: number,
  y1: number,
  y2: number,
  obstacles: WireObstacleBox[],
  minXBound = -Infinity,
  maxXBound = Infinity
): number {
  if (!verticalSegmentHitsObstacle(desiredX, y1, y2, obstacles)) {
    return desiredX;
  }

  const clearance = 6;
  const candidates: number[] = [];
  for (const obs of obstacles) {
    const leftX = obs.minX - clearance;
    const rightX = obs.maxX + clearance;
    if (leftX >= minXBound && leftX <= maxXBound) candidates.push(leftX);
    if (rightX >= minXBound && rightX <= maxXBound) candidates.push(rightX);
  }

  candidates.sort((a, b) => Math.abs(a - desiredX) - Math.abs(b - desiredX));
  // First pass: require BOTH the vertical channel AND the horizontal step at y1 to be clear
  for (const cx of candidates) {
    if (
      !verticalSegmentHitsObstacle(cx, y1, y2, obstacles) &&
      !horizontalSegmentHitsObstacle(y1, desiredX, cx, obstacles)
    ) {
      return Number(cx.toFixed(2));
    }
  }
  // Second pass: at minimum ensure the vertical channel is clear of component bodies
  for (const cx of candidates) {
    if (!verticalSegmentHitsObstacle(cx, y1, y2, obstacles)) {
      return Number(cx.toFixed(2));
    }
  }
  return desiredX;
}

/**
 * Picks the best entry/exit duct for a pin stub, preferring ducts on the pin's
 * natural exit side and penalizing paths that would cross through a component body.
 */
function pickBestDuctForPin(
  stubPt: WirePoint,
  exitDir: PinExitDirection | undefined,
  ducts: WireDuct[],
  obstacles: WireObstacleBox[]
): { duct: WireDuct; proj: { x: number; y: number; dist: number } } {
  let bestDuct = ducts[0];
  let bestProj = projectPointToDuctCenterline(stubPt, ducts[0]);
  let bestScore = Infinity;

  for (const d of ducts) {
    const proj = projectPointToDuctCenterline(stubPt, d);
    let score = proj.dist;

    if (exitDir === "up") {
      if (d.orientation === "horizontal" && d.yMm >= stubPt.y - 2) {
        // Ideal: horizontal duct directly above a top pin
        score *= 0.85;
      } else if (d.orientation === "horizontal" && d.yMm < stubPt.y - 2) {
        // Opposite side of component
        score += 220;
      } else if (d.orientation === "vertical") {
        // Prefer horizontal duct above over side vertical duct unless very close
        score += 45;
      }
    } else if (exitDir === "down") {
      if (d.orientation === "horizontal" && d.yMm <= stubPt.y + 2) {
        // Ideal: horizontal duct directly below a bottom pin
        score *= 0.85;
      } else if (d.orientation === "horizontal" && d.yMm > stubPt.y + 2) {
        // Opposite side of component
        score += 220;
      } else if (d.orientation === "vertical") {
        score += 45;
      }
    } else if (exitDir === "left") {
      if (d.orientation === "vertical" && d.xMm <= stubPt.x + 2) score *= 0.85;
      else if (d.orientation === "vertical" && d.xMm > stubPt.x + 2) score += 220;
    } else if (exitDir === "right") {
      if (d.orientation === "vertical" && d.xMm >= stubPt.x - 2) score *= 0.85;
      else if (d.orientation === "vertical" && d.xMm < stubPt.x - 2) score += 220;
    }

    // Penalize if the direct orthogonal entry into this duct hits a component body
    if (obstacles.length > 0) {
      if (d.orientation === "horizontal") {
        if (verticalSegmentHitsObstacle(proj.x, stubPt.y, proj.y, obstacles)) {
          score += 140;
        }
      } else {
        if (horizontalSegmentHitsObstacle(proj.y, stubPt.x, proj.x, obstacles)) {
          score += 140;
        }
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestDuct = d;
      bestProj = proj;
    }
  }

  return { duct: bestDuct, proj: bestProj };
}

export function resolvePinWorldPoint(
  components: PlacedComponent[],
  cadAssets: CustomCadAsset[],
  componentId: string,
  pinId: string
): { xMm: number; yMm: number } | null {
  const comp = components.find((c) => c.id === componentId);
  if (comp) {
    const pin = comp.pins.find((p) => p.id === pinId);
    if (!pin) return null;
    const rotated = rotateLocalPoint(pin.localXMm, pin.localYMm, comp.rotationDeg ?? 0);
    return {
      xMm: Number((comp.xMm + rotated.xMm).toFixed(2)),
      yMm: Number((comp.yMm + rotated.yMm).toFixed(2)),
    };
  }
  const asset = cadAssets.find((a) => a.id === componentId);
  if (asset) {
    const pin = asset.pins.find((p) => p.id === pinId);
    if (!pin) return null;
    const rotated = rotateLocalPoint(pin.localXMm, pin.localYMm, asset.rotationDeg ?? 0);
    return {
      xMm: Number((asset.xMm + rotated.xMm).toFixed(2)),
      yMm: Number((asset.yMm + rotated.yMm).toFixed(2)),
    };
  }
  return null;
}

export type RoutingPreference = "horizontal-first" | "vertical-first" | "direct";

export function routeOrthogonalWire(
  from: WirePoint,
  to: WirePoint,
  preference: RoutingPreference = "horizontal-first"
): WirePoint[] {
  // If sharing exact same coordinate on an axis, straight line
  if (Math.abs(from.x - to.x) < 0.001 || Math.abs(from.y - to.y) < 0.001) {
    return [
      { x: Number(from.x.toFixed(2)), y: Number(from.y.toFixed(2)) },
      { x: Number(to.x.toFixed(2)), y: Number(to.y.toFixed(2)) },
    ];
  }

  if (preference === "direct") {
    return [
      { x: Number(from.x.toFixed(2)), y: Number(from.y.toFixed(2)) },
      { x: Number(to.x.toFixed(2)), y: Number(to.y.toFixed(2)) },
    ];
  }

  if (preference === "horizontal-first") {
    const midX = Number(((from.x + to.x) / 2).toFixed(2));
    return [
      { x: Number(from.x.toFixed(2)), y: Number(from.y.toFixed(2)) },
      { x: midX, y: Number(from.y.toFixed(2)) },
      { x: midX, y: Number(to.y.toFixed(2)) },
      { x: Number(to.x.toFixed(2)), y: Number(to.y.toFixed(2)) },
    ];
  }

  const midY = Number(((from.y + to.y) / 2).toFixed(2));
  return [
    { x: Number(from.x.toFixed(2)), y: Number(from.y.toFixed(2)) },
    { x: Number(from.x.toFixed(2)), y: midY },
    { x: Number(to.x.toFixed(2)), y: midY },
    { x: Number(to.x.toFixed(2)), y: Number(to.y.toFixed(2)) },
  ];
}

/**
 * Checks if a point (px, py) is strictly or nearly inside a duct bounds.
 */
function isPointInDuct(px: number, py: number, duct: WireDuct, margin = 2): boolean {
  const halfW = duct.widthMm / 2 + margin;
  const halfH = duct.heightMm / 2 + margin;
  return (
    px >= duct.xMm - halfW &&
    px <= duct.xMm + halfW &&
    py >= duct.yMm - halfH &&
    py <= duct.yMm + halfH
  );
}

/**
 * Projects a point onto duct centerline segment.
 */
function projectPointToDuctCenterline(
  pt: WirePoint,
  duct: WireDuct
): { x: number; y: number; dist: number } {
  if (duct.orientation === "horizontal") {
    const halfW = duct.widthMm / 2;
    const clampedX = Math.max(duct.xMm - halfW, Math.min(duct.xMm + halfW, pt.x));
    const cy = duct.yMm;
    const dist = Math.hypot(pt.x - clampedX, pt.y - cy);
    return { x: clampedX, y: cy, dist };
  } else {
    const halfH = duct.heightMm / 2;
    const clampedY = Math.max(duct.yMm - halfH, Math.min(duct.yMm + halfH, pt.y));
    const cx = duct.xMm;
    const dist = Math.hypot(pt.x - cx, pt.y - clampedY);
    return { x: cx, y: clampedY, dist };
  }
}

/**
 * Finds the intersection point between two wire ducts if they overlap or cross.
 */
function getDuctsIntersection(d1: WireDuct, d2: WireDuct): WirePoint | null {
  if (d1.orientation === d2.orientation) {
    // Both horizontal or both vertical
    if (d1.orientation === "horizontal") {
      if (Math.abs(d1.yMm - d2.yMm) > 2) return null;
      // Overlapping horizontal ducts
      const minX1 = d1.xMm - d1.widthMm / 2;
      const maxX1 = d1.xMm + d1.widthMm / 2;
      const minX2 = d2.xMm - d2.widthMm / 2;
      const maxX2 = d2.xMm + d2.widthMm / 2;
      const overlapStart = Math.max(minX1, minX2);
      const overlapEnd = Math.min(maxX1, maxX2);
      if (overlapEnd >= overlapStart) {
        return { x: (overlapStart + overlapEnd) / 2, y: d1.yMm };
      }
    } else {
      if (Math.abs(d1.xMm - d2.xMm) > 2) return null;
      const minY1 = d1.yMm - d1.heightMm / 2;
      const maxY1 = d1.yMm + d1.heightMm / 2;
      const minY2 = d2.yMm - d2.heightMm / 2;
      const maxY2 = d2.yMm + d2.heightMm / 2;
      const overlapStart = Math.max(minY1, minY2);
      const overlapEnd = Math.min(maxY1, maxY2);
      if (overlapEnd >= overlapStart) {
        return { x: d1.xMm, y: (overlapStart + overlapEnd) / 2 };
      }
    }
    return null;
  }

  // One horizontal, one vertical
  const hDuct = d1.orientation === "horizontal" ? d1 : d2;
  const vDuct = d1.orientation === "vertical" ? d1 : d2;

  const hMinX = hDuct.xMm - hDuct.widthMm / 2;
  const hMaxX = hDuct.xMm + hDuct.widthMm / 2;
  const vMinY = vDuct.yMm - vDuct.heightMm / 2;
  const vMaxY = vDuct.yMm + vDuct.heightMm / 2;

  // Centerline intersection
  const crossX = vDuct.xMm;
  const crossY = hDuct.yMm;

  // Account for duct half-widths/half-heights so edge-touching or nearby T-junctions always connect
  const marginX = vDuct.widthMm / 2 + 15;
  const marginY = hDuct.heightMm / 2 + 15;
  if (
    crossX >= hMinX - marginX &&
    crossX <= hMaxX + marginX &&
    crossY >= vMinY - marginY &&
    crossY <= vMaxY + marginY
  ) {
    return { x: crossX, y: crossY };
  }

  return null;
}

/**
 * Graph node for duct pathfinding.
 */
interface DuctGraphNode {
  id: string;
  x: number;
  y: number;
  ductId: string;
  neighbors: Array<{ nodeId: string; cost: number }>;
}

/**
 * Builds a navigation graph from all wire ducts (centerline endpoints and cross intersections).
 */
function buildDuctGraph(ducts: WireDuct[]): Map<string, DuctGraphNode> {
  const graph = new Map<string, DuctGraphNode>();

  const addNode = (id: string, x: number, y: number, ductId: string): DuctGraphNode => {
    let node = graph.get(id);
    if (!node) {
      node = { id, x, y, ductId, neighbors: [] };
      graph.set(id, node);
    }
    return node;
  };

  const addEdge = (n1: DuctGraphNode, n2: DuctGraphNode) => {
    const cost = Math.hypot(n1.x - n2.x, n1.y - n2.y);
    if (!n1.neighbors.some((nbr) => nbr.nodeId === n2.id)) {
      n1.neighbors.push({ nodeId: n2.id, cost });
    }
    if (!n2.neighbors.some((nbr) => nbr.nodeId === n1.id)) {
      n2.neighbors.push({ nodeId: n1.id, cost });
    }
  };

  // For each duct, collect critical nodes along its centerline
  for (let i = 0; i < ducts.length; i++) {
    const d = ducts[i];
    const ductNodes: DuctGraphNode[] = [];

    // Endpoints
    if (d.orientation === "horizontal") {
      const x1 = d.xMm - d.widthMm / 2;
      const x2 = d.xMm + d.widthMm / 2;
      ductNodes.push(addNode(`${d.id}:end-0`, x1, d.yMm, d.id));
      ductNodes.push(addNode(`${d.id}:end-1`, x2, d.yMm, d.id));
    } else {
      const y1 = d.yMm - d.heightMm / 2;
      const y2 = d.yMm + d.heightMm / 2;
      ductNodes.push(addNode(`${d.id}:end-0`, d.xMm, y1, d.id));
      ductNodes.push(addNode(`${d.id}:end-1`, d.xMm, y2, d.id));
    }

    // Intersections with other ducts
    for (let j = 0; j < ducts.length; j++) {
      if (i === j) continue;
      const inter = getDuctsIntersection(d, ducts[j]);
      if (inter) {
        const interNodeId = `inter:${Math.min(i, j)}-${Math.max(i, j)}:${inter.x.toFixed(1)},${inter.y.toFixed(1)}`;
        const interNode = addNode(interNodeId, inter.x, inter.y, d.id);
        ductNodes.push(interNode);
      }
    }

    // Sort nodes along centerline and link adjacent nodes
    if (d.orientation === "horizontal") {
      ductNodes.sort((a, b) => a.x - b.x);
    } else {
      ductNodes.sort((a, b) => a.y - b.y);
    }

    // Connect sequential points along this duct
    for (let k = 0; k < ductNodes.length - 1; k++) {
      addEdge(ductNodes[k], ductNodes[k + 1]);
    }
  }

  return graph;
}

/**
 * Finds shortest path between two points in the duct network using Dijkstra / A*.
 */
function findShortestDuctPath(
  startPt: WirePoint,
  endPt: WirePoint,
  startDuct: WireDuct,
  endDuct: WireDuct,
  ducts: WireDuct[]
): WirePoint[] {
  // If start and end are in the same duct
  if (startDuct.id === endDuct.id) {
    if (startDuct.orientation === "horizontal") {
      return [
        { x: startPt.x, y: startDuct.yMm },
        { x: endPt.x, y: startDuct.yMm },
      ];
    } else {
      return [
        { x: startDuct.xMm, y: startPt.y },
        { x: startDuct.xMm, y: endPt.y },
      ];
    }
  }

  const graph = buildDuctGraph(ducts);

  // Inject start entry node into graph
  const startProj = projectPointToDuctCenterline(startPt, startDuct);
  const startNode: DuctGraphNode = {
    id: "temp:start",
    x: startProj.x,
    y: startProj.y,
    ductId: startDuct.id,
    neighbors: [],
  };
  graph.set(startNode.id, startNode);

  // Link startNode to all nodes on startDuct
  for (const node of Array.from(graph.values())) {
    if (node.id !== "temp:start" && (node.ductId === startDuct.id || node.id.startsWith("inter:"))) {
      // Check if node is roughly colinear on startDuct
      const proj = projectPointToDuctCenterline({ x: node.x, y: node.y }, startDuct);
      if (proj.dist < 5) {
        const cost = Math.hypot(startNode.x - node.x, startNode.y - node.y);
        startNode.neighbors.push({ nodeId: node.id, cost });
        node.neighbors.push({ nodeId: startNode.id, cost });
      }
    }
  }

  // Inject end exit node into graph
  const endProj = projectPointToDuctCenterline(endPt, endDuct);
  const endNode: DuctGraphNode = {
    id: "temp:end",
    x: endProj.x,
    y: endProj.y,
    ductId: endDuct.id,
    neighbors: [],
  };
  graph.set(endNode.id, endNode);

  // Link endNode to all nodes on endDuct
  for (const node of Array.from(graph.values())) {
    if (node.id !== "temp:end" && (node.ductId === endDuct.id || node.id.startsWith("inter:"))) {
      const proj = projectPointToDuctCenterline({ x: node.x, y: node.y }, endDuct);
      if (proj.dist < 5) {
        const cost = Math.hypot(endNode.x - node.x, endNode.y - node.y);
        endNode.neighbors.push({ nodeId: node.id, cost });
        node.neighbors.push({ nodeId: endNode.id, cost });
      }
    }
  }

  // Dijkstra / A*
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const visited = new Set<string>();

  distances.set("temp:start", 0);

  while (visited.size < graph.size) {
    let currentId: string | null = null;
    let shortest = Infinity;

    for (const [nodeId, dist] of Array.from(distances.entries())) {
      if (!visited.has(nodeId) && dist < shortest) {
        shortest = dist;
        currentId = nodeId;
      }
    }

    if (!currentId || shortest === Infinity) break;
    if (currentId === "temp:end") break;

    visited.add(currentId);
    const currNode = graph.get(currentId)!;

    for (const edge of currNode.neighbors) {
      if (visited.has(edge.nodeId)) continue;
      const alt = shortest + edge.cost;
      if (alt < (distances.get(edge.nodeId) ?? Infinity)) {
        distances.set(edge.nodeId, alt);
        previous.set(edge.nodeId, currentId);
      }
    }
  }

  if (!previous.has("temp:end")) {
    // No direct duct connected path found, fall back to startProj -> inter -> endProj
    return [
      { x: startProj.x, y: startProj.y },
      { x: endProj.x, y: endProj.y },
    ];
  }

  // Reconstruct path
  const path: WirePoint[] = [];
  let curr: string | undefined = "temp:end";
  while (curr) {
    const n = graph.get(curr);
    if (n) {
      path.unshift({ x: n.x, y: n.y });
    }
    curr = previous.get(curr);
  }

  return path;
}

/**
 * Simplifies and removes collinear points in orthogonal sequence.
 */
function simplifyOrthogonalPoints(points: WirePoint[]): WirePoint[] {
  if (points.length <= 2) return points;
  const res: WirePoint[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = res[res.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Check if duplicate point
    if (Math.abs(curr.x - prev.x) < 0.01 && Math.abs(curr.y - prev.y) < 0.01) {
      continue;
    }

    // Check if strictly collinear
    const isCollinearX = Math.abs(prev.x - curr.x) < 0.01 && Math.abs(curr.x - next.x) < 0.01;
    const isCollinearY = Math.abs(prev.y - curr.y) < 0.01 && Math.abs(curr.y - next.y) < 0.01;

    if (!isCollinearX && !isCollinearY) {
      res.push(curr);
    }
  }

  const last = points[points.length - 1];
  const prevLast = res[res.length - 1];
  if (Math.abs(last.x - prevLast.x) > 0.01 || Math.abs(last.y - prevLast.y) > 0.01) {
    res.push(last);
  }

  return res;
}

/**
 * Calculates lane bundle offset (+/- 2-4mm) based on wire offset index.
 * Even/Odd spreading: 0 -> 0, 1 -> +2.5, 2 -> -2.5, 3 -> +5, etc.
 */
export function calculateBundleLaneOffsetMm(offsetIndex = 0, stepMm = 2.5): number {
  if (offsetIndex === 0) return 0;
  const sign = offsetIndex % 2 === 1 ? 1 : -1;
  const level = Math.ceil(offsetIndex / 2);
  return sign * level * stepMm;
}

/**
 * Auto-routes wire through cable ducts using Manhattan / A* routing.
 *
 * @param startPt Pin origin coordinate {x, y}
 * @param endPt Pin destination coordinate {x, y}
 * @param ducts WireDuct[] on the board
 * @param rails DinRail[] (optional reference)
 * @param offsetIndex Index of wire in bundle for lane-offsetting (+/- 2.5mm)
 */
export function routeWireThroughDucts(
  startPt: WirePoint,
  endPt: WirePoint,
  ducts: WireDuct[] = [],
  rails: DinRail[] = [],
  offsetIndex = 0,
  options?: DuctRouteOptions
): WirePoint[] {
  // If no ducts present, fallback to standard orthogonal routing
  if (!ducts || ducts.length === 0) {
    return routeOrthogonalWire(startPt, endPt, "horizontal-first");
  }

  const obstacles = options?.obstacles ?? [];
  const startStub = options?.startStubPt ?? startPt;
  const endStub = options?.endStubPt ?? endPt;

  // Calculate lane offset (capped to max +/- 12mm to stay comfortably within 40-60mm ducts)
  const laneOffset = Math.max(-12, Math.min(12, calculateBundleLaneOffsetMm(offsetIndex, 2.5)));

  // Pick nearest direction-aware & obstacle-aware entry/exit ducts
  const startChoice = pickBestDuctForPin(startStub, options?.startExitDir, ducts, obstacles);
  const endChoice = pickBestDuctForPin(endStub, options?.endExitDir, ducts, obstacles);

  const bestStartDuct = startChoice.duct;
  const bestEndDuct = endChoice.duct;
  let startProj = { x: startChoice.proj.x, y: startChoice.proj.y };
  let endProj = { x: endChoice.proj.x, y: endChoice.proj.y };

  // If entry and exit ducts are too far (> 800mm), standard orthogonal
  if (startChoice.proj.dist > 800 || endChoice.proj.dist > 800) {
    return routeOrthogonalWire(startPt, endPt, "horizontal-first");
  }

  // Ensure vertical entry/exit into horizontal ducts avoids cutting through any component body
  if (obstacles.length > 0 && bestStartDuct.orientation === "horizontal") {
    const halfW = bestStartDuct.widthMm / 2;
    const clearX = findClearVerticalX(
      startProj.x,
      startStub.y,
      bestStartDuct.yMm + laneOffset,
      obstacles,
      bestStartDuct.xMm - halfW,
      bestStartDuct.xMm + halfW
    );
    startProj = { x: clearX, y: bestStartDuct.yMm };
  }
  if (obstacles.length > 0 && bestEndDuct.orientation === "horizontal") {
    const halfW = bestEndDuct.widthMm / 2;
    const clearX = findClearVerticalX(
      endProj.x,
      endStub.y,
      bestEndDuct.yMm + laneOffset,
      obstacles,
      bestEndDuct.xMm - halfW,
      bestEndDuct.xMm + halfW
    );
    endProj = { x: clearX, y: bestEndDuct.yMm };
  }

  // Step 1: Exit start pin straight out to stubPt (clears its own component body)
  const rawWaypoints: WirePoint[] = [{ x: startPt.x, y: startPt.y }];
  if (Math.hypot(startStub.x - startPt.x, startStub.y - startPt.y) > 0.1) {
    rawWaypoints.push({ x: startStub.x, y: startStub.y });
  }
  // If we shifted horizontally around an obstacle before entering a horizontal duct
  if (
    bestStartDuct.orientation === "horizontal" &&
    Math.abs(startProj.x - startStub.x) > 0.1
  ) {
    rawWaypoints.push({ x: startProj.x, y: startStub.y });
  }

  const ductPath = findShortestDuctPath(
    startProj,
    endProj,
    bestStartDuct,
    bestEndDuct,
    ducts
  );

  // Apply lane bundle offset along inside duct segments
  for (let i = 0; i < ductPath.length; i++) {
    const pt = ductPath[i];
    const parentDuct =
      (i === 0 ? bestStartDuct : i === ductPath.length - 1 ? bestEndDuct : null) ||
      ducts.find((d) => isPointInDuct(pt.x, pt.y, d, 8)) ||
      bestStartDuct;
    if (parentDuct.orientation === "horizontal") {
      rawWaypoints.push({
        x: pt.x,
        y: pt.y + laneOffset,
      });
    } else {
      rawWaypoints.push({
        x: pt.x + laneOffset,
        y: pt.y,
      });
    }
  }

  // Exit from destination duct to endStub, then straight into endPt
  if (
    bestEndDuct.orientation === "horizontal" &&
    Math.abs(endProj.x - endStub.x) > 0.1
  ) {
    rawWaypoints.push({ x: endProj.x, y: endStub.y });
  }
  if (Math.hypot(endStub.x - endPt.x, endStub.y - endPt.y) > 0.1) {
    rawWaypoints.push({ x: endStub.x, y: endStub.y });
  }
  rawWaypoints.push({ x: endPt.x, y: endPt.y });

  // Ensure every segment is strictly orthogonal (dx === 0 or dy === 0)
  const orthogonalWaypoints: WirePoint[] = [rawWaypoints[0]];
  for (let i = 0; i < rawWaypoints.length - 1; i++) {
    const a = orthogonalWaypoints[orthogonalWaypoints.length - 1];
    const b = rawWaypoints[i + 1];

    if (Math.abs(a.x - b.x) > 0.001 && Math.abs(a.y - b.y) > 0.001) {
      // Pick the corner that doesn't cut through a component obstacle
      const horizFirstCorner = { x: b.x, y: a.y };
      const vertFirstCorner = { x: a.x, y: b.y };
      const horizHits =
        obstacles.length > 0 &&
        (Boolean(horizontalSegmentHitsObstacle(a.y, a.x, b.x, obstacles)) ||
          Boolean(verticalSegmentHitsObstacle(b.x, a.y, b.y, obstacles)));
      const vertHits =
        obstacles.length > 0 &&
        (Boolean(verticalSegmentHitsObstacle(a.x, a.y, b.y, obstacles)) ||
          Boolean(horizontalSegmentHitsObstacle(b.y, a.x, b.x, obstacles)));

      orthogonalWaypoints.push(horizHits && !vertHits ? vertFirstCorner : horizFirstCorner);
    }
    orthogonalWaypoints.push(b);
  }

  const cleaned = simplifyOrthogonalPoints(orthogonalWaypoints).map((p) => ({
    x: Number(p.x.toFixed(2)),
    y: Number(p.y.toFixed(2)),
  }));

  return cleaned;
}

export const WIRE_GAUGES_MM2 = [
  "0.75",
  "1.0",
  "1.5",
  "2.5",
  "4.0",
  "6.0",
  "10.0",
  "16.0",
] as const;

const NYAF_OUTER_DIAMETER_MM: Record<string, number> = {
  "0.75": 2.4,
  "1": 2.7,
  "1.0": 2.7,
  "1.5": 3.0,
  "2.5": 3.7,
  "4": 4.4,
  "4.0": 4.4,
  "6": 5.2,
  "6.0": 5.2,
  "10": 6.5,
  "10.0": 6.5,
  "16": 8.0,
  "16.0": 8.0,
};

/**
 * Returns physical outer diameter (mm) for NYAF / flexible panel wire
 * based on conductor cross-section (mm²).
 */
export function getWireOuterDiameterMm(crossSectionMm2: number | string): number {
  const raw = String(crossSectionMm2).trim();
  if (raw in NYAF_OUTER_DIAMETER_MM) {
    return NYAF_OUTER_DIAMETER_MM[raw];
  }
  const area =
    typeof crossSectionMm2 === "number"
      ? crossSectionMm2
      : Number.parseFloat(raw);
  if (!Number.isFinite(area) || area <= 0) {
    return 3.0;
  }
  const normalized = area.toFixed(1);
  if (normalized in NYAF_OUTER_DIAMETER_MM) {
    return NYAF_OUTER_DIAMETER_MM[normalized];
  }
  // Realistic fallback: copper strand bundle diameter + insulation jacket (scales with conductor size)
  const conductorDia = 2 * Math.sqrt(area / Math.PI);
  const jacketThickness = 1.0 + conductorDia * 0.35;
  return Number((conductorDia + jacketThickness * 2).toFixed(2));
}

export function pointsToSvgPath(points: WirePoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(" ")}`;
}

export function pointsToRoundedSvgPath(
  points: WirePoint[],
  radiusMm = 4
): string {
  if (points.length === 0) return "";
  if (points.length <= 2 || radiusMm <= 0) return pointsToSvgPath(points);

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.hypot(dx1, dy1);

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2);

    if (len1 < 0.001 || len2 < 0.001) {
      parts.push(`L ${curr.x} ${curr.y}`);
      continue;
    }

    const r = Math.min(radiusMm, len1 / 2, len2 / 2);
    const p1x = curr.x - (dx1 / len1) * r;
    const p1y = curr.y - (dy1 / len1) * r;
    const p2x = curr.x + (dx2 / len2) * r;
    const p2y = curr.y + (dy2 / len2) * r;

    parts.push(`L ${p1x.toFixed(2)} ${p1y.toFixed(2)}`);
    parts.push(`Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${p2x.toFixed(2)} ${p2y.toFixed(2)}`);
  }

  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(" ");
}
