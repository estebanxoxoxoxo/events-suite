# Getting started

Host: Vite + React. Todo lo que sigue se toca en el host, nunca adentro del submódulo.

## 1. La suite como submódulo

```bash
git submodule add https://github.com/estebanxoxoxoxo/events-suite.git events-suite
```

La carpeta de la suite tiene que llamarse `events-suite`: el espejo resuelve por ese path.

## 2. `prepare`, adentro de la suite

```bash
cd events-suite && npm run prepare
```

Cuatro cosas, todas sobre el script prepare: copia `api/` a la raíz, escribe el `.gitmodules`, copia el espejo a `src/eventsSuiteMirror.tsx` e instala las peer (`react`, `firebase`, `firebase-admin`, `@rudderstack/analytics-js`).

## 3. Las dos constantes del host

Van en `src/config.js` (o donde el host tenga su config). Las dos son **públicas**: viajan en el bundle.

```js
// src/config.js
// La pide el SDK como argumento de load(): sin ella el pusher no arranca y la
// suite mide sin transmitir. No es un secreto ni te la emite nadie — viaja en
// el bundle. Poné el nombre de tu app y seguí.
export const ANALYTICS_WRITE_KEY = 'mi-app';

// El databaseURL sale de la consola de Firebase → Realtime Database.
export const ACTIVE_SESSIONS_DB = 'https://<TU-PROYECTO>-default-rtdb.firebaseio.com';
```

El writeKey vive acá y nunca en la suite: los pasos 4 y 6 lo importan de este
archivo, así que lo único que tiene que cumplir es coincidir consigo mismo. No
hay nada que pedir ni que dar de alta.

## 4. `vite.config.js`

El archivo completo. Dos líneas de import y el spread en `plugins`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { eventsSuiteVite } from './events-suite/host/vite.js'
import { ANALYTICS_WRITE_KEY } from './src/config.js'

export default defineConfig({
  plugins: [
    react(),
    ...eventsSuiteVite({
      writeKey: ANALYTICS_WRITE_KEY,
      sourceName: '<nombre-de-tu-app>',   // etiquetan el evento en el pipeline
      workspace: '<tu-workspace>',
    }),
  ],
})
```

Es un spread porque el plugin son varios. Sirve el dataplane same-origin en dev y emite el `sourceConfig.json` al buildear.

## 5. El Provider

```jsx
// src/main.jsx
import { EventsSuiteProvider } from './eventsSuiteMirror';

<EventsSuiteProvider reader>   {/* visor de los últimos 10 eventos: apagar en prod */}
  <App />
</EventsSuiteProvider>
```

Montalo solo en la rama que querés medir.

## 6. `startDelivery`, una sola vez

```jsx
// src/App.jsx
import { ACTIVE_SESSIONS_DB, ANALYTICS_WRITE_KEY, BRAND } from './config';

const suite = useEventsSuite();
useEffect(() => {
  suite.startDelivery({
    rudderStackWriteKey: ANALYTICS_WRITE_KEY,
    fb: true,                                 // Meta: pixel + CAPI
    vercelMetadataCollect: true,              // geo/IP de sesión
    activeSessions: ACTIVE_SESSIONS_DB,       // presencia en vivo (RTDB)
  });
}, [suite]);
```

Hasta acá la suite mide y no transmite. Es el lugar del consentimiento: llamalo cuando el usuario acepte.

## 7. `vercel.json`

El archivo completo. Los tres primeros rewrites son de la suite; el último es el del SPA y va al final, porque el primero que matchea gana:

```json
{
  "rewrites": [
    { "source": "/v1/batch", "destination": "https://<TU-INGESTOR>/v1/batch" },
    { "source": "/sourceConfig", "destination": "/sourceConfig.json" },
    { "source": "/sourceConfig/", "destination": "/sourceConfig.json" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

`/v1/batch` es el endpoint del ingestor: sin eso, en producción no sale nada. El SDK pide `/sourceConfig` con barra final y sin, por eso están los dos. Y el del SPA excluye `api/` para no comerse las funciones.

## 8. Entorno del hosting

| Variable | Para qué |
|---|---|
| `META_PIXEL_ID`, `META_ACCESS_TOKEN` | la CAPI de Meta |
| `FIREBASE_SERVICE_ACCOUNT` | el JSON del service account: `register` y `failed-lead` |
| `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` | config web de Firebase |

Y el snippet de `fbq` en el `index.html`: la suite usa el pixel, no lo instala.

## 9. Emitir y etiquetar


Eventos de comportamiento: No requiere setting, excepto component focus que se agrega un id especial en el componente html en cuestion:
```html
<section data-analytics-id="problema">…</section>
```

Evento de negocio. Ejemplo:
```tsx
const suite = useEventsSuite();
suite.pushBusinessEvent(BusinessEventNames.SubscribeClick, { metadata: { source } });
```

## Verificación

- El visor del `reader` lista eventos al scrollear.
- `POST /v1/batch` responde 200 en la pestaña Network.
- `/sourceConfig` devuelve el JSON con tu writeKey.

## Actualizar la suite

```bash
git submodule update --remote events-suite
```

Mueve el puntero del submódulo: commitealo en el host.
