# events-suite

Sistema de analítica de **comportamiento** y de **negocio** para el navegador. Se ocupa de tres cosas, en cadena y con una sola vía:

1. **Detectar** — sources que observan la sesión (scroll, clicks, viewport, tiempo, componentes visibles) y 11 FSMs que convierten esos datos crudos en eventos con significado (`reading_scroll`, `rage_click`, `component_focus`, `bounce`…).
2. **Nuclear** — un gateway único que envuelve TODO evento (de las FSMs o de la app) en un envelope con contexto, `message_id` y timestamp.
3. **Despachar** — delivery completa el payload (metadata de sesión: geo/IP de Vercel, login, cookies de Meta) y lo transporta a los destinos: el pipeline propio (protocolo RudderStack → Vector → S3 raw/bronze) y las conversiones de Meta (pixel + CAPI).

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
    fb: true,                                 // → conversiones de Meta (pixel)
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

**Contrato público completo** (nada más sale del index): `EventsSuiteProvider`, `useEventsSuite`, `BusinessEventNames` + tipos `StartDeliveryConfig`, `BusinessEventPayload`, `EventsSuiteCtx`.

## La dinámica — el viaje de un evento

```
usuario scrollea
  → source (scrollYData: gesto asentado tras 250 ms, con fromDepth/scrollDepth)
  → FSM (p. ej. readingScroll: racha de 3 gestos cortos → patrón detectado)
  → gateway.emit() (interno) → envelope { properties + context + message_id + timestamp }
  → deliver() — el gateway EMPUJA al stageGateway de delivery (una sola vía)
  → channel: bufferea y reparte a los pushers registrados
  → pusher: adapter(envelope, sessionMetadata.get()) → payload del destino → red
```

Propiedades de esa dinámica, todas deliberadas:

