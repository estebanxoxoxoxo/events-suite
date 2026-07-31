// API pública de events-suite.

export { initEventsSuite } from "./init";
export { EventsSuite } from "./EventsSuite";
export { IncomingEventReader } from "./IncomingEventReader";
export { gateway } from "./gateway";
export { generalInfo } from "./sources/generalInfo";
export { timeSession } from "./sources/timeSession";
export { scrollYData } from "./sources/scrollYData";
export { clicks } from "./sources/clicks";
export { focusedComponent } from "./sources/focusedComponent";
export { createFSM, DONE } from "./FSMs/createFSM";
export { startRelevantSession } from "./FSMs/relevantSession";
export { startActiveSession } from "./FSMs/activeSession";
export { startScrollDepth } from "./FSMs/scrollDepth";
export { startReadingScroll } from "./FSMs/readingScroll";
export { startSkimScroll } from "./FSMs/skimScroll";
export { startDiagonalScroll } from "./FSMs/diagonalScroll";
export { startToTopScroll } from "./FSMs/toTopScroll";
export { startBounce } from "./FSMs/bounce";
export { startTotalClicks } from "./FSMs/totalClicks";
export { startRageClick } from "./FSMs/rageClick";
export { startComponentFocus } from "./FSMs/componentFocus";
export * from "./types";
