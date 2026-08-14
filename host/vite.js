// Cableado del host para events-suite, en un solo plugin de Vite.
//
// La suite no habla con la red directamente: necesita que el HOST le sirva un
// dataplane same-origin (`/sourceConfig` y `/v1/batch`) y los endpoints de
// metadata. Ese cableado vive acá, en la suite, para que un host nuevo no tenga
// que reinventarlo: una línea en su vite.config.js y ya.
//
//   import { eventsSuiteVite } from './events-suite/host/vite.js'
//   plugins: [react(), ...eventsSuiteVite({ writeKey: ANALYTICS_WRITE_KEY })]
//
// Qué resuelve, por entorno:
//   dev/preview  sirve /sourceConfig · proxya /v1/batch al ingestador ·
//                mockea /api/get-vercel-session-metadata y /api/send-server-event
//   build        emite sourceConfig.json al output, para que el rewrite de
//                producción (/sourceConfig → /sourceConfig.json) tenga qué servir
//   siempre      recarga la página entera al editar la suite: sus singletons
//                (sources, gateway, FSMs) no sobreviven un hot-swap parcial.
//
// Producción (Vercel u otro): además hacen falta los rewrites de
// `host/vercel.json` y las funciones de `api/` — ver `host/README.md`.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HOST_DIR = new URL('.', import.meta.url)
const SUITE_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/')

// Ingestador por defecto del pipeline propio (Vector → S3 raw/bronze).
const DEFAULT_INGEST = 'https://actasitalianasexpress.com'

// Lo que devuelve el mock de /api/get-vercel-session-metadata en dev: en prod
// eso son los headers del edge (x-vercel-ip-*), que en localhost no existen.
// Tiene que traer las MISMAS claves que el endpoint real: si el mock trae
// menos, en dev no ves algo que en prod sí viaja (pasó con latitude/longitude).
const DEV_SESSION_METADATA = {
  supplier: 'dev',
  ip: '127.0.0.1',
  country: 'DEV',
  region: 'DEV',
  city: 'localhost',
  postal_code: '00000',
  latitude: '40.4345',
  longitude: '-3.8244',
  timezone: 'America/Argentina/Buenos_Aires',
}

const template = readFileSync(new URL('sourceConfig.json', HOST_DIR), 'utf8')

// El sourceConfig que el SDK de RudderStack pide al arrancar. Es la plantilla
// de al lado con la writeKey del host puesta: el archivo queda versionado en la
// suite y lo específico de cada app entra por parámetro.
const buildSourceConfig = ({ writeKey, sourceName, workspace }) =>
  template
    .replaceAll('__WRITE_KEY__', writeKey)
    .replaceAll('__SOURCE_NAME__', sourceName)
    .replaceAll('__WORKSPACE__', workspace)

const json = (res, body) => {
  res.setHeader('Content-Type', 'application/json')
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

/**
 * @param {object} options
 * @param {string} options.writeKey        writeKey del pipeline (público: viaja al navegador)
 * @param {string} [options.ingest]        origen del ingestador al que se proxya /v1/batch
 * @param {string} [options.sourceName]    nombre de la source en el sourceConfig
 * @param {string} [options.workspace]     workspaceId en el sourceConfig
 * @param {object} [options.devMetadata]   overrides del mock de metadata en dev
 * @returns {import('vite').PluginOption[]}
 */
export function eventsSuiteVite({
  writeKey,
  ingest = DEFAULT_INGEST,
  sourceName = 'app',
  workspace = 'default',
  devMetadata = {},
} = {}) {
  if (!writeKey) {
    // Sin writeKey el SDK no arranca: mejor avisar acá que depurar un 404 mudo.
    console.warn('[events-suite] eventsSuiteVite sin writeKey: el dataplane no va a servir nada útil')
  }

  const sourceConfig = buildSourceConfig({ writeKey, sourceName, workspace })
  const sessionMetadata = { ...DEV_SESSION_METADATA, ...devMetadata }
  const proxy = { '/v1/batch': { target: ingest, changeOrigin: true } }

  // Los tres endpoints que el host sirve en prod, resueltos en memoria para dev.
  const middleware = (server) => {
    server.middlewares.use((req, res, next) => {
      const path = (req.url || '').split('?')[0].replace(/\/+$/, '')
      if (path.endsWith('/sourceConfig')) return json(res, sourceConfig)
      if (path === '/api/get-vercel-session-metadata') return json(res, sessionMetadata)
      // La CAPI de Meta: en prod es api/send-server-event.ts contra el Graph.
      if (path === '/api/send-server-event') return json(res, { success: true, dev: true })
      next()
    })
  }

  return [
    {
      name: 'events-suite:dataplane',
      config: () => ({ server: { proxy }, preview: { proxy } }),
      configureServer: middleware,
      configurePreviewServer: middleware,
      generateBundle() {
        // El equivalente estático de lo que el middleware sirve en dev: el
        // rewrite de producción apunta acá.
        this.emitFile({ type: 'asset', fileName: 'sourceConfig.json', source: sourceConfig })
      },
    },
    {
      name: 'events-suite:full-reload',
      handleHotUpdate({ file, server }) {
        if (file.replace(/\\/g, '/').startsWith(SUITE_ROOT)) {
          server.ws.send({ type: 'full-reload' })
          return []
        }
      },
    },
  ]
}
