import * as THREE from "three";
import type { Edge, Node, World } from "@sw3d/model";
import {
  breadcrumb,
  enterTarget,
  incidentEdges,
  resolveWalk,
  startLoadedWorld,
  walkDirection,
} from "./helpers.js";
import {
  createSceneGraph,
  outsideChildSpot,
  southRimStart,
  walkableCellKeys,
  type EdgeMesh,
  type FootprintMesh,
} from "./scene.js";
import {
  ACTION_KEY,
  AMBIENT_INTENSITY,
  BACKGROUND_COLOR,
  CAMERA_FAR,
  CAMERA_FOV_DEGREES,
  CAMERA_NEAR,
  CAMERA_ROTATION_ORDER,
  EASE_DURATION_MS,
  EDGE_COLOR,
  EDGE_END,
  EDGE_KIND,
  EDGE_THICKNESS,
  EDGE_WIDTH_BASE,
  EDGE_WIDTH_PER_WEIGHT,
  EYE_HEIGHT,
  FAST_SPEED,
  FOOTPRINT_COLOR,
  INITIAL_CAMERA_ASPECT,
  LIGHT_COLOR,
  LOOK_RADIANS_PER_PIXEL,
  MAX_FRAME_SECONDS,
  MOVE_KEY,
  NODE_KIND,
  OVERHEAD_CLEARANCE,
  OVERHEAD_MIN_SPAN,
  OVERHEAD_PITCH,
  PITCH_LIMIT_MARGIN,
  STREET_YAW,
  SUN_INTENSITY,
  SUN_POSITION,
  VIEW_ELEMENT,
  WALK_SPEED,
  WORLD_URL,
  type EdgeEnd,
  type Keys,
  type StreetStage,
  type ViewerShell,
  type XyzPoint,
  type XzPoint,
} from "./types.js";

function mustElement<T extends Element>(selector: string, ctor: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof ctor)) throw new Error(`missing ${selector}`);
  return element;
}

function readViewerShell(): ViewerShell {
  return {
    canvas: mustElement(VIEW_ELEMENT.CANVAS, HTMLCanvasElement),
    panel: mustElement(VIEW_ELEMENT.PANEL, HTMLElement),
    panelName: mustElement(VIEW_ELEMENT.PANEL_NAME, HTMLHeadingElement),
    panelKind: mustElement(VIEW_ELEMENT.PANEL_KIND, HTMLSpanElement),
    panelPath: mustElement(VIEW_ELEMENT.PANEL_PATH, HTMLSpanElement),
    panelDepends: mustElement(VIEW_ELEMENT.PANEL_DEPENDS, HTMLUListElement),
    panelUsed: mustElement(VIEW_ELEMENT.PANEL_USED, HTMLUListElement),
    crumb: mustElement(VIEW_ELEMENT.BREADCRUMB, HTMLElement),
  };
}

