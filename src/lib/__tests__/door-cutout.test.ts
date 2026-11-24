import { describe, expect, it } from "vitest";
import type { EnclosureConfig, PlacedComponent } from "@/types/panel";
import {
  computeDoorCutouts,
  computeDoorExclusionZones,
  generateDoorDrillingDxf,
  generateDoorDrillingSvg,
  getDoorDimensions,
} from "../door-cutout";

describe("door-cutout engine", () => {
  const mockEnclosure: EnclosureConfig = {
    widthMm: 600,
    heightMm: 800,
    depthMm: 250,
    backplateInsetMm: 20,
    backplateThicknessMm: 2,
    wallThicknessMm: 1.5,
    doorMode: "open",
    doorHingeSide: "left",
    doorThicknessMm: 2.0,
  };

  const mockComponents: PlacedComponent[] = [
    {
      id: "lamp-r1",
      templateId: "pilot-lamp-red",
      name: "HL1",
      mountingType: "door_cutout",
      xMm: -100,
      yMm: 200,
      zMm: 0,
      railId: null,
      widthMm: 30,
      heightMm: 30,
      depthMm: 45,
      color: "#334155",
      accentColor: "#ef4444",
      pins: [],
    },
    {
      id: "meter-1",
      templateId: "panel-meter-96",
      name: "PM1",
      mountingType: "door_cutout",
      xMm: 0,
      yMm: 200,
      zMm: 0,
      railId: null,
      widthMm: 96,
      heightMm: 96,
      depthMm: 65,
      color: "#0f172a",
      accentColor: "#38bdf8",
      pins: [],
    },
    {
      id: "fan-1",
      templateId: "cooling-fan-120",
      name: "FAN1",
      mountingType: "door_cutout",
      xMm: 0,
      yMm: -200,
      zMm: 0,
      railId: null,
      widthMm: 120,
      heightMm: 120,
      depthMm: 38,
      color: "#334155",
      accentColor: "#64748b",
      pins: [],
    },
    {
      id: "lock-1",
      templateId: "cam-lock",
      name: "LOCK1",
      mountingType: "door_cutout",
      xMm: 240,
      yMm: 0,
      zMm: 0,
      railId: null,
      widthMm: 32,
      heightMm: 32,
      depthMm: 30,
      color: "#1e293b",
      accentColor: "#94a3b8",
      pins: [],
    },
  ];

  it("calculates door dimensions and default hinge side properly", () => {
    const dims = getDoorDimensions(mockEnclosure);
    expect(dims.widthMm).toBe(600);
    expect(dims.heightMm).toBe(800);
    expect(dims.hingeSide).toBe("left");
    expect(dims.doorThicknessMm).toBe(2.0);
  });

  it("generates correct exclusion zones for left vs right hinge", () => {
    const leftZones = computeDoorExclusionZones(600, 800, "left");
    expect(leftZones).toHaveLength(3);
    const topHingeLeft = leftZones.find((z) => z.id === "hinge-top");
    expect(topHingeLeft?.xMm).toBe(0);
    const handleLeft = leftZones.find((z) => z.id === "handle-lock");
    expect(handleLeft?.xMm).toBe(600 - 45); // on right edge

    const rightZones = computeDoorExclusionZones(600, 800, "right");
    const topHingeRight = rightZones.find((z) => z.id === "hinge-top");
    expect(topHingeRight?.xMm).toBe(600 - 40); // on right edge
    const handleRight = rightZones.find((z) => z.id === "handle-lock");
    expect(handleRight?.xMm).toBe(0); // on left edge
  });

  it("computes door cutouts with center-to-edge coordinates and hole specs", () => {
    const spec = computeDoorCutouts(mockEnclosure, mockComponents);
    expect(spec.doorWidthMm).toBe(600);
    expect(spec.doorHeightMm).toBe(800);
    expect(spec.cutouts).toHaveLength(4);

    // Lamp Ø22mm
    const lampCutout = spec.cutouts.find((c) => c.componentId === "lamp-r1");
    expect(lampCutout).toBeDefined();
    expect(lampCutout?.kind).toBe("circle");
    expect(lampCutout?.mainDiameterMm).toBe(22);
    // xMm = -100 + 300 = 200, yMm = 200 + 400 = 600
    expect(lampCutout?.centerXMm).toBe(200);
    expect(lampCutout?.centerYMm).toBe(600);

    // Meter 92x92mm
    const meterCutout = spec.cutouts.find((c) => c.componentId === "meter-1");
    expect(meterCutout).toBeDefined();
    expect(meterCutout?.kind).toBe("rect");
    expect(meterCutout?.rectWidthMm).toBe(92);
    expect(meterCutout?.rectHeightMm).toBe(92);

    // Fan filter 116mm + 4 holes
    const fanCutout = spec.cutouts.find((c) => c.componentId === "fan-1");
    expect(fanCutout).toBeDefined();
    expect(fanCutout?.kind).toBe("fan-filter");
    expect(fanCutout?.mainDiameterMm).toBe(116);
    expect(fanCutout?.holes).toHaveLength(4);
    expect(fanCutout?.holes[0].diameterMm).toBe(4.5);

    // Cam lock double-d
    const lockCutout = spec.cutouts.find((c) => c.componentId === "lock-1");
    expect(lockCutout).toBeDefined();
    expect(lockCutout?.kind).toBe("double-d");
    expect(lockCutout?.flatToFlatMm).toBe(20.1);
  });

  it("flags exclusion zone collision violations", () => {
    // Put a pilot lamp directly over the top hinge zone (x = -280 -> doorX = 20mm, y = 280 -> doorY = 680mm)
    const collidingComps: PlacedComponent[] = [
      {
        id: "violator",
        templateId: "pilot-lamp-red",
        name: "HL_BAD",
        mountingType: "door_cutout",
        xMm: -285, // doorX = 15mm (< 40mm)
        yMm: 280, // doorY = 680mm (in top hinge y range)
        zMm: 0,
        railId: null,
        widthMm: 30,
        heightMm: 30,
        depthMm: 45,
        color: "#334155",
        accentColor: "#ef4444",
        pins: [],
      },
    ];

    const spec = computeDoorCutouts(mockEnclosure, collidingComps);
    expect(spec.violations.length).toBeGreaterThan(0);
    expect(spec.violations[0].zoneName).toContain("Top Hinge Zone");
  });

  it("generates valid 1:1 AutoCAD DXF with proper layers and INSUNITS=4", () => {
    const dxf = generateDoorDrillingDxf(mockEnclosure, mockComponents);
    expect(dxf).toContain("$INSUNITS");
    expect(dxf).toContain("\n4\n"); // mm
    expect(dxf).toContain("OUTLINE");
    expect(dxf).toContain("CENTERLINES");
    expect(dxf).toContain("DRILL_HOLES");
    expect(dxf).toContain("CUTOUTS");
    expect(dxf).toContain("DIMENSIONS");
    expect(dxf).toContain("EXCLUSION_ZONES");
    expect(dxf).toContain("EOF");
  });

  it("generates 1:1 Printable SVG with dimension lines and metadata", () => {
    const svg = generateDoorDrillingSvg(mockEnclosure, mockComponents);
    expect(svg).toContain("<svg");
    expect(svg).toContain('width="660mm"');
    expect(svg).toContain('height="860mm"');
    expect(svg).toContain("PANELFLOW 1:1 DOOR DRILLING FABRICATION TEMPLATE");
    expect(svg).toContain("Door Plate Outline");
    expect(svg).toContain("Exclusion Zone");
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain("</svg>");
  });
});
