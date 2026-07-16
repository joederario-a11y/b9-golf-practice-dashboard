import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

function jsonResponse(value: unknown, status = 200) {
  return {
    body: JSON.stringify(value),
    headers: {
      "Content-Type": "application/json",
    },
    status,
  };
}

function sendJson(res: { end: (body: string) => void; setHeader: (key: string, value: string) => void; statusCode: number }, value: unknown, status = 200) {
  const response = jsonResponse(value, status);
  res.statusCode = response.status;
  for (const [key, headerValue] of Object.entries(response.headers)) {
    res.setHeader(key, headerValue);
  }
  res.end(response.body);
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    react(),
    {
      name: "free-range-local-preview-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = req.url?.split("?")[0] ?? "/";

          if (path === "/api/sessions") {
            sendJson(res, { mode: "guest", sessions: [] });
            return;
          }

          if (path === "/api/account") {
            sendJson(res, { devAuthEnabled: false, mode: "guest", user: null });
            return;
          }

          if (path === "/api/profile") {
            sendJson(res, { mode: "guest", profile: null });
            return;
          }

          if (path === "/api/videos") {
            sendJson(res, { mode: "guest", videos: [] });
            return;
          }

          next();
        });
      },
    },
  ],
  publicDir: "../public",
  server: {
    fs: {
      allow: [".."],
    },
  },
});
