"use client";

import {
  BookmarkPlus,
  Box,
  Check,
  ChevronDown,
  Clock,
  Cpu,
  FileUp,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Search,
  Shield,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { CadPreviewThumbnail } from "@/components/ui/CadPreviewThumbnail";
import { ComponentSvg2D } from "@/components/viewport/ComponentSvg2D";
import { ImageToCadModal } from "@/components/modals/ImageToCadModal";
import {
  COMPONENT_CATALOG,
  COMPONENT_CATEGORIES,
  COMPONENT_LIST,
} from "@/lib/components-catalog";
import { parseDxfToMmSegments } from "@/lib/dxf-parser";
import {
  listCustomCadLibrary,
  removeCustomCadFromLibrary,
  renameCustomCadInLibrary,
  saveCustomCadToLibrary,
  updateCustomCadCloudId,
  type CustomLibraryCadItem,
} from "@/lib/indexed-db";
import {
  PANELFLOW_PART_DRAG_MIME,
  buildCadAssetFromLibraryItem,
  setDraggedCadLibraryItem,
} from "@/lib/part-drag";
import { formatDim } from "@/lib/units";
import { usePanelStore } from "@/store/usePanelStore";
import type {
  CadFormat,
  CadImportUnit,
  ComponentCategory,
  ComponentTemplate,
  ComponentTemplateId,
  CustomCadAsset,
} from "@/types/panel";

type TabId = "components" | "cad";

const CATEGORY_ICONS: Record<ComponentCategory, React.ReactNode> = {
  "Protection & Switchgear": <Shield className="h-3.5 w-3.5 text-zinc-400 shrink-0" />,
  "Control & Automation": <Cpu className="h-3.5 w-3.5 text-zinc-400 shrink-0" />,
  "Power & Distribution": <Zap className="h-3.5 w-3.5 text-zinc-400 shrink-0" />,
  "Terminals & DIN Accessories": <Layers className="h-3.5 w-3.5 text-zinc-400 shrink-0" />,
  "Door & Panel Controls": <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400 shrink-0" />,
};

function PartVectorIcon({
  templateId,
  accentColor,
}: {
  templateId: ComponentTemplateId;
  accentColor: string;
}) {
  const tpl = COMPONENT_CATALOG[templateId];
  if (!tpl) return null;

  const pad = 4;
  const padTop = tpl.id === "tor" ? 12 : pad;
  const vh = tpl.heightMm + padTop + pad;
  const vw = Math.max(tpl.widthMm + pad * 2, vh * 0.55);
  const vx = (tpl.widthMm - vw) / 2;
  const vy = -padTop;

  const previewComp = {
    id: `preview-${tpl.id}`,
    templateId: tpl.id,
    name: tpl.shortName,
    mountingType: tpl.mountingType ?? "din_rail",
    xMm: tpl.widthMm / 2,
    yMm: -tpl.heightMm / 2,
    zMm: tpl.depthMm / 2,
    rotationDeg: 0 as const,
    railId: null,
    widthMm: tpl.widthMm,
    heightMm: tpl.heightMm,
    depthMm: tpl.depthMm,
    color: tpl.color,
    accentColor: accentColor || tpl.accentColor,
    pins: tpl.pins.map((p, idx) => ({
      ...p,
      id: `preview-pin-${idx}`,
    })),
  };

  return (
    <svg
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      className="h-9 w-9 overflow-visible"
      preserveAspectRatio="xMidYMid meet"
    >
      <ComponentSvg2D
        comp={previewComp}
        x={0}
        y={0}
        bodyFill="#f8fafc"
        isSelected={false}
      />
    </svg>
  );
}

export function LeftSidebar() {
  const [activeTab, setActiveTab] = useState<TabId>("components");
  const [searchQuery, setSearchQuery] = useState("");
  const [cadImportUnit, setCadImportUnit] = useState<CadImportUnit>("mm");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    Favorites: true,
    "Recent Symbols": true,
    "Protection & Switchgear": true,
    "Control & Automation": true,
    "Power & Distribution": true,
    "Terminals & DIN Accessories": true,
    "Door & Panel Controls": true,
    "My CAD Library": true,
  });
  const [customLibrary, setCustomLibrary] = useState<CustomLibraryCadItem[]>([]);
  const [savedToastId, setSavedToastId] = useState<string | null>(null);
  const [editingLibraryId, setEditingLibraryId] = useState<string | null>(null);
  const [editingLibraryName, setEditingLibraryName] = useState("");
  const [editingCadId, setEditingCadId] = useState<string | null>(null);
  const [editingCadName, setEditingCadName] = useState("");
  const [showImageToCadModal, setShowImageToCadModal] = useState(false);
  const [hoveredPart, setHoveredPart] = useState<{
    tpl: ComponentTemplate;
    rect: DOMRect;
  } | null>(null);

  const hydratePartPreferences = usePanelStore((s) => s.hydratePartPreferences);

  useEffect(() => {
    hydratePartPreferences();
    const reloadLibrary = () => {
      listCustomCadLibrary()
        .then((items) => setCustomLibrary(items))
        .catch(() => {
          // IndexedDB unavailable
        });
    };
    reloadLibrary();

    if (typeof window !== "undefined") {
      window.addEventListener("panelflow:custom-library-updated", reloadLibrary);
      return () => {
        window.removeEventListener("panelflow:custom-library-updated", reloadLibrary);
      };
    }
  }, [hydratePartPreferences]);

  const displayUnit = usePanelStore((s) => s.displayUnit);
  const components = usePanelStore((s) => s.components);
  const cadAssets = usePanelStore((s) => s.cadAssets);
  const [torNotice, setTorNotice] = useState<string | null>(null);

  const hasAvailableContactor = useMemo(
    () =>
      components.some(
        (c) =>
          c.templateId === "contactor" &&
          !components.some(
            (other) =>
              other.templateId === "tor" && other.mountedToComponentId === c.id
          )
      ),
    [components]
  );
  const selected = usePanelStore((s) => s.selected);
  const isPinMarkingMode = usePanelStore((s) => s.isPinMarkingMode);
  const activeMarkingAssetId = usePanelStore((s) => s.activeMarkingAssetId);

  const setSelected = usePanelStore((s) => s.setSelected);
  const addComponent = usePanelStore((s) => s.addComponent);
  const leftSidebarOpen = usePanelStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = usePanelStore((s) => s.setLeftSidebarOpen);
  const recentPartIds = usePanelStore((s) => s.recentPartIds);
  const favoritePartIds = usePanelStore((s) => s.favoritePartIds);
  const toggleFavoritePart = usePanelStore((s) => s.toggleFavoritePart);
  const addCadAsset = usePanelStore((s) => s.addCadAsset);
  const updateCadAsset = usePanelStore((s) => s.updateCadAsset);
  const removeCadAsset = usePanelStore((s) => s.removeCadAsset);
  const setPinMarkingMode = usePanelStore((s) => s.setPinMarkingMode);

  const q = searchQuery.trim().toLowerCase();
  const filteredComponents = COMPONENT_LIST.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.shortName.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
  );
  const favoriteItems = favoritePartIds
    .map((id) => COMPONENT_CATALOG[id])
    .filter(
      (c): c is NonNullable<typeof c> =>
        Boolean(c) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          c.shortName.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q))
    );
  const recentItems = recentPartIds
    .map((id) => COMPONENT_CATALOG[id])
    .filter(
      (c): c is NonNullable<typeof c> =>
        Boolean(c) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          c.shortName.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q))
    );
  const filteredCad = cadAssets.filter(
    (a) =>
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.fileName.toLowerCase().includes(q)
  );
  // Deduplicate library items by name + format or cloudId to prevent double-entry glitches
  const deduplicatedLibrary = useMemo(() => {
    const seen = new Set<string>();
    const out: CustomLibraryCadItem[] = [];
    for (const item of customLibrary) {
      const key = item.cloudId
        ? `cloud:${item.cloudId}`
        : `${item.name.toLowerCase()}::${item.format}::${item.boundingBoxMm.w}x${item.boundingBoxMm.h}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  }, [customLibrary]);

  const filteredLibrary = deduplicatedLibrary.filter(
    (item: CustomLibraryCadItem) =>
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.fileName.toLowerCase().includes(q) ||
      item.format.toLowerCase().includes(q)
  );

  const toggleCategory = (cat: string) => {
    setOpenCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleSaveToLibrary = async (asset: CustomCadAsset) => {
    try {
      const saved = await saveCustomCadToLibrary(asset);
      setCustomLibrary((prev) => {
        const idx = prev.findIndex((i) => i.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });

      // If user is logged in, also sync custom part to PostgreSQL cloud
      fetch("/api/custom-parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: asset.name,
          format: asset.format,
          bounding_box: asset.cropMm
            ? { ...asset.boundingBoxMm, cropMm: asset.cropMm }
            : asset.boundingBoxMm,
          pins: asset.pins,
          cad_data: asset.rawText || asset.dataUrl || null,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const cloudId = data?.part?.id;
          if (typeof cloudId === "string" && cloudId) {
            updateCustomCadCloudId(saved.id, cloudId).catch(() => {});
            setCustomLibrary((prev) =>
              prev.map((i) => (i.id === saved.id ? { ...i, cloudId } : i))
            );
          }
        })
        .catch(() => {});

      setSavedToastId(asset.id);
      setTimeout(() => {
        setSavedToastId((curr) => (curr === asset.id ? null : curr));
      }, 1800);
    } catch {
      // ignore
    }
  };

  const handleDeleteFromLibrary = async (item: CustomLibraryCadItem) => {
    try {
      await removeCustomCadFromLibrary(item.id);
      setCustomLibrary((prev) => prev.filter((i) => i.id !== item.id));
      const remoteId = item.cloudId ?? item.id;
      fetch(`/api/custom-parts?id=${encodeURIComponent(remoteId)}`, {
        method: "DELETE",
      }).catch(() => {});
    } catch {
      // ignore
    }
  };

  const handleRenameLibraryItem = async (item: CustomLibraryCadItem) => {
    const trimmed = editingLibraryName.trim();
    setEditingLibraryId(null);
    if (!trimmed || trimmed === item.name) return;

    try {
      const updated = await renameCustomCadInLibrary(item.id, trimmed);
      setCustomLibrary((prev) =>
        prev.map((i) =>
          i.id === item.id ? updated ?? { ...i, name: trimmed } : i
        )
      );
      const remoteId = item.cloudId ?? item.id;
      fetch("/api/custom-parts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: remoteId, name: trimmed }),
      }).catch(() => {});
    } catch {
      // ignore
    }
  };

  const handleRenameCadAsset = (asset: CustomCadAsset) => {
    const trimmed = editingCadName.trim();
    setEditingCadId(null);
    if (!trimmed || trimmed === asset.name) return;
    updateCadAsset(asset.id, { name: trimmed });
  };

  const handleInstantiateFromLibrary = (item: CustomLibraryCadItem) => {
    addCadAsset(buildCadAssetFromLibraryItem(item));
  };

  const handlePartDragStart = (
    e: React.DragEvent,
    templateId: ComponentTemplateId
  ) => {
    if (templateId === "tor" && !hasAvailableContactor) {
      e.preventDefault();
      setTorNotice("TOR harus dipasang pada Contactor. Tambahkan Contactor dulu.");
      setTimeout(() => setTorNotice(null), 2600);
      return;
    }
    setHoveredPart(null);
    e.dataTransfer.setData(
      PANELFLOW_PART_DRAG_MIME,
      JSON.stringify({ kind: "component", templateId })
    );
    e.dataTransfer.setData("text/plain", templateId);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleCadLibraryDragStart = (
    e: React.DragEvent,
    item: CustomLibraryCadItem
  ) => {
    setHoveredPart(null);
    setDraggedCadLibraryItem(item);
    e.dataTransfer.setData(
      PANELFLOW_PART_DRAG_MIME,
      JSON.stringify({ kind: "cad_library", libraryId: item.id })
    );
    e.dataTransfer.setData("text/plain", item.name);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleCadUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["glb", "gltf", "obj", "dxf"].includes(ext)) return;

    const format = ext as CadFormat;
    const id = `cad-${Date.now()}`;
    const baseAsset: CustomCadAsset = {
      id,
      name: file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      format,
      sourceUnit: cadImportUnit,
      xMm: 0,
      yMm: 0,
      zMm: 30,
      boundingBoxMm: { w: 50, h: 50, d: 20 },
      pins: [],
    };

    if (format === "glb" || format === "gltf") {
      baseAsset.objectUrl = URL.createObjectURL(file);
      baseAsset.dataUrl = await new Promise<string | undefined>((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(typeof reader.result === "string" ? reader.result : undefined);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      });
    } else {
      baseAsset.rawText = await file.text();
      if (format === "dxf") {
        const parsed = parseDxfToMmSegments(baseAsset.rawText, cadImportUnit);
        baseAsset.boundingBoxMm = parsed.boundingBoxMm;
        baseAsset.entityCount = parsed.entityCount;
        baseAsset.parseWarning = parsed.warning;
      }
    }

    addCadAsset(baseAsset);
    e.target.value = "";
  };

  const tabs: { id: TabId; label: string; icon: typeof Box }[] = [
    { id: "components", label: "Parts", icon: Cpu },
    { id: "cad", label: "CAD", icon: FileUp },
  ];

  const handleAddComponent = (templateId: ComponentTemplateId) => {
    if (templateId === "tor" && !hasAvailableContactor) {
      setTorNotice("TOR harus dipasang pada Contactor. Tambahkan Contactor dulu.");
      setTimeout(() => setTorNotice(null), 2600);
      return;
    }
    addComponent(templateId);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setLeftSidebarOpen(false);
    }
  };

  if (!leftSidebarOpen) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] md:hidden"
        onClick={() => setLeftSidebarOpen(false)}
        aria-hidden="true"
      />
      <aside className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[320px] flex-col border-r border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#0c0e14]/95 text-[#0f172a] dark:text-slate-200 shadow-2xl backdrop-blur-xl md:relative md:inset-y-auto md:left-auto md:z-auto md:w-[300px] md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none md:bg-white md:dark:bg-[#0c0e14]/90">
        {/* Mobile Drawer Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#e2e8f0] dark:border-white/10 px-3 py-2 md:hidden">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-slate-600 dark:text-zinc-400" />
            <span className="text-xs font-semibold tracking-tight text-[#0f172a] dark:text-white">
              Parts &amp; Library
            </span>
          </div>
          <button
            type="button"
            onClick={() => setLeftSidebarOpen(false)}
            aria-label="Close Parts Drawer"
            className="rounded-lg p-1.5 text-[#64748b] dark:text-slate-400 hover:bg-[#e2e8f0] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Search Bar Pill */}
      <div className="p-2.5 pb-2">
        <div className="flex items-center gap-2 rounded-full border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] px-3 py-2 focus-within:border-[#cbd5e1] dark:focus-within:border-white/25 transition-colors shadow-xs">
          <Search className="h-4 w-4 shrink-0 text-[#64748b] dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search parts, rails, symbols..."
            className="w-full bg-transparent text-xs text-[#0f172a] dark:text-slate-100 placeholder:text-[#94a3b8] dark:placeholder:text-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-[#64748b] dark:text-slate-500 hover:text-[#0f172a] dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Pill Switcher (Compact 2-tab: Parts & CAD) */}
      <div className="px-2.5 pb-1.5">
        <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-[#f1f5f9] dark:bg-[#131620]/70 p-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-1 rounded-md py-1 px-1 text-[11px] font-medium transition-all cursor-pointer truncate ${
                  active
                    ? "bg-[#0f172a] text-white dark:bg-white dark:text-black shadow-xs font-semibold"
                    : "text-[#64748b] dark:text-slate-400 hover:bg-[#e2e8f0] dark:hover:bg-white/5 hover:text-[#0f172a] dark:hover:text-slate-200"
                }`}
              >
                <Icon className="h-3 w-3 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-3 text-xs">
        {activeTab === "components" && (
          <div className="space-y-2.5">
            {torNotice && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {torNotice}
              </div>
            )}
            {/* ★ FAVORITES Section */}
            {favoriteItems.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-white/5 bg-transparent overflow-hidden transition-colors">
                <button
                  type="button"
                  onClick={() => toggleCategory("Favorites")}
                  className="w-full px-2.5 py-1.5 flex items-center gap-1.5 text-left text-[11px] font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <ChevronDown
                    className={`h-3 w-3 text-zinc-400 shrink-0 transition-transform ${
                      openCategories["Favorites"] ? "" : "-rotate-90"
                    }`}
                  />
                  <Star className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400 shrink-0" />
                  <span className="truncate">Favorites</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-sans font-normal shrink-0">
                    ({favoriteItems.length})
                  </span>
                </button>

                {openCategories["Favorites"] && (
                  <div className="p-1.5 grid grid-cols-2 gap-1.5">
                    {favoriteItems.map((tpl) => (
                      <div
                        key={`fav-${tpl.id}`}
                        draggable
                        onDragStart={(e) => handlePartDragStart(e, tpl.id)}
                        onMouseEnter={(e) =>
                          setHoveredPart({
                            tpl,
                            rect: e.currentTarget.getBoundingClientRect(),
                          })
                        }
                        onMouseLeave={() => setHoveredPart(null)}
                        className="group relative p-2 rounded-lg cursor-grab active:cursor-grabbing flex flex-col items-center justify-center text-center transition-all bg-transparent border border-transparent hover:bg-slate-100 hover:border-slate-200 dark:hover:bg-white/5 dark:hover:border-white/10"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoritePart(tpl.id);
                          }}
                          title="Remove from Favorites"
                          className="absolute top-1 right-1 z-10 rounded-full p-1 text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors cursor-pointer"
                        >
                          <Star className="h-3 w-3 text-slate-600 dark:text-zinc-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddComponent(tpl.id)}
                          className="w-full flex flex-col items-center cursor-pointer"
                        >
                          <div className="w-10 h-10 flex items-center justify-center p-1 mb-1.5 bg-transparent">
                            <PartVectorIcon
                              templateId={tpl.id}
                              accentColor={tpl.accentColor}
                            />
                          </div>
                          <span className="text-[11px] font-medium truncate w-full text-slate-700 group-hover:text-slate-900 dark:text-zinc-300 dark:group-hover:text-white transition-colors">
                            {tpl.shortName}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 🕒 RECENT SYMBOLS Section */}
            {recentItems.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-white/5 bg-transparent overflow-hidden transition-colors">
                <button
                  type="button"
                  onClick={() => toggleCategory("Recent Symbols")}
                  className="w-full px-2.5 py-1.5 flex items-center gap-1.5 text-left text-[11px] font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <ChevronDown
                    className={`h-3 w-3 text-zinc-400 shrink-0 transition-transform ${
                      openCategories["Recent Symbols"] ? "" : "-rotate-90"
                    }`}
                  />
                  <Clock className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">Recent Parts</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-sans font-normal shrink-0">
                    ({recentItems.length})
                  </span>
                </button>

                {openCategories["Recent Symbols"] && (
                  <div className="p-1.5 grid grid-cols-2 gap-1.5">
                    {recentItems.map((tpl) => {
                      const isFav = favoritePartIds.includes(tpl.id);
                      return (
                        <div
                          key={`rec-${tpl.id}`}
                          draggable
                          onDragStart={(e) => handlePartDragStart(e, tpl.id)}
                          onMouseEnter={(e) =>
                            setHoveredPart({
                              tpl,
                              rect: e.currentTarget.getBoundingClientRect(),
                            })
                          }
                          onMouseLeave={() => setHoveredPart(null)}
                          className="group relative p-2 rounded-lg cursor-grab active:cursor-grabbing flex flex-col items-center justify-center text-center transition-all bg-transparent border border-transparent hover:bg-slate-100 hover:border-slate-200 dark:hover:bg-white/5 dark:hover:border-white/10"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavoritePart(tpl.id);
                            }}
                            title={isFav ? "Starred favorite" : "Add to Favorites"}
                            className={`absolute top-1 right-1 z-10 rounded-full p-1 transition-colors cursor-pointer ${
                              isFav
                                ? "text-amber-500"
                                : "text-[#94a3b8] opacity-0 group-hover:opacity-100 hover:text-amber-500"
                            }`}
                          >
                            <Star
                              className={`h-3 w-3 ${
                                isFav ? "fill-amber-400 text-amber-500" : ""
                              }`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddComponent(tpl.id)}
                            className="w-full flex flex-col items-center cursor-pointer"
                          >
                            <div className="w-10 h-10 flex items-center justify-center p-1 mb-1.5 bg-transparent">
                              <PartVectorIcon
                                templateId={tpl.id}
                                accentColor={tpl.accentColor}
                              />
                            </div>
                            <span className="text-[11px] font-medium truncate w-full text-slate-700 group-hover:text-slate-900 dark:text-zinc-300 dark:group-hover:text-white transition-colors">
                              {tpl.shortName}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* My CAD Library Accordion */}
            {filteredLibrary.length > 0 && (
              <div className="rounded-xl border border-sky-200 dark:border-sky-500/20 bg-sky-50/50 dark:bg-sky-950/20 p-2.5 space-y-2 shadow-xs">
                <button
                  type="button"
                  onClick={() => toggleCategory("My CAD Library")}
                  className="flex w-full items-center justify-between font-sans text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300"
                >
                  <span className="flex items-center gap-1.5">
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${
                        openCategories["My CAD Library"] ? "" : "-rotate-90"
                      }`}
                    />
                    <FolderOpen className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    My CAD Library
                  </span>
                  <span className="rounded-full bg-sky-100 dark:bg-sky-900/50 px-2 py-0.5 text-[10px]">
                    {filteredLibrary.length}
                  </span>
                </button>

                {openCategories["My CAD Library"] && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {filteredLibrary.map((item: CustomLibraryCadItem) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleCadLibraryDragStart(e, item)}
                        onDragEnd={() => setDraggedCadLibraryItem(null)}
                        className="group relative flex flex-col justify-between rounded-xl border border-sky-200 dark:border-sky-500/30 bg-white dark:bg-[#171a21] p-2 transition-all hover:border-sky-400 dark:hover:border-sky-400 cursor-grab active:cursor-grabbing"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="rounded bg-sky-100 dark:bg-sky-950 px-1 py-0.2 font-sans text-[9px] font-bold text-sky-700 dark:text-sky-400">
                              {item.format.toUpperCase()}
                            </span>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLibraryId(item.id);
                                  setEditingLibraryName(item.name);
                                }}
                                title="Rename in Library"
                                className="p-1 text-[#94a3b8] hover:text-sky-500"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteFromLibrary(item)}
                                title="Delete from Library"
                                className="p-1 text-[#94a3b8] hover:text-rose-500"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-1.5 flex h-14 w-full items-center justify-center rounded-lg border border-sky-100 dark:border-white/5 bg-sky-50/40 dark:bg-[#0c0e14]/60 p-1.5">
                            <CadPreviewThumbnail
                              format={item.format}
                              rawText={item.rawText}
                              imageOverlayUrl={item.imageOverlayUrl || item.dataUrl}
                              materialType={item.materialType}
                              drawShape={item.drawShape}
                              sourceUnit={item.sourceUnit}
                              boundingBoxMm={item.boundingBoxMm}
                              pins={item.pins}
                              className="h-full w-full"
                            />
                          </div>

                          {editingLibraryId === item.id ? (
                            <input
                              type="text"
                              autoFocus
                              value={editingLibraryName}
                              onChange={(e) => setEditingLibraryName(e.target.value)}
                              onBlur={() => handleRenameLibraryItem(item)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleRenameLibraryItem(item);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  setEditingLibraryId(null);
                                }
                              }}
                              className="mt-1.5 w-full rounded border border-sky-400 bg-white dark:bg-[#0c0e14] px-1.5 py-0.5 text-[12px] font-medium text-[#0f172a] dark:text-slate-100 focus:outline-none"
                            />
                          ) : (
                            <div className="mt-1.5 truncate text-[12px] font-medium text-[#0f172a] dark:text-slate-100">
                              {item.name}
                            </div>
                          )}
                          <div className="font-sans text-[10px] text-[#64748b] dark:text-slate-400">
                            {formatDim(item.boundingBoxMm.w, displayUnit, 0)}×
                            {formatDim(item.boundingBoxMm.h, displayUnit, 0)} ·{" "}
                            {item.pins.length}P
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleInstantiateFromLibrary(item)}
                          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-sky-600 hover:bg-sky-500 py-1 font-sans text-[10px] font-semibold text-white transition-colors"
                        >
                          <Plus className="h-3 w-3" /> Place
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Standard Component Categories */}
            {COMPONENT_CATEGORIES.map((cat) => {
              const catItems = filteredComponents.filter(
                (c) => c.category === cat
              );
              if (catItems.length === 0) return null;
              const isOpen = openCategories[cat] ?? true;

              return (
                <div
                  key={cat}
                  className="rounded-xl border border-slate-200 dark:border-white/5 bg-transparent overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="w-full px-2.5 py-1.5 flex items-center gap-1.5 text-left text-[11px] font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <ChevronDown
                      className={`h-3 w-3 text-zinc-400 shrink-0 transition-transform ${
                        isOpen ? "" : "-rotate-90"
                      }`}
                    />
                    {CATEGORY_ICONS[cat]}
                    <span className="truncate">{cat}</span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-sans font-normal shrink-0">
                      ({catItems.length})
                    </span>
                  </button>

                  {isOpen && (
                    <div className="p-1.5 grid grid-cols-2 gap-1.5">
                      {catItems.map((tpl) => {
                        const isFav = favoritePartIds.includes(tpl.id);
                        return (
                          <div
                            key={tpl.id}
                            draggable
                            onDragStart={(e) => handlePartDragStart(e, tpl.id)}
                            onMouseEnter={(e) =>
                              setHoveredPart({
                                tpl,
                                rect: e.currentTarget.getBoundingClientRect(),
                              })
                            }
                            onMouseLeave={() => setHoveredPart(null)}
                            className="group relative p-2 rounded-lg cursor-grab active:cursor-grabbing flex flex-col items-center justify-center text-center transition-all bg-transparent border border-transparent hover:bg-slate-100 hover:border-slate-200 dark:hover:bg-white/5 dark:hover:border-white/10"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavoritePart(tpl.id);
                              }}
                              title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                              aria-label={isFav ? `Unfavorite ${tpl.shortName}` : `Favorite ${tpl.shortName}`}
                              className={`absolute top-1 right-1 z-10 rounded-full p-1 transition-colors cursor-pointer ${
                                isFav
                                  ? "text-amber-500"
                                  : "text-[#94a3b8] opacity-0 group-hover:opacity-100 hover:text-amber-500"
                              }`}
                            >
                              <Star
                                className={`h-3 w-3 ${
                                  isFav ? "fill-amber-400 text-amber-500" : ""
                                }`}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddComponent(tpl.id)}
                              className="w-full flex flex-col items-center active:scale-[0.98] cursor-pointer"
                            >
                              <div className="w-10 h-10 flex items-center justify-center p-1 mb-1.5 bg-transparent">
                                <PartVectorIcon
                                  templateId={tpl.id}
                                  accentColor={tpl.accentColor}
                                />
                              </div>
                              <span className="text-[11px] font-medium truncate w-full text-slate-700 group-hover:text-slate-900 dark:text-zinc-300 dark:group-hover:text-white transition-colors">
                                {tpl.shortName}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredComponents.length === 0 && filteredLibrary.length === 0 && (
              <div className="rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#131620]/70 p-6 text-center text-xs text-[#94a3b8] dark:text-slate-500">
                No matching parts in library
              </div>
            )}
          </div>
        )}

        {activeTab === "cad" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#131620]/70 p-3 space-y-2.5 shadow-xs">
              <div className="font-sans text-[11px] font-semibold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
                Custom CAD Importer
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-[#64748b] dark:text-slate-400">
                  Source File Native Unit
                </span>
                <select
                  value={cadImportUnit}
                  onChange={(e) =>
                    setCadImportUnit(e.target.value as CadImportUnit)
                  }
                  className="w-full rounded-lg border border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#171a21] px-2.5 py-1.5 font-sans text-xs text-[#0f172a] dark:text-slate-100 focus:border-[#0284c7] dark:focus:border-white/30 focus:outline-none"
                >
                  <option value="mm">Millimeters (mm)</option>
                  <option value="cm">Centimeters (cm)</option>
                  <option value="m">Meters (m)</option>
                  <option value="inch">Inches (inch)</option>
                </select>
              </label>

              <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#cbd5e1] dark:border-white/15 bg-[#f8fafc] dark:bg-[#171a21] p-4 text-center transition-colors hover:border-[#0284c7] dark:hover:border-white/35">
                <FileUp className="h-5 w-5 text-[#64748b] dark:text-slate-300" />
                <span className="text-xs font-medium text-[#0f172a] dark:text-slate-200">
                  Upload .GLB / .GLTF / .OBJ / .DXF
                </span>
                <span className="font-sans text-[11px] text-[#94a3b8] dark:text-slate-500">
                  Auto-normalized to canonical mm
                </span>
                <input
                  type="file"
                  accept=".glb,.gltf,.obj,.dxf"
                  onChange={handleCadUpload}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => setShowImageToCadModal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 p-2.5 text-center transition-colors font-medium text-xs"
              >
                <ImageIcon className="h-4 w-4" />
                <span>Image Component Creator</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {filteredCad.map((asset) => {
                const markingThis =
                  isPinMarkingMode && activeMarkingAssetId === asset.id;
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelected({ kind: "cad", id: asset.id })}
                    className={`rounded-lg border p-2 transition-colors cursor-pointer ${
                      selected?.kind === "cad" && selected.id === asset.id
                        ? "border-[#0284c7] bg-[#e0f2fe] text-[#0369a1] dark:border-white/35 dark:bg-[#343842]/50 dark:text-slate-200"
                        : "border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#171a21] hover:border-[#cbd5e1] dark:hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#e2e8f0] dark:border-white/10 bg-[#f8fafc] dark:bg-[#0c0e14] p-1">
                          <CadPreviewThumbnail
                            format={asset.format}
                            rawText={asset.rawText}
                            imageOverlayUrl={asset.imageOverlayUrl || asset.dataUrl}
                            materialType={asset.materialType}
                            drawShape={asset.drawShape}
                            sourceUnit={asset.sourceUnit}
                            boundingBoxMm={asset.boundingBoxMm}
                            pins={asset.pins}
                            className="h-full w-full"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          {editingCadId === asset.id ? (
                            <input
                              type="text"
                              autoFocus
                              value={editingCadName}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setEditingCadName(e.target.value)}
                              onBlur={() => handleRenameCadAsset(asset)}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleRenameCadAsset(asset);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  setEditingCadId(null);
                                }
                              }}
                              className="w-full rounded border border-sky-400 bg-white dark:bg-[#0c0e14] px-1.5 py-0.5 text-xs font-medium text-[#0f172a] dark:text-slate-100 focus:outline-none"
                            />
                          ) : (
                            <div className="truncate text-xs font-medium text-[#0f172a] dark:text-slate-200">
                              {asset.name}
                            </div>
                          )}
                          <div className="font-sans text-[11px] text-[#64748b] dark:text-slate-400">
                            [{asset.format.toUpperCase()}] · {asset.pins.length}{" "}
                            pins
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCadId(asset.id);
                            setEditingCadName(asset.name);
                          }}
                          title="Rename CAD asset"
                          className="p-1 text-[#94a3b8] dark:text-slate-500 hover:text-sky-500 dark:hover:text-sky-400"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCadAsset(asset.id);
                          }}
                          title="Remove CAD asset"
                          className="p-1 text-[#94a3b8] dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected({ kind: "cad", id: asset.id });
                          setPinMarkingMode(!markingThis, asset.id);
                        }}
                        className={`flex-1 rounded-md py-1.5 font-sans text-[11px] font-semibold transition-colors ${
                          markingThis
                            ? "bg-amber-500 text-black font-bold"
                            : "border border-[#e2e8f0] dark:border-white/10 bg-[#f1f5f9] dark:bg-[#0c0e14] text-[#334155] dark:text-slate-300 hover:border-[#cbd5e1] dark:hover:border-white/25"
                        }`}
                      >
                        <MapPin className="mr-1 inline h-3.5 w-3.5" />
                        {markingThis ? "Done Marking" : "Mark Pins"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveToLibrary(asset);
                        }}
                        title="Save CAD asset + marked pins to My Library (IndexedDB)"
                        className={`flex-1 rounded-md py-1.5 font-sans text-[11px] font-semibold transition-colors ${
                          savedToastId === asset.id
                            ? "bg-emerald-600 text-white"
                            : "border border-sky-300 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/60"
                        }`}
                      >
                        {savedToastId === asset.id ? (
                          <>
                            <Check className="mr-1 inline h-3.5 w-3.5" />
                            Saved!
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="mr-1 inline h-3.5 w-3.5" />
                            Save to My Library
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>

    {/* Floating Rich Popover Card on Part Hover (RelayTest style) */}
    {hoveredPart &&
      (() => {
        const { tpl, rect } = hoveredPart;
        const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
        const screenH = typeof window !== "undefined" ? window.innerHeight : 800;
        const cardW = 260;
        let left = rect.right + 12;
        if (left + cardW > screenW - 12) {
          left = Math.max(12, rect.left - cardW - 12);
        }
        const top = Math.max(16, Math.min(screenH - 190, rect.top - 12));

        return (
          <div
            style={{
              position: "fixed",
              left: `${left}px`,
              top: `${top}px`,
              width: `${cardW}px`,
              zIndex: 9999,
            }}
            className="pointer-events-none rounded-xl border p-3 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2 select-none bg-white/98 border-zinc-200 text-zinc-900 shadow-zinc-950/15 ring-1 ring-black/5 dark:bg-[#0f1219]/95 dark:border-zinc-800/90 dark:text-zinc-100 dark:shadow-black/80 dark:ring-1 dark:ring-white/10"
          >
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className="text-[9px] font-sans uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
                    {tpl.mountingType === "din_rail"
                      ? "DIN Rail"
                      : tpl.mountingType === "screw_plate"
                      ? "Screw Plate"
                      : tpl.mountingType === "parent_mount"
                      ? "Plug-In"
                      : "Door Cutout"}
                  </span>
                  <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                    {tpl.tagPrefix}
                  </span>
                </div>
                <h4 className="font-bold text-xs tracking-tight leading-snug text-zinc-900 dark:text-zinc-100">
                  {tpl.name}
                </h4>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                  {tpl.referenceModel}
                </p>
              </div>
              <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-1">
                <PartVectorIcon
                  templateId={tpl.id}
                  accentColor={tpl.accentColor}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="block text-[9px] font-sans uppercase text-zinc-400">
                  Dimensions (W×H×D)
                </span>
                <span className="font-sans font-medium text-zinc-800 dark:text-zinc-200">
                  {formatDim(tpl.widthMm, displayUnit, 1)} ×{" "}
                  {formatDim(tpl.heightMm, displayUnit, 1)} ×{" "}
                  {formatDim(tpl.depthMm, displayUnit, 1)}
                </span>
              </div>
              <div>
                <span className="block text-[9px] font-sans uppercase text-zinc-400">
                  Terminals
                </span>
                <span className="font-sans font-medium text-zinc-800 dark:text-zinc-200">
                  {tpl.pins.length} pins
                </span>
              </div>
            </div>

            {(tpl.behavior?.clearanceMm || tpl.behavior?.cutoutSummary || tpl.behavior?.sideBySideSnap) && (
              <div className="pt-1.5 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-1 text-[10px] text-zinc-600 dark:text-zinc-400">
                {tpl.behavior?.sideBySideSnap && (
                  <span className="rounded bg-zinc-100 dark:bg-zinc-800/80 px-1.5 py-0.5">
                    0mm Side Snap
                  </span>
                )}
                {tpl.behavior?.clearanceMm && (
                  <span className="rounded bg-zinc-100 dark:bg-zinc-800/80 px-1.5 py-0.5">
                    Clearance ↑{tpl.behavior.clearanceMm.top ?? 0}/↓{tpl.behavior.clearanceMm.bottom ?? 0}mm
                  </span>
                )}
                {tpl.behavior?.cutoutSummary && (
                  <span className="rounded bg-zinc-100 dark:bg-zinc-800/80 px-1.5 py-0.5">
                    Cutout: {tpl.behavior.cutoutSummary}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })()}

    {showImageToCadModal && (
      <ImageToCadModal onClose={() => setShowImageToCadModal(false)} />
    )}
    </>
  );
}
