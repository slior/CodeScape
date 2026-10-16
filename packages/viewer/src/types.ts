import type { Edge, Node } from "@sw3d/model";
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";

/** World units per second while walking. */
export const WALK_SPEED = 8;
/** World units per second while Shift is held. */
export const FAST_SPEED = 24;
/** Camera height above the street, in world units. */
export const EYE_HEIGHT = 4;
/** Vertical field of view for the street camera, in degrees. */
export const CAMERA_FOV_DEGREES = 70;
/** Placeholder aspect ratio replaced on the first resize. */
export const INITIAL_CAMERA_ASPECT = 1;
/** Near clipping plane for the street camera. */
export const CAMERA_NEAR = 0.1;
/** Far clipping plane for the street camera. */
export const CAMERA_FAR = 2000;
/** Euler order so yaw and pitch stay independent while looking around. */
export const CAMERA_ROTATION_ORDER = "YXZ";
/** Yaw applied when the camera is placed back on a street. */
export const STREET_YAW = Math.PI;
/** Gap below a right angle so pitch never looks straight up or down. */
export const PITCH_LIMIT_MARGIN = 0.05;
/** Radians of look change per pixel of pointer-lock movement. */
export const LOOK_RADIANS_PER_PIXEL = 0.002;
/** Longest simulation step, in seconds, so a stalled frame cannot teleport the camera. */
export const MAX_FRAME_SECONDS = 0.05;
/** Duration of the courtyard enter and leave camera glide, in milliseconds. */
export const EASE_DURATION_MS = 400;
/** Smallest courtyard span used when raising the overhead camera. */
export const OVERHEAD_MIN_SPAN = 8;
/** Extra height above the courtyard span for the overhead camera. */
export const OVERHEAD_CLEARANCE = 20;
/** Pitch that looks straight down from the overhead camera. */
export const OVERHEAD_PITCH = -Math.PI / 2;
/** Base width of a dependency edge before its weight is applied. */
export const EDGE_WIDTH_BASE = 0.35;
/** Extra edge width added for each unit of edge weight. */
export const EDGE_WIDTH_PER_WEIGHT = 0.2;
/** Vertical thickness of a dependency-edge segment. */
export const EDGE_THICKNESS = 0.12;
/** Width and depth of one walkable street cell, in world units. */
export const CELL_SIZE = 2;
/** Distance from a street cell's minimum corner to its center. */
export const CELL_CENTER_OFFSET = CELL_SIZE / 2;
/** Separator between x and z in a walkable-cell key. */
export const CELL_KEY_SEPARATOR = ",";
/** World document version this viewer can load. */
export const WORLD_VERSION = 1;

/** Fetched at startup; also named in the load-failure message. */
export const WORLD_URL = "./world.json";

/** CSS selectors for the viewer shell. */
export const VIEW_ELEMENT = {
  VERSION_MESSAGE: "#version-message",
  CANVAS: "#view",
  PANEL: "#panel",
  PANEL_NAME: "#panel-name",
  PANEL_KIND: "#panel-kind",
  PANEL_PATH: "#panel-path",
  PANEL_DEPENDS: "#panel-depends",
  PANEL_USED: "#panel-used",
  BREADCRUMB: "#breadcrumb",
} as const;

/** Keyboard keys that move the camera along the street. */
export const MOVE_KEY = {
  FORWARD: "w",
  LEFT: "a",
  BACK: "s",
  RIGHT: "d",
  SPRINT: "Shift",
} as const;

/** Keyboard keys that change the courtyard or camera mode. */
export const ACTION_KEY = {
  OVERHEAD: "v",
  ENTER: "Enter",
  LEAVE: "Escape",
} as const;

/** Edge endpoint named by a dependency-list row. */
export const EDGE_END = {
  TO: "to",
  FROM: "from",
} as const;

/** Which endpoint of an edge a list row names. */
export type EdgeEnd = (typeof EDGE_END)[keyof typeof EDGE_END];

/** Node kind strings stored on a world document. */
export const NODE_KIND = {
  CITY: "city",
  DISTRICT: "district",
  BUILDING: "building",
  BOX: "box",
  PORTAL: "portal",
} as const satisfies Record<string, Node["kind"]>;

/** Node kinds this viewer reads from a world document. */
export type NodeKind = (typeof NODE_KIND)[keyof typeof NODE_KIND];

/** Edge kind strings stored on a world document. */
export const EDGE_KIND = {
  ROAD: "road",
  PORTAL: "portal",
} as const satisfies Record<string, Edge["kind"]>;

/** Edge kinds this viewer reads from a world document. */
export type EdgeKind = (typeof EDGE_KIND)[keyof typeof EDGE_KIND];

/** Node kinds drawn as courtyard footprints. The city itself is the ground, not a footprint. */
export type FootprintKind = Exclude<NodeKind, typeof NODE_KIND.CITY>;

/** Scene background color. */
export const BACKGROUND_COLOR = 0x111111;
/** Shared color for the ambient and directional lights. */
export const LIGHT_COLOR = 0xffffff;
/** Intensity of the scene's ambient light. */
export const AMBIENT_INTENSITY = 0.65;
/** Intensity of the directional sun light. */
export const SUN_INTENSITY = 0.8;
/** Directional light position in world units. */
export const SUN_POSITION = { x: 20, y: 40, z: 10 } as const;

/** Hex colors for dependency edges drawn on the ground. */
export const EDGE_COLOR = {
  PORTAL: 0x9c36b5,
  ROAD: 0xfab005,
} as const;

/** Hex colors for courtyard footprints, keyed by node kind. */
export const FOOTPRINT_COLOR: Record<FootprintKind, number> = {
  [NODE_KIND.DISTRICT]: 0x4c6ef5,
  [NODE_KIND.BUILDING]: 0xf59f00,
  [NODE_KIND.BOX]: 0x868e96,
  [NODE_KIND.PORTAL]: 0xae3ec9,
};

/** A position on the ground plane. */
export interface XzPoint {
  x: number;
  z: number;
}

/** A position in the viewer, including height. */
export interface XyzPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Which street-movement keys are held.
 * Each property name is the corresponding `MOVE_KEY` letter.
 */
export interface MoveKeys {
  [MOVE_KEY.FORWARD]: boolean;
  [MOVE_KEY.LEFT]: boolean;
  [MOVE_KEY.BACK]: boolean;
  [MOVE_KEY.RIGHT]: boolean;
}

/** Keyboard state for street movement, including sprint. */
export interface Keys extends MoveKeys {
  /** True while the sprint key is held. */
  shift: boolean;
}

/** DOM nodes the street view reads and updates. */
export interface ViewerShell {
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
  panelName: HTMLHeadingElement;
  panelKind: HTMLSpanElement;
  panelPath: HTMLSpanElement;
  panelDepends: HTMLUListElement;
  panelUsed: HTMLUListElement;
  crumb: HTMLElement;
}

/** Three.js objects that render one street view. */
export interface StreetStage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
}
