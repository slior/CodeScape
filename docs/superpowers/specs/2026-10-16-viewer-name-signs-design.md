# Viewer name signs

A courtyard block shows its name on a sign while you walk and from overhead. The sign faces the camera and gets smaller as it gets farther away. This change stays in `@sw3d/viewer`. `Node.name` already exists on every node, including districts, and this feature does not change the world document.

This document is the design contract. It is not the implementation plan.

## Success criterion

In a loaded world, every district, building, box, and portal drawn in the current courtyard has a readable name floating just above it. The name is that node's `name`. Entering a courtyard replaces those signs with the names of the blocks in the courtyard you entered. A nearer block hides a sign behind it. Clicking a sign selects that block. Overhead view shows the same signs, turned to face the downward camera.

## What gets a sign

`createSceneGraph` already limits drawing to the direct children of the current courtyard. A sign is emitted for each of those children whose kind is `district`, `building`, `box`, or `portal`. The city node is the ground and gets no sign. A child whose `name` is empty after trimming gets no sign.

The sign text is `node.name` for every kind, including a district folder name and a portal's external package specifier. Nested names stay out of the current courtyard: the `Prompt` box inside `agents` appears only after you enter `agents`.

## Sign placement

Each sign record carries the node id, the text, and the center of the roof:

- `x` is `pose.x + pose.width / 2`
- `y` is `pose.height`, the roof
- `z` is `pose.z + pose.depth / 2`

The sprite's center sits above that roof point. Its world height is `SIGN_HEIGHT`. A gap of `SIGN_GAP` separates the roof from the bottom of the sprite, so the sprite center is `y + SIGN_GAP + SIGN_HEIGHT / 2`. `main.ts` measures the text on the canvas and uses that same aspect ratio for the sprite, including the clear space around the glyphs. The world width is at least `SIGN_HEIGHT`, so a short name stays a plaque. The sprite is not scaled by distance in code. The perspective camera makes a farther sign smaller, on the street and from overhead.

The plaque is opaque. Depth testing and depth writing stay on, so a nearer block or sign hides one behind it.

## Modules

`helpers.ts` does not change.

`types.ts` holds the shared numbers and colors:

| Constant | Value | Role |
| --- | --- | --- |
| `SIGN_HEIGHT` | `1.2` | Sprite height in world units. |
| `SIGN_GAP` | `0.3` | Space between the roof and the bottom of the sprite. |
| `SIGN_PLAQUE` | `#0e1116` | Canvas plaque fill. |
| `SIGN_TEXT` | `#f4f6f8` | Canvas glyph color. |

`scene.ts` stays free of Three.js. `SceneGraph.labels` is replaced by `signs`. A sign is the only name record the graph emits.

```ts
interface NameSign {
  id: string;
  text: string;
  x: number;
  y: number;
  z: number;
}

interface SceneGraph {
  parentId: string;
  footprints: FootprintMesh[];
  edges: EdgeMesh[];
  signs: NameSign[];
}
```

`main.ts` draws one `THREE.Sprite` per sign inside `rebuild`, beside the footprints. The sprite stores the node id on `userData`, so the existing click raycast selects it. `removeDrawnMeshes` already drops every non-light object when the courtyard changes. When it removes a sprite, it disposes that sprite's material and the material's map.

`docs/viewer-design.md` is updated in the same change so it describes signs as drawn data, with `NameSign` in place of the undrawn label list.

## Testing

`scene.spec.ts` covers the pure data, using the existing fixture:

- The city courtyard signs `core` at roof center `(9, 8, 9)` and `lodash` at `(20, 8, 30)`. It does not sign `agents` or `Prompt`. Each triple is `(x, roof y, z)` from the existing fixture poses.
- The `core` courtyard signs `agents` at `(11, 8, 11)` only.
- The `agents` courtyard signs `Prompt` at `(13, 8, 13)` only.
- A child whose name is `""` or `"   "` produces no sign.

Those tests do not start a renderer. Facing the camera, shrinking with distance, overhead reading, occlusion, and click-to-select are checked in the browser against a served snapshot.

## Out of scope

No change to `@sw3d/model`, `@sw3d/compose`, `@sw3d/layout`, or `@sw3d/analyze`. No second drawing for overhead. No distance cutoff that hides a sign while its block is still in view. No truncation of a long name: the plaque grows wider.
