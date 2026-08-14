# Plataforma en Google Cloud — plan de acción

**Qué es esto**: la lista de **qué hay que crear, con qué características y en
qué orden** para que todo el Analizer viva en GCP. Es acumulativo: cada
iteración marca estados, agrega pasos y deja registro en la bitácora (§6).
Escrito para poder rehacerlo de cero.

Estados: ✅ hecho · 🔄 en curso · ⬜ pendiente · ⚠ hay que decidir algo

---

## 0. Orden de ejecución (lo que se hace ahora, en este orden)

Nada de esto toca producción: es infraestructura nueva y vacía. El sitio
sigue mandando eventos a la EC2 hasta el paso del DNS, que está mucho más
adelante.

La numeración es **estable**: los pasos no se renumeran entre iteraciones, sólo
cambia su estado. La lista se repite completa en cada iteración.

| Paso | Qué | Bloque | Estado |
|---|---|---|---|
| 0 | **Punto de partida — todo esto se hace desde Firebase**: (a) crear el proyecto de Firebase, que **crea por debajo el proyecto de Google Cloud**; (b) dentro de él, crear la base de **Firestore** (modo Native; la ubicación es irreversible → `nam5`); (c) dentro de él, crear la **Realtime Database** (`us-central1`, en modo bloqueado); (d) pasar el proyecto al plan **Blaze**, sin el cual no hay Compute, ni Monitoring por API, ni presupuestos | §1.5 | ✅ |
| 1 | Fijar el proyecto de trabajo: `data-analyzer-1c0fe` (D1) | §1 | ✅ |
| 2 | Habilitar APIs | §1.4 | ⬜ |
| 3 | Vincular la facturación (= plan Blaze por comando) + presupuesto con alerta | §1.3 | ⬜ |
| 4 | Service account `[SA]` | §4.4 | ⬜ |
| 5 | Bucket `analizer-lake` (crear + versionado + permiso) | §3 | ⬜ |
| 6 | IP externa estática `[IP]` | §5.1 | ⬜ |
| 7 | Chequear que ninguna otra VM consuma el free tier de la cuenta | §11 | ⬜ |
| 8 | Crear la VM `[VM]` (e2-micro + pd-standard 30 GB + SA + IP) | §4 | ⬜ |
| 9 | Regla de firewall 80/443 | §5.2 | ⬜ |
| 10 | Barrido de huérfanos (discos sueltos, IPs reservadas sin usar, VMs de prueba) | §4 | ⬜ |
| 11 | Reglas: Firestore deniega todo; la RTDB se abre acotada a la presencia | §2.2 / §2.6 | ⬜ |
| 12 | La config de Vector, portada y versionada en el repo | §6 | ✅ |
| 13 | Preparar la instancia para correr Vector | §6 | ⬜ |
| 14 | Desplegar desde el repo local: índice (notificaciones + función) y config de Vector | §6 / §7 | ⬜ |
| 15 | Caddy: instalarlo y desplegarle el Caddyfile desde el repo | §6.4 | ⬜ |
| 16 | Copiar la historia del bucket viejo al nuevo | §3.7 | ⬜ |

#### Detalle de 10, 11 y 12

**10 · Barrido.** No es "borrar la VM de prueba": es la limpieza que hay que
hacer **después de cada iteración**, porque lo que queda suelto sigue
facturando. Dos cosas cuestan plata calladas: un **disco huérfano** (sobrevive
a su VM si no tenía auto-borrado) y una **IP reservada sin usar** (cuesta MÁS
ociosa que en uso). Se listan así, en todos los proyectos:

```bash
gcloud compute disks list --filter="-users:*" --format="table(name,zone,sizeGb,type.basename())"
gcloud compute addresses list --filter="status!=IN_USE" --format="table(name,address,region,status)"
```

**11 · Reglas.** Son dos bases con necesidades opuestas:

- **Firestore: no se toca.** Creada en *modo producción* ya deniega todo
  (`allow read, write: if false;`). La app y la Cloud Function entran con
  Admin SDK / IAM, que **no pasan por las reglas**. Sólo hay que verificar que
  siga así en Firebase Console → Firestore → Reglas.
- **RTDB: hay que abrirla, acotada.** El sitio escribe la presencia desde el
  navegador **sin autenticar**, así que en "modo bloqueado" no funciona:

  ```json
  { "rules": { "activeSessions": { "$conn": { ".write": true } } } }
  ```

  La lectura queda denegada por omisión (nadie puede espiar quién está
  conectado); la app lee con Admin SDK. Versión estricta: auth anónima y
  `$conn === auth.uid`.
- **Dependencia**: en el proyecto nuevo esto no se nota hasta el corte — la
  landing todavía apunta a la RTDB vieja (`src/config.js:27`), y ese valor
  viaja compilado, así que hace falta redeploy del sitio.

**12 · Vector: instalar y desplegarle la config.** Ya no hay que inventar
nada: la config **ya está portada y versionada** en el repo de la app
(`infra/vector/`, con `vector.yaml` adaptado a `gcp_cloud_storage` y
`bronze_v1.schema` textual), y el despliegue es un script.

El árbol, para saber qué termina dónde:

```
repo  infra/vector/vector.yaml            ← fuente de verdad versionada
      infra/vector/bronze_v1.schema

VM    /etc/vector/vector.yaml             ← config activa
      /etc/vector/bronze_v1.schema        ← esquema parquet
      /var/lib/vector/                    ← buffers EN DISCO (dueño: vector)

lake  config/vector.yaml                  ← el intermediario del despliegue
      config/bronze_v1.schema
      raw/v=1/dt=YYYY-MM-DD/<epoch>-<uuid>.log.zst
      bronze/v=1/dt=YYYY-MM-DD/<epoch>-<uuid>.parquet
```

**a) Requisitos locales** (una sola vez): la identidad no viaja por variables
de entorno, vive en la configuración de gcloud.

```bash
winget install Google.CloudSDK
gcloud auth login
gcloud config set project [PROJECT]
```

En Windows los scripts corren con Git Bash; **hay que abrir una terminal nueva
después de instalar** (la que ya estaba abierta arrastra el PATH viejo). La
primera invocación de `gcloud compute ssh` genera y registra la clave SSH sola.

El paso 13 deja la instancia lista; con eso hecho, se despliega la config:

```bash
npm run infra:vector
```

Hace, en este orden: sube los dos archivos a `gs://[BUCKET]/config/`, se
asegura de que la identidad de la VM pueda **leer** el bucket (tiene
`objectCreator` para escribir el lake, y eso no alcanza), baja el esquema a su
lugar y la config **a `/tmp`**, la **valida ahí**, y sólo si pasa la instala y
recarga en caliente. Si no valida, corta y la config vigente queda intacta.

Variables, todas con default: `PROJECT` (proyecto activo), `BUCKET`
(`[PROJECT]-lake`), `VM` (`ingestor-vm`), `ZONE` (`us-east1-c`). La service
account de la VM no se pasa: el script la lee de la instancia.

**d) Prueba de humo** — un evento de mentira contra el puerto local, que sólo
escucha adentro de la VM:

```bash
gcloud compute ssh [VM] --zone=[REGION]-[ZONA] --command="curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/v1/batch -H 'Content-Type: application/json' -d '{\"batch\":[{\"type\":\"page\",\"event\":\"prueba\",\"messageId\":\"test-1\",\"context\":{\"userAgent\":\"Mozilla/5.0 Chrome/145\"}}]}'"
```

Tiene que dar `200` y aparecer en `gs://[BUCKET]/raw/`. Ojo con el user agent:
uno con `curl/` o `bot` entra a raw pero **el filtro lo descarta antes de
bronze**. Bronze puede tardar hasta 10 minutos (`batch.timeout_secs: 600`).

**e) Publicar el esquema en el lake** (documentación versionada del contrato,
no la consume nadie automáticamente):

```bash
gcloud storage cp infra/vector/bronze_v1.schema gs://[BUCKET]/schemas/1/bronze_v1.schema
```

**Qué falta verificar la primera vez**: que la versión instalada de Vector
soporte `batch_encoding: parquet` en el sink de GCS (`vector validate` lo dice
al instante). Si no, el plan B no rediseña nada: GCS tiene API compatible con
S3, así que se deja el sink `aws_s3` con `endpoint: https://storage.googleapis.com`
y claves HMAC.

**13 · Preparar la instancia.** La VM está recién nacida: sabe arrancar y nada
más. Todo esto se hace UNA vez y deja la máquina en condiciones de correr el
ingestor sin sorpresas.

1. **Verificar que tenga `gcloud`**, porque el despliegue de la config lo usa
   desde adentro para bajar los archivos del bucket:
   ```bash
   gcloud compute ssh [VM] --zone=[REGION]-[ZONA] --command="which gcloud || (curl -1sLf https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && echo 'deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main' | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list && sudo apt-get update && sudo apt-get install -y google-cloud-cli)"
   ```
