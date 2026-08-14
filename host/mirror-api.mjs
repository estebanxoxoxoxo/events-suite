// Espejo del api/ de la suite en la raíz del host — copia exacta.
//
// POR QUÉ EXISTE: Vercel solo descubre funciones serverless en el `api/` de la
// raíz del proyecto. La suite vive en un submódulo, así que sus funciones son
// invisibles para el deploy; esta copia es el puente.
//
// POR QUÉ COPIA Y NO RE-EXPORTA: Vercel empaqueta cada fichero de `api/` por
// separado, y un import relativo a una carpeta hermana ya reventó con
// ERR_MODULE_NOT_FOUND (está anotado en send-server-event.ts). Las funciones de
// la suite están escritas self-contained justamente para que copiarlas alcance.
//
// La fuente es la suite: el `api/` del host no se edita, se regenera.
//
// USO, desde la raíz del host:
//   node events-suite/host/mirror-api.mjs           copia
//   node events-suite/host/mirror-api.mjs --check   no escribe; falla si difiere (CI)
//
// Marcadores: ESPEJO_OK · ESPEJO_DESACTUALIZADO

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SUITE_API = fileURLToPath(new URL("../api/", import.meta.url));
const HOST_API = join(process.cwd(), "api");
const check = process.argv.includes("--check");

// Se compara sin finales de línea porque git los reescribe: en Windows un clon
// fresco deja el archivo con CRLF y el de la suite es LF, y --check gritaría
// para siempre por una diferencia que no existe. La escritura sí es byte a byte.
const sinEOL = (buf) => buf.toString("utf8").replace(/\r\n/g, "\n");

const files = readdirSync(SUITE_API).filter((f) => f.endsWith(".ts"));
const rotos = [];

if (!check) mkdirSync(HOST_API, { recursive: true });

for (const file of files) {
  const origen = readFileSync(join(SUITE_API, file));
  const destino = join(HOST_API, file);
  const actual = existsSync(destino) ? readFileSync(destino) : null;

  if (actual && sinEOL(actual) === sinEOL(origen)) {
    console.log(`sin cambios   api/${file}`);
  } else if (check) {
    rotos.push(file);
    console.log(`${actual ? "DIFIERE      " : "FALTA        "} api/${file}`);
  } else {
    writeFileSync(destino, origen);
    console.log(`${actual ? "actualizado " : "copiado     "}  api/${file}`);
  }
}

if (rotos.length > 0) {
  console.log(`\nESPEJO_DESACTUALIZADO — ${rotos.length} de ${files.length}. Corré: node events-suite/host/mirror-api.mjs`);
  process.exit(1);
}
console.log(`\nESPEJO_OK — ${files.length} función(es) en api/`);
