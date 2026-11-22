"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Copy,
  Edit2,
  FileCheck2,
  FileCode2,
  FileSpreadsheet,
  Plus,
  Trash2,
} from "lucide-react";
import { usePanelStore } from "@/store/usePanelStore";
import { DropdownItem } from "@/components/ui";
import type { SheetType } from "@/types/panel";

export function SheetTabs() {
  const sheets = usePanelStore((s) => s.sheets);
  const activeSheetId = usePanelStore((s) => s.activeSheetId);
  const setActiveSheet = usePanelStore((s) => s.setActiveSheet);
  const addSheet = usePanelStore((s) => s.addSheet);
  const renameSheet = usePanelStore((s) => s.renameSheet);
  const duplicateSheet = usePanelStore((s) => s.duplicateSheet);
  const deleteSheet = usePanelStore((s) => s.deleteSheet);

  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTypeMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowTypeMenu(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowTypeMenu(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showTypeMenu]);

  const startRename = (id: string, name: string) => {
    setEditingSheetId(id);
    setEditingName(name);
  };

  const finishRename = () => {
    if (editingSheetId && editingName.trim()) {
      renameSheet(editingSheetId, editingName.trim());
    }
    setEditingSheetId(null);
  };

  const getSheetIcon = (type: SheetType) => {
    switch (type) {
      case "door-cutout":
        return <FileSpreadsheet className="h-4 w-4 text-slate-600 dark:text-zinc-400" />;
      case "schematic":
        return <FileCode2 className="h-4 w-4 text-slate-600 dark:text-zinc-400" />;
      default:
        return <FileCheck2 className="h-4 w-4 text-[#64748b] dark:text-slate-300" />;
    }
  };

  return (
    <div className="relative flex h-9 shrink-0 w-full select-none items-center justify-between border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#11141c] px-2.5 text-xs">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex min-w-0 items-center space-x-1.5 overflow-x-auto no-scrollbar py-1">
          {sheets.map((sheet) => {
          const isActive = sheet.id === activeSheetId;
          const isEditing = sheet.id === editingSheetId;

          return (
            <div
              key={sheet.id}
              onClick={() => setActiveSheet(sheet.id)}
              className={`group flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all cursor-pointer border ${
                isActive
                  ? "border-[#e2e8f0] dark:border-white/15 bg-white dark:bg-[#171a21] text-[#0f172a] dark:text-white shadow-xs"
                  : "border-transparent bg-transparent text-[#64748b] dark:text-slate-400 hover:bg-[#e2e8f0]/60 dark:hover:bg-white/5 hover:text-[#0f172a] dark:hover:text-slate-200"
              }`}
            >
              {getSheetIcon(sheet.sheetType)}

              {isEditing ? (
                <input
                  type="text"
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={finishRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") finishRename();
                    if (e.key === "Escape") setEditingSheetId(null);
                  }}
                  className="rounded bg-white dark:bg-[#090b10] px-1.5 py-0.5 font-sans text-xs text-[#0f172a] dark:text-white outline-none ring-1 ring-[#0f172a]/30 dark:ring-white/30"
                />
              ) : (
                <span
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(sheet.id, sheet.name);
                  }}
                  className="font-medium text-xs whitespace-nowrap"
                  title="Double click to rename"
                >
                  {sheet.name}
                </span>
              )}

              <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  title="Rename Sheet"
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(sheet.id, sheet.name);
                  }}
                  className="rounded p-0.5 hover:bg-[#e2e8f0] dark:hover:bg-white/10 text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-white"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Duplicate Sheet"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateSheet(sheet.id);
                  }}
                  className="rounded p-0.5 hover:bg-[#e2e8f0] dark:hover:bg-white/10 text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-white"
                >
                  <Copy className="h-3 w-3" />
                </button>
                {sheets.length > 1 && (
                  <button
                    type="button"
                    title="Delete Sheet"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSheet(sheet.id);
                    }}
                    className="rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-[#94a3b8] dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        </div>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowTypeMenu((v) => !v)}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-dashed border-[#cbd5e1] dark:border-white/15 bg-white dark:bg-[#171a21]/60 px-2.5 py-1.5 sm:py-1 text-xs font-medium text-[#334155] dark:text-slate-300 hover:border-[#94a3b8] dark:hover:border-white/30 hover:bg-[#f1f5f9] dark:hover:bg-[#171a21] hover:text-[#0f172a] dark:hover:text-white transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New Sheet
          </button>

          {showTypeMenu && (
            <div className="absolute bottom-10 right-0 sm:right-auto sm:left-0 z-50 w-56 rounded-xl border border-[#e2e8f0] dark:border-white/15 bg-white dark:bg-[#161a23] p-1 shadow-2xl text-xs">
              <DropdownItem
                icon={<FileCheck2 className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />}
                onClick={() => {
                  const newId = addSheet("mounting-plate");
                  setActiveSheet(newId);
                  setShowTypeMenu(false);
                }}
              >
                Mounting Plate (2D/3D)
              </DropdownItem>
              <DropdownItem
                icon={<FileSpreadsheet className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />}
                onClick={() => {
                  const newId = addSheet("door-cutout");
                  setActiveSheet(newId);
                  setShowTypeMenu(false);
                }}
              >
                Door Cutout Layout
              </DropdownItem>
              <DropdownItem
                icon={<FileCode2 className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />}
                onClick={() => {
                  const newId = addSheet("schematic");
                  setActiveSheet(newId);
                  setShowTypeMenu(false);
                }}
              >
                Schematic Diagram
              </DropdownItem>
            </div>
          )}
        </div>
      </div>

      <div className="hidden font-sans text-[11px] tabular-nums text-[#64748b] dark:text-slate-500 sm:block">
        Sheet {sheets.findIndex((s) => s.id === activeSheetId) + 1} of{" "}
        {sheets.length}
      </div>
    </div>
  );
}
