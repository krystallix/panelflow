import { describe, expect, it } from "vitest";
import type { WireDuct } from "@/types/panel";
import {
  calculateBundleLaneOffsetMm,
  getWireOuterDiameterMm,
  pointsToRoundedSvgPath,
  routeOrthogonalWire,
  routeWireThroughDucts,
  type WirePoint,
} from "../wire-router";

describe("wire-router", () => {
  const sampleDucts: WireDuct[] = [
    {
      id: "duct-top",
      name: "Top Duct",
      xMm: 0,
      yMm: 280,
      widthMm: 480,
      heightMm: 40,
      depthMm: 60,
      orientation: "horizontal",
    },
    {
      id: "duct-mid",
      name: "Mid Duct",
      xMm: 0,
      yMm: 120,
      widthMm: 480,
      heightMm: 40,
      depthMm: 60,
      orientation: "horizontal",
    },
    {
      id: "duct-v-left",
      name: "Left Vertical Duct",
      xMm: -230,
      yMm: 200,
      widthMm: 40,
      heightMm: 300,
      depthMm: 60,
      orientation: "vertical",
    },
    {
      id: "duct-v-right",
      name: "Right Vertical Duct",
      xMm: 230,
      yMm: 200,
      widthMm: 40,
      heightMm: 300,
      depthMm: 60,
      orientation: "vertical",
    },
  ];

  it("generates simple straight route if points share X or Y axis", () => {
    const from: WirePoint = { x: 10, y: 20 };
    const to: WirePoint = { x: 10, y: 100 };
    const waypoints = routeOrthogonalWire(from, to);
    expect(waypoints).toEqual([
      { x: 10, y: 20 },
      { x: 10, y: 100 },
    ]);
  });

  it("generates 90-degree orthogonal route (Z / S bend) with mid X or mid Y", () => {
    const from: WirePoint = { x: 0, y: 0 };
    const to: WirePoint = { x: 100, y: 100 };
    const waypoints = routeOrthogonalWire(from, to, "horizontal-first");
    expect(waypoints.length).toBe(4);
    expect(waypoints[0]).toEqual({ x: 0, y: 0 });
    expect(waypoints[waypoints.length - 1]).toEqual({ x: 100, y: 100 });
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      expect(p1.x === p2.x || p1.y === p2.y).toBe(true);
    }
  });

  it("returns realistic NYAF outer diameters (mm) for standard gauges and fallback", () => {
    expect(getWireOuterDiameterMm("0.75")).toBe(2.4);
    expect(getWireOuterDiameterMm("1.0")).toBe(2.7);
    expect(getWireOuterDiameterMm("1.5")).toBe(3.0);
    expect(getWireOuterDiameterMm("2.5")).toBe(3.7);
    expect(getWireOuterDiameterMm("4.0")).toBe(4.4);
    expect(getWireOuterDiameterMm("6.0")).toBe(5.2);
    expect(getWireOuterDiameterMm("10.0")).toBe(6.5);
    expect(getWireOuterDiameterMm("16.0")).toBe(8.0);
    expect(getWireOuterDiameterMm(25)).toBeGreaterThan(7.0);
  });

  it("generates rounded corner SVG paths for orthogonal bends", () => {
    const pts = routeOrthogonalWire({ x: 0, y: 0 }, { x: 100, y: 100 }, "horizontal-first");
    const d = pointsToRoundedSvgPath(pts, 4);
    expect(d).toContain("Q ");
  });

  it("routes wire through ducts cleanly from start pin to end pin", () => {
    // Start at top rail component pin (-160, 220) and end at mid rail component pin (100, 140)
    const startPt: WirePoint = { x: -160, y: 220 };
    const endPt: WirePoint = { x: 100, y: 140 };

    const waypoints = routeWireThroughDucts(startPt, endPt, sampleDucts, [], 0);

    expect(waypoints.length).toBeGreaterThanOrEqual(4);
    expect(waypoints[0]).toEqual(startPt);
    expect(waypoints[waypoints.length - 1]).toEqual(endPt);

    // Verify all segments are orthogonal
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const isOrthogonal = Math.abs(p1.x - p2.x) < 0.05 || Math.abs(p1.y - p2.y) < 0.05;
      expect(isOrthogonal).toBe(true);
    }

    // Verify at least one intermediate waypoint enters one of the ducts
    const passesDuct = waypoints.some((p) => {
      return sampleDucts.some((d) => {
        const halfW = d.widthMm / 2 + 5;
        const halfH = d.heightMm / 2 + 5;
        return (
          p.x >= d.xMm - halfW &&
          p.x <= d.xMm + halfW &&
          p.y >= d.yMm - halfH &&
          p.y <= d.yMm + halfH
        );
      });
    });
    expect(passesDuct).toBe(true);
  });

  it("calculates lane bundle offsets correctly for parallel wire spreading", () => {
    expect(calculateBundleLaneOffsetMm(0)).toBe(0);
    expect(calculateBundleLaneOffsetMm(1, 2.5)).toBe(2.5);
    expect(calculateBundleLaneOffsetMm(2, 2.5)).toBe(-2.5);
    expect(calculateBundleLaneOffsetMm(3, 2.5)).toBe(5);
    expect(calculateBundleLaneOffsetMm(4, 2.5)).toBe(-5);

    const startPt: WirePoint = { x: -100, y: 270 };
    const endPt: WirePoint = { x: 100, y: 270 };

    const wire0 = routeWireThroughDucts(startPt, endPt, sampleDucts, [], 0);
    const wire1 = routeWireThroughDucts(startPt, endPt, sampleDucts, [], 1);

    expect(wire0[0]).toEqual(startPt);
    expect(wire1[0]).toEqual(startPt);
    // Interior waypoints should have different coordinate offsets
    expect(wire0).not.toEqual(wire1);
  });

  it("routes bottom pin downward and avoids cutting through component bodies", () => {
    const ductsWithBottom: WireDuct[] = [
      ...sampleDucts,
      {
        id: "duct-bottom",
        name: "Bottom Duct",
        xMm: 0,
        yMm: -220,
        widthMm: 480,
        heightMm: 40,
        depthMm: 60,
        orientation: "horizontal",
      },
    ];
    // Contactor body centered at (20, 40), size 45x77 -> y: [1.5 .. 78.5], bottom pin at (7, 8)
    const contactorBox = {
      id: "km1",
      minX: -1,
      maxX: 41,
      minY: 3,
      maxY: 77,
    };
    const pts = routeWireThroughDucts(
      { x: 7, y: 8 },
      { x: -160, y: 236 },
      ductsWithBottom,
      [],
      0,
      {
        startExitDir: "down",
        endExitDir: "up",
        startStubPt: { x: 7, y: -3.5 },
        endStubPt: { x: -160, y: 247.5 },
        obstacles: [contactorBox],
      }
    );

    // First segment from bottom pin (7, 8) must exit downward to stub (7, -3.5), never upward through y=40
    expect(pts[1].y).toBeLessThan(8);
    // No segment after stub should pass through the middle of the contactor body (y=40, x in [0..40])
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (Math.abs(a.x - b.x) < 0.1 && a.x > contactorBox.minX && a.x < contactorBox.maxX) {
        const loY = Math.min(a.y, b.y);
        const hiY = Math.max(a.y, b.y);
        expect(hiY > contactorBox.minY && loY < contactorBox.maxY).toBe(false);
      }
    }
  });
});