- **Presencia = medición; config = transmisión.** El auto-init (al importar) enciende SOLO detección. Nada sale a la red hasta que la app llama `startDelivery`, y sale exactamente lo que su config habilita (`rudderStackWriteKey` → pipeline, `fb` → Meta, `vercelMetadataCollect` → fetch de geo).
- **Nada se pierde por orden de arranque.** El gateway bufferea y el canal de delivery también: un pusher que arranca tarde recibe el historial completo de la sesión (backfill) sin pedirle nada a nadie.
- **El enriquecimiento ocurre AL DESPACHAR**, no al emitir: la identidad o la geo que llegan al minuto 3 alcanzan igual a los eventos que siguen en cola.
- **`message_id` es el mismo id en los tres sistemas**: dedup de la capa plata en bronze, `eventID` del pixel y de la CAPI de Meta. Un solo identificador correlaciona todo.
- **El gateway es estricto en compilación**: solo nombres del catálogo con su payload exacto; y desde la app, `pushBusinessEvent` solo acepta eventos de negocio.
- **Eventos de cierre** (`bounce`, `total_clicks`) se emiten en `pagehide`. Caveat conocido: el SDK de RudderStack flushea cada 3 s sin beacon, así que si la pestaña se cierra justo, quedan persistidos en localStorage y salen en la próxima visita (no se pierden, llegan tarde).
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
    metadata/      sessionMetadata: vercel (geo/IP de sesión) · login · fb
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
{ name, properties, context: { page, resolution, loaded_at, session_time_sec }, message_id, timestamp }
```

`loaded_at` es constante por sesión (agrupador natural en bronze); `session_time_sec` es el reloj relativo; `message_id` es la clave de dedup transversal.

Los eventos de **negocio** llevan payload uniforme `{ eventType?, metadata? }` — lo específico va en `metadata`. Catálogo en `types/events.ts`: `BehaviorEventNames` (emiten las FSMs) y `BusinessEventNames` (lo único emitible desde la app).

## FSMs y configuración

Cada FSM vive en su archivo con su objeto `config` arriba de todo — **la fuente de verdad de los umbrales es ese config**, no esta tabla (valores al día de hoy):

| Archivo | Evento | Dispara | Config actual |
|---|---|---|---|
| `relevantSession.ts` | `relevant_session` | 1×/sesión | ≥40 s **y** `reading_scroll` + `diagonal_scroll` sumando ≥5 (reglas `minEvents`, cuenta desde el gateway) |
| `activeSession.ts` | `active_session` | 1×/sesión | ≥15 s **y** ≥50 % depth |
| `scrollDepth.ts` | `depth_scroll` | 1×/nivel | niveles `[25, 50, 75, 90]` |
| `readingScroll.ts` | `reading_scroll` | 1×/ocasión | 3 gestos < 301 px en < 20 s |
| `skimScroll.ts` | `skim_scroll` | 1×/ocasión | un gesto ↓ > 2500 px partiendo de depth ≤ 75 % |
| `diagonalScroll.ts` | `diagonal_scroll` | 1×/ocasión | 2 gestos de 300–2501 px en < 20 s |
| `toTopScroll.ts` | `to_top_scroll` | 1×/ocasión | gesto ↑ > 2500 px partiendo de depth > 75 % |
| `bounce.ts` | `bounce` | 1×/sesión | la sesión termina (pagehide) antes de 5 s |
| `totalClicks.ts` | `total_clicks` | 1×/sesión | al cierre de sesión emite el total acumulado |
| `rageClick.ts` | `rage_click` | 1×/ocasión | ráfaga (asentada tras 200 ms) con ≥3 clicks en 600 ms |
| `componentFocus.ts` | `component_focus` | 1×/ocasión | llegó por scroll a un componente etiquetado, dwell de 4–20 s, y scrolleó a otra parte |

Un «gesto» es el neto de un scroll asentado tras 250 ms sin actividad: `{ deltaPx, direction, fromDepth, scrollDepth, timestamp }` — `fromDepth` es la profundidad de salida, `scrollDepth` la de llegada.

### Componentes etiquetados

`focusedComponent` descubre componentes por selector (config del source): por defecto `[data-analytics-id]`. Etiquetar es solo markup:

```html
<section data-analytics-id="problema">…</section>
```

Dominancia relativa al viewport (IntersectionObserver, sin coordenadas); el valor del atributo viaja como `component`. No anidar etiquetas. Elementos que montan tarde entran solos (MutationObserver). Payload de `component_focus`:

```json
{ "component": "problema", "dwell_seconds": 4.38, "entered_from": "down", "exited_to": "down" }
```

## Delivery: metadata, adapters y pushers

**`adapters/metadata/`** — registry `sessionMetadata` con tres orígenes: `vercel` (país, IP, ciudad, timezone de la SESIÓN: headers `x-vercel-ip-*` del edge servidos por `/api/session-metadata`), `login` (la app la empuja con `setLoginMetadata()` post-auth — pendiente de cablear), `fb` (cookies `_fbp`/`_fbc` auto + `setFbMetadata()`). Suscribible: el pusher de rudder dispara `identify()` solo cuando cae el login.

**`adapters/`** — funciones puras, sin IO: `toRudderTrack` (negocio aplanado a properties chatas + `message_id` + bloque `suite` con sesión/vercel) y `toFbPush` (conversión con `eventId = message_id`).

**`pushers/`** — `rudderstack.ts` (el viejo `src/analytics.js`: SDK en idle con timeout, cola pre-SDK, `page()` manual, batch, sin beacon; recibe TODO el gateway) y `fb/` (copia completa de `facebook-push-events` + mapping SOLO de eventos de negocio a conversiones estándar — **Lead excluido a propósito**: ya lo dispara `startRegisterAttempt` con `eventId = attemptId`; duplicarlo contaría conversiones dobles).

## Requisitos del host

- **React ≥ 18** (solo para el binding: Provider/hook/reader; el core no lo usa).
- **RudderStack**: dependencia `@rudderstack/analytics-js` (import dinámico: solo carga si `startDelivery` la activa) + dataplane same-origin: `/sourceConfig` y `/v1/batch` servidos por el dominio (dev/preview: middleware y proxy en `vite.config.js`; prod: rewrites de `vercel.json`) + el `writeKey` que la app pasa en `startDelivery`.
- **Meta**: snippet del pixel (`fbq`) en el HTML; la CAPI necesita `/api/send-server-event` (mientras no exista, el pusher va `browserOnly`).
- **Metadata de Vercel**: la función `api/session-metadata.js` (echo de los headers del edge; en dev la mockea `vite.config.js`).

## Recetas

- **Nuevo evento de negocio**: agregarlo a `BusinessEventNames` + su entrada en `BusinessEvents` (`types/events.ts`) → ya se puede `pushBusinessEvent`. Si además es conversión de Meta: sumarlo al `mapping` del pusher fb.
- **Nuevo destino** (GA4, TikTok…): adapter puro en `adapters/` + pusher en `pushers/` que se registre con `registerDispatcher()` en el canal + su flag en `StartDeliveryConfig`.
- **Tunear una FSM**: el `config` arriba de su archivo. Nada más.
- **Reader on/off**: prop `reader` del Provider.
- **Identidad post-login** (pendiente de cablear): `setLoginMetadata({ user_id, email, method })` activa `identify()` de rudder y advanced matching de Meta. Hoy es interna — cuando se conecte al flujo de auth se expondrá como método del ctx del Provider, manteniendo el contrato mínimo.

## Alcance y garantías

El núcleo (detección + gateway) no sabe de red. Todo lo que transmite vive en `pushers/`, arranca solo con `startDelivery` y en la medida que su config lo indique. La app entera habla con la suite por una sola puerta (el espejo → Provider), y el tracking jamás rompe la página.
