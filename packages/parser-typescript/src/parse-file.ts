import ts from "typescript";
import { symbolBoxId } from "@sw3d/model";
import type { CodeUnit, ImportFact, ParseInput, Warning } from "@sw3d/model";
import { resolveSpecifier } from "./resolve.js";

const RANK: Record<CodeUnit["kind"], number> = {
  class: 4,
  enum: 3,
  interface: 2,
  type: 1,
};

export function parseFile(
  filePath: string,
  text: string,
  input: ParseInput,
): { units: CodeUnit[]; imports: ImportFact[]; warnings: Warning[] } {
  const source = parseSource(filePath, text);
  if (source.failed) {
    return { units: [], imports: [], warnings: [{ path: filePath, message: "syntax error" }] };
  }
  const imports: ImportFact[] = [];
  const warnings: Warning[] = [];
  const merged = new Map<string, CodeUnit["kind"]>();

  function addImport(specifier: string): void {
    const resolved = resolveSpecifier(specifier, filePath, input);
    if (resolved.kind === "drop") {
      warnings.push({ path: filePath, message: resolved.message });
      return;
    }
    if (resolved.kind === "internal") {
      imports.push({ fromFile: filePath, specifier, target: { kind: "internal", file: resolved.file } });
      return;
    }
    imports.push({ fromFile: filePath, specifier, target: { kind: "external", name: resolved.name } });
  }

  function remember(kind: CodeUnit["kind"], name: string | undefined): void {
    if (name === undefined) return;
    const current = merged.get(name);
    if (current === undefined || RANK[kind] > RANK[current]) merged.set(name, kind);
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier !== undefined) addImport(specifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier !== undefined) addImport(specifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const specifier = literalText(node.moduleReference.expression);
      if (specifier !== undefined) addImport(specifier);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const dynamic = callee.kind === ts.SyntaxKind.ImportKeyword;
      const required = ts.isIdentifier(callee) && callee.text === "require";
      if (dynamic || required) {
        const arg = node.arguments[0];
        if (arg !== undefined && ts.isStringLiteral(arg)) addImport(arg.text);
      }
    }
    if (ts.isClassDeclaration(node)) remember("class", className(node));
    else if (ts.isInterfaceDeclaration(node)) remember("interface", node.name.text);
    else if (ts.isTypeAliasDeclaration(node)) remember("type", node.name.text);
    else if (ts.isEnumDeclaration(node)) remember("enum", node.name.text);
    ts.forEachChild(node, visit);
  }

  visit(source.file);
  const units: CodeUnit[] = [];
  for (const [name, kind] of merged) {
    units.push({ id: symbolBoxId(filePath, name), kind, name, path: filePath });
  }
  return { units, imports, warnings };
}

function className(node: ts.ClassDeclaration): string | undefined {
  if (node.name) return node.name.text;
  const modifiers = node.modifiers;
  if (!modifiers) return undefined;
  for (const modifier of modifiers) {
    if (modifier.kind === ts.SyntaxKind.DefaultKeyword) return "default";
  }
  return undefined;
}

function literalText(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node)) return node.text;
  return undefined;
}

function parseSource(filePath: string, text: string): { file: ts.SourceFile; failed: boolean } {
  const options: ts.CompilerOptions = {
    noResolve: true,
    noLib: true,
    types: [],
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.NodeNext,
  };
  const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const host: ts.CompilerHost = {
    getSourceFile(name: string): ts.SourceFile | undefined {
      if (name !== filePath) return undefined;
      return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, false, kind);
    },
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "",
    getCanonicalFileName: (name: string) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name: string) => name === filePath,
    readFile: (name: string) => (name === filePath ? text : undefined),
  };
  const program = ts.createProgram([filePath], options, host);
  const file = program.getSourceFile(filePath);
  if (!file) {
    return {
      file: ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, false, kind),
      failed: true,
    };
  }
  return { file, failed: program.getSyntacticDiagnostics(file).length > 0 };
}
