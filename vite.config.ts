import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const localWorkerConfig = {
  main: "./worker/index.ts",
};

const useLocalPreview = process.env.VINEXT_LOCAL_PREVIEW === "1";
const localCloudflareWorkersShim = fileURLToPath(new URL("./lib/dev/cloudflare-workers.ts", import.meta.url));

function gitValue(args: string[], fallback: string) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

export default defineConfig(async () => {
  const { default: vinext } = await import("vinext");
  const plugins = [vinext()];
  const buildCommit = gitValue(["rev-parse", "HEAD"], "local");
  const buildBranch = gitValue(["branch", "--show-current"], "local");
  const buildWorker = process.env.MAI_COACH_WORKER || (buildBranch === "dev" ? "mai-coach-dev" : "local");

  if (!useLocalPreview) {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    plugins.push(
      cloudflare({
        inspectorPort: false,
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localWorkerConfig,
      }),
    );
  }

  return {
    define: {
      __MAI_COACH_BUILD_BRANCH__: JSON.stringify(buildBranch),
      __MAI_COACH_BUILD_COMMIT__: JSON.stringify(buildCommit),
      __MAI_COACH_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __MAI_COACH_BUILD_WORKER__: JSON.stringify(buildWorker),
    },
    optimizeDeps: {
      exclude: ["react/jsx-dev-runtime", "react/jsx-runtime"],
    },
    resolve: useLocalPreview
      ? {
          alias: {
            "cloudflare:workers": localCloudflareWorkersShim,
          },
        }
      : undefined,
    plugins,
  };
});
