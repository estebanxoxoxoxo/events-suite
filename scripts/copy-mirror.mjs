// Copia el espejo de la suite al host: eventsSuiteMirror.tsx → <host>/src/
//
// El espejo es el ÚNICO archivo de la app que importa de events-suite, y por
// eso tiene que vivir del lado del host: si viviera adentro del submódulo,
// cada import de la app entraría a la suite y la regla no significaría nada.
// La suite guarda el original; el host se queda con la copia.
//
//   node scripts/copy-mirror.mjs

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const suiteDir = dirname(dirname(fileURLToPath(import.meta.url)));
const hostRoot = dirname(suiteDir);
const source = join(suiteDir, "eventsSuiteMirror.tsx");
const target = join(hostRoot, "src", "eventsSuiteMirror.tsx");

if (!existsSync(source)) {
  console.error(`NO_ESTA  ${source}`);
  process.exit(1);
}

const igual = existsSync(target) && readFileSync(source, "utf8") === readFileSync(target, "utf8");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`${igual ? "YA_ESTABA_IGUAL" : "COPIADO"}  ${target}`);
