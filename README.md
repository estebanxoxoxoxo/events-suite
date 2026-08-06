# events-suite

Sistema de analítica de **comportamiento** y de **negocio** para el navegador. Se ocupa de tres cosas, en cadena y con una sola vía:

1. **Detectar** — sources que observan la sesión (scroll, clicks, viewport, tiempo, componentes visibles) y 11 FSMs que convierten esos datos crudos en eventos con significado (`reading_scroll`, `rage_click`, `component_focus`, `bounce`…).
2. **Nuclear** — un gateway único que envuelve TODO evento (de las FSMs o de la app) en un envelope con contexto, `event_id` y timestamp.
3. **Despachar** — delivery completa el payload (metadata de sesión: geo/IP del hosting, login, cookies de Meta) y lo transporta a los destinos: el pipeline propio (protocolo RudderStack → Vector → S3 raw/bronze) y las conversiones de Meta (pixel + CAPI).

Se copia como carpeta a cualquier proyecto. El core es framework-free; el binding oficial es React (`EventsSuiteProvider`).

## Implementación en la app — paso a paso

**1. Copiar.** `events-suite/` al proyecto + la plantilla [`eventsSuiteMirror-template`](./eventsSuiteMirror-template) a la app como `src/eventsSuiteMirror.tsx` (descomentarla y ajustar el path). Regla de oro: **el espejo es el único archivo de la app que importa de `events-suite`** — todo lo demás importa del espejo. Verificable con un grep.

**2. Montar el Provider en la raíz del árbol** — y solo en la rama que se quiere medir (en esta landing: `App`; las rutas `/placas` de ads quedan afuera a propósito):

```jsx
// src/main.jsx
import { EventsSuiteProvider } from './eventsSuiteMirror';

{placasAspect ? (
  <AdPlacas aspect={placasAspect} />
) : (
  <EventsSuiteProvider reader>   {/* reader: visor debug (últimos 10 eventos); apagarlo en prod */}
    <App />
  </EventsSuiteProvider>
)}
```

Con el import ya está midiendo (auto-init, cero red); el Provider habilita el hook y el reader.

**3. Encender delivery UNA vez, en el componente raíz**, con la config de la app — la writeKey vive en la app (`src/config.js`), nunca en la suite:

```jsx
// src/App.jsx
import { ANALYTICS_WRITE_KEY } from './config';
import { useEventsSuite } from './eventsSuiteMirror';

const suite = useEventsSuite();
useEffect(() => {
  suite.startDelivery({
    rudderStackWriteKey: ANALYTICS_WRITE_KEY, // → pipeline propio (Vector → S3)
    fb: true,                                 // → conversiones de Meta (pixel + CAPI, mismo eventID)
    vercelMetadataCollect: true,              // → geo/IP de sesión
  });
}, [suite]);
```

Sin este paso la suite mide igual; simplemente nada sale a la red. (Es también el gate natural para consentimiento: llamalo recién cuando el usuario acepte.)

**4. Emitir los eventos de negocio donde ocurren** — en componentes, vía hook. Ejemplo real del botón de registro, con la correlación por `attempt_id` (mismo id en Meta Lead, failedLeads y bronze):

```tsx
const suite = useEventsSuite();

suite.pushBusinessEvent(BusinessEventNames.RegisterButtonClick);
const attemptId = startRegisterAttempt(source);
suite.pushBusinessEvent(BusinessEventNames.SubscribeClick, {
  metadata: { source, attempt_id: attemptId },
});
```

Los módulos que no son componentes (auth, helpers) **no emiten**: el emit se sube al componente que los llama — así el hook alcanza y esos módulos quedan libres de tracking.

**5. Etiquetar los componentes a medir** con `data-analytics-id` (habilita `component_focus`; ver «Componentes etiquetados»):

```html
<section data-analytics-id="problema">…</section>
```

**6. Qué NO hacer**: importar de `events-suite` fuera del espejo · emitir eventos de comportamiento desde la app (son territorio de las FSMs) · mapear `Lead` en el pusher de FB (duplicaría la conversión del click de registro) · tocar internals de fases.

El host además tiene que servir los endpoints de «Requisitos del host».

**Contrato público completo** (nada más sale del index): `EventsSuiteProvider`, `useEventsSuite`, `BusinessEventNames`, `pushEvent`, `FbEvent` + tipos `StartDeliveryConfig`, `BusinessEventPayload`, `EventsSuiteCtx`. (`pushEvent`/`FbEvent` son las conversiones DIRECTAS de Meta — PageView/ViewContent/Lead — que corren fuera del gateway; la suite es el único motor Meta desde que se retiró `facebook-api-template`.)