2. **Instalar Vector** y crear su `data_dir`. Sin `/var/lib/vector` con el
   dueño correcto, Vector no arranca:
   ```bash
   gcloud compute ssh [VM] --zone=[REGION]-[ZONA] --command="curl -1sLf https://setup.vector.dev/ | sudo -E bash && sudo apt-get install -y vector && sudo mkdir -p /var/lib/vector && sudo chown vector:vector /var/lib/vector && vector --version"
   ```
3. **Reloj en UTC y journal acotado.** Lo segundo importa de verdad: la config
   escribe una línea al journal por cada request y por cada evento (los taps),
   y en un disco de 30 GB eso crece. Un tope de 200 MB alcanza y sobra:
   ```bash
   gcloud compute ssh [VM] --zone=[REGION]-[ZONA] --command="sudo timedatectl set-timezone UTC && echo 'SystemMaxUse=200M' | sudo tee -a /etc/systemd/journald.conf && sudo systemctl restart systemd-journald"
   ```
4. **Swap de 1 GB.** La `e2-micro` tiene 1 GB de RAM y ninguna reserva: un pico
   de memoria sin swap termina en el kernel matando a Vector.
   ```bash
   gcloud compute ssh [VM] --zone=[REGION]-[ZONA] --command="sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab && free -m"
   ```
5. **Arranque automático**, para que un reinicio de la VM no deje el ingestor
   abajo:
   ```bash
   gcloud compute ssh [VM] --zone=[REGION]-[ZONA] --command="sudo systemctl enable vector && systemctl is-enabled vector"
   ```
6. **Desplegar la config** (paso 12c) y **verificar que escucha**:
   ```bash
   gcloud compute ssh [VM] --zone=[REGION]-[ZONA] --command="ss -tlnp | grep 8080 && systemctl is-active vector"
   ```

Lo que **no** hay que hacer acá: abrir el 8080 al mundo. Escucha en local y
quien recibe de afuera es Caddy, en el 443.

**14 · Desplegar desde el repo local.** Todo se corre parado en la carpeta del
repo de la app. No hay variables de entorno que definir: la identidad está en
la config de gcloud y el resto se deriva del proyecto activo.

**14.1 · Requisitos, una sola vez**

```bash
winget install Google.CloudSDK
```
Después **abrir una terminal nueva** (la que estaba abierta arrastra el PATH
viejo) y:
```bash
gcloud auth login
gcloud config set project [PROJECT]
```

**14.2 · El índice: notificaciones + función**

```bash
npm run infra:index
```

Crea la service account `index-writer` (sólo `datastore.user`), el tópico, las
notificaciones del bucket para `raw/v=1/` y `bronze/v=1/` —creados **y**
borrados— y despliega la función. Si Firestore vive en otro proyecto:
`FIRESTORE_PROJECT=otro npm run infra:index`.

En un proyecto nuevo, la primera corrida pregunta dos veces si habilita APIs
(`cloudbuild`, `eventarc`): responder **y**. Puede pedir instalar el
componente `beta` de gcloud: también **y**, es una vez.

**14.3 · Las claves HMAC de bronze, una sola vez**

Bronze escribe parquet, y en Vector 0.57 eso sólo existe en el sink `aws_s3`,
así que ese sink apunta a la API compatible con S3 de GCS (mismo bucket, mismo
prefijo). Es el único componente con credenciales, emitidas para **la misma**
service account que ya lleva la VM:

```bash
gcloud storage hmac create [SA]@[PROJECT].iam.gserviceaccount.com
```

Guardar el `accessId` y el `secret` (el secret no se puede volver a ver), y
dejarlos en la instancia donde sólo los lea root:

```bash
gcloud compute ssh [VM] --zone=[REGION]-[ZONA]
sudo tee /etc/vector/hmac.env > /dev/null <<'EOF'
AWS_ACCESS_KEY_ID=EL-ACCESS-ID
AWS_SECRET_ACCESS_KEY=EL-SECRET
EOF
sudo chmod 600 /etc/vector/hmac.env
sudo mkdir -p /etc/systemd/system/vector.service.d
printf '[Service]\nEnvironmentFile=/etc/vector/hmac.env\n' | sudo tee /etc/systemd/system/vector.service.d/hmac.conf
sudo systemctl daemon-reload
```

**14.4 · La config de Vector**

```bash
npm run infra:vector
```

Sube al bucket, la VM baja con su propia identidad, **valida en `/tmp`** y
sólo si pasa instala y recarga en caliente. Si el validate falla, corta y la
config vigente queda intacta.

**14.5 · Verificar**

```bash
gcloud functions describe index-writer --gen2 --region=[REGION] --format="value(serviceConfig.serviceAccountEmail,serviceConfig.environmentVariables,eventTrigger.pubsubTopic)"
gcloud storage buckets notifications list gs://[BUCKET]
gcloud compute ssh [VM] --zone=[REGION]-[ZONA] --command="systemctl is-active vector; ss -tlnp | grep 8080"
```

**14.6 · La prueba que cierra el circuito**

Un evento de mentira contra el puerto local de la VM (ver 12d). Tiene que dar
`200`, aparecer el archivo en `gs://[BUCKET]/raw/` **y** —segundos después,
sin que nadie haga nada— su doc en Firestore
(`inventory/raw/days/<hoy>/files/<nombre>`). Con esa sola prueba quedan
verificados el ingestor y el índice.

Para probar el índice solo, sin esperar a Vector, alcanza con subir un archivo
cualquiera con la forma correcta: la función mira la notificación, nunca abre
el archivo.

```bash
echo '{"prueba":true}' > /tmp/test.log
gcloud storage cp /tmp/test.log gs://[BUCKET]/raw/v=1/dt=$(date -u +%F)/1786000000-test.log.zst
gcloud storage rm gs://[BUCKET]/raw/v=1/dt=$(date -u +%F)/1786000000-test.log.zst
```

Al subirlo aparece el doc; al borrarlo desaparece.

Los dos scripts son idempotentes: correrlos de nuevo republica la versión
actual del repo y no duplica recursos.

**15 · Caddy.** Es lo último del camino de datos. El Caddyfile de la EC2
resultó mínimo —dominio, TLS automático y proxy al 8080— y **no valida el
writeKey**: figuraba como intención en los documentos viejos pero nunca se
implementó. Se portó a `infra/caddy/Caddyfile` del repo de la app.

**El dominio es nuevo**, sin tráfico en juego: por eso acá el DNS va PRIMERO.
Sin nada que cortar, apuntarlo de entrada evita toda la gimnasia de probar sin
TLS, y Caddy emite el certificado apenas arranca.

1. **Apuntar el dominio**: registro **A** de `[DOMINIO]` a la IP de la VM
   (`gcloud compute addresses list` la muestra). Verificar que resuelva antes
   de seguir — Let's Encrypt valida resolviendo el nombre:
   ```bash
   nslookup [DOMINIO]
   ```
2. **Instalar Caddy** (una vez):
   ```bash
   gcloud compute ssh [VM] --zone=[REGION]-[ZONA] --command="sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list && sudo apt-get update && sudo apt-get install -y caddy && caddy version"
   ```
2. **Desplegar el Caddyfile** desde el repo (mismo circuito que Vector: sube
   al bucket, la VM baja, valida y recarga):
   ```bash
   npm run infra:caddy
   ```
3. **Verificar** que escucha en 80 y 443:
   ```bash
   gcloud compute ssh [VM] --zone=[REGION]-[ZONA] --command="systemctl is-active caddy; ss -tlnp | grep -E ':80|:443'"
   ```
