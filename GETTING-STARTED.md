# Getting started — implementar events-suite en un proyecto

Qué hacer, en orden, para que una app pase de no medir nada a tener detección
de comportamiento + eventos de negocio viajando al pipeline propio y a Meta.
El **qué es y por qué** está en el [README](./README.md); esto es el **cómo**.

Toma ~15 minutos. Los pasos 1 a 5 son obligatorios; el 6 es lo que hace falta
para que además **transmita** (sin él la suite mide y no sale nada a la red).

> Ejemplo vivo de todos estos pasos: el repo `smarty-landing`.

---

## 0. Qué necesita el host

- **React ≥ 18** — solo para el binding (Provider, hook, reader). El core no lo usa.
- **Un bundler** — Vite viene cableado de fábrica (`host/vite.js`). Con otro, hay
  que reimplementar tres endpoints de dev; la suite no cambia.
- **Funciones serverless estilo Vercel** — para la CAPI de Meta y la geo/IP de
  sesión. En otro hosting se reimplementan los dos endpoints con su `supplier`.

La suite **no tiene build ni dependencias propias**: se consume como fuente
TypeScript y la compila el bundler del host.

---

## 1. Sumar la suite como submódulo

```bash
git submodule add https://github.com/estebanxoxoxoxo/events-suite.git events-suite
git config -f .gitmodules submodule.events-suite.branch main
git add .gitmodules events-suite && git commit -m "chore: events-suite como submodulo"
```

Dos detalles que importan:

1. **La carpeta tiene que llamarse `events-suite`**, en la raíz del host. El
   espejo del paso 3 resuelve `../events-suite` desde `src/`; si la ponés en otro
   lado, ajustá esa única línea.
2. La línea de `branch` no es obligatoria (git usa el HEAD del remoto), pero deja
   escrito de qué rama se actualiza y sobrevive a que el remoto cambie su default.

---

## 2. Instalar las dependencias — en el host, no en el submódulo

```bash
pnpm add react react-dom
pnpm add @rudderstack/analytics-js   # pipeline propio
pnpm add firebase                    # solo si vas a usar presencia en vivo
pnpm add firebase-admin              # solo si espejás register / failed-lead
```

**Por qué en el host y no adentro de la suite.** La suite se consume como
**fuente**, no como paquete compilado: sus imports los resuelve el bundler del
host, buscando `node_modules` hacia arriba desde el archivo que importa. Si la
suite tuviera su propio `node_modules`, cada paquete terminaría **dos veces** en
el bundle.

Con `react` eso no es peso de más, es rotura: el `EventsSuiteProvider` crearía su
contexto con la copia del submódulo y tu `useEventsSuite()` lo leería desde la de
la raíz — dos objetos distintos, hook en null. Es la razón por la que toda
librería de React declara `react` como *peer*. Con `firebase` y
`@rudderstack/analytics-js` es menos brutal pero igual de indeseable: dos copias
del SDK, y en rudder dos instancias del singleton peleando por la misma cola.

`firebase-admin` ni siquiera tiene la opción: corre en las funciones de Vercel,
que se construyen contra el `package.json` de la **raíz** del proyecto — el del
submódulo no existe para ese build.

Por eso el `package.json` de la suite las declara como `peerDependencies` (las
tres últimas, opcionales) y **no instala nada**. Si en algún momento ves un
`events-suite/node_modules/`, algo se instaló donde no va.

Las dos del medio entran además por **import dinámico**: si tu `startDelivery` no
las enciende, no se descargan.

---

## 3. El espejo del cliente — la regla de oro

Copiá [`eventsSuiteMirror-template`](./eventsSuiteMirror-template) a tu app como
`src/eventsSuiteMirror.tsx` y descomentá sus dos líneas:

```tsx
// src/eventsSuiteMirror.tsx
export { EventsSuiteProvider, useEventsSuite, BusinessEventNames, pushEvent, FbEvent } from '../events-suite';
export type { EventsSuiteCtx, StartDeliveryConfig, BusinessEventPayload } from '../events-suite';
```

**Este es el único archivo de la app que importa de `events-suite`.** Todo lo
demás importa del espejo. Así, si la suite se mueve, se renombra o cambia de
forma, la app toca un archivo y nada más. Es verificable con un grep:

```bash
grep -rn "from '\.\./events-suite'" src/   # tiene que dar exactamente 2 líneas, las de arriba
```

---

## 4. Montar el Provider en la raíz del árbol

Y **solo en la rama que querés medir**:

