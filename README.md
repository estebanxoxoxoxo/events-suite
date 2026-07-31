# events-suite

Suite de analítica de comportamiento, autocontenida y sin dependencias — pensada para copiarse tal cual a cualquier proyecto React (Vite, Next, CRA moderno). Todo evento desemboca en el **gateway**; el transporte hacia ingesta / Meta / lo que sea se enchufa por fuera de esta carpeta.

```
sources/   generalInfo · timeSession · scrollYData (debounce 250 ms) · clicks · focusedComponent
FSMs/      7 detectores de comportamiento (config arriba de cada archivo)
gateway/   punto único de recepción: envelope + subscribe()
types/     tipos de sources, FSMs y catálogo de eventos
```

## Integración

```tsx
import { EventsSuite } from "./events-suite";

// una vez, en cualquier parte del árbol (no renderiza nada)
<EventsSuite />
```

o imperativo, fuera de React:

```ts
import { initEventsSuite } from "./events-suite";
const stop = initEventsSuite(); // idempotente y SSR-safe
```

En dev (Vite), editar cualquier archivo de la suite fuerza **recarga completa** de la página: los singletons (sources, gateway, máquinas) no sobreviven un hot-swap parcial sin mezclar instancias viejas y nuevas.

## Consumir el gateway

```ts
import { gateway } from "./events-suite";

gateway.subscribe(e => {
  // acá se enchufa el envío a ingesta, Meta, etc.
  console.log(e.name, e.properties, e.context);
});
// replay: al suscribirse reenvía lo ya bufferizado, no se pierden eventos tempranos
```

Envelope de todo evento:

```ts
{ name, properties, context: { page, resolution, loaded_at, session_time_sec }, timestamp }
```

## Emitir eventos propios desde la app

```ts
import { gateway, BusinessEventNames } from "./events-suite";

gateway.emit(BusinessEventNames.SignUpCompleted, {
  eventType: "google",
  metadata: { attempt_id: "…" },
});
```

Los eventos de negocio llevan payload uniforme `{ eventType?, metadata? }` — lo específico va en `metadata`. Catálogo en `types/events.ts`: `BehaviorEventNames` (FSMs) y `BusinessEventNames` (app), unidos en `EventNames` / `Event`. El gateway es **estricto**: solo acepta nombres del catálogo con su payload exacto — un evento nuevo se agrega primero al catálogo.

## FSMs y configuración

Cada FSM vive en su archivo con su objeto `config` arriba de todo — ahí se tocan los umbrales.

| Archivo | Evento | Dispara | Config inicial |
|---|---|---|---|
| `FSMs/relevantSession.ts` | `relevant_session` | 1×/sesión | ≥40 s **y** `reading_scroll` + `diagonal_scroll` sumando ≥5 (reglas `minEvents`, cuenta desde el gateway) |
| `FSMs/activeSession.ts` | `active_session` | 1×/sesión | ≥15 s **y** ≥50 % depth |
| `FSMs/scrollDepth.ts` | `depth_scroll` | 1×/nivel | niveles `[25, 50, 75, 90]` |
| `FSMs/readingScroll.ts` | `reading_scroll` | 1×/ocasión | 3 gestos < 250 px en < 30 s |
| `FSMs/skimScroll.ts` | `skim_scroll` | 1×/ocasión | un gesto ↓ > 2500 px partiendo de depth ≤ 75 % |
| `FSMs/diagonalScroll.ts` | `diagonal_scroll` | 1×/ocasión | 3 gestos de 500–2500 px en < 30 s |
| `FSMs/toTopScroll.ts` | `to_top_scroll` | 1×/ocasión | gesto ↑ > 2500 px partiendo de depth > 75 % |
| `FSMs/bounce.ts` | `bounce` | 1×/sesión | la sesión termina antes de 5 s |
| `FSMs/totalClicks.ts` | `total_clicks` | 1×/sesión | al cierre de sesión (pagehide) emite el total acumulado |
| `FSMs/rageClick.ts` | `rage_click` | 1×/ocasión | ráfaga (asentada tras 200 ms) con ≥3 clicks en 600 ms |
| `FSMs/componentFocus.ts` | `component_focus` | 1×/ocasión | llegó por scroll a un componente etiquetado, dwell de 4–20 s, y scrolleó a otra parte |

### Componentes etiquetados

`focusedComponent` descubre los componentes por selector (config del source): por defecto `[data-analytics-id]`. Etiquetar es solo markup, sin código:

```html
<section data-analytics-id="problema">…</section>
```

La dominancia es relativa al viewport (IntersectionObserver, sin coordenadas) y el valor del atributo viaja como `component` en los eventos. No anidar etiquetas. Elementos que montan tarde entran solos (re-escaneo con MutationObserver).

Payload de `component_focus`:

```json
{ "component": "problema", "dwell_seconds": 4.38, "entered_from": "down", "exited_to": "down" }
```

Un «gesto» es el neto de un scroll asentado tras 250 ms sin actividad (`sources/scrollYData.ts`): `{ deltaPx, direction, fromDepth, scrollDepth, timestamp }` — `fromDepth` es la profundidad de salida, `scrollDepth` la de llegada.

## Alcance

El gateway es la frontera: esta carpeta no sabe de red, writeKeys ni SDKs. Los consumidores se suscriben desde afuera con `gateway.subscribe()`.
