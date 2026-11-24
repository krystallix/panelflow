export type LengthUnit = "mm" | "cm" | "m";
export type CadImportUnit = "mm" | "cm" | "m" | "inch";
export type GridSnapMm = 1 | 5 | 10 | 20 | 25;
export type DoorMode = "open" | "transparent" | "hidden";
export type RotationDeg = 0 | 90 | 180 | 270;

export type SheetType = "mounting-plate" | "door-cutout" | "schematic";
export type PlateMode = "auto" | "manual";

export interface PlateConfig {
  mode: PlateMode;
  manualWidthMm: number;
  manualHeightMm: number;
}

export interface EnclosureConfig {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  backplateInsetMm: number;
  backplateThicknessMm: number;
  wallThicknessMm: number;
  doorMode: DoorMode;
  doorHingeSide?: "left" | "right";
  doorThicknessMm?: number;
  plateMode?: PlateMode;
  manualPlateWidthMm?: number;
  manualPlateHeightMm?: number;
}

export interface DinRail {
  id: string;
  name: string;
  xMm: number;
  yMm: number;
  lengthMm: number;
  groupId?: string;
  groupName?: string;
  locked?: boolean;
}

export interface WireDuct {
  id: string;
  name: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  orientation: "horizontal" | "vertical";
  groupId?: string;
  groupName?: string;
  locked?: boolean;
}

export interface PinTerminal {
  id: string;
  label: string;
  localXMm: number;
  localYMm: number;
  localZMm: number;
}

export type ComponentCategory =
  | "Protection & Switchgear"
  | "Control & Automation"
  | "Power & Distribution"
  | "Terminals & DIN Accessories"
  | "Door & Panel Controls";

export type ComponentMountingType =
  | "din_rail"
  | "screw_plate"
  | "door_cutout"
  | "parent_mount";

export interface ComponentClearanceMm {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  reason?: "airflow" | "arc" | "bending";
}

export interface ComponentBehaviorSpec {
  sideBySideSnap?: boolean;
  mountTargetTemplateIds?: ComponentTemplateId[];
  clearanceMm?: ComponentClearanceMm;
  recommendedSheet?: "mounting-plate" | "door-cutout";
  cutoutSummary?: string;
}

export type ComponentTemplateId =
  | "mcb-1p"
  | "mcb-2p"
  | "mcb-3p"
  | "mcb-4p"
  | "mccb-100a"
  | "spd-3pn"
  | "fuse-1p"
  | "contactor"
  | "tor"
  | "contactor-st10"
  | "tor-tht18"
  | "relay-socket-my4n"
  | "relay-socket-mk3p"
  | "plc-compact"
  | "vfd-15kw"
  | "psu-24v"
  | "psu-24v-10a"
  | "dist-block-4p"
  | "terminal-block"
  | "terminal-n"
  | "terminal-pe"
  | "end-clamp"
  | "pilot-lamp-red"
  | "pilot-lamp-green"
  | "pilot-lamp-yellow"
  | "push-button"
  | "e-stop"
  | "selector-3pos"
  | "panel-meter-96"
  | "cooling-fan-120"
  | "cam-lock";

export interface ComponentTemplate {
  id: ComponentTemplateId;
  name: string;
  shortName: string;
  referenceModel: string;
  tagPrefix: string;
  category: ComponentCategory;
  mountingType: ComponentMountingType;
  behavior?: ComponentBehaviorSpec;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  color: string;
  accentColor: string;
  pins: Omit<PinTerminal, "id">[];
}

export interface PlacedComponent {
  id: string;
  templateId: ComponentTemplateId;
  name: string;
  mountingType?: ComponentMountingType;
  labelPosition?: CadLabelPosition;
  xMm: number;
  yMm: number;
  zMm: number;
  rotationDeg?: RotationDeg;
  railId: string | null;
  mountedToComponentId?: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  color: string;
  accentColor: string;
  pins: PinTerminal[];
  groupId?: string;
  groupName?: string;
  locked?: boolean;
}

