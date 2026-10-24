import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { hitId, removeDrawnMeshes, setSignVisibility } from "./main.js";
import { SIGN_ROLE } from "./types.js";

function intersection(object: THREE.Object3D): THREE.Intersection {
  return { object } as THREE.Intersection;
}

describe("hitId", () => {
  it("skips a hidden object and returns the next visible id", () => {
    const hidden = new THREE.Mesh();
    hidden.visible = false;
    hidden.userData = { id: "roof" };
    const visible = new THREE.Mesh();
    visible.userData = { id: "wall" };
    expect(hitId([intersection(hidden), intersection(visible)])).toBe("wall");
  });

  it("returns null when every hit is hidden", () => {
    const hidden = new THREE.Mesh();
    hidden.visible = false;
    hidden.userData = { id: "roof" };
    expect(hitId([intersection(hidden)])).toBeNull();
  });
});

describe("setSignVisibility", () => {
  it("shows wall plaques on the street and the roof plaque overhead", () => {
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh();
    wall.userData = { role: SIGN_ROLE.WALL };
    wall.visible = true;
    const roof = new THREE.Sprite();
    roof.userData = { role: SIGN_ROLE.ROOF };
    roof.visible = false;
    scene.add(wall, roof);

    setSignVisibility(scene, true);
    expect(wall.visible).toBe(false);
    expect(roof.visible).toBe(true);

    setSignVisibility(scene, false);
    expect(wall.visible).toBe(true);
    expect(roof.visible).toBe(false);
  });
});

describe("removeDrawnMeshes", () => {
  it("disposes the shared sign texture once and keeps the sprite geometry", () => {
    const scene = new THREE.Scene();
    const light = new THREE.AmbientLight();
    scene.add(light);
    const texture = new THREE.CanvasTexture(undefined as unknown as HTMLCanvasElement);
    const mapDispose = vi.spyOn(texture, "dispose");
    const wallGeometryDisposes: ReturnType<typeof vi.spyOn>[] = [];
    const wallMaterialDisposes: ReturnType<typeof vi.spyOn>[] = [];
    for (let index = 0; index < 4; index += 1) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      wallGeometryDisposes.push(vi.spyOn(geometry, "dispose"));
      wallMaterialDisposes.push(vi.spyOn(material, "dispose"));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { id: "core", role: SIGN_ROLE.WALL };
      scene.add(mesh);
    }
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const spriteMaterialDispose = vi.spyOn(spriteMaterial, "dispose");
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.userData = { id: "core", role: SIGN_ROLE.ROOF };
    const spriteGeometryDispose = vi.spyOn(sprite.geometry, "dispose");
    scene.add(sprite);

    removeDrawnMeshes(scene);

    expect(mapDispose).toHaveBeenCalledTimes(1);
    expect(wallMaterialDisposes.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(wallGeometryDisposes.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(spriteMaterialDispose).toHaveBeenCalledTimes(1);
    expect(spriteGeometryDispose).not.toHaveBeenCalled();
    expect(scene.children).toEqual([light]);
  });
});
