import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { setDefaultResultOrder } from 'node:dns';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';

setDefaultResultOrder('ipv4first');

// In production the files in /api are Vercel serverless functions.
// This plugin serves the very same handlers during `npm run dev` / `npm run preview`,
// so local behaviour matches the deployed site. Secrets are read from .env (server-side only).
function localApi(): Plugin {
  const attach = (
    server: { middlewares: Connect.Server },
    load: (id: string) => Promise<Record<string, unknown>>,
  ) => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const match = /^\/api\/([a-z][a-z0-9-]*)$/.exec(url.pathname);
      if (!match || !existsSync(fileURLToPath(new URL(`./api/${match[1]}.ts`, import.meta.url)))) return next();
      try {
        const mod = await load(`/api/${match[1]}.ts`);
        const handler = mod[req.method ?? 'GET'] as ((request: Request) => Promise<Response>) | undefined;
        if (typeof handler !== 'function') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        const response: Response = await handler(new Request(url, { method: req.method }));
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        if (response.body) Readable.fromWeb(response.body as never).pipe(res);
        else res.end();
      } catch (error) {
        res.statusCode = 500;
        res.end(error instanceof Error ? error.message : 'API error');
      }
    });
  };

  return {
    name: 'artemis-local-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''));
      attach(server, (id) => server.ssrLoadModule(id));
    },
    configurePreviewServer(server) {
      Object.assign(process.env, loadEnv('production', process.cwd(), ''));
      attach(server, (id) => import(/* @vite-ignore */ fileURLToPath(new URL(`.${id}`, import.meta.url))));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), localApi()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
