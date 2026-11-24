import type { PlacedComponent, EnclosureConfig } from "@/types/panel";

export type DoorCutoutKind = "circle" | "rect" | "fan-filter" | "double-d";

export interface DoorHoleSpec {
  xMm: number; // 0 = door plate left edge
  yMm: number; // 0 = door plate bottom edge
  diameterMm: number;
  label?: string;
  sourceName?: string;
}

export interface DoorCutoutItem {
  componentId: string;
  name: string;
  templateId: string;
  kind: DoorCutoutKind;
  centerXMm: number; // 0 = door plate left edge
  centerYMm: number; // 0 = door plate bottom edge
  widthMm: number;
  heightMm: number;
  mainDiameterMm?: number;
  rectWidthMm?: number;
  rectHeightMm?: number;
  flatToFlatMm?: number; // for double-d (e.g. 20.1mm)
  holes: DoorHoleSpec[];
  label: string;
}

export interface ExclusionZone {
  id: string;
  name: string;
  type: "hinge" | "handle";
  xMm: number; // left edge
  yMm: number; // bottom edge
  widthMm: number;
  heightMm: number;
}

export interface DoorCutoutLayoutSpec {
  doorWidthMm: number;
  doorHeightMm: number;
  hingeSide: "left" | "right";
  doorThicknessMm: number;
  cutouts: DoorCutoutItem[];
  allHoles: DoorHoleSpec[];
  exclusionZones: ExclusionZone[];
  violations: Array<{
    componentId: string;
    zoneName: string;
    message: string;
  }>;
}

/**
 * Standard door dimensions derived from outer enclosure width & height.
 * In typical industrial enclosures, outer door face matches enclosure width & height
 * (or slightly reduced by bevel/gap, here 1:1 door plate matches W x H).
 */
export function getDoorDimensions(enclosure: EnclosureConfig): {
  widthMm: number;
  heightMm: number;
  hingeSide: "left" | "right";
  doorThicknessMm: number;
} {
  return {
    widthMm: Math.max(100, enclosure.widthMm),
    heightMm: Math.max(100, enclosure.heightMm),
    hingeSide: enclosure.doorHingeSide ?? "left",
    doorThicknessMm: enclosure.doorThicknessMm ?? 2.0,
  };
}

/**
 * Compute hinge and handle/lock exclusion zones on the door face.
 * Left hinge = hinges on left side, handle/lock latch zone on right side.
 * Right hinge = hinges on right side, handle/lock latch zone on left side.
 */
export function computeDoorExclusionZones(
  doorWidthMm: number,
  doorHeightMm: number,
  hingeSide: "left" | "right" = "left"
): ExclusionZone[] {
  const zones: ExclusionZone[] = [];
  const hingeWidth = 40; // 40mm margin from edge
  const hingeHeight = 80;
  const handleWidth = 45;
  const handleHeight = 110;

  const hingeX = hingeSide === "left" ? 0 : doorWidthMm - hingeWidth;
  const handleX = hingeSide === "left" ? doorWidthMm - handleWidth : 0;

  // 2 standard hinges (top hinge 80mm from top, bottom hinge 80mm from bottom)
  // bottom edge coordinates:
  // top hinge: y = doorHeightMm - 80 - hingeHeight
  // bottom hinge: y = 80
  const topHingeY = Math.max(0, doorHeightMm - 80 - hingeHeight);
  const botHingeY = 80;

  zones.push({
    id: "hinge-top",
    name: `Top Hinge Zone (${hingeSide === "left" ? "Left" : "Right"})`,
    type: "hinge",
    xMm: hingeX,
    yMm: topHingeY,
    widthMm: hingeWidth,
    heightMm: hingeHeight,
  });

  zones.push({
    id: "hinge-bottom",
    name: `Bottom Hinge Zone (${hingeSide === "left" ? "Left" : "Right"})`,
    type: "hinge",
    xMm: hingeX,
    yMm: botHingeY,
    widthMm: hingeWidth,
    heightMm: hingeHeight,
  });

  // Handle / Latch exclusion zone in middle height on opposite side
  const handleY = Math.max(0, doorHeightMm / 2 - handleHeight / 2);
  zones.push({
    id: "handle-lock",
    name: `Handle / Latch Exclusion Zone (${hingeSide === "left" ? "Right" : "Left"})`,
    type: "handle",
    xMm: handleX,
    yMm: handleY,
    widthMm: handleWidth,
    heightMm: handleHeight,
  });

  return zones;
}

