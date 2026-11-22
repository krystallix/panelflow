import React from "react";
import { COMPONENT_CATALOG } from "@/lib/components-catalog";
import type { PlacedComponent } from "@/types/panel";

interface ComponentSvg2DProps {
  comp: PlacedComponent;
  x: number;
  y: number;
  bodyFill?: string;
  accent?: string;
  isSelected: boolean;
  showClearance?: boolean;
}

const DOOR_CONTROL_IDS = new Set([
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

const ROUND_DOOR_IDS = new Set([
  "pilot-lamp-red",
  "pilot-lamp-green",
  "pilot-lamp-yellow",
  "push-button",
  "e-stop",
  "selector-3pos",
  "cam-lock",
]);

function renderScrewTerminals(comp: PlacedComponent, x: number, y: number) {
  if (DOOR_CONTROL_IDS.has(comp.templateId) || comp.pins.length === 0) {
    return null;
  }

  return (
    <g className="pointer-events-none">
      {comp.pins.map((pin) => {
        const px = x + comp.widthMm / 2 + pin.localXMm;
        const py = y + comp.heightMm / 2 - pin.localYMm;
        const r = comp.widthMm < 12 ? 1.35 : comp.widthMm < 24 ? 1.75 : 2.1;
        return (
          <g key={`term-${pin.id}`}>
            <circle
              cx={px}
              cy={py}
              r={r + 0.45}
              fill="#e2e8f0"
              stroke="#475569"
              strokeWidth={0.4}
            />
            <circle cx={px} cy={py} r={r * 0.72} fill="#cbd5e1" stroke="#334155" strokeWidth={0.35} />
            <line
              x1={px - r * 0.48}
              y1={py - r * 0.48}
              x2={px + r * 0.48}
              y2={py + r * 0.48}
              stroke="#1e293b"
              strokeWidth={0.45}
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </g>
  );
}

function renderClearanceZone(comp: PlacedComponent, x: number, y: number) {
  const tpl = COMPONENT_CATALOG[comp.templateId];
  const cl = tpl?.behavior?.clearanceMm;
  if (!cl) return null;

  const w = comp.widthMm;
  const h = comp.heightMm;
  const top = cl.top ?? 0;
  const bottom = cl.bottom ?? 0;
  const reasonLabel =
    cl.reason === "arc"
      ? "ARC CLEARANCE"
      : cl.reason === "bending"
      ? "CABLE SPACE"
      : "AIRFLOW";

  return (
    <g className="pointer-events-none select-none">
      {top > 0 && (
        <g>
          <rect
            x={x}
            y={y - top}
            width={w}
            height={top}
            fill="#64748b"
            fillOpacity={0.07}
            stroke="#64748b"
            strokeWidth={0.65}
            strokeDasharray="3,2"
          />
          <text
            x={x + w / 2}
            y={y - top / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={3.2}
            fontFamily="system-ui, sans-serif"
            fontWeight={600}
            fill="#475569"
          >
            ↑ {top}mm {reasonLabel}
          </text>
        </g>
      )}
      {bottom > 0 && (
        <g>
          <rect
            x={x}
            y={y + h}
            width={w}
            height={bottom}
            fill="#64748b"
            fillOpacity={0.07}
            stroke="#64748b"
            strokeWidth={0.65}
            strokeDasharray="3,2"
          />
          <text
            x={x + w / 2}
            y={y + h + bottom / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={3.2}
            fontFamily="system-ui, sans-serif"
            fontWeight={600}
            fill="#475569"
          >
            ↓ {bottom}mm {reasonLabel}
          </text>
        </g>
      )}
    </g>
  );
}

/**
 * Renders clean, Full Monochrome CAD 2D vector hardware artwork for all 29 panel components.
 */
export function ComponentSvg2D({
  comp,
  x,
  y,
  bodyFill = "#f8fafc",
  isSelected,
  showClearance = false,
}: ComponentSvg2DProps) {
  const w = comp.widthMm;
  const h = comp.heightMm;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const id = comp.templateId;
  const isRoundDoor = ROUND_DOOR_IDS.has(id);
  const strokeMain = isSelected ? "#0284c7" : "#0f172a";
  const strokeSub = "#475569";
  const strokeLight = "#94a3b8";

  return (
    <g>
      {/* Optional Thermal / Arc Clearance Zone (visible when selected) */}
      {(isSelected || showClearance) && renderClearanceZone(comp, x, y)}

      {/* DIN-rail clip ears (top & bottom subtle mounting tabs) */}
      {comp.mountingType === "din_rail" && !isRoundDoor && (
        <g fill="#cbd5e1" stroke="#334155" strokeWidth={0.45}>
          <rect
            x={cx - Math.min(7, w * 0.28)}
            y={y - 1.6}
            width={Math.min(14, w * 0.56)}
            height={1.8}
            rx={0.4}
          />
          <rect
            x={cx - Math.min(6, w * 0.24)}
            y={y + h - 0.2}
            width={Math.min(12, w * 0.48)}
            height={1.8}
            rx={0.4}
          />
        </g>
      )}

      {/* TOR Plug-In Prongs (extending upward into parent Contactor) */}
      {id === "tor" && (
        <g fill="#cbd5e1" stroke="#334155" strokeWidth={0.5}>
          {[-13, 0, 13].map((pxOff, idx) => (
            <rect
              key={`prong-${idx}`}
              x={cx + pxOff - 1.2}
              y={y - 7.5}
              width={2.4}
              height={8}
              rx={0.4}
            />
          ))}
        </g>
      )}

      {/* Main Rectangular Housing (for non-round components) */}
      {!isRoundDoor && (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={1.2}
            fill={bodyFill}
            stroke={strokeMain}
            strokeWidth={0.85}
          />
          {w >= 12 && h >= 20 && (
            <rect
              x={x + 1}
              y={y + 1}
              width={w - 2}
              height={h - 2}
              rx={0.7}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth={0.4}
            />
          )}
        </>
      )}

      {/* ── Protection & Switchgear ─────────────────────────────────────────── */}
      {id === "mcb-1p" || id === "mcb-2p" || id === "mcb-3p" || id === "mcb-4p" ? (
        (() => {
          const poles = id === "mcb-1p" ? 1 : id === "mcb-2p" ? 2 : id === "mcb-3p" ? 3 : 4;
          const poleW = w / poles;
          const bayY = y + h * 0.35;
          const bayH = h * 0.30;
          return (
            <g>
              {/* Top & bottom recessed terminal zones */}
              <rect x={x + 1} y={y + 2} width={w - 2} height={13} rx={0.6} fill="#f1f5f9" stroke={strokeLight} strokeWidth={0.4} />
              <rect x={x + 1} y={y + h - 15} width={w - 2} height={13} rx={0.6} fill="#f1f5f9" stroke={strokeLight} strokeWidth={0.4} />

              {/* Pole separation lines */}
              {Array.from({ length: poles - 1 }).map((_, i) => (
                <line
                  key={`div-${i}`}
                  x1={x + poleW * (i + 1)}
                  y1={y + 1}
                  x2={x + poleW * (i + 1)}
                  y2={y + h - 1}
                  stroke={strokeLight}
                  strokeWidth={0.55}
                />
              ))}

              {/* Central Escutcheon Step */}
              <rect
                x={x + 1.2}
                y={bayY}
                width={w - 2.4}
                height={bayH}
                rx={0.8}
                fill="#e2e8f0"
                stroke={strokeSub}
                strokeWidth={0.55}
              />

              {/* Per-pole status flag + toggle actuator */}
              {Array.from({ length: poles }).map((_, i) => {
                const px = x + poleW * i;
                return (
                  <g key={`pole-${i}`}>
                    {/* Status indicator window */}
                    <rect
                      x={px + poleW * 0.25}
                      y={bayY + 2.5}
                      width={poleW * 0.5}
                      height={3.2}
                      rx={0.5}
                      fill="#ffffff"
                      stroke={strokeSub}
                      strokeWidth={0.45}
                    />
                    <rect
                      x={px + poleW * 0.31}
                      y={bayY + 3.2}
                      width={poleW * 0.38}
                      height={1.8}
                      rx={0.2}
                      fill="#334155"
                    />
                    {/* Toggle actuator base */}
                    <rect
                      x={px + poleW * 0.18}
                      y={bayY + bayH * 0.42}
                      width={poleW * 0.64}
                      height={bayH * 0.42}
                      rx={0.8}
                      fill="#1e293b"
                      stroke="#0f172a"
                      strokeWidth={0.45}
                    />
                  </g>
                );
              })}

              {/* Multi-pole Tie Bar across toggles */}
              {poles > 1 && (
                <rect
                  x={x + poleW * 0.18}
                  y={bayY + bayH * 0.56}
                  width={w - poleW * 0.36}
                  height={2.6}
                  rx={0.6}
                  fill="#0f172a"
                  stroke="#f8fafc"
                  strokeWidth={0.3}
                />
              )}
            </g>
          );
        })()
      ) : id === "mccb-100a" ? (
        <g>
          {/* Top & Bottom Busbar Terminal Lugs */}
          {[-35, 0, 35].map((off, idx) => (
            <g key={`lug-${idx}`}>
              <rect x={cx + off - 9} y={y + 2} width={18} height={15} rx={0.8} fill="#e2e8f0" stroke={strokeSub} strokeWidth={0.5} />
              <rect x={cx + off - 9} y={y + h - 17} width={18} height={15} rx={0.8} fill="#e2e8f0" stroke={strokeSub} strokeWidth={0.5} />
            </g>
          ))}
          {/* Molded Escutcheon Faceplate */}
          <rect x={x + 5} y={y + 22} width={w - 10} height={h - 44} rx={1.8} fill="#f1f5f9" stroke={strokeSub} strokeWidth={0.7} />
          {/* 4 Corner Mounting Bolts */}
          {[
            [x + 10, y + 27],
            [x + w - 10, y + 27],
            [x + 10, y + h - 27],
            [x + w - 10, y + h - 27],
          ].map(([bx, by], i) => (
            <circle key={`mb-${i}`} cx={bx} cy={by} r={2} fill="#cbd5e1" stroke="#334155" strokeWidth={0.5} />
          ))}
          {/* Central Breaker Toggle Recess */}
          <rect x={cx - 17} y={cy - 20} width={34} height={40} rx={1.8} fill="#cbd5e1" stroke="#334155" strokeWidth={0.65} />
          <rect x={cx - 12} y={cy - 6} width={24} height={11} rx={1.4} fill="#1e293b" stroke="#0f172a" strokeWidth={0.6} />
          <line x1={cx - 9} y1={cy - 0.5} x2={cx + 9} y2={cy - 0.5} stroke="#94a3b8" strokeWidth={0.6} />
          {/* Trip Test Push Button */}
          <circle cx={cx + 26} cy={cy + 14} r={3.6} fill="#ffffff" stroke="#1e293b" strokeWidth={0.7} />
          <circle cx={cx + 26} cy={cy + 14} r={1.6} fill="#334155" />
          {/* Thermal/Magnetic Trip Dials */}
          <circle cx={cx - 24} cy={cy + 28} r={4} fill="#ffffff" stroke={strokeSub} strokeWidth={0.6} />
          <line x1={cx - 26} y1={cy + 28} x2={cx - 22} y2={cy + 28} stroke="#0f172a" strokeWidth={0.7} />
        </g>
      ) : id === "spd-3pn" ? (
        <g>
          {[0, 1, 2, 3].map((i) => {
            const pw = w / 4;
            const px = x + pw * i;
            return (
              <g key={`spd-${i}`}>
                <rect x={px + 1.5} y={y + 18} width={pw - 3} height={h - 36} rx={1} fill="#f1f5f9" stroke={strokeSub} strokeWidth={0.55} />
                {/* Cartridge status window */}
                <rect x={px + pw * 0.25} y={y + 24} width={pw * 0.5} height={5.5} rx={0.6} fill="#ffffff" stroke="#334155" strokeWidth={0.45} />
                <rect x={px + pw * 0.32} y={y + 25.2} width={pw * 0.36} height={3} rx={0.3} fill="#475569" />
                {/* Clean IEC Surge Symbol */}
                <polyline
                  points={`${px + pw * 0.56},${y + 38} ${px + pw * 0.38},${y + 47} ${px + pw * 0.6},${y + 47} ${px + pw * 0.42},${y + 56}`}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth={0.85}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
        </g>
      ) : id === "fuse-1p" ? (
        <g>
          <rect x={x + 2} y={y + 16} width={w - 4} height={h - 32} rx={1} fill="#f1f5f9" stroke={strokeSub} strokeWidth={0.6} />
          {/* Hinged Fuse Puller Drawer */}
          <rect x={x + 3.5} y={y + 22} width={w - 7} height={22} rx={0.8} fill="#ffffff" stroke="#334155" strokeWidth={0.55} />
          <line x1={cx} y1={y + 25} x2={cx} y2={y + 41} stroke="#334155" strokeWidth={0.7} />
          <rect x={cx - 2} y={y + 29} width={4} height={8} fill="#cbd5e1" stroke="#1e293b" strokeWidth={0.5} />
          {/* Pull Tab Grip */}
          <line x1={x + 4} y1={y + h - 22} x2={x + w - 4} y2={y + h - 22} stroke="#1e293b" strokeWidth={1.2} strokeLinecap="round" />
        </g>
      ) : id === "contactor" ? (
        <g>
          {/* Upper & Lower Power Terminal Tiers */}
          <rect x={x + 1.2} y={y + 1.5} width={w - 2.4} height={11} rx={0.6} fill="#e2e8f0" stroke={strokeLight} strokeWidth={0.45} />
          <rect x={x + 1.2} y={y + h - 12.5} width={w - 2.4} height={11} rx={0.6} fill="#e2e8f0" stroke={strokeLight} strokeWidth={0.45} />
          {/* Pole dividers in power tiers */}
          {[-6.5, 6.5].map((off, idx) => (
            <g key={`cdiv-${idx}`} stroke={strokeLight} strokeWidth={0.45}>
              <line x1={cx + off} y1={y + 1.5} x2={cx + off} y2={y + 12.5} />
              <line x1={cx + off} y1={y + h - 12.5} x2={cx + off} y2={y + h - 1.5} />
            </g>
          ))}
          {/* Upper & Lower Aux/Coil Terminal Strips */}
          <rect x={x + 1.5} y={y + 13.5} width={w - 3} height={10.5} rx={0.5} fill="#f1f5f9" stroke={strokeLight} strokeWidth={0.4} />
          <rect x={x + 1.5} y={y + h - 24} width={w - 3} height={10.5} rx={0.5} fill="#f1f5f9" stroke={strokeLight} strokeWidth={0.4} />
          {/* Central Raised Arc Chamber / Faceplate */}
          <rect x={x + 2.5} y={y + 25.5} width={w - 5} height={h - 51} rx={1.2} fill="#ffffff" stroke="#334155" strokeWidth={0.7} />
          {/* Mechanical Status Plunger Window */}
          <rect x={cx - 8} y={cy - 4.5} width={16} height={9} rx={1} fill="#e2e8f0" stroke="#334155" strokeWidth={0.55} />
          <rect x={cx - 4.5} y={cy - 2} width={9} height={4} rx={0.5} fill="#1e293b" />
          {/* Side mounting clip notches */}
          <line x1={x + 4} y1={cy - 9} x2={x + w - 4} y2={cy - 9} stroke="#cbd5e1" strokeWidth={0.5} />
          <line x1={x + 4} y1={cy + 9} x2={x + w - 4} y2={cy + 9} stroke="#cbd5e1" strokeWidth={0.5} />
        </g>
      ) : id === "tor" ? (
        <g>
          {/* Upper Control Faceplate */}
          <rect x={x + 2} y={y + 2.5} width={w - 4} height={31} rx={1} fill="#ffffff" stroke="#334155" strokeWidth={0.65} />
          {/* Current Adjustment Dial (Left) */}
          <circle cx={x + 12.5} cy={y + 18} r={6.5} fill="#f1f5f9" stroke="#1e293b" strokeWidth={0.65} />
          <line x1={x + 12.5} y1={y + 18} x2={x + 16.5} y2={y + 14} stroke="#0f172a" strokeWidth={0.9} strokeLinecap="round" />
          {/* Test / H-A Selector (Center) */}
          <rect x={cx - 2.5} y={y + 10} width={5} height={14} rx={0.8} fill="#e2e8f0" stroke="#334155" strokeWidth={0.5} />
          <rect x={cx - 1.5} y={y + 12} width={3} height={4} rx={0.4} fill="#1e293b" />
          {/* RESET (top) & STOP (bottom) Buttons (Right) */}
          <rect x={x + w - 13} y={y + 7.5} width={7.5} height={6.5} rx={1} fill="#e2e8f0" stroke="#1e293b" strokeWidth={0.6} />
          <rect x={x + w - 13} y={y + 20} width={7.5} height={6.5} rx={1} fill="#334155" stroke="#0f172a" strokeWidth={0.6} />
          {/* Aux Contact Row (97/98/95/96) */}
          <rect x={x + 1.5} y={y + 35.5} width={w - 3} height={11} rx={0.5} fill="#f1f5f9" stroke={strokeLight} strokeWidth={0.4} />
          {/* Bottom Power Terminal Row (2T1/4T2/6T3) */}
          <rect x={x + 1.5} y={y + h - 13.5} width={w - 3} height={12} rx={0.6} fill="#e2e8f0" stroke={strokeLight} strokeWidth={0.45} />
        </g>
      ) : id === "relay" ? (
        <g>
          {/* Socket Terminal Zones */}
          <rect x={x + 1} y={y + 1.5} width={w - 2} height={11} rx={0.5} fill="#e2e8f0" stroke={strokeLight} strokeWidth={0.4} />
          <rect x={x + 1} y={y + h - 12.5} width={w - 2} height={11} rx={0.5} fill="#e2e8f0" stroke={strokeLight} strokeWidth={0.4} />
          {/* Clear Polycarbonate Relay Body */}
          <rect x={x + 2.2} y={y + 15} width={w - 4.4} height={h - 30} rx={1.2} fill="#ffffff" stroke="#334155" strokeWidth={0.65} />
          {/* Internal Coil & Contact Schematic Hint */}
          <rect x={cx - 4.5} y={cy - 10} width={9} height={14} rx={0.6} fill="#e2e8f0" stroke="#475569" strokeWidth={0.55} />
          <line x1={cx - 4.5} y1={cy - 3} x2={cx + 4.5} y2={cy - 3} stroke="#64748b" strokeWidth={0.45} />
          <circle cx={cx} cy={cy + 10} r={1.8} fill="#334155" />
        </g>
      ) : id === "timer-relay" ? (
        <g>
          <rect x={x + 1} y={y + 1.5} width={w - 2} height={11} rx={0.5} fill="#e2e8f0" stroke={strokeLight} strokeWidth={0.4} />
          <rect x={x + 1} y={y + h - 12.5} width={w - 2} height={11} rx={0.5} fill="#e2e8f0" stroke={strokeLight} strokeWidth={0.4} />
          {/* Front Control Face */}
          <rect x={x + 1.8} y={y + 16} width={w - 3.6} height={h - 32} rx={0.9} fill="#ffffff" stroke="#334155" strokeWidth={0.6} />
          {/* Top Range Dial & Bottom Time Dial */}
          <circle cx={cx} cy={cy - 9} r={4.8} fill="#f1f5f9" stroke="#1e293b" strokeWidth={0.6} />
          <line x1={cx} y1={cy - 9} x2={cx + 2.8} y2={cy - 11.5} stroke="#0f172a" strokeWidth={0.8} />
          <circle cx={cx} cy={cy + 5} r={4.8} fill="#f1f5f9" stroke="#1e293b" strokeWidth={0.6} />
          <line x1={cx} y1={cy + 5} x2={cx - 2.5} y2={cy + 2.5} stroke="#0f172a" strokeWidth={0.8} />
          {/* Dual Status LEDs */}
          <circle cx={cx - 3} cy={cy + 16} r={1.3} fill="#334155" />
          <circle cx={cx + 3} cy={cy + 16} r={1.3} fill="#94a3b8" />
        </g>
      ) : id === "plc-compact" ? (
        <g>
          {/* Top & Bottom Hinged Terminal Covers */}
          <rect x={x + 2} y={y + 2} width={w - 4} height={12} rx={0.6} fill="#334155" />
          <rect x={x + 2} y={y + h - 14} width={w - 4} height={12} rx={0.6} fill="#334155" />
          {/* Main S7-1200 Style Stepped Faceplate */}
          <rect x={x + 3.5} y={y + 17} width={w - 7} height={h - 34} rx={1.2} fill="#f1f5f9" stroke="#334155" strokeWidth={0.65} />
          {/* Status LED Strip (RUN/STOP, ERROR, MAINT, DI/DO) */}
          <rect x={x + 7} y={y + 21} width={w - 14} height={11} rx={0.8} fill="#1e293b" />
          {Array.from({ length: 10 }).map((_, i) => (
            <rect
              key={`pled-${i}`}
              x={x + 11 + i * 8.6}
              y={y + 24.5}
              width={4.2}
              height={4}
              rx={0.5}
              fill={i < 2 ? "#f8fafc" : "#64748b"}
            />
          ))}
          {/* Center Signal Board Slot */}
          <rect x={cx - 18} y={cy - 6} width={36} height={24} rx={1} fill="#e2e8f0" stroke="#64748b" strokeWidth={0.55} />
          {/* Left Mode Indicator & Right Profinet RJ45 Port */}
          <rect x={x + 9} y={cy - 3} width={14} height={18} rx={0.8} fill="#cbd5e1" stroke="#475569" strokeWidth={0.5} />
          <rect x={x + w - 25} y={cy - 3} width={16} height={18} rx={0.8} fill="#0f172a" stroke="#475569" strokeWidth={0.6} />
          <rect x={x + w - 21} y={cy + 1} width={8} height={10} rx={0.5} fill="#334155" />
        </g>
      ) : id === "vfd-15kw" ? (
        <g>
          {/* Top & Bottom Heatsink Fin Grid */}
          {Array.from({ length: 11 }).map((_, i) => {
            const fx = x + 6 + i * ((w - 12) / 10);
            return (
              <g key={`vfin-${i}`} stroke="#94a3b8" strokeWidth={0.65}>
                <line x1={fx} y1={y + 2.5} x2={fx} y2={y + 13} />
                <line x1={fx} y1={y + h - 13} x2={fx} y2={y + h - 2.5} />
              </g>
            );
          })}
          {/* Operator Keypad Panel */}
          <rect x={x + 8} y={y + 18} width={w - 16} height={60} rx={1.8} fill="#1e293b" stroke="#0f172a" strokeWidth={0.75} />
          {/* 7-Segment Display Window */}
          <rect x={x + 15} y={y + 24} width={w - 30} height={18} rx={1} fill="#0f172a" stroke="#64748b" strokeWidth={0.6} />
          <line x1={x + 24} y1={y + 33} x2={x + w - 24} y2={y + 33} stroke="#cbd5e1" strokeWidth={1.6} strokeDasharray="6,3" />
          {/* Jog Dial + RUN / STOP Tactile Keys */}
          <circle cx={cx - 18} cy={y + 58} r={9} fill="#334155" stroke="#94a3b8" strokeWidth={0.7} />
          <line x1={cx - 18} y1={y + 58} x2={cx - 13} y2={y + 52} stroke="#f8fafc" strokeWidth={1.1} strokeLinecap="round" />
          <rect x={cx + 3} y={y + 51} width={14} height={13} rx={1.4} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={0.5} />
          <rect x={cx + 21} y={y + 51} width={14} height={13} rx={1.4} fill="#475569" stroke="#94a3b8" strokeWidth={0.5} />
          {/* Lower Cooling Louvers */}
          {Array.from({ length: 4 }).map((_, i) => (
            <rect
              key={`vl-${i}`}
              x={x + 12}
              y={y + 88 + i * 9}
              width={w - 24}
              height={4.2}
              rx={0.8}
              fill="#cbd5e1"
              stroke="#64748b"
              strokeWidth={0.45}
            />
          ))}
        </g>
      ) : id === "psu-24v" || id === "psu-24v-10a" ? (
        <g>
          {/* Top DC Output & Bottom AC Input Terminal Blocks */}
          <rect x={x + 1.5} y={y + 2} width={w - 3} height={15} rx={0.6} fill="#e2e8f0" stroke={strokeLight} strokeWidth={0.45} />
          <rect x={x + 1.5} y={y + h - 17} width={w - 3} height={15} rx={0.6} fill="#e2e8f0" stroke={strokeLight} strokeWidth={0.45} />
          {/* Metallic Vent Louver Grille (Mean Well NDR style) */}
          <rect x={x + 4} y={y + 21} width={w - 8} height={h - 46} rx={1} fill="#f1f5f9" stroke="#64748b" strokeWidth={0.55} />
          {Array.from({ length: 7 }).map((_, row) => (
            <line
              key={`pvent-${row}`}
              x1={x + 7.5}
              y1={y + 28 + row * 9.5}
              x2={x + w - 7.5}
              y2={y + 28 + row * 9.5}
              stroke="#64748b"
              strokeWidth={1.1}
              strokeDasharray="3.5,2"
            />
          ))}
          {/* DC-OK LED & V-ADJ Trimmer */}
          <circle cx={x + 9} cy={y + h - 21} r={1.8} fill="#334155" />
          <circle cx={x + w - 9} cy={y + h - 21} r={2.8} fill="#ffffff" stroke="#334155" strokeWidth={0.55} />
          <line x1={x + w - 10.8} y1={y + h - 21} x2={x + w - 7.2} y2={y + h - 21} stroke="#0f172a" strokeWidth={0.65} />
        </g>
      ) : id === "dist-block-4p" ? (
        <g>
          {/* Transparent Hinged Cover Frame */}
          <rect x={x + 4} y={y + 16} width={w - 8} height={h - 32} rx={1.2} fill="#f1f5f9" stroke="#475569" strokeWidth={0.6} />
          {/* 4 Parallel Busbars with Screw Holes */}
          {[0, 1, 2, 3].map((bar) => {
            const by = y + 21 + bar * 12;
            return (
              <g key={`dbar-${bar}`}>
                <rect x={x + 7} y={by} width={w - 14} height={6.5} rx={0.8} fill="#cbd5e1" stroke="#334155" strokeWidth={0.5} />
                {[0.2, 0.35, 0.5, 0.65, 0.8].map((rxPos, si) => (
                  <circle
                    key={`ds-${si}`}
                    cx={x + w * rxPos}
                    cy={by + 3.25}
                    r={1.45}
                    fill="#ffffff"
                    stroke="#334155"
                    strokeWidth={0.4}
                  />
                ))}
              </g>
            );
          })}
        </g>
      ) : id === "terminal-block" || id === "terminal-n" || id === "terminal-pe" || id === "end-clamp" ? (
        <g>
          {/* Subtle Monochrome Differentiation per Terminal Type */}
          {id === "terminal-pe" && (
            <g stroke="#64748b" strokeWidth={0.45} opacity={0.7}>
              <line x1={x + 0.6} y1={y + 10} x2={x + w - 0.6} y2={y + 14} />
              <line x1={x + 0.6} y1={y + 16} x2={x + w - 0.6} y2={y + 20} />
              <line x1={x + 0.6} y1={y + h - 20} x2={x + w - 0.6} y2={y + h - 16} />
              <line x1={x + 0.6} y1={y + h - 14} x2={x + w - 0.6} y2={y + h - 10} />
            </g>
          )}
          {id === "terminal-n" && (
            <rect x={x + 0.8} y={y + 1} width={w - 1.6} height={3.5} fill="#475569" />
          )}
          {/* Center Jumper Bridge & Marker Channel */}
          <rect
            x={x + 0.9}
            y={cy - 5.5}
            width={w - 1.8}
            height={11}
            rx={0.5}
            fill={id === "end-clamp" ? "#cbd5e1" : "#ffffff"}
            stroke="#334155"
            strokeWidth={0.45}
          />
          <circle cx={cx} cy={cy} r={Math.min(1.5, w * 0.24)} fill="#334155" />
          {id === "end-clamp" && (
            <rect x={cx - 1.8} y={cy - 13} width={3.6} height={26} rx={0.6} fill="#475569" stroke="#1e293b" strokeWidth={0.4} />
          )}
        </g>
      ) : id === "pilot-lamp-red" || id === "pilot-lamp-green" || id === "pilot-lamp-yellow" ? (
        <g>
          {/* Outer Metallic Bezel */}
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.48} fill="#e2e8f0" stroke={strokeMain} strokeWidth={0.85} />
          {/* Inner Fresnel Lens Ring */}
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.36} fill="#ffffff" stroke="#334155" strokeWidth={0.65} />
          {/* IEC Lamp Cross Symbol */}
          <line x1={cx - 6} y1={cy - 6} x2={cx + 6} y2={cy + 6} stroke="#475569" strokeWidth={0.65} />
          <line x1={cx + 6} y1={cy - 6} x2={cx - 6} y2={cy + 6} stroke="#475569" strokeWidth={0.65} />
          {/* Clean Monochrome Color Code Letter (R / G / Y) */}
          <circle cx={cx} cy={cy} r={4.2} fill="#f8fafc" stroke="#334155" strokeWidth={0.45} />
          <text
            x={cx}
            y={cy + 0.3}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={4.8}
            fontFamily="system-ui, sans-serif"
            fontWeight={700}
            fill="#0f172a"
            className="pointer-events-none select-none"
          >
            {id === "pilot-lamp-red" ? "R" : id === "pilot-lamp-green" ? "G" : "Y"}
          </text>
        </g>
      ) : id === "push-button" ? (
        <g>
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.48} fill="#cbd5e1" stroke={strokeMain} strokeWidth={0.85} />
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.36} fill="#f8fafc" stroke="#1e293b" strokeWidth={0.7} />
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.24} fill="none" stroke="#64748b" strokeWidth={0.55} />
        </g>
      ) : id === "e-stop" ? (
        <g>
          {/* Outer Safety Legend Collar */}
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.48} fill="#e2e8f0" stroke={strokeMain} strokeWidth={0.9} />
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.41} fill="none" stroke="#334155" strokeWidth={0.45} strokeDasharray="2.5,1.5" />
          {/* Mushroom Cap */}
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.33} fill="#1e293b" stroke="#0f172a" strokeWidth={0.8} />
          {/* Twist-to-Release Arrows */}
          <path d={`M ${cx - 6} ${cy - 3.5} A 7 7 0 0 1 ${cx + 6} ${cy - 3.5}`} fill="none" stroke="#f8fafc" strokeWidth={0.95} strokeLinecap="round" />
          <path d={`M ${cx + 6} ${cy + 3.5} A 7 7 0 0 1 ${cx - 6} ${cy + 3.5}`} fill="none" stroke="#f8fafc" strokeWidth={0.95} strokeLinecap="round" />
        </g>
      ) : id === "selector-3pos" ? (
        <g>
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.48} fill="#cbd5e1" stroke={strokeMain} strokeWidth={0.85} />
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.36} fill="#334155" stroke="#0f172a" strokeWidth={0.6} />
          {/* 3-Position Tick Marks */}
          {[-45, 0, 45].map((ang) => (
            <line
              key={`tick-${ang}`}
              x1={cx}
              y1={cy - Math.min(w, h) * 0.46}
              x2={cx}
              y2={cy - Math.min(w, h) * 0.38}
              stroke="#0f172a"
              strokeWidth={0.7}
              transform={`rotate(${ang} ${cx} ${cy})`}
            />
          ))}
          {/* Selector Wing Lever */}
          <rect
            x={cx - 2.4}
            y={cy - Math.min(w, h) * 0.34}
            width={4.8}
            height={Math.min(w, h) * 0.68}
            rx={1.2}
            fill="#f8fafc"
            stroke="#0f172a"
            strokeWidth={0.65}
            transform={`rotate(25 ${cx} ${cy})`}
          />
          <line
            x1={cx}
            y1={cy - Math.min(w, h) * 0.3}
            x2={cx}
            y2={cy - 2}
            stroke="#0f172a"
            strokeWidth={0.9}
            transform={`rotate(25 ${cx} ${cy})`}
          />
        </g>
      ) : id === "cam-lock" ? (
        <g>
          <circle cx={cx} cy={cy} r={14.5} fill="#e2e8f0" stroke={strokeMain} strokeWidth={0.85} />
          <circle cx={cx} cy={cy} r={10} fill="#cbd5e1" stroke="#334155" strokeWidth={0.65} />
          {/* Double-Bit Key Slot */}
          <rect x={cx - 1.6} y={cy - 6} width={3.2} height={12} rx={0.7} fill="#0f172a" />
          <circle cx={cx} cy={cy} r={2.6} fill="#0f172a" />
        </g>
      ) : id === "panel-meter-96" ? (
        <g>
          <rect x={x + 4} y={y + 4} width={w - 8} height={h - 8} rx={2} fill="#1e293b" stroke="#0f172a" strokeWidth={0.75} />
          {/* Recessed Digital Screen */}
          <rect x={x + 11} y={y + 13} width={w - 22} height={46} rx={1.5} fill="#0f172a" stroke="#64748b" strokeWidth={0.7} />
          {/* Clean Monochrome Readout Bars */}
          <line x1={x + 18} y1={y + 25} x2={x + w - 18} y2={y + 25} stroke="#e2e8f0" strokeWidth={2.2} strokeDasharray="10,4" />
          <line x1={x + 18} y1={y + 37} x2={x + w - 18} y2={y + 37} stroke="#cbd5e1" strokeWidth={2.2} strokeDasharray="10,4" />
          <line x1={x + 18} y1={y + 49} x2={x + w - 18} y2={y + 49} stroke="#94a3b8" strokeWidth={2.2} strokeDasharray="10,4" />
          {/* 4 Tactile Navigation Keys */}
          {[0, 1, 2, 3].map((b) => (
            <rect
              key={`mb-${b}`}
              x={x + 15 + b * 17.5}
              y={y + h - 22}
              width={12}
              height={8}
              rx={1}
              fill="#cbd5e1"
              stroke="#475569"
              strokeWidth={0.5}
            />
          ))}
        </g>
      ) : id === "cooling-fan-120" ? (
        <g>
          {/* 4 Corner Mounting Holes (104.8mm pitch) */}
          {[
            [x + 8, y + 8],
            [x + w - 8, y + 8],
            [x + 8, y + h - 8],
            [x + w - 8, y + h - 8],
          ].map(([hx, hy], idx) => (
            <circle key={`fh-${idx}`} cx={hx} cy={hy} r={2.6} fill="#ffffff" stroke="#0f172a" strokeWidth={0.7} />
          ))}
          {/* Outer Circular Shroud */}
          <circle cx={cx} cy={cy} r={w * 0.42} fill="#e2e8f0" stroke="#334155" strokeWidth={0.9} />
          <circle cx={cx} cy={cy} r={w * 0.37} fill="#f8fafc" stroke="#64748b" strokeWidth={0.5} />
          {/* 7 Clean Impeller Blades */}
          {Array.from({ length: 7 }).map((_, i) => (
            <path
              key={`blade-${i}`}
              d={`M ${cx} ${cy} Q ${cx + 16} ${cy - 16} ${cx + w * 0.34} ${cy - 4} L ${cx + w * 0.32} ${cy + 8} Q ${cx + 13} ${cy + 2} ${cx} ${cy} Z`}
              fill="#94a3b8"
              stroke="#334155"
              strokeWidth={0.5}
              transform={`rotate(${(i * 360) / 7} ${cx} ${cy})`}
            />
          ))}
          {/* Center Hub */}
          <circle cx={cx} cy={cy} r={12} fill="#334155" stroke="#0f172a" strokeWidth={0.7} />
          <circle cx={cx} cy={cy} r={5} fill="#cbd5e1" />
        </g>
      ) : null}

      {/* Screw Terminals aligned to Pins */}
      {renderScrewTerminals(comp, x, y)}
    </g>
  );
}
