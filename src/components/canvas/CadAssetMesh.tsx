"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { usePanelStore } from "@/store/usePanelStore";
import { parseDxfToMmSegments } from "@/lib/dxf-parser";
import { getCadScaleFactorToMm } from "@/lib/units";
import type { CustomCadAsset } from "@/types/panel";

export function CadAssetMesh({ asset }: { asset: CustomCadAsset }) {
  const {
    selected,
    setSelected,
    isPinMarkingMode,
    activeMarkingAssetId,
    addPinToAsset,
    updateCadAsset,
  } = usePanelStore();

  const isSelected = selected?.kind === "cad" && selected.id === asset.id;
  const isMarkingThis = isPinMarkingMode && activeMarkingAssetId === asset.id;

  const [loadedObject, setLoadedObject] = useState<THREE.Object3D | null>(null);

  // Load GLB / GLTF / OBJ
  useEffect(() => {
    if (!asset.objectUrl || asset.format === "dxf") {
      setLoadedObject(null);
      return;
    }

    let cancelled = false;
    const scaleFactor = getCadScaleFactorToMm(asset.sourceUnit);

    const normalizeAndSet = (obj: THREE.Object3D) => {
      if (cancelled) return;
      obj.scale.setScalar(scaleFactor);
      obj.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // Center object at local origin
      obj.position.sub(center);

      updateCadAsset(asset.id, {
        boundingBoxMm: {
          w: Math.max(1, Number(size.x.toFixed(1))),
          h: Math.max(1, Number(size.y.toFixed(1))),
          d: Math.max(1, Number(size.z.toFixed(1))),
        },
        zMm: Math.max(1, size.z / 2),
      });

      setLoadedObject(obj);
    };

    if (asset.format === "glb" || asset.format === "gltf") {
      const loader = new GLTFLoader();
      loader.load(
        asset.objectUrl,
        (gltf) => normalizeAndSet(gltf.scene),
        undefined,
        (err) => console.error("GLTF load error:", err)
      );
    } else if (asset.format === "obj") {
      const loader = new OBJLoader();
      loader.load(
        asset.objectUrl,
        (obj) => {
          obj.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              if (!mesh.material) {
                mesh.material = new THREE.MeshStandardMaterial({
                  color: "#94a3b8",
                  metalness: 0.3,
                  roughness: 0.6,
                });
              }
            }
          });
          normalizeAndSet(obj);
        },
        undefined,
        (err) => console.error("OBJ load error:", err)
      );
    }

    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.objectUrl, asset.format, asset.sourceUnit]);

  // Parse DXF segments
  const dxfGeometry = useMemo(() => {
    if (asset.format !== "dxf" || !asset.rawText) return null;
    const parsed = parseDxfToMmSegments(asset.rawText, asset.sourceUnit);
    const positions = new Float32Array(parsed.segments.length * 6);
    parsed.segments.forEach((s, idx) => {
      const i = idx * 6;
      positions[i] = s.x1;
      positions[i + 1] = s.y1;
      positions[i + 2] = s.z1;
      positions[i + 3] = s.x2;
      positions[i + 4] = s.y2;
      positions[i + 5] = s.z2;
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [asset.format, asset.rawText, asset.sourceUnit]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (isMarkingThis) {
      const localX = Number((e.point.x - asset.xMm).toFixed(1));
      const localY = Number((e.point.y - asset.yMm).toFixed(1));
      const localZ = Number((e.point.z - asset.zMm).toFixed(1));
      addPinToAsset(asset.id, {
        label: `P${asset.pins.length + 1}`,
        localXMm: localX,
        localYMm: localY,
        localZMm: localZ,
      });
      return;
    }
    setSelected({ kind: "cad", id: asset.id });
  };

  return (
    <group
      position={[asset.xMm, asset.yMm, asset.zMm]}
      onClick={handleClick}
    >
      {/* Loaded GLB/GLTF/OBJ */}
      {loadedObject && <primitive object={loadedObject} />}

      {/* DXF LineSegments + Invisible Hit Box */}
      {asset.format === "dxf" && dxfGeometry && (
        <group>
          <lineSegments geometry={dxfGeometry}>
            <lineBasicMaterial color={isSelected ? "#38bdf8" : "#f59e0b"} />
          </lineSegments>
          <mesh>
            <boxGeometry
              args={[
                asset.boundingBoxMm.w,
                asset.boundingBoxMm.h,
                Math.max(8, asset.boundingBoxMm.d),
              ]}
            />
            <meshBasicMaterial transparent opacity={0.08} color="#38bdf8" />
          </mesh>
        </group>
      )}

      {/* Selection / Marking Bounding Wireframe */}
      {(isSelected || isMarkingThis) && (
        <mesh>
          <boxGeometry
            args={[
              asset.boundingBoxMm.w + 2,
              asset.boundingBoxMm.h + 2,
              Math.max(4, asset.boundingBoxMm.d + 2),
            ]}
          />
          <meshBasicMaterial
            wireframe
            color={isMarkingThis ? "#f59e0b" : "#38bdf8"}
          />
        </mesh>
      )}

      {/* Marked Pin Terminals */}
      {asset.pins.map((pin) => (
        <group
          key={pin.id}
          position={[pin.localXMm, pin.localYMm, pin.localZMm]}
        >
          <mesh>
            <sphereGeometry args={[2.5, 12, 12]} />
            <meshStandardMaterial
              color="#f59e0b"
              emissive="#f59e0b"
              emissiveIntensity={0.6}
            />
          </mesh>
          {isSelected && (
            <Html distanceFactor={600} center>
              <div className="px-1 py-0.5 rounded bg-zinc-950/90 border border-amber-500/60 text-amber-300 text-[9px] font-sans pointer-events-none whitespace-nowrap">
                {pin.label}
              </div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}