/**
 * Convert placed components into fabrication door cutouts.
 * PlacedComponent coordinate space: (0,0) is center of plate/door.
 * Door coordinates: (0,0) is bottom-left edge of door.
 */
export function computeDoorCutouts(
  enclosure: EnclosureConfig,
  components: PlacedComponent[]
): DoorCutoutLayoutSpec {
  const { widthMm: doorWidthMm, heightMm: doorHeightMm, hingeSide, doorThicknessMm } =
    getDoorDimensions(enclosure);

  const toDoorX = (centerX: number) => centerX + doorWidthMm / 2;
  const toDoorY = (centerY: number) => centerY + doorHeightMm / 2;

  const cutouts: DoorCutoutItem[] = [];
  const allHoles: DoorHoleSpec[] = [];

  // Filter components relevant to door cutouts
  const doorComps = components.filter(
    (c) =>
      c.mountingType === "door_cutout" ||
      c.templateId.startsWith("pilot-lamp") ||
      c.templateId === "push-button" ||
      c.templateId === "e-stop" ||
      c.templateId === "selector-3pos" ||
      c.templateId === "panel-meter-96" ||
      c.templateId === "cooling-fan-120" ||
      c.templateId === "cam-lock"
  );

  for (const c of doorComps) {
    const cx = Number(toDoorX(c.xMm).toFixed(2));
    const cy = Number(toDoorY(c.yMm).toFixed(2));

    if (
      c.templateId.startsWith("pilot-lamp") ||
      c.templateId === "push-button" ||
      c.templateId === "e-stop" ||
      c.templateId === "selector-3pos"
    ) {
      // Standard Ø22mm cutout hole for pilot lamps and switches
      const hole: DoorHoleSpec = {
        xMm: cx,
        yMm: cy,
        diameterMm: 22,
        label: "Ø22 mm",
        sourceName: c.name,
      };
      allHoles.push(hole);
      cutouts.push({
        componentId: c.id,
        name: c.name,
        templateId: c.templateId,
        kind: "circle",
        centerXMm: cx,
        centerYMm: cy,
        widthMm: 22,
        heightMm: 22,
        mainDiameterMm: 22,
        holes: [hole],
        label: "Ø22 mm",
      });
    } else if (c.templateId === "panel-meter-96") {
      // 96x96mm bezel meter requires 92x92mm square cutout
      cutouts.push({
        componentId: c.id,
        name: c.name,
        templateId: c.templateId,
        kind: "rect",
        centerXMm: cx,
        centerYMm: cy,
        widthMm: 92,
        heightMm: 92,
        rectWidthMm: 92,
        rectHeightMm: 92,
        holes: [],
        label: "□ 92×92 mm",
      });
    } else if (c.templateId === "cooling-fan-120") {
      // 120mm fan filter: circular cutout Ø116mm + 4 mounting holes Ø4.5mm at 104.8mm pitch (center distance = 52.4mm from center)
      const fanHoleOffset = 104.8 / 2; // 52.4mm
      const cornerHoles: DoorHoleSpec[] = [
        {
          xMm: Number((cx - fanHoleOffset).toFixed(2)),
          yMm: Number((cy - fanHoleOffset).toFixed(2)),
          diameterMm: 4.5,
          label: "Ø4.5 mm",
          sourceName: `${c.name} M4-BL`,
        },
        {
          xMm: Number((cx + fanHoleOffset).toFixed(2)),
          yMm: Number((cy - fanHoleOffset).toFixed(2)),
          diameterMm: 4.5,
          label: "Ø4.5 mm",
          sourceName: `${c.name} M4-BR`,
        },
        {
          xMm: Number((cx - fanHoleOffset).toFixed(2)),
          yMm: Number((cy + fanHoleOffset).toFixed(2)),
          diameterMm: 4.5,
          label: "Ø4.5 mm",
          sourceName: `${c.name} M4-TL`,
        },
        {
          xMm: Number((cx + fanHoleOffset).toFixed(2)),
          yMm: Number((cy + fanHoleOffset).toFixed(2)),
          diameterMm: 4.5,
          label: "Ø4.5 mm",
          sourceName: `${c.name} M4-TR`,
        },
      ];

      allHoles.push(...cornerHoles);

      cutouts.push({
        componentId: c.id,
        name: c.name,
        templateId: c.templateId,
        kind: "fan-filter",
        centerXMm: cx,
        centerYMm: cy,
        widthMm: 116,
        heightMm: 116,
        mainDiameterMm: 116,
        holes: cornerHoles,
        label: "Fan Ø116 + 4xØ4.5",
      });
    } else if (c.templateId === "cam-lock") {
      // Double-D cutout: Ø22.5mm with 20.1mm flats
      const hole: DoorHoleSpec = {
        xMm: cx,
        yMm: cy,
        diameterMm: 22.5,
        label: "Double-D Ø22.5/20.1",
        sourceName: c.name,
      };
      allHoles.push(hole);
      cutouts.push({
        componentId: c.id,
        name: c.name,
        templateId: c.templateId,
        kind: "double-d",
        centerXMm: cx,
        centerYMm: cy,
        widthMm: 22.5,
        heightMm: 22.5,
        mainDiameterMm: 22.5,
        flatToFlatMm: 20.1,
        holes: [hole],
        label: "Double-D Ø22.5/20.1",
      });
    } else {
      // Fallback for custom door cutout
      const w = c.widthMm || 22.5;
      const h = c.heightMm || 22.5;
      cutouts.push({
        componentId: c.id,
        name: c.name,
        templateId: c.templateId,
        kind: "rect",
        centerXMm: cx,
        centerYMm: cy,
        widthMm: w,
        heightMm: h,
        rectWidthMm: w,
        rectHeightMm: h,
        holes: [],
        label: `□ ${w}×${h} mm`,
      });
    }
  }

  const exclusionZones = computeDoorExclusionZones(
    doorWidthMm,
    doorHeightMm,
    hingeSide
  );

  // Validate exclusion zone violations
  const violations: Array<{
    componentId: string;
    zoneName: string;
    message: string;
  }> = [];

  for (const item of cutouts) {
    const itemLeft = item.centerXMm - item.widthMm / 2;
    const itemRight = item.centerXMm + item.widthMm / 2;
    const itemBottom = item.centerYMm - item.heightMm / 2;
    const itemTop = item.centerYMm + item.heightMm / 2;

    for (const zone of exclusionZones) {
      const zoneLeft = zone.xMm;
      const zoneRight = zone.xMm + zone.widthMm;
      const zoneBottom = zone.yMm;
      const zoneTop = zone.yMm + zone.heightMm;

      const overlapX = itemLeft < zoneRight && itemRight > zoneLeft;
      const overlapY = itemBottom < zoneTop && itemTop > zoneBottom;

      if (overlapX && overlapY) {
        violations.push({
          componentId: item.componentId,
          zoneName: zone.name,
          message: `${item.name} (${item.label}) overlaps ${zone.name}`,
        });
      }
    }
  }

  return {
    doorWidthMm,
    doorHeightMm,
    hingeSide,
    doorThicknessMm,
    cutouts,
    allHoles,
    exclusionZones,
    violations,
  };
}

