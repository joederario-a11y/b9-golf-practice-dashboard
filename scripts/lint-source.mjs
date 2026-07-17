import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const TARGETS = [
  "app",
  "components",
  "db",
  "examples",
  "lib",
  "local-preview",
  "supabase",
  "tests",
  "worker",
  "drizzle.config.ts",
  "eslint.config.mjs",
  "next.config.mjs",
  "postcss.config.mjs",
  "vite.config.ts",
];

const IGNORED_SEGMENTS = new Set([
  ".git",
  ".next",
  ".wrangler",
  "dist",
  "local-preview/dist",
  "node_modules",
  "out",
]);

const SUPPORTED_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".tsx"]);

function isIgnored(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (IGNORED_SEGMENTS.has(normalized)) return true;
  return normalized.split("/").some((segment, index, segments) => {
    const current = segments.slice(0, index + 1).join("/");
    return IGNORED_SEGMENTS.has(segment) || IGNORED_SEGMENTS.has(current);
  });
}

function scriptKindFor(filePath) {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  if (filePath.endsWith(".mjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.JS;
}

async function collectFiles(target) {
  const absolute = path.join(ROOT, target);
  let info;
  try {
    info = await stat(absolute);
  } catch {
    return [];
  }

  const relative = path.relative(ROOT, absolute);
  if (relative && isIgnored(relative)) return [];

  if (info.isFile()) {
    return SUPPORTED_EXTENSIONS.has(path.extname(absolute)) ? [absolute] : [];
  }

  if (!info.isDirectory()) return [];

  const entries = await readdir(absolute);
  const nested = await Promise.all(entries.map((entry) => collectFiles(path.join(relative, entry))));
  return nested.flat();
}

function lineAndColumn(source, position) {
  const prefix = source.slice(0, position);
  const lines = prefix.split(/\r?\n/);
  return {
    column: lines[lines.length - 1].length + 1,
    line: lines.length,
  };
}

function isAllowedConsoleLog(relativePath) {
  return relativePath.split(path.sep).join("/") === "local-preview/server.mjs";
}

const files = (await Promise.all(TARGETS.map(collectFiles))).flat();
const uniqueFiles = [...new Set(files)].sort();
const failures = [];

for (const filePath of uniqueFiles) {
  const relative = path.relative(ROOT, filePath);
  const source = await readFile(filePath, "utf8");
  const parsed = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );

  for (const diagnostic of parsed.parseDiagnostics) {
    const location = lineAndColumn(source, diagnostic.start ?? 0);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    failures.push(`${relative}:${location.line}:${location.column} ${message}`);
  }

  for (const marker of ["<<<<<<<", "=======", ">>>>>>>"]) {
    const index = source.indexOf(marker);
    if (index !== -1) {
      const location = lineAndColumn(source, index);
      failures.push(`${relative}:${location.line}:${location.column} merge conflict marker "${marker}"`);
    }
  }

  if (!isAllowedConsoleLog(relative)) {
    const debugMatch = source.match(/\bconsole\.(log|debug)\s*\(/);
    if (debugMatch?.index !== undefined) {
      const location = lineAndColumn(source, debugMatch.index);
      failures.push(`${relative}:${location.line}:${location.column} remove console.${debugMatch[1]} debug output`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Source lint failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Source lint passed (${uniqueFiles.length} files checked).`);