export type CadFormat = "glb" | "gltf" | "obj" | "dxf";

export type MaterialType = "copper" | "aluminum" | "steel" | "insulator" | "custom";

export interface MaterialPreset {
  name: string;
  materialType: MaterialType;
  fillColor: string;
  borderColor: string;
  metalness: number;
  roughness: number;
}

export const MATERIAL_PRESETS: Record<MaterialType, MaterialPreset> = {
  copper: {
    name: "Copper Busbar",
    materialType: "copper",
    fillColor: "#d97706",
    borderColor: "#b45309",
    metalness: 0.85,
    roughness: 0.35,
  },
  aluminum: {
    name: "Aluminum",
    materialType: "aluminum",
    fillColor: "#cbd5e1",
    borderColor: "#94a3b8",
    metalness: 0.75,
    roughness: 0.4,
  },
  steel: {
    name: "Steel Plate",
    materialType: "steel",
    fillColor: "#64748b",
    borderColor: "#475569",
    metalness: 0.6,
    roughness: 0.5,
  },
  insulator: {
    name: "Red Insulator",
    materialType: "insulator",
    fillColor: "#7f1d1d",
    borderColor: "#dc2626",
    metalness: 0.1,
    roughness: 0.8,
  },
  custom: {
    name: "Black Plastic",
    materialType: "custom",
    fillColor: "#1e293b",
    borderColor: "#334155",
    metalness: 0.1,
    roughness: 0.85,
  },
};

export type DrawShapeMode = "rectangle" | "circle";

export interface CadCropMm {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export type CadLabelPosition = "auto" | "top" | "bottom" | "right" | "left";

export interface CustomCadAsset {
  id: string;
  name: string;
  fileName: string;
  format: CadFormat;
  sourceUnit: CadImportUnit;
  xMm: number;
  yMm: number;
  zMm: number;
  rotationDeg?: RotationDeg;
  boundingBoxMm: { w: number; h: number; d: number };
  cropMm?: CadCropMm;
  labelPosition?: CadLabelPosition;
  pins: PinTerminal[];
  objectUrl?: string;
  dataUrl?: string;
  rawText?: string;
  entityCount?: number;
  parseWarning?: string;
  imageOverlayUrl?: string;
  showImageOverlay?: boolean;
  imageOpacity?: number;
  lockAspectRatio?: boolean;
  materialType?: MaterialType;
  drawShape?: DrawShapeMode;
  groupId?: string;
  groupName?: string;
  locked?: boolean;
}

export type ViewportMode = "3d" | "2d";
export type ThemeMode = "dark" | "light";
export type CanvasTool2D = "select" | "wire" | "pan" | "measure" | "draw";
export type WireColorCode = "R" | "S" | "T" | "N" | "PE" | "DC+" | "DC-";

export interface WireConnection {
  id: string;
  label: string;
  colorCode: WireColorCode;
  gaugeMm2: string;
  fromComponentId: string;
  fromPinId: string;
  toComponentId: string;
  toPinId: string;
  toFreePoint?: { xMm: number; yMm: number };
  toFreeLabel?: string;
  waypoints?: Array<{ xMm: number; yMm: number }>;
}

export interface TitleBlockMeta {
  projectName: string;
  drawer: string;
  sheetNo: string;
  date: string;
  scale: string;
  rev: string;
}

export interface PanelSheet {
  id: string;
  name: string;
  sheetType: SheetType;
  enclosure: EnclosureConfig;
  plateConfig: PlateConfig;
  rails: DinRail[];
  ducts: WireDuct[];
  components: PlacedComponent[];
  cadAssets: CustomCadAsset[];
  wires: WireConnection[];
  titleBlock: TitleBlockMeta;
}

export type SelectedItem =
  | { kind: "rail"; id: string }
  | { kind: "duct"; id: string }
  | { kind: "component"; id: string }
  | { kind: "cad"; id: string }
  | { kind: "wire"; id: string };

export type SelectionTarget = SelectedItem | null;
export type SelectedTarget = SelectedItem;