5. **Probar por HTTPS, con el dominio y el certificado real**. Tiene que dar
   `200`:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://[DOMINIO]/v1/batch -H 'Content-Type: application/json' -d '{"batch":[{"type":"page","event":"prueba-caddy","messageId":"test-2","context":{"userAgent":"Mozilla/5.0 Chrome/145"}}]}'
   ```

Si el certificado tarda, el journal de Caddy dice exactamente por qué —casi
siempre, DNS que todavía no propagó:
```bash
gcloud compute ssh [VM] --zone=[REGION]-[ZONA] --command="journalctl -u caddy -n 30 --no-pager"
```

**Cambio que entra con este paso**: el source de Vector pasa a escuchar en
`127.0.0.1:8080` en vez de `0.0.0.0:8080`. Con Caddy adelante ya no hace falta
que el puerto sea alcanzable, y así queda inalcanzable incluso si mañana
alguien abre el firewall por error.

**16 · Copiar la historia.** Son 80 KB: raw (la fuente de reproceso, lo único
irrecuperable), bronze y schemas. En Cloud Shell, sin dejar el secreto en el
historial:

```bash
export AWS_ACCESS_KEY_ID=...            # clave de sólo lectura
read -rs AWS_SECRET_ACCESS_KEY; export AWS_SECRET_ACCESS_KEY
gcloud storage cp --recursive s3://[BUCKET-VIEJO]/raw gs://$(gcloud config get-value project)-lake/
gcloud storage cp --recursive s3://[BUCKET-VIEJO]/bronze gs://$(gcloud config get-value project)-lake/
gcloud storage cp --recursive s3://[BUCKET-VIEJO]/schemas gs://$(gcloud config get-value project)-lake/
gcloud storage ls --recursive gs://$(gcloud config get-value project)-lake/** | wc -l   # verificación
```

Alternativa por consola: *Transferencia de datos → Crear trabajo* con origen
Amazon S3. Conviene para volúmenes grandes; para 80 KB, el `cp` alcanza.

Recién después: diagnóstico de bronze (§13), Vector y Caddy (§6), DNS (§5) y
el resto.

### Valores de ESTA instalación

Todo lo que cambia entre instalaciones va como marcador. **Los valores los
define quien instala**; acá sólo van las restricciones que hay que respetar.

| Marcador | Qué es | Restricción |
|---|---|---|
| `[PROYECTO]` | ID del proyecto | Único global, **inmutable**, 6–30 caracteres |
| `[CUENTA]` | Cuenta de facturación | Formato `0X0X0X-0X0X0X-0X0X0X`; sale de `gcloud billing accounts list` |
| `[BUCKET]` | Bucket del lake | **Único global** (conviene derivarlo de `[PROYECTO]`) |
| `[SA]` | Service account que escribe el lake | ID **inmutable**; el correo queda `[SA]@$(gcloud config get-value project).iam.gserviceaccount.com` |
| `[VM]` | Instancia del ingestor | Libre |
| `[IP]` | Nombre de la IP externa reservada | Libre |
| `[FIREWALL]` | Nombre de la regla 80/443 | Libre |
| `[REGION]` / `[ZONA]` | Dónde vive todo | La zona pertenece a la región. Free tier: `us-west1`, `us-central1` o `us-east1` |
| `[TIPO]` | Tipo de máquina | Free tier: `e2-micro` |
| `[IMAGEN]` | Imagen de arranque | `debian-12` recomendado (los repos de Vector/Caddy pueden no publicar aún para `debian-13`) |
| `[TIPO-DISCO]` / `[DISCO]` | Disco de arranque | Free tier: `pd-standard` y hasta `30GB` |
| `[PRESUPUESTO]` | Nombre del presupuesto | Libre |
| `[MONTO]` / `[MONEDA]` | Importe y moneda del tope | La moneda **debe ser la de la cuenta de facturación** |
| `[DOMINIO]` | Dominio del ingest | El que ya usa el sitio |

### Equivalencias por consola (opcional — el camino principal son los comandos)

- **0 · Consola de FIREBASE** (`console.firebase.google.com`) — todo el paso 0
  se hace acá, sin pasar por la consola de Google Cloud:
  - *Agregar proyecto* → nombre. Esto **crea el proyecto de GCP** por debajo.
  - *Compilación → Firestore Database → Crear base de datos*: **modo
    producción**, ubicación `nam5` (**irreversible**).
  - *Compilación → Realtime Database → Crear base de datos*: `us-central1`,
    **modo bloqueado**.
  - Abajo a la izquierda: plan **Blaze** → elegir cuenta de facturación.
  - *Configuración del proyecto → Cuentas de servicio → Generar nueva clave
    privada*: es la credencial del `.env` de la app.
- **2 · APIs y servicios → Habilitar**: Compute Engine, Cloud Storage, Pub/Sub,
  Cloud Run, Cloud Functions, Firestore, Monitoring, Cloud Billing, Budgets,
  BigQuery.
- **3 · Facturación → Presupuestos y alertas → Crear**: importe `5 USD`,
  umbrales 50 % y 100 %.
- **4 · IAM → Cuentas de servicio → Crear**: `[SA]`. Sin roles a nivel
  proyecto.
- **5 · Cloud Storage → Crear bucket**: nombre `[BUCKET]`, **Región** `[REGION]`,
  clase **Standard**, **acceso uniforme**, **impedir acceso público**,
  **versionado activado**. Después, pestaña *Permisos* → Otorgar acceso →
  `[SA]` → rol **Storage Object Creator**.
- **6 · Red de VPC → Direcciones IP externas → Reservar**: nombre `[IP]`,
  IPv4, nivel **Premium**, **estática**, región `[REGION]`.
- **8 · Compute Engine → Crear instancia**: nombre `[VM]`, región
  `[REGION]`, zona `[ZONA]`, serie **E2**, tipo **e2-micro**, imagen **Debian
  12**, disco de arranque **Disco persistente estándar 30 GB**, cuenta de
  servicio `[SA]`, permisos de acceso **completo a todas las APIs**,
  firewall **HTTP y HTTPS tildados**, red → IP externa `[IP]`, y
  **protección contra la eliminación activada**.
- **9 · Firewall**: no hace falta crear nada — los tildes de HTTP/HTTPS del paso
  8 aplican las reglas `default-allow-http` y `default-allow-https`.
- **11 · Reglas**: Firestore queda **como está** (modo producción ya deniega
  todo, y la app entra por Admin SDK, que no pasa por reglas). La **RTDB SÍ hay
  que cambiarla**: el sitio escribe la presencia desde el navegador sin
  autenticar, así que con "bloqueado" no funciona.
  ```json
  { "rules": { "activeSessions": { "$conn": { ".write": true } } } }
  ```
  Lectura denegada por omisión; la app lee con Admin SDK. (Versión estricta:
  exigir auth anónima y `$conn === auth.uid`.)
- **12 · Transferencia de datos → Crear trabajo**: origen **Amazon S3**
  (`ingest-bucket-1985`, con access key de sólo lectura), destino `[BUCKET]`,
  una sola ejecución.

### Comandos (Cloud Shell) — camino principal. El paso 0 NO tiene comandos: es
todo consola de Firebase.

```bash
# 0. Verificar el punto de partida: proyecto de Firebase con Blaze
gcloud billing projects describe [PROYECTO] --format="value(billingEnabled,billingAccountName)"

# 1. Fijar el proyecto de trabajo
gcloud config set project [PROYECTO]

# 2. APIs. cloudbuild y artifactregistry son las que se olvidan: las funciones
# de 2ª generación se CONSTRUYEN como contenedor y hay que guardarlo.
gcloud services enable compute.googleapis.com storage.googleapis.com \
  pubsub.googleapis.com run.googleapis.com cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com eventarc.googleapis.com \
  firestore.googleapis.com monitoring.googleapis.com cloudbilling.googleapis.com \
  billingbudgets.googleapis.com bigquery.googleapis.com

# 3a. Vincular la facturación (equivale al plan Blaze de la consola de
#     Firebase; si ya se hizo por consola, este paso sobra).
gcloud billing accounts list          # copiar el ACCOUNT_ID: 0X0X0X-0X0X0X-0X0X0X
gcloud billing projects link $(gcloud config get-value project) --billing-account=[CUENTA]
gcloud billing projects describe $(gcloud config get-value project) \
  --format="value(billingEnabled,billingAccountName)"    # tiene que decir True

# 3b. Presupuesto con alerta. OJO: el importe va en la MONEDA DE LA CUENTA
#     (5EUR en una cuenta en euros; 5USD falla con INVALID_ARGUMENT).
gcloud billing budgets list --billing-account=[CUENTA] \
  --format="table(displayName,amount.specifiedAmount.units,amount.specifiedAmount.currencyCode)"
gcloud billing budgets create --billing-account=[CUENTA] \
  --display-name="[PRESUPUESTO]" --budget-amount=[MONTO][MONEDA] \
  --threshold-rule=percent=0.5 --threshold-rule=percent=1.0

# Piedras conocidas del paso 3:
#  · "does not have permission (or it may not exist)" → casi siempre el ID del
#    proyecto está mal escrito. Por eso se usa $(gcloud config get-value project).
#  · "Cloud billing quota exceeded" → la cuenta llegó a su TOPE de proyectos
#    vinculados: liberar uno con `gcloud billing projects unlink OTRO-PROYECTO`
#    (o pedir aumento de cupo). Ese mismo tope explica que el free tier de la
#    e2-micro sea uno por CUENTA, no por proyecto (paso 7).
#  · El presupuesto NO bloquea nada: si se resiste, seguir con el paso 4.

# 4. Service account de Vector
gcloud iam service-accounts create [SA] --display-name="Vector ingest"

# 5. Bucket del lake
gcloud storage buckets create gs://$(gcloud config get-value project)-lake --location=[REGION] \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://$(gcloud config get-value project)-lake --versioning
gcloud storage buckets add-iam-policy-binding gs://$(gcloud config get-value project)-lake \
  --member=serviceAccount:[SA]@$(gcloud config get-value project).iam.gserviceaccount.com \
  --role=roles/storage.objectCreator

