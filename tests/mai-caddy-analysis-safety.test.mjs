import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ts from "typescript";

async function importSafetyModule() {
  const source = await readFile(
    new URL("../lib/server/mai-caddy-analysis-safety.ts", import.meta.url),
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const encoded = Buffer.from(transpiled.outputText).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const safety = await importSafetyModule();

test("allows broad benchmark groups without individual professional names", () => {
  assert.doesNotThrow(() => {
    safety.assertNoDisallowedAnalysisContent({
      sessionSummary: "Your carry consistency is trending toward a low-handicap benchmark group.",
      courseRelevance: "Use this as broad context only.",
    });
  });
});

test("rejects Tour Twin language", () => {
  assert.throws(
    () => safety.assertNoDisallowedAnalysisContent({ headline: "Your Tour Twin is a strong match." }),
    /disallowed analysis comparison/,
  );
});

test("rejects named professional comparisons", () => {
  assert.throws(
    () => safety.assertNoDisallowedAnalysisContent({ sessionSummary: "This pattern looks like Tiger Woods." }),
    /disallowed analysis comparison/,
  );
});