function showVersionMessage(text: string): void {
  const message = mustElement(VIEW_ELEMENT.VERSION_MESSAGE, HTMLParagraphElement);
  const canvas = mustElement(VIEW_ELEMENT.CANVAS, HTMLCanvasElement);
  message.hidden = false;
  message.textContent = text;
  canvas.hidden = true;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findNode(world: World, id: string): Node | undefined {
  return world.nodes.find((node) => node.id === id);
}

function chainIds(world: World, id: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  let current = findNode(world, id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    ids.push(current.id);
    if (current.parentId === null) break;
    const next = current.parentId;
    current = findNode(world, next);
  }
  ids.reverse();
  return ids;
}

function endpointLabel(world: World, nodeId: string): string {
  const node = findNode(world, nodeId);
  if (!node) return nodeId;
  if (node.kind === NODE_KIND.PORTAL) return node.packageName ?? node.name;
  return node.name;
}

function fillEdgeList(list: HTMLUListElement, world: World, edges: readonly Edge[], end: EdgeEnd): void {
  list.replaceChildren();
  for (const edge of edges) {
    const item = document.createElement("li");
    const other = end === EDGE_END.TO ? edge.to : edge.from;
    item.textContent = `${endpointLabel(world, other)} (${edge.weight})`;
    list.append(item);
  }
}

function matchesLetter(key: string, letter: string): boolean {
  return key === letter || key === letter.toUpperCase();
}

function assignMovementKey(keys: Keys, key: string, pressed: boolean): void {
  if (matchesLetter(key, MOVE_KEY.FORWARD)) keys[MOVE_KEY.FORWARD] = pressed;
  if (matchesLetter(key, MOVE_KEY.LEFT)) keys[MOVE_KEY.LEFT] = pressed;
  if (matchesLetter(key, MOVE_KEY.BACK)) keys[MOVE_KEY.BACK] = pressed;
  if (matchesLetter(key, MOVE_KEY.RIGHT)) keys[MOVE_KEY.RIGHT] = pressed;
  if (key === MOVE_KEY.SPRINT) keys.shift = pressed;
}

function isMoving(keys: Keys): boolean {
  return keys[MOVE_KEY.FORWARD] || keys[MOVE_KEY.LEFT] || keys[MOVE_KEY.BACK] || keys[MOVE_KEY.RIGHT];
}

function clampPitch(pitch: number): number {
  const limit = Math.PI / 2 - PITCH_LIMIT_MARGIN;
  return Math.max(-limit, Math.min(limit, pitch));
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function setPointerFromClient(pointer: THREE.Vector2, rect: DOMRect, clientX: number, clientY: number): void {
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

function createStreetStage(canvas: HTMLCanvasElement): StreetStage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    INITIAL_CAMERA_ASPECT,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
  camera.rotation.order = CAMERA_ROTATION_ORDER;
  scene.add(new THREE.AmbientLight(LIGHT_COLOR, AMBIENT_INTENSITY));
  const sun = new THREE.DirectionalLight(LIGHT_COLOR, SUN_INTENSITY);
  sun.position.set(SUN_POSITION.x, SUN_POSITION.y, SUN_POSITION.z);
  scene.add(sun);
  return { renderer, scene, camera };
}

function removeDrawnMeshes(scene: THREE.Scene): void {
  for (let index = scene.children.length - 1; index >= 0; index -= 1) {
    const child = scene.children[index];
    if (!child || child instanceof THREE.Light) continue;
    scene.remove(child);
  }
}

function addFootprint(scene: THREE.Scene, foot: FootprintMesh): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(foot.width, foot.height, foot.depth);
  const material = new THREE.MeshStandardMaterial({ color: FOOTPRINT_COLOR[foot.kind] });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(foot.x + foot.width / 2, foot.height / 2, foot.z + foot.depth / 2);
  mesh.userData = { id: foot.id };
  scene.add(mesh);
  return mesh;
}

function addEdgeSegment(scene: THREE.Scene, start: XzPoint, end: XzPoint, width: number, color: number): void {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length === 0) return;
  const geometry = new THREE.BoxGeometry(width, EDGE_THICKNESS, length);
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set((start.x + end.x) / 2, EDGE_THICKNESS / 2, (start.z + end.z) / 2);
  mesh.rotation.y = Math.atan2(dx, dz);
  scene.add(mesh);
}

function addEdge(scene: THREE.Scene, edge: EdgeMesh): void {
  const width = EDGE_WIDTH_BASE + edge.weight * EDGE_WIDTH_PER_WEIGHT;
  const color = edge.kind === EDGE_KIND.PORTAL ? EDGE_COLOR.PORTAL : EDGE_COLOR.ROAD;
  for (let index = 1; index < edge.points.length; index += 1) {
    const start = edge.points[index - 1];
    const end = edge.points[index];
    if (!start || !end) continue;
    addEdgeSegment(scene, start, end, width, color);
  }
}

function hitId(intersections: readonly THREE.Intersection[]): string | null {
  for (const hit of intersections) {
    const data = hit.object.userData as { id?: string };
    if (typeof data.id === "string") return data.id;
  }
  return null;
}

function overheadEyeY(width: number, depth: number): number {
  return Math.max(width, depth, OVERHEAD_MIN_SPAN) + OVERHEAD_CLEARANCE;
}

