import { Readable } from "node:stream";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return {};
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function openAiCompatibleProxy() {
  return {
    name: "openai-compatible-proxy",
    configureServer(server) {
      server.middlewares.use("/proxy/request", async (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        try {
          const { baseUrl, path, method = "GET", headers = {}, body } =
            await readRequestBody(req);

          if (!baseUrl || !path) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                error: "Missing baseUrl or path",
              }),
            );
            return;
          }

          const targetUrl = `${String(baseUrl).replace(/\/+$/, "")}${path}`;
          const response = await fetch(targetUrl, {
            method,
            headers,
            body,
          });

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === "content-encoding") {
              return;
            }
            res.setHeader(key, value);
          });

          if (!response.body) {
            res.end();
            return;
          }

          Readable.fromWeb(response.body).pipe(res);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), openAiCompatibleProxy()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