## La dinámica — el viaje de un evento

```
usuario scrollea
  → source (scrollYData: gesto asentado tras 250 ms, con fromDepth/scrollDepth)
  → FSM (p. ej. readingScroll: racha de 3 gestos cortos → patrón detectado)
  → gateway.emit() (interno) → envelope { properties + context + event_id + timestamp }
  → deliver() — el gateway EMPUJA al stageGateway de delivery (una sola vía)
  → channel: bufferea y reparte a los pushers registrados
  → pusher: adapter(envelope, sessionMetadata.get()) → payload del destino → red
```

Propiedades de esa dinámica, todas deliberadas:

- **Presencia = medición; config = transmisión.** El auto-init (al importar) enciende SOLO detección. Nada sale a la red hasta que la app llama `startDelivery`, y sale exactamente lo que su config habilita (`rudderStackWriteKey` → pipeline, `fb` → Meta, `vercelMetadataCollect` → fetch de geo).
- **Nada se pierde por orden de arranque.** El gateway bufferea y el canal de delivery también: un pusher que arranca tarde recibe el historial completo de la sesión (backfill) sin pedirle nada a nadie.
- **El enriquecimiento ocurre AL DESPACHAR**, no al emitir: la identidad o la geo que llegan al minuto 3 alcanzan igual a los eventos que siguen en cola.
- **`event_id` es el mismo id en los tres sistemas**: dedup de la capa plata en bronze, `eventID` del pixel y de la CAPI de Meta. Un solo identificador correlaciona todo. **No confundirlo con el `message_id` de la raíz del evento en bronze**: ese lo genera el SDK de RudderStack al despachar e identifica el *mensaje*, así que cambia si el evento esperó en cola. `event_id` identifica la *ocurrencia* y se estampa cuando pasó.
- **`original_timestamp` es la ocurrencia REAL**: el pusher lo pasa por evento al SDK (`ApiOptions.originalTimestamp` = el timestamp del envelope), así que lo que esperó en cola (pre-SDK o backfill gateado por consentimiento) no hereda la hora del despacho. Semántica estándar, cero columnas extra.
- **El gateway es estricto en compilación**: solo nombres del catálogo con su payload exacto; y desde la app, `pushBusinessEvent` solo acepta eventos de negocio.
- **Eventos de cierre** (`bounce`, `click`) se emiten en `pagehide`. Caveat conocido: el SDK de RudderStack flushea cada 3 s sin beacon, así que si la pestaña se cierra justo, quedan persistidos en localStorage y salen en la próxima visita (no se pierden, llegan tarde).
- **En dev (Vite), editar la suite fuerza recarga completa**: los singletons no sobreviven un hot-swap parcial sin mezclar instancias viejas y nuevas.
- **El tracking nunca rompe la página**: todo el camino de despacho está envuelto en try/catch; un pusher roto no frena a los demás.

## Estructura

```
1-detection/   etapa 1: observar y detectar — produce y no se consume: SIN gate
  sources/       los sentidos: generalInfo · timeSession · scrollYData (250 ms) · clicks · focusedComponent
  FSMs/          11 detectores de patrones (config arriba de cada archivo)
2-gateway/     etapa 2: el hub — su único fichero ES la entrada de la fase
3-delivery/    etapa 3: completar el payload y sacarlo al mundo
  channel.ts     entrada de eventos de la fase: deliver() + registro de dispatchers
  adapters/      dominio de completar payloads:
    metadata/      sessionMetadata: hosting (geo/IP de sesión, supplier) · login · fb
    rudderstack/fb funciones PURAS: envelope + metadata → payload del destino
  pushers/       rudderstack (SDK: cola/batch/retry) · fb/ (pixel + CAPI)
  stageGateway   ÚNICO punto de entrada a la fase: deliver() + controles públicos
lib/           primitivas compartidas (emitter)
types/         transversal: tipos de sources, FSMs, metadata y catálogo de eventos
EventsSuiteProvider.tsx · init.ts (auto-init) · IncomingEventReader.tsx · index.ts (contrato)
```

**Reglas de fases — una sola vía (1 → 2 → 3)**:

- Las FSMs consumen sources, nunca al revés: ningún source conoce una FSM.
- Las FSMs emiten hacia la etapa 2 **solo por el fichero de `2-gateway`**; el gateway no conoce a las FSMs (solo lee dos sources para armar el context).
- El gateway **EMPUJA** cada evento a `deliver()` — la única función de entrada de delivery. **Nada de delivery conoce ni consulta al gateway** (cero imports de `2-gateway` en la fase).
- `gateway.subscribe()` queda para observadores ajenos a delivery (el reader de debug, FSMs que escuchan eventos ya realizados, como `relevantSession`).

