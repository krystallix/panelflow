"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  ContextMenu,
  type ContextMenuState,
  type ContextMenuTarget,
} from "@/components/ui/ContextMenu";
import { Components3D } from "@/components/viewport/Components3D";
import { CustomCad3D } from "@/components/viewport/CustomCad3D";
import { Enclosure3D } from "@/components/viewport/Enclosure3D";
import { RailsAndDucts3D } from "@/components/viewport/RailsAndDucts3D";
import { detectCollisionsAndBounds } from "@/lib/collision";
import { WIRE_COLOR_MAP } from "@/lib/sheet-export";
import { getBackplateDimensions } from "@/lib/template-export";
import { formatDim } from "@/lib/units";
import { getWireOuterDiameterMm } from "@/lib/wire-router";
import { usePanelStore } from "@/store/usePanelStore";
import type { DoorMode, GridSnapMm } from "@/types/panel";

function Wires3D({
  onContextMenu,
}: {
  onContextMenu: (e: ThreeEvent<MouseEvent>, target: ContextMenuTarget) => void;
}) {
  const components = usePanelStore((s) => s.components);
  const cadAssets = usePanelStore((s) => s.cadAssets);
  const wires = usePanelStore((s) => s.wires);
  const selected = usePanelStore((s) => s.selected);
  const setSelected = usePanelStore((s) => s.setSelected);

  const wireMeshes = useMemo(() => {
    const pinMap = new Map<string, THREE.Vector3>();
    for (const c of components) {
      const rad = -((c.rotationDeg ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      for (const p of c.pins) {
        const wx = c.xMm + p.localXMm * cos - p.localYMm * sin;
        const wy = c.yMm + p.localXMm * sin + p.localYMm * cos;
        const wz = c.zMm + p.localZMm;
        pinMap.set(`${c.id}:${p.id}`, new THREE.Vector3(wx, wy, wz));
      }
    }
    for (const a of cadAssets) {
      const rad = -((a.rotationDeg ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      for (const p of a.pins) {
        const wx = a.xMm + p.localXMm * cos - p.localYMm * sin;
        const wy = a.yMm + p.localXMm * sin + p.localYMm * cos;
        const wz = a.zMm + p.localZMm;
        pinMap.set(`${a.id}:${p.id}`, new THREE.Vector3(wx, wy, wz));
      }
    }

    return wires
      .map((w) => {
        const p1 = pinMap.get(`${w.fromComponentId}:${w.fromPinId}`);
        const p2 =
          p1 && w.toFreePoint
            ? new THREE.Vector3(w.toFreePoint.xMm, w.toFreePoint.yMm, p1.z)
            : pinMap.get(`${w.toComponentId}:${w.toPinId}`);
        if (!p1 || !p2) return null;

        const liftZ = Math.max(p1.z, p2.z) + 18;
        let curvePoints: THREE.Vector3[];
        if (w.waypoints && w.waypoints.length >= 2) {
          const raw3D: THREE.Vector3[] = [
            p1,
            new THREE.Vector3(p1.x, p1.y, liftZ),
            ...w.waypoints.map((pt) => new THREE.Vector3(pt.xMm, pt.yMm, liftZ)),
            new THREE.Vector3(p2.x, p2.y, liftZ),
            p2,
          ];
          curvePoints = [raw3D[0]];
          for (let i = 1; i < raw3D.length; i++) {
            if (raw3D[i].distanceTo(curvePoints[curvePoints.length - 1]) > 0.1) {
              curvePoints.push(raw3D[i]);
            }
          }
        } else {
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          curvePoints = [
            p1,
            new THREE.Vector3(p1.x, p1.y, liftZ),
            new THREE.Vector3(midX, midY, liftZ + 6),
            new THREE.Vector3(p2.x, p2.y, liftZ),
            p2,
          ];
        }
        const curve = new THREE.CatmullRomCurve3(curvePoints, false, "catmullrom", 0.15);
        const radius = Math.max(1.2, getWireOuterDiameterMm(w.gaugeMm2) / 2);
        const segments = Math.max(24, curvePoints.length * 8);
        const geometry = new THREE.TubeGeometry(curve, segments, radius, 8, false);
        const color = WIRE_COLOR_MAP[w.colorCode] || "#2563eb";
        return { id: w.id, geometry, color };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [components, cadAssets, wires]);

  useEffect(() => {
    return () => {
      for (const item of wireMeshes) {
        item.geometry.dispose();
      }
    };
  }, [wireMeshes]);

  return (
    <group>
      {wireMeshes.map((wm) => {
        const isSelected = selected?.kind === "wire" && selected.id === wm.id;
        return (
          <mesh
            key={wm.id}
            geometry={wm.geometry}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              setSelected({ kind: "wire", id: wm.id });
            }}
            onContextMenu={(e) => onContextMenu(e, { kind: "wire", id: wm.id })}
          >
            <meshStandardMaterial
              color={isSelected ? "#38bdf8" : wm.color}
              roughness={0.38}
              metalness={0.12}
              emissive={isSelected ? "#0284c7" : "#000000"}
              emissiveIntensity={isSelected ? 0.35 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function PanelViewport() {
  const [isDraggingItem, setIsDraggingItem] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const meshContextHandledRef = useRef(false);

  const theme = usePanelStore((s) => s.theme);
  const displayUnit = usePanelStore((s) => s.displayUnit);
  const gridSnapMm = usePanelStore((s) => s.gridSnapMm);
  const enclosure = usePanelStore((s) => s.enclosure);
  const plateConfig = usePanelStore((s) => s.plateConfig);
  const components = usePanelStore((s) => s.components);
  const cadAssets = usePanelStore((s) => s.cadAssets);
  const wires = usePanelStore((s) => s.wires);
  const isPinMarkingMode = usePanelStore((s) => s.isPinMarkingMode);
  const setSelected = usePanelStore((s) => s.setSelected);
  const setDoorMode = usePanelStore((s) => s.setDoorMode);
  const setGridSnapMm = usePanelStore((s) => s.setGridSnapMm);
  const undo = usePanelStore((s) => s.undo);
  const redo = usePanelStore((s) => s.redo);
  const canUndo = usePanelStore((s) => s.canUndo);
  const canRedo = usePanelStore((s) => s.canRedo);
  const selected = usePanelStore((s) => s.selected);
  const selectedIds = usePanelStore((s) => s.selectedIds);
  const copySelectedToClipboard = usePanelStore((s) => s.copySelectedToClipboard);
  const pasteFromClipboard = usePanelStore((s) => s.pasteFromClipboard);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      if (isEditingText) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === "c") {
        if (selectedIds.length > 0 || selected) {
          e.preventDefault();
          copySelectedToClipboard();
        }
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteFromClipboard();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, selectedIds, copySelectedToClipboard, pasteFromClipboard]);

  const { widthMm: plateW, heightMm: plateH } = useMemo(
    () => getBackplateDimensions(enclosure, plateConfig),
    [enclosure, plateConfig]
  );

  const collisionReport = useMemo(
    () => detectCollisionsAndBounds(components, cadAssets, plateW, plateH),
    [components, cadAssets, plateW, plateH]
  );
  const totalCollisions =
    collisionReport.overlapPairs.length + collisionReport.outOfBoundsIds.size;

  const handle3DContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>, target: ContextMenuTarget) => {
      e.nativeEvent.preventDefault();
      meshContextHandledRef.current = true;
      if (
        target.kind === "component" ||
        target.kind === "rail" ||
        target.kind === "duct" ||
        target.kind === "cad"
      ) {
        setSelected({ kind: target.kind, id: target.id });
      }
      setContextMenu({
        x: e.nativeEvent.clientX,
        y: e.nativeEvent.clientY,
        target,
      });
    },
    [setSelected]
  );

  const doorModes: { value: DoorMode; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "transparent", label: "Glass" },
    { value: "hidden", label: "Hidden" },
  ];
  const snaps: GridSnapMm[] = [1, 5, 10, 25];

  return (
    <div
      className="relative h-full w-full bg-[#f8fafc] dark:bg-[#090b10] select-none"
      onContextMenu={(e) => {
        e.preventDefault();
        if (meshContextHandledRef.current) {
          meshContextHandledRef.current = false;
          return;
        }
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          target: { kind: "canvas", worldPos: { xMm: 0, yMm: 0 } },
        });
      }}
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{ powerPreference: "high-performance", antialias: true }}
        shadows
        camera={{ position: [520, 200, 1360], fov: 38, near: 2, far: 25000 }}
      >
        <color
          attach="background"
          args={[theme === "light" ? "#f1f5f9" : "#090b10"]}
        />
        <ambientLight intensity={theme === "light" ? 0.95 : 0.7} />
        <hemisphereLight
          args={[
            theme === "light" ? "#ffffff" : "#cbd5e1",
            theme === "light" ? "#94a3b8" : "#1e293b",
            theme === "light" ? 0.85 : 0.45,
          ]}
        />
        <directionalLight
          position={[600, 900, 1000]}
          intensity={1.35}
          castShadow
        />
        <directionalLight position={[-600, -400, 700]} intensity={0.5} />

        <Enclosure3D />
        <RailsAndDucts3D
          onDragChange={setIsDraggingItem}
          onContextMenu={handle3DContextMenu}
        />
        <Components3D
          onDragChange={setIsDraggingItem}
          onContextMenu={handle3DContextMenu}
        />
        <Wires3D onContextMenu={handle3DContextMenu} />
        <CustomCad3D onContextMenu={handle3DContextMenu} />

        <OrbitControls
          makeDefault
          enabled={!isDraggingItem}
          enableDamping
          dampingFactor={0.08}
          minDistance={180}
          maxDistance={4000}
        />
      </Canvas>

      {/* Top-Left Floating Island Toolbar (RelayTest SubToolbar style) */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 rounded-2xl border border-slate-200/90 dark:border-white/15 bg-white/85 dark:bg-[#11141c]/80 px-2.5 py-1.5 shadow-2xl shadow-slate-900/15 dark:shadow-black/60 backdrop-blur-md">
        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="rounded-full p-1.5 text-[#334155] dark:text-slate-300 transition-colors hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="rounded-full p-1.5 text-[#334155] dark:text-slate-300 transition-colors hover:bg-[#f1f5f9] dark:hover:bg-white/10 hover:text-[#0f172a] dark:hover:text-white disabled:opacity-30"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-[#e2e8f0] dark:bg-white/10" />

        {/* Door Mode */}
        <div className="flex items-center gap-0.5">
          {doorModes.map((dm) => (
            <button
              key={dm.value}
              type="button"
              onClick={() => setDoorMode(dm.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                enclosure.doorMode === dm.value
                  ? "bg-[#0f172a] text-white dark:bg-white dark:text-black font-semibold"
                  : "text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-white"
              }`}
            >
              {dm.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-[#e2e8f0] dark:bg-white/10" />

        {/* Grid Snap */}
        <div className="flex items-center gap-0.5 font-sans text-[10px]">
          {snaps.map((snap) => (
            <button
              key={snap}
              type="button"
              onClick={() => setGridSnapMm(snap)}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                gridSnapMm === snap
                  ? "bg-[#e2e8f0] text-[#0f172a] dark:bg-[#343842] dark:text-white font-semibold"
                  : "text-[#64748b] dark:text-slate-400 hover:text-[#0f172a] dark:hover:text-white"
              }`}
            >
              {formatDim(snap, displayUnit)}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Left Status Pill */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-full border border-[#e2e8f0] dark:border-white/10 bg-white/95 dark:bg-[#171a21]/95 px-3 py-1 font-sans text-[11px] tabular-nums text-[#0f172a] dark:text-slate-300 shadow-sm dark:shadow-lg backdrop-blur-xl">
        <span>
          ENCLOSURE: {formatDim(enclosure.widthMm, displayUnit)} ×{" "}
          {formatDim(enclosure.heightMm, displayUnit)} ×{" "}
          {formatDim(enclosure.depthMm, displayUnit)}
        </span>
        <span className="text-[#cbd5e1] dark:text-white/20">|</span>
        <span className="text-[#64748b] dark:text-slate-400">
          Snap: {formatDim(gridSnapMm, displayUnit)}
        </span>
      </div>

      {isPinMarkingMode && (
        <div className="pointer-events-none absolute bottom-12 left-1/2 z-20 -translate-x-1/2 rounded-full border border-amber-500/50 bg-amber-50/95 dark:bg-amber-950/90 px-3 py-1 font-sans text-[11px] font-semibold text-amber-700 dark:text-amber-300 shadow-lg">
          PIN MARKER ACTIVE — CLICK MESH SURFACE TO PLACE PIN
        </div>
      )}

      {/* Bottom Right Status Pill */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-full border border-[#e2e8f0] dark:border-white/10 bg-white/95 dark:bg-[#171a21]/95 px-3 py-1 font-sans text-[11px] tabular-nums text-[#0f172a] dark:text-slate-300 shadow-sm dark:shadow-lg backdrop-blur-xl">
        <span>Parts: {components.length + cadAssets.length}</span>
        <span className="text-[#cbd5e1] dark:text-white/20">|</span>
        <span>Wires: {wires.length}</span>
        <span className="text-[#cbd5e1] dark:text-white/20">|</span>
        <span className={totalCollisions > 0 ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-emerald-600 dark:text-emerald-400"}>
          Collisions: {totalCollisions}
        </span>
      </div>

      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
}
