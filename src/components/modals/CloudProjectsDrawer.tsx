"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Cloud,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  SideSheet,
  SideSheetBody,
  SideSheetHeader,
} from "@/components/ui";
import { rehydrateCadAssets } from "@/lib/project-io";
import { useAuthStore, type CloudProjectSummary } from "@/store/useAuthStore";
import { usePanelStore } from "@/store/usePanelStore";

export function CloudProjectsDrawer() {
  const user = useAuthStore((s) => s.user);
  const open = useAuthStore((s) => s.projectsDrawerOpen);
  const setOpen = useAuthStore((s) => s.setProjectsDrawerOpen);
  const cloudProjectId = useAuthStore((s) => s.cloudProjectId);
  const setCloudProjectId = useAuthStore((s) => s.setCloudProjectId);
  const setSyncStatus = useAuthStore((s) => s.setSyncStatus);

  const loadProjectState = usePanelStore((s) => s.loadProjectState);
  const sheets = usePanelStore((s) => s.sheets);
  const activeSheetId = usePanelStore((s) => s.activeSheetId);
  const displayUnit = usePanelStore((s) => s.displayUnit);
  const gridSnapMm = usePanelStore((s) => s.gridSnapMm);
  const autoRouteDuctsEnabled = usePanelStore((s) => s.autoRouteDuctsEnabled);
  const titleBlock = usePanelStore((s) => s.titleBlock);

  const [projects, setProjects] = useState<CloudProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load projects");
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open && user) {
      fetchProjects();
    }
  }, [open, user, fetchProjects]);

  if (!open || !user) return null;

  const handleSaveAsNew = async () => {
    setSavingNew(true);
    setError(null);
    setSyncStatus("saving");
    try {
      const cleanSheets = sheets.map((sheet) => ({
        ...sheet,
        cadAssets: sheet.cadAssets.map(({ objectUrl: _omitted, ...rest }) => rest),
      }));
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: titleBlock.projectName || "PanelFlow Project",
          data: {
            sheets: cleanSheets,
            activeSheetId,
            displayUnit,
            gridSnapMm,
            autoRouteDuctsEnabled,
            titleBlock,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save project");
      if (data.project?.id) {
        setCloudProjectId(data.project.id);
      }
      setSyncStatus("saved");
      await fetchProjects();
    } catch (err) {
      setSyncStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSavingNew(false);
    }
  };

  const handleOpenProject = async (id: string) => {
    setOpeningId(id);
    setError(null);
    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to open project");
      const projData = data.project?.data;
      if (!projData || !Array.isArray(projData.sheets)) {
        throw new Error("Invalid cloud project payload");
      }
      loadProjectState({
        sheets: rehydrateCadAssets(projData.sheets),
        activeSheetId: projData.activeSheetId,
        displayUnit: projData.displayUnit,
        gridSnapMm: projData.gridSnapMm,
        autoRouteDuctsEnabled: projData.autoRouteDuctsEnabled,
        titleBlock: projData.titleBlock,
      });
      setCloudProjectId(id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open project");
    } finally {
      setOpeningId(null);
    }
  };

  const handleDeleteProject = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      if (cloudProjectId === id) {
        setCloudProjectId(null);
      }
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
    }
  };

  return (
    <SideSheet
      isOpen={open && Boolean(user)}
      onClose={() => setOpen(false)}
      side="right"
      modal={true}
      widthClassName="w-full max-w-md"
      className="top-0"
    >
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pr-3 shrink-0">
        <SideSheetHeader
          title="My Cloud Projects"
          subtitle={user.email}
          icon={<Cloud className="h-4 w-4 text-slate-600 dark:text-zinc-400" />}
          className="border-b-0 flex-1"
        />
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={fetchProjects}
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(false)}
            title="Close"
          >
            <span className="sr-only">Close</span>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </Button>
        </div>
      </div>

      <div className="border-b border-slate-200 dark:border-white/10 px-5 py-3 shrink-0">
        <Button
          variant="primary"
          size="md"
          disabled={savingNew}
          onClick={handleSaveAsNew}
          className="w-full rounded-lg font-semibold"
        >
          {savingNew ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Save Current Workbench as New Cloud Project
        </Button>
      </div>

      {error && (
        <div className="px-5 pt-3 shrink-0">
          <Alert
            variant="error"
            icon={<AlertCircle className="h-3.5 w-3.5" />}
            className="px-3 py-2 rounded-lg"
          >
            {error}
          </Alert>
        </div>
      )}

      <SideSheetBody className="p-4 space-y-2.5">
        {loading && projects.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading cloud projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/10 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No cloud projects saved yet. Click above or edit your panel to auto-save.
          </div>
        ) : (
          projects.map((proj) => {
            const isActive = proj.id === cloudProjectId;
            return (
              <div
                key={proj.id}
                className={`flex items-center justify-between rounded-xl border p-3 transition-colors ${
                  isActive
                    ? "border-sky-400 dark:border-sky-500/50 bg-sky-50/60 dark:bg-sky-500/10"
                    : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171a21]"
                }`}
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                      {proj.name}
                    </span>
                    {isActive && (
                      <Badge variant="blue" className="font-sans text-[9px]">
                        ACTIVE
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 font-sans text-[10px] text-slate-500 dark:text-slate-400">
                    Updated {new Date(proj.updated_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={openingId === proj.id}
                    onClick={() => handleOpenProject(proj.id)}
                  >
                    {openingId === proj.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FolderOpen className="h-3 w-3 text-slate-600 dark:text-zinc-400" />
                    )}
                    Open
                  </Button>
                  <Button
                    variant="danger"
                    size="icon-sm"
                    onClick={() => handleDeleteProject(proj.id)}
                    title="Delete Cloud Project"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </SideSheetBody>
    </SideSheet>
  );
}
