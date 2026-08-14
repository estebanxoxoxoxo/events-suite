# host/ — lo que el host tiene que cablear

La suite mide sola, pero **no transmite sola**: necesita un dataplane
same-origin y dos endpoints. Ese cableado vive acá, versionado con la suite,
para que enchufarla en un proyecto nuevo sea copiar líneas, no reinventarlas.

```
vite.js             plugin: dataplane de dev/preview + sourceConfig al build + full-reload
mirror-api.mjs      copia api/ a la raíz del host — el espejo, del lado del servidor
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
invisibles para el deploy. El puente es una copia exacta:

```bash
node events-suite/host/mirror-api.mjs         # copia api/ de la suite a ./api
node events-suite/host/mirror-api.mjs --check # no escribe; falla si difiere (CI)
```

Conviene dejarlo como script del host:

```json
"scripts": {
  "mirror:api": "node events-suite/host/mirror-api.mjs",
  "mirror:api:check": "node events-suite/host/mirror-api.mjs --check"
}
```

Se **commitea** el `api/` copiado: Vercel lo necesita en el repo. La fuente
sigue siendo la suite — el `api/` del host no se edita, se regenera, y eso es
justo lo que verifica `--check`. Compara ignorando finales de línea, porque git
los reescribe: un clon fresco en Windows deja CRLF donde la suite tiene LF, y
si no, `--check` gritaría por una diferencia que no existe.

**Copia y no re-exporta**, a propósito. Un `export { default } from
'../events-suite/api/x'` sería más lindo, pero Vercel empaqueta cada fichero de
`api/` por separado y los imports relativos a carpetas hermanas ya reventaron
con `ERR_MODULE_NOT_FOUND` — está anotado en el encabezado de
`send-server-event.ts`. Las funciones de la suite están escritas self-contained
justamente para que copiarlas alcance: ninguna importa por path relativo.

Copia **las cinco**. Tres (`register`, `failed-lead`, `firebase-config`) son del
registro con Google de Smarty: un host que no lo use las va a tener deployadas,
pero inertes — sin `FIREBASE_SERVICE_ACCOUNT` en las env, el handler corta y
devuelve 500 sin tocar nada. Sin las otras dos, la suite degrada sin romper: la
CAPI de Meta no cuenta (queda solo el pixel) y los eventos viajan sin geo/IP de
sesión.

**Variables de entorno** — `META_PIXEL_ID` y `META_ACCESS_TOKEN` para la CAPI
(`META_TEST_EVENT_CODE` solo para probar en Events Manager: vacío en prod).

## 3. HTML

El snippet del pixel de Meta (`fbq`) en el `<head>` del host: la suite lo usa,
no lo instala.

## 4. Dependencias

Las instala el host, no el submódulo — son **peer**: la suite se consume como
fuente y una segunda copia de `react` rompe los hooks (el porqué completo, en
[GETTING-STARTED §2](../GETTING-STARTED.md#2-instalar-las-dependencias--en-el-host-no-en-el-submódulo)).

| Paquete | Para qué | Cuándo |
|---|---|---|
| `react` ≥ 18 | Provider, hook y reader | siempre (el core no lo usa) |
| `@rudderstack/analytics-js` ^3 | pusher del pipeline propio | si se pasa `rudderStackWriteKey` |
| `firebase` ^12 | presencia en vivo en RTDB | si se pasa `activeSessions` |
| `firebase-admin` ^13 | Firestore desde el server | solo si se espejan `register` y `failed-lead` |

Los dos del medio entran por import dinámico: si la config no los enciende, no
se cargan. `firebase-admin` es del servidor, no viaja al navegador.
