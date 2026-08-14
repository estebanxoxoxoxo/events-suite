# host/ — lo que el host tiene que cablear

La suite mide sola, pero **no transmite sola**: necesita un dataplane
same-origin y dos endpoints. Ese cableado vive acá, versionado con la suite,
para que enchufarla en un proyecto nuevo sea copiar líneas, no reinventarlas.

```
vite.js             plugin: dataplane de dev/preview + sourceConfig al build + full-reload
mirror-api.mjs      genera el api/ de la raíz del host — el espejo, del lado del servidor
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

**Funciones — el espejo del servidor.** Vercel solo descubre funciones en el
`api/` de la **raíz del proyecto**, y las de la suite viven en el submódulo: son
invisibles para el deploy. El puente es el mismo espejo que del lado del
cliente, pero generado:

```bash
node events-suite/host/mirror-api.mjs        # crea/actualiza ./api con un archivo por función
node events-suite/host/mirror-api.mjs --check # no escribe: falla si el espejo quedó viejo
```

Conviene dejarlo como script del host y correr `--check` en CI:

```json
"scripts": { "mirror:api": "node events-suite/host/mirror-api.mjs" }
```

Flags: `--only a,b` (espeja algunas), `--out dir`, `--force` (pisa un archivo
propio del host con el mismo nombre). El script **no pisa** nada que no haya
generado él, avisa cuando un espejo quedó huérfano (la suite ya no tiene esa
función) y su salida es determinista, así que `--check` no da falsos positivos.

**Copia y no re-exporta**, a propósito. Un `export { default } from
'../events-suite/api/x'` sería más lindo, pero Vercel empaqueta cada fichero de
`api/` por separado y los imports relativos a carpetas hermanas ya reventaron
con `ERR_MODULE_NOT_FOUND` — está anotado en el encabezado de
`send-server-event.ts`. Las funciones de la suite están escritas self-contained
justamente para que copiarlas alcance: ninguna importa por path relativo. La
fuente sigue siendo la suite; el espejo se regenera, no se edita.

Si el host solo quiere la analítica y no el registro:
`--only send-server-event,get-vercel-session-metadata`. Sin esas dos la suite
degrada sin romper: la CAPI de Meta no cuenta (queda solo el pixel) y los
eventos viajan sin geo/IP de sesión.

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
| `firebase-admin` ^13 | Firestore desde el server | solo si se espejan `register` y `failed-lead` |

Los dos del medio entran por import dinámico: si la config no los enciende, no
se cargan. `firebase-admin` es del servidor, no viaja al navegador.
