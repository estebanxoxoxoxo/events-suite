// Espejo del api/ de la suite en la raíz del host.
//
// POR QUÉ EXISTE: Vercel solo descubre funciones serverless en el `api/` de la
// raíz del proyecto. La suite vive en un submódulo, así que sus funciones son
// invisibles para el deploy. Este script las copia a la raíz del host — es el
// mismo espejo que `eventsSuiteMirror.tsx`, del lado del servidor: el host es
// dueño de un archivo por función, y la suite sigue siendo la fuente.
//
// POR QUÉ COPIA Y NO RE-EXPORTA: Vercel empaqueta cada fichero de `api/` por
// separado, y un import relativo a una carpeta hermana ya reventó con
// ERR_MODULE_NOT_FOUND (está anotado en el encabezado de send-server-event.ts).
// Las funciones de la suite están escritas self-contained justamente para que
// copiarlas alcance: ninguna importa por path relativo.
//
// USO, desde la raíz del host:
//   node events-suite/host/mirror-api.mjs                  genera/actualiza ./api
//   node events-suite/host/mirror-api.mjs --check          no escribe: falla si hay drift
//   node events-suite/host/mirror-api.mjs --only send-server-event,get-vercel-session-metadata
//   node events-suite/host/mirror-api.mjs --out functions  otro directorio de salida
//   node events-suite/host/mirror-api.mjs --force          pisa archivos propios del host
//
// Conviene dejarlo como script del host (`"mirror:api": "node events-suite/host/mirror-api.mjs"`)
// y correr `--check` en CI: si alguien edita el espejo en vez de la suite, se ve.
//
// Marcadores de verificación: ESPEJO_OK · ESPEJO_DESACTUALIZADO · ESPEJO_CONFLICTO.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SUITE_API = fileURLToPath(new URL("../api/", import.meta.url));
const MARKER = "GENERADO por events-suite/host/mirror-api.mjs";

// ── argumentos ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const valueOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 || i === args.length - 1 ? fallback : args[i + 1];
};

const check = has("--check");
const force = has("--force");
const outDir = resolve(process.cwd(), valueOf("--out", "api"));
const onlyRaw = valueOf("--only", null);
const only = onlyRaw ? onlyRaw.split(",").map((s) => s.trim()).filter(Boolean) : null;

// ── qué se espeja ────────────────────────────────────────────────────────────

const available = readdirSync(SUITE_API).filter((f) => f.endsWith(".ts"));

if (only) {
  const unknown = only.filter((name) => !available.includes(`${name}.ts`));
  if (unknown.length > 0) {
    console.error(`No existen en la suite: ${unknown.join(", ")}`);
    console.error(`Disponibles: ${available.map((f) => basename(f, ".ts")).join(", ")}`);
    process.exit(1);
  }
}

const wanted = only ? only.map((name) => `${name}.ts`) : available;

// El encabezado va arriba de la copia: sin fecha ni datos volátiles, para que
// regenerar dos veces dé exactamente el mismo byte y --check sea confiable.
const header = (file) => `// ─────────────────────────────────────────────────────────────────────────────
// ${MARKER} — NO EDITAR A MANO.
// Copia de events-suite/api/${file}. Vercel solo descubre funciones en el api/
// de la raíz, y la suite vive en un submódulo: este archivo es el puente.
// Para cambiar la lógica: editá la suite y regenerá.
// ─────────────────────────────────────────────────────────────────────────────

`;

const expected = new Map(
  wanted.map((file) => [file, header(file) + readFileSync(join(SUITE_API, file), "utf8")])
);

// ── estado actual del host ───────────────────────────────────────────────────

const current = (file) => {
  const path = join(outDir, file);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

const faltan = [];
const desactualizados = [];
const alDia = [];
const conflictos = []; // archivo del host con el mismo nombre, escrito a mano

for (const [file, content] of expected) {
  const actual = current(file);
  if (actual === null) faltan.push(file);
  else if (actual === content) alDia.push(file);
  else if (!actual.includes(MARKER)) conflictos.push(file);
  else desactualizados.push(file);
}

// Espejos que sobraron: quedaron de una función que la suite ya no tiene.
const huerfanos = existsSync(outDir)
  ? readdirSync(outDir).filter(
      (f) =>
        f.endsWith(".ts") &&
        !available.includes(f) &&
        (current(f) || "").includes(MARKER)
    )
  : [];

const rel = (path) => relative(process.cwd(), path).replace(/\\/g, "/") || ".";

// ── --check: no escribe, solo reporta ────────────────────────────────────────

if (check) {
  for (const f of faltan) console.log(`FALTA         ${rel(join(outDir, f))}`);
  for (const f of desactualizados) console.log(`DESACTUALIZADO ${rel(join(outDir, f))}`);
  for (const f of conflictos) console.log(`CONFLICTO     ${rel(join(outDir, f))} (propio del host, sin encabezado generado)`);
  for (const f of huerfanos) console.log(`HUÉRFANO      ${rel(join(outDir, f))} (ya no existe en la suite)`);

  const roto = faltan.length + desactualizados.length + conflictos.length + huerfanos.length;
  if (roto > 0) {
    console.log(`\nESPEJO_DESACTUALIZADO — ${roto} archivo(s). Corré: node events-suite/host/mirror-api.mjs`);
    process.exit(1);
  }
  console.log(`ESPEJO_OK — ${alDia.length} función(es) al día en ${rel(outDir)}/`);
  process.exit(0);
}

// ── escritura ────────────────────────────────────────────────────────────────

if (conflictos.length > 0 && !force) {
  for (const f of conflictos) console.error(`CONFLICTO ${rel(join(outDir, f))} — existe y no lo generó este script.`);
  console.error(`\nESPEJO_CONFLICTO — no piso archivos propios del host. Movelos, o pasá --force.`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

for (const [file, content] of expected) {
  const actual = current(file);
  if (actual === content) {
    console.log(`sin cambios   ${rel(join(outDir, file))}`);
    continue;
  }
  writeFileSync(join(outDir, file), content);
  console.log(`${actual === null ? "creado      " : "actualizado "}  ${rel(join(outDir, file))}`);
}

for (const f of huerfanos) {
  console.log(`HUÉRFANO      ${rel(join(outDir, f))} — la suite ya no tiene esa función; borralo a mano.`);
}

console.log(`\nESPEJO_OK — ${expected.size} función(es) en ${rel(outDir)}/`);

// Las dos que escriben en Firestore son las únicas con una dependencia npm.
if (["register.ts", "failed-lead.ts"].some((f) => expected.has(f))) {
  console.log(`Recordá: register y failed-lead necesitan firebase-admin en las deps del host.`);
}