## Envelope y catálogo

Todo evento viaja con el sobre que arma el gateway (interno):

```ts
{ name, properties, context: { page, resolution, loaded_at, engaged_time_sec }, event_id, timestamp }
```

`loaded_at` es constante por carga de página (agrupador natural en bronze, y el ancla para calcular `timestamp - loaded_at`); `event_id` es la clave de dedup transversal.

**`engaged_time_sec` es tiempo de ATENCIÓN, no de reloj**: solo corre con la pestaña visible (Page Visibility API), que es lo que GA4 llama *engagement time*. El tiempo de reloj no se guarda porque ya lo tenés gratis: `timestamp - loaded_at`. Y el valor sale de restar instantes sobre los tramos visibles, no de contar ticks, así que es exacto aunque el navegador atrase el timer — que es justo lo que hace en pestañas de fondo.

Ojo con la consecuencia: los umbrales de `bounce`, `active_session` y `relevant_session` se miden en esos segundos. «40 segundos» significa 40 segundos **mirando**, y el que abre la landing, se va a otra pestaña diez minutos y cierra sin leer, rebota.

Los eventos de **negocio** llevan payload uniforme `{ eventType?, metadata? }` — lo específico va en `metadata`. Catálogo en `types/events.ts`: `BehaviorEventNames` (emiten las FSMs) y `BusinessEventNames` (lo único emitible desde la app).

## FSMs y configuración

Cada FSM vive en su archivo con su objeto `config` arriba de todo — **la fuente de verdad de los umbrales es ese config**, no esta tabla (valores al día de hoy):

| Archivo | Evento | Dispara | Config actual |
|---|---|---|---|
| `relevantSession.ts` | `relevant_session` | 1×/sesión | ≥40 s de atención **y** `reading_scroll` + `diagonal_scroll` sumando ≥5 (reglas `minEvents`, cuenta desde el gateway) |
| `activeSession.ts` | `active_session` | 1×/sesión | ≥15 s de atención **y** ≥50 % depth |
| `scrollDepth.ts` | `depth_scroll` | 1×/nivel | niveles `[25, 50, 75, 90]` |
| `readingScroll.ts` | `reading_scroll` | 1×/ocasión | 3 gestos < 301 px en < 20 s |
| `skimScroll.ts` | `skim_scroll` | 1×/ocasión | un gesto > 2500 px en cualquier dirección, salvo la barrida completa al tope |
| `diagonalScroll.ts` | `diagonal_scroll` | 1×/ocasión | 2 gestos de 300–2501 px en < 20 s |
| `toTopScroll.ts` | `to_top_scroll` | 1×/ocasión | un gesto ↑ que sale de depth > 80 % y aterriza en < 20 % (sin umbral de px) |
| `bounce.ts` | `bounce` | 1×/sesión | la sesión termina (pagehide) antes de 5 s **de atención** |
| `click.ts` | `click` | 1×/sesión | al cierre de sesión emite el total y el mapa de coordenadas |
| `rageClick.ts` | `rage_click` | 1×/ocasión | ráfaga (asentada tras 200 ms) con ≥3 clicks en 600 ms |
| `componentFocus.ts` | `component_focus` | 1×/ocasión | llegó por scroll a un componente etiquetado, dwell de 4–20 s, y scrolleó a otra parte |

Un «gesto» es el neto de un scroll asentado tras 250 ms sin actividad: `{ deltaPx, direction, fromDepth, scrollDepth, timestamp }` — `fromDepth` es la profundidad de salida, `scrollDepth` la de llegada. La profundidad incluye el viewport (`(scrollY + alto de ventana) / alto del documento`): es cuánto de la página se vio, no dónde arranca la ventana.

**`skim_scroll` y `to_top_scroll` se reparten los gestos largos por complemento.** `to_top_scroll` se queda con la barrida completa al tope (sale de > 0.8, aterriza en < 0.2, en un solo gesto) y `skim_scroll` con todo el resto que supere `minPx`, en las dos direcciones. Así ningún gesto largo queda sin clasificar ni se cuenta dos veces — antes, una subida larga que no venía del fondo no la tomaba nadie. Los dos umbrales están escritos en los dos configs (ninguna FSM importa de la otra): si tocás uno, tocá el otro. `to_top_scroll` no usa píxeles a propósito: definido por proporción de página, significa lo mismo en mobile que en desktop.

