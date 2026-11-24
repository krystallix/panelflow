"use client";

import {
  ClipboardList,
  Copy,
  Crop,
  FileSpreadsheet,
  Layers,
  MapPin,
  RotateCcw,
  Sliders,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SideSheet, SideSheetHeader } from "@/components/ui";
import { BomPanelTab } from "@/components/ui/BomPanelTab";
import { ComponentsLayersTab } from "@/components/ui/ComponentsLayersTab";
import { PanelSetupTab } from "@/components/ui/PanelSetupTab";
import { computeDoorCutouts, getDoorDimensions } from "@/lib/door-cutout";
import { calculateDuctFillRatio, getDuctFillStatusColor } from "@/lib/duct-fill";
import { getEffectiveCadBounds } from "@/lib/collision";
import { snapToGrid } from "@/lib/snap";
import { formatDim, fromMm, inputStepForUnit, toMm } from "@/lib/units";
import { usePanelStore } from "@/store/usePanelStore";
import {
  type CadLabelPosition,
} from "@/types/panel";
import { saveCustomCadToLibrary, updateCustomCadCloudId } from "@/lib/indexed-db";

export function RightInspector() {
  const displayUnit = usePanelStore((s) => s.displayUnit);
  const gridSnapMm = usePanelStore((s) => s.gridSnapMm);
  const selected = usePanelStore((s) => s.selected);
  const rails = usePanelStore((s) => s.rails);
  const ducts = usePanelStore((s) => s.ducts);
  const components = usePanelStore((s) => s.components);
  const cadAssets = usePanelStore((s) => s.cadAssets);
  const wires = usePanelStore((s) => s.wires);
  const titleBlock = usePanelStore((s) => s.titleBlock);
  const viewportMode = usePanelStore((s) => s.viewportMode);
  const isPinMarkingMode = usePanelStore((s) => s.isPinMarkingMode);
  const activeMarkingAssetId = usePanelStore((s) => s.activeMarkingAssetId);
  const activeSheetType = usePanelStore((s) => s.activeSheetType);
  const enclosure = usePanelStore((s) => s.enclosure);
  const updateEnclosure = usePanelStore((s) => s.updateEnclosure);
  const inspectorFocusNonce = usePanelStore((s) => s.inspectorFocusNonce);
  const rightPanelTab = usePanelStore((s) => s.rightPanelTab);
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab);
  const rightInspectorOpen = usePanelStore((s) => s.rightInspectorOpen);
  const setRightInspectorOpen = usePanelStore((s) => s.setRightInspectorOpen);
  const compNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inspectorFocusNonce > 0 && compNameInputRef.current) {
      compNameInputRef.current.focus();
      compNameInputRef.current.select();
    }
  }, [inspectorFocusNonce]);

  const updateRail = usePanelStore((s) => s.updateRail);
  const removeRail = usePanelStore((s) => s.removeRail);
  const updateDuct = usePanelStore((s) => s.updateDuct);
  const removeDuct = usePanelStore((s) => s.removeDuct);
  const moveComponent = usePanelStore((s) => s.moveComponent);
  const updateComponent = usePanelStore((s) => s.updateComponent);
  const removeComponent = usePanelStore((s) => s.removeComponent);
  const updateCadAsset = usePanelStore((s) => s.updateCadAsset);
  const removeCadAsset = usePanelStore((s) => s.removeCadAsset);
  const updateWire = usePanelStore((s) => s.updateWire);
  const removeWire = usePanelStore((s) => s.removeWire);
  const updateTitleBlock = usePanelStore((s) => s.updateTitleBlock);
  const setPinMarkingMode = usePanelStore((s) => s.setPinMarkingMode);
  const removePinFromAsset = usePanelStore((s) => s.removePinFromAsset);
  const updatePinInAsset = usePanelStore((s) => s.updatePinInAsset);
  const addPinToAsset = usePanelStore((s) => s.addPinToAsset);
  const [savedToLibToast, setSavedToLibToast] = useState(false);
  const updateComponentPin = usePanelStore((s) => s.updateComponentPin);
  const removePinFromComponent = usePanelStore((s) => s.removePinFromComponent);
  const renameGroup = usePanelStore((s) => s.renameGroup);
  const selectedIds = usePanelStore((s) => s.selectedIds);

  const step = inputStepForUnit(displayUnit);

  const rail =
    selected?.kind === "rail"
      ? rails.find((r) => r.id === selected.id)
      : undefined;
  const duct =
    selected?.kind === "duct"
      ? ducts.find((d) => d.id === selected.id)
      : undefined;
  const comp =
    selected?.kind === "component"
      ? components.find((c) => c.id === selected.id)
      : undefined;
  const cad =
    selected?.kind === "cad"
      ? cadAssets.find((a) => a.id === selected.id)
      : undefined;
  const wire =
    selected?.kind === "wire"
      ? wires.find((w) => w.id === selected.id)
      : undefined;

  const ductFillStats = useMemo(() => {
    if (!duct) return null;
    return calculateDuctFillRatio(duct, wires);
  }, [duct, wires]);

  const doorCutoutSpec = useMemo(() => {
    if (activeSheetType !== "door-cutout") return null;
    return computeDoorCutouts(enclosure, components);
  }, [activeSheetType, enclosure, components]);

  const doorHoleBreakdown = useMemo(() => {
    if (!doorCutoutSpec) return [];
    const counts = new Map<string, number>();
    for (const cutout of doorCutoutSpec.cutouts) {
      if (cutout.kind === "circle") {
        const key = `Ø${cutout.mainDiameterMm ?? 22}mm`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      } else if (cutout.kind === "rect") {
        const key = `□ ${cutout.rectWidthMm ?? 92}×${cutout.rectHeightMm ?? 92}mm`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      } else if (cutout.kind === "fan-filter") {
        const keyFan = `Ø${cutout.mainDiameterMm ?? 116}mm (Fan)`;
        counts.set(keyFan, (counts.get(keyFan) ?? 0) + 1);
        const keyCorner = `4x Ø4.5mm (Mount)`;
        counts.set(keyCorner, (counts.get(keyCorner) ?? 0) + 1);
      } else if (cutout.kind === "double-d") {
        const key = `Double-D Ø${cutout.mainDiameterMm ?? 22.5} / ${cutout.flatToFlatMm ?? 20.1}mm`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
  }, [doorCutoutSpec]);

  const inputClass =
    "w-full rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0d111a] px-2.5 py-1.5 font-sans text-xs tabular-nums text-zinc-900 dark:text-slate-100 shadow-xs focus:border-zinc-950 dark:focus:border-white/30 focus:outline-none transition-colors";
  const cardClass =
    "rounded-xl border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-[#171a21] p-3.5 shadow-xs dark:shadow-none";
  const subBoxClass =
    "rounded-lg border border-zinc-200/70 dark:border-white/10 bg-zinc-50 dark:bg-[#0d111a]";

  return (
    <SideSheet
      isOpen={rightInspectorOpen}
      onClose={() => setRightInspectorOpen(false)}
      side="right"
      modal={false}
      widthClassName="w-full sm:w-[350px] md:w-[380px]"
      className="select-none pointer-events-auto"
    >
      <SideSheetHeader
        title="Panel Inspector"
        icon={<Sliders className="w-4 h-4" />}
        onClose={() => setRightInspectorOpen(false)}
        className="py-3.5"
      />

      {/* RelayTest shadcn-style Segmented Tabs with Icons */}
      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="grid grid-cols-3 p-1 rounded-lg bg-zinc-100/80 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 text-xs font-medium">
          <button
            type="button"
            onClick={() => setRightPanelTab("inspector")}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              rightPanelTab === "inspector"
                ? "bg-white dark:bg-[#222733] text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Sliders className="h-3.5 w-3.5 shrink-0" />
            <span>Inspector</span>
          </button>
          <button
            type="button"
            onClick={() => setRightPanelTab("panel")}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              rightPanelTab === "panel"
                ? "bg-white dark:bg-[#222733] text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span>Parts</span>
          </button>
          <button
            type="button"
            onClick={() => setRightPanelTab("bom")}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              rightPanelTab === "bom"
                ? "bg-white dark:bg-[#222733] text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
            <span>BOM</span>
          </button>
        </div>
      </div>

      {rightPanelTab === "bom" ? (
        <BomPanelTab />
      ) : rightPanelTab === "panel" ? (
        <ComponentsLayersTab />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 space-y-3.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Properties ({displayUnit})
            </span>
          </div>

      {activeSheetType === "door-cutout" && doorCutoutSpec && (
        <div className={`${cardClass} space-y-3 border-amber-500/20`}>
          <div className="flex items-center justify-between border-b border-[#e2e8f0] dark:border-white/10 pb-2">
            <span className="font-semibold text-xs text-[#0f172a] dark:text-white flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
              Door Drilling Inspector
            </span>
            <span className="font-sans text-[11px] text-[#64748b] dark:text-slate-400">
              {doorCutoutSpec.cutouts.length} cutouts ({doorCutoutSpec.allHoles.length} holes)
            </span>
          </div>

          {/* Door Parameters Config */}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-[#64748b] dark:text-slate-400">
                Hinge Side
              </span>
              <select
                value={enclosure.doorHingeSide ?? "left"}
                onChange={(e) =>
                  updateEnclosure({
                    doorHingeSide: e.target.value as "left" | "right",
                  })
                }
                className={inputClass}
              >
                <option value="left">Left (Engsel Kiri)</option>
                <option value="right">Right (Engsel Kanan)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#64748b] dark:text-slate-400">
                Door Thickness
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step={0.5}
                  min={1}
                  max={5}
                  value={enclosure.doorThicknessMm ?? 2.0}
                  onChange={(e) =>
                    updateEnclosure({
                      doorThicknessMm: Math.max(
                        0.8,
                        Number.parseFloat(e.target.value) || 2.0
                      ),
                    })
                  }
                  className={inputClass}
                />
                <span className="font-sans text-[11px] text-[#94a3b8]">mm</span>
              </div>
            </label>
          </div>

          {/* Cutout Diameter & Type Breakdown */}
          <div className="space-y-1.5 pt-1">
            <span className="text-xs font-semibold text-[#64748b] dark:text-slate-400">
              Cutout / Hole Breakdown:
            </span>
            {doorHoleBreakdown.length === 0 ? (
              <p className="font-sans text-[11px] text-[#94a3b8] italic">
                No door components placed yet. Drag pilot lamps, buttons, or meters onto door sheet.
              </p>
            ) : (
              <div className="space-y-1">
                {doorHoleBreakdown.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between px-2.5 py-1 text-[11px] font-sans ${subBoxClass}`}
                  >
                    <span className="text-[#0f172a] dark:text-slate-200">
                      {item.label}
                    </span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {item.count}x
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exclusion Zone Violations */}
          {doorCutoutSpec.violations.length > 0 && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Exclusion Zone Warning!</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-400">
                {doorCutoutSpec.violations.map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!selected && selectedIds.length > 1 && (() => {
        // Find if multiple selected items share a common groupId
        const selectedComps = components.filter((c) => selectedIds.some((s) => s.kind === "component" && s.id === c.id));
        const selectedCads = cadAssets.filter((a) => selectedIds.some((s) => s.kind === "cad" && s.id === a.id));
        const groupIds = new Set<string>();
        for (const c of selectedComps) if (c.groupId) groupIds.add(c.groupId);
        for (const a of selectedCads) if (a.groupId) groupIds.add(a.groupId);
        const singleGroupId = groupIds.size === 1 ? Array.from(groupIds)[0] : null;
        const currentGroupItem = singleGroupId
          ? selectedComps.find((c) => c.groupId === singleGroupId) || selectedCads.find((a) => a.groupId === singleGroupId)
          : null;

        return (
          <div className="space-y-3">
            <div className={`${cardClass} space-y-3`}>
              <div className="flex items-center justify-between border-b border-[#e2e8f0] dark:border-white/10 pb-2">
                <span className="font-sans text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                  <Layers className="h-4 w-4" />
                  Multiple Selection ({selectedIds.length})
                </span>
              </div>
              <div className={`${subBoxClass} p-2 text-xs text-[#64748b] dark:text-slate-400 space-y-1`}>
                <div>Components: {selectedComps.length}</div>
                <div>Custom CADs: {selectedCads.length}</div>
                {singleGroupId && (
                  <div className="pt-1 border-t border-[#e2e8f0] dark:border-white/10 text-purple-600 dark:text-purple-400 font-semibold">
                    Shared Group: {currentGroupItem?.groupName || singleGroupId}
                  </div>
                )}
              </div>
              {singleGroupId && (
                <label className="block space-y-1">
                  <span className="text-xs text-[#64748b] dark:text-slate-400">Rename Group</span>
                  <input
                    type="text"
                    value={currentGroupItem?.groupName ?? ""}
                    placeholder={singleGroupId}
                    onChange={(e) => renameGroup(singleGroupId, e.target.value)}
                    className={inputClass}
                  />
                </label>
              )}
            </div>
          </div>
        );
      })()}

      {!selected && selectedIds.length <= 1 && (
        <div className="space-y-3 text-xs text-[#64748b] dark:text-slate-400">
          {activeSheetType === "door-cutout" && doorCutoutSpec && (
            <div className={`${cardClass} space-y-3 border-sky-500/30 bg-sky-500/5`}>
              <div className="flex items-center justify-between border-b border-[#e2e8f0] dark:border-white/10 pb-2">
                <span className="font-sans text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  Door Cutout &amp; Drilling Mal
                </span>
                <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-sans text-[11px] font-bold text-sky-600 dark:text-sky-300">
                  {doorCutoutSpec.cutouts.length} Cutouts
                </span>
              </div>

              {/* Hinge Side & Door Thickness Controls */}
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[11px] text-[#64748b] dark:text-slate-400">Hinge Side</span>
                  <select
                    value={enclosure.doorHingeSide ?? "left"}
                    onChange={(e) =>
                      updateEnclosure({
                        doorHingeSide: e.target.value as "left" | "right",
                      })
                    }
                    className={inputClass}
                  >
                    <option value="left">Left (Engsel Kiri)</option>
                    <option value="right">Right (Engsel Kanan)</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-[#64748b] dark:text-slate-400">Plate Thick (mm)</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={enclosure.doorThicknessMm ?? 2.0}
                    onChange={(e) =>
                      updateEnclosure({
                        doorThicknessMm: parseFloat(e.target.value) || 2.0,
                      })
                    }
                    className={inputClass}
                  />
                </label>
              </div>

              {/* Cutout / Drilling Breakdown */}
              <div className="space-y-1.5 border-t border-[#e2e8f0] dark:border-white/10 pt-2">
                <div className="flex items-center justify-between font-sans text-[11px] font-semibold text-[#0f172a] dark:text-slate-200">
                  <span>Hole Breakdown</span>
                  <span className="text-[10px] text-[#64748b] dark:text-slate-400">
                    Total Holes: {doorCutoutSpec.allHoles.length}
                  </span>
                </div>
                {doorHoleBreakdown.length === 0 ? (
                  <p className="text-[11px] italic text-[#94a3b8] dark:text-slate-500">
                    No door cutout components placed yet. Drag pilot lamps, push buttons, or meters from the left panel.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {doorHoleBreakdown.map((item, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between ${subBoxClass} px-2 py-1 font-sans text-[11px]`}
                      >
                        <span className="text-[#334155] dark:text-slate-300">{item.label}</span>
                        <span className="font-bold text-sky-600 dark:text-sky-400">{item.count}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Violations Warning */}
              {doorCutoutSpec.violations.length > 0 && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 space-y-1 text-rose-600 dark:text-rose-400">
                  <div className="flex items-center gap-1 font-semibold text-[11px]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Exclusion Zone Warning!</span>
                  </div>
                  {doorCutoutSpec.violations.map((v, i) => (
                    <p key={i} className="text-[10px] leading-tight">
                      • {v.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <PanelSetupTab />

          {viewportMode === "2d" && (
            <div className={`${cardClass} space-y-2.5`}>
              <div className="font-sans text-xs font-semibold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
                2D Plot Frame / Title Block
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-[#64748b] dark:text-slate-400">Project Name</span>
                <input
                  type="text"
                  value={titleBlock.projectName}
                  onChange={(e) =>
                    updateTitleBlock({ projectName: e.target.value })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-[#64748b] dark:text-slate-400">Drawer</span>
                <input
                  type="text"
                  value={titleBlock.drawer}
                  onChange={(e) => updateTitleBlock({ drawer: e.target.value })}
                  className={inputClass}
                />
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <label className="space-y-1">
                  <span className="text-xs text-[#64748b] dark:text-slate-400">Sheet</span>
                  <input
                    type="text"
                    value={titleBlock.sheetNo}
                    onChange={(e) =>
                      updateTitleBlock({ sheetNo: e.target.value })
                    }
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-[#64748b] dark:text-slate-400">Scale</span>
                  <input
                    type="text"
                    value={titleBlock.scale}
                    onChange={(e) =>
                      updateTitleBlock({ scale: e.target.value })
                    }
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-[#64748b] dark:text-slate-400">Rev</span>
                  <input
                    type="text"
                    value={titleBlock.rev}
                    onChange={(e) => updateTitleBlock({ rev: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {wire && (
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-[#0f172a] dark:text-white">Wire {wire.label}</span>
            <button
              type="button"
              onClick={() => removeWire(wire.id)}
              className="text-[#94a3b8] dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-[#64748b] dark:text-slate-400">Wire Tag / Code</span>
            <input
              type="text"
              value={wire.label}
              onChange={(e) => updateWire(wire.id, { label: e.target.value })}
              className={inputClass}
            />
          </label>

          <div className="space-y-2.5">
            <div className="space-y-1.5">
              <span className="text-xs text-[#64748b] dark:text-slate-400">Wire Color</span>
              <div className="flex items-center gap-2 pt-0.5">
                {(
                  [
                    { code: "R", label: "R (L1)", hex: "#dc2626" },
                    { code: "S", label: "S (L2)", hex: "#eab308" },
                    { code: "T", label: "T (L3)", hex: "#2563eb" },
                    { code: "N", label: "N (Neutral)", hex: "#0284c7" },
                    { code: "PE", label: "PE (Earth)", hex: "#16a34a" },
                    { code: "DC+", label: "+24V DC", hex: "#ef4444" },
                    { code: "DC-", label: "0V DC", hex: "#1e293b" },
                  ] as const
                ).map((wc) => {
                  const active = wire.colorCode === wc.code;
                  return (
                    <button
                      key={wc.code}
                      type="button"
                      onClick={() => updateWire(wire.id, { colorCode: wc.code })}
                      title={wc.label}
                      aria-label={wc.label}
                      style={{ backgroundColor: wc.hex }}
                      className={`h-5 w-5 rounded-full transition-transform cursor-pointer border ${
                        active
                          ? "scale-115 border-white ring-2 ring-slate-900 dark:ring-white shadow-xs"
                          : "border-black/20 hover:scale-110 opacity-85 hover:opacity-100"
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            <label className="block space-y-1">
              <span className="text-xs text-[#64748b] dark:text-slate-400">Wire Size (mm²)</span>
              <select
                value={wire.gaugeMm2}
                onChange={(e) => updateWire(wire.id, { gaugeMm2: e.target.value })}
                className={inputClass}
              >
                {["0.75", "1.0", "1.5", "2.5", "4.0", "6.0", "10.0", "16.0"].map((g) => (
                  <option key={g} value={g}>
                    {g} mm²
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {rail && (
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-[#0f172a] dark:text-white">{rail.name}</span>
            <button
              type="button"
              onClick={() => removeRail(rail.id)}
              className="text-[#94a3b8] dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-[#64748b] dark:text-slate-400">
                X ({displayUnit})
              </span>
              <input
                type="number"
                step={step}
                value={Number(fromMm(rail.xMm, displayUnit).toFixed(3))}
                onChange={(e) =>
                  updateRail(rail.id, {
                    xMm: snapToGrid(
                      toMm(Number.parseFloat(e.target.value) || 0, displayUnit),
                      gridSnapMm
                    ),
                  })
                }
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#64748b] dark:text-slate-400">
                Y ({displayUnit})
              </span>
              <input
                type="number"
                step={step}
                value={Number(fromMm(rail.yMm, displayUnit).toFixed(3))}
                onChange={(e) =>
                  updateRail(rail.id, {
                    yMm: snapToGrid(
                      toMm(Number.parseFloat(e.target.value) || 0, displayUnit),
                      gridSnapMm
                    ),
                  })
                }
                className={inputClass}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-[#64748b] dark:text-slate-400">
              Length ({displayUnit})
            </span>
            <input
              type="number"
              step={step}
              value={Number(fromMm(rail.lengthMm, displayUnit).toFixed(3))}
              onChange={(e) =>
                updateRail(rail.id, {
                  lengthMm: Math.max(
                    50,
                    toMm(Number.parseFloat(e.target.value) || 50, displayUnit)
                  ),
                })
              }
              className={inputClass}
            />
          </label>
        </div>
      )}

      {duct && (
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-[#0f172a] dark:text-white">{duct.name}</span>
            <button
              type="button"
              onClick={() => removeDuct(duct.id)}
              className="text-[#94a3b8] dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["X", "xMm"],
                ["Y", "yMm"],
                ["Width", "widthMm"],
                ["Height", "heightMm"],
              ] as const
            ).map(([label, key]) => (
              <label key={key} className="space-y-1">
                <span className="text-xs text-[#64748b] dark:text-slate-400">
                  {label} ({displayUnit})
                </span>
                <input
                  type="number"
                  step={step}
                  value={Number(fromMm(duct[key], displayUnit).toFixed(3))}
                  onChange={(e) => {
                    const mm = toMm(
                      Number.parseFloat(e.target.value) || 0,
                      displayUnit
                    );
                    updateDuct(duct.id, {
                      [key]:
                        key === "widthMm" || key === "heightMm"
                          ? Math.max(15, mm)
                          : snapToGrid(mm, gridSnapMm),
                    });
                  }}
                  className={inputClass}
                />
              </label>
            ))}
          </div>

          {/* Wire Duct Fill Ratio Gauge & Capacity Metrics */}
          {ductFillStats && (
            <div className={`${subBoxClass} p-2.5 space-y-2`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#0f172a] dark:text-white uppercase tracking-wider">
                  Fill Ratio
                </span>
                <span
                  className="font-sans text-xs font-bold px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: getDuctFillStatusColor(ductFillStats.status).badgeBg,
                    color: getDuctFillStatusColor(ductFillStats.status).badgeText,
                  }}
                >
                  {ductFillStats.fillRatioPercent}%
                </span>
              </div>

              {/* Progress / Gauge Bar */}
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.min(100, ductFillStats.fillRatioPercent)}%`,
                    backgroundColor: getDuctFillStatusColor(ductFillStats.status).gaugeColor,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-1 text-[11px] font-sans text-[#64748b] dark:text-slate-400">
                <div>
                  Wires: <span className="text-[#0f172a] dark:text-slate-200 font-semibold">{ductFillStats.wireCount}</span>
                </div>
                <div>
                  Total: <span className="text-[#0f172a] dark:text-slate-200 font-semibold">{ductFillStats.totalCableAreaMm2} mm²</span>
                </div>
                <div className="col-span-2">
                  Capacity: <span className="text-[#0f172a] dark:text-slate-200 font-semibold">{ductFillStats.effectiveCapacityMm2} mm²</span> (60% usable)
                </div>
              </div>

              {ductFillStats.status === "warning" && ductFillStats.recommendedSize && (
                <div className="rounded border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 p-2 text-[11px] text-rose-700 dark:text-rose-300 space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    ⚠️ Overfill Warning (&gt;70%)
                  </div>
                  <div>
                    Recommended Size:{" "}
                    <span className="font-sans font-bold">
                      {ductFillStats.recommendedSize.label} mm
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {comp && (
        <div className="space-y-3">
          <div className={`${cardClass} space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <input
                ref={compNameInputRef}
                type="text"
                value={comp.name}
                onChange={(e) =>
                  updateComponent(comp.id, { name: e.target.value })
                }
                className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 font-semibold text-sm text-[#0f172a] dark:text-white hover:border-[#e2e8f0] dark:hover:border-white/15 focus:border-[#0284c7] dark:focus:border-white/30 focus:bg-[#f8fafc] dark:focus:bg-[#090b10] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeComponent(comp.id)}
                className="shrink-0 text-[#94a3b8] dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className={`${subBoxClass} p-2 font-sans text-[11px] tabular-nums text-[#64748b] dark:text-slate-400`}>
              BBox: {formatDim(comp.widthMm, displayUnit)} ×{" "}
              {formatDim(comp.heightMm, displayUnit)} ×{" "}
              {formatDim(comp.depthMm, displayUnit)}
              <br />
              Rail: {rails.find((r) => r.id === comp.railId)?.name ?? "Unmounted"}
              {comp.groupId && (
                <div className="mt-1.5 pt-1.5 border-t border-[#e2e8f0] dark:border-white/10 space-y-1">
                  <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-sans text-[11px] font-semibold">
                    <Layers className="h-3.5 w-3.5" />
                    <span>Group Assembly: {comp.groupName || comp.groupId}</span>
                  </div>
                  <label className="block space-y-0.5">
                    <span className="text-[10px] text-[#64748b] dark:text-slate-400">Rename Group</span>
                    <input
                      type="text"
                      value={comp.groupName ?? ""}
                      placeholder={comp.groupId}
                      onChange={(e) => renameGroup(comp.groupId!, e.target.value)}
                      className={inputClass}
                    />
                  </label>
                </div>
              )}
              {comp.locked && (
                <>
                  <br />
                  <span className="text-amber-500 font-sans font-medium text-[11px]">
                    🔒 Position Locked
                  </span>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-[#64748b] dark:text-slate-400">
                  X ({displayUnit})
                </span>
                <input
                  type="number"
                  step={step}
                  value={Number(fromMm(comp.xMm, displayUnit).toFixed(3))}
                  onChange={(e) =>
                    moveComponent(
                      comp.id,
                      toMm(Number.parseFloat(e.target.value) || 0, displayUnit),
                      comp.yMm
                    )
                  }
                  className={inputClass}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-[#64748b] dark:text-slate-400">
                  Y ({displayUnit})
                </span>
                <input
                  type="number"
                  step={step}
                  value={Number(fromMm(comp.yMm, displayUnit).toFixed(3))}
                  onChange={(e) =>
                    moveComponent(
                      comp.id,
                      comp.xMm,
                      toMm(Number.parseFloat(e.target.value) || 0, displayUnit)
                    )
                  }
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          <div className={`${cardClass} space-y-2`}>
            <div className="font-sans text-xs font-semibold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
              Pin Terminals ({comp.pins.length})
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {comp.pins.map((pin) => (
                <div
                  key={pin.id}
                  className={`flex items-center justify-between gap-1.5 ${subBoxClass} px-2 py-1 font-sans text-[11px] tabular-nums`}
                >
                  <input
                    type="text"
                    value={pin.label}
                    onChange={(e) =>
                      updateComponentPin(comp.id, pin.id, { label: e.target.value })
                    }
                    className="w-16 rounded border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-300 font-semibold focus:outline-none focus:border-amber-500"
                    title="Edit pin label"
                  />
                  <span className="text-[#64748b] dark:text-slate-400 text-[10px]">
                    ({pin.localXMm}, {pin.localYMm})
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      onClick={() => {
                        const coord = `${pin.localXMm}, ${pin.localYMm}, ${pin.localZMm ?? 0}`;
                        navigator.clipboard?.writeText(coord);
                      }}
                      title="Copy coordinates (mm)"
                      className="rounded p-1 text-[#94a3b8] dark:text-slate-500 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePinFromComponent(comp.id, pin.id)}
                      title="Delete pin"
                      className="rounded p-1 text-[#94a3b8] dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {cad && (() => {
        const effBounds = getEffectiveCadBounds(cad);
        const crop = cad.cropMm ?? { top: 0, bottom: 0, left: 0, right: 0 };
        const hasCrop = crop.top > 0 || crop.bottom > 0 || crop.left > 0 || crop.right > 0;
        const updateCrop = (side: "top" | "bottom" | "left" | "right", rawVal: string) => {
          const valMm = Math.max(0, toMm(Number.parseFloat(rawVal) || 0, displayUnit));
          const next = { ...crop, [side]: valMm };
          const allZero = next.top === 0 && next.bottom === 0 && next.left === 0 && next.right === 0;
          updateCadAsset(cad.id, { cropMm: allZero ? undefined : next });
        };

        return (
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={cad.name}
              onChange={(e) => updateCadAsset(cad.id, { name: e.target.value })}
              className="font-semibold text-xs text-[#0f172a] dark:text-white bg-transparent border-b border-transparent hover:border-[#cbd5e1] focus:border-sky-500 focus:outline-none px-0.5"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const saved = await saveCustomCadToLibrary(cad);
                    fetch("/api/custom-parts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: cad.name,
                        format: cad.format,
                        bounding_box: cad.cropMm
                          ? { ...cad.boundingBoxMm, cropMm: cad.cropMm }
                          : cad.boundingBoxMm,
                        pins: cad.pins,
                        cad_data: cad.rawText || cad.dataUrl || null,
                      }),
                    })
                      .then((res) => (res.ok ? res.json() : null))
                      .then((data) => {
                        const cloudId = data?.part?.id;
                        if (typeof cloudId === "string" && cloudId) {
                          updateCustomCadCloudId(saved.id, cloudId).catch(() => {});
                        }
                      })
                      .catch(() => {});
                    setSavedToLibToast(true);
                    setTimeout(() => setSavedToLibToast(false), 2000);
                  } catch {
                    // ignore
                  }
                }}
                title="Save to My CAD Library"
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors flex items-center gap-1 ${
                  savedToLibToast
                    ? "bg-emerald-500 text-white"
                    : "border border-sky-500/40 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                }`}
              >
                {savedToLibToast ? "✓ Saved" : "Save to Lib"}
              </button>
              <button
                type="button"
                onClick={() => removeCadAsset(cad.id)}
                className="text-[#94a3b8] dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 p-0.5"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className={`${subBoxClass} p-2 font-sans text-[11px] tabular-nums text-[#64748b] dark:text-slate-400 space-y-0.5`}>
            <div>
              Normalized BBox: {formatDim(cad.boundingBoxMm.w, displayUnit)} ×{" "}
              {formatDim(cad.boundingBoxMm.h, displayUnit)} ×{" "}
              {formatDim(cad.boundingBoxMm.d, displayUnit)}
            </div>
            {hasCrop && (
              <div className="text-sky-600 dark:text-sky-400 font-semibold">
                Cropped BBox: {formatDim(effBounds.widthMm, displayUnit)} ×{" "}
                {formatDim(effBounds.heightMm, displayUnit)}
              </div>
            )}
            {cad.groupId && (
              <div className="mt-1.5 pt-1.5 border-t border-[#e2e8f0] dark:border-white/10 space-y-1">
                <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-sans text-[11px] font-semibold">
                  <Layers className="h-3.5 w-3.5" />
                  <span>Group Assembly: {cad.groupName || cad.groupId}</span>
                </div>
                <label className="block space-y-0.5">
                  <span className="text-[10px] text-[#64748b] dark:text-slate-400">Rename Group</span>
                  <input
                    type="text"
                    value={cad.groupName ?? ""}
                    placeholder={cad.groupId}
                    onChange={(e) => renameGroup(cad.groupId!, e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            )}
            {cad.locked && (
              <div className="text-amber-500 font-sans font-medium text-[11px]">
                🔒 Position Locked
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["X", "xMm"],
                ["Y", "yMm"],
                ["Z", "zMm"],
              ] as const
            ).map(([label, key]) => (
              <label key={key} className="space-y-1">
                <span className="text-xs text-[#64748b] dark:text-slate-400">{label}</span>
                <input
                  type="number"
                  step={step}
                  value={Number(fromMm(cad[key], displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateCadAsset(cad.id, {
                      [key]: toMm(
                        Number.parseFloat(e.target.value) || 0,
                        displayUnit
                      ),
                    })
                  }
                  className={inputClass}
                />
              </label>
            ))}
          </div>

          {/* Physical Dimensions (W x H x D) with optional Aspect Ratio Lock */}
          <div className="space-y-2 border-t border-[#e2e8f0] dark:border-white/10 pt-2.5">
            <div className="flex items-center justify-between">
              <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
                Dimensions ({displayUnit})
              </span>
              <button
                type="button"
                onClick={() =>
                  updateCadAsset(cad.id, {
                    lockAspectRatio: !(cad.lockAspectRatio ?? false),
                  })
                }
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  (cad.lockAspectRatio ?? false)
                    ? "bg-sky-500/10 text-sky-500 border border-sky-500/20"
                    : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-[#cbd5e1] dark:border-white/10"
                }`}
                title={
                  (cad.lockAspectRatio ?? false)
                    ? "Lock Aspect Ratio active"
                    : "Aspect Ratio unlocked (independent W & H)"
                }
              >
                <span>{(cad.lockAspectRatio ?? false) ? "🔒 Lock Ratio" : "🔓 Free Ratio"}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <label className="space-y-0.5">
                <span className="text-[11px] text-[#64748b] dark:text-slate-400">W</span>
                <input
                  type="number"
                  min={1}
                  step={step}
                  value={Number(fromMm(cad.boundingBoxMm.w, displayUnit).toFixed(2))}
                  onChange={(e) => {
                    const newW = Math.max(1, toMm(Number.parseFloat(e.target.value) || 1, displayUnit));
                    const isLocked = cad.lockAspectRatio ?? false;
                    const ratio = cad.boundingBoxMm.w > 0 ? cad.boundingBoxMm.h / cad.boundingBoxMm.w : 1;
                    const newH = isLocked ? Number((newW * ratio).toFixed(2)) : cad.boundingBoxMm.h;
                    updateCadAsset(cad.id, {
                      boundingBoxMm: {
                        ...cad.boundingBoxMm,
                        w: newW,
                        h: newH,
                      },
                    });
                  }}
                  className={inputClass}
                />
              </label>

              <label className="space-y-0.5">
                <span className="text-[11px] text-[#64748b] dark:text-slate-400">H</span>
                <input
                  type="number"
                  min={1}
                  step={step}
                  value={Number(fromMm(cad.boundingBoxMm.h, displayUnit).toFixed(2))}
                  onChange={(e) => {
                    const newH = Math.max(1, toMm(Number.parseFloat(e.target.value) || 1, displayUnit));
                    const isLocked = cad.lockAspectRatio ?? false;
                    const ratio = cad.boundingBoxMm.h > 0 ? cad.boundingBoxMm.w / cad.boundingBoxMm.h : 1;
                    const newW = isLocked ? Number((newH * ratio).toFixed(2)) : cad.boundingBoxMm.w;
                    updateCadAsset(cad.id, {
                      boundingBoxMm: {
                        ...cad.boundingBoxMm,
                        w: newW,
                        h: newH,
                      },
                    });
                  }}
                  className={inputClass}
                />
              </label>

              <label className="space-y-0.5">
                <span className="text-[11px] text-[#64748b] dark:text-slate-400">D</span>
                <input
                  type="number"
                  min={1}
                  step={step}
                  value={Number(fromMm(cad.boundingBoxMm.d, displayUnit).toFixed(2))}
                  onChange={(e) => {
                    const newD = Math.max(1, toMm(Number.parseFloat(e.target.value) || 1, displayUnit));
                    updateCadAsset(cad.id, {
                      boundingBoxMm: {
                        ...cad.boundingBoxMm,
                        d: newD,
                      },
                    });
                  }}
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          {/* Non-Destructive CAD Crop / Trim */}
          <div className="space-y-2 border-t border-[#e2e8f0] dark:border-white/10 pt-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
                <Crop className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
                CAD Crop / Trim ({displayUnit})
              </span>
              <button
                type="button"
                disabled={!hasCrop}
                onClick={() => updateCadAsset(cad.id, { cropMm: undefined })}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[10px] transition-colors ${
                  hasCrop
                    ? "text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                    : "text-[#94a3b8] dark:text-slate-600 cursor-not-allowed"
                }`}
              >
                <RotateCcw className="h-3 w-3" />
                Reset Crop
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["Top", "top"],
                  ["Bottom", "bottom"],
                  ["Left", "left"],
                  ["Right", "right"],
                ] as const
              ).map(([label, side]) => (
                <label key={side} className="space-y-0.5">
                  <span className="text-[11px] text-[#64748b] dark:text-slate-400">
                    {label}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={step}
                    value={Number(fromMm(crop[side], displayUnit).toFixed(2))}
                    onChange={(e) => updateCrop(side, e.target.value)}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>

            <div className="flex items-center gap-1 pt-0.5">
              <span className="font-sans text-[10px] text-[#94a3b8] dark:text-slate-500 mr-1">
                Top preset:
              </span>
              {[10, 15, 20].map((presetMm) => (
                <button
                  key={presetMm}
                  type="button"
                  onClick={() =>
                    updateCadAsset(cad.id, {
                      cropMm: { ...crop, top: presetMm },
                    })
                  }
                  className={`rounded border px-1.5 py-0.5 font-sans text-[10px] transition-colors ${
                    Math.abs(crop.top - presetMm) < 0.01
                      ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold"
                      : "border-[#e2e8f0] dark:border-white/10 text-[#64748b] dark:text-slate-400 hover:border-sky-400"
                  }`}
                >
                  {presetMm}mm
                </button>
              ))}
            </div>
          </div>

          {cad.imageOverlayUrl && (
            <div className="space-y-2 border-t border-[#e2e8f0] dark:border-white/10 pt-2.5">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-medium text-[#0f172a] dark:text-slate-200">
                  Show Image Overlay
                </span>
                <input
                  type="checkbox"
                  checked={cad.showImageOverlay ?? true}
                  onChange={(e) =>
                    updateCadAsset(cad.id, { showImageOverlay: e.target.checked })
                  }
                  className="rounded border-[#cbd5e1] text-[#0284c7] focus:ring-[#0284c7]"
                />
              </label>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#64748b] dark:text-slate-400">Image Opacity</span>
                  <span className="font-sans text-sky-600 dark:text-sky-400">
                    {Math.round((cad.imageOpacity ?? 1.0) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={cad.imageOpacity ?? 1.0}
                  onChange={(e) =>
                    updateCadAsset(cad.id, {
                      imageOpacity: Number.parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Quick Pin Generators along Center & Edges */}
          {(() => {
            const addDistributedAxisPins = (addCount: number) => {
              const w = effBounds.widthMm;
              const h = effBounds.heightMm;
              const isHoriz = w >= h;
              const span = isHoriz ? w : h;

              // Separate existing pins along the main center axis vs off-axis pins
              const axisPins = cad.pins
                .filter((p) => Math.abs(isHoriz ? p.localYMm : p.localXMm) <= 2)
                .sort((a, b) =>
                  isHoriz ? a.localXMm - b.localXMm : a.localYMm - b.localYMm
                );
              const otherPins = cad.pins.filter(
                (p) => Math.abs(isHoriz ? p.localYMm : p.localXMm) > 2
              );

              const usedLabels = new Set(cad.pins.map((p) => p.label.toUpperCase()));
              let nextNum = 1;
              const nextUniqueLabel = () => {
                while (usedLabels.has(`P${nextNum}`)) nextNum++;
                const lbl = `P${nextNum}`;
                usedLabels.add(lbl);
                nextNum++;
                return lbl;
              };

              const now = Date.now();
              const newPins = Array.from({ length: addCount }, (_, idx) => ({
                id: `pin-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
                label: nextUniqueLabel(),
                localXMm: 0,
                localYMm: 0,
                localZMm: 0,
              }));

              const combinedAxis = [...axisPins, ...newPins];
              const total = combinedAxis.length;
              const step = span / (total + 1);
              const redistributed = combinedAxis.map((p, idx) => {
                const offset = Number((-span / 2 + step * (idx + 1)).toFixed(1));
                return {
                  ...p,
                  localXMm: isHoriz ? offset : 0,
                  localYMm: isHoriz ? 0 : offset,
                };
              });

              updateCadAsset(cad.id, { pins: [...otherPins, ...redistributed] });
            };

            const addCornerPins = () => {
              const w = effBounds.widthMm;
              const h = effBounds.heightMm;
              const hw = Number((w / 2 - 2).toFixed(1));
              const hh = Number((h / 2 - 2).toFixed(1));
              const corners = [
                { x: -hw, y: -hh, l: "C1" },
                { x: hw, y: -hh, l: "C2" },
                { x: -hw, y: hh, l: "C3" },
                { x: hw, y: hh, l: "C4" },
              ];
              const now = Date.now();
              const additions = corners
                .filter(
                  (c) =>
                    !cad.pins.some(
                      (p) => Math.hypot(p.localXMm - c.x, p.localYMm - c.y) < 2
                    )
                )
                .map((c, idx) => ({
                  id: `pin-${now}-c${idx}-${Math.random().toString(36).slice(2, 6)}`,
                  label: c.l,
                  localXMm: c.x,
                  localYMm: c.y,
                  localZMm: 0,
                }));
              if (additions.length === 0) return;
              updateCadAsset(cad.id, { pins: [...cad.pins, ...additions] });
            };

            return (
              <div className="space-y-1.5 border-t border-[#e2e8f0] dark:border-white/10 pt-2.5">
                <span className="text-xs font-semibold text-[#64748b] dark:text-slate-400">
                  Quick Pin Placement
                </span>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => addDistributedAxisPins(1)}
                    className="rounded border border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#090b10] px-1.5 py-1 text-[10px] font-medium text-[#0f172a] dark:text-slate-200 hover:border-sky-500 hover:text-sky-600 transition-colors cursor-pointer"
                    title="Tambah 1 pin dan distribusikan rata sepanjang sumbu"
                  >
                    +1 Pin
                  </button>
                  <button
                    type="button"
                    onClick={() => addDistributedAxisPins(3)}
                    className="rounded border border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#090b10] px-1.5 py-1 text-[10px] font-medium text-[#0f172a] dark:text-slate-200 hover:border-sky-500 hover:text-sky-600 transition-colors cursor-pointer"
                    title="Tambah 3 pin dan distribusikan rata sepanjang sumbu"
                  >
                    +3 Pins
                  </button>
                  <button
                    type="button"
                    onClick={addCornerPins}
                    className="rounded border border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#090b10] px-1.5 py-1 text-[10px] font-medium text-[#0f172a] dark:text-slate-200 hover:border-sky-500 hover:text-sky-600 transition-colors cursor-pointer"
                    title="Tambah 4 pin di sudut shape"
                  >
                    +4 Corners
                  </button>
                </div>
              </div>
            );
          })()}

          <label className="block space-y-1 border-t border-[#e2e8f0] dark:border-white/10 pt-2.5">
            <span className="text-xs text-[#64748b] dark:text-slate-400">
              Label Position
            </span>
            <select
              value={cad.labelPosition ?? "auto"}
              onChange={(e) =>
                updateCadAsset(cad.id, {
                  labelPosition: e.target.value as CadLabelPosition,
                })
              }
              className={inputClass}
            >
              <option value="auto">Auto (Smart Shift)</option>
              <option value="top">Top</option>
              <option value="right">Right</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() =>
              setPinMarkingMode(
                !(isPinMarkingMode && activeMarkingAssetId === cad.id),
                cad.id
              )
            }
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 font-sans text-xs font-medium transition-colors ${
              isPinMarkingMode && activeMarkingAssetId === cad.id
                ? "bg-amber-500 text-black font-semibold"
                : "border border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#090b10] text-[#0f172a] dark:text-slate-200 hover:border-[#cbd5e1] dark:hover:border-white/25"
            }`}
          >
            <MapPin className="h-4 w-4" />
            {isPinMarkingMode && activeMarkingAssetId === cad.id
              ? "Done Marking Pins"
              : "Mark Pins on Mesh"}
          </button>

          <div className="space-y-1.5 border-t border-[#e2e8f0] dark:border-white/10 pt-2">
            <div className="font-sans text-xs font-semibold uppercase text-[#64748b] dark:text-slate-400">
              Marked Pins ({cad.pins.length})
            </div>
            {cad.pins.map((pin) => (
              <div
                key={pin.id}
                className={`flex items-center justify-between gap-1.5 ${subBoxClass} px-2 py-1 font-sans text-[11px] tabular-nums`}
              >
                <input
                  type="text"
                  value={pin.label}
                  onChange={(e) =>
                    updatePinInAsset(cad.id, pin.id, { label: e.target.value })
                  }
                  className="w-16 rounded border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-300 font-semibold focus:outline-none focus:border-amber-500"
                  title="Edit pin label"
                />
                <span className="text-[#64748b] dark:text-slate-400 text-[10px]">
                  ({pin.localXMm},{pin.localYMm})
                </span>
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    type="button"
                    onClick={() => {
                      const coord = `${pin.localXMm}, ${pin.localYMm}, ${pin.localZMm ?? 0}`;
                      navigator.clipboard?.writeText(coord);
                    }}
                    title="Copy coordinates (mm)"
                    className="rounded p-1 text-[#94a3b8] dark:text-slate-500 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removePinFromAsset(cad.id, pin.id)}
                    title="Delete pin"
                    className="rounded p-1 text-[#94a3b8] dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        );
      })()}
        </div>
      )}
    </SideSheet>
  );
}
