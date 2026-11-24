import { describe, it, expect } from "vitest";
import { COMPONENT_CATALOG, COMPONENT_LIST } from "../components-catalog";
import type { ComponentTemplateId } from "@/types/panel";

describe("monochrome CAD components-catalog", () => {
  const expectedIds: ComponentTemplateId[] = [
    // Protection & Switchgear
    "mcb-1p",
    "mcb-2p",
    "mcb-3p",
    "mcb-4p",
    "mccb-100a",
    "spd-3pn",
    "fuse-1p",
    // Control & Automation
    "contactor",
    "tor",
    "contactor-st10",
    "tor-tht18",
    "relay-socket-my4n",
    "relay-socket-mk3p",
    "plc-compact",
    "vfd-15kw",
    // Power & Distribution
    "psu-24v",
    "psu-24v-10a",
    "dist-block-4p",
    // Terminals & DIN Accessories
    "terminal-block",
    "terminal-n",
    "terminal-pe",
    "end-clamp",
    // Door & Panel Controls
    "pilot-lamp-red",
    "pilot-lamp-green",
    "pilot-lamp-yellow",
    "push-button",
    "e-stop",
    "selector-3pos",
    "panel-meter-96",
    "cooling-fan-120",
    "cam-lock",
  ];

  it("contains all 29 industrial standard templates with reference models and IEC prefixes", () => {
    expect(COMPONENT_LIST.length).toBeGreaterThanOrEqual(expectedIds.length);
    for (const id of expectedIds) {
      expect(COMPONENT_CATALOG[id]).toBeDefined();
      const tpl = COMPONENT_CATALOG[id];
      expect(tpl.id).toBe(id);
      expect(tpl.referenceModel.length).toBeGreaterThan(2);
      expect(tpl.tagPrefix.length).toBeGreaterThan(0);
      expect(tpl.widthMm).toBeGreaterThan(0);
      expect(tpl.heightMm).toBeGreaterThan(0);
      expect(tpl.depthMm).toBeGreaterThan(0);
      expect(Array.isArray(tpl.pins)).toBe(true);
      expect(tpl.category).toBeDefined();
      expect(tpl.mountingType).toBeDefined();
    }
  });

  it("verifies real datasheet dimensions and behaviors for key parts", () => {
    // Schneider Acti9 iC60N MCB dimensions (18mm modular pitch)
    expect(COMPONENT_CATALOG["mcb-1p"].widthMm).toBe(18);
    expect(COMPONENT_CATALOG["mcb-2p"].widthMm).toBe(36);
    expect(COMPONENT_CATALOG["mcb-3p"].widthMm).toBe(54);
    expect(COMPONENT_CATALOG["mcb-4p"].widthMm).toBe(72);
    expect(COMPONENT_CATALOG["mcb-1p"].depthMm).toBe(78.5);
    expect(COMPONENT_CATALOG["mcb-1p"].behavior?.sideBySideSnap).toBe(true);

    // Schneider ComPact NSX100 MCCB 3P 100A
    expect(COMPONENT_CATALOG["mccb-100a"].widthMm).toBe(105);
    expect(COMPONENT_CATALOG["mccb-100a"].heightMm).toBe(161);
    expect(COMPONENT_CATALOG["mccb-100a"].depthMm).toBe(86);
    expect(COMPONENT_CATALOG["mccb-100a"].mountingType).toBe("screw_plate");
    expect(COMPONENT_CATALOG["mccb-100a"].behavior?.clearanceMm?.top).toBe(30);

    // TeSys LC1D09 Contactor & LRD08 TOR
    expect(COMPONENT_CATALOG.contactor.name).toContain("LC1D09");
    expect(COMPONENT_CATALOG.contactor.widthMm).toBe(45);
    expect(COMPONENT_CATALOG.contactor.heightMm).toBe(77);
    expect(COMPONENT_CATALOG.contactor.depthMm).toBe(86);
    expect(COMPONENT_CATALOG.tor.name).toContain("LRD08");
    expect(COMPONENT_CATALOG.tor.mountingType).toBe("parent_mount");
    expect(COMPONENT_CATALOG.tor.behavior?.mountTargetTemplateIds).toContain("contactor");

    // Mitsubishi S-T10 Contactor & TH-T18 TOR
    const st10 = COMPONENT_CATALOG["contactor-st10"];
    expect(st10.widthMm).toBe(36);
    expect(st10.heightMm).toBe(75);
    expect(st10.depthMm).toBe(78);
    expect(st10.pins.map((p) => p.label)).toEqual([
      "A2", "A1",
      "1/L1", "3/L2", "5/L3", "13NO",
      "2/T1", "4/T2", "6/T3", "14NO",
    ]);

    const tht18 = COMPONENT_CATALOG["tor-tht18"];
    expect(tht18.widthMm).toBe(46);
    expect(tht18.heightMm).toBe(42);
    expect(tht18.depthMm).toBe(76.5);
    expect(tht18.mountingType).toBe("parent_mount");
    expect(tht18.behavior?.mountTargetTemplateIds).toContain("contactor-st10");
    expect(tht18.pins.map((p) => p.label)).toEqual([
      "98", "97", "95",
      "2/T1", "4/T2", "6/T3", "96",
    ]);

    // Siemens S7-1200 CPU 1214C
    const plc = COMPONENT_CATALOG["plc-compact"];
    expect(plc.widthMm).toBe(110);
    expect(plc.heightMm).toBe(100);
    expect(plc.depthMm).toBe(75);
    const pinLabels = plc.pins.map((p) => p.label);
    expect(pinLabels).toContain("+24V");
    expect(pinLabels).toContain("0V");
    expect(pinLabels).toContain("I0.0");
    expect(pinLabels).toContain("Q0.0");

    // Schneider ATV320 1.5kW Compact VFD
    const vfd = COMPONENT_CATALOG["vfd-15kw"];
    expect(vfd.widthMm).toBe(105);
    expect(vfd.heightMm).toBe(142);
    expect(vfd.depthMm).toBe(158);
    expect(vfd.mountingType).toBe("screw_plate");
    expect(vfd.behavior?.clearanceMm?.top).toBe(100);
    expect(vfd.behavior?.clearanceMm?.bottom).toBe(100);
    const vfdPins = vfd.pins.map((p) => p.label);
    expect(vfdPins).toContain("L1");
    expect(vfdPins).toContain("U");
    expect(vfdPins).toContain("PE");

    // Mean Well NDR-120-24 & NDR-240-24
    expect(COMPONENT_CATALOG["psu-24v"].widthMm).toBe(40);
    expect(COMPONENT_CATALOG["psu-24v-10a"].widthMm).toBe(63);

    // Phoenix Contact UT 4 Terminal Block & CLIPFIX 35
    expect(COMPONENT_CATALOG["terminal-block"].widthMm).toBe(6.2);
    expect(COMPONENT_CATALOG["terminal-block"].heightMm).toBe(47.7);
    expect(COMPONENT_CATALOG["end-clamp"].widthMm).toBe(9.5);

    // Door Controls
    expect(COMPONENT_CATALOG["pilot-lamp-red"].mountingType).toBe("door_cutout");
    expect(COMPONENT_CATALOG["panel-meter-96"].widthMm).toBe(96);
    expect(COMPONENT_CATALOG["panel-meter-96"].heightMm).toBe(96);
    expect(COMPONENT_CATALOG["cooling-fan-120"].widthMm).toBe(120);
    expect(COMPONENT_CATALOG["cooling-fan-120"].heightMm).toBe(120);

    // Relay Sockets Only (MY4N 14-Pin PYF14A & MK3P 11-Pin PF113A)
    const my4n = COMPONENT_CATALOG["relay-socket-my4n"];
    expect(my4n.widthMm).toBe(30);
    expect(my4n.heightMm).toBe(72);
    expect(my4n.depthMm).toBe(30);
    expect(my4n.mountingType).toBe("din_rail");
    expect(my4n.pins).toHaveLength(14);
    expect(my4n.pins.map((p) => p.label)).toEqual([
      "1", "2", "3", "4",
      "5", "6", "7", "8",
      "9", "10", "11", "12",
      "13", "14",
    ]);

    const mk3p = COMPONENT_CATALOG["relay-socket-mk3p"];
    expect(mk3p.widthMm).toBe(42.7);
    expect(mk3p.heightMm).toBe(51);
    expect(mk3p.depthMm).toBe(27);
    expect(mk3p.mountingType).toBe("din_rail");
    expect(mk3p.pins).toHaveLength(11);
    expect(mk3p.pins.map((p) => p.label)).toEqual([
      "2", "1", "11", "10",
      "3", "9",
      "4",
      "5", "6", "7", "8",
    ]);
  });
});
