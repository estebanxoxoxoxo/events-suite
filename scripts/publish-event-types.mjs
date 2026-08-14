// Publica el catálogo de eventos de la suite en el lake: event-types.
//
// Vive EN LA SUITE porque la suite es dueña de sus enums: LA FUENTE es el
// código — BehaviorEventNames y BusinessEventNames de types/events.ts — la
// única lista de "qué eventos son posibles" que existe. Este script la
// extrae, arma el JSON del catálogo (el formato declarado que ya entiende
// el viewer de ops: grupos con sus eventos) y lo sube a
// gs://<proyecto>-lake/schemas/event-types.json.
//
// Se corre tras cambiar los enums, desde la raíz de la suite:
//   npm run publish:event-types
// Requiere gcloud autenticado con el proyecto activo (o PROJECT/BUCKET por
// entorno). Sin dependencias.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(SUITE, "types", "events.ts");

// ── 1. Extraer los enums del código ──────────────────────────────────
// Regex y no compilador: los enums son literales string planos y este
// script no puede depender de tooling de TS. Si el archivo cambia de forma,
// los guardias de abajo cortan con error en vez de publicar un catálogo
// vacío o a medias.

const source = readFileSync(SOURCE, "utf8");

function enumValues(enumName) {
  const block = source.match(new RegExp(`export enum ${enumName} \\{([\\s\\S]*?)\\}`));
  if (!block) throw new Error(`No encontré "export enum ${enumName}" en ${SOURCE}`);
  const values = [...block[1].matchAll(/=\s*"([^"]+)"/g)].map((m) => m[1]);
  if (values.length === 0) throw new Error(`El enum ${enumName} quedó vacío: no publico.`);
  return values;
}

const behavior = enumValues("BehaviorEventNames");
const business = enumValues("BusinessEventNames");

const repeated = behavior.filter((name) => business.includes(name));
if (repeated.length > 0) {
  throw new Error(`Nombres repetidos entre behavior y business: ${repeated.join(", ")}`);
}

// ── 2. El catálogo, en el formato declarado que lee ops ──────────────

const titleize = (value) =>
  value.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

const catalog = {
  // Trazabilidad; el lector ignora las claves que no conoce.
  source: "events-suite/types/events.ts",
  groups: [
    {
      name: "behavior",
      label: "Comportamiento",
      events: behavior.map((name) => ({ name, label: titleize(name) })),
    },
    {
      name: "business",
      label: "Negocio",
      events: business.map((name) => ({ name, label: titleize(name) })),
    },
  ],
};

// ── 3. Publicar ──────────────────────────────────────────────────────

const project =
  process.env.PROJECT ||
  execSync("gcloud config get-value project", { encoding: "utf8" }).trim();
if (!project || project === "(unset)") {
  throw new Error("No hay proyecto activo. Corré: gcloud config set project TU-PROYECTO");
}
const bucket = process.env.BUCKET || `${project}-lake`;
const destination = `gs://${bucket}/schemas/event-types.json`;

const dir = mkdtempSync(join(tmpdir(), "event-types-"));
try {
  const local = join(dir, "event-types.json");
  writeFileSync(local, JSON.stringify(catalog, null, 2));
  execSync(`gcloud storage cp "${local}" "${destination}"`, { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\nPublicado ${destination}`);
console.log(`  behavior: ${behavior.length} eventos · business: ${business.length} eventos`);
console.log(`  ${[...behavior, ...business].join(", ")}`);
