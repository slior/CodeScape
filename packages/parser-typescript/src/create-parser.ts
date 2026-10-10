import type { CodeUnit, ImportFact, ParseInput, ParseResult, SourceParser, Warning } from "@sw3d/model";
import { parseFile } from "./parse-file.js";

const DEFAULT_IGNORE = ["node_modules", ".git", "dist", "build", "coverage", ".nx"] as const;

export function createTypeScriptParser(): SourceParser {
  return {
    id: "typescript",
    defaultIgnore: DEFAULT_IGNORE,
    parse(input: ParseInput): ParseResult {
      const files = input.files.map((file) => ({ path: file.path }));
      const units: CodeUnit[] = [];
      const imports: ImportFact[] = [];
      const warnings: Warning[] = [];
      for (const file of input.files) {
        const parsed = parseFile(file.path, file.text, input);
        units.push(...parsed.units);
        imports.push(...parsed.imports);
        warnings.push(...parsed.warnings);
      }
      files.sort((a, b) => compareUtf8(a.path, b.path));
      units.sort((a, b) => compareUtf8(a.path, b.path) || compareUtf8(a.id, b.id));
      imports.sort((a, b) => compareImport(a, b));
      return { files, units, imports, warnings };
    },
  };
}

function compareImport(a: ImportFact, b: ImportFact): number {
  const byFile = compareUtf8(a.fromFile, b.fromFile);
  if (byFile !== 0) return byFile;
  const rankA = a.target.kind === "external" ? 0 : 1;
  const rankB = b.target.kind === "external" ? 0 : 1;
  if (rankA !== rankB) return rankA - rankB;
  const keyA = a.target.kind === "external" ? a.target.name : a.target.file;
  const keyB = b.target.kind === "external" ? b.target.name : b.target.file;
  const byKey = compareUtf8(keyA, keyB);
  if (byKey !== 0) return byKey;
  return compareUtf8(a.specifier, b.specifier);
}

function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}
