import * as THREE from "three";
import type { Edge, Node, World } from "@sw3d/model";
import {
  breadcrumb,
  enterTarget,
  incidentEdges,
  resolveWalk,
  startLoadedWorld,
} from "./helpers.js";
import {
  createSceneGraph,
  outsideChildSpot,
  southRimStart,
  walkableCellKeys,
  type EdgeMesh,
  type FootprintMesh,
} from "./scene.js";

const WALK_SPEED = 8;
const FAST_SPEED = 24;
const EYE_HEIGHT = 4;

interface Keys {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  shift: boolean;
}

function mustElement<T extends Element>(selector: string, ctor: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof ctor)) throw new Error(`missing ${selector}`);
  return element;
}

function showVersionMessage(text: string): void {
  const message = mustElement("#version-message", HTMLParagraphElement);
  const canvas = mustElement("#view", HTMLCanvasElement);
  message.hidden = false;
  message.textContent = text;
  canvas.hidden = true;
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
  if (node.kind === "portal") return node.packageName ?? node.name;
  return node.name;
}

function fillEdgeList(list: HTMLUListElement, world: World, edges: readonly Edge[], end: "to" | "from"): void {
  list.replaceChildren();
  for (const edge of edges) {
    const item = document.createElement("li");
    const other = end === "to" ? edge.to : edge.from;
    item.textContent = `${endpointLabel(world, other)} (${edge.weight})`;
    list.append(item);
  }
}

const FOOTPRINT_COLOR: Record<FootprintMesh["kind"], number> = {
  district: 0x4c6ef5,
  building: 0xf59f00,
  box: 0x868e96,
  portal: 0xae3ec9,
};

function addFootprint(scene: THREE.Scene, foot: FootprintMesh): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(foot.width, foot.height, foot.depth);
  const material = new THREE.MeshStandardMaterial({ color: FOOTPRINT_COLOR[foot.kind] });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(foot.x + foot.width / 2, foot.height / 2, foot.z + foot.depth / 2);
  mesh.userData = { id: foot.id };
  scene.add(mesh);
  return mesh;
}

function addEdge(scene: THREE.Scene, edge: EdgeMesh): void {
  const width = 0.35 + edge.weight * 0.2;
  const color = edge.kind === "portal" ? 0x9c36b5 : 0xfab005;
  for (let index = 1; index < edge.points.length; index += 1) {
    const start = edge.points[index - 1];
    const end = edge.points[index];
    if (!start || !end) continue;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length === 0) continue;
    const geometry = new THREE.BoxGeometry(width, 0.12, length);
    const material = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((start.x + end.x) / 2, 0.06, (start.z + end.z) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    scene.add(mesh);
  }
}

function hitId(intersections: readonly THREE.Intersection[]): string | null {
  for (const hit of intersections) {
    const data = hit.object.userData as { id?: string };
    if (typeof data.id === "string") return data.id;
  }
  return null;
}

async function boot(): Promise<void> {
  let payload: unknown;
  try {
    const response = await fetch("./world.json");
    if (!response.ok) {
      showVersionMessage(`Could not load ./world.json (${response.status}).`);
      return;
    }
    payload = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showVersionMessage(message);
    return;
  }
  startLoadedWorld(payload, start, showVersionMessage);
}

