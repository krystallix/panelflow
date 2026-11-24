"use client";

import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";
import { COMPONENT_CATALOG } from "@/lib/components-catalog";
import { usePanelStore } from "@/store/usePanelStore";
import type { PlacedComponent } from "@/types/panel";

const BACKPLATE_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

const DOOR_CONTROLS_3D = new Set([
  "pilot-lamp-red",
  "pilot-lamp-green",
  "pilot-lamp-yellow",
  "push-button",
  "e-stop",
  "selector-3pos",
  "cam-lock",
  "cooling-fan-120",
  "panel-meter-96",
]);

const ROUND_DOOR_3D = new Set([
  "pilot-lamp-red",
  "pilot-lamp-green",
  "pilot-lamp-yellow",
  "push-button",
  "e-stop",
  "selector-3pos",
  "cam-lock",
]);

function TerminalScrews3D({ comp }: { comp: PlacedComponent }) {
  if (DOOR_CONTROLS_3D.has(comp.templateId) || comp.pins.length === 0) {
    return null;
  }
  const frontZ = comp.depthMm / 2;
  const r = comp.widthMm < 12 ? 1.3 : comp.widthMm < 24 ? 1.7 : 2.1;

  return (
    <group>
      {comp.pins.map((pin) => (
        <group
          key={`screw3d-${pin.id}`}
          position={[pin.localXMm, pin.localYMm, Math.min(frontZ - 0.5, pin.localZMm)]}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[r + 0.45, r + 0.45, 1.2, 12]} />
            <meshStandardMaterial color="#334155" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[r * 0.78, r * 0.78, 1.0, 14]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.75} roughness={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Clean Full Monochrome CAD 3D procedural details for all 29 components.
 */
function ComponentDetail3D({ comp }: { comp: PlacedComponent }) {
  const id = comp.templateId;
  const w = comp.widthMm;
  const h = comp.heightMm;
  const d = comp.depthMm;
  const frontZ = d / 2;

  // ── MCB 1P–4P (Stepped Acti9 DIN profile) ─────────────────────────────────
  if (id === "mcb-1p" || id === "mcb-2p" || id === "mcb-3p" || id === "mcb-4p") {
    const poles = id === "mcb-1p" ? 1 : id === "mcb-2p" ? 2 : id === "mcb-3p" ? 3 : 4;
    const poleW = w / poles;
    return (
      <group>
        {/* Stepped front escutcheon */}
        <mesh position={[0, 0, frontZ + 3]} castShadow>
          <boxGeometry args={[w * 0.96, h * 0.48, 6]} />
          <meshStandardMaterial color="#ffffff" roughness={0.38} />
        </mesh>
        {/* Recessed switch bay */}
        <mesh position={[0, -1, frontZ + 6.3]}>
          <boxGeometry args={[w * 0.9, h * 0.28, 1.2]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
        </mesh>
        {/* Toggle levers + status windows */}
        {Array.from({ length: poles }).map((_, i) => {
          const px = -w / 2 + poleW * (i + 0.5);
          return (
            <group key={`mcb3d-${i}`}>
              <mesh position={[px, 8, frontZ + 6.9]}>
                <boxGeometry args={[poleW * 0.48, 3.2, 0.8]} />
                <meshStandardMaterial color="#334155" roughness={0.4} />
              </mesh>
              <mesh position={[px, -3.5, frontZ + 9.5]} rotation={[-0.28, 0, 0]} castShadow>
                <boxGeometry args={[poleW * 0.64, 7.5, 6.5]} />
                <meshStandardMaterial color="#1e293b" roughness={0.32} />
              </mesh>
            </group>
          );
        })}
        {/* Multi-pole tie bar */}
        {poles > 1 && (
          <mesh position={[0, -4.5, frontZ + 12.2]}>
            <boxGeometry args={[w - poleW * 0.36, 2.8, 2.2]} />
            <meshStandardMaterial color="#0f172a" roughness={0.3} />
          </mesh>
        )}
        {/* Pole dividers */}
        {Array.from({ length: poles - 1 }).map((_, i) => (
          <mesh key={`pdiv-${i}`} position={[-w / 2 + poleW * (i + 1), 0, frontZ + 0.4]}>
            <boxGeometry args={[0.7, h * 0.94, 1]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
        ))}
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── MCCB 100A (ComPact NSX100 stepped molded case) ────────────────────────
  if (id === "mccb-100a") {
    return (
      <group>
        <mesh position={[0, 0, frontZ + 2.5]} castShadow>
          <boxGeometry args={[w * 0.88, h * 0.68, 5]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.42} />
        </mesh>
        <mesh position={[0, 4, frontZ + 6]}>
          <boxGeometry args={[34, 38, 4]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.45} />
        </mesh>
        <mesh position={[0, 7, frontZ + 11]} rotation={[-0.22, 0, 0]} castShadow>
          <boxGeometry args={[24, 11, 10]} />
          <meshStandardMaterial color="#1e293b" roughness={0.32} />
        </mesh>
        {/* Trip Test Button */}
        <mesh position={[26, -14, frontZ + 5.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[3.5, 3.5, 2, 16]} />
          <meshStandardMaterial color="#334155" roughness={0.4} />
        </mesh>
        {/* Top & Bottom Metallic Busbar Lugs */}
        {[-35, 0, 35].map((lx, idx) => (
          <group key={`mlug-${idx}`}>
            <mesh position={[lx, h / 2 - 8, frontZ - 2]}>
              <boxGeometry args={[16, 14, 4]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.75} roughness={0.28} />
            </mesh>
            <mesh position={[lx, -h / 2 + 8, frontZ - 2]}>
              <boxGeometry args={[16, 14, 4]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.75} roughness={0.28} />
            </mesh>
          </group>
        ))}
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── SPD 3P+N & Fuse 1P ────────────────────────────────────────────────────
  if (id === "spd-3pn" || id === "fuse-1p") {
    const poles = id === "spd-3pn" ? 4 : 1;
    const poleW = w / poles;
    return (
      <group>
        {Array.from({ length: poles }).map((_, i) => {
          const px = -w / 2 + poleW * (i + 0.5);
          return (
            <group key={`cart-${i}`}>
              <mesh position={[px, 0, frontZ + 2.5]} castShadow>
                <boxGeometry args={[poleW * 0.82, h * 0.56, 5]} />
                <meshStandardMaterial color="#ffffff" roughness={0.4} />
              </mesh>
              <mesh position={[px, 11, frontZ + 5.3]}>
                <boxGeometry args={[poleW * 0.45, 4.5, 0.8]} />
                <meshStandardMaterial color="#334155" />
              </mesh>
            </group>
          );
        })}
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── AC Contactor (Clean stepped TeSys LC1D09 procedural 3D) ───────────────
  if (id === "contactor") {
    return (
      <group>
        {/* Upper & Lower Aux Terminal Tiers */}
        <mesh position={[0, 19, frontZ + 2]} castShadow>
          <boxGeometry args={[w * 0.94, 11, 4]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.45} />
        </mesh>
        <mesh position={[0, -19, frontZ + 2]} castShadow>
          <boxGeometry args={[w * 0.94, 11, 4]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.45} />
        </mesh>
        {/* Central Raised Arc Chamber */}
        <mesh position={[0, 0, frontZ + 5.5]} castShadow>
          <boxGeometry args={[w * 0.88, 26, 9]} />
          <meshStandardMaterial color="#ffffff" roughness={0.38} />
        </mesh>
        {/* Mechanical Status Plunger */}
        <mesh position={[0, 0, frontZ + 10.4]}>
          <boxGeometry args={[14, 7.5, 1.4]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.45} />
        </mesh>
        <mesh position={[0, 0, frontZ + 11.4]}>
          <boxGeometry args={[8, 4, 1.2]} />
          <meshStandardMaterial color="#1e293b" roughness={0.35} />
        </mesh>
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── Thermal Overload Relay (Clean TeSys LRD10 procedural 3D) ──────────────
  if (id === "tor") {
    return (
      <group>
        {/* 3 Metallic Plug-In Prongs extending upward into Contactor */}
        {[-13, 0, 13].map((pxOff, idx) => (
          <mesh key={`prong3d-${idx}`} position={[pxOff, h / 2 + 4.5, frontZ - 14]}>
            <cylinderGeometry args={[1.35, 1.35, 10, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.78} roughness={0.24} />
          </mesh>
        ))}
        {/* Upper Control Block */}
        <mesh position={[0, 14, frontZ + 3]} castShadow>
          <boxGeometry args={[w * 0.92, 30, 6]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
        {/* Ampere Setting Dial */}
        <mesh position={[-10, 14, frontZ + 6.8]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[6, 6, 2, 18]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.35} />
        </mesh>
        {/* RESET & STOP Buttons */}
        <mesh position={[12, 21, frontZ + 7]}>
          <boxGeometry args={[7, 6, 2.5]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.38} />
        </mesh>
        <mesh position={[12, 9, frontZ + 7]}>
          <boxGeometry args={[7, 6, 2.5]} />
          <meshStandardMaterial color="#334155" roughness={0.38} />
        </mesh>
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── Mitsubishi S-T10 Contactor (36 × 75 × 78 mm) ──────────────────────────
  if (id === "contactor-st10") {
    return (
      <group>
        {/* Top Coil Block */}
        <mesh position={[0, h / 2 - 7.5, frontZ - 2]} castShadow>
          <boxGeometry args={[w * 0.82, 13, 8]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.45} />
        </mesh>
        {/* Upper & Lower 4-Pole Terminal Decks */}
        <mesh position={[0, 14, frontZ + 2]} castShadow>
          <boxGeometry args={[w * 0.96, 13, 4]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.44} />
        </mesh>
        <mesh position={[0, -28, frontZ + 2]} castShadow>
          <boxGeometry args={[w * 0.96, 14, 4]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.44} />
        </mesh>
        {/* Central Raised Faceplate & Vertical Plunger */}
        <mesh position={[0, -7, frontZ + 4.5]} castShadow>
          <boxGeometry args={[w * 0.9, 25, 7]} />
          <meshStandardMaterial color="#ffffff" roughness={0.38} />
        </mesh>
        <mesh position={[0, -6.5, frontZ + 8.6]}>
          <boxGeometry args={[5.5, 10, 2]} />
          <meshStandardMaterial color="#1e293b" roughness={0.35} />
        </mesh>
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── Mitsubishi TH-T18 Thermal Overload Relay (46 × 42 × 76.5 mm) ──────────
  if (id === "tor-tht18") {
    return (
      <group>
        {/* 3 Metallic Plug-In Prongs extending upward into S-T10 */}
        {[-12.5, -4.2, 4.2].map((pxOff, idx) => (
          <mesh key={`th18-prong3d-${idx}`} position={[pxOff, h / 2 + 5.5, frontZ - 14]}>
            <cylinderGeometry args={[1.25, 1.25, 12, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.78} roughness={0.24} />
          </mesh>
        ))}
        {/* Upper Dark Control Deck */}
        <mesh position={[0, 11.5, frontZ + 2.5]} castShadow>
          <boxGeometry args={[w * 0.94, 15, 5]} />
          <meshStandardMaterial color="#334155" roughness={0.45} />
        </mesh>
        {/* Reset Bar Button */}
        <mesh position={[-7, 11.5, frontZ + 6]}>
          <boxGeometry args={[10, 6, 3]} />
          <meshStandardMaterial color="#64748b" roughness={0.38} />
        </mesh>
        {/* Ampere Setting Dial */}
        <mesh position={[8.5, 11.5, frontZ + 5.8]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[6, 6, 2.2, 18]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.32} />
        </mesh>
        {/* Middle Raised Aux Terminal Block (98, 97, 95) */}
        <mesh position={[-4.5, -2, frontZ + 3.5]} castShadow>
          <boxGeometry args={[w * 0.78, 10.5, 5]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── Relay Sockets Only (MY4N 14-Pin PYF14A & MK3P 11-Pin PF113A) ──────────
  if (id === "relay-socket-my4n") {
    return (
      <group>
        {/* Stepped upper & lower inner terminal decks */}
        <mesh position={[0, 21.5, frontZ + 1.2]} castShadow>
          <boxGeometry args={[w * 0.96, 8.5, 2.4]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
        </mesh>
        <mesh position={[0, -21.5, frontZ + 1.2]} castShadow>
          <boxGeometry args={[w * 0.96, 8.5, 2.4]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
        </mesh>
        {/* Central flat 14-pin blade receptacle face (no relay body) */}
        <mesh position={[0, 0, frontZ + 2.2]} castShadow>
          <boxGeometry args={[w * 0.86, 31, 4.4]} />
          <meshStandardMaterial color="#ffffff" roughness={0.42} />
        </mesh>
        {/* 14 female blade socket slots */}
        {[-9, -3, 3, 9].map((rowY, rIdx) => {
          const cols = rIdx === 3 ? [-7.5, 7.5] : [-8.4, -2.8, 2.8, 8.4];
          return cols.map((colX, cIdx) => (
            <mesh key={`my4s3d-${rIdx}-${cIdx}`} position={[colX, -rowY, frontZ + 4.5]}>
              <boxGeometry args={[2, 2.8, 0.5]} />
              <meshStandardMaterial color="#1e293b" roughness={0.6} />
            </mesh>
          ));
        })}
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  if (id === "relay-socket-mk3p") {
    return (
      <group>
        {/* Raised circular 11-pin octal socket receptacle (no relay body) */}
        <mesh position={[0, 0, frontZ + 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[11.8, 12.2, 4, 28]} />
          <meshStandardMaterial color="#ffffff" roughness={0.42} />
        </mesh>
        {/* Center keyway hole */}
        <mesh position={[0, 0, frontZ + 4.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[4.4, 4.4, 0.6, 20]} />
          <meshStandardMaterial color="#334155" roughness={0.6} />
        </mesh>
        {/* 11 circular pin receptacles */}
        {Array.from({ length: 11 }).map((_, idx) => {
          const angle = ((idx * 360) / 11 - 90 + 16.36) * (Math.PI / 180);
          return (
            <mesh
              key={`mk3h3d-${idx}`}
              position={[Math.cos(angle) * 8.1, -Math.sin(angle) * 8.1, frontZ + 4.1]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[1.25, 1.25, 0.6, 12]} />
              <meshStandardMaterial color="#1e293b" roughness={0.55} />
            </mesh>
          );
        })}
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── PLC Compact CPU (Siemens S7-1200 stepped profile) ─────────────────────
  if (id === "plc-compact") {
    return (
      <group>
        {/* Top & Bottom Dark Terminal Covers */}
        <mesh position={[0, h / 2 - 7, frontZ + 1]}>
          <boxGeometry args={[w * 0.96, 12, 2]} />
          <meshStandardMaterial color="#334155" roughness={0.5} />
        </mesh>
        <mesh position={[0, -h / 2 + 7, frontZ + 1]}>
          <boxGeometry args={[w * 0.96, 12, 2]} />
          <meshStandardMaterial color="#334155" roughness={0.5} />
        </mesh>
        {/* Central Faceplate */}
        <mesh position={[0, 0, frontZ + 2]} castShadow>
          <boxGeometry args={[w * 0.94, h * 0.64, 4]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.42} />
        </mesh>
        {/* LED Bank */}
        <mesh position={[0, 20, frontZ + 4.3]}>
          <boxGeometry args={[w * 0.84, 9, 1]} />
          <meshStandardMaterial color="#1e293b" roughness={0.45} />
        </mesh>
        {/* RJ45 Port */}
        <mesh position={[w * 0.3, -4, frontZ + 4.3]}>
          <boxGeometry args={[14, 16, 1.2]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} />
        </mesh>
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── VFD 1.5kW (ATV320 Compact with rear heatsink + front keypad) ──────────
  if (id === "vfd-15kw") {
    return (
      <group>
        {/* Rear Extruded Aluminum Heatsink Fins */}
        {Array.from({ length: 7 }).map((_, i) => {
          const fx = -w * 0.4 + i * ((w * 0.8) / 6);
          return (
            <mesh key={`hfin-${i}`} position={[fx, 0, -frontZ + 14]}>
              <boxGeometry args={[2.5, h * 0.96, 26]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.35} />
            </mesh>
          );
        })}
        {/* Front Operator Keypad */}
        <mesh position={[0, 24, frontZ + 2]} castShadow>
          <boxGeometry args={[w * 0.82, 56, 4]} />
          <meshStandardMaterial color="#1e293b" roughness={0.42} />
        </mesh>
        {/* 7-Segment Display */}
        <mesh position={[0, 38, frontZ + 4.3]}>
          <boxGeometry args={[w * 0.64, 16, 1]} />
          <meshStandardMaterial color="#0f172a" roughness={0.3} />
        </mesh>
        {/* Jog Dial */}
        <mesh position={[-18, 12, frontZ + 5.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[8.5, 9, 3, 20]} />
          <meshStandardMaterial color="#475569" roughness={0.35} />
        </mesh>
        {/* Lower Louvers */}
        {[-16, -26, -36, -46].map((ly, idx) => (
          <mesh key={`vl3d-${idx}`} position={[0, ly, frontZ + 0.8]}>
            <boxGeometry args={[w * 0.78, 4, 1.2]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
        ))}
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── PSU 24V 5A / 10A (Mean Well NDR slim metallic enclosure) ──────────────
  if (id === "psu-24v" || id === "psu-24v-10a") {
    return (
      <group>
        <mesh position={[0, 2, frontZ + 0.8]}>
          <boxGeometry args={[w * 0.84, h * 0.62, 1.6]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.45} roughness={0.45} />
        </mesh>
        {/* V-ADJ Trimmer */}
        <mesh position={[w * 0.24, -h * 0.34, frontZ + 1.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[2.6, 2.6, 1.8, 16]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.5} roughness={0.3} />
        </mesh>
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── Distribution Block 4P ─────────────────────────────────────────────────
  if (id === "dist-block-4p") {
    return (
      <group>
        {[-18, -6, 6, 18].map((by, idx) => (
          <mesh key={`db3d-${idx}`} position={[0, by, frontZ + 1.5]}>
            <boxGeometry args={[w * 0.78, 5, 2.4]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.75} roughness={0.28} />
          </mesh>
        ))}
        {/* Translucent Polycarbonate Cover */}
        <mesh position={[0, 0, frontZ + 3.2]}>
          <boxGeometry args={[w * 0.88, h * 0.64, 1.6]} />
          <meshStandardMaterial color="#f8fafc" transparent opacity={0.35} roughness={0.2} />
        </mesh>
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── Terminal Blocks & End Clamp ───────────────────────────────────────────
  if (id === "terminal-block" || id === "terminal-n" || id === "terminal-pe" || id === "end-clamp") {
    return (
      <group>
        <mesh position={[0, 0, frontZ + 1.4]}>
          <boxGeometry args={[w * 0.86, 12, 2.8]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
        <TerminalScrews3D comp={comp} />
      </group>
    );
  }

  // ── Door Controls: Round Pilot Lamps, Push Button, E-Stop, Selector, Cam Lock ──
  if (ROUND_DOOR_3D.has(id)) {
    const outerR = Math.min(w, h) * 0.48;
    return (
      <group>
        {/* Rear Contact Block / Body behind door */}
        <mesh position={[0, 0, -d * 0.25]}>
          <boxGeometry args={[Math.min(w, 28), Math.min(h, 30), d * 0.5]} />
          <meshStandardMaterial color="#334155" roughness={0.5} />
        </mesh>
        {/* Metallic Mounting Bezel */}
        <mesh position={[0, 0, 3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[outerR, outerR * 1.04, 5, 24]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.25} />
        </mesh>
        {/* Actuator Cap */}
        {id === "selector-3pos" ? (
          <mesh position={[0, 0, 8.5]} rotation={[0, 0, 0.38]} castShadow>
            <boxGeometry args={[5, outerR * 1.5, 7]} />
            <meshStandardMaterial color="#1e293b" roughness={0.35} />
          </mesh>
        ) : id === "e-stop" ? (
          <mesh position={[0, 0, 10]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[outerR * 0.82, outerR * 0.72, 10, 24]} />
            <meshStandardMaterial color="#1e293b" roughness={0.32} />
          </mesh>
        ) : id === "cam-lock" ? (
          <mesh position={[0, 0, 6.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[outerR * 0.65, outerR * 0.65, 2.4, 20]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.25} />
          </mesh>
        ) : id === "pilot-lamp-red" || id === "pilot-lamp-green" || id === "pilot-lamp-yellow" ? (
          <mesh position={[0, 0, 7.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[outerR * 0.72, outerR * 0.76, 4.5, 24]} />
            <meshStandardMaterial
              color={
                id === "pilot-lamp-red"
                  ? "#fca5a5"
                  : id === "pilot-lamp-green"
                    ? "#86efac"
                    : "#fde047"
              }
              transparent
              opacity={0.78}
              roughness={0.22}
            />
          </mesh>
        ) : (
          <mesh position={[0, 0, 7.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[outerR * 0.72, outerR * 0.76, 4.5, 24]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.28} />
          </mesh>
        )}
      </group>
    );
  }

  // ── Panel Meter 96×96 ─────────────────────────────────────────────────────
  if (id === "panel-meter-96") {
    return (
      <group>
        <mesh position={[0, 0, frontZ + 1.8]} castShadow>
          <boxGeometry args={[w * 0.94, h * 0.94, 3.5]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} />
        </mesh>
        <mesh position={[0, 10, frontZ + 3.8]}>
          <boxGeometry args={[w * 0.76, h * 0.46, 1]} />
          <meshStandardMaterial color="#0f172a" roughness={0.25} />
        </mesh>
        {[-24, -8, 8, 24].map((bx, idx) => (
          <mesh key={`mb3d-${idx}`} position={[bx, -28, frontZ + 3.9]}>
            <boxGeometry args={[10, 6.5, 1.5]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.35} />
          </mesh>
        ))}
      </group>
    );
  }

  // ── Cooling Fan 120mm ─────────────────────────────────────────────────────
  if (id === "cooling-fan-120") {
    return (
      <group>
        <mesh position={[0, 0, frontZ + 1.5]} castShadow>
          <boxGeometry args={[w * 0.95, h * 0.95, 3]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.45} />
        </mesh>
        <mesh position={[0, 0, frontZ + 3.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[w * 0.4, w * 0.4, 2, 24]} />
          <meshStandardMaterial color="#334155" roughness={0.55} />
        </mesh>
        {Array.from({ length: 7 }).map((_, i) => {
          const angle = (i * Math.PI * 2) / 7;
          return (
            <mesh
              key={`blade3d-${i}`}
              position={[Math.cos(angle) * 26, Math.sin(angle) * 26, frontZ + 4.3]}
              rotation={[0.35, 0, angle]}
            >
              <boxGeometry args={[32, 9, 1.2]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.42} />
            </mesh>
          );
        })}
        <mesh position={[0, 0, frontZ + 5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[12, 12, 2.5, 20]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} />
        </mesh>
      </group>
    );
  }

  return <TerminalScrews3D comp={comp} />;
}

function ClearanceBox3D({ comp }: { comp: PlacedComponent }) {
  const cl = COMPONENT_CATALOG[comp.templateId]?.behavior?.clearanceMm;
  if (!cl) return null;
  const top = cl.top ?? 0;
  const bottom = cl.bottom ?? 0;

  return (
    <group>
      {top > 0 && (
        <mesh position={[0, comp.heightMm / 2 + top / 2, 0]}>
          <boxGeometry args={[comp.widthMm, top, comp.depthMm]} />
          <meshBasicMaterial color="#64748b" wireframe transparent opacity={0.45} />
        </mesh>
      )}
      {bottom > 0 && (
        <mesh position={[0, -comp.heightMm / 2 - bottom / 2, 0]}>
          <boxGeometry args={[comp.widthMm, bottom, comp.depthMm]} />
          <meshBasicMaterial color="#64748b" wireframe transparent opacity={0.45} />
        </mesh>
      )}
    </group>
  );
}

function ComponentItem3D({
  comp,
  isSelected,
  showPinLabels,
  doorFrontZ,
  doorMode,
  onDragChange,
  onContextMenu,
}: {
  comp: PlacedComponent;
  isSelected: boolean;
  showPinLabels: boolean;
  doorFrontZ: number;
  doorMode: "open" | "transparent" | "hidden";
  onDragChange: (dragging: boolean) => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const setSelected = usePanelStore((s) => s.setSelected);
  const moveComponent = usePanelStore((s) => s.moveComponent);

  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef({ dx: 0, dy: 0 });
  const hitPoint = useRef(new THREE.Vector3());

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelected({ kind: "component", id: comp.id });
    if (e.ray.intersectPlane(BACKPLATE_PLANE, hitPoint.current)) {
      offsetRef.current = {
        dx: comp.xMm - hitPoint.current.x,
        dy: comp.yMm - hitPoint.current.y,
      };
    }
    setDragging(true);
    onDragChange(true);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    if (e.ray.intersectPlane(BACKPLATE_PLANE, hitPoint.current)) {
      moveComponent(
        comp.id,
        hitPoint.current.x + offsetRef.current.dx,
        hitPoint.current.y + offsetRef.current.dy
      );
    }
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    setDragging(false);
    onDragChange(false);
  };

  const rotRad = ((comp.rotationDeg ?? 0) * Math.PI) / 180;
  const isRoundDoor = ROUND_DOOR_3D.has(comp.templateId);
  const isDoorComp = comp.mountingType === "door_cutout" || DOOR_CONTROLS_3D.has(comp.templateId);

  // Position door-mounted components flush on the front door plane when door is closed/transparent
  const effectiveZ =
    isDoorComp && doorMode === "transparent"
      ? isRoundDoor
        ? doorFrontZ
        : doorFrontZ - comp.depthMm / 2
      : comp.zMm;

  return (
    <group
      position={[comp.xMm, comp.yMm, effectiveZ]}
      rotation={[0, 0, -rotRad]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={onContextMenu}
    >
      {/* Main rectangular body (skipped for round door devices which build their own cylindrical body) */}
      {!isRoundDoor && (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[comp.widthMm, comp.heightMm, comp.depthMm]} />
          <meshStandardMaterial
            color={comp.color || "#f8fafc"}
            roughness={0.42}
            metalness={0.12}
          />
        </mesh>
      )}

      {/* Selection wireframe highlight */}
      {isSelected && (
        <mesh>
          <boxGeometry args={[comp.widthMm + 2, comp.heightMm + 2, comp.depthMm + 2]} />
          <meshBasicMaterial color="#0284c7" wireframe />
        </mesh>
      )}

      {/* Clearance Zone Wireframe when selected */}
      {isSelected && <ClearanceBox3D comp={comp} />}

      {/* Clean Monochrome 3D Hardware Details */}
      <ComponentDetail3D comp={comp} />

      {/* Clean Readable 3D Component Tag Badge */}
      <Html
        center
        distanceFactor={520}
        position={[0, comp.heightMm / 2 + 8, comp.depthMm / 2 + 4]}
        style={{ pointerEvents: "none" }}
      >
        <div
          className={`rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold tracking-tight whitespace-nowrap shadow-xs border ${
            isSelected
              ? "bg-sky-600 text-white border-sky-400"
              : "bg-white/92 text-slate-900 border-slate-300 dark:bg-slate-900/90 dark:text-slate-100 dark:border-slate-600"
          }`}
        >
          {comp.name}
        </div>
      </Html>

      {/* Pin Terminals (labels shown cleanly only when selected or showPinLabels is enabled) */}
      {comp.pins.map((pin) => (
        <group
          key={pin.id}
          position={[pin.localXMm, pin.localYMm, pin.localZMm]}
        >
          <mesh>
            <cylinderGeometry args={[1.8, 1.8, 3.2, 12]} />
            <meshStandardMaterial
              color="#94a3b8"
              metalness={0.8}
              roughness={0.22}
            />
          </mesh>
          {(isSelected || showPinLabels) && (
            <Html
              center
              distanceFactor={520}
              position={[0, pin.localYMm >= 0 ? 4 : -4, 8]}
              style={{ pointerEvents: "none" }}
            >
              <span className="rounded bg-slate-900/90 px-1 py-0.5 font-mono text-[8.5px] font-semibold text-slate-100 border border-slate-500/50 whitespace-nowrap">
                {pin.label}
              </span>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}

export function Components3D({
  onDragChange,
  onContextMenu,
}: {
  onDragChange: (dragging: boolean) => void;
  onContextMenu?: (
    e: ThreeEvent<MouseEvent>,
    target: import("@/components/ui/ContextMenu").ContextMenuTarget
  ) => void;
}) {
  const components = usePanelStore((s) => s.components);
  const selected = usePanelStore((s) => s.selected);
  const enclosure = usePanelStore((s) => s.enclosure);
  const showPinLabels = usePanelStore((s) => s.showPinLabels);

  const zBack = -enclosure.backplateThicknessMm - 18;
  const doorFrontZ = zBack + enclosure.depthMm;

  return (
    <group>
      {components.map((comp) => (
        <ComponentItem3D
          key={comp.id}
          comp={comp}
          isSelected={selected?.kind === "component" && selected.id === comp.id}
          showPinLabels={showPinLabels}
          doorFrontZ={doorFrontZ}
          doorMode={enclosure.doorMode}
          onDragChange={onDragChange}
          onContextMenu={(e) => {
            if (onContextMenu) {
              e.stopPropagation();
              onContextMenu(e, { kind: "component", id: comp.id });
            }
          }}
        />
      ))}
    </group>
  );
}
