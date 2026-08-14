// Escribe el .gitmodules del HOST con la entrada de esta suite.
//
// Por qué existe: el submódulo se agrega con la URL que tenga a mano quien lo
// agregue, y si esa URL es un path local —como pasó acá al principio, apuntando
// al Escritorio— el repo clona bien en esa máquina y en ninguna otra. Vercel
// clona y no encuentra la suite: el build sale sin ella y sin ruido.
//
// Es idempotente y conserva los otros submódulos del host: reescribe SOLO el
// bloque de esta suite.
//
//   node scripts/write-gitmodules.mjs                 # URL por defecto
//   node scripts/write-gitmodules.mjs <url>           # o la que le pases
//   SUITE_URL=<url> node scripts/write-gitmodules.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://github.com/estebanxoxoxoxo/events-suite.git";

const suiteDir = dirname(dirname(fileURLToPath(import.meta.url)));
const hostRoot = dirname(suiteDir);
// el nombre del submódulo es la carpeta donde el host lo montó, no un fijo
const name = basename(suiteDir);
const url = process.argv[2] || process.env.SUITE_URL || DEFAULT_URL;

const target = join(hostRoot, ".gitmodules");
const block = `[submodule "${name}"]\n\tpath = ${name}\n\turl = ${url}\n`;

/** Los bloques de los OTROS submódulos, tal cual estaban. */
const otherBlocks = (contents) =>
  contents
    .split(/^(?=\[submodule )/m)
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => !b.startsWith(`[submodule "${name}"]`))
    .map((b) => `${b}\n`);

const previous = existsSync(target) ? readFileSync(target, "utf8") : "";
const next = [...otherBlocks(previous), block].join("");

if (previous === next) {
  console.log(`YA_ESTA  ${target}`);
} else {
  writeFileSync(target, next, "utf8");
  console.log(`${previous ? "ACTUALIZADO" : "CREADO"}  ${target}`);
}
console.log(`  [submodule "${name}"] path=${name} url=${url}`);
console.log("Recordá: el .gitmodules se commitea en el repo del HOST, no acá.");
