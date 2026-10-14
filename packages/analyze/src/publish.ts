import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";

const ENTRIES = ["world.json", "index.html", "assets"] as const;
type EntryName = (typeof ENTRIES)[number];
type FailAfter = EntryName;

interface JournalEntry {
  entry: EntryName;
  existed: boolean;
  installed: boolean;
}

function backupPath(outDir: string, entry: EntryName, id: string): string {
  return path.join(outDir, `.${entry}.sw3d-bak-${id}`);
}

function quarantinePath(outDir: string, entry: EntryName, id: string): string {
  return path.join(outDir, `.${entry}.sw3d-quarantine-${id}`);
}

function chooseTransactionId(outDir: string): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = `${process.pid}-${Date.now().toString(36)}-${attempt}-${randomBytes(6).toString("hex")}`;
    const taken = ENTRIES.some((entry) => {
      return fs.existsSync(backupPath(outDir, entry, id)) || fs.existsSync(quarantinePath(outDir, entry, id));
    });
    if (!taken) return id;
  }
  throw new Error("no free transaction id");
}

function installEntry(
  entry: EntryName,
  stagingDir: string,
  outDir: string,
  id: string,
  journal: JournalEntry[],
): void {
  const dest = path.join(outDir, entry);
  const staged = path.join(stagingDir, entry);
  const existed = fs.existsSync(dest);
  let installed = false;
  try {
    if (existed) fs.renameSync(dest, backupPath(outDir, entry, id));
    fs.renameSync(staged, dest);
    installed = true;
  } finally {
    journal.push({ entry, existed, installed });
  }
}

function rollback(journal: readonly JournalEntry[], outDir: string, stagingDir: string, id: string): void {
  for (let index = journal.length - 1; index >= 0; index -= 1) {
    const item = journal[index];
    if (!item) continue;
    const dest = path.join(outDir, item.entry);
    const backup = backupPath(outDir, item.entry, id);
    const quarantine = quarantinePath(outDir, item.entry, id);
    if (item.installed && fs.existsSync(dest)) fs.renameSync(dest, quarantine);
    if (item.existed && fs.existsSync(backup)) fs.renameSync(backup, dest);
    if (!item.existed && fs.existsSync(quarantine)) fs.rmSync(quarantine, { recursive: true, force: true });
    if (fs.existsSync(quarantine)) fs.rmSync(quarantine, { recursive: true, force: true });
  }
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

function deleteThisTransactionsBackups(outDir: string, id: string): void {
  for (const entry of ENTRIES) {
    const backup = backupPath(outDir, entry, id);
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
  }
}

export function publishSnapshotWithHook(
  stagingDir: string,
  outDir: string,
  failAfter?: FailAfter,
): void {
  if (fs.existsSync(outDir) && !fs.statSync(outDir).isDirectory()) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw new Error(`--out exists and is not a directory: ${outDir}`);
  }
  if (!fs.existsSync(outDir)) {
    try {
      fs.renameSync(stagingDir, outDir);
    } catch (error) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
      throw error;
    }
    return;
  }

  let id: string;
  try {
    id = chooseTransactionId(outDir);
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }

  const journal: JournalEntry[] = [];
  try {
    for (const entry of ENTRIES) {
      installEntry(entry, stagingDir, outDir, id, journal);
      if (failAfter === entry) throw new Error(`injected failure after ${entry}`);
    }
  } catch (error) {
    rollback(journal, outDir, stagingDir, id);
    throw error;
  }

  fs.rmSync(stagingDir, { recursive: true, force: true });
  deleteThisTransactionsBackups(outDir, id);
}

export function publishSnapshot(stagingDir: string, outDir: string): void {
  publishSnapshotWithHook(stagingDir, outDir);
}
