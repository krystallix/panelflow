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
  const reorderSheets = usePanelStore((s) => s.reorderSheets);

  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [draggedSheetId, setDraggedSheetId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    sheetId: string;
    side: "before" | "after";
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    sheetId: string;
    sheetName: string;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTypeMenu && !contextMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showTypeMenu && menuRef.current && !menuRef.current.contains(target)) {
        setShowTypeMenu(false);
      }
      if (
        contextMenu &&
        contextMenuRef.current &&
        !contextMenuRef.current.contains(target)
      ) {
        setContextMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowTypeMenu(false);
        setContextMenu(null);
      }
    };
    const onWindowChange = () => setContextMenu(null);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onWindowChange);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onWindowChange);
    };
  }, [showTypeMenu, contextMenu]);

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
              draggable={!isEditing}
              onClick={() => setActiveSheet(sheet.id)}
              onDragStart={(e) => {
                if (isEditing) {
                  e.preventDefault();
                  return;
                }
                setContextMenu(null);
                setShowTypeMenu(false);
                setDraggedSheetId(sheet.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", sheet.id);
              }}
              onDragOver={(e) => {
                if (!draggedSheetId || draggedSheetId === sheet.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = e.currentTarget.getBoundingClientRect();
                const side: "before" | "after" =
                  e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                if (
                  dropTarget?.sheetId !== sheet.id ||
                  dropTarget?.side !== side
                ) {
                  setDropTarget({ sheetId: sheet.id, side });
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDropTarget((prev) =>
                    prev?.sheetId === sheet.id ? null : prev
                  );
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const sourceId =
                  draggedSheetId ?? e.dataTransfer.getData("text/plain");
                const fromIndex = sheets.findIndex((s) => s.id === sourceId);
                const targetIndex = sheets.findIndex((s) => s.id === sheet.id);
                if (fromIndex !== -1 && targetIndex !== -1 && fromIndex !== targetIndex) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const side: "before" | "after" =
                    e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  let toIndex = side === "after" ? targetIndex + 1 : targetIndex;
                  if (fromIndex < toIndex) toIndex -= 1;
                  reorderSheets(fromIndex, toIndex);
                }
                setDraggedSheetId(null);
                setDropTarget(null);
              }}
              onDragEnd={() => {
                setDraggedSheetId(null);
                setDropTarget(null);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowTypeMenu(false);
                setContextMenu({
                  sheetId: sheet.id,
                  sheetName: sheet.name,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
              className={`relative group flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all cursor-pointer border ${
                draggedSheetId === sheet.id ? "opacity-45" : ""
              } ${
                isActive
                  ? "border-[#e2e8f0] dark:border-white/15 bg-white dark:bg-[#171a21] text-[#0f172a] dark:text-white shadow-xs"
                  : "border-transparent bg-transparent text-[#64748b] dark:text-slate-400 hover:bg-[#e2e8f0]/60 dark:hover:bg-white/5 hover:text-[#0f172a] dark:hover:text-slate-200"
              }`}
              title="Drag to reorder · Right-click for actions · Double-click to rename"
            >
              {dropTarget?.sheetId === sheet.id && dropTarget.side === "before" && (
                <span className="pointer-events-none absolute -left-1 top-1 bottom-1 w-0.5 rounded-full bg-sky-500" />
              )}
              {dropTarget?.sheetId === sheet.id && dropTarget.side === "after" && (
                <span className="pointer-events-none absolute -right-1 top-1 bottom-1 w-0.5 rounded-full bg-sky-500" />
              )}
              {getSheetIcon(sheet.sheetType)}

              {isEditing ? (
                <input
                  type="text"
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={finishRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
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
                >
                  {sheet.name}
                </span>
              )}
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

      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            left: `${Math.min(
              contextMenu.x,
              typeof window !== "undefined" ? window.innerWidth - 180 : contextMenu.x
            )}px`,
            bottom: `${
              typeof window !== "undefined"
                ? Math.max(12, window.innerHeight - contextMenu.y)
                : 44
            }px`,
          }}
          className="fixed z-50 w-44 rounded-xl border border-[#e2e8f0] dark:border-white/15 bg-white dark:bg-[#161a23] p-1 shadow-2xl text-xs"
        >
          <DropdownItem
            icon={<Edit2 className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />}
            onClick={() => {
              startRename(contextMenu.sheetId, contextMenu.sheetName);
              setContextMenu(null);
            }}
          >
            Rename Sheet
          </DropdownItem>
          <DropdownItem
            icon={<Copy className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />}
            onClick={() => {
              duplicateSheet(contextMenu.sheetId);
              setContextMenu(null);
            }}
          >
            Duplicate Sheet
          </DropdownItem>
          {sheets.length > 1 && (
            <>
              <div className="my-1 h-[1px] bg-slate-200 dark:bg-white/10" />
              <DropdownItem
                className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                icon={<Trash2 className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />}
                onClick={() => {
                  deleteSheet(contextMenu.sheetId);
                  setContextMenu(null);
                }}
              >
                Delete Sheet
              </DropdownItem>
            </>
          )}
        </div>
      )}
    </div>
  );
}