### Componentes etiquetados

`focusedComponent` descubre componentes por selector (config del source): por defecto `[data-analytics-id]`. Etiquetar es solo markup:

```html
<section data-analytics-id="problema">…</section>
```

Dominancia relativa al viewport (IntersectionObserver, sin coordenadas); el valor del atributo viaja como `component`. No anidar etiquetas. Elementos que montan tarde entran solos (MutationObserver). Payload de `component_focus`:

```json
{
  "component": "problema",
  "entered_from": "down",
  "exited_to": "down",
  "values": [{ "name": "dwell_seconds", "value": 4.38 }]
}
```

### Valores: `values: [{ name, value }]`

**Los 11 eventos de comportamiento** mandan sus mediciones como una lista uniforme, en vez de claves propias por evento. Así silver las desanida sin conocer el esquema de cada uno: una sola consulta las saca todas.

Tres reglas:

- **Solo métricas numéricas.** `value` es siempre `number`, así que silver no castea.
- **Lo categórico queda afuera.** `component`, `direction`, `entered_from`, `exited_to` viajan como propiedad suelta al lado de `values`: son con lo que agrupás, no lo que medís, y adentro del array obligarían a desanidar para filtrar.
- **Nada de arrays adentro de `value`.** Las rachas (`reading_scroll`, `diagonal_scroll`) resumen sus deltas en `gestures`, `total_px` y `span_seconds`.

`relevant_session` es el que más gana: los conteos que antes vivían en el objeto de claves dinámicas `event_counts` ahora son un item por evento (`count_reading_scroll`, `count_diagonal_scroll`).

| Evento | `values` | Dimensiones |
|---|---|---|
| `relevant_session` | `seconds` + `count_<evento>` | — |
| `active_session` | `seconds`, `scroll_depth` | — |
| `depth_scroll` | `level`, `scroll_depth` | — |
| `reading_scroll` · `diagonal_scroll` | `gestures`, `total_px`, `span_seconds` | — |
| `skim_scroll` | `delta_px` | `direction` |
| `to_top_scroll` | `delta_px`, `from_depth`, `to_depth` | — |
| `bounce` | `engaged_seconds` | — |
| `click` | `clicks` | `coordinates[]` |
| `rage_click` | `clicks`, `span_ms`, `x`, `y` | — |
| `component_focus` | `dwell_seconds` | `component`, `entered_from`, `exited_to` |

Los eventos de negocio no usan `values`: siguen con `eventType` + `metadata`, que el adapter aplana.

## Delivery: metadata, adapters y pushers

**`adapters/metadata/`** — registry `sessionMetadata` con tres orígenes: `metaDataFromHosting` (lo que el HOSTING sabe de la sesión — `supplier` que identifica al proveedor + país, IP, ciudad, timezone: headers del edge servidos por `/api/get-vercel-session-metadata`; sin data de deployment a propósito), `login` (la app la empuja con `setLoginMetadata()` post-auth — pendiente de cablear), `fb` (cookies `_fbp`/`_fbc` auto + `setFbMetadata()`). Suscribible: el pusher de rudder dispara `identify()` solo cuando cae el login.

**`adapters/`** — funciones puras, sin IO: `toRudderTrack` y `toFbPush` (conversión con `eventId = event_id`).

`toRudderTrack` devuelve `{ event, properties, options }` y reparte según el spec: **lo que el evento midió va a `properties`** (negocio aplanado, `values`, dimensiones, `event_id`) y **lo que es entorno va a `context`**, viajando por las options del SDK, que mergea toda clave no reservada adentro de context:

```
context.ip                 IP de la sesión (la ve el edge, no el navegador)
context.location           city · country · region · latitude · longitude · postal_code
context.hosting.supplier   quién reportó el geo ("vercel") — única clave no estándar
context.loaded_at          ancla de la carga de página
```

Así el geo cae donde cualquier warehouse lo aplana solo (`context_location_country`) en vez de quedar en un blob propietario adentro de properties. **`timezone` del hosting se descarta a propósito**: el SDK ya pone el del navegador, que es el real; el del edge es una adivinanza desde la IP.

**`pushers/`** — `rudderstack.ts` (el viejo `src/analytics.js`: SDK en idle con timeout, cola pre-SDK, `page()` manual, batch, sin beacon; recibe TODO el gateway), `fb/` (copia completa de `facebook-push-events` + mapping SOLO de eventos de negocio a conversiones estándar — **Lead excluido a propósito**: ya lo dispara `startRegisterAttempt` con `eventId = attemptId`; duplicarlo contaría conversiones dobles) y `activeSessions.ts` (presencia en vivo).

