// Copia las funciones serverless de la suite al host: api/ → <host>/api/
//
// POR QUÉ EXISTE: Vercel descubre funciones SOLO en el `api/` de la raíz del
// proyecto. La suite vive en un submódulo, así que las suyas son invisibles para
// el deploy; esta copia es el puente. La fuente es la suite: el `api/` del host
// no se edita, se regenera.
//
// POR QUÉ COPIA Y NO RE-EXPORTA: Vercel empaqueta cada fichero de `api/` por
// separado, y un import relativo a una carpeta hermana revienta con
// ERR_MODULE_NOT_FOUND (anotado en send-server-event.ts). Las funciones están
// escritas self-contained justamente para que copiarlas alcance.
//
//   node scripts/copy-api.mjs           copia
//   node scripts/copy-api.mjs --check   no escribe; falla si difiere (CI)
//
// Marcadores: ESPEJO_OK · ESPEJO_DESACTUALIZADO

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// desde la ubicación del script, no desde el cwd: `npm run prepare` corre con el
// cwd adentro de la suite, y ahí un process.cwd() apuntaría el destino al propio
// origen — comparaba los archivos contra sí mismos y nunca copiaba nada
const suiteDir = dirname(dirname(fileURLToPath(import.meta.url)));
const SUITE_API = join(suiteDir, "api");
const HOST_API = join(dirname(suiteDir), "api");
const check = process.argv.includes("--check");

// Se compara sin finales de línea porque git los reescribe: en Windows un clon
// fresco deja el archivo con CRLF y el de la suite es LF, y --check gritaría
// para siempre por una diferencia que no existe. La escritura sí es byte a byte.
const sinEOL = (buf) => buf.toString("utf8").replace(/\r\n/g, "\n");

if (!existsSync(SUITE_API)) {
  console.error(`NO_ESTA  ${SUITE_API}`);
  process.exit(1);
}

const files = readdirSync(SUITE_API).filter((f) => f.endsWith(".ts"));
const rotos = [];

if (!check) mkdirSync(HOST_API, { recursive: true });

for (const file of files) {
  const origen = readFileSync(join(SUITE_API, file));
  const destino = join(HOST_API, file);
  const actual = existsSync(destino) ? readFileSync(destino) : null;

  if (actual && sinEOL(actual) === sinEOL(origen)) {
    console.log(`sin cambios    api/${file}`);
  } else if (check) {
    rotos.push(file);
    console.log(`${actual ? "DIFIERE       " : "FALTA         "}api/${file}`);
  } else {
    writeFileSync(destino, origen);
    console.log(`${actual ? "actualizado   " : "copiado       "}api/${file}`);
  }
}

if (rotos.length > 0) {
  console.log(`\nESPEJO_DESACTUALIZADO — ${rotos.length} de ${files.length}. Corré: npm run copy:api`);
  process.exit(1);
}
// resto de la versión vieja de este paso, cuando era `cp -r ./api ../api/`
if (existsSync(join(HOST_API, "api"))) {
  console.log(`OJO  sobró ${join(HOST_API, "api")} de una corrida vieja: borralo`);
}
console.log(`\nESPEJO_OK — ${files.length} función(es) en ${HOST_API}`);