/**
 * Generate 1:1 AutoCAD DXF ($INSUNITS=4 mm) for Door Drilling & Cutout.
 * Layers:
 * - OUTLINE: Door sheet perimeter
 * - CENTERLINES: Symmetry centerline X & Y
 * - DRILL_HOLES: Crosshairs and drill circles (Ø22.5mm, Ø4.5mm)
 * - CUTOUTS: Rectangular & fan cutouts (□92x92mm, Fan Ø116mm, Double-D flats)
 * - EXCLUSION_ZONES: Hinge & handle prohibited zones
 * - DIMENSIONS: Text labels and dimension leader lines
 */
export function generateDoorDrillingDxf(
  enclosure: EnclosureConfig,
  components: PlacedComponent[]
): string {
  const spec = computeDoorCutouts(enclosure, components);
  const { doorWidthMm, doorHeightMm, cutouts, allHoles, exclusionZones } = spec;

  const lines: string[] = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$INSUNITS",
    "70",
    "4", // 4 = Millimeters
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
  ];

  const addLine = (
    layer: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => {
    lines.push(
      "0",
      "LINE",
      "8",
      layer,
      "10",
      x1.toFixed(3),
      "20",
      y1.toFixed(3),
      "30",
      "0.000",
      "11",
      x2.toFixed(3),
      "21",
      y2.toFixed(3),
      "31",
      "0.000"
    );
  };

  const addCircle = (layer: string, cx: number, cy: number, r: number) => {
    lines.push(
      "0",
      "CIRCLE",
      "8",
      layer,
      "10",
      cx.toFixed(3),
      "20",
      cy.toFixed(3),
      "30",
      "0.000",
      "40",
      r.toFixed(3)
    );
  };

  const addText = (
    layer: string,
    x: number,
    y: number,
    height: number,
    text: string
  ) => {
    lines.push(
      "0",
      "TEXT",
      "8",
      layer,
      "10",
      x.toFixed(3),
      "20",
      y.toFixed(3),
      "30",
      "0.000",
      "40",
      height.toFixed(3),
      "1",
      text
    );
  };

  // 1. OUTLINE: Door sheet perimeter
  addLine("OUTLINE", 0, 0, doorWidthMm, 0);
  addLine("OUTLINE", doorWidthMm, 0, doorWidthMm, doorHeightMm);
  addLine("OUTLINE", doorWidthMm, doorHeightMm, 0, doorHeightMm);
  addLine("OUTLINE", 0, doorHeightMm, 0, 0);

  // 2. CENTERLINES: Door symmetry lines
  addLine("CENTERLINES", doorWidthMm / 2, 0, doorWidthMm / 2, doorHeightMm);
  addLine("CENTERLINES", 0, doorHeightMm / 2, doorWidthMm, doorHeightMm / 2);

  // 3. EXCLUSION_ZONES: Prohibited areas
  for (const zone of exclusionZones) {
    const x1 = zone.xMm;
    const y1 = zone.yMm;
    const x2 = zone.xMm + zone.widthMm;
    const y2 = zone.yMm + zone.heightMm;
    addLine("EXCLUSION_ZONES", x1, y1, x2, y1);
    addLine("EXCLUSION_ZONES", x2, y1, x2, y2);
    addLine("EXCLUSION_ZONES", x2, y2, x1, y2);
    addLine("EXCLUSION_ZONES", x1, y2, x1, y1);
    addText("EXCLUSION_ZONES", x1 + 2, y1 + 5, 4, zone.name);
  }

  // 4. DRILL_HOLES & CUTOUTS
  for (const item of cutouts) {
    if (item.kind === "circle") {
      const r = (item.mainDiameterMm || 22.5) / 2;
      addCircle("DRILL_HOLES", item.centerXMm, item.centerYMm, r);
      // Crosshairs
      addLine(
        "DRILL_HOLES",
        item.centerXMm - r - 3,
        item.centerYMm,
        item.centerXMm + r + 3,
        item.centerYMm
      );
      addLine(
        "DRILL_HOLES",
        item.centerXMm,
        item.centerYMm - r - 3,
        item.centerXMm,
        item.centerYMm + r + 3
      );
      addText(
        "DIMENSIONS",
        item.centerXMm + r + 2,
        item.centerYMm + 2,
        3.5,
        item.label
      );
    } else if (item.kind === "rect") {
      const halfW = (item.rectWidthMm || 92) / 2;
      const halfH = (item.rectHeightMm || 92) / 2;
      const x1 = item.centerXMm - halfW;
      const y1 = item.centerYMm - halfH;
      const x2 = item.centerXMm + halfW;
      const y2 = item.centerYMm + halfH;
      addLine("CUTOUTS", x1, y1, x2, y1);
      addLine("CUTOUTS", x2, y1, x2, y2);
      addLine("CUTOUTS", x2, y2, x1, y2);
      addLine("CUTOUTS", x1, y2, x1, y1);
      // Crosshair center
      addLine(
        "CUTOUTS",
        item.centerXMm - 5,
        item.centerYMm,
        item.centerXMm + 5,
        item.centerYMm
      );
      addLine(
        "CUTOUTS",
        item.centerXMm,
        item.centerYMm - 5,
        item.centerXMm,
        item.centerYMm + 5
      );
      addText("DIMENSIONS", x1 + 2, y2 + 2, 4, item.label);
    } else if (item.kind === "fan-filter") {
      const r = (item.mainDiameterMm || 116) / 2;
      addCircle("CUTOUTS", item.centerXMm, item.centerYMm, r);
      // Center crosshair
      addLine(
        "CUTOUTS",
        item.centerXMm - r - 4,
        item.centerYMm,
        item.centerXMm + r + 4,
        item.centerYMm
      );
      addLine(
        "CUTOUTS",
        item.centerXMm,
        item.centerYMm - r - 4,
        item.centerXMm,
        item.centerYMm + r + 4
      );
      // 4 mounting screw holes
      for (const h of item.holes) {
        addCircle("DRILL_HOLES", h.xMm, h.yMm, h.diameterMm / 2);
        addLine(
          "DRILL_HOLES",
          h.xMm - 3,
          h.yMm,
          h.xMm + 3,
          h.yMm
        );
        addLine(
          "DRILL_HOLES",
          h.xMm,
          h.yMm - 3,
          h.xMm,
          h.yMm + 3
        );
      }
      addText(
        "DIMENSIONS",
        item.centerXMm - r,
        item.centerYMm + r + 4,
        4,
        item.label
      );
    } else if (item.kind === "double-d") {
      const r = (item.mainDiameterMm || 22.5) / 2;
      const flatHalfW = (item.flatToFlatMm || 20.1) / 2;
      // Approximate double-D in DXF as main circle + two vertical flat chords
      addCircle("CUTOUTS", item.centerXMm, item.centerYMm, r);
      addLine(
        "CUTOUTS",
        item.centerXMm - flatHalfW,
        item.centerYMm - r,
        item.centerXMm - flatHalfW,
        item.centerYMm + r
      );
      addLine(
        "CUTOUTS",
        item.centerXMm + flatHalfW,
        item.centerYMm - r,
        item.centerXMm + flatHalfW,
        item.centerYMm + r
      );
      // Crosshair
      addLine(
        "DRILL_HOLES",
        item.centerXMm - r - 3,
        item.centerYMm,
        item.centerXMm + r + 3,
        item.centerYMm
      );
      addLine(
        "DRILL_HOLES",
        item.centerXMm,
        item.centerYMm - r - 3,
        item.centerXMm,
        item.centerYMm + r + 3
      );
      addText(
        "DIMENSIONS",
        item.centerXMm + r + 2,
        item.centerYMm + 2,
        3.5,
        item.label
      );
    }

    // 5. DIMENSION EXTENSION LINES: Center to Door Left Edge & Door Top Edge
    // Left edge dimension line (y = centerYMm)
    addLine("DIMENSIONS", 0, item.centerYMm, item.centerXMm, item.centerYMm);
    addText(
      "DIMENSIONS",
      item.centerXMm / 2,
      item.centerYMm + 1.5,
      3,
      `X=${item.centerXMm.toFixed(1)}mm`
    );

    // Top edge dimension line (x = centerXMm)
    // Distance from top = doorHeightMm - centerYMm
    addLine("DIMENSIONS", item.centerXMm, item.centerYMm, item.centerXMm, doorHeightMm);
    const distFromTop = doorHeightMm - item.centerYMm;
    addText(
      "DIMENSIONS",
      item.centerXMm + 1.5,
      item.centerYMm + distFromTop / 2,
      3,
      `Y_top=${distFromTop.toFixed(1)}mm`
    );
  }

  lines.push("0", "ENDSEC", "0", "EOF", "");
  return lines.join("\n");
}

