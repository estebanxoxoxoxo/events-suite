// Instala en el HOST las peer de la suite.
//
// Por qué existe: el submódulo no está en el grafo de dependencias del host, así
// que su package.json no lo lee ningún gestor y estas peer no las instala nadie.
// Son un contrato escrito que había que cumplir a mano, y cuando falta una no
// falla al instalar: falla al buildear, o —peor— en producción nada más. Pasó
// con `firebase-admin`, que existía en node_modules como resto de una
// instalación vieja y no estaba en el lockfile.
//
// La lista sale del propio package.json de la suite: una sola fuente de verdad,
// nada de repetir nombres acá. Idempotente: lo que el host ya declara no se
// toca. El gestor se deduce del lockfile del host, porque mezclar pnpm con npm
// deja dos árboles distintos.
//
// Instala también las marcadas como opcionales en `peerDependenciesMeta`: la
// suite tal como se entrega usa las cuatro. Las marca en la salida para que se
// vea cuál podés sacar si tu host no las necesita.
//
//   node scripts/install-peers.mjs         # instala lo que falte
//   node scripts/install-peers.mjs --dry   # solo dice qué correría

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const suiteDir = dirname(dirname(fileURLToPath(import.meta.url)));
const hostRoot = dirname(suiteDir);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const hostPkgPath = join(hostRoot, "package.json");
if (!existsSync(hostPkgPath)) {
  console.error(`NO_ESTA  ${hostPkgPath} — ¿la suite está montada adentro del host?`);
  process.exit(1);
}

const suitePkg = readJson(join(suiteDir, "package.json"));
const peers = Object.entries(suitePkg.peerDependencies ?? {});
const meta = suitePkg.peerDependenciesMeta ?? {};

const hostPkg = readJson(hostPkgPath);
// declarada = la que sobrevive a un install limpio. Lo que esté suelto en
// node_modules sin declarar no cuenta: en el próximo build no va a estar.
const declared = { ...hostPkg.dependencies, ...hostPkg.devDependencies };

// el primero cuyo lockfile aparezca en el host; npm es el que queda si no hay
const MANAGERS = [
  { lock: "pnpm-lock.yaml", cmd: "pnpm", sub: "add" },
  { lock: "yarn.lock", cmd: "yarn", sub: "add" },
  { lock: "bun.lockb", cmd: "bun", sub: "add" },
  { lock: "package-lock.json", cmd: "npm", sub: "install" },
];
const manager = MANAGERS.find((m) => existsSync(join(hostRoot, m.lock))) ?? MANAGERS.at(-1);

const canRun = (cmd) => {
  try {
    execSync(`${cmd} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

// El gestor del lockfile puede no estar instalado: acá hay pnpm-lock.yaml y no
// hay pnpm. NO se cambia de gestor por eso — el lockfile es lo que mira Vercel
// para decidir con qué instala, así que agregar el paquete con otro dejaría el
// deploy sin él. Se lo corre por corepack, que viene con Node, o por npx.
const runner = canRun(manager.cmd)
  ? manager.cmd
  : canRun(`corepack ${manager.cmd}`)
    ? `corepack ${manager.cmd}`
    : `npx --yes ${manager.cmd}`;

for (const [name, range] of peers) {
  const estado = declared[name] ? `YA_ESTA  ${name}@${declared[name]}` : `FALTA    ${name}@${range}`;
  console.log(`  ${estado}${meta[name]?.optional ? "  (opcional)" : ""}`);
}

const missing = peers.filter(([name]) => !declared[name]);
if (missing.length === 0) {
  console.log(`NADA_QUE_HACER  el host ya declara las ${peers.length} peer`);
  process.exit(0);
}

// las comillas importan: un rango como >=18 sin comillas es una redirección
const command = `${runner} ${manager.sub} ${missing.map(([n, r]) => `"${n}@${r}"`).join(" ")}`;

if (process.argv.includes("--dry")) {
  console.log(`DRY  (en ${hostRoot})  ${command}`);
  process.exit(0);
}

console.log(`INSTALANDO  (en ${hostRoot})  ${command}`);
execSync(command, { cwd: hostRoot, stdio: "inherit" });
console.log(`INSTALADO  ${missing.map(([n]) => n).join(" ")}`);
