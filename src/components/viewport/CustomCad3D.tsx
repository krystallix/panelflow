"use client";

import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { parseDxfToMmSegments } from "@/lib/dxf-parser";
import { getCadScaleFactorToMm } from "@/lib/units";
import { usePanelStore } from "@/store/usePanelStore";
import { type CustomCadAsset, MATERIAL_PRESETS } from "@/types/panel";

function CadAssetItem3D({
  asset,
  onContextMenu,
}: {
  asset: CustomCadAsset;
  onContextMenu?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const selected = usePanelStore((s) => s.selected);
  const setSelected = usePanelStore((s) => s.setSelected);
  const isPinMarkingMode = usePanelStore((s) => s.isPinMarkingMode);
  const activeMarkingAssetId = usePanelStore((s) => s.activeMarkingAssetId);
  const updateCadAsset = usePanelStore((s) => s.updateCadAsset);
  const addPinToAsset = usePanelStore((s) => s.addPinToAsset);

  const groupRef = useRef<THREE.Group>(null);
  const [loadedObject, setLoadedObject] = useState<THREE.Object3D | null>(null);

  const isSelected = selected?.kind === "cad" && selected.id === asset.id;
  const isMarkingThis = isPinMarkingMode && activeMarkingAssetId === asset.id;

  // Load GLB / GLTF / OBJ
  useEffect(() => {
    let cancelled = false;
    const scale = getCadScaleFactorToMm(asset.sourceUnit);

    if (asset.format === "glb" || asset.format === "gltf") {
      const src = asset.objectUrl || asset.dataUrl;
      if (!src) return;
      const loader = new GLTFLoader();
      loader.load(
        src,
        (gltf) => {
          if (cancelled) return;
          const scene = gltf.scene.clone();
          scene.scale.setScalar(scale);
          scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(scene);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          scene.position.sub(center);

          setLoadedObject(scene);
          const nextW = Math.max(1, Number(size.x.toFixed(1)));
          const nextH = Math.max(1, Number(size.y.toFixed(1)));
          const nextD = Math.max(1, Number(size.z.toFixed(1)));
          if (
            asset.boundingBoxMm.w !== nextW ||
            asset.boundingBoxMm.h !== nextH ||
            asset.boundingBoxMm.d !== nextD
          ) {
            updateCadAsset(asset.id, {
              boundingBoxMm: { w: nextW, h: nextH, d: nextD },
            });
          }
        },
        undefined,
        () => {
          if (!cancelled) setLoadedObject(null);
        }
      );
    } else if (asset.format === "obj" && asset.rawText) {
      const loader = new OBJLoader();
      const obj = loader.parse(asset.rawText);
      obj.scale.setScalar(scale);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      obj.position.sub(center);

      setLoadedObject(obj);
      const nextW = Math.max(1, Number(size.x.toFixed(1)));
      const nextH = Math.max(1, Number(size.y.toFixed(1)));
      const nextD = Math.max(1, Number(size.z.toFixed(1)));
      if (
        asset.boundingBoxMm.w !== nextW ||
        asset.boundingBoxMm.h !== nextH ||
        asset.boundingBoxMm.d !== nextD
      ) {
        updateCadAsset(asset.id, {
          boundingBoxMm: { w: nextW, h: nextH, d: nextD },
        });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.format, asset.objectUrl, asset.dataUrl, asset.rawText, asset.sourceUnit, updateCadAsset]);

  // Parse DXF (segments are pre-centered around local origin by subtracting centerOffsetMm)
  const dxfGeometry = useMemo(() => {
    if (asset.format !== "dxf" || !asset.rawText) return null;
    const parsed = parseDxfToMmSegments(asset.rawText, asset.sourceUnit);
    const positions: number[] = [];
    for (const seg of parsed.segments) {
      positions.push(seg.x1, seg.y1, seg.z1, seg.x2, seg.y2, seg.z2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return {
      geo,
      bbox: parsed.boundingBoxMm,
      hasSegments: parsed.segments.length > 0,
    };
  }, [asset.format, asset.rawText, asset.sourceUnit]);

  useEffect(() => {
    if (dxfGeometry) {
      const current = asset.boundingBoxMm;
      const next = {
        w: dxfGeometry.bbox.w,
        h: dxfGeometry.bbox.h,
        // Preserve real 3D depth when rendering a 2D DXF (which has z-span <= 1 mm)
        d: dxfGeometry.bbox.d <= 1 && current.d > 1 ? current.d : dxfGeometry.bbox.d,
      };
      if (
        current.w !== next.w ||
        current.h !== next.h ||
        current.d !== next.d
      ) {
        updateCadAsset(asset.id, { boundingBoxMm: next });
      }
    }
  }, [asset.id, asset.boundingBoxMm, dxfGeometry, updateCadAsset]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (isMarkingThis && groupRef.current) {
      const localPt = groupRef.current.worldToLocal(e.point.clone());
      addPinToAsset(asset.id, {
        label: `P${asset.pins.length + 1}`,
        localXMm: Number(localPt.x.toFixed(1)),
        localYMm: Number(localPt.y.toFixed(1)),
        localZMm: Number(localPt.z.toFixed(1)),
      });
      return;
    }
    setSelected({ kind: "cad", id: asset.id });
  };

  const rotRad = ((asset.rotationDeg ?? 0) * Math.PI) / 180;

  return (
    <group
      ref={groupRef}
      position={[asset.xMm, asset.yMm, asset.zMm]}
      rotation={[0, 0, -rotRad]}
      onClick={handleClick}
      onContextMenu={onContextMenu}
    >
      {loadedObject && <primitive object={loadedObject} />}

      {dxfGeometry && (
        <>
          <lineSegments geometry={dxfGeometry.geo}>
            <lineBasicMaterial color="#38bdf8" />
          </lineSegments>
          {/* Hitbox for clicking/pin marking on 2D/3D DXF */}
          <mesh>
            <boxGeometry
              args={[
                Math.max(10, dxfGeometry.bbox.w),
                Math.max(10, dxfGeometry.bbox.h),
                Math.max(4, asset.boundingBoxMm.d, dxfGeometry.bbox.d),
              ]}
            />
            <meshBasicMaterial transparent opacity={0.06} color="#38bdf8" />
          </mesh>
        </>
      )}

      {/* Render 3D Solid Geometry for Custom Drawn Busbar / Plate */}
      {asset.materialType && !loadedObject && !dxfGeometry && (() => {
        const mat = MATERIAL_PRESETS[asset.materialType] || MATERIAL_PRESETS.copper;
        const w = Math.max(2, asset.boundingBoxMm.w);
        const h = Math.max(2, asset.boundingBoxMm.h);
        const d = Math.max(2, asset.boundingBoxMm.d);

        if (asset.drawShape === "circle") {
          return (
            <mesh>
              <cylinderGeometry args={[w / 2, w / 2, d, 32]} />
              <meshStandardMaterial
                color={mat.fillColor}
                metalness={mat.metalness}
                roughness={mat.roughness}
              />
            </mesh>
          );
        }

        return (
          <mesh>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial
              color={mat.fillColor}
              metalness={mat.metalness}
              roughness={mat.roughness}
            />
          </mesh>
        );
      })()}

      {(isSelected || isMarkingThis) && (
        <mesh>
          <boxGeometry
            args={[
              asset.boundingBoxMm.w + 3,
              asset.boundingBoxMm.h + 3,
              Math.max(4, asset.boundingBoxMm.d + 3),
            ]}
          />
          <meshBasicMaterial
            color={isMarkingThis ? "#f59e0b" : "#38bdf8"}
            wireframe
          />
        </mesh>
      )}

      {asset.pins.map((pin) => (
        <group
          key={pin.id}
          position={[pin.localXMm, pin.localYMm, pin.localZMm]}
        >
          <mesh>
            <sphereGeometry args={[3.5, 14, 14]} />
            <meshStandardMaterial
              color="#f59e0b"
              emissive="#b45309"
              emissiveIntensity={0.35}
            />
          </mesh>
          <Html
            center
            distanceFactor={550}
            position={[0, 8, 6]}
            style={{ pointerEvents: "none" }}
          >
            <span className="rounded bg-amber-950/90 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-amber-300 border border-amber-500/60 whitespace-nowrap">
              {pin.label}
            </span>
          </Html>
        </group>
      ))}
    </group>
  );
}

export function CustomCad3D({
  onContextMenu,
}: {
  onContextMenu?: (
    e: ThreeEvent<MouseEvent>,
    target: import("@/components/ui/ContextMenu").ContextMenuTarget
  ) => void;
}) {
  const cadAssets = usePanelStore((s) => s.cadAssets);
  return (
    <group>
      {cadAssets.map((asset) => (
        <CadAssetItem3D
          key={asset.id}
          asset={asset}
          onContextMenu={(e) => {
            if (onContextMenu) {
              e.stopPropagation();
              onContextMenu(e, { kind: "cad", id: asset.id });
            }
          }}
        />
      ))}
    </group>
  );
}
