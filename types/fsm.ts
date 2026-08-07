// Configs y contratos de las FSMs.

import type { KnownEventName } from "./events";
import type { Unsubscribe } from "./sources";

/** Sesión relevante / activa: umbral de tiempo + profundidad. */
export interface SessionMilestoneConfig {
  minSeconds: number;
  /** 0..1 */
  minScrollDepth: number;
}

/** Regla de eventos: la SUMA de ocurrencias de `events` debe alcanzar `min`. */
export interface EventCountRule {
  events: KnownEventName[];
  min: number;
}

/** Sesión relevante: tiempo mínimo + reglas de eventos (todas deben cumplirse). */
export interface RelevantSessionConfig {
  minSeconds: number;
  minEvents: EventCountRule[];
}

/* scroll25/50/75/90 no tienen config: el umbral es el nombre de cada máquina. */

/** Racha: gestos consecutivos dentro del rango de px. Acumula mientras sigan
 * calificando y emite UNA vez al cortarse, con la cantidad real — por eso es un
 * mínimo y no un número exacto. Se corta con un gesto que no califica, con
 * `maxGapSeconds` de silencio, o al terminar la sesión. */
export interface ScrollStreakConfig {
  /** No emite si la racha no llegó a esto. */
  minCount: number;
  /** Silencio máximo entre gestos antes de dar la racha por cerrada. */
  maxGapSeconds: number;
  /** Rango INCLUSIVO de cada gesto. Los rangos de reading/diagonal/skim son
   * adyacentes y no se pisan: cada gesto cae en exactamente un balde. */
  minPx?: number;
  maxPx?: number;
}

/** Scroll despectivo: un solo gesto que supere `minPx`. Hacia arriba, todos
 * menos la barrida completa al tope, que es territorio de toTopScroll — esa
 * frontera es única y vive en `lib/fullSweep.ts`. */
export interface SkimScrollConfig {
  minPx: number;
}

/* to_top_scroll no tiene config: su definición ES la frontera compartida de
 * `lib/fullSweep.ts`, y se define por recorrido y no por píxeles, así que
 * escala sola entre mobile y desktop. */

/** Bounce: la sesión termina antes de `maxSeconds`. */
export interface BounceConfig {
  maxSeconds: number;
}

/* click no tiene config: un click, un evento — no hay umbral que ajustar. */

/** Rage click: ráfaga (asentada tras `debounceMs` sin clicks) con alguna ventana de `windowMs` conteniendo `count` o más. */
export interface RageClickConfig {
  count: number;
  windowMs: number;
  debounceMs: number;
}

/** Component focus: llegó por scroll, se quedó entre min y max segundos, y scrolleó a otra parte. */
export interface ComponentFocusConfig {
  minSeconds: number;
  maxSeconds: number;
}

// ── Runtime ──────────────────────────────────────────────────────────

export interface FSM<Input> {
  readonly state: string;
  send(input: Input): void;
  /** Fuerza el estado terminal y suelta las suscripciones. */
  stop(): void;
}

export interface FSMDef<Input, Ctx> {
  id: string;
  initial: string;
  context: Ctx;
  /** Un handler por estado: devuelve el próximo estado para transicionar ("done" es terminal) o nada para quedarse. */
  states: Record<string, (input: Input, ctx: Ctx) => string | void>;
  /** Conecta el FSM a sus sources; los teardowns corren al llegar a "done" o con stop(). */
  wire(send: (input: Input) => void): Unsubscribe[];
}