/**
 * Generate 1:1 Printable SVG for Door Drilling Fabrication Mal.
 * Scale: 1 unit = 1 mm.
 */
export function generateDoorDrillingSvg(
  enclosure: EnclosureConfig,
  components: PlacedComponent[]
): string {
  const spec = computeDoorCutouts(enclosure, components);
  const { doorWidthMm, doorHeightMm, cutouts, exclusionZones, hingeSide } = spec;

  const marginMm = 30;
  const viewBoxW = doorWidthMm + marginMm * 2;
  const viewBoxH = doorHeightMm + marginMm * 2;

  // SVG coordinate transformation:
  // In our CAD spec, (0,0) is bottom-left of door plate.
  // In SVG, (0,0) is top-left, so svgY = marginMm + (doorHeightMm - yMm).
  const svgX = (x: number) => marginMm + x;
  const svgY = (y: number) => marginMm + (doorHeightMm - y);

  const elements: string[] = [];

  // Door Plate Outline
  elements.push(`
    <!-- Door Plate Outline -->
    <rect
      x="${svgX(0)}"
      y="${svgY(doorHeightMm)}"
      width="${doorWidthMm}"
      height="${doorHeightMm}"
      fill="#f8fafc"
      stroke="#0f172a"
      stroke-width="1.2"
    />
    <!-- Sheet metal bevel visual inner border -->
    <rect
      x="${svgX(3)}"
      y="${svgY(doorHeightMm - 3)}"
      width="${doorWidthMm - 6}"
      height="${doorHeightMm - 6}"
      fill="none"
      stroke="#94a3b8"
      stroke-width="0.5"
      stroke-dasharray="3,3"
    />
  `);

  // Centerlines (Symmetry X & Y)
  elements.push(`
    <!-- Centerlines -->
    <line
      x1="${svgX(doorWidthMm / 2)}"
      y1="${svgY(0)}"
      x2="${svgX(doorWidthMm / 2)}"
      y2="${svgY(doorHeightMm)}"
      stroke="#ef4444"
      stroke-width="0.6"
      stroke-dasharray="6,3,1.5,3"
    />
    <line
      x1="${svgX(0)}"
      y1="${svgY(doorHeightMm / 2)}"
      x2="${svgX(doorWidthMm)}"
      y2="${svgY(doorHeightMm / 2)}"
      stroke="#ef4444"
      stroke-width="0.6"
      stroke-dasharray="6,3,1.5,3"
    />
  `);

  // Exclusion Zones
  for (const zone of exclusionZones) {
    const x = svgX(zone.xMm);
    const y = svgY(zone.yMm + zone.heightMm);
    elements.push(`
      <!-- Exclusion Zone: ${zone.name} -->
      <g>
        <rect
          x="${x}"
          y="${y}"
          width="${zone.widthMm}"
          height="${zone.heightMm}"
          fill="rgba(239, 68, 68, 0.12)"
          stroke="#ef4444"
          stroke-width="0.8"
          stroke-dasharray="4,2"
        />
        <text
          x="${x + 3}"
          y="${y + 12}"
          font-family="monospace"
          font-size="4"
          fill="#b91c1c"
          font-weight="bold"
        >${zone.name}</text>
      </g>
    `);
  }

  // Cutouts & Drill Holes
  for (const item of cutouts) {
    const cx = svgX(item.centerXMm);
    const cy = svgY(item.centerYMm);

    // Dimension lines from Left and Top edges
    const leftX = svgX(0);
    const topY = svgY(doorHeightMm);
    const distFromLeft = item.centerXMm;
    const distFromTop = doorHeightMm - item.centerYMm;

    elements.push(`
      <!-- Dimensions for ${item.name} -->
      <g stroke="#2563eb" stroke-width="0.5" stroke-dasharray="2,2">
        <!-- Horizontal extension to Left edge -->
        <line x1="${leftX}" y1="${cy}" x2="${cx}" y2="${cy}" />
        <!-- Vertical extension to Top edge -->
        <line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy}" />
      </g>
      <!-- Dimension text -->
      <text
        x="${(leftX + cx) / 2}"
        y="${cy - 2}"
        font-family="monospace"
        font-size="3.5"
        fill="#1d4ed8"
        text-anchor="middle"
      >${distFromLeft.toFixed(1)} mm</text>
      <text
        x="${cx + 2}"
        y="${(topY + cy) / 2}"
        font-family="monospace"
        font-size="3.5"
        fill="#1d4ed8"
        dominant-baseline="middle"
      >${distFromTop.toFixed(1)} mm</text>
    `);

    // Shape drawing
    if (item.kind === "circle") {
      const r = (item.mainDiameterMm || 22.5) / 2;
      elements.push(`
        <!-- Circle Drill Hole -->
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="#0f172a" stroke-width="0.9" />
        <!-- Crosshairs -->
        <line x1="${cx - r - 3}" y1="${cy}" x2="${cx + r + 3}" y2="${cy}" stroke="#0f172a" stroke-width="0.5" />
        <line x1="${cx}" y1="${cy - r - 3}" x2="${cx}" y2="${cy + r + 3}" stroke="#0f172a" stroke-width="0.5" />
        <text x="${cx}" y="${cy + r + 4}" font-family="monospace" font-size="3.5" fill="#0f172a" text-anchor="middle" font-weight="bold">${item.label}</text>
      `);
    } else if (item.kind === "rect") {
      const w = item.rectWidthMm || 92;
      const h = item.rectHeightMm || 92;
      elements.push(`
        <!-- Rectangular Cutout -->
        <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="#f1f5f9" stroke="#0f172a" stroke-width="1.1" />
        <line x1="${cx - 8}" y1="${cy}" x2="${cx + 8}" y2="${cy}" stroke="#0f172a" stroke-width="0.5" />
        <line x1="${cx}" y1="${cy - 8}" x2="${cx}" y2="${cy + 8}" stroke="#0f172a" stroke-width="0.5" />
        <text x="${cx}" y="${cy + h / 2 + 5}" font-family="monospace" font-size="4" fill="#0f172a" text-anchor="middle" font-weight="bold">${item.label}</text>
      `);
    } else if (item.kind === "fan-filter") {
      const r = (item.mainDiameterMm || 116) / 2;
      elements.push(`
        <!-- Fan Filter Cutout -->
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.1" />
        <line x1="${cx - r - 4}" y1="${cy}" x2="${cx + r + 4}" y2="${cy}" stroke="#0f172a" stroke-width="0.5" />
        <line x1="${cx}" y1="${cy - r - 4}" x2="${cx}" y2="${cy + r + 4}" stroke="#0f172a" stroke-width="0.5" />
        <text x="${cx}" y="${cy + r + 5}" font-family="monospace" font-size="4" fill="#0f172a" text-anchor="middle" font-weight="bold">${item.label}</text>
      `);
      for (const h of item.holes) {
        const hx = svgX(h.xMm);
        const hy = svgY(h.yMm);
        const hr = h.diameterMm / 2;
        elements.push(`
          <circle cx="${hx}" cy="${hy}" r="${hr}" fill="#ffffff" stroke="#0f172a" stroke-width="0.8" />
          <line x1="${hx - 2}" y1="${hy}" x2="${hx + 2}" y2="${hy}" stroke="#0f172a" stroke-width="0.4" />
          <line x1="${hx}" y1="${hy - 2}" x2="${hx}" y2="${hy + 2}" stroke="#0f172a" stroke-width="0.4" />
        `);
      }
    } else if (item.kind === "double-d") {
      const r = (item.mainDiameterMm || 22.5) / 2;
      const flatHalfW = (item.flatToFlatMm || 20.1) / 2;
      elements.push(`
        <!-- Double-D Cam Lock -->
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="#94a3b8" stroke-width="0.6" stroke-dasharray="2,2" />
        <line x1="${cx - flatHalfW}" y1="${cy - r}" x2="${cx - flatHalfW}" y2="${cy + r}" stroke="#0f172a" stroke-width="1" />
        <line x1="${cx + flatHalfW}" y1="${cy - r}" x2="${cx + flatHalfW}" y2="${cy + r}" stroke="#0f172a" stroke-width="1" />
        <line x1="${cx - r - 2}" y1="${cy}" x2="${cx + r + 2}" y2="${cy}" stroke="#0f172a" stroke-width="0.5" />
        <line x1="${cx}" y1="${cy - r - 2}" x2="${cx}" y2="${cy + r + 2}" stroke="#0f172a" stroke-width="0.5" />
        <text x="${cx}" y="${cy + r + 4}" font-family="monospace" font-size="3.5" fill="#0f172a" text-anchor="middle" font-weight="bold">${item.label}</text>
      `);
    }
  }

  // Title Block Metadata & Notes
  elements.push(`
    <!-- Info Header -->
    <text x="${svgX(0)}" y="${svgY(doorHeightMm) - 10}" font-family="monospace" font-size="7" font-weight="bold" fill="#0f172a">
      PANELFLOW 1:1 DOOR DRILLING FABRICATION TEMPLATE (MAL BOR PINTU)
    </text>
    <text x="${svgX(0)}" y="${svgY(doorHeightMm) - 4}" font-family="monospace" font-size="4.5" fill="#475569">
      Door Size: ${doorWidthMm} x ${doorHeightMm} mm | Hinge: ${hingeSide.toUpperCase()} | Scale: 1:1 (True Millimeter Scale)
    </text>
  `);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${viewBoxW}mm"
  height="${viewBoxH}mm"
  viewBox="0 0 ${viewBoxW} ${viewBoxH}"
>
  <style>
    text { user-select: none; }
  </style>
  ${elements.join("\n")}
</svg>`;
}