function stepStreetMotion(
  camera: THREE.PerspectiveCamera,
  keys: Keys,
  walkable: ReadonlySet<string>,
  forward: THREE.Vector3,
  dt: number,
): void {
  camera.getWorldDirection(forward);
  const direction = walkDirection(forward, keys);
  if (!direction) return;
  const speed = (keys.shift ? FAST_SPEED : WALK_SPEED) * dt;
  const next = resolveWalk(
    { x: camera.position.x + direction.x * speed, z: camera.position.z + direction.z * speed },
    walkable,
  );
  camera.position.x = next.x;
  camera.position.z = next.z;
  camera.position.y = EYE_HEIGHT;
}

async function boot(): Promise<void> {
  let payload: unknown;
  try {
    const response = await fetch(WORLD_URL);
    if (!response.ok) {
      showVersionMessage(`Could not load ${WORLD_URL} (${response.status}).`);
      return;
    }
    payload = await response.json();
  } catch (error) {
    showVersionMessage(errorText(error));
    return;
  }
  startLoadedWorld(payload, start, showVersionMessage);
}

function start(world: World): void {
  const shell = readViewerShell();
  const city = world.nodes.find((node) => node.kind === NODE_KIND.CITY);
  if (!city) {
    showVersionMessage("world.json has no city.");
    return;
  }

  const { renderer, scene, camera } = createStreetStage(shell.canvas);

  let parentId = city.id;
  let selectedId: string | null = null;
  let walkable = walkableCellKeys(world, parentId);
  let overhead = false;
  let easing = false;
  let yaw = STREET_YAW;
  let pitch = 0;
  const saved = { x: 0, y: EYE_HEIGHT, z: 0, yaw, pitch };
  const keys: Keys = {
    [MOVE_KEY.FORWARD]: false,
    [MOVE_KEY.LEFT]: false,
    [MOVE_KEY.BACK]: false,
    [MOVE_KEY.RIGHT]: false,
    shift: false,
  };
  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0, 0);
  const forward = new THREE.Vector3();

  function applyLook(): void {
    pitch = clampPitch(pitch);
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }

  function placeStreet(spot: XyzPoint): void {
    overhead = false;
    camera.position.set(spot.x, spot.y, spot.z);
    yaw = STREET_YAW;
    pitch = 0;
    applyLook();
  }

  function rebuild(): void {
    removeDrawnMeshes(scene);
    const graph = createSceneGraph(world, parentId);
    for (const foot of graph.footprints) addFootprint(scene, foot);
    for (const edge of graph.edges) addEdge(scene, edge);
    walkable = walkableCellKeys(world, parentId);
    renderBreadcrumb();
    renderPanel();
  }

  function renderPanel(): void {
    const selected = selectedId ? findNode(world, selectedId) : undefined;
    if (!selected || selected.parentId !== parentId) {
      shell.panel.hidden = true;
      return;
    }
    shell.panel.hidden = false;
    shell.panelName.textContent = selected.name;
    shell.panelKind.textContent = selected.kind;
    shell.panelPath.textContent = selected.path;
    const lists = incidentEdges(world, selected.id);
    fillEdgeList(shell.panelDepends, world, lists.dependsOn, EDGE_END.TO);
    fillEdgeList(shell.panelUsed, world, lists.usedBy, EDGE_END.FROM);
  }

  function renderBreadcrumb(): void {
    shell.crumb.replaceChildren();
    const ids = chainIds(world, parentId);
    const names = breadcrumb(world, parentId);
    for (let index = 0; index < names.length; index += 1) {
      const id = ids[index];
      const label = names[index];
      if (id === undefined || label === undefined) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        if (id !== parentId) goToAncestor(id);
      });
      shell.crumb.append(button);
    }
  }

  function centerHit(): string | null {
    pointer.set(0, 0);
    raycaster.setFromCamera(pointer, camera);
    return hitId(raycaster.intersectObjects(scene.children, false));
  }

  function selectId(id: string | null): void {
    selectedId = id;
    renderPanel();
  }

  function easeTo(spot: XyzPoint, nextParent: string): void {
    if (easing) return;
    easing = true;
    overhead = false;
    const origin = camera.position.clone();
    const started = performance.now();
    const frame = (now: number): void => {
      const t = Math.min(1, (now - started) / EASE_DURATION_MS);
      const amount = smoothstep(t);
      camera.position.set(
        lerp(origin.x, spot.x, amount),
        lerp(origin.y, spot.y, amount),
        lerp(origin.z, spot.z, amount),
      );
      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }
      parentId = nextParent;
      selectedId = null;
      rebuild();
      placeStreet(spot);
      easing = false;
    };
    requestAnimationFrame(frame);
  }

  function enterHit(id: string | null): void {
    const next = enterTarget(world, parentId, id);
    if (!next) return;
    const spot = southRimStart(world, next);
    easeTo(spot, next);
  }

  function goToAncestor(ancestorId: string): void {
    const ids = chainIds(world, parentId);
    const ancestorIndex = ids.indexOf(ancestorId);
    if (ancestorIndex < 0 || ancestorIndex === ids.length - 1) return;
    const childJustLeft = ids[ancestorIndex + 1];
    if (!childJustLeft) return;
    const spot = outsideChildSpot(world, ancestorId, childJustLeft);
    easeTo(spot, ancestorId);
  }

  function leaveCourtyard(): void {
    const current = findNode(world, parentId);
    if (!current?.parentId) return;
    goToAncestor(current.parentId);
  }

  function toggleOverhead(): void {
    const parent = findNode(world, parentId);
    if (!parent) return;
    if (!overhead) {
      saved.x = camera.position.x;
      saved.y = camera.position.y;
      saved.z = camera.position.z;
      saved.yaw = yaw;
      saved.pitch = pitch;
      overhead = true;
      camera.position.set(
        parent.pose.x + parent.pose.width / 2,
        overheadEyeY(parent.pose.width, parent.pose.depth),
        parent.pose.z + parent.pose.depth / 2,
      );
      camera.rotation.order = CAMERA_ROTATION_ORDER;
      camera.rotation.x = OVERHEAD_PITCH;
      camera.rotation.y = 0;
      return;
    }
    overhead = false;
    camera.position.set(saved.x, saved.y, saved.z);
    yaw = saved.yaw;
    pitch = saved.pitch;
    applyLook();
  }

  function resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  placeStreet(southRimStart(world, parentId));
  rebuild();
  resize();

  window.addEventListener("resize", resize);
  shell.canvas.addEventListener("click", (event) => {
    const rect = shell.canvas.getBoundingClientRect();
    setPointerFromClient(pointer, rect, event.clientX, event.clientY);
    raycaster.setFromCamera(pointer, camera);
    selectId(hitId(raycaster.intersectObjects(scene.children, false)));
    if (document.pointerLockElement !== shell.canvas) shell.canvas.requestPointerLock();
  });
  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== shell.canvas || overhead || easing) return;
    yaw -= event.movementX * LOOK_RADIANS_PER_PIXEL;
    pitch -= event.movementY * LOOK_RADIANS_PER_PIXEL;
    applyLook();
  });
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    assignMovementKey(keys, event.key, true);
    if (matchesLetter(event.key, ACTION_KEY.OVERHEAD)) toggleOverhead();
    if (event.key === ACTION_KEY.ENTER) enterHit(centerHit());
    if (event.key === ACTION_KEY.LEAVE) leaveCourtyard();
  });
  window.addEventListener("keyup", (event) => {
    assignMovementKey(keys, event.key, false);
  });
  shell.canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (easing) return;
      if (event.deltaY < 0) enterHit(centerHit());
      else if (event.deltaY > 0) leaveCourtyard();
    },
    { passive: false },
  );

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), MAX_FRAME_SECONDS);
    if (!overhead && !easing && isMoving(keys)) {
      stepStreetMotion(camera, keys, walkable, forward, dt);
    }
    renderer.render(scene, camera);
  });
}

void boot();
