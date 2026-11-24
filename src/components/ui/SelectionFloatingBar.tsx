"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  ArrowRightLeft,
  Copy,
  Group,
  Lock,
  MapPin,
  Maximize2,
  RotateCw,
  Trash2,
  Ungroup,
  Unlock,
} from "lucide-react";
import { usePanelStore } from "@/store/usePanelStore";
import type { WireColorCode } from "@/types/panel";

const WIRE_COLOR_SWATCHES: { code: WireColorCode; label: string; hex: string }[] = [
  { code: "R", label: "R (L1)", hex: "#dc2626" },
  { code: "S", label: "S (L2)", hex: "#eab308" },
  { code: "T", label: "T (L3)", hex: "#2563eb" },
  { code: "N", label: "N (Neutral)", hex: "#0284c7" },
  { code: "PE", label: "PE (Earth)", hex: "#16a34a" },
  { code: "DC+", label: "+24V DC", hex: "#ef4444" },
  { code: "DC-", label: "0V DC", hex: "#1e293b" },
];

const WIRE_GAUGES = ["0.75", "1.0", "1.5", "2.5", "4.0", "6.0", "10.0", "16.0"] as const;

interface SelectionFloatingBarProps {
  anchorPos?: { x: number; y: number } | null;
  placement?: "top" | "bottom";
  visible?: boolean;
}

