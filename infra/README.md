# infra/ — scripts de operación del pipeline

Fuente de verdad VERSIONADA de todo lo que se ejecuta en CloudShell/EC2.
CloudShell recicla su home (~120 días de inactividad, y es por región): nada
importante vive solo ahí. Convención: **todo script de ops nace en esta
carpeta**, y a CloudShell solo se copia.

```
cloudshell/run.sh             ejecutor remoto: bash run.sh "comando" → SSM → EC2 → output
cloudshell/publish-schema.sh  publica bronze_v1.schema en s3://…/schemas/<v>/
```

## publish-schema.sh

Deja el esquema de bronze **versionado en el propio data lake**, a la misma
altura que `raw/` y `bronze/`:

    bash publish-schema.sh        # → <base>schemas/1/bronze_v1.schema
    bash publish-schema.sh 2      # → <base>schemas/2/…  (tras cambiar el esquema)

Corre en CloudShell, no en la EC2: trae el archivo por SSM (en base64, bytes
exactos) y lo sube con las credenciales de CloudShell, porque el rol de la
instancia puede tener el `PutObject` acotado a las capas de datos.

El bucket y la altura de `raw`/`bronze` **se deducen de `/etc/vector/vector.yaml`**
(nada hardcodeado); si hay más de un bucket candidato aborta y los lista —
mejor parar que escribir en el lugar equivocado (`BUCKET=<nombre> bash …` para
resolverlo a mano). Si el objeto ya está y es idéntico no hace nada; si difiere
**no lo pisa**: sugiere publicar la versión siguiente (o `FORCE=1`).

De yapa, en el mismo viaje publica `run.sh` en `<base>ops/run.sh` y vuelca
`vector.yaml` + el esquema al final del output.

Marcadores de verificación: `FETCH_OK` · `PUBLISH_OK` (o `YA_EXISTE_IDENTICO`)
· `LISTADO_OK` · `RUNSH_OK`.

## Restaurar run.sh en CloudShell

Opción 1 — pegar el archivo (siempre funciona):

    cat > run.sh << 'OUTER'
    …contenido de cloudshell/run.sh…
    OUTER
    chmod +x run.sh

Opción 2 — desde S3 (bootstrap de una línea, una vez publicado):

    aws s3 cp s3://<BUCKET-DEL-PIPELINE>/ops/run.sh . && chmod +x run.sh

Se publica solo: `publish-schema.sh` sube `run.sh` a `<base>ops/run.sh` en el
mismo viaje e imprime la línea exacta de restauración (con el bucket ya
resuelto). A mano sería `aws s3 cp run.sh s3://<BUCKET>/ops/run.sh`; el nombre
del bucket está en `/etc/vector/vector.yaml` de la instancia.

## Infra de referencia

| Qué | Dónde |
|---|---|
| EC2 | `i-0c3181f7280153931` · us-east-1 · IP pública `44.207.109.162` |
| Vector | systemd; config `/etc/vector/vector.yaml`, esquema `/etc/vector/bronze_v1.schema` |
| Ingest | `http://127.0.0.1:8080/v1/batch` (expuesto interinamente en :8080 hasta Caddy) |
| Logs | `journalctl -u vector -f` |