# 6. IP externa estática
gcloud compute addresses create [IP] --region [REGION]
gcloud compute addresses describe [IP] --region [REGION] --format="value(address)"

# 7. Free tier: es por CUENTA DE FACTURACIÓN, no por proyecto
for p in $(gcloud projects list --format="value(projectId)"); do echo "== $p"; \
  gcloud compute instances list --project=$p --format="table(name,zone,machineType.basename(),status)" 2>/dev/null; done

# 8. La VM
gcloud compute instances create [VM] --zone=[ZONA] --machine-type=[TIPO] \
  --image-family=[IMAGEN] --image-project=debian-cloud \
  --boot-disk-type=[TIPO-DISCO] --boot-disk-size=[DISCO] \
  --address=$(gcloud compute addresses describe [IP] --region [REGION] --format="value(address)") \
  --service-account=[SA]@$(gcloud config get-value project).iam.gserviceaccount.com --scopes=cloud-platform \
  --tags=http-server,https-server --deletion-protection

# 9. Firewall 80/443
gcloud compute firewall-rules create [FIREWALL] --network=default \
  --allow=tcp:80,tcp:443 --target-tags=http-server,https-server --source-ranges=0.0.0.0/0
```

## 1. Proyecto y facturación

| # | Recurso | Características | Estado |
|---|---|---|---|
| 1.1 | **Proyecto único** para toda la plataforma | Recomendado: `data-analyzer-1c0fe` — es donde ya viven Firestore y la RTDB que **escribe el sitio**; mover eso obligaría a tocar producción. Lo que hoy está en `smarty-9bb94` (datasets de BigQuery, bucket, la VM nueva) se recrea allá en minutos | ⚠ D1 |
| 1.2 | Facturación (Blaze) activa | Ya activada para Cloud Monitoring | ✅ |
| 1.3 | **Presupuesto con alerta** | US$5, avisos al 50% y 100%, por mail | ⬜ |
| 1.4 | APIs habilitadas | `compute`, `storage`, `firestore`, `firebasedatabase`, `pubsub`, `cloudfunctions`/`run`, `monitoring`, `cloudbilling`, `bigquery` | ⬜ |

### 1.5 Crear un proyecto nuevo y darle Firebase (procedimiento replicable)

**Concepto que hay que tener claro**: un proyecto de Firebase **es** un
proyecto de Google Cloud — Firebase es una capa de servicios sobre él. No se
"vinculan" dos proyectos, y **dos proyectos existentes no se fusionan**: lo
que se hace es *agregarle Firebase* a un proyecto de GCP, o crear el proyecto
desde Firebase (que por debajo crea el de GCP).

1. Crear el proyecto de GCP (el ID es único global y **no se puede cambiar**):
   ```bash
   gcloud projects create ID-DEL-PROYECTO --name="Nombre visible"
   ```
2. Ligarlo a la cuenta de facturación (sin esto no hay Compute, ni Monitoring
   por API, ni presupuestos):
   ```bash
   gcloud billing accounts list
   ```
   ```bash
   gcloud billing projects link ID-DEL-PROYECTO --billing-account=XXXXXX-XXXXXX-XXXXXX
   ```
3. **Agregarle Firebase**. Por consola: Firebase Console → *Agregar proyecto*
   → escribir el nombre y elegir **el proyecto de GCP existente** en la lista.
   Por CLI (`npm i -g firebase-tools`):
   ```bash
   firebase projects:addfirebase ID-DEL-PROYECTO
   ```
4. Crear **Firestore** en modo Native. La ubicación es **irreversible**:
   ```bash
   gcloud firestore databases create --location=nam5 --project=ID-DEL-PROYECTO
   ```
5. Crear la **Realtime Database**: Firebase Console → Realtime Database →
   *Crear base de datos* (se elige ubicación y se arranca en modo bloqueado).
6. Generar la credencial del Admin SDK que usa la app: Firebase Console →
   Configuración del proyecto → Cuentas de servicio → *Generar nueva clave
   privada* (va al `.env`, nunca al repo).

**Si se creara un proyecto nuevo en vez de reusar `data-analyzer-1c0fe`**, hay
que asumir además: exportar/importar Firestore vía GCS, recrear la RTDB, y
**tocar la landing** (`src/config.js:27` compila la URL de la RTDB) con su
redeploy. Ese costo es justamente el motivo de D1.

---

## 2. Firebase — cómo tiene que quedar

| # | Recurso | Características | Estado |
|---|---|---|---|
| 2.1 | **Firestore** | Modo **Native** (no Datastore). Ubicación `nam5` (multi-región US) — **no se puede cambiar después**, y es la que ya tiene | ✅ existe |
| 2.2 | Reglas de Firestore | **Denegar todo**: `allow read, write: if false;`. La app y la función entran por Admin SDK / IAM, que no pasan por reglas. Así ningún cliente web puede leer el índice | ⬜ |
| 2.3 | Colecciones | `settings/data-analizer` (preferencias) · `inventory/{raw\|bronze}/days/{día}/files/{nombre}` (índice; sólo hechos) | ✅ diseño |
| 2.4 | Índices compuestos | **Ninguno**: las consultas son por colección directa, `orderBy(documentId)` y agregaciones — todo con el índice automático | ✅ |
| 2.5 | **Realtime Database** | Instancia default, `us-central1`. Nodo `activeSessions`, efímero (`onDisconnect`) | ✅ existe |
| 2.6 | Reglas de la RTDB | Que un visitante pueda **crear y actualizar sólo su propia conexión** y **no leer** las ajenas; la app lee por Admin SDK. Hay que revisar cómo están hoy | ⬜ |
| 2.7 | Retención de la RTDB | La sesión viva no es histórico: si algún nodo queda huérfano, que caduque | ⬜ |
| 2.8 | Service account de la app ops | Roles: `roles/datastore.user` (Firestore), `roles/firebasedatabase.viewer`, `roles/storage.objectViewer` sobre el bucket, `roles/monitoring.viewer` | 🔄 existe la del Admin SDK; falta acotar roles |
| 2.9 | Service account de la función del índice | Sólo `roles/datastore.user`. Si quedan dos proyectos (D1), se otorga **cross-project por binding IAM — nunca por archivo de clave** | ⬜ |

---

## 3. Storage (GCS)

| # | Recurso | Características | Estado |
|---|---|---|---|
| 3.1 | **Bucket del lake** | Nombre estable (p. ej. `analizer-lake`), **misma ubicación que la VM** (`us-east1`) o multi-región US si BigQuery lo pide. Clase **Standard** | ⚠ D3 |
| 3.2 | Control de acceso | **Uniform** (sin ACLs por objeto) y *public access prevention* activada | ⬜ |
| 3.3 | Estructura | `raw/v=1/dt=YYYY-MM-DD/…` · `bronze/v=1/dt=…` · `schemas/<v>/bronze_v1.schema` — idéntica a la de S3 | ⬜ |
| 3.4 | Versionado | Activado en `raw/` (es el respaldo del que se puede reprocesar todo) | ⬜ |
| 3.5 | Ciclo de vida | Opcional: raw a Nearline a los 90 días | ⬜ |
| 3.6 | Claves HMAC | Para que DuckDB lea `gs://` desde la app (API de interoperabilidad) | ⬜ |
| 3.7 | Copia de los datos actuales | 80 KB desde S3 (`gsutil rsync` o Storage Transfer) | ⬜ |

---

## 4. Cómputo (la VM del ingestor)

| # | Recurso | Características | Estado |
|---|---|---|---|
| 4.1 | **Instancia** | `e2-micro` (2 vCPU compartidas, 1 GB) · zona `us-east1-c` · Debian 13 | ✅ creada |
| 4.2 | **Disco** | **pd-standard, 30 GB** ← hoy es pd-balanced de 10 GB (fuera del free tier). Ver §5 para el cómo | ⚠ D2 |
| 4.3 | Protección contra borrado | Activada | ⬜ |
| 4.4 | Service account de la VM | Propia, con `roles/storage.objectCreator` **sólo sobre el bucket** (no la default con acceso total). Vector toma las credenciales del entorno: cero claves en disco | ⬜ |
| 4.5 | Etiquetas de red | `http-server`, `https-server` | ⬜ |

---

## 5. Red y DNS