```jsx
// src/main.jsx
import { EventsSuiteProvider } from './eventsSuiteMirror';

createRoot(document.getElementById('root')).render(
  <EventsSuiteProvider reader>   {/* reader: visor de debug con los últimos 10 eventos; apagalo en prod */}
    <App />
  </EventsSuiteProvider>
);
```

Con el import ya está midiendo (auto-init, cero red). El Provider habilita el
**uso**: el hook y el reader.

---

## 5. Encender delivery una vez, en el componente raíz

```jsx
// src/App.jsx
import { useEventsSuite } from './eventsSuiteMirror';
import { ANALYTICS_WRITE_KEY } from './config';

const suite = useEventsSuite();
useEffect(() => {
  suite.startDelivery({
    rudderStackWriteKey: ANALYTICS_WRITE_KEY,  // → pipeline propio (Vector → S3/lake)
    fb: true,                                  // → Meta (pixel + CAPI, mismo eventID)
    vercelMetadataCollect: true,               // → geo/IP de sesión
    activeSessions: 'https://…firebaseio.com', // → presencia en vivo (opcional)
  });
}, [suite]);
```

La writeKey **vive en la app**, nunca en la suite. Sin este paso la suite mide
igual; simplemente nada sale a la red — que es también el gate natural para
consentimiento: llamalo recién cuando el usuario acepte.

---

## 6. Cablear el host (esto es lo que hace que transmita)

### 6.1 Build y dev — una línea

```js
// vite.config.js
import { eventsSuiteVite } from './events-suite/host/vite.js'
import { ANALYTICS_WRITE_KEY } from './src/config.js'

export default defineConfig({
  plugins: [react(), ...eventsSuiteVite({ writeKey: ANALYTICS_WRITE_KEY, sourceName: 'mi-app' })],
})
```

Eso sirve `/sourceConfig` y proxya `/v1/batch` en dev y preview, mockea los dos
endpoints de `api/`, emite `sourceConfig.json` en el build y fuerza recarga
completa al editar la suite.

### 6.2 El espejo del servidor — `api/` en la raíz

Vercel **solo descubre funciones en el `api/` de la raíz del proyecto**: las de
la suite viven en el submódulo y son invisibles para el deploy. El puente es una
copia exacta:

```bash
node events-suite/host/mirror-api.mjs         # copia api/ de la suite a ./api
node events-suite/host/mirror-api.mjs --check # falla si difiere (para CI)
```

Se **commitea** el `api/` copiado: Vercel lo necesita en el repo. Y no se edita
—se regenera—, que es lo que verifica `--check`.

Copia las cinco funciones. Tres son del registro con Google de Smarty
(`register`, `failed-lead`, `firebase-config`): si tu app no lo usa, quedan
deployadas pero inertes — sin `FIREBASE_SERVICE_ACCOUNT` en las env el handler
corta y devuelve 500 sin tocar nada.

Detalle: copia y no re-exporta porque Vercel empaqueta cada fichero de `api/`
por separado y los imports relativos a carpetas hermanas revientan con
`ERR_MODULE_NOT_FOUND`. Todo el porqué, en [`host/README.md`](./host/README.md).

### 6.3 Rewrites de producción

Copiá los de [`host/vercel.json`](./host/vercel.json) a tu `vercel.json`, antes
del catch-all del SPA. El SDK pide `/sourceConfig` **con y sin barra final**.

### 6.4 Variables de entorno del server

`META_PIXEL_ID` y `META_ACCESS_TOKEN` para la CAPI. Sin ellas responde 500 y solo
cuenta el pixel: degrada sin duplicar. `META_TEST_EVENT_CODE` solo para probar en
Events Manager — vacío en producción.

### 6.5 El pixel en el HTML

El snippet de `fbq` en el `<head>`. La suite lo **usa**; no lo instala.

---

## 7. Emitir eventos de negocio y etiquetar componentes

```tsx
const suite = useEventsSuite();
suite.pushBusinessEvent(BusinessEventNames.RegisterButtonClick);
suite.pushBusinessEvent(BusinessEventNames.SubscribeClick, { metadata: { source, attempt_id } });
```

```html
<section data-analytics-id="problema">…</section>
```

El `data-analytics-id` habilita `component_focus`. Los eventos de
**comportamiento** (scroll, rage click, bounce…) los emiten las FSMs: desde la
app **no se emiten nunca**.

Los módulos que no son componentes (auth, helpers) tampoco emiten: el emit se
sube al componente que los llama, así el hook alcanza y esos módulos quedan
libres de tracking.

---

## 8. Los scripts de `package.json`

Este bloque es el que hace que el submódulo no se olvide nunca:

