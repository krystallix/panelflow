"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Box,
  ChevronDown,
  ClipboardList,
  Copy,
  Cpu,
  Download,
  Eye,
  FileCheck2,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderOpen,
  Grid,
  Layers,
  Menu,
  Network,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Save,
  Sliders,
  Sun,
  Moon,
  Hash,
  Undo2,
  Users,
  Zap,
  Cloud,
  LogIn,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { clearAutoSaveSession } from "@/lib/indexed-db";
import { Button, Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui";
import { useAuthStore } from "@/store/useAuthStore";
import {
  parseAndValidatePflow,
  rehydrateCadAssets,
  sanitizeProjectFilename,
  serializeProjectAsync,
} from "@/lib/project-io";
import { generatePanelFlowSheetSvg } from "@/lib/sheet-export";
import { generateDrillingDxf, generateDrillingSvg } from "@/lib/template-export";
import { generateDoorDrillingDxf, generateDoorDrillingSvg } from "@/lib/door-cutout";
import { formatDim } from "@/lib/units";
import { usePanelStore } from "@/store/usePanelStore";
import type { DoorMode, GridSnapMm, LengthUnit, SheetType } from "@/types/panel";

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TopToolbar() {
  const viewportMode = usePanelStore((s) => s.viewportMode);
  const theme = usePanelStore((s) => s.theme);
  const toggleTheme = usePanelStore((s) => s.toggleTheme);
  const displayUnit = usePanelStore((s) => s.displayUnit);
  const gridSnapMm = usePanelStore((s) => s.gridSnapMm);
  const enclosure = usePanelStore((s) => s.enclosure);
  const plateConfig = usePanelStore((s) => s.plateConfig);
  const rails = usePanelStore((s) => s.rails);
  const ducts = usePanelStore((s) => s.ducts);
  const components = usePanelStore((s) => s.components);
  const cadAssets = usePanelStore((s) => s.cadAssets);
  const wires = usePanelStore((s) => s.wires);
  const titleBlock = usePanelStore((s) => s.titleBlock);
  const updateTitleBlock = usePanelStore((s) => s.updateTitleBlock);

  const sheets = usePanelStore((s) => s.sheets);
  const activeSheetId = usePanelStore((s) => s.activeSheetId);
  const activeSheetType = usePanelStore((s) => s.activeSheetType);
  const autoRouteDuctsEnabled = usePanelStore((s) => s.autoRouteDuctsEnabled);
  const loadProjectState = usePanelStore((s) => s.loadProjectState);
  const resetToDefaultProject = usePanelStore((s) => s.resetToDefaultProject);

  const undo = usePanelStore((s) => s.undo);
  const redo = usePanelStore((s) => s.redo);
  const canUndo = usePanelStore((s) => s.canUndo);
  const canRedo = usePanelStore((s) => s.canRedo);
  const autoRouteAllWires = usePanelStore((s) => s.autoRouteAllWires);
  const autoNumberWires = usePanelStore((s) => s.autoNumberWires);
  const selected = usePanelStore((s) => s.selected);
  const selectedIds = usePanelStore((s) => s.selectedIds);
  const clipboardItems = usePanelStore((s) => s.clipboardItems);
  const copySelectedToClipboard = usePanelStore((s) => s.copySelectedToClipboard);
  const pasteFromClipboard = usePanelStore((s) => s.pasteFromClipboard);
  const groupSelectedItems = usePanelStore((s) => s.groupSelectedItems);
  const ungroupSelectedItems = usePanelStore((s) => s.ungroupSelectedItems);

  const setViewportMode = usePanelStore((s) => s.setViewportMode);
  const setDisplayUnit = usePanelStore((s) => s.setDisplayUnit);
  const setGridSnapMm = usePanelStore((s) => s.setGridSnapMm);
  const setDoorMode = usePanelStore((s) => s.setDoorMode);
  const addSheet = usePanelStore((s) => s.addSheet);
  const rightPanelTab = usePanelStore((s) => s.rightPanelTab);
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab);
  const leftSidebarOpen = usePanelStore((s) => s.leftSidebarOpen);
  const toggleLeftSidebar = usePanelStore((s) => s.toggleLeftSidebar);

  const user = useAuthStore((s) => s.user);
  const setAuthModalOpen = useAuthStore((s) => s.setAuthModalOpen);
  const setProjectsDrawerOpen = useAuthStore((s) => s.setProjectsDrawerOpen);
  const logout = useAuthStore((s) => s.logout);
  const syncStatus = useAuthStore((s) => s.syncStatus);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const [activeMenu, setActiveMenu] = useState<"file" | "edit" | "view" | "mobile" | null>(
    null
  );
  const menuBarRef = useRef<HTMLDivElement>(null);
  const openPflowInputRef = useRef<HTMLInputElement>(null);

  const units: LengthUnit[] = ["mm", "cm", "m"];
  const snaps: GridSnapMm[] = [1, 5, 10, 25];

  // Close menus on outside click
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (
        menuBarRef.current &&
        !menuBarRef.current.contains(e.target as Node)
      ) {
        setActiveMenu(null);
      }
    };
    window.addEventListener("mousedown", handleDown);
    return () => window.removeEventListener("mousedown", handleDown);
  }, []);

  const handleExportSvg = () => {
    if (activeSheetType === "door-cutout") {
      const svg = generateDoorDrillingSvg(enclosure, components);
      triggerDownload("panelflow-door-drilling-1to1.svg", svg, "image/svg+xml");
      return;
    }
    const svg = generateDrillingSvg(enclosure, rails, ducts, plateConfig);
    triggerDownload("panelflow-drilling-1to1.svg", svg, "image/svg+xml");
  };

  const handleExportDxf = () => {
    if (activeSheetType === "door-cutout") {
      const dxf = generateDoorDrillingDxf(enclosure, components);
      triggerDownload("panelflow-door-drilling-1to1.dxf", dxf, "application/dxf");
      return;
    }
    const dxf = generateDrillingDxf(enclosure, rails, ducts, plateConfig);
    triggerDownload("panelflow-drilling-1to1.dxf", dxf, "application/dxf");
  };

  const get2DSheetSvg = () =>
    generatePanelFlowSheetSvg({
      enclosure,
      plateConfig,
      rails,
      ducts,
      components,
      cadAssets,
      wires,
      meta: titleBlock,
      showDuctFillBadge: false,
    });

  const handleSavePflow = useCallback(async () => {
    try {
      const json = await serializeProjectAsync({
        sheets,
        activeSheetId,
        displayUnit,
        gridSnapMm,
        autoRouteDuctsEnabled,
        titleBlock,
      });
      const filename = sanitizeProjectFilename(titleBlock.projectName || "project");
      triggerDownload(filename, json, "application/json");
    } catch (err) {
      alert(
        `Failed to save project: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  }, [sheets, activeSheetId, displayUnit, gridSnapMm, autoRouteDuctsEnabled, titleBlock]);

  const handleOpenPflowFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const result = parseAndValidatePflow(text);
        if (!result.ok) {
          alert(`Failed to load .pflow project: ${result.error}`);
          return;
        }
        const proj = result.data;
        loadProjectState({
          sheets: rehydrateCadAssets(proj.sheets),
          activeSheetId: proj.activeSheetId,
          displayUnit: proj.displayUnit,
          gridSnapMm: proj.gridSnapMm,
          autoRouteDuctsEnabled: proj.autoRouteDuctsEnabled,
          titleBlock: proj.titleBlock,
        });
      } catch (err) {
        alert(
          `Failed to read .pflow file: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
      } finally {
        e.target.value = "";
      }
    },
    [loadProjectState]
  );

  const handleNewProject = useCallback(async () => {
    const ok = window.confirm(
      "Start a New Project? Unsaved changes will be cleared and reset to a clean default mounting plate."
    );
    if (!ok) return;
    try {
      await clearAutoSaveSession();
    } catch {
      // ignore
    }
    resetToDefaultProject();
  }, [resetToDefaultProject]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        handleSavePflow();
      } else if (key === "n" && e.shiftKey) {
        e.preventDefault();
        autoNumberWires();
      } else if (key === "o") {
        e.preventDefault();
        openPflowInputRef.current?.click();
      } else if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, handleSavePflow]);

  const handleExport2DSheetSvg = () => {
    triggerDownload("panelflow-2d-sheet.svg", get2DSheetSvg(), "image/svg+xml");
  };

  const handleExport2DSheetPng = () => {
    const svg = get2DSheetSvg();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((pngBlob) => {
          if (pngBlob) {
            const pngUrl = URL.createObjectURL(pngBlob);
            const a = document.createElement("a");
            a.href = pngUrl;
            a.download = "panelflow-2d-sheet.png";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(pngUrl);
          }
        }, "image/png");
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleExport2DSheetPdf = () => {
    const svg = get2DSheetSvg();
    const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    const blob = new Blob(
      [
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${titleBlock.projectName} - Sheet ${titleBlock.sheetNo}</title>
  <style>
    @page { size: landscape; margin: 5mm; }
    @media print {
      body { margin: 0; background: #fff !important; }
      .no-print { display: none !important; }
      svg { width: 100% !important; height: auto !important; max-height: 98vh; page-break-inside: avoid; }
    }
    body {
      margin: 0;
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #f1f5f9;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .toolbar {
      width: 100%;
      max-width: 1200px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding: 8px 16px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
    }
    .btn {
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .sheet-card {
      background: #ffffff;
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      max-width: 98vw;
      overflow: auto;
    }
    svg { width: 100%; height: auto; display: block; max-height: 85vh; }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <div>
      <strong>${titleBlock.projectName}</strong> — Sheet ${titleBlock.sheetNo}
    </div>
    <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="sheet-card">
    ${cleanSvg}
  </div>
  <script>
    // Auto-open print dialog once ready
    window.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => { window.print(); }, 400);
    });
  </script>
</body>
</html>`
      ],
      { type: "text/html;charset=utf-8" }
    );
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, "_blank");
    if (!win) {
      // Fallback if popup blocked
      const a = document.createElement("a");
      a.href = blobUrl;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const dropdownPanelClass =
    "absolute top-full mt-1 left-0 z-50 rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white/98 dark:bg-[#111318]/98 p-1.5 shadow-xl dark:shadow-2xl backdrop-blur-xl text-xs before:content-[''] before:absolute before:-top-2 before:inset-x-0 before:h-2";
  const dropdownItemClass =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white";
  const dropdownSectionLabelClass =
    "px-2.5 py-1 text-[11px] font-sans uppercase tracking-wider text-[#64748b] dark:text-slate-500 font-medium";
  const dropdownDividerClass = "my-1 border-t border-[#e2e8f0] dark:border-white/10";
  const monoIconClass = "text-slate-600 dark:text-slate-400";

  const renderTooltip = (label: string, align: "center" | "right" = "center") => (
    <span
      role="tooltip"
      className={`pointer-events-none absolute top-full mt-2 z-50 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-medium opacity-0 scale-95 transition-all duration-100 group-hover/tip:opacity-100 group-hover/tip:scale-100 shadow-xl ${
        align === "right" ? "right-0" : "left-1/2 -translate-x-1/2"
      } bg-slate-900 text-slate-100 border-slate-800 dark:bg-[#161922] dark:text-zinc-200 dark:border-white/15`}
    >
      {label}
    </span>
  );

  return (
    <header className="relative z-50 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0c0e14]/95 px-3 sm:px-4 text-xs text-slate-800 dark:text-white shadow-sm dark:shadow-none backdrop-blur-xl select-none transition-colors duration-150">
      {/* LEFT SECTION: Branding + File/Edit/View Menubar + Project Pill (RelayTest style) */}
      <div className="flex items-center gap-2 sm:gap-3" ref={menuBarRef}>
        {/* Mobile Parts Drawer Toggle Button */}
        <div className="relative group/tip md:hidden">
          <button
            type="button"
            onClick={toggleLeftSidebar}
            aria-label={leftSidebarOpen ? "Close Parts Drawer" : "Open Parts Drawer"}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              leftSidebarOpen
                ? "bg-slate-900 text-white dark:bg-white dark:text-black"
                : "bg-white hover:bg-slate-100 text-slate-800 dark:bg-[#131620] dark:hover:bg-[#1c202e] dark:text-zinc-200 dark:hover:text-white"
            }`}
          >
            <Cpu className="h-4 w-4" />
          </button>
          {renderTooltip(leftSidebarOpen ? "Close Parts" : "Parts & Library")}
        </div>

        {/* Branding Logo + Name */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 bg-slate-100 border-slate-200 text-slate-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-white">
            <Zap className="h-4 w-4" />
          </div>
          <span className="font-bold tracking-tight text-base hidden sm:inline text-slate-900 dark:text-white">
            PanelFlow
          </span>
        </div>

        <div className="hidden md:block h-4 w-[1px] mx-1 bg-slate-300 dark:bg-white/15" />

        {/* Mobile Hamburger / Quick Actions Menu */}
        <div className="relative group/tip md:hidden">
          <button
            type="button"
            onClick={() =>
              setActiveMenu(activeMenu === "mobile" ? null : "mobile")
            }
            aria-label="Menu"
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              activeMenu === "mobile"
                ? "bg-slate-900 text-white dark:bg-white dark:text-black"
                : "bg-white hover:bg-slate-100 text-slate-800 dark:bg-[#131620] dark:hover:bg-[#1c202e] dark:text-zinc-200 dark:hover:text-white"
            }`}
          >
            <Menu className="h-4 w-4" />
          </button>
          {activeMenu !== "mobile" && renderTooltip("Menu")}

          {activeMenu === "mobile" && (
            <div className="absolute top-10 left-0 z-50 w-72 max-h-[80vh] overflow-y-auto rounded-xl border border-[#e2e8f0] dark:border-white/10 bg-white/98 dark:bg-[#111318]/98 p-2 shadow-2xl backdrop-blur-xl text-xs">
              <div className="px-2 py-1 text-[11px] font-sans uppercase tracking-wider text-[#64748b] dark:text-slate-500 font-medium">
                Active Project
              </div>
              <div className="mb-2 px-2 py-1 font-sans text-xs text-[#0f172a] dark:text-slate-200 truncate">
                {titleBlock.projectName}
              </div>
              <div className={dropdownDividerClass} />

              <div className={dropdownSectionLabelClass}>Project Actions</div>
              <button
                type="button"
                onClick={() => {
                  setActiveMenu(null);
                  handleSavePflow();
                }}
                className={dropdownItemClass}
              >
                <Save className={`h-4 w-4 ${monoIconClass}`} />
                Save Project (.pflow)
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveMenu(null);
                  openPflowInputRef.current?.click();
                }}
                className={dropdownItemClass}
              >
                <FolderOpen className={`h-4 w-4 ${monoIconClass}`} />
                Open .pflow Project...
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveMenu(null);
                  handleNewProject();
                }}
                className={dropdownItemClass}
              >
                <RotateCcw className={`h-4 w-4 ${monoIconClass}`} />
                New Project (Reset)
              </button>
              <button
                type="button"
                onClick={() => {
                  addSheet("mounting-plate");
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                <Plus className={`h-4 w-4 ${monoIconClass}`} />
                New Mounting Sheet
              </button>

              <div className={dropdownDividerClass} />
              <div className={dropdownSectionLabelClass}>Edit &amp; History</div>
              <button
                type="button"
                disabled={selectedIds.length === 0 && !selected}
                onClick={() => {
                  copySelectedToClipboard();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                <Copy className={`h-4 w-4 ${monoIconClass}`} />
                Copy
              </button>
              <button
                type="button"
                disabled={clipboardItems.length === 0}
                onClick={() => {
                  pasteFromClipboard();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                <Copy className={`h-4 w-4 ${monoIconClass}`} />
                Paste
              </button>
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  undo();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                <Undo2 className={`h-4 w-4 ${monoIconClass}`} />
                Undo
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={() => {
                  redo();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                <Redo2 className={`h-4 w-4 ${monoIconClass}`} />
                Redo
              </button>
              <button
                type="button"
                disabled={wires.length === 0}
                onClick={() => {
                  autoRouteAllWires();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                <Network className={`h-4 w-4 ${monoIconClass}`} />
                Auto-Route All Wires
              </button>
              <button
                type="button"
                disabled={wires.length === 0}
                onClick={() => {
                  autoNumberWires();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                <Hash className={`h-4 w-4 ${monoIconClass}`} />
                Auto-Number Wires
              </button>

              <div className={dropdownDividerClass} />
              <div className={dropdownSectionLabelClass}>Export Options</div>
              <button
                type="button"
                onClick={() => {
                  handleExport2DSheetSvg();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                <Download className={`h-4 w-4 ${monoIconClass}`} />
                Export 2D SVG
              </button>
              <button
                type="button"
                onClick={() => {
                  handleExport2DSheetPng();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                <FileImage className={`h-4 w-4 ${monoIconClass}`} />
                Export High-Res PNG
              </button>
              <button
                type="button"
                onClick={() => {
                  handleExportDxf();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                <Download className={`h-4 w-4 ${monoIconClass}`} />
                {activeSheetType === "door-cutout"
                  ? "Export Door Drilling DXF (1:1)"
                  : "Export Drilling DXF"}
              </button>

              <div className={dropdownDividerClass} />
              <div className={dropdownSectionLabelClass}>Units &amp; Theme</div>
              <div className="flex items-center gap-2 px-2 py-1">
                <span className="text-[#64748b] dark:text-slate-400">Unit:</span>
                <div className="flex rounded-md border border-[#e2e8f0] dark:border-white/10 bg-[#f1f5f9] dark:bg-[#171a21] p-0.5">
                  {units.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setDisplayUnit(u)}
                      className={`px-2 py-0.5 rounded text-[11px] font-sans ${
                        displayUnit === u
                          ? "bg-[#0f172a] text-white dark:bg-white dark:text-black font-bold"
                          : "text-[#64748b] dark:text-slate-400"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  toggleTheme();
                  setActiveMenu(null);
                }}
                className={dropdownItemClass}
              >
                {theme === "dark" ? (
                  <>
                    <Sun className={`h-4 w-4 ${monoIconClass}`} />
                    Switch to Light Mode
                  </>
                ) : (
                  <>
                    <Moon className={`h-4 w-4 ${monoIconClass}`} />
                    Switch to Dark Mode
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Menubar (File, Edit, View) - RelayTest style */}
        <nav className="hidden items-center gap-0.5 text-xs font-medium md:flex">
          {/* FILE MENU */}
          <div
            className="relative"
            onMouseEnter={() => setActiveMenu("file")}
            onMouseLeave={() => setActiveMenu((prev) => (prev === "file" ? null : prev))}
          >
            <button
              type="button"
              onClick={() =>
                setActiveMenu(activeMenu === "file" ? null : "file")
              }
              className={`px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                activeMenu === "file"
                  ? "bg-slate-100 text-slate-900 dark:bg-white/15 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/5"
              }`}
            >
              <span>File</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {activeMenu === "file" && (
              <div className={`${dropdownPanelClass} w-64`}>
                <div className={dropdownSectionLabelClass}>
                  Project (.PFLOW)
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenu(null);
                    handleNewProject();
                  }}
                  className={dropdownItemClass}
                >
                  <RotateCcw className={`h-3.5 w-3.5 ${monoIconClass}`} />
                  New Project (Reset to Default)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenu(null);
                    openPflowInputRef.current?.click();
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className={`h-3.5 w-3.5 ${monoIconClass}`} />
                    Open .pflow Project...
                  </span>
                  <span className="font-sans text-[11px] text-[#64748b] dark:text-slate-500">
                    Ctrl+O
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenu(null);
                    handleSavePflow();
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <Save className={`h-3.5 w-3.5 ${monoIconClass}`} />
                    Save Project (.pflow)
                  </span>
                  <span className="font-sans text-[11px] text-[#64748b] dark:text-slate-500">
                    Ctrl+S
                  </span>
                </button>
                <div className={dropdownDividerClass} />
                <div className={dropdownSectionLabelClass}>
                  Project Sheets
                </div>
                <button
                  type="button"
                  onClick={() => {
                    addSheet("mounting-plate");
                    setActiveMenu(null);
                  }}
                  className={dropdownItemClass}
                >
                  <Plus className={`h-3.5 w-3.5 ${monoIconClass}`} />
                  New Mounting Sheet
                </button>
                <div className={dropdownDividerClass} />
                <div className={dropdownSectionLabelClass}>
                  Manufacturing &amp; BOM
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRightPanelTab("bom");
                    setActiveMenu(null);
                  }}
                  className={dropdownItemClass}
                >
                  <ClipboardList className={`h-3.5 w-3.5 ${monoIconClass}`} />
                  BOM &amp; Wire Cutting Schedule...
                </button>
                <div className={dropdownDividerClass} />
                <div className={dropdownSectionLabelClass}>
                  Export 2D Drawing (.PFLOW)
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleExport2DSheetSvg();
                    setActiveMenu(null);
                  }}
                  className={dropdownItemClass}
                >
                  <Download className={`h-3.5 w-3.5 ${monoIconClass}`} />
                  Export 2D SVG
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleExport2DSheetPng();
                    setActiveMenu(null);
                  }}
                  className={dropdownItemClass}
                >
                  <FileImage className={`h-3.5 w-3.5 ${monoIconClass}`} />
                  Export High-Res PNG
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleExport2DSheetPdf();
                    setActiveMenu(null);
                  }}
                  className={dropdownItemClass}
                >
                  <FileText className={`h-3.5 w-3.5 ${monoIconClass}`} />
                  Print / Export PDF
                </button>
                <div className={dropdownDividerClass} />
                <div className={dropdownSectionLabelClass}>
                  {activeSheetType === "door-cutout"
                    ? "Door Drilling Template (1:1)"
                    : "CNC Drilling Template"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleExportDxf();
                    setActiveMenu(null);
                  }}
                  className={dropdownItemClass}
                >
                  <Download className={`h-3.5 w-3.5 ${monoIconClass}`} />
                  {activeSheetType === "door-cutout"
                    ? "Export Door Drilling DXF (1:1)"
                    : "Export Drilling DXF (1:1)"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleExportSvg();
                    setActiveMenu(null);
                  }}
                  className={dropdownItemClass}
                >
                  <Download className={`h-3.5 w-3.5 ${monoIconClass}`} />
                  {activeSheetType === "door-cutout"
                    ? "Export Door Drilling Template SVG (1:1)"
                    : "Export Drilling SVG (1:1)"}
                </button>
              </div>
            )}
          </div>

          {/* EDIT MENU */}
          <div
            className="relative"
            onMouseEnter={() => setActiveMenu("edit")}
            onMouseLeave={() => setActiveMenu((prev) => (prev === "edit" ? null : prev))}
          >
            <button
              type="button"
              onClick={() =>
                setActiveMenu(activeMenu === "edit" ? null : "edit")
              }
              className={`px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                activeMenu === "edit"
                  ? "bg-slate-100 text-slate-900 dark:bg-white/15 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/5"
              }`}
            >
              <span>Edit</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {activeMenu === "edit" && (
              <div className={`${dropdownPanelClass} w-64`}>
                <button
                  type="button"
                  disabled={selectedIds.length === 0 && !selected}
                  onClick={() => {
                    copySelectedToClipboard();
                    setActiveMenu(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Copy className={`h-3.5 w-3.5 ${monoIconClass}`} />
                    Copy
                  </span>
                  <span className="font-sans text-[11px] text-[#64748b] dark:text-slate-500">
                    Ctrl+C
                  </span>
                </button>
                <button
                  type="button"
                  disabled={clipboardItems.length === 0}
                  onClick={() => {
                    pasteFromClipboard();
                    setActiveMenu(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Copy className={`h-3.5 w-3.5 ${monoIconClass}`} />
                    Paste
                  </span>
                  <span className="font-sans text-[11px] text-[#64748b] dark:text-slate-500">
                    Ctrl+V
                  </span>
                </button>
                <div className="my-1 border-t border-[#e2e8f0] dark:border-white/10" />
                <button
                  type="button"
                  disabled={!canUndo}
                  onClick={() => {
                    undo();
                    setActiveMenu(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Undo2 className={`h-3.5 w-3.5 ${monoIconClass}`} />
                    Undo
                  </span>
                  <span className="font-sans text-[11px] text-[#64748b] dark:text-slate-500">
                    Ctrl+Z
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!canRedo}
                  onClick={() => {
                    redo();
                    setActiveMenu(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Redo2 className={`h-3.5 w-3.5 ${monoIconClass}`} />
                    Redo
                  </span>
                  <span className="font-sans text-[11px] text-[#64748b] dark:text-slate-500">
                    Ctrl+Y
                  </span>
                </button>
                <div className="my-1 border-t border-[#e2e8f0] dark:border-white/10" />
                <button
                  type="button"
                  disabled={wires.length === 0}
                  onClick={() => {
                    autoRouteAllWires();
                    setActiveMenu(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Network className={`h-3.5 w-3.5 ${monoIconClass}`} />
                    Auto-Route All Wires via Ducts
                  </span>
                </button>
                <button
                  type="button"
                  disabled={wires.length === 0}
                  onClick={() => {
                    autoNumberWires();
                    setActiveMenu(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Hash className={`h-3.5 w-3.5 ${monoIconClass}`} />
                    Auto-Number Wires
                  </span>
                  <span className="font-sans text-[11px] text-[#64748b] dark:text-slate-500">
                    Ctrl+Shift+N
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* VIEW MENU */}
          <div
            className="relative"
            onMouseEnter={() => setActiveMenu("view")}
            onMouseLeave={() => setActiveMenu((prev) => (prev === "view" ? null : prev))}
          >
            <button
              type="button"
              onClick={() =>
                setActiveMenu(activeMenu === "view" ? null : "view")
              }
              className={`px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                activeMenu === "view"
                  ? "bg-slate-100 text-slate-900 dark:bg-white/15 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/5"
              }`}
            >
              <span>View</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {activeMenu === "view" && (
              <div className={`${dropdownPanelClass} w-48`}>
                <button
                  type="button"
                  onClick={() => {
                    setViewportMode("2d");
                    setActiveMenu(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <Layers className={`h-3.5 w-3.5 ${monoIconClass}`} />
                    2D Layout
                  </span>
                  {viewportMode === "2d" && (
                    <span className="text-[#0f172a] dark:text-white text-xs">✓</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewportMode("3d");
                    setActiveMenu(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <Box className={`h-3.5 w-3.5 ${monoIconClass}`} />
                    3D View
                  </span>
                  {viewportMode === "3d" && (
                    <span className="text-[#0f172a] dark:text-white text-xs">✓</span>
                  )}
                </button>
                <div className={dropdownDividerClass} />
                <div className={dropdownSectionLabelClass}>
                  Door Enclosure
                </div>
                {(["transparent", "open", "hidden"] as DoorMode[]).map((dm) => (
                  <button
                    key={dm}
                    type="button"
                    onClick={() => {
                      setDoorMode(dm);
                      setActiveMenu(null);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1 text-left capitalize text-[#0f172a] dark:text-slate-200 hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white"
                  >
                    <span>{dm}</span>
                    {enclosure.doorMode === dm && (
                      <span className="text-[#0f172a] dark:text-white text-xs">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Active Project Pill (Editable, regular typeface) */}
        <div className="hidden md:flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131620] px-3 py-1 text-xs transition-colors focus-within:border-slate-400 dark:focus-within:border-white/25">
          <FileCode2 className={`h-3.5 w-3.5 shrink-0 ${monoIconClass}`} />
          <input
            type="text"
            value={titleBlock.projectName}
            onChange={(e) => updateTitleBlock({ projectName: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.currentTarget.blur();
              }
            }}
            aria-label="Project Name"
            placeholder="Untitled Project"
            className="w-36 lg:w-48 bg-transparent text-xs font-normal text-slate-700 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none truncate"
          />
          <span className="shrink-0 rounded-md bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-slate-600 dark:text-zinc-300">
            .PFLOW
          </span>
        </div>
      </div>

      {/* RIGHT SECTION: Borderless, Shadowless Monochrome Icon-Only Controls (RelayTest style) */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Viewport Switcher Group: [2D] / [3D] */}
        <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-[#131620] p-0.5">
          <div className="relative group/tip">
            <button
              type="button"
              aria-label="2D Layout"
              onClick={() => setViewportMode("2d")}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewportMode === "2d"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
            {renderTooltip("2D Layout")}
          </div>
          <div className="relative group/tip">
            <button
              type="button"
              aria-label="3D View"
              onClick={() => setViewportMode("3d")}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewportMode === "3d"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10"
              }`}
            >
              <Box className="h-3.5 w-3.5" />
            </button>
            {renderTooltip("3D View")}
          </div>
        </div>

        {/* Unit Switcher Group (mm/cm/m) */}
        <div className="hidden sm:flex items-center gap-0.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-[#131620] p-0.5">
          {units.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setDisplayUnit(u)}
              title={`Display unit: ${u}`}
              className={`rounded-lg px-2 py-1 font-sans text-xs transition-colors cursor-pointer ${
                displayUnit === u
                  ? "bg-slate-900 text-white dark:bg-white dark:text-black font-semibold shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10 font-medium"
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        {/* Auto-Number Wires Icon Button (Borderless) */}
        <div className="relative group/tip">
          <button
            type="button"
            disabled={wires.length === 0}
            onClick={() => autoNumberWires()}
            aria-label="Auto-Number Wires (Ctrl+Shift+N)"
            className="p-2 rounded-xl transition-colors cursor-pointer bg-white hover:bg-slate-100 text-slate-800 dark:bg-[#131620] dark:hover:bg-[#1c202e] dark:text-zinc-200 dark:hover:text-white disabled:opacity-35 disabled:pointer-events-none"
          >
            <Hash className="h-4 w-4" />
          </button>
          {renderTooltip("Auto-Number Wires (Ctrl+Shift+N)")}
        </div>

        {/* Theme Toggle Icon Button (Borderless) */}
        <div className="relative group/tip hidden sm:block">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="p-2 rounded-xl transition-colors cursor-pointer bg-white hover:bg-slate-100 text-slate-800 dark:bg-[#131620] dark:hover:bg-[#1c202e] dark:text-zinc-200 dark:hover:text-white"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          {renderTooltip(theme === "dark" ? "Light Mode" : "Dark Mode")}
        </div>

        {/* Auth / Account */}
        {!user ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAuthModalOpen(true)}
            className="rounded-xl font-semibold"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Login</span>
          </Button>
        ) : (
          <Dropdown
            isOpen={accountMenuOpen}
            onClose={() => setAccountMenuOpen(false)}
            align="right"
            widthClassName="w-56"
            trigger={
              <div className="relative group/tip">
                <button
                  type="button"
                  aria-label={user.name || user.email}
                  onClick={() => setAccountMenuOpen((o) => !o)}
                  className="flex items-center gap-1 p-1 rounded-xl transition-colors cursor-pointer bg-white hover:bg-slate-100 text-slate-800 dark:bg-[#131620] dark:hover:bg-[#1c202e] dark:text-zinc-200 dark:hover:text-white"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-black text-xs font-bold">
                    {(user.name || user.email).charAt(0).toUpperCase()}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
                {!accountMenuOpen && renderTooltip(user.name || user.email, "right")}
              </div>
            }
          >
            <div className="px-2.5 py-1.5 border-b border-slate-200 dark:border-white/10 mb-1">
              <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                {user.name || "PanelFlow Engineer"}
              </div>
              <div className="truncate font-sans text-[10px] text-slate-500 dark:text-slate-400">
                {user.email}
              </div>
            </div>
            <DropdownItem
              icon={<Cloud className={`h-3.5 w-3.5 ${monoIconClass}`} />}
              onClick={() => {
                setAccountMenuOpen(false);
                setProjectsDrawerOpen(true);
              }}
            >
              My Cloud Projects
            </DropdownItem>
            <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Cloud className={`h-3.5 w-3.5 ${monoIconClass}`} />
              <span>
                Cloud Auto-Save:{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  {syncStatus === "saving" ? "Syncing..." : "Active"}
                </strong>
              </span>
            </div>
            <DropdownSeparator />
            <DropdownItem
              icon={<LogOut className={`h-3.5 w-3.5 ${monoIconClass}`} />}
              onClick={() => {
                setAccountMenuOpen(false);
                logout();
              }}
            >
              Sign Out
            </DropdownItem>
          </Dropdown>
        )}
      </div>
      <input
        ref={openPflowInputRef}
        type="file"
        accept=".pflow,.json"
        onChange={handleOpenPflowFile}
        className="hidden"
      />
    </header>
  );
}
