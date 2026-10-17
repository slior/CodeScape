import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { removeDrawnMeshes } from "./main.js";

describe("removeDrawnMeshes", () => {
  it("disposes a sign sprite's texture and material when the courtyard is cleared", () => {
    const scene = new THREE.Scene();
    const light = new THREE.AmbientLight();
    scene.add(light);
    const texture = new THREE.CanvasTexture(undefined as unknown as HTMLCanvasElement);
    const material = new THREE.SpriteMaterial({ map: texture });
    const mapDispose = vi.spyOn(texture, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    scene.add(new THREE.Sprite(material));

    removeDrawnMeshes(scene);

    expect(mapDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(scene.children).toEqual([light]);
  });
});