```json
{
  "scripts": {
    "postinstall": "git submodule update --init --recursive",
    "suite:update": "git submodule update --remote --merge events-suite",
    "mirror:api": "node events-suite/host/mirror-api.mjs",
    "mirror:api:check": "node events-suite/host/mirror-api.mjs --check"
  }
}
```

| Script | Cuándo corre | Qué hace |
|---|---|---|
| `postinstall` | solo, después de cada `install` | Trae la suite si falta y la deja en el commit que el repo fijó. **Es la red de seguridad**: nadie tiene que acordarse de nada. |
| `suite:update` | a mano, cuando querés la última | Mueve el puntero a la punta de `main` de la suite. Deja un cambio para commitear. |
| `mirror:api` | tras `suite:update`, o al sumar una función | Regenera el `api/` de la raíz. |
| `mirror:api:check` | en CI | Falla si alguien editó el espejo en vez de la suite. |

Si preferís que un `install` **jamás** falle por esto (máquinas sin git, tarballs):

```json
"postinstall": "git submodule update --init --recursive || echo submodulos omitidos"
```

---

## 9. ¿Alcanza con que exista `.gitmodules`?

**No.** Es la pregunta que todo el mundo se hace y la respuesta importa, porque
el modo en que falla es silencioso: no hay error, simplemente la carpeta está
vacía y el build muere con un import que no resuelve.

Verificado contra el repo real:

| Comando | Resultado |
|---|---|
| `git clone <repo>` | `events-suite/` con **0 archivos**. `git submodule status` lo marca con `-`. |
| `git clone --recurse-submodules <repo>` | la suite completa, en el commit fijado |
| `git submodule update --init --recursive` | idem, sobre un clon que ya existía |

Tres formas de que no te pase, de menos a más robusta:

1. **Clonar bien**: `git clone --recurse-submodules <repo>`. Depende de que la persona se acuerde.
2. **Por máquina**: `git config --global submodule.recurse true`. Hace que `pull`, `checkout`, `switch` y `reset` arrastren los submódulos — pero **NO aplica a `clone`** (git lo excluye a propósito).
3. **Por repo, la buena**: el `postinstall` del paso 8. Todo el mundo corre `install` después de clonar, y ahí se resuelve solo, en cualquier máquina y sin configurar nada.

En **Vercel** no hay que hacer nada: clona los submódulos accesibles con la misma
credencial del repo. Si la suite fuera privada, hay que darle acceso también a
ese repo.

---

## 10. Actualizar la suite

Un submódulo apunta a un **commit exacto**, no a una rama. Eso es deliberado: un
build de hace tres meses se reconstruye igual que entonces. La contracara es que
"tener lo último" es un acto explícito:

```bash
pnpm suite:update              # trae la punta de main de la suite
pnpm mirror:api                # si cambiaron las funciones de api/
git add events-suite api       # el puntero nuevo (y el espejo, si se movió)
git commit -m "chore: bump events-suite"
```

Cuando **otra persona** movió el puntero y vos hacés `git pull`:

```bash
git pull && git submodule update --init --recursive
```

(o `git config --global submodule.recurse true` una vez y `git pull` ya lo hace).

Para tocar la suite en sí: se edita dentro de `events-suite/`, se commitea y
pushea **en su repo**, y recién ahí el host commitea el puntero nuevo. Un commit
del host apuntando a un commit que no está pusheado deja el repo roto para todos
los demás — es el error clásico de submódulos.

---

## 11. Verificación — qué tiene que pasar

**En dev** (`pnpm dev`):

1. `curl localhost:5173/sourceConfig` → 200 con tu writeKey. Con barra final también.
2. `curl localhost:5173/api/get-vercel-session-metadata` → el mock con `supplier: "dev"`.
3. El **reader** abajo a la derecha mostrando eventos al scrollear.
4. En la pestaña Network, `POST /v1/batch` cada pocos segundos (el SDK batchea).

**En el build** (`pnpm build`):

5. `dist/sourceConfig.json` existe y tiene tu writeKey.

**En producción**:

6. `/v1/batch` responde 200 (rewrite al ingestador).
7. Events Manager de Meta muestra el evento **una sola vez** — si aparece
   duplicado, el pixel y la CAPI no están compartiendo `eventID`.
8. Los eventos llegan a raw/bronze del lake.

---

## Qué NO hacer

- Importar de `events-suite` fuera del espejo.
- Emitir eventos de comportamiento desde la app: son territorio de las FSMs.
- Editar el `api/` generado en vez de la suite (para eso está `mirror:api:check`).
- Mapear `Lead` en el pusher de FB si tu flujo de registro ya lo dispara:
  contarías la conversión dos veces.
- Commitear un puntero de submódulo cuyo commit no esté pusheado.
