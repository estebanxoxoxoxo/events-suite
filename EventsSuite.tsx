// Wrapper React: montar una vez en cualquier parte del árbol. No renderiza nada.

import { useEffect } from "react";
import { initEventsSuite } from "./init";

export function EventsSuite() {
  useEffect(() => initEventsSuite(), []);
  return null;
}
