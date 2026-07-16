import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const localWorkerConfig = {
  main: "./worker/index.ts",
};

export default defineConfig({
  optimizeDeps: {
    exclude: ["react/jsx-dev-runtime", "react/jsx-runtime"],
  },
  plugins: [
    vinext(),
    cloudflare({
      inspectorPort: false,
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: localWorkerConfig,
    }),
  ],
});