function start(world: World): void {
  const canvas = mustElement("#view", HTMLCanvasElement);
  const panel = mustElement("#panel", HTMLElement);
  const panelName = mustElement("#panel-name", HTMLHeadingElement);
  const panelKind = mustElement("#panel-kind", HTMLSpanElement);
  const panelPath = mustElement("#panel-path", HTMLSpanElement);
  const panelDepends = mustElement("#panel-depends", HTMLUListElement);
  const panelUsed = mustElement("#panel-used", HTMLUListElement);
  const crumb = mustElement("#breadcrumb", HTMLElement);
  const city = world.nodes.find((node) => node.kind === "city");
  if (!city) {
    showVersionMessage("world.json has no city.");
    return;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
  camera.rotation.order = "YXZ";
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(20, 40, 10);
  scene.add(sun);

  let parentId = city.id;
  let selectedId: string | null = null;
  let walkable = walkableCellKeys(world, parentId);
  let overhead = false;
  let easing = false;
  let yaw = Math.PI;
  let pitch = 0;
  const saved = { x: 0, y: EYE_HEIGHT, z: 0, yaw, pitch };
  const keys: Keys = { w: false, a: false, s: false, d: false, shift: false };
  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0, 0);
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  function applyLook(): void {
    const limit = Math.PI / 2 - 0.05;
    pitch = Math.max(-limit, Math.min(limit, pitch));
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }

  function placeStreet(spot: { x: number; y: number; z: number }): void {
    overhead = false;
    camera.position.set(spot.x, spot.y, spot.z);
    yaw = Math.PI;
    pitch = 0;
    applyLook();
  }

  function rebuild(): void {
    for (let index = scene.children.length - 1; index >= 0; index -= 1) {
      const child = scene.children[index];
      if (!child || child instanceof THREE.Light) continue;
      scene.remove(child);
    }
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
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    panelName.textContent = selected.name;
    panelKind.textContent = selected.kind;
    panelPath.textContent = selected.path;
    const lists = incidentEdges(world, selected.id);
    fillEdgeList(panelDepends, world, lists.dependsOn, "to");
    fillEdgeList(panelUsed, world, lists.usedBy, "from");
  }

  function renderBreadcrumb(): void {
    crumb.replaceChildren();
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
      crumb.append(button);
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

  function easeTo(spot: { x: number; y: number; z: number }, nextParent: string): void {
    if (easing) return;
    easing = true;
    overhead = false;
    const origin = camera.position.clone();
    const started = performance.now();
    const frame = (now: number): void => {
      const t = Math.min(1, (now - started) / 400);
      const k = t * t * (3 - 2 * t);
      camera.position.set(
        origin.x + (spot.x - origin.x) * k,
        origin.y + (spot.y - origin.y) * k,
        origin.z + (spot.z - origin.z) * k,
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
        Math.max(parent.pose.width, parent.pose.depth, 8) + 20,
        parent.pose.z + parent.pose.depth / 2,
      );
      camera.rotation.order = "YXZ";
      camera.rotation.x = -Math.PI / 2;
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
  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    selectId(hitId(raycaster.intersectObjects(scene.children, false)));
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });
  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas || overhead || easing) return;
    yaw -= event.movementX * 0.002;
    pitch -= event.movementY * 0.002;
    applyLook();
  });
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key === "w" || event.key === "W") keys.w = true;
    if (event.key === "a" || event.key === "A") keys.a = true;
    if (event.key === "s" || event.key === "S") keys.s = true;
    if (event.key === "d" || event.key === "D") keys.d = true;
    if (event.key === "Shift") keys.shift = true;
    if (event.key === "v" || event.key === "V") toggleOverhead();
    if (event.key === "Enter") enterHit(centerHit());
    if (event.key === "Escape") leaveCourtyard();
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "w" || event.key === "W") keys.w = false;
    if (event.key === "a" || event.key === "A") keys.a = false;
    if (event.key === "s" || event.key === "S") keys.s = false;
    if (event.key === "d" || event.key === "D") keys.d = false;
    if (event.key === "Shift") keys.shift = false;
  });
  canvas.addEventListener(
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
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!overhead && !easing && (keys.w || keys.a || keys.s || keys.d)) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
      forward.normalize();
      right.crossVectors(up, forward).normalize();
      let mx = 0;
      let mz = 0;
      if (keys.w) {
        mx += forward.x;
        mz += forward.z;
      }
      if (keys.s) {
        mx -= forward.x;
        mz -= forward.z;
      }
      if (keys.d) {
        mx += right.x;
        mz += right.z;
      }
      if (keys.a) {
        mx -= right.x;
        mz -= right.z;
      }
      const length = Math.hypot(mx, mz);
      if (length > 0) {
        const speed = (keys.shift ? FAST_SPEED : WALK_SPEED) * dt;
        const next = resolveWalk(
          { x: camera.position.x + (mx / length) * speed, z: camera.position.z + (mz / length) * speed },
          walkable,
        );
        camera.position.x = next.x;
        camera.position.z = next.z;
        camera.position.y = EYE_HEIGHT;
      }
    }
    renderer.render(scene, camera);
  });
}

void boot();
