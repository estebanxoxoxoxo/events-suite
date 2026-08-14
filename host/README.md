# host/ — lo que el host tiene que cablear

La suite mide sola, pero **no transmite sola**: necesita un dataplane
same-origin y dos endpoints. Ese cableado vive acá, versionado con la suite,
para que enchufarla en un proyecto nuevo sea copiar líneas, no reinventarlas.

```
vite.js             plugin: dataplane de dev/preview + sourceConfig al build + full-reload
sourceConfig.json   plantilla del sourceConfig del SDK (la writeKey entra por parámetro)
vercel.json         los rewrites de producción, para copiar al vercel.json del host
```

Las funciones serverless viven un nivel arriba, en [`../api/`](../api).

## 1. Vite — una línea

```js
// vite.config.js del host
import { eventsSuiteVite } from './events-suite/host/vite.js'
import { ANALYTICS_WRITE_KEY } from './src/config.js'

export default defineConfig({
  plugins: [react(), ...eventsSuiteVite({ writeKey: ANALYTICS_WRITE_KEY, sourceName: 'mi-app' })],
})
```

Eso cubre dev y preview (sirve `/sourceConfig`, proxya `/v1/batch`, mockea los
dos endpoints de `api/`) y emite `sourceConfig.json` en el build para que el
rewrite de producción tenga qué servir. Opciones: `ingest` (a dónde va
`/v1/batch`), `sourceName`, `workspace`, `devMetadata`.

No hace falta ningún archivo en `public/`: el `sourceConfig.json` lo genera el
plugin desde la plantilla, así la writeKey no queda duplicada a mano en dos
lados.

## 2. Producción (Vercel)

**Rewrites** — copiar los de [`vercel.json`](./vercel.json) al `vercel.json`
del host, antes del catch-all del SPA.

**Funciones** — Vercel solo descubre funciones en el `api/` de la raíz del
proyecto, y las de la suite viven en el submódulo. Un re-export de una línea por
función es el camino corto:

```ts
// api/get-vercel-session-metadata.ts del host
export { default } from '../events-suite/api/get-vercel-session-metadata'
```

```ts
// api/send-server-event.ts del host
export { default, config } from '../events-suite/api/send-server-event'
```

Con una advertencia ganada a los golpes, escrita en el encabezado de
`send-server-event.ts`: Vercel empaqueta cada fichero de `api/` por separado y
los imports relativos a carpetas hermanas ya reventaron una vez con
`ERR_MODULE_NOT_FOUND`. Si el re-export falla, copiar el archivo al `api/` del
host — son self-contained a propósito, justamente para que copiarlos alcance.

Sin estas funciones la suite degrada sin romper: la CAPI de Meta no cuenta
(queda solo el pixel) y los eventos viajan sin geo/IP de sesión.

**Variables de entorno** — `META_PIXEL_ID` y `META_ACCESS_TOKEN` para la CAPI
(`META_TEST_EVENT_CODE` solo para probar en Events Manager: vacío en prod).

## 3. HTML

El snippet del pixel de Meta (`fbq`) en el `<head>` del host: la suite lo usa,
no lo instala.

## 4. Dependencias

Las instala el host, no el submódulo:

| Paquete | Para qué | Cuándo |
|---|---|---|
| `react` ≥ 18 | Provider, hook y reader | siempre (el core no lo usa) |
| `@rudderstack/analytics-js` ^3 | pusher del pipeline propio | si se pasa `rudderStackWriteKey` |
| `firebase` ^12 | presencia en vivo en RTDB | si se pasa `activeSessions` |

Los dos últimos entran por import dinámico: si la config no los enciende, no se
cargan.
