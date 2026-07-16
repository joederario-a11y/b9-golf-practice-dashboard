import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const localWorkerConfig = {
  main: "./worker/index.ts",
};

const useLocalPreview = process.env.VINEXT_LOCAL_PREVIEW === "1";
const localCloudflareWorkersShim = fileURLToPath(new URL("./lib/dev/cloudflare-workers.ts", import.meta.url));

export default defineConfig(async () => {
  const { default: vinext } = await import("vinext");
  const plugins = [vinext()];

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
