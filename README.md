# events-suite

Recoleccion de eventos semanticos de comportamiento y de negocio para webs y dispatch a ingestor propios y otros clientes. 

Se monta como submódulo de git, se corre el script prepare de la suite y se monta en la web el provider de la suite

## Estado 0.1

Eventos de comportamiento andando. La metadata que viaja no está revisada al 100%; los eventos de negocio, sin chequear.

## Arranque

1. La suite como submódulo en la raíz del host.
2. `npm run prepare` adentro de la suite: copia el espejo y `api/`, escribe el `.gitmodules`, instala las peer en el host.
3. Montar `EventsSuiteProvider` en el árbol de la app, con el `reader` apagado en producción.
4. Llamar `startDelivery` una vez. Hasta que no se llama, la suite mide y no transmite.
5. En el `vercel.json` del host, el endpoint del ingestor va en el `destination` del rewrite de `/v1/batch`. Los secretos de Firebase y de Meta, en el hosting.

Paso a paso: [GETTING-STARTED.md](./GETTING-STARTED.md)

## Pipeline

```
sources → FSMs → gateway → delivery → pushers
```

- **sources** (5) — observan la sesión cruda: scroll, clicks, tiempo, viewport, qué componente está enfrente.
- **FSMs** (15) — una por patrón. Traducen lo crudo en un evento con significado.
- **gateway** — entrada única. Envuelve todo evento, de las FSMs o de la app, en un envelope con `event_id`, timestamp y contexto.
- **delivery** — le suma la metadata de sesión: geo, login, cookies de Meta.
- **pushers** — uno por destino: el pipeline propio (protocolo RudderStack → ingestor → GCS), Meta (pixel + CAPI) y la presencia en vivo en RTDB.

## FSMs

Con su config por defecto; los números se pisan pasándole config al `start…`.

| Evento | Cuándo | Payload |
|---|---|---|
| `page_view` | al cargar | — |
| `scroll_25/50/75/90` | al cruzar el nivel, 1× cada uno | `engaged_seconds` |
| `reading_scroll` | ≥3 gestos < 301 px hacia abajo, hueco < 3,5 s | `quantity`, `gestures`, `span_seconds` |
| `diagonal_scroll` | ≥2 gestos de 301–2500 px, hueco < 7 s | `quantity`, `gestures`, `span_seconds` |
| `skim_scroll` | un gesto > 2500 px, en cualquier dirección | `delta_px`, `direction` |
| `to_top_scroll` | un gesto ↑ que sale de depth > 0,8 y aterriza en < 0,2 | `delta_px`, `from_depth`, `to_depth` |
| `component_focus` | ≥4,5 s con el centro del componente en la franja central | `component`, `dwell_seconds`, `entered_from`, `exited_to` |
| `click` | uno por click | `x`, `y` (fracción del documento) |
| `rage_click` | 3 clicks en 600 ms | `quantity`, `span_ms`, `x`, `y` |
| `active_session` | ≥15 s de atención y ≥50 % de depth | `engaged_seconds`, `scroll_depth` |
| `relevant_session` | ≥40 s y reading + diagonal sumando ≥5 | `engaged_seconds`, `count_reading_scroll`, `count_diagonal_scroll` |
| `bounce` | la sesión termina antes de 5 s | `engaged_seconds` |

Las cuatro rachas de scroll se reparten el eje sin huecos ni solapes: ≤300 px es lectura si va hacia abajo, 301–2500 es diagonal, > 2500 es skim, y la barrida completa al tope es `to_top_scroll` — las otras tres la ceden.

## Eventos de comportamiento

Los FSM emiten eventos de comportamiento. Es automatico. Solo component focus requiere que el desarrollador indique cual es el componente html en cuestion colocandole un id especial, el resto automatico

## Eventos de negocio

Los emite la app, no la suite: `cta_click`, `subscribe_click`, `register_button_click`, `sign_up_started`, `sign_up_completed`, `login`, `lead_submitted`, `form_submitted`, `search`, `product_viewed`, `add_to_cart`, `remove_from_cart`, `checkout_started`, `purchase_completed`, `video_played`.

```tsx
const suite = useEventsSuite();
suite.pushBusinessEvent(BusinessEventNames.SubscribeClick, { metadata: { source } });
```

## Contrato

Lo único que sale del `index.ts`: `EventsSuiteProvider`, `useEventsSuite`, `BusinessEventNames`, `pushEvent`, `FbEvent`.

Del lado de la app, cuatro cosas: montar el Provider, llamar `startDelivery`, emitir los eventos de negocio, y etiquetar con `data-analytics-id` lo que quiera medir (`<section data-analytics-id="problema">`).

## Reglas

- La app importa **del espejo**, nunca de `events-suite`. Un solo archivo la conecta.
- Los eventos de comportamiento son territorio de las FSMs: la app no los emite.
- Los módulos que no son componentes tampoco: el emit se sube al componente que los llama.
