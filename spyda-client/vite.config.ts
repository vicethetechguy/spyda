import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Serves the Vercel serverless functions in api/ during local `vite` dev,
// so /api/* works without deploying or running `vercel dev`.
function localVercelApi(): Plugin {
  return {
    name: 'spyda-local-api',
    config(_config, { mode }) {
      // Vercel injects env vars in production; locally, load every key from
      // .env/.env.local into process.env for the api handlers.
      const env = loadEnv(mode, process.cwd(), '')
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        if (!url.startsWith('/api/')) return next()

        const endpoint = url.slice('/api/'.length).split('?')[0].replace(/\/+$/, '')
        if (!/^[a-z0-9_-]+$/i.test(endpoint)) return next()

        try {
          const mod = await server.ssrLoadModule(`/api/${endpoint}.ts`)
          const handler = mod?.default
          if (typeof handler !== 'function') {
            res.statusCode = 404
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: `No API handler for /api/${endpoint}.` }))
            return
          }

          // Vercel-style response helpers
          const vRes = res as any
          vRes.status = (code: number) => { res.statusCode = code; return vRes }
          vRes.json = (payload: unknown) => {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(payload))
            return vRes
          }
          vRes.send = (payload: unknown) => {
            if (typeof payload === 'string' || Buffer.isBuffer(payload)) res.end(payload)
            else vRes.json(payload)
            return vRes
          }

          // Vercel parses JSON bodies; multipart streams must stay untouched
          // so formidable can consume them inside the handler.
          const vReq = req as any
          const contentType = String(req.headers['content-type'] || '')
          if (contentType.includes('application/json')) {
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(chunk as Buffer)
            const raw = Buffer.concat(chunks).toString('utf8')
            try { vReq.body = raw ? JSON.parse(raw) : {} } catch { vReq.body = {} }
          }

          await handler(vReq, vRes)
        } catch (error: any) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: error?.message || 'Local API error.' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localVercelApi()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
