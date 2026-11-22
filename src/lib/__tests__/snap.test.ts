import { describe, expect, it } from "vitest";
import {
  clampToBackplate,
  DIN_RAIL_DEPTH_MM,
  snapComponentToNearestRail,
  snapPointToGrid,
  snapSideBySideOnRail,
  snapToGrid,
} from "@/lib/snap";
import type { DinRail } from "@/types/panel";

describe("Grid & DIN Rail Snap Math", () => {
  it("snaps scalar values to 5mm, 10mm, and 25mm grids", () => {
    expect(snapToGrid(12.4, 5)).toBe(10);
    expect(snapToGrid(12.6, 5)).toBe(15);
    expect(snapToGrid(144, 10)).toBe(140);
    expect(snapToGrid(146, 10)).toBe(150);
    expect(snapToGrid(-38, 25)).toBe(-50);
    expect(snapToGrid(-37, 25)).toBe(-25);
  });

  it("snaps 2D points to grid", () => {
    expect(snapPointToGrid(17, -43, 10)).toEqual({ xMm: 20, yMm: -40 });
  });

  it("clamps items inside backplate boundaries", () => {
    const clamped = clampToBackplate(300, -400, 100, 40, 520, 720);
    expect(clamped.xMm).toBe(210);
    expect(clamped.yMm).toBe(-340);
  });

  it("auto-snaps placed component to nearest DIN rail and clamps within rail length", () => {
    const rails: DinRail[] = [
      { id: "r1", name: "Rail Top", xMm: 0, yMm: 150, lengthMm: 400 },
      { id: "r2", name: "Rail Bottom", xMm: 0, yMm: -100, lengthMm: 400 },
    ];

    const resTop = snapComponentToNearestRail(23, 120, 52.5, 70, rails, 10);
    expect(resTop.snappedToRail).toBe(true);
    expect(resTop.railId).toBe("r1");
    expect(resTop.yMm).toBe(150);
    expect(resTop.xMm).toBe(20);
    expect(resTop.zMm).toBe(DIN_RAIL_DEPTH_MM + 35);

    // Clamping to rail right edge: 400/2 - 52.5/2 = 173.75
    const resClamped = snapComponentToNearestRail(250, -90, 52.5, 70, rails, 10);
    expect(resClamped.railId).toBe("r2");
    expect(resClamped.yMm).toBe(-100);
    expect(resClamped.xMm).toBeCloseTo(173.75, 4);
  });

  it("falls back to grid snap when no DIN rails exist", () => {
    const res = snapComponentToNearestRail(14, 28, 20, 60, [], 10);
    expect(res.snappedToRail).toBe(false);
    expect(res.railId).toBeNull();
    expect(res.xMm).toBe(10);
    expect(res.yMm).toBe(30);
    expect(res.zMm).toBe(30);
  });

  it("snaps modular DIN components side-by-side with 0mm gap on the same rail", () => {
    const others = [
      { id: "mcb-1", railId: "r1", xMm: 0, widthMm: 18, heightMm: 85 },
    ];
    const snapped = snapSideBySideOnRail(21, 18, "r1", others, "mcb-2");
    expect(snapped.snappedToNeighborId).toBe("mcb-1");
    expect(snapped.xMm).toBe(18);
  });
});
