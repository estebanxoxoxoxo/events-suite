// Posición de un punto del documento como FRACCIÓN de su ancho y alto (0..1).
//
// En píxeles, el mismo click vale distinto en cada pantalla y no se pueden
// juntar en un mapa; en fracción, 0.5 es la mitad de la página en cualquier
// dispositivo. Vive en lib/ y no en una FSM porque lo usan dos (click y
// rageClick) y con dos copias el redondeo se separa y las coordenadas dejan de
// ser comparables entre sí.

/** 4 decimales: en un documento de 10.000 px, precisión de 1 px. */
const fraction = (value: number, total: number) =>
  total > 0 ? Math.min(1, Math.max(0, +(value / total).toFixed(4))) : 0;

/** Coordenadas del DOCUMENTO (pageX/pageY) → fracción [x, y]. */
export function toDocumentFraction(pageX: number, pageY: number): [number, number] {
  const { scrollWidth, scrollHeight } = document.documentElement;
  return [fraction(pageX, scrollWidth), fraction(pageY, scrollHeight)];
}