export function SelectionFloatingBar({
  anchorPos,
  placement = "top",
  visible = true,
}: SelectionFloatingBarProps) {
  const selected = usePanelStore((s) => s.selected);
  const selectedIds = usePanelStore((s) => s.selectedIds);
  const components = usePanelStore((s) => s.components);
  const cadAssets = usePanelStore((s) => s.cadAssets);
  const rails = usePanelStore((s) => s.rails);
  const ducts = usePanelStore((s) => s.ducts);
  const wires = usePanelStore((s) => s.wires);

  const duplicateComponent = usePanelStore((s) => s.duplicateComponent);
  const duplicateCadAsset = usePanelStore((s) => s.duplicateCadAsset);
  const duplicateRail = usePanelStore((s) => s.duplicateRail);
  const duplicateDuct = usePanelStore((s) => s.duplicateDuct);
  const rotateComponent = usePanelStore((s) => s.rotateComponent);
  const rotateCadAsset = usePanelStore((s) => s.rotateCadAsset);
  const removeComponent = usePanelStore((s) => s.removeComponent);
  const removeCadAsset = usePanelStore((s) => s.removeCadAsset);
  const removeRail = usePanelStore((s) => s.removeRail);
  const removeDuct = usePanelStore((s) => s.removeDuct);
  const updateComponent = usePanelStore((s) => s.updateComponent);
  const updateCadAsset = usePanelStore((s) => s.updateCadAsset);
  const updateWire = usePanelStore((s) => s.updateWire);
  const updateWires = usePanelStore((s) => s.updateWires);
  const removeWire = usePanelStore((s) => s.removeWire);
  const setActiveWireColor = usePanelStore((s) => s.setActiveWireColor);
  const setActiveWireGauge = usePanelStore((s) => s.setActiveWireGauge);
  const copySelectedToClipboard = usePanelStore((s) => s.copySelectedToClipboard);
  const deleteSelectedItems = usePanelStore((s) => s.deleteSelectedItems);
  const alignSelectedItems = usePanelStore((s) => s.alignSelectedItems);
  const alignItemToPlate = usePanelStore((s) => s.alignItemToPlate);
  const alignComponentToRail = usePanelStore((s) => s.alignComponentToRail);
  const autoResizeToFit = usePanelStore((s) => s.autoResizeToFit);
  const autoResizeSelectedToFit = usePanelStore((s) => s.autoResizeSelectedToFit);
  const groupSelectedItems = usePanelStore((s) => s.groupSelectedItems);
  const ungroupSelectedItems = usePanelStore((s) => s.ungroupSelectedItems);
  const toggleLockSelectedItems = usePanelStore((s) => s.toggleLockSelectedItems);
  const isPinMarkingMode = usePanelStore((s) => s.isPinMarkingMode);
  const activeMarkingAssetId = usePanelStore((s) => s.activeMarkingAssetId);
  const setPinMarkingMode = usePanelStore((s) => s.setPinMarkingMode);

  const [alignOpen, setAlignOpen] = useState(false);
  const alignRef = useRef<HTMLDivElement>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  if (anchorPos) {
    lastPosRef.current = anchorPos;
  }

  useEffect(() => {
    setAlignOpen(false);
  }, [selected, selectedIds, visible]);

  useEffect(() => {
    if (!alignOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (alignRef.current && !alignRef.current.contains(e.target as Node)) {
        setAlignOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [alignOpen]);

  const isMulti = selectedIds.length > 1;
  const activeSingle = !isMulti
    ? selected ?? (selectedIds.length === 1 ? selectedIds[0] : null)
    : null;

  const singleComp =
    activeSingle?.kind === "component"
      ? components.find((c) => c.id === activeSingle.id) ?? null
      : null;
  const singleCad =
    activeSingle?.kind === "cad"
      ? cadAssets.find((a) => a.id === activeSingle.id) ?? null
      : null;
  const singleRail =
    activeSingle?.kind === "rail"
      ? rails.find((r) => r.id === activeSingle.id) ?? null
      : null;
  const singleDuct =
    activeSingle?.kind === "duct"
      ? ducts.find((d) => d.id === activeSingle.id) ?? null
      : null;
  const singleWire =
    activeSingle?.kind === "wire"
      ? wires.find((w) => w.id === activeSingle.id) ?? null
      : null;

  const editableLabelTarget = singleComp ?? singleCad;
  const [labelDraft, setLabelDraft] = useState("");
  const lastEditableIdRef = useRef<string | null>(null);
  const [wireFreeLabelDraft, setWireFreeLabelDraft] = useState("");
  const lastWireFreeIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nextId = editableLabelTarget?.id ?? null;
    const nextName = editableLabelTarget?.name ?? "";
    if (nextId !== lastEditableIdRef.current || nextName !== labelDraft) {
      lastEditableIdRef.current = nextId;
      setLabelDraft(nextName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableLabelTarget?.id, editableLabelTarget?.name]);

  useEffect(() => {
    const nextId = singleWire?.id ?? null;
    const nextLabel = singleWire?.toFreeLabel ?? "";
    if (nextId !== lastWireFreeIdRef.current || nextLabel !== wireFreeLabelDraft) {
      lastWireFreeIdRef.current = nextId;
      setWireFreeLabelDraft(nextLabel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleWire?.id, singleWire?.toFreeLabel]);

  const commitWireFreeLabel = () => {
    if (!singleWire || !singleWire.toFreePoint) return;
    const nextLabel = wireFreeLabelDraft.trim();
    if (nextLabel === (singleWire.toFreeLabel ?? "")) return;
    updateWire(singleWire.id, { toFreeLabel: nextLabel });
  };

  const commitLabelDraft = () => {
    if (!editableLabelTarget) return;
    const nextName = labelDraft.trim();
    if (!nextName) {
      setLabelDraft(editableLabelTarget.name);
      return;
    }
    if (nextName === editableLabelTarget.name) return;
    if (singleComp) {
      updateComponent(singleComp.id, { name: nextName });
    } else if (singleCad) {
      updateCadAsset(singleCad.id, { name: nextName });
    }
  };

  const isMultiAllWires =
    isMulti && selectedIds.every((sel) => sel.kind === "wire");
  const selectedWires = singleWire
    ? [singleWire]
    : isMultiAllWires
      ? selectedIds
          .map((sel) => wires.find((w) => w.id === sel.id))
          .filter((w): w is NonNullable<typeof w> => Boolean(w))
      : [];
  const isWireSelection = selectedWires.length > 0;
  const sharedWireColor =
    isWireSelection &&
    selectedWires.every((w) => w.colorCode === selectedWires[0].colorCode)
      ? selectedWires[0].colorCode
      : null;
  const sharedWireGauge =
    isWireSelection &&
    selectedWires.every((w) => w.gaugeMm2 === selectedWires[0].gaugeMm2)
      ? selectedWires[0].gaugeMm2
      : "";

  const orientations = isMulti
    ? selectedIds.map((sel) => {
        if (sel.kind === "rail") return "horizontal";
        if (sel.kind === "duct") {
          return ducts.find((d) => d.id === sel.id)?.orientation ?? null;
        }
        return null;
      })
    : [];
  const hasMultiResizable =
    isMulti &&
    selectedIds.some((sel) => sel.kind === "rail" || sel.kind === "duct");
  const allHorizontal =
    isMulti && orientations.every((o) => o === "horizontal");
  const allVertical = isMulti && orientations.every((o) => o === "vertical");
  const canMultiResize = allHorizontal || allVertical;

  const btnClass =
    "p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/10 disabled:opacity-35 disabled:pointer-events-none";

  const tooltipClass =
    "pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-medium opacity-0 scale-95 transition-all duration-100 group-hover/tip:opacity-100 group-hover/tip:scale-100 shadow-xl bg-slate-900 text-slate-100 border-slate-800 dark:bg-[#161922] dark:text-zinc-200 dark:border-white/15";

  const handleDuplicate = () => {
    if (singleComp) duplicateComponent(singleComp.id);
    else if (singleCad) duplicateCadAsset(singleCad.id);
    else if (singleRail) duplicateRail(singleRail.id);
    else if (singleDuct) duplicateDuct(singleDuct.id);
  };

  const handleRotate = () => {
    if (singleComp) rotateComponent(singleComp.id, 90);
    else if (singleCad) rotateCadAsset(singleCad.id, 90);
  };

  const handleDelete = () => {
    if (isMulti) deleteSelectedItems();
    else if (singleComp) removeComponent(singleComp.id);
    else if (singleCad) removeCadAsset(singleCad.id);
    else if (singleRail) removeRail(singleRail.id);
    else if (singleDuct) removeDuct(singleDuct.id);
    else if (singleWire) removeWire(singleWire.id);
  };

  const canRotate = Boolean(singleComp || singleCad);
  const showSingleResize = Boolean(singleRail || singleDuct);
  const singleResizeLabel =
    singleDuct?.orientation === "vertical"
      ? "Auto-Resize to Height"
      : "Auto-Resize to Width";

  // Lock & Group state across single or multi-select (Component, CAD, Rail, Duct)
  const effectiveTargets = isMulti
    ? selectedIds
    : activeSingle
      ? [activeSingle]
      : [];
  const lockableTargets = effectiveTargets.filter(
    (t) =>
      t.kind === "component" ||
      t.kind === "cad" ||
      t.kind === "rail" ||
      t.kind === "duct"
  );
  const resolvedLockStates = lockableTargets.map((t) => {
    if (t.kind === "component") return Boolean(components.find((c) => c.id === t.id)?.locked);
    if (t.kind === "cad") return Boolean(cadAssets.find((a) => a.id === t.id)?.locked);
    if (t.kind === "rail") return Boolean(rails.find((r) => r.id === t.id)?.locked);
    if (t.kind === "duct") return Boolean(ducts.find((d) => d.id === t.id)?.locked);
    return false;
  });
  const isLockedSelection =
    resolvedLockStates.length > 0 && resolvedLockStates.every(Boolean);
  const hasAnyGrouped = lockableTargets.some((t) => {
    if (t.kind === "component") return Boolean(components.find((c) => c.id === t.id)?.groupId);
    if (t.kind === "cad") return Boolean(cadAssets.find((a) => a.id === t.id)?.groupId);
    if (t.kind === "rail") return Boolean(rails.find((r) => r.id === t.id)?.groupId);
    if (t.kind === "duct") return Boolean(ducts.find((d) => d.id === t.id)?.groupId);
    return false;
  });
  const canGroup = isMulti && lockableTargets.length >= 2;
  const canLock = lockableTargets.length > 0;

  const isActive =
    visible &&
    (isMulti ||
      Boolean(
        activeSingle &&
          (singleComp || singleCad || singleRail || singleDuct || singleWire)
      ));

  const pos = anchorPos ?? lastPosRef.current;
  if (!pos && !isActive) {
    return null;
  }

  const openAlignBelow =
    placement === "bottom" || (pos !== null && pos.y < 180);

  return (
    <div
      aria-hidden={!isActive}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={
        pos
          ? {
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              transform:
                placement === "bottom"
                  ? "translate(-50%, 0)"
                  : "translate(-50%, -100%)",
            }
          : undefined
      }
      className={`${
        pos
          ? "absolute z-30"
          : "absolute bottom-12 sm:bottom-14 left-1/2 -translate-x-1/2 z-30"
      } ${isActive ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <div
        className={`flex items-center gap-0.5 rounded-2xl border border-slate-200 dark:border-white/15 bg-white/95 dark:bg-[#0d111a]/95 px-2 py-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.65)] backdrop-blur-md select-none transition-all duration-150 ease-out ${
          placement === "bottom" ? "origin-top" : "origin-bottom"
        } ${
          isActive
            ? "opacity-100 scale-100 translate-y-0"
            : placement === "bottom"
              ? "opacity-0 scale-95 -translate-y-1.5"
              : "opacity-0 scale-95 translate-y-1.5"
        }`}
      >
      {isWireSelection ? (
        <>
          {selectedWires.length > 1 ? (
            <>
              <span className="px-1.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-300 whitespace-nowrap">
                {selectedWires.length} wires
              </span>
              <div className="h-4 w-[1px] mx-0.5 bg-slate-200 dark:bg-white/10" />
            </>
          ) : singleWire?.toFreePoint ? (
            <>
              <input
                type="text"
                aria-label="Terminal End Label"
                placeholder="Power Source R..."
                value={wireFreeLabelDraft}
                onChange={(e) => setWireFreeLabelDraft(e.target.value)}
                onBlur={commitWireFreeLabel}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    commitWireFreeLabel();
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    setWireFreeLabelDraft(singleWire.toFreeLabel ?? "");
                    e.currentTarget.blur();
                  }
                }}
                className="w-32 sm:w-36 rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50/90 dark:bg-[#161a23] px-2 py-1 font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-sky-500 focus:bg-white dark:focus:bg-[#111622] transition-colors select-text"
              />
              <div className="h-4 w-[1px] mx-1 bg-slate-200 dark:bg-white/10" />
            </>
          ) : null}

          {/* Direct Clickable Color Circles (no RSTN text) */}
          <div className="flex items-center gap-1.5 px-1">
            {WIRE_COLOR_SWATCHES.map((wc) => {
              const active = sharedWireColor === wc.code;
              return (
                <button
                  key={wc.code}
                  type="button"
                  title={wc.label}
                  aria-label={wc.label}
                  onClick={() => {
                    updateWires(
                      selectedWires.map((w) => w.id),
                      { colorCode: wc.code }
                    );
                    setActiveWireColor(wc.code);
                  }}
                  style={{ backgroundColor: wc.hex }}
                  className={`h-4 w-4 rounded-full transition-transform cursor-pointer border ${
                    active
                      ? "scale-115 border-white ring-2 ring-slate-900 dark:ring-white shadow-xs"
                      : "border-black/20 hover:scale-110 opacity-85 hover:opacity-100"
                  }`}
                />
              );
            })}
          </div>

          <div className="h-4 w-[1px] mx-1 bg-slate-200 dark:bg-white/10" />

          {/* Compact Gauge Dropdown */}
          <select
            aria-label="Wire Gauge (mm²)"
            value={sharedWireGauge}
            onChange={(e) => {
              const nextGauge = e.target.value;
              if (!nextGauge) return;
              updateWires(
                selectedWires.map((w) => w.id),
                { gaugeMm2: nextGauge }
              );
              setActiveWireGauge(nextGauge);
            }}
            className="rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#161a23] px-2 py-1 font-mono text-[11px] font-medium text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
          >
            {!sharedWireGauge && <option value="">Mixed mm²</option>}
            {WIRE_GAUGES.map((g) => (
              <option key={g} value={g}>
                {g} mm²
              </option>
            ))}
          </select>

          <div className="h-4 w-[1px] mx-1 bg-slate-200 dark:bg-white/10" />

          {/* Delete Selected Wire(s) */}
          <div className="relative group/tip">
            <button
              type="button"
              onClick={handleDelete}
              aria-label={selectedWires.length > 1 ? "Delete Selected Wires" : "Delete Wire"}
              className="p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/15"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <span role="tooltip" className={tooltipClass}>
              {selectedWires.length > 1 ? `Delete ${selectedWires.length} Wires` : "Delete Wire"}
            </span>
          </div>
        </>
      ) : (
        <>
      {isMulti ? (
        <>
          <span className="px-2 text-[11px] font-medium text-slate-600 dark:text-zinc-300">
            {selectedIds.length} selected
          </span>
          <div className="h-4 w-[1px] mx-0.5 bg-slate-200 dark:bg-white/10" />
        </>
      ) : editableLabelTarget ? (
        <>
          <input
            type="text"
            aria-label="Component Label"
            placeholder="Label"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabelDraft}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                commitLabelDraft();
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                setLabelDraft(editableLabelTarget.name);
                e.currentTarget.blur();
              }
            }}
            className="w-24 sm:w-28 rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50/90 dark:bg-[#161a23] px-2 py-1 font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-sky-500 focus:bg-white dark:focus:bg-[#111622] transition-colors select-text"
          />
          <div className="h-4 w-[1px] mx-1 bg-slate-200 dark:bg-white/10" />
        </>
      ) : null}

      {/* Duplicate (single) / Copy (multi) */}
      <div className="relative group/tip">
        <button
          type="button"
          onClick={isMulti ? () => copySelectedToClipboard() : handleDuplicate}
          aria-label={isMulti ? "Copy (Ctrl+C)" : "Duplicate"}
          className={btnClass}
        >
          <Copy className="h-4 w-4" />
        </button>
        <span role="tooltip" className={tooltipClass}>
          {isMulti ? "Copy (Ctrl+C)" : "Duplicate"}
        </span>
      </div>

      {/* Add / Mark Pin Button (Shape / Custom CAD) */}
      {singleCad && !isMulti && (
        <div className="relative group/tip">
          <button
            type="button"
            onClick={() =>
              setPinMarkingMode(
                !(isPinMarkingMode && activeMarkingAssetId === singleCad.id),
                singleCad.id
              )
            }
            aria-label={
              isPinMarkingMode && activeMarkingAssetId === singleCad.id
                ? "Done Adding Pins"
                : "Add Pin"
            }
            className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 text-[11px] font-semibold cursor-pointer ${
              isPinMarkingMode && activeMarkingAssetId === singleCad.id
                ? "bg-amber-500 text-black shadow-xs"
                : "text-slate-700 hover:text-slate-900 hover:bg-slate-200/70 dark:text-zinc-200 dark:hover:text-white dark:hover:bg-white/10"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            <span>
              {isPinMarkingMode && activeMarkingAssetId === singleCad.id
                ? "Done Pin"
                : "Add Pin"}
            </span>
          </button>
          <span role="tooltip" className={tooltipClass}>
            {isPinMarkingMode && activeMarkingAssetId === singleCad.id
              ? "Klik pada shape untuk pasang pin (klik lagi untuk selesai)"
              : "Tambah Pin Terminal pada Shape"}
          </span>
        </div>
      )}

      {/* Rotate +90° (Component / CAD) */}
      {canRotate && (
        <div className="relative group/tip">
          <button
            type="button"
            onClick={handleRotate}
            aria-label="Rotate +90°"
            className={btnClass}
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <span role="tooltip" className={tooltipClass}>
            Rotate +90°
          </span>
        </div>
      )}

      {/* Auto-Align Popover */}
      <div ref={alignRef} className="relative group/tip">
        <button
          type="button"
          onClick={() => setAlignOpen((v) => !v)}
          aria-label="Auto Align"
          className={`p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
            alignOpen
              ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/10"
          }`}
        >
          <ArrowRightLeft className="h-4 w-4" />
        </button>
        {!alignOpen && (
          <span role="tooltip" className={tooltipClass}>
            {singleComp?.railId ? "Align to Rail" : isMulti ? "Align Selected" : "Align to Plate"}
          </span>
        )}

        {alignOpen && (
          <div
            className={`absolute ${
              openAlignBelow ? "top-full mt-2" : "bottom-full mb-2"
            } left-1/2 -translate-x-1/2 z-50 w-40 rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#161a23] p-1.5 shadow-2xl`}
          >
            <div className="px-2 py-1 mb-1 text-[11px] font-semibold text-slate-700 dark:text-zinc-200 border-b border-slate-200 dark:border-white/10">
              {singleComp?.railId
                ? "Align to Rail"
                : isMulti
                  ? "Align Selected"
                  : "Align to Plate"}
            </div>
            {isMulti ? (
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    alignSelectedItems("left");
                    setAlignOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-white/10 cursor-pointer"
                >
                  <AlignLeft className="h-3.5 w-3.5 text-slate-500 dark:text-zinc-400" />
                  <span>Align Left</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    alignSelectedItems("center");
                    setAlignOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-white/10 cursor-pointer"
                >
                  <AlignCenter className="h-3.5 w-3.5 text-slate-500 dark:text-zinc-400" />
                  <span>Align Center</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    alignSelectedItems("top");
                    setAlignOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-white/10 cursor-pointer"
                >
                  <AlignStartVertical className="h-3.5 w-3.5 text-slate-500 dark:text-zinc-400" />
                  <span>Align Top</span>
                </button>
              </div>
            ) : singleComp?.railId ? (
              <div className="flex flex-col gap-0.5">
                {(["left", "center", "right"] as const).map((edge) => (
                  <button
                    key={edge}
                    type="button"
                    onClick={() => {
                      alignComponentToRail(singleComp.id, edge);
                      setAlignOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs capitalize text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-white/10 cursor-pointer"
                  >
                    {edge === "left" && <AlignLeft className="h-3.5 w-3.5 text-slate-500 dark:text-zinc-400" />}
                    {edge === "center" && <AlignCenter className="h-3.5 w-3.5 text-slate-500 dark:text-zinc-400" />}
                    {edge === "right" && <AlignRight className="h-3.5 w-3.5 text-slate-500 dark:text-zinc-400" />}
                    <span>Align {edge}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {(["top", "bottom", "left", "right"] as const).map((edge) => (
                  <button
                    key={edge}
                    type="button"
                    onClick={() => {
                      if (activeSingle && activeSingle.kind !== "wire") {
                        alignItemToPlate(activeSingle, edge);
                      }
                      setAlignOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs capitalize text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-white/10 cursor-pointer"
                  >
                    <AlignJustify className="h-3.5 w-3.5 text-slate-500 dark:text-zinc-400" />
                    <span>Align {edge}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Auto-Resize (Single Rail/Duct or Multi-Select) */}
      {showSingleResize && activeSingle && (activeSingle.kind === "rail" || activeSingle.kind === "duct") && (
        <div className="relative group/tip">
          <button
            type="button"
            onClick={() => autoResizeToFit({ kind: activeSingle.kind as "rail" | "duct", id: activeSingle.id })}
            aria-label={singleResizeLabel}
            className={btnClass}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <span role="tooltip" className={tooltipClass}>
            {singleResizeLabel}
          </span>
        </div>
      )}

      {hasMultiResizable && (
        <div className="relative group/tip">
          <button
            type="button"
            disabled={!canMultiResize}
            onClick={() => autoResizeSelectedToFit()}
            aria-label={allVertical ? "Auto-Resize to Height" : "Auto-Resize to Width"}
            className={btnClass}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <span role="tooltip" className={tooltipClass}>
            {!canMultiResize
              ? "Requires same orientation"
              : allVertical
                ? "Auto-Resize to Height"
                : "Auto-Resize to Width"}
          </span>
        </div>
      )}

      {/* Group (Multi-Select >= 2) */}
      {canGroup && (
        <div className="relative group/tip">
          <button
            type="button"
            onClick={() => groupSelectedItems()}
            aria-label="Group (Ctrl+G)"
            className={btnClass}
          >
            <Group className="h-4 w-4" />
          </button>
          <span role="tooltip" className={tooltipClass}>
            Group (Ctrl+G)
          </span>
        </div>
      )}

      {/* Ungroup (if any selected item belongs to a group) */}
      {hasAnyGrouped && (
        <div className="relative group/tip">
          <button
            type="button"
            onClick={() => ungroupSelectedItems()}
            aria-label="Ungroup (Ctrl+Shift+G)"
            className={btnClass}
          >
            <Ungroup className="h-4 w-4" />
          </button>
          <span role="tooltip" className={tooltipClass}>
            Ungroup (Ctrl+Shift+G)
          </span>
        </div>
      )}

      {/* Lock / Unlock */}
      {canLock && (
        <div className="relative group/tip">
          <button
            type="button"
            onClick={() => toggleLockSelectedItems()}
            aria-label={isLockedSelection ? "Unlock (Ctrl+L)" : "Lock (Ctrl+L)"}
            className={`p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
              isLockedSelection
                ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:bg-amber-500/20 dark:text-amber-400"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/10"
            }`}
          >
            {isLockedSelection ? (
              <Lock className="h-4 w-4" />
            ) : (
              <Unlock className="h-4 w-4" />
            )}
          </button>
          <span role="tooltip" className={tooltipClass}>
            {isLockedSelection ? "Unlock (Ctrl+L)" : "Lock (Ctrl+L)"}
          </span>
        </div>
      )}

      <div className="h-4 w-[1px] mx-0.5 bg-slate-200 dark:bg-white/10" />

      {/* Delete */}
      <div className="relative group/tip">
        <button
          type="button"
          disabled={isLockedSelection}
          onClick={handleDelete}
          aria-label="Delete"
          className="p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 disabled:opacity-35 disabled:pointer-events-none"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <span role="tooltip" className={tooltipClass}>
          {isLockedSelection ? "Locked — Unlock to Delete" : "Delete"}
        </span>
      </div>
        </>
      )}
      </div>
    </div>
  );
}