### Presencia en vivo (`activeSessions`)

Un nodo por **pestaña abierta** en Firebase Realtime Database, para un panel de "visitantes ahora" que lee **otra app**. Se enciende con `startDelivery({ activeSessions: true })`.

```
/activeSessions/{tabId}
  started_at · last_seen · visible · page · engaged_time_sec
  geo: { lat, lng, city, region, country }
  events/{event_id}: { event, properties, options }   ← idéntico a lo que va a la ingesta
```

Los eventos salen del **mismo `toRudderTrack`** que la ingesta, así que la fidelidad es por construcción. Salvedad: no es literalmente el payload final: el SDK de RudderStack agrega adentro suyo su `messageId`, el `sentAt` y su bloque de context (page, screen, os, locale, campaign, sessionId). El payload literal solo existe en `raw`.

**La limpieza la hace el servidor, no el navegador.** Se registra `onDisconnect().remove()`: cuando se corta el socket, Firebase borra el nodo — cubre crash, batería, swipe y cierre de tapa. El borrado en `pagehide` es solo el camino rápido. Dos consecuencias a saber: el servidor tarda ~30-60 s en detectar una conexión muerta (el contador queda unos segundos inflado, como en todos estos paneles), y una pestaña en segundo plano sigue conectada — por eso el nodo lleva `visible`, para que la app lectora decida si la cuenta.

Se escribe por hijo (`events/{event_id}`), así que agregar un evento no reescribe el nodo. El SDK de Firebase entra por import dinámico en idle: no pesa en el LCP.

**Requisitos del host**: una instancia de RTDB y reglas que permitan escribir en ese nodo. Se enciende pasándole el `databaseURL` en `startDelivery({ activeSessions: "https://…firebaseio.com" })` — es público, igual que el writeKey, y para *escribir* en RTDB alcanza con eso (el `apiKey` solo hace falta para auth). Por eso el pusher **no depende de ningún endpoint de la app**: una constante, no un round-trip.

## Requisitos del host

- **React ≥ 18** (solo para el binding: Provider/hook/reader; el core no lo usa).
- **RudderStack**: dependencia `@rudderstack/analytics-js` (import dinámico: solo carga si `startDelivery` la activa) + dataplane same-origin: `/sourceConfig` y `/v1/batch` servidos por el dominio (dev/preview: middleware y proxy en `vite.config.js`; prod: rewrites de `vercel.json`) + el `writeKey` que la app pasa en `startDelivery`.
- **Meta**: snippet del pixel (`fbq`) en el HTML + la función `api/send-server-event.ts` (CAPI) con `META_PIXEL_ID` y `META_ACCESS_TOKEN` en las env del server — sin ellas la CAPI responde 500 y solo cuenta el pixel (degradación segura, sin dobles). `META_TEST_EVENT_CODE` solo para probar en Events Manager: vacío en producción. En dev, `vite.config.js` mockea el endpoint.
- **Metadata del hosting**: la función `api/get-vercel-session-metadata.js` (echo de los headers del edge con `supplier: "vercel"`; en dev la mockea `vite.config.js`). En otro hosting, se reimplementa el endpoint con su `supplier` y la suite no cambia.

## Recetas

- **Nuevo evento de negocio**: agregarlo a `BusinessEventNames` + su entrada en `BusinessEvents` (`types/events.ts`) → ya se puede `pushBusinessEvent`. Si además es conversión de Meta: sumarlo al `mapping` del pusher fb.
- **Nuevo destino** (GA4, TikTok…): adapter puro en `adapters/` + pusher en `pushers/` que se registre con `registerDispatcher()` en el canal + su flag en `StartDeliveryConfig`.
- **Tunear una FSM**: el `config` arriba de su archivo. Nada más.
- **Reader on/off**: prop `reader` del Provider.
- **Identidad post-login** (pendiente de cablear): `setLoginMetadata({ user_id, email, method })` activa `identify()` de rudder y advanced matching de Meta. Hoy es interna — cuando se conecte al flujo de auth se expondrá como método del ctx del Provider, manteniendo el contrato mínimo.

## Alcance y garantías

El núcleo (detección + gateway) no sabe de red. Todo lo que transmite vive en `pushers/`, arranca solo con `startDelivery` y en la medida que su config lo indique. La app entera habla con la suite por una sola puerta (el espejo → Provider), y el tracking jamás rompe la página.
