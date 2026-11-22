"use client";

import { usePanelStore } from "@/store/usePanelStore";
import { formatDim, fromMm, toMm } from "@/lib/units";
import {
  Sliders,
  Trash2,
  Settings,
  Layers,
  Box,
  MapPin,
  Crosshair,
  ArrowRightLeft,
  X,
} from "lucide-react";

export function InspectorPanel() {
  const {
    displayUnit,
    enclosure,
    updateEnclosure,
    rails,
    updateRail,
    removeRail,
    ducts,
    updateDuct,
    removeDuct,
    components,
    updateComponent,
    moveComponent,
    removeComponent,
    cadAssets,
    updateCadAsset,
    removeCadAsset,
    selected,
    setSelected,
    isPinMarkingMode,
    setPinMarkingMode,
    removePinFromAsset,
  } = usePanelStore();

  const selectedItem = (() => {
    if (!selected) return null;
    switch (selected.kind) {
      case "rail":
        return rails.find((r) => r.id === selected.id) || null;
      case "duct":
        return ducts.find((d) => d.id === selected.id) || null;
      case "component":
        return components.find((c) => c.id === selected.id) || null;
      case "cad":
        return cadAssets.find((a) => a.id === selected.id) || null;
    }
  })();

  return (
    <aside className="w-80 border-l border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md flex flex-col h-full select-none text-xs">
      <div className="p-3 border-b border-zinc-800/80 font-semibold text-zinc-200 flex items-center justify-between">
        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-zinc-400">
          <Sliders className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
          Inspector & Properties
        </span>
        {selected && (
          <button
            onClick={() => setSelected(null)}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* If no selection: show Enclosure Dimensions Config */}
        {!selected || !selectedItem ? (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 font-medium text-zinc-300 pb-1 border-b border-zinc-900">
              <Box className="w-3.5 h-3.5 text-zinc-400" />
              <span>Box Panel Enclosure</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  Width ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(enclosure.widthMm, displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateEnclosure({
                      widthMm: toMm(Number(e.target.value) || 0, displayUnit),
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  Height ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(enclosure.heightMm, displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateEnclosure({
                      heightMm: toMm(Number(e.target.value) || 0, displayUnit),
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  Depth ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(enclosure.depthMm, displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateEnclosure({
                      depthMm: toMm(Number(e.target.value) || 0, displayUnit),
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-900 space-y-2">
              <div className="text-[11px] text-zinc-400 font-medium">Mounting Plate</div>
              <div className="flex items-center justify-between text-zinc-500">
                <span>Plate Inset:</span>
                <span className="font-sans text-zinc-300">
                  {formatDim(enclosure.backplateInsetMm, displayUnit)}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-500">
                <span>Mounting Area:</span>
                <span className="font-sans text-zinc-300">
                  {formatDim(enclosure.widthMm - enclosure.backplateInsetMm * 2, displayUnit)} ×{" "}
                  {formatDim(enclosure.heightMm - enclosure.backplateInsetMm * 2, displayUnit)}
                </span>
              </div>
            </div>

            {/* Quick overview of panel elements */}
            <div className="pt-3 border-t border-zinc-900 space-y-2">
              <div className="text-[11px] text-zinc-400 font-medium">Items Overview</div>
              <div className="flex justify-between text-zinc-500">
                <span>DIN Rails:</span>
                <span className="font-sans text-zinc-200">{rails.length}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Wire Ducts:</span>
                <span className="font-sans text-zinc-200">{ducts.length}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Components:</span>
                <span className="font-sans text-zinc-200">{components.length}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Custom CAD Assets:</span>
                <span className="font-sans text-zinc-200">{cadAssets.length}</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Selected DIN Rail */}
        {selected?.kind === "rail" && selectedItem && "lengthMm" in selectedItem && (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
              <div className="font-medium text-amber-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>{selectedItem.name}</span>
              </div>
              <button
                onClick={() => removeRail(selectedItem.id)}
                className="text-red-400 hover:text-red-300 p-1"
                title="Delete Rail"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                Name
              </label>
              <input
                type="text"
                value={selectedItem.name}
                onChange={(e) => updateRail(selectedItem.id, { name: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  Y Position ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(selectedItem.yMm, displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateRail(selectedItem.id, {
                      yMm: toMm(Number(e.target.value) || 0, displayUnit),
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  Length ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(selectedItem.lengthMm, displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateRail(selectedItem.id, {
                      lengthMm: toMm(Number(e.target.value) || 0, displayUnit),
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="text-[11px] text-zinc-500">
              Profile: Standard 35mm × 7.5mm DIN Rail (EN 50022).
            </div>
          </div>
        )}

        {/* Selected Wire Duct */}
        {selected?.kind === "duct" && selectedItem && "orientation" in selectedItem && (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
              <div className="font-medium text-sky-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>{selectedItem.name}</span>
              </div>
              <button
                onClick={() => removeDuct(selectedItem.id)}
                className="text-red-400 hover:text-red-300 p-1"
                title="Delete Duct"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                Name
              </label>
              <input
                type="text"
                value={selectedItem.name}
                onChange={(e) => updateDuct(selectedItem.id, { name: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  X Pos ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(selectedItem.xMm, displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateDuct(selectedItem.id, {
                      xMm: toMm(Number(e.target.value) || 0, displayUnit),
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  Y Pos ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(selectedItem.yMm, displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateDuct(selectedItem.id, {
                      yMm: toMm(Number(e.target.value) || 0, displayUnit),
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  Width ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(selectedItem.widthMm, displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateDuct(selectedItem.id, {
                      widthMm: toMm(Number(e.target.value) || 0, displayUnit),
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  Height ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(selectedItem.heightMm, displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateDuct(selectedItem.id, {
                      heightMm: toMm(Number(e.target.value) || 0, displayUnit),
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Selected Component */}
        {selected?.kind === "component" && selectedItem && "templateId" in selectedItem && (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
              <div className="font-medium text-emerald-400 flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5" />
                <span>{selectedItem.name}</span>
              </div>
              <button
                onClick={() => removeComponent(selectedItem.id)}
                className="text-red-400 hover:text-red-300 p-1"
                title="Delete Component"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                Name
              </label>
              <input
                type="text"
                value={selectedItem.name}
                onChange={(e) =>
                  updateComponent(selectedItem.id, { name: e.target.value })
                }
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {/* Position with Live DIN Snap */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  X Along Rail ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(selectedItem.xMm, displayUnit).toFixed(2))}
                  onChange={(e) => {
                    const valMm = toMm(Number(e.target.value) || 0, displayUnit);
                    moveComponent(selectedItem.id, valMm, selectedItem.yMm);
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  Y Pos ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(selectedItem.yMm, displayUnit).toFixed(2))}
                  onChange={(e) => {
                    const valMm = toMm(Number(e.target.value) || 0, displayUnit);
                    moveComponent(selectedItem.id, selectedItem.xMm, valMm);
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-zinc-500 text-[11px]">
              <span>Mounted to:</span>
              <span className="font-sans text-zinc-300">
                {selectedItem.railId ? `DIN Rail (${selectedItem.railId})` : "Free Surface"}
              </span>
            </div>

            {/* Pin Terminals Table */}
            <div className="pt-2 border-t border-zinc-900 space-y-1.5">
              <div className="text-[11px] font-medium text-zinc-300 flex items-center justify-between">
                <span>Pin Terminals ({selectedItem.pins.length})</span>
                <span className="text-[10px] text-zinc-500 font-sans">Local mm</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {selectedItem.pins.map((pin) => (
                  <div
                    key={pin.id}
                    className="flex items-center justify-between p-1.5 rounded bg-zinc-900/60 border border-zinc-800/80 text-[11px]"
                  >
                    <span className="font-sans font-medium text-amber-400">
                      {pin.label}
                    </span>
                    <span className="font-sans text-zinc-400 text-[10px]">
                      [{pin.localXMm}, {pin.localYMm}, {pin.localZMm}]
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Selected Custom CAD Asset */}
        {selected?.kind === "cad" && selectedItem && "format" in selectedItem && (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
              <div className="font-medium text-sky-400 flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5" />
                <span>{selectedItem.name}</span>
              </div>
              <button
                onClick={() => removeCadAsset(selectedItem.id)}
                className="text-red-400 hover:text-red-300 p-1"
                title="Delete CAD Model"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-[11px] text-zinc-500 flex justify-between">
              <span>Source File:</span>
              <span className="font-sans text-zinc-300 truncate max-w-[140px]">
                {selectedItem.fileName}
              </span>
            </div>

            <div className="text-[11px] text-zinc-500 flex justify-between">
              <span>Imported Unit:</span>
              <span className="font-sans uppercase text-zinc-300">
                {selectedItem.sourceUnit}
              </span>
            </div>

            <div className="text-[11px] text-zinc-500 flex justify-between">
              <span>Normalized Size (mm):</span>
              <span className="font-sans text-zinc-300">
                {selectedItem.boundingBoxMm.w} × {selectedItem.boundingBoxMm.h} ×{" "}
                {selectedItem.boundingBoxMm.d}
              </span>
            </div>

            {/* Position inputs */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  X Pos ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(selectedItem.xMm, displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateCadAsset(selectedItem.id, {
                      xMm: toMm(Number(e.target.value) || 0, displayUnit),
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-sans block mb-1">
                  Y Pos ({displayUnit})
                </label>
                <input
                  type="number"
                  value={Number(fromMm(selectedItem.yMm, displayUnit).toFixed(2))}
                  onChange={(e) =>
                    updateCadAsset(selectedItem.id, {
                      yMm: toMm(Number(e.target.value) || 0, displayUnit),
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-100 font-sans focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Pin Marking Toggle */}
            <div className="pt-2 border-t border-zinc-900 space-y-2">
              <button
                onClick={() =>
                  setPinMarkingMode(!isPinMarkingMode, selectedItem.id)
                }
                className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-md font-medium transition-colors ${
                  isPinMarkingMode
                    ? "bg-amber-500 text-black font-semibold shadow-xs"
                    : "bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>{isPinMarkingMode ? "Marking Mode Active (Click Mesh)" : "Enable Pin Marker"}</span>
              </button>

              <div className="text-[10px] text-zinc-500">
                Click anywhere on 3D mesh surface to drop a pin terminal marker.
              </div>

              {/* Asset pins */}
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-zinc-300">
                  Custom Pins ({selectedItem.pins.length})
                </div>
                {selectedItem.pins.map((pin) => (
                  <div
                    key={pin.id}
                    className="flex items-center justify-between p-1.5 rounded bg-zinc-900/60 border border-zinc-800/80 text-[11px]"
                  >
                    <span className="font-sans font-medium text-amber-400">
                      {pin.label}
                    </span>
                    <span className="font-sans text-zinc-400 text-[10px]">
                      [{pin.localXMm}, {pin.localYMm}, {pin.localZMm}]
                    </span>
                    <button
                      onClick={() => removePinFromAsset(selectedItem.id, pin.id)}
                      className="text-red-400 hover:text-red-300 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
