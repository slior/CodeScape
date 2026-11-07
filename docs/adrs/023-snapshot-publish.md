# 023 - Publish a snapshot by staging and rollback

## Status

Accepted on 2026-10-14.

Depends on:

- [001 - Split the pipeline into six packages](001-six-package-pipeline.md)
- [015 - Write world.json with one canonical serializer](015-canonical-world-json.md)
- [019 - Keep warnings on the document and stop before a fatal error](019-warnings-and-fatal-errors.md)
- [021 - Build the viewer with Vite and Three.js](021-vite-and-three.md)

## Context

The snapshot directory is the phase 1 deliverable. It must not be left half-updated. publishSnapshot is the only function that moves files into --out. snapshot calls it after staging succeeds.

snapshot writes into a sibling of --out named `.sw3d-staging-<pid>-<random>`. It copies packages/viewer/dist (index.html and assets/) into staging. The dist path is resolved from the analyze file location, not imported as a module. A missing build throws SnapshotFatal("viewer build is missing; run nx build viewer"). It writes serializeWorld(world) to world.json in staging. It does not hand-build the JSON.

Staging is complete only when index.html, world.json, and a non-empty assets/ exist and world.json parses as version 1.

The analyzed folder is only read. snapshot compares real paths and rejects --out when it is that folder or a path inside it, before creating the staging parent. A symlink whose real path is inside the folder fails the same way.

A fatal error before publish does not create or modify --out and deletes any staging directory it created. That policy is [019 - Keep warnings on the document and stop before a fatal error](019-warnings-and-fatal-errors.md). This record is what happens once publish starts.

## Decision

publishSnapshot chooses a transaction id such that, for world.json, index.html, and assets, none of `<out>/.<entry>.sw3d-bak-<id>` or `<out>/.<entry>.sw3d-quarantine-<id>` already exist. If no such id is found, it deletes the staging directory and exits non-zero without changing --out.

When --out does not exist, publish renames the staging directory to --out. On failure, it deletes staging and leaves --out absent.

When --out exists and is not a directory, staging is removed and the function throws.

When --out exists and is a directory, it installs world.json, then index.html, then assets. Each rename is journaled before the next begins, including whether the destination existed and whether the staged entry has been moved onto it.

Installing one entry renames the existing destination to `.<entry>.sw3d-bak-<id>` when it exists, then renames the staged entry onto the destination. The new assets/ is the whole directory, so stale bundle files disappear. A directory is never renamed onto an occupied path.

Unrelated files in --out are never renamed or deleted.

If any install throws, rollback walks the journal from newest to oldest:

- If this transaction installed a new destination, rename that destination to `.<entry>.sw3d-quarantine-<id>` before putting anything back. A non-empty assets/ is moved aside this way, not overwritten.
- If the destination existed before this transaction, rename the backup back onto the destination.
- If the destination did not exist, delete the quarantined install and leave the destination absent.
- Delete the quarantine path, then the staging directory.

After success, delete the staging directory and only this transaction's backup paths. A pre-existing unrelated file whose name resembles a backup is left alone.

## Consequences

- A crash after world.json is installed and before assets are installed restores the previous three entries. The previous bundle does not stay paired with a new world, and a new world does not stay paired with an old bundle, once rollback finishes.
- Replacing assets as a directory drops stale hashed files from an older viewer build.
- The person can keep notes or other files in the output directory. Only the three snapshot names are replaced.
- Analyze's build and test depend on viewer:build because the copy needs dist. They do not depend on importing viewer source.
- Two writers into --out are not allowed. A new snapshot file has to be added to the journal, the validation list, and the rollback list together.
