# Task 4 Report: Canonical world serialization

## Status

DONE

## What was implemented

- **`packages/model/src/serialize.ts`**: `serializeWorld(world: World): string` — canonical writer for `world.json` bytes.
  - UTF-8 text, LF line endings, two-space indent, exactly one trailing LF, no BOM (via `JSON.stringify` + `\n` suffix).
  - Stable key order on world, node, pose, edge, point, and warning objects; optional node keys (`unitKind`, `packageName`) omitted when absent.
  - Sorts copies of nodes (by `path`, then `id`), edges (by `parentId`, `from`, `to`, `kind`), and warnings (by `path`, then `message`) using UTF-8 byte order via `Buffer.compare`.
  - Rounds pose and polyline coordinates with `roundCoord` (half away from zero to two decimal places) before serialization.
- **`packages/model/src/serialize.spec.ts`**: Two tests covering canonical output, idempotence, optional key omission, and warning sort order.
- **`packages/model/src/index.ts`**: Barrel updated to re-export `serializeWorld` alongside existing id functions and types.

## TDD evidence

### RED (Step 2)

Command:

```bash
NX_DAEMON=false npx nx test model --testPathPattern=serialize.spec.ts --skip-nx-cache
```

Relevant output:

```
FAIL model src/serialize.spec.ts
  ● Test suite failed to run

    SyntaxError: The requested module './index.js' does not provide an export named 'serializeWorld'
```

Exit code: 1 (as expected).

### GREEN (Step 4)

Command:

```bash
NX_DAEMON=false npx nx test model --testPathPattern=serialize.spec.ts --skip-nx-cache
```

Relevant output:

```
PASS model src/serialize.spec.ts
  serializeWorld
    ✓ writes canonical bytes with rounded coordinates and sorted nodes (2 ms)
    ✓ omits absent optional keys and sorts warnings
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

Exit code: 0.

## Full suite and typecheck

### Full model tests

Command:

```bash
NX_DAEMON=false npx nx test model --skip-nx-cache
```

Relevant output:

```
PASS model src/ids.spec.ts
PASS model src/serialize.spec.ts
PASS model src/types.spec.ts
Test Suites: 3 passed, 3 total
Tests:       5 passed, 5 total
```

Exit code: 0.

### Typecheck

Command:

```bash
NX_DAEMON=false npx nx run model:typecheck
```

Relevant output:

```
> tsc --noEmit -p tsconfig.json
 NX   Successfully ran target typecheck for project model
```

Exit code: 0.

## Files changed

| File | Action |
|------|--------|
| `packages/model/src/serialize.ts` | Created |
| `packages/model/src/serialize.spec.ts` | Created |
| `packages/model/src/index.ts` | Modified (added `serializeWorld` export) |

## Commit

- **SHA:** `a73bbd8`
- **Subject:** feat: serialize world.json with stable key order and rounded coordinates

## Self-review

- Implementation matches the task brief verbatim (sort comparators, key order, `roundCoord`, barrel exports).
- Tests use the specified import paths (`./ids.js`, `./index.js`).
- `serializeWorld` does not mutate the input world (spread + sort on copies).
- No extra files were committed; untracked `docs/`, `.cursor/`, `.nx/` left untouched.

## Concerns

None.

## Branch fix

- `NX_DAEMON=false npx nx test model --skip-nx-cache` — exit 0. Three suites and nine tests passed, including the four new serialization cases for edge key order and rounding, UTF-8 edge sorting, non-finite coordinates, and input immutability.
- `NX_DAEMON=false npx nx run-many -t typecheck --skip-nx-cache` — exit 0. All six package spec configurations type-checked after Nx built the model dependency.
- `NX_DAEMON=false npx nx run model:build --skip-nx-cache` — exit 0. The model TypeScript build completed successfully.
