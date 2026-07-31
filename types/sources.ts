// Tipos de los sources (los datos crudos que alimentan a las FSMs).

export type ScrollDirection = "up" | "down";

export interface GeneralInfo {
  /** Ruta completa sin dominio (pathname + query + hash); "/" si no hay nada. */
  page: string;
  /** Viewport en px. */
  resolution: { width: number; height: number };
  /** ISO 8601: instante de carga de la aplicación (constante por sesión). */
  loaded_at: string;
}

/** Un gesto de scroll ya asentado (debounce de 250 ms): el neto de lo realizado. */
export interface ScrollGesture {
  /** Magnitud neta en px, siempre positiva. */
  deltaPx: number;
  /** "down" = scrollY creció (el usuario bajó). */
  direction: ScrollDirection;
  /** Profundidad al inicio del gesto (donde estaba parado el usuario), 0..1. */
  fromDepth: number;
  /** (scrollY + innerHeight) / scrollHeight al asentarse, acotado a [0, 1]. */
  scrollDepth: number;
  /** Epoch ms del asentamiento. */
  timestamp: number;
}

/** Un click crudo. */
export interface ClickData {
  x: number;
  y: number;
  /** Epoch ms. */
  timestamp: number;
}

/** Config del source focusedComponent. */
export interface FocusedComponentSourceConfig {
  /** Qué elementos son "componentes" (p. ej. [data-analytics-id]). */
  selectors: string[];
  /** 0..1: fracción mínima del viewport para que un componente sea dominante. */
  minViewportShare: number;
}

/** Cambio de componente dominante en el viewport (null = ninguno domina). */
export interface FocusedComponent {
  component: string | null;
  /** 0..1: fracción del viewport que ocupa. */
  share: number;
  /** Epoch ms. */
  at: number;
}

export type Unsubscribe = () => void;

export interface Source<T> {
  subscribe(listener: (value: T) => void): Unsubscribe;
}
