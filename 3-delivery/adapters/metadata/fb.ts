// Metadata de Meta: las cookies _fbp/_fbc se auto-recolectan (frescas en cada
// lectura: el pixel puede setearlas tarde) y setFbMetadata() suma lo que la
// app quiera aportar (test codes, ids de campaña, etc.).

import { createEmitter } from "../../../lib/emitter";
import { getFbc, getFbp } from "../../pushers/fb/utils/cookies";
import type { FbMetadata } from "../../../types";

const emitter = createEmitter<FbMetadata>();

let manual: FbMetadata = {};

export function setFbMetadata(data: Partial<FbMetadata>): void {
  manual = { ...manual, ...data };
  emitter.emit(manual);
}

export const getFbMetadata = (): FbMetadata => ({
  fbp: getFbp(),
  fbc: getFbc(),
  ...manual,
});

export const onFbMetadata = emitter.subscribe;
