// Superficie pública del lado navegador. La app importa SOLO desde acá.
export { pushEvent, sendFbServerEvent, setServerEndpoint, onFbEvent } from "../pushEvent";
export type { PushOptions } from "../pushEvent";
export { sendFbBrowserEvent, isPixelReady } from "./pixel";
export { getCookie, getFbp, getFbc } from "./cookies";
export { createEventId } from "./ids";
export { postBeacon } from "./beacon";
export { FbEvent } from "./types";
export type { FbUserData, FbCustomData, ServerEventPayload } from "./types";
