# sw3d

sw3d reads a source folder and writes a city you can walk in a browser. Packages are districts, folders are buildings, and classes or classless files are boxes. Roads point from the importer to the imported. External packages sit on the courtyard rim as portals.

Requires Node.js 18 or newer.

## Usage

Install dependencies, then build. The analyze build also builds the viewer, which `snapshot` copies into the output directory.

```bash
npm install
npx nx build analyze
node packages/analyze/dist/bin.js snapshot ~/dev/dialectic --out /tmp/sw3d-dialectic
node packages/analyze/dist/bin.js view /tmp/sw3d-dialectic
```

`view` prints a URL such as `http://127.0.0.1:54610/` and serves until you stop it with Ctrl-C. Open that URL in a browser.

`--out` must sit outside the folder you analyze. Publishing `assets/`, `index.html`, or `world.json` on top of that folder is refused.

`snapshot` accepts `--config <file>`, repeated `--ignore <glob>`, and `--open`. `--open` starts the viewer on the new snapshot, so you can skip the separate `view` command.

```
sw3d snapshot <folder> --out <dir> [--config <file>] [--ignore <glob>]... [--open]
sw3d view <dir>
```

### Controls

Click the view to capture the mouse. Move the mouse to look. Click again to select the block under the cursor. The side panel shows its name, kind, path, what it depends on, and what uses it.

| Input | Action |
| --- | --- |
| W / S | Walk forward / back along the look direction |
| A / D | Strafe |
| Shift | Walk faster |
| V | Toggle a top-down view of the courtyard. Press V again to return to where you were |
| Enter, or scroll up | Step into the district or building at the center of the screen |
| Escape, or scroll down | Step back out to the parent courtyard |
| Breadcrumb | Jump straight to that ancestor |

You can only enter a district or building in the current courtyard. Boxes and portals stay put. Walking stays on the courtyard floor. Look, walking, and scrolling pause while the camera eases between courtyards. Look and walking also pause in the top-down view.
