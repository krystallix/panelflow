"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { LeftSidebar } from "@/components/ui/LeftSidebar";
import { RightInspector } from "@/components/ui/RightInspector";
import { SheetTabs } from "@/components/ui/SheetTabs";
import { TopToolbar } from "@/components/ui/TopToolbar";
import { AuthModal } from "@/components/modals/AuthModal";
import { CloudProjectsDrawer } from "@/components/modals/CloudProjectsDrawer";
import { Panel2DCanvas } from "@/components/viewport/Panel2DCanvas";
import {
  loadAutoSaveSession,
  loadLocalAutoSave,
  saveAutoSaveSession,
  saveLocalAutoSave,
} from "@/lib/indexed-db";
import { rehydrateCadAssets } from "@/lib/project-io";
import { useAuthStore } from "@/store/useAuthStore";
import { usePanelStore } from "@/store/usePanelStore";

const PanelViewport = dynamic(
  () =>
    import("@/components/viewport/PanelViewport").then(
      (mod) => mod.PanelViewport
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#f1f5f9] dark:bg-[#090b10] font-sans text-xs text-[#64748b] dark:text-slate-400">
        INITIALIZING 3D CAD ENGINE...
      </div>
    ),
  }
);

export function PanelWorkbench() {
  const viewportMode = usePanelStore((s) => s.viewportMode);
  const setTheme = usePanelStore((s) => s.setTheme);
  const loadProjectState = usePanelStore((s) => s.loadProjectState);
  const setLeftSidebarOpen = usePanelStore((s) => s.setLeftSidebarOpen);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const restoredRef = useRef(false);
  const [isRestoring, setIsRestoring] = useState(true);

  // Auto-collapse left sidebar on mobile viewports on initial mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 768) {
      setLeftSidebarOpen(false);
    }
  }, [setLeftSidebarOpen]);

  // Hydrate authenticated user & cloud preferences/library on mount
  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Sync theme from localStorage on initial client mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("panelflow_saved_theme");
      if (saved === "light" || saved === "dark") {
        setTheme(saved);
      } else {
        setTheme("light");
      }
    } catch {
      // storage unavailable
    }
  }, [setTheme]);

  // Restore last auto-saved session: localStorage first (instant), then IndexedDB if newer
  useEffect(() => {
    let active = true;
    const localSnapshot = loadLocalAutoSave();
    const savedAutoRouteRaw = (() => {
      try {
        const v = localStorage.getItem("panelflow_auto_route_ducts");
        return v === "1" ? true : v === "0" ? false : undefined;
      } catch {
        return undefined;
      }
    })();
    const savedPinLabelsRaw = (() => {
      try {
        const v = localStorage.getItem("panelflow_show_pin_labels");
        return v === "1" ? true : v === "0" ? false : undefined;
      } catch {
        return undefined;
      }
    })();

    if (localSnapshot) {
      loadProjectState({
        sheets: rehydrateCadAssets(localSnapshot.sheets),
        activeSheetId: localSnapshot.activeSheetId,
        displayUnit: localSnapshot.displayUnit,
        gridSnapMm: localSnapshot.gridSnapMm,
        autoRouteDuctsEnabled:
          savedAutoRouteRaw ?? localSnapshot.autoRouteDuctsEnabled,
        showPinLabels: savedPinLabelsRaw ?? localSnapshot.showPinLabels,
        titleBlock: localSnapshot.titleBlock,
      });
    } else if (savedAutoRouteRaw !== undefined || savedPinLabelsRaw !== undefined) {
      usePanelStore.setState({
        ...(savedAutoRouteRaw !== undefined
          ? { autoRouteDuctsEnabled: savedAutoRouteRaw }
          : {}),
        ...(savedPinLabelsRaw !== undefined
          ? { showPinLabels: savedPinLabelsRaw }
          : {}),
      });
    }
    // Enable immediate autosave right after synchronous localStorage restore
    restoredRef.current = true;
    setIsRestoring(false);

    loadAutoSaveSession()
      .then((idbSnapshot) => {
        if (!active) return;
        if (
          idbSnapshot &&
          Array.isArray(idbSnapshot.sheets) &&
          idbSnapshot.sheets.length > 0 &&
          (!localSnapshot || idbSnapshot.savedAt > localSnapshot.savedAt)
        ) {
          loadProjectState({
            sheets: rehydrateCadAssets(idbSnapshot.sheets),
            activeSheetId: idbSnapshot.activeSheetId,
            displayUnit: idbSnapshot.displayUnit,
            gridSnapMm: idbSnapshot.gridSnapMm,
            autoRouteDuctsEnabled:
              savedAutoRouteRaw ?? idbSnapshot.autoRouteDuctsEnabled,
            showPinLabels: savedPinLabelsRaw ?? idbSnapshot.showPinLabels,
            titleBlock: idbSnapshot.titleBlock,
          });
        }
      })
      .catch(() => {
        // IndexedDB unavailable or empty
      });
    return () => {
      active = false;
    };
  }, [loadProjectState]);

  // Immediate localStorage save + debounced IndexedDB (~1.5s) and Cloud (~2s)
  useEffect(() => {
    let idbTimer: ReturnType<typeof setTimeout> | null = null;
    let cloudTimer: ReturnType<typeof setTimeout> | null = null;
    let prefsTimer: ReturnType<typeof setTimeout> | null = null;

    const flushLocal = () => {
      const s = usePanelStore.getState();
      saveLocalAutoSave(s.sheets, s.activeSheetId, {
        displayUnit: s.displayUnit,
        gridSnapMm: s.gridSnapMm,
        autoRouteDuctsEnabled: s.autoRouteDuctsEnabled,
        showPinLabels: s.showPinLabels,
        titleBlock: s.titleBlock,
      });
    };

    window.addEventListener("beforeunload", flushLocal);
    window.addEventListener("pagehide", flushLocal);

    const unsub = usePanelStore.subscribe((state, prevState) => {
      if (!restoredRef.current) return;

      const projectChanged =
        state.sheets !== prevState.sheets ||
        state.activeSheetId !== prevState.activeSheetId ||
        state.titleBlock !== prevState.titleBlock ||
        state.displayUnit !== prevState.displayUnit ||
        state.gridSnapMm !== prevState.gridSnapMm ||
        state.autoRouteDuctsEnabled !== prevState.autoRouteDuctsEnabled ||
        state.showPinLabels !== prevState.showPinLabels;

      if (projectChanged) {
        saveLocalAutoSave(state.sheets, state.activeSheetId, {
          displayUnit: state.displayUnit,
          gridSnapMm: state.gridSnapMm,
          autoRouteDuctsEnabled: state.autoRouteDuctsEnabled,
          showPinLabels: state.showPinLabels,
          titleBlock: state.titleBlock,
        });

        if (idbTimer) clearTimeout(idbTimer);
        idbTimer = setTimeout(() => {
          saveAutoSaveSession(state.sheets, state.activeSheetId, {
            displayUnit: state.displayUnit,
            gridSnapMm: state.gridSnapMm,
            autoRouteDuctsEnabled: state.autoRouteDuctsEnabled,
            showPinLabels: state.showPinLabels,
            titleBlock: state.titleBlock,
          }).catch(() => {
            // ignore storage quota errors
          });
        }, 400);

        const auth = useAuthStore.getState();
        if (auth.user) {
          if (cloudTimer) clearTimeout(cloudTimer);
          cloudTimer = setTimeout(async () => {
            const currentAuth = useAuthStore.getState();
            if (!currentAuth.user) return;
            currentAuth.setSyncStatus("saving");
            try {
              const cleanSheets = state.sheets.map((sheet) => ({
                ...sheet,
                cadAssets: sheet.cadAssets.map(
                  ({ objectUrl: _omitted, ...rest }) => rest
                ),
              }));
              const res = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: currentAuth.cloudProjectId,
                  name: state.titleBlock.projectName || "PanelFlow Project",
                  data: {
                    sheets: cleanSheets,
                    activeSheetId: state.activeSheetId,
                    displayUnit: state.displayUnit,
                    gridSnapMm: state.gridSnapMm,
                    autoRouteDuctsEnabled: state.autoRouteDuctsEnabled,
                    titleBlock: state.titleBlock,
                  },
                }),
              });
              if (res.ok) {
                const json = await res.json();
                if (json.project?.id && json.project.id !== currentAuth.cloudProjectId) {
                  currentAuth.setCloudProjectId(json.project.id);
                }
                currentAuth.setSyncStatus("saved");
              } else {
                currentAuth.setSyncStatus("error");
              }
            } catch {
              useAuthStore.getState().setSyncStatus("error");
            }
          }, 2000);
        }
      }

      const prefsChanged =
        state.favoritePartIds !== prevState.favoritePartIds ||
        state.recentPartIds !== prevState.recentPartIds;

      if (prefsChanged && useAuthStore.getState().user) {
        if (prefsTimer) clearTimeout(prefsTimer);
        prefsTimer = setTimeout(() => {
          if (!useAuthStore.getState().user) return;
          fetch("/api/preferences", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              favoritePartIds: state.favoritePartIds,
              recentPartIds: state.recentPartIds,
            }),
          }).catch(() => {
            // ignore network error
          });
        }, 1200);
      }
    });

    return () => {
      window.removeEventListener("beforeunload", flushLocal);
      window.removeEventListener("pagehide", flushLocal);
      unsub();
      if (idbTimer) clearTimeout(idbTimer);
      if (cloudTimer) clearTimeout(cloudTimer);
      if (prefsTimer) clearTimeout(prefsTimer);
    };
  }, []);

  if (isRestoring) {
    return (
      <div className="flex h-[100dvh] w-screen flex-col items-center justify-center bg-[#f8fafc] dark:bg-[#090b10] text-[#0f172a] dark:text-slate-100 select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 rounded-full border-2 border-slate-900 dark:border-white border-t-transparent dark:border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Loading workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#f8fafc] dark:bg-[#090b10] text-[#0f172a] dark:text-slate-100 antialiased select-none">
      <TopToolbar />
      <main className="flex min-h-0 flex-1 overflow-hidden">
        <LeftSidebar />
        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-[#090b10]">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {viewportMode === "3d" ? <PanelViewport /> : <Panel2DCanvas />}
          </div>
          <SheetTabs />
        </section>
        <RightInspector />
      </main>
      <AuthModal />
      <CloudProjectsDrawer />
    </div>
  );
}