| # | Recurso | Características | Estado |
|---|---|---|---|
| 5.1 | **IP externa estática** | Reservar la actual `34.73.130.185` (si se recrea la VM, la nueva) | ⬜ |
| 5.2 | Firewall | Entrada TCP **80 y 443** (el 80 lo necesita Let's Encrypt para validar). Nada más abierto | ⬜ |
| 5.3 | TTL del DNS | Bajarlo a 300 s **el día antes** del corte | ⬜ |
| 5.4 | Registro A | `actasitalianasexpress.com` → IP nueva | ⬜ |
| 5.5 | Ventana de corte | Con las dos máquinas vivas; la EC2 queda encendida 24–48 h | ⚠ D5 |

---

## 6. Software en la VM

| # | Recurso | Características | Estado |
|---|---|---|---|
| 6.1 | **Vector** | Debian 13 es reciente: si el repo apt no publica `trixie`, instalar el `.deb` de la release oficial | ⬜ |
| 6.2 | `vector.yaml` | Mismo source HTTP y mismas transformaciones; sink `aws_s3` → **`gcp_cloud_storage`** con idéntico `key_prefix` y esquema parquet | ⬜ |
| 6.3 | Buffers en disco + acknowledgements | **Ya estaban bien en el original**: `acknowledgements.enabled: true` global y `buffer.type: disk` + `when_full: block` en los tres sinks. No hay nada que corregir — la hipótesis de "pérdidas por buffers en memoria" quedó descartada (eran bots) | ✅ |
| 6.4 | **Caddy** | TLS automático, validación del writeKey, reverse proxy a `127.0.0.1:8080` | ⬜ |
| 6.5 | Esquema publicado | `schemas/1/bronze_v1.schema` en el bucket nuevo | ⬜ |

---

## 7. Índice por notificaciones (reemplaza la Lambda)

| # | Recurso | Características | Estado |
|---|---|---|---|
| 7.1 | Tópico de **Pub/Sub** | `gcs-lake-events` | ⬜ |
| 7.2 | Notificación del bucket | Eventos `OBJECT_FINALIZE` y `OBJECT_DELETE`, prefijos `raw/v=1/` y `bronze/v=1/` | ⬜ |
| 7.3 | **Cloud Run function** | Node 22, disparada por el tópico; escribe `inventory/{capa}/days/{día}/files/{nombre}` en Firestore. Sin dependencias, sin claves (ADC) | ⬜ |
| 7.4 | Reintentos | Reintento automático; el docId es el nombre del archivo → repetir es inofensivo | ⬜ |

---

## 8. BigQuery

| # | Recurso | Características | Estado |
|---|---|---|---|
| 8.1 | Datasets | `bronze`, `silver`, `gold` en el proyecto elegido (D1), ubicación US | 🔄 existen en `smarty-9bb94` |
| 8.2 | External table | Sobre el bucket **que escribe Vector** (se termina la copia manual) | ⬜ |
| 8.3 | Script bronze→silver | Ya portado; falta correrlo y verificarlo | ⬜ |

---

## 9. App ops

| # | Cambio | Características | Estado |
|---|---|---|---|
| 9.1 | Cliente de objetos | `@google-cloud/storage` en lugar del de S3 (aislado en `s3.ts` y el viewer) | ⬜ |
| 9.2 | DuckDB | Leer `gs://` con las claves HMAC (3.6) | ⬜ |
| 9.3 | Facturación | Cloud Billing en lugar de Cost Explorer — y se va el costo de US$0,01 por consulta | ⬜ |
| 9.4 | `.env` | Bucket, proyecto y credenciales nuevas | ⬜ |

---

## 10. Cierre de AWS

| # | Acción | Estado |
|---|---|---|
| 10.1 | Drenar Vector en la EC2 (cortar tráfico → esperar flush → verificar en el bucket) | ⬜ |
| 10.2 | Borrar EC2, volumen EBS y la IP elástica | ⬜ |
| 10.3 | Vaciar y borrar `ingest-bucket-1985` | ⬜ |
| 10.4 | Borrar usuario/políticas IAM del lector y la Lambda si se hubiera creado | ⬜ |
| 10.5 | Verificar la factura del mes siguiente en US$0 | ⬜ |

---

## 11. El free tier: qué es gratis, cuánto y hasta cuándo

**Es "Always Free": no vence.** No es el trial de US$300/90 días — no tiene
fecha de corte. Google puede cambiar el programa a futuro, pero no expira por
tiempo. Condiciones que hay que cumplir **todas**:

1. **Una** instancia `e2-micro` por cuenta de facturación (se cuentan 744
   horas/mes agregadas: si corrés dos VMs, la segunda se factura).
2. En `us-west1`, `us-central1` o **`us-east1`** ← la tuya cumple.
3. **30 GB-mes de disco `pd-standard`** (HDD). Ojo: `pd-balanced` **no
   entra**, ni siquiera 10 GB.
4. 5 GB-mes de snapshots y 1 GB de egress desde Norteamérica.
5. **La IP pública se cobra igual** (~US$3/mes): no está en la franquicia.

**Cómo llegar a los 30 GB gratis**: el tipo de disco **no se puede cambiar en
caliente**, y agrandar el pd-balanced a 30 GB sería peor (US$3/mes). Como la
VM está vacía, la vía limpia es **recrearla**:

1. Borrar `instance-20260811-141259`.
2. Crear de nuevo: `e2-micro`, `us-east1-c`, Debian, y en el disco de
   arranque elegir **"Disco persistente estándar"** con **30 GB**.
3. Recién ahí reservar la IP como estática y abrir 80/443.

(Alternativa sin borrar: snapshot del disco → crear un disco `pd-standard`
desde el snapshot → cambiar el disco de arranque. Más pasos para el mismo
resultado en una máquina que no tiene nada adentro.)

---

## 12. Decisiones abiertas

| # | Decisión | Opciones | Estado |
|---|---|---|---|
| D1 | Un proyecto o dos | **Todo a `data-analyzer-1c0fe`**. Evidencia: `smarty-landing/src/config.js:27` fija `ACTIVE_SESSIONS_DB` a la RTDB de ese proyecto y ese valor viaja **compilado en la landing** → moverlo obliga a redeploy del sitio. En cambio BigQuery, el bucket y la VM se recrean en minutos. Suma: ahí ya está la facturación habilitada (proyecto #779007635893) | ✅ decidida |
| D2 | Disco de la VM | (a) recrear con pd-standard 30 GB (gratis) · (b) dejar pd-balanced 10 GB (~US$1/mes, SSD) | abierta |
| D3 | Bucket | reusar `data-analizer-bucket` o crear uno nuevo; definir ubicación | abierta |
| D4 | Lambda del índice en AWS | **No se despliega**: se borró del repo. El equivalente en GCP ya está escrito en la app: `infra/scripts/deploy-lake-index.sh` (`npm run infra:index`) | ✅ decidida |
| D5 | Ventana de corte del DNS | día y hora de tráfico bajo | abierta |
| D6 | Deploy de `vector.yaml` desde el repo | (a) **GitHub Action con Workload Identity Federation** → `scp` + `validate` + `reload` + rollback, disparado sólo por `infra/vector/**` · (b) el CI escribe en el bucket y un timer de systemd en la VM tira y recarga (escala a N máquinas, sin SSH desde el CI) · (c) a mano. **Requisito previo**: `buffer.type: disk`, si no cada recarga pierde lo no flusheado | abierta |

---

## 13. Bloqueante previo — RESUELTO (2026-08-11)

**No había bloqueante: bronze funciona como fue diseñado.** Los días con raw
pero sin bronze (08-08, 08-09, 08-11) sólo recibieron tráfico del **crawler de
anuncios de Meta** (`meta-externalads/1.1`, IP `57.141.18.96`, rastreando los
previews de Vercel). Ese crawler renderiza la página y ejecuta el SDK, así que
produce eventos completos — pero el `bronze_clean` los descarta porque el user
agent matchea el token `crawl` del regex de bots (`abort` + `drop_on_abort`).
Raw guarda todo lo que entra; bronze, sólo tráfico humano.

Consecuencia para la migración: **no hay nada que arreglar antes de portar el
`vector.yaml`**. Y una mejora opcional a considerar: hoy lo descartado se
pierde sin rastro (`reroute_dropped: false`); enrutarlo a un sink aparte
permitiría auditar cuánto tráfico es de bots.

Comandos de diagnóstico, por si vuelve a aparecer una diferencia raw/bronze:

```bash
bash run.sh "systemctl status vector --no-pager | head -8; journalctl -u vector --since '2 days ago' -p err --no-pager | tail -40"
```

Y el inventario que falta de la instancia:

```bash
bash run.sh "echo '== OS =='; head -2 /etc/os-release; echo '== CPU/RAM/DISCO =='; nproc; free -m | head -2; df -h /; echo '== VECTOR =='; vector --version; echo '== VECTOR.YAML =='; cat /etc/vector/vector.yaml; echo '== CADDY =='; cat /etc/caddy/Caddyfile 2>/dev/null || echo sin-caddyfile; echo '== PUERTOS =='; ss -tlnp"
```

---

## 14. Referencia — inventario verificado (2026-08-11)

### AWS (origen)

| Qué | Valor |
|---|---|
| EC2 | `i-0c3181f7280153931` · us-east-1 · `44.207.109.162` |
| Vector | systemd · `/etc/vector/vector.yaml` · `/etc/vector/bronze_v1.schema` · buffers **en memoria** · flush 10 min |
| Ingest | Caddy :443 (`actasitalianasexpress.com`) → Vector `127.0.0.1:8080/v1/batch` |
| Bucket | `ingest-bucket-1985`: raw 9 archivos/17 KB (08-07→08-11) · bronze 6/48 KB (08-07 y 08-10) · schemas 4/6 KB |
| Acceso | sin SSH: SSM desde CloudShell (`infra/cloudshell/run.sh`) |

### Costos comparados (lista)

| Línea | AWS | GCP |
|---|---|---|
| Cómputo | t3.micro ~US$7,6 | e2-micro **US$0** |
| IP pública | US$3,65 | ~US$2,9 |
| Disco | gp3 US$0,08/GB | pd-standard US$0,04/GB (30 GB gratis) |
| Objetos | US$0,023/GB · ops US$0,005 por mil | US$0,020/GB · ops US$0,005 por mil |
| Egress | 100 GB gratis, luego US$0,09/GB | ~US$0,12/GB, franquicia menor |
| Factura por API | US$0,01 por consulta | gratis |
| **Total hoy** | **≈ US$10–12/mes** | **≈ US$3/mes** |

---

## 15. Bitácora

### 2026-08-11 — Iteración 1

- Inventario del bucket medido con credenciales reales; esquema `bronze_v1`
  confirmado (17 columnas); infra de la EC2 verificada contra el repo, no de
  memoria.
- **Hallazgo**: bronze sin escribir desde el 08-10 20:24 UTC → §13 pasa a ser
  bloqueante.
- Comparación de precios AWS/GCP (§14).
- **Andrés** creó `instance-20260811-141259`: e2-micro (free tier ✓), Debian
  13, us-east1-c. Verificado por consola: disco **pd-balanced 10 GB** (fuera
  de franquicia), IP **efímera**, firewall **cerrado**, sin etiquetas de red.
- Detectado que la VM y BigQuery están en `smarty-9bb94` mientras Firestore y
  la RTDB están en `data-analyzer-1c0fe` → nace D1.
- Decidido D4: la Lambda del índice **no** se despliega en AWS.

### 2026-08-11 — Iteración 2

- Revisada la lista de proyectos de GCP: `smarty-9bb94`, `safe-f4365`,
  `landing-innerith`, `youtube-api-432508`, `innerith-lang`,
  `call-center-bot-a2d5d`, `actas-italianas-express`. `data-analyzer-1c0fe`
  no figura en "Recientes" (nunca se abrió desde la consola de GCP), pero
  existe: su service account firma tokens.
- **D1 decidida con evidencia**: todo a `data-analyzer-1c0fe`
  (`src/config.js:27` compila la URL de la RTDB en la landing).
- Pendiente de chequear: que ninguna otra VM de la misma **cuenta de
  facturación** esté consumiendo el free tier de `e2-micro` (es por cuenta,
  no por proyecto).

### 2026-08-11 — Iteración 3: prueba de los pasos en limpio

Andrés creó el proyecto `sessions-ingest` desde Firebase para probar el
runbook de punta a punta. Tres piedras encontradas, con su remedio:

1. **`billing projects link` con el ID mal escrito** → el error dice "no
   tenés permiso (o puede que no exista)", que despista: casi siempre es el
   nombre. Remedio: usar `$(gcloud config get-value project)` en vez de
   tipearlo.
2. **`Cloud billing quota exceeded`** → una cuenta de facturación tiene tope
   de proyectos vinculados. Remedio: `gcloud billing projects list
   --billing-account=…` y `unlink` de alguno muerto, o pedir aumento de cupo.
3. **`budgets create` con `INVALID_ARGUMENT`** → el importe va **en la moneda
   de la cuenta de facturación**; `5USD` sobre una cuenta en euros es
   inválido. Remedio: `5EUR`, o crearlo por consola (elige la moneda sola).

Nota para el runbook: el presupuesto **no bloquea** nada; si se resiste, se
sigue con el paso 4 y se vuelve después.

### 2026-08-11 — Iteración 4: pasos 1 a 5 ejecutados en `sessions-ingest`

Valores reales (leídos de la terminal, no supuestos):

| Marcador | Valor |
|---|---|
| `[PROYECTO]` | `sessions-ingest` |
| `[CUENTA]` | `01BF36-37A196-9E508D` (`billingEnabled: true`) |
| `[PRESUPUESTO]` | `Tope Analizer` · 5 EUR · id `3b97ee23-0638-49ba-a656-8372c456556f` |
| `[SA]` | `ingestor-writter` → `ingestor-writter@sessions-ingest.iam.gserviceaccount.com` |
| `[BUCKET]` | `sessions-ingest-lake` · `us-east1` · uniforme + PAP + versionado |
| `[REGION]` / `[ZONA]` | `us-east1` / `us-east1-c` |

Hechos: pasos 1, 2, 3a, 3b, 4 y 5 ✅ (el binding `roles/storage.objectCreator`
sobre el bucket quedó aplicado a la SA).

Piedras nuevas:

4. **La ubicación del bucket es una REGIÓN, no una zona, y lleva el prefijo
   del país**: fallaron `east-1`, `east-1-c`, `east1`, `east1-c`; la válida es
   `us-east1`. Regla: bucket → región; VM → zona.
5. **Los marcadores hay que reemplazarlos**: `--location=[REGION]` y
   `serviceAccount:[SA]@…` se ejecutaron literales y Google los rechazó.

Pendiente de decidir: el ID de la SA quedó `ingestor-writter` (con doble "t");
es **inmutable**. Y el presupuesto se creó **sin** `--filter-projects`, así que
mide el gasto de TODOS los proyectos de la cuenta.

### 2026-08-11 — Iteración 5: el "bloqueante" de bronze era un bot

Se leyeron los payloads crudos de los días sin bronze (DuckDB httpfs sobre
`raw/v=1/dt=…/*.log.zst`). Los tres "sesiones" del 08-11 tienen user agent
`meta-externalads/1.1 (+…/webmasters/crawler)` e IP `57.141.18.96` — el
crawler de anuncios de Meta rastreando previews de Vercel. El filtro de bots
los descarta por el token `crawl`. **Bronze nunca estuvo roto**; §13 queda
cerrado y la migración no tiene bloqueantes.

Lección para el runbook: una diferencia raw > bronze **no es un incidente por
sí sola** — primero hay que mirar el user agent de lo que entró.

### 2026-08-11 — Iteración 6: la infra queda escrita en el repo de la app

Con el `vector.yaml` real a la vista, se portó y versionó todo en
`data-analizer-ops/infra/`:

- `vector/` — `vector.yaml` (los tres sinks `aws_s3` → `gcp_cloud_storage`, el
  de métricas → `gcp_stackdriver_metrics`; source, transformaciones, filtro de
  bots y taps **textuales**) + `bronze_v1.schema` + README.
- `index-function/` — el código que corre en la nube por cada archivo que
  aterriza y escribe el índice en Firestore.
- `scripts/deploy-lake-index.sh` (`npm run infra:index`) — instala el índice
  entero: service account, tópico, notificaciones del bucket y deploy.
- `scripts/deploy-vector-config.sh` (`npm run infra:vector`) — publica la
  config al bucket, la VM la baja, **valida en `/tmp`** y recién entonces
  instala y recarga en caliente.

Hallazgos del portado: el original **ya tenía** `acknowledgements: true` y
`buffer.type: disk` en los tres sinks — la premisa de "pérdidas por buffers en
memoria" era falsa. Y la única incógnita real es si la versión instalada
soporta parquet en el sink de GCS; el plan B (API compatible con S3 + HMAC)
está documentado.

Convención adoptada: **nombres de archivos, funciones y variables en inglés;
comentarios en castellano**.

### 2026-08-12 — Iteración 7: Vector afuera, Redpanda Connect adentro

**Decisión de Andrés**: bronze tiene que ser parquet, y con evidencia en la
mano Vector no puede escribirlo hacia GCS — su sink nativo de GCS no soporta
parquet en NINGUNA versión, y la vía de la API compatible con S3 muere en el
checksum CRC32 que los SDK de AWS meten en la firma desde 2025 y Google no
implementa (403 `InvalidSecurity`, y Vector encima lo trataba como error no
reintentable y DESCARTABA los eventos). Fuentes en
`data-analizer-ops/infra/redpanda-connect/README.md`.

**Lo hecho (ejecutado por Claude con gcloud local, verificado paso a paso):**

1. Config portada 1:1 a `infra/redpanda-connect/connect.yaml` (Bloblang):
   mismo endpoint, mismas 17 columnas con TIMESTAMP(MICROS), misma corrección
   de reloj, mismo regex de bots, ids `""`→null. Unidad de systemd propia
   (usuario de servicio sin shell, sistema de sólo lectura salvo su estado).
2. **Durabilidad mejor que la original**: buffer sqlite en
   `/var/lib/redpanda-connect/` — el 200 al SDK sale con el evento YA
   persistido (el http_server de Vector ni soportaba acknowledgements).
3. **Ensayo general** en el 8081 contra `rehearsal/` antes de tocar nada:
   parquet verificado con DuckDB local (17 columnas, TIMESTAMP WITH TIME
   ZONE, bot filtrado, user_id NULL, corrección de reloj exacta) y raw
   verificado con la query textual de la app (`unnest(json)`).
4. **Cambio de guardia** con ventana de segundos: lint → instalar → stop
   vector → start redpanda-connect. Vector drenó su raw pendiente al parar
   (último `.zst` en el bucket). POST local 200, POST por el dominio con TLS
   200, listener SOLO en loopback.
5. Primer flush de producción verificado: `.log.gz` en raw y `.parquet` en
   bronze con los dos eventos de prueba, mismo segundo de flush.
6. **Piedra nueva y su arreglo**: la función del índice no recibía nada —
   Pub/Sub empujaba con la identidad `index-writer` y a esa cuenta le
   faltaba `roles/run.invoker` sobre el servicio (secuela del primer deploy
   fallido). Otorgado a mano y AGREGADO al script `deploy-lake-index.sh`
   para instalaciones futuras. Pub/Sub reintenía desde hacía una hora: al
   dar el permiso, el backlog entra solo.

**Cambios a sabiendas** (detalle en el README del ingestor): raw pasa a
`.log.gz` (el compresor no trae zstd; DuckDB/BigQuery leen gzip igual), la
carpeta `dt=` sale de la hora del FLUSH, y se retiraron los extras de
observabilidad de Vector (errors/, taps, métricas a CloudWatch).

**Pendiente de esta iteración**: purga final de Vector en la VM + revocación
de las claves HMAC (quedaron expuestas en un pantallazo y ya no las usa
nadie), tras confirmar el índice poblado. → HECHO en la misma iteración:
Vector purgado (binario + /etc + /var/lib + drop-ins), HMAC desactivada y
borrada (`Listed 0 items`), índice verificado con los 4 raw + 1 bronze.

### 2026-08-12 — Iteración 8: la app a una sola credencial (Google puro)

Andrés quitó del `.env` todo lo de AWS/S3 y fijó la doctrina: **todo sale de
Firestore/RTDB — una sola identidad**. Implementado en la app:

1. **Muere `src/main/s3/`** (y la dependencia `@aws-sdk/client-s3`); nace
   `src/main/lake/lake.ts`: cliente de Cloud Storage autenticado con LA MISMA
   service account de Firebase (misma clave del `.env` para Firestore, RTDB y
   el lake). Mismos contratos (`RemoteObject`, `listPrefix`, `dayPrefix`).
2. **`env.ts` reescrito**: obligatorias sólo las tres `FIREBASE_*`; el bucket
   se deriva (`<proyecto>-lake`), prefijos con default (`LAKE_*` para
   overrides), `INGEST_*` con default. `AWS_*` pasa a opcional y SOLO
   alimenta la tarjeta de facturación mientras dura el retiro (sin claves,
   la tarjeta avisa y no molesta).
3. **El viewer sin credenciales aparte**: baja el objeto EN MEMORIA con la
   identidad de Firebase, lo apoya un instante en un temporal del sistema
   para que DuckDB lo abra (parquet y NDJSON .gz/.zst) y lo borra pase lo
   que pase. Se fue httpfs, el PRELUDE y cualquier secreto en el entorno del
   proceso de DuckDB. (Decisión: NO claves HMAC de lectura para DuckDB —
   cero credenciales le ganó a la elegancia de leer gs:// directo.)
4. `catalogService` lee el catálogo de eventos del lake con el mismo cliente.
5. Textos de UI: "S3" → "el lake"; el aviso de IAM de la capa raw quedó
   genérico.

Verificado: typecheck + 63/63 + build. El `.env` de la app queda en TRES
líneas (`FIREBASE_*` del proyecto `sessions-ingest`).

Pendientes que siguen abiertos (sin cambios): remoto del repo, rewrite de
`vercel.json` → dominio nuevo, catálogo `events_v*.json` al lake nuevo,
`monitoring.viewer` para la SA del Admin SDK en `sessions-ingest`, BigQuery
(F7), cierre de AWS (F8).

### 2026-08-12 — Iteración 9: la presencia en vivo, a la plataforma nueva

Chequeo pedido por Andrés ("no llega a RTDB la info de sesión"): había UNA
sesión viva cayendo en la RTDB VIEJA (data-analyzer-1c0fe) y cero en la
nueva — la landing lleva la URL compilada (`src/config.js:27`). Hecho:

1. **Reglas de la RTDB nueva** aplicadas por REST (`.settings/rules.json`):
   todo denegado salvo `activeSessions/$conn` con `.write: true` — el
   navegador escribe su presencia sin autenticar, nadie puede leer (la app
   lee por Admin SDK, que no pasa por reglas).
2. **`src/config.js` repuntado** a
   `https://sessions-ingest-default-rtdb.firebaseio.com`.
3. **Pendiente de Andrés: redeploy de la landing en Vercel** — la URL viaja
   compilada, así que hasta el deploy la presencia sigue yendo a la vieja.

Verificación tras el deploy: entrar al sitio y mirar Vivo en la app (o
`GET /activeSessions.json?shallow=true` de la RTDB nueva).

### 2026-08-13 — Iteración 10: el catálogo de eventos nace del código

Pedido de Andrés: que los enums de la suite (behavior + business) sean LA
fuente del catálogo, publicados al lake como `event-types` y leídos por ops
para el picker de relevantes y la vista de Vivo.

1. **`scripts/publish-event-types.mjs`** en la landing
   (`npm run publish:event-types`): extrae `BehaviorEventNames` (14) y
   `BusinessEventNames` (16) de `events-suite/types/events.ts`, corta con
   error si un enum no aparece/queda vacío o hay nombres repetidos, arma el
   formato declarado que ya entiende ops (grupos Comportamiento/Negocio con
   labels titleizados) y lo sube a
   `gs://<proyecto>-lake/schemas/event-types.json` vía gcloud. Publicado y
   verificado en `sessions-ingest-lake`.
2. **Ops**: `catalogService` deja de listar `events_v*.json` y lee ese único
   objeto (`schemaPrefix + event-types.json`); sin catálogo publicado cae a
   Firestore como siempre. `registry.declaredEventsOf` quedó INTACTO (el
   formato es el mismo) — tests de precedencia sin tocar, 63/63.
3. Vivo no se tocó: suma por sesión, porcentajes de relevantes y picker
   consumen el mismo `EventCatalog` de siempre.

Con esto queda resuelto el pendiente "catálogo events_v*.json al lake
nuevo": ya no se copia el viejo — se genera del código, que es la fuente.
(Más tarde el mismo día, a pedido de Andrés, el script se mudó a
`events-suite/scripts/publish-event-types.mjs` — la suite es dueña de sus
enums; el comando `npm run publish:event-types` no cambió y quedó
verificado republicando idéntico.)

### 2026-08-13 — Iteración 11: Status vigila el proyecto nuevo (Firebase + GC)

Pedido de Andrés: volver a tener control en la pestaña Status, mirando al
Firebase correcto y a Google Cloud con las variables relevantes.

1. **IAM ejecutado** (faltaba; era el pendiente que dejaba la tarjeta de
   Firebase sin datos):
   `gcloud projects add-iam-policy-binding sessions-ingest --member="serviceAccount:firebase-adminsdk-fbsvc@sessions-ingest.iam.gserviceaccount.com" --role="roles/monitoring.viewer" --condition=None`
   — la SA del Admin SDK (la única credencial de la app) ahora puede leer
   Cloud Monitoring. Verificado antes: NADIE tenía `monitoring.viewer`.
2. **Métricas verificadas con datos reales** en `sessions-ingest` (sondeo
   timeSeries, sin inventar nombres): operaciones y bytes servidos de GCS
   por método, salida de red de la VM, ejecuciones de `index-writer`,
   `byte_cost` de Pub/Sub, tamaño de `gcf-artifacts`, y los contadores de
   Firestore/RTDB del proyecto nuevo. Los gauges DIARIOS de almacenamiento
   (GCS `storage/total_bytes` y Firestore `data_and_index_storage_bytes`)
   todavía NO publican en el proyecto (0 puntos en 8 días; proyecto de 3
   días) — aparecerán solos; mientras, la fila del lake sale del ÍNDICE de
   Firestore que el vigía ya tiene en memoria (única fuente, costo cero).
3. **Ops, tarjeta "Google Cloud · mes en curso"**: lake almacenado (índice),
   ops GCS clase A/B del mes (clasificador por verbo del método, un rewrite
   se cuenta una sola vez, lo desconocido cae en A como cota superior),
   servido GCS, salida de la VM, ejecuciones de la función, Pub/Sub y
   Artifact Registry — cada una con su % de Always Free (verificado en la
   página oficial: 5 GB-mes / 5.000 A / 50.000 B / 100 GB GCS; 1 GB VM;
   2M funciones; 10 GiB Pub/Sub; 0,5 GB Artifact Registry), amarillo >75 %
   y rojo >90 %. La tarjeta AWS quedó al final (en retiro). Cliente de
   Monitoring compartido en `status/monitoring.ts`; tests 69/69.

Verificado de paso: la VM cumple Always Free (e2-micro en `us-east1-c`,
disco `pd-standard` de 30 GB) y la app ya consulta el proyecto nuevo (las
lecturas QUERY de hoy en Firestore son sus agregaciones del arranque).

### 2026-08-13 — Iteración 12: dólares en Status y adiós AWS

Pedidos de Andrés: columna de dólares gastados por métrica, título
"Firebase · uso" (sin "de hoy") y quitar la tarjeta de S3/AWS.

1. **AWS retirado ENTERO de la app** (no sólo la tarjeta): billingService,
   canal IPC, hook, tipos, la sección `aws` del env y la dependencia
   `@aws-sdk/client-cost-explorer` desinstalada. La app quedó sin un solo
   byte de AWS; el `.env.example` ya no menciona AWS_*.
2. **Columna Costo** en las tarjetas de Firebase y Google Cloud:
   `max(0, uso − franquicia) × tarifa`, US$ 0,00 visible mientras se viva
   adentro del gratis; el excedente se pinta rojo. Las filas de almacenado
   muestran el RITMO mensual al valor actual; los egresos heredan su "cota
   superior"; las conexiones de la RTDB muestran "—" (en Blaze no se
   facturan — pasar de 100 es aviso de escala, no de plata).
3. **Tarifas verificadas contra el catálogo oficial de Cloud Billing**
   (`services.skus` de la API, habilitada en el proyecto; el SKU trae la
   franquicia embebida y confirma las ventanas): Firestore nam5 0,06 /
   0,18 / 0,02 por 100k y 0,18 GiB-mes (gratis 1 GiB); RTDB 1 US$/GiB
   bajado (gratis ≈360 MiB/día ≈ los "10 GB/mes") y 5 US$/GiB-mes (gratis
   1 GiB); GCS "Standard Storage US Regional" 0,02 GiB-mes (gratis 5 GiB),
   ops A 0,005/1.000 tras 5.000 y B 0,0004/1.000 tras 50.000; Cloud Run
   Requests 0,40/millón tras 2M; Pub/Sub "Message Delivery Basic"
   40 US$/TiB tras 10 GiB exactos; Artifact Registry 0,10 GiB-mes tras
   0,5 GiB. Egresos (VM y GCS servido): primer tramo a internet
   0,12 US$/GB de la página de red (no consultado por catálogo — Compute
   tiene decenas de miles de SKUs). Franquicias de la UI corregidas a las
   unidades del catálogo (GiB donde corresponde).

Verde: typecheck, 69/69 tests, build.

**PIEDRA del proyecto virgen (2026-08-13, para futuras réplicas)**: la app
tiró `9 FAILED_PRECONDITION: The query requires an index` — el log de
"últimos archivos" (`newestDayFiles`: orderBy `__name__` DESC con límite
sobre `files`) necesita un índice que Firestore NO trae de fábrica (el
automático de `__name__` es sólo ascendente) y que en el proyecto viejo ya
existía. OJO doble piedra: el primer intento con alcance collection-group
NO la sirvió (verificado con runQuery: siguió el FAILED_PRECONDITION — un
índice de grupo NO reemplaza al de colección para esta consulta). El que
la consulta exige es alcance COLLECTION:
`gcloud firestore indexes composite create --project=sessions-ingest --database="(default)" --collection-group=files --query-scope=collection --field-config="field-path=__name__,order=descending"`
→ agregar ESTE comando al paso de Firestore del runbook (el de
collection-group quedó creado además; es inofensivo).

### 2026-08-13 — Iteración 13: el gasto se lee DE ORIGEN (export de facturación)

Directiva de Andrés: nada de calcular dólares localmente con tarifas —
"quiero que consumas de origen" — y un número GLOBAL de la cuenta (el
informe "Servicios de este mes" de la consola). La columna Costo local de
la iteración 12 se eliminó el mismo día.

1. **Fuente**: la exportación estándar de costos de la cuenta de
   facturación a BigQuery — el equivalente programático exacto del
   informe de la consola (que no tiene API pública): costo por uso,
   ahorros (créditos y capa gratuita) y subtotal por servicio, en EUR,
   con TODOS los proyectos de la cuenta. La cuenta es
   `01BF36-37A196-9E508D` ("Mi cuenta de facturación 1") y paga CUATRO
   proyectos: sessions-ingest, smarty-9bb94, landing-innerith y
   data-analyzer-1c0fe — todo eso cae en el número global.
2. **Infra ejecutada**: API `bigquery.googleapis.com` habilitada; dataset
   `sessions-ingest:facturacion` creado en US; la SA de la app quedó
   READER del dataset (grant a nivel dataset, no proyecto) y
   `roles/bigquery.jobUser` del proyecto. También quedó habilitada
   `cloudbilling.googleapis.com` (se usó para leer el catálogo de SKUs).
3. **App**: tarjeta "Cuenta de Google · gastado del mes" arriba de las de
   uso — total grande + tabla Servicio / Costo por uso / Ahorros /
   Subtotal (las columnas del informe), moneda de la cuenta, una consulta
   al abrir + botón (gratis: la tabla pesa KB y BigQuery regala 1 TiB de
   consulta al mes). Query: `gcp_billing_export_v1_*` (comodín: no hace
   falta el id de cuenta) con `invoice.month` del mes en curso. Sin
   export activado la tarjeta explica el paso pendiente.
4. ~~PENDIENTE de Andrés: activar la exportación en la consola~~ —
   **rechazado por Andrés en la misma iteración** ("una consulta, un
   número, basta"): ese click también sobraba.

**Corrección final (misma iteración): notificaciones del presupuesto.**
Mecanismo definitivo, CERO pasos manuales, todo por API:

1. Presupuesto `gasto-cuenta` creado en la cuenta (id
   `ea9f6b20-bf74-4931-92af-161a42fba833`, SIN filtro de proyectos =
   cuenta completa, EUR 10 — el monto es irrelevante para la lectura) con
   notificaciones programáticas al topic `gasto-cuenta` de
   sessions-ingest.
2. Suscripción `gasto-cuenta-app` (retención 7 días, nunca expira).
   Permisos: `billing-budget-alert@system.gserviceaccount.com` publica en
   el topic; la SA de la app es subscriber de la suscripción.
3. Google publica VARIAS VECES AL DÍA `{costAmount, costIntervalStart,
   currencyCode}` — el gasto acumulado del mes calendario, créditos
   aplicados. `accountSpend.ts` hace pull SIN ackear (los mensajes quedan
   retenidos y siempre re-legibles) y muestra el más nuevo, con la hora
   en que Google lo publicó. Verificado el circuito con un pull manual
   (vacío al minuto de crear el presupuesto: la primera notificación
   tarda un rato en llegar).
4. El export a BigQuery quedó SIN activar; el dataset `facturacion` y sus
   permisos quedan listos por si algún día se quiere el desglose por
   servicio — sigue siendo un click.
5. Botón "Informe en la consola ↗" en la tarjeta: abre
   `console.cloud.google.com/billing/01BF36-37A196-9E508D/reports` en el
   NAVEGADOR del sistema (shell.openExternal), donde la sesión de Google
   ya existe. Embeber la consola es imposible: sus páginas rechazan
   iframes (X-Frame-Options/CSP) y el login de Google no corre en
   navegadores embebidos. La cuenta quedó como constante compartida
   (`BILLING_ACCOUNT_ID`).
6. **Cierre FINAL (mismo día, decisión de Andrés: "volá absolutamente
   todo lo de facturación")**: la app NO muestra plata. Se eliminó la
   tarjeta entera con su servicio, canal, hook y tipo; quedaron DOS
   botones en Status — "GC · facturación ↗" (informe de la cuenta
   completa) y "Firebase · uso ↗"
   (`console.firebase.google.com/u/0/project/<proyecto>/usage`) — cada
   uno abre su consola en el navegador. En la nube se BORRARON el
   presupuesto `gasto-cuenta`, el topic y la suscripción (nadie los
   leía). Única infra remanente de toda la saga: el dataset
   `facturacion` (vacío) + los permisos de BigQuery de la SA — gratis e
   invisibles, listos si algún día se quiere el export.

Verde: typecheck, 69/69 tests, build.
