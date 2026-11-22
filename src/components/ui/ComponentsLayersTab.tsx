"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Cable,
  ChevronDown,
  Copy,
  Cpu,
  Folder,
  FolderOpen,
  Layers,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { formatDim } from "@/lib/units";
import { WIRE_COLOR_MAP } from "@/lib/sheet-export";
import { usePanelStore } from "@/store/usePanelStore";
import type { SelectedTarget } from "@/types/panel";

type SelectableKind = Exclude<NonNullable<SelectedTarget>["kind"], "wire">;

export function ComponentsLayersTab() {
  const displayUnit = usePanelStore((s) => s.displayUnit);
  const rails = usePanelStore((s) => s.rails);
  const ducts = usePanelStore((s) => s.ducts);
  const components = usePanelStore((s) => s.components);
  const cadAssets = usePanelStore((s) => s.cadAssets);
  const wires = usePanelStore((s) => s.wires);
  const selected = usePanelStore((s) => s.selected);
  const selectedIds = usePanelStore((s) => s.selectedIds);

  const setSelected = usePanelStore((s) => s.setSelected);
  const toggleSelectId = usePanelStore((s) => s.toggleSelectId);
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab);

  const addRail = usePanelStore((s) => s.addRail);
  const duplicateRail = usePanelStore((s) => s.duplicateRail);
  const removeRail = usePanelStore((s) => s.removeRail);

  const addDuct = usePanelStore((s) => s.addDuct);
  const duplicateDuct = usePanelStore((s) => s.duplicateDuct);
  const removeDuct = usePanelStore((s) => s.removeDuct);

  const duplicateComponent = usePanelStore((s) => s.duplicateComponent);
  const removeComponent = usePanelStore((s) => s.removeComponent);

  const duplicateCadAsset = usePanelStore((s) => s.duplicateCadAsset);
  const removeCadAsset = usePanelStore((s) => s.removeCadAsset);

  const removeWire = usePanelStore((s) => s.removeWire);

  const [query, setQuery] = useState("");
  const [collapsedRails, setCollapsedRails] = useState<Record<string, boolean>>({});
  const [openSections, setOpenSections] = useState({
    rails: true,
    unmounted: true,
    ducts: true,
    cad: true,
    wires: false,
  });

  const q = query.trim().toLowerCase();

  const isItemSelected = (kind: NonNullable<SelectedTarget>["kind"], id: string) =>
    selectedIds.some((s) => s.kind === kind && s.id === id) ||
    (selected?.kind === kind && selected?.id === id);

  const handleRowClick = (
    e: React.MouseEvent,
    kind: NonNullable<SelectedTarget>["kind"],
    id: string
  ) => {
    if (kind !== "wire" && (e.metaKey || e.ctrlKey || e.shiftKey)) {
      toggleSelectId({ kind: kind as SelectableKind, id });
      return;
    }
    setSelected({ kind, id } as SelectedTarget);
  };

  const handleRowDoubleClick = (
    kind: NonNullable<SelectedTarget>["kind"],
    id: string
  ) => {
    setSelected({ kind, id } as SelectedTarget);
    setRightPanelTab("inspector");
  };

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRailCollapse = (railId: string) => {
    setCollapsedRails((prev) => ({ ...prev, [railId]: !prev[railId] }));
  };

  const filteredRails = useMemo(() => {
    return rails
      .map((rail) => {
        const mounted = components.filter((c) => c.railId === rail.id);
        const railMatch = !q || rail.name.toLowerCase().includes(q);
        const matchingMounted = q
          ? mounted.filter(
              (c) =>
                c.name.toLowerCase().includes(q) ||
                c.templateId.toLowerCase().includes(q)
            )
          : mounted;
        if (!railMatch && matchingMounted.length === 0) return null;
        return {
          rail,
          mounted: railMatch ? mounted : matchingMounted,
        };
      })
      .filter(Boolean) as Array<{
      rail: (typeof rails)[number];
      mounted: (typeof components)[number][];
    }>;
  }, [rails, components, q]);

  const unmountedComponents = useMemo(() => {
    return components.filter(
      (c) =>
        !c.railId &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          c.templateId.toLowerCase().includes(q))
    );
  }, [components, q]);

  const filteredDucts = useMemo(() => {
    return ducts.filter(
      (d) =>
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.orientation.toLowerCase().includes(q)
    );
  }, [ducts, q]);

  const filteredCad = useMemo(() => {
    return cadAssets.filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.format.toLowerCase().includes(q)
    );
  }, [cadAssets, q]);

  const filteredWires = useMemo(() => {
    return wires.filter(
      (w) =>
        !q ||
        w.label.toLowerCase().includes(q) ||
        w.colorCode.toLowerCase().includes(q)
    );
  }, [wires, q]);

  const totalLayers =
    rails.length + components.length + ducts.length + cadAssets.length + wires.length;

  const rowBaseClass = (active: boolean) =>
    `group flex items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5 transition-colors cursor-pointer ${
      active
        ? "border-sky-500/40 bg-sky-500/12 text-sky-900 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-white"
        : "border-transparent hover:border-slate-200 hover:bg-slate-100/80 dark:hover:border-white/10 dark:hover:bg-white/5 text-slate-700 dark:text-zinc-300"
    }`;

  const renderRowActions = (
    onDuplicate?: () => void,
    onDelete?: () => void
  ) => (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {onDuplicate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          title="Duplicate"
          className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-900 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <Copy className="h-3 w-3" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          className="rounded p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col text-xs">
      {/* Layer Search & Quick Add */}
      <div className="shrink-0 space-y-2 border-b border-[#e2e8f0] dark:border-white/10 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${totalLayers} layers...`}
            className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#090b10] py-1.5 pr-7 pl-8 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:border-sky-500 dark:focus:border-white/25 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              aria-label="Clear layer filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
            Layers ({totalLayers})
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => addRail()}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Rail
            </button>
            <button
              type="button"
              onClick={() => addDuct("horizontal")}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Duct
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Layer Stack */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-2">
        {totalLayers === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/10 p-4 text-center text-[11px] text-slate-400 dark:text-zinc-500">
            Canvas is empty. Drag or click a part from the left library to add layers.
          </div>
        ) : (
          <>
            {/* DIN Rails (Layer Groups containing mounted components) */}
            {(filteredRails.length > 0 || !q) && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleSection("rails")}
                  className="flex w-full items-center gap-1.5 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      openSections.rails ? "" : "-rotate-90"
                    }`}
                  />
                  <Layers className="h-3 w-3" />
                  <span>DIN Rails</span>
                  <span className="ml-auto font-normal text-slate-400 dark:text-zinc-500">
                    {filteredRails.length}
                  </span>
                </button>

                {openSections.rails &&
                  (filteredRails.length === 0 ? (
                    <p className="px-2 py-1 text-[11px] text-slate-400 dark:text-zinc-500">
                      No DIN rails
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {filteredRails.map(({ rail, mounted }) => {
                        const isCollapsed = Boolean(collapsedRails[rail.id]) && !q;
                        const railActive = isItemSelected("rail", rail.id);
                        return (
                          <div key={rail.id} className="space-y-0.5">
                            <div
                              onClick={(e) => handleRowClick(e, "rail", rail.id)}
                              onDoubleClick={() =>
                                handleRowDoubleClick("rail", rail.id)
                              }
                              className={rowBaseClass(railActive)}
                            >
                              <div className="flex min-w-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRailCollapse(rail.id);
                                  }}
                                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-white"
                                  aria-label="Toggle rail group"
                                >
                                  <ChevronDown
                                    className={`h-3 w-3 transition-transform ${
                                      isCollapsed ? "-rotate-90" : ""
                                    }`}
                                  />
                                </button>
                                {isCollapsed ? (
                                  <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                ) : (
                                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                )}
                                <span className="truncate font-medium">
                                  {rail.name}
                                </span>
                                <span className="shrink-0 rounded bg-slate-200/70 dark:bg-white/10 px-1 py-0.2 text-[9px] tabular-nums text-slate-600 dark:text-zinc-400">
                                  {mounted.length}
                                </span>
                              </div>
                              {renderRowActions(
                                () => duplicateRail(rail.id),
                                () => removeRail(rail.id)
                              )}
                            </div>

                            {!isCollapsed && mounted.length > 0 && (
                              <div className="ml-3.5 border-l border-slate-200 dark:border-white/10 pl-2 space-y-0.5">
                                {mounted.map((comp) => {
                                  const active = isItemSelected("component", comp.id);
                                  return (
                                    <div
                                      key={comp.id}
                                      onClick={(e) =>
                                        handleRowClick(e, "component", comp.id)
                                      }
                                      onDoubleClick={() =>
                                        handleRowDoubleClick("component", comp.id)
                                      }
                                      className={rowBaseClass(active)}
                                    >
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span
                                          className="h-2.5 w-2.5 shrink-0 rounded-xs border border-black/15 dark:border-white/20"
                                          style={{
                                            backgroundColor:
                                              comp.accentColor || comp.color,
                                          }}
                                        />
                                        <div className="min-w-0">
                                          <div className="truncate font-medium">
                                            {comp.name}
                                          </div>
                                          <div className="truncate text-[10px] text-slate-400 dark:text-zinc-500">
                                            {formatDim(comp.widthMm, displayUnit, 0)} ×{" "}
                                            {formatDim(comp.heightMm, displayUnit, 0)}
                                          </div>
                                        </div>
                                      </div>
                                      {renderRowActions(
                                        () => duplicateComponent(comp.id),
                                        () => removeComponent(comp.id)
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>
            )}

            {/* Unmounted / Panel Components */}
            {unmountedComponents.length > 0 && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleSection("unmounted")}
                  className="flex w-full items-center gap-1.5 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      openSections.unmounted ? "" : "-rotate-90"
                    }`}
                  />
                  <Cpu className="h-3 w-3" />
                  <span>Panel Components</span>
                  <span className="ml-auto font-normal text-slate-400 dark:text-zinc-500">
                    {unmountedComponents.length}
                  </span>
                </button>

                {openSections.unmounted && (
                  <div className="space-y-0.5">
                    {unmountedComponents.map((comp) => {
                      const active = isItemSelected("component", comp.id);
                      return (
                        <div
                          key={comp.id}
                          onClick={(e) =>
                            handleRowClick(e, "component", comp.id)
                          }
                          onDoubleClick={() =>
                            handleRowDoubleClick("component", comp.id)
                          }
                          className={rowBaseClass(active)}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-xs border border-black/15 dark:border-white/20"
                              style={{
                                backgroundColor: comp.accentColor || comp.color,
                              }}
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {comp.name}
                              </div>
                              <div className="truncate text-[10px] text-slate-400 dark:text-zinc-500">
                                {formatDim(comp.widthMm, displayUnit, 0)} ×{" "}
                                {formatDim(comp.heightMm, displayUnit, 0)}
                              </div>
                            </div>
                          </div>
                          {renderRowActions(
                            () => duplicateComponent(comp.id),
                            () => removeComponent(comp.id)
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Wiring Ducts */}
            {filteredDucts.length > 0 && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleSection("ducts")}
                  className="flex w-full items-center gap-1.5 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      openSections.ducts ? "" : "-rotate-90"
                    }`}
                  />
                  <Cable className="h-3 w-3" />
                  <span>Wiring Ducts</span>
                  <span className="ml-auto font-normal text-slate-400 dark:text-zinc-500">
                    {filteredDucts.length}
                  </span>
                </button>

                {openSections.ducts && (
                  <div className="space-y-0.5">
                    {filteredDucts.map((duct) => {
                      const active = isItemSelected("duct", duct.id);
                      return (
                        <div
                          key={duct.id}
                          onClick={(e) => handleRowClick(e, "duct", duct.id)}
                          onDoubleClick={() =>
                            handleRowDoubleClick("duct", duct.id)
                          }
                          className={rowBaseClass(active)}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-slate-200 dark:bg-white/10 text-[9px] font-bold uppercase text-slate-600 dark:text-zinc-300">
                              {duct.orientation === "vertical" ? "V" : "H"}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {duct.name}
                              </div>
                              <div className="truncate text-[10px] text-slate-400 dark:text-zinc-500">
                                {formatDim(duct.widthMm, displayUnit, 0)} ×{" "}
                                {formatDim(duct.heightMm, displayUnit, 0)}
                              </div>
                            </div>
                          </div>
                          {renderRowActions(
                            () => duplicateDuct(duct.id),
                            () => removeDuct(duct.id)
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Custom CAD */}
            {filteredCad.length > 0 && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleSection("cad")}
                  className="flex w-full items-center gap-1.5 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      openSections.cad ? "" : "-rotate-90"
                    }`}
                  />
                  <Box className="h-3 w-3" />
                  <span>Custom CAD</span>
                  <span className="ml-auto font-normal text-slate-400 dark:text-zinc-500">
                    {filteredCad.length}
                  </span>
                </button>

                {openSections.cad && (
                  <div className="space-y-0.5">
                    {filteredCad.map((asset) => {
                      const active = isItemSelected("cad", asset.id);
                      return (
                        <div
                          key={asset.id}
                          onClick={(e) => handleRowClick(e, "cad", asset.id)}
                          onDoubleClick={() =>
                            handleRowDoubleClick("cad", asset.id)
                          }
                          className={rowBaseClass(active)}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex shrink-0 rounded bg-sky-500/15 px-1 py-0.5 text-[9px] font-bold uppercase text-sky-600 dark:text-sky-400">
                              {asset.format}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {asset.name}
                              </div>
                              <div className="truncate text-[10px] text-slate-400 dark:text-zinc-500">
                                {asset.pins.length} pins
                              </div>
                            </div>
                          </div>
                          {renderRowActions(
                            () => duplicateCadAsset(asset.id),
                            () => removeCadAsset(asset.id)
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Wires */}
            {filteredWires.length > 0 && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleSection("wires")}
                  className="flex w-full items-center gap-1.5 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      openSections.wires ? "" : "-rotate-90"
                    }`}
                  />
                  <Cable className="h-3 w-3" />
                  <span>Wires</span>
                  <span className="ml-auto font-normal text-slate-400 dark:text-zinc-500">
                    {filteredWires.length}
                  </span>
                </button>

                {openSections.wires && (
                  <div className="space-y-0.5">
                    {filteredWires.map((wire) => {
                      const active = isItemSelected("wire", wire.id);
                      return (
                        <div
                          key={wire.id}
                          onClick={(e) => handleRowClick(e, "wire", wire.id)}
                          onDoubleClick={() =>
                            handleRowDoubleClick("wire", wire.id)
                          }
                          className={rowBaseClass(active)}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/20"
                              style={{
                                backgroundColor:
                                  WIRE_COLOR_MAP[wire.colorCode] ?? "#64748b",
                              }}
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {wire.label}
                              </div>
                              <div className="truncate text-[10px] text-slate-400 dark:text-zinc-500">
                                {wire.gaugeMm2} mm²
                              </div>
                            </div>
                          </div>
                          {renderRowActions(undefined, () => removeWire(wire.id))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Layer Interaction Hint */}
      <div className="shrink-0 border-t border-[#e2e8f0] dark:border-white/10 px-3 py-1.5 text-[10px] text-slate-400 dark:text-zinc-500">
        Click to select · Ctrl/Cmd+Click multi · Double-click to inspect
      </div>
    </div>
  );
}
