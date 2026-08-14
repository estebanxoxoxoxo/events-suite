# Contexto del proyecto

Este repo es **events-suite**: el sistema de analítica de comportamiento y de negocio del navegador (`README.md`), más todo lo que necesita del mundo para transmitir — el cableado del host (`host/`), las funciones serverless (`api/`) y el pipeline del otro lado del cable (`infra/`).

Se consume como **submódulo de git**. El primer host es la landing de Smarty (repo `smarty-landing`), que lo monta en `events-suite/` y habla con él por un solo archivo: el espejo `src/eventsSuiteMirror.tsx`.

## Pipeline de analytics

**Flujo:** SDK JS (rudder-analytics) → `POST /v1/batch` → Vector en EC2 → S3 en dos capas:
- **raw** — el JSON crudo de cada request, tal como llegó.
- **bronze** — Parquet con envelope de 17 columnas (esquema `bronze_v1`), un registro por evento ya spliteado del batch. Incluye `group_id` y `previous_id`.

Flush a S3 cada 10 minutos o al apagar Vector.

Al lado de esas dos capas vive `schemas/<v>/bronze_v1.schema`: el esquema publicado en el propio lake, versionado por carpeta (`1`, `2`, …), para poder leer el Parquet sin depender de la instancia. Lo publica `infra/cloudshell/publish-schema.sh` (deduce bucket y altura de `vector.yaml`). El catálogo de eventos lo publica `scripts/publish-event-types.mjs` — la suite es dueña de sus enums.

**Reglas no negociables del SDK** (el porqué está en el README):
- Batch obligatorio: `queueOptions.batch.enabled: true`.
- Sin beacon y sin `page()` automático — `page()` se llama manualmente. Ojo: eso NO aplica a `sessions.autoTrack`, que va **activo** (30 min de inactividad) y es quien pone `context.sessionId` en cada evento.
- writeKey validado por header (base64) en el edge.

**Capa plata (diseñada, no construida):** traits en `context.traits`, dedup por `event_id` (el de la suite, en `properties` — no el `message_id` de la raíz, que lo genera el SDK al despachar), particionado por fecha.

**Observabilidad:** taps de consola por etapa en el journal de Vector — una línea JSON `{"stage":"INGEST",...}` por request recibido, una `{"stage":"TRANSFORM",...}` por evento individual (un batch de N = 1 INGEST + N TRANSFORM), y el debug de `aws_smithy_runtime` loguea cada PutObject a S3. Ver en vivo: `journalctl -u vector -f`. Es logging por evento: con volumen alto se apaga quitando el sink `console_taps` y borrando `logging.conf`.

## Infra

| Qué | Dónde |
|---|---|
| EC2 | `i-0c3181f7280153931` · `us-east-1` · IP pública `44.207.109.162` |
| Vector | servicio systemd; config `/etc/vector/vector.yaml`, esquema `/etc/vector/bronze_v1.schema` |
| Ingest | `http://127.0.0.1:8080/v1/batch` (aún no público) |
| Log level | drop-in `/etc/systemd/system/vector.service.d/logging.conf` (`VECTOR_LOG=info,aws_smithy_runtime=debug`) |

## Mecanismo de deploy al servidor

No hay acceso directo a la instancia desde esta máquina. Todo cambio se entrega como **dos bloques bash para pegar en AWS CloudShell**:

1. Un heredoc `cat > X.sh << 'OUTER' … OUTER` con el script completo.
2. El despacho: `aws ssm send-command` (AWS-RunShellScript) + `aws ssm get-command-invocation` para traer el output.

Cada script debe ser **idempotente** (guard `grep … && echo YA_EXISTE`), con **backup + `vector validate` + rollback** automático, y **autoverificable**: imprime `VALIDATE_OK` / `SVC_active` / `CURL_200` y manda un evento de prueba con curl. Un cambio cuenta como desplegado solo cuando el output muestra esos marcadores. Para comandos sueltos existe `bash run.sh "…"` en CloudShell. Convención: todo script de ops nace en `infra/` y a CloudShell solo se copia.

## Estado al 2026-08-14

- **Split del repo (2026-08-14)**: la suite salió de `smarty-landing` a este repo propio, con su historia (`git subtree split`). Se llevó `api/` completa (incluidas `register` / `failed-lead` / `firebase-config`, que son del registro de la landing y quedaron acá por decisión explícita), `infra/` y el cableado del dataplane que estaba en el `vite.config.js` y el `public/` de la landing, ahora en `host/`. La landing quedó con la landing, el submódulo y el espejo.
- Core del pipeline: desplegado y verificado. Columnas `group_id`/`previous_id` y logging por etapa **confirmados**: los eventos de prueba `test-g1` y `test-log1` aparecen en bronze en S3.
- La suite es el **único motor Meta** desde que se retiró `facebook-api-template` (2026-08-03): su copia vive en `3-delivery/pushers/fb/`. Las conversiones directas (PageView/ViewContent/Lead) salen por `pushEvent`/`FbEvent`, fuera del gateway.
- Mapping de Meta conservador: **Lead excluido a propósito** del pusher — ya lo dispara el flujo de registro del host con `eventId = attemptId`.
- writeKey `LTlHrScEJw3Xe47zz4tw3NjWLjS` — vive en el host (`src/config.js` de la landing) y tiene que coincidir con el que sirve `host/vite.js` y con el que valide Caddy.

## Pendiente

1. **Repo remoto**: crear el repositorio en GitHub y apuntar el submódulo del host (`git submodule set-url events-suite <url>`); hoy apunta al path local del Escritorio.
2. **Abrir tcp/8080 del security group** — interino hasta Caddy, sin validación de writeKey.
3. **Redeploy en Vercel** para activar los rewrites de `/v1/batch` y `/sourceConfig` (verificar que Vercel acepte destino `http://`; si no, esperar a Caddy).
4. **Dominio** con registro A → `44.207.109.162`, luego **Caddy** (TLS + CORS + validación del writeKey) y cerrar 8080.
5. **Identidad post-login**: `setLoginMetadata({ user_id, email, method })` sigue interna; falta cablearla al flujo de auth del host y exponerla en el ctx del Provider.
