#!/bin/bash
# publish-schema.sh [VERSION] — publica /etc/vector/bronze_v1.schema en S3, en
# `schemas/<VERSION>/`, a la misma altura que `raw/` y `bronze/`.
#
# Corre EN CLOUDSHELL (no en la EC2): saca el archivo de la instancia por SSM y
# lo sube con las credenciales de CloudShell, porque el rol de la instancia
# puede tener el PutObject acotado a las capas de datos.
#
# El bucket y la altura de raw/bronze NO se hardcodean: se deducen de
# /etc/vector/vector.yaml. Si hay más de un bucket candidato, aborta y los
# lista (mejor parar que escribir en el lugar equivocado).
#
# Idempotente: si el objeto ya está y es idéntico no hace nada; si difiere NO
# lo pisa — publicá otra versión (`bash publish-schema.sh 2`) o forzá con
# FORCE=1. De yapa: publica run.sh en <base>ops/run.sh y vuelca vector.yaml +
# el schema al final del output.
#
# Fuente de verdad: infra/cloudshell/ del repo smarty-landing.

set -euo pipefail
export AWS_PAGER=""   # sin esto la CLI manda cada output a `less` y cuelga el script
IID="i-0c3181f7280153931"
VER="${1:-1}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# ---------- 1. traer vector.yaml + el schema (base64 = bytes exactos) -------
cat > "$WORK/params.json" << 'JSON'
{"commands":[
 "echo ===VECTOR_YAML===",
 "cat /etc/vector/vector.yaml",
 "echo ===SCHEMA_B64===",
 "base64 -w0 /etc/vector/bronze_v1.schema",
 "echo",
 "echo ===END==="
]}
JSON

CMD_ID=$(aws ssm send-command --instance-ids "$IID" \
  --document-name AWS-RunShellScript \
  --parameters "file://$WORK/params.json" \
  --query Command.CommandId --output text)

STATUS=Pending
for _ in $(seq 1 20); do
  sleep 2
  STATUS=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$IID" \
    --query Status --output text 2>/dev/null || echo Pending)
  if [ "$STATUS" = Success ] || [ "$STATUS" = Failed ]; then break; fi
done

OUT=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$IID" \
  --query StandardOutputContent --output text)

if [ "$STATUS" != Success ]; then
  echo "SSM_FAIL ($STATUS)"; printf '%s\n' "$OUT"; exit 1
fi
case "$OUT" in
  *"===END==="*) : ;;
  *) echo "OUTPUT_TRUNCADO — SSM cortó el output; no puedo garantizar el archivo"; exit 1 ;;
esac

printf '%s\n' "$OUT" \
  | sed -n '/^===VECTOR_YAML===$/,/^===SCHEMA_B64===$/p' | sed '1d;$d' > "$WORK/vector.yaml"
printf '%s\n' "$OUT" \
  | sed -n '/^===SCHEMA_B64===$/,/^===END===$/p' | sed '1d;$d' | tr -d '\r\n ' \
  | base64 -d > "$WORK/bronze_v1.schema"

[ -s "$WORK/bronze_v1.schema" ] || { echo "SCHEMA_VACIO — no bajó nada"; exit 1; }
echo "FETCH_OK  ($(wc -c < "$WORK/bronze_v1.schema") bytes de bronze_v1.schema)"

# ---------- 2. deducir bucket y la altura de raw/bronze --------------------
BUCKETS=$(grep -E '^[[:space:]]*bucket:' "$WORK/vector.yaml" \
  | sed -e 's/.*bucket:[[:space:]]*//' | tr -cd 'a-z0-9.\n-' | sort -u | grep . || true)

if [ -z "${BUCKET:-}" ]; then
  COUNT=$(printf '%s\n' "$BUCKETS" | grep -c . || true)
  if [ "$COUNT" != 1 ]; then
    echo "BUCKET_AMBIGUO ($COUNT candidatos en vector.yaml):"
    printf '  %s\n' $BUCKETS
    echo "Reintentá fijándolo: BUCKET=<nombre> bash publish-schema.sh $VER"
    exit 1
  fi
  BUCKET="$BUCKETS"
fi
case "$BUCKET" in
  [a-z0-9]*) : ;;
  *) echo "BUCKET_INVALIDO ('$BUCKET') — ¿viene templado en vector.yaml?"
     echo "Fijalo a mano: BUCKET=<nombre> bash publish-schema.sh $VER"; exit 1 ;;
esac

BRONZE_KP=$(grep -E 'key_prefix:' "$WORK/vector.yaml" | grep -i bronze | head -1 \
  | sed -e 's/.*key_prefix:[[:space:]]*//' -e "s/[\"']//g" || true)
BASE=$(printf '%s' "$BRONZE_KP" | sed -e 's#[Bb]ronze.*##')
[ -n "$BRONZE_KP" ] || echo "AVISO: no encontré key_prefix de bronze — asumo raíz del bucket"

KEY="${BASE}schemas/${VER}/bronze_v1.schema"
echo "BUCKET=$BUCKET"
echo "BRONZE_KEY_PREFIX=${BRONZE_KP:-<raiz>}"
echo "DESTINO=s3://$BUCKET/$KEY"

# ---------- 3. subir (sin pisar nada distinto) -----------------------------
if aws s3api head-object --bucket "$BUCKET" --key "$KEY" >/dev/null 2>&1; then
  aws s3 cp "s3://$BUCKET/$KEY" "$WORK/remoto.schema" --quiet
  if cmp -s "$WORK/remoto.schema" "$WORK/bronze_v1.schema"; then
    echo "YA_EXISTE_IDENTICO — nada que hacer"
  elif [ "${FORCE:-0}" = "1" ]; then
    aws s3 cp "$WORK/bronze_v1.schema" "s3://$BUCKET/$KEY" --content-type text/plain
    echo "PUBLISH_OK (pisado con FORCE=1)"
  else
    echo "DIFIERE — el objeto publicado NO es el schema actual. No piso nada."
    echo "  publicado: $(md5sum < "$WORK/remoto.schema"  | cut -c1-32)"
    echo "  actual   : $(md5sum < "$WORK/bronze_v1.schema" | cut -c1-32)"
    echo "  → nueva version:  bash publish-schema.sh $((VER + 1))"
    echo "  → o pisar:        FORCE=1 bash publish-schema.sh $VER"
    exit 2
  fi
else
  aws s3 cp "$WORK/bronze_v1.schema" "s3://$BUCKET/$KEY" --content-type text/plain
  echo "PUBLISH_OK"
fi

# ---------- 4. verificar in situ -------------------------------------------
echo "--- s3://$BUCKET/${BASE} (raw / bronze / schemas a la misma altura) ---"
aws s3 ls "s3://$BUCKET/${BASE}"
echo "--- s3://$BUCKET/${BASE}schemas/${VER}/ ---"
aws s3 ls "s3://$BUCKET/${BASE}schemas/${VER}/"
echo "LISTADO_OK"

# ---------- 5. de yapa: run.sh a S3 (bootstrap anti-reciclado de CloudShell)
if [ -f run.sh ]; then
  aws s3 cp run.sh "s3://$BUCKET/${BASE}ops/run.sh" --content-type text/x-shellscript
  echo "RUNSH_OK  restaurar con: aws s3 cp s3://$BUCKET/${BASE}ops/run.sh . && chmod +x run.sh"
else
  echo "RUNSH_SKIP (no hay run.sh en $PWD)"
fi

# ---------- 6. volcado para el repo ----------------------------------------
echo "===DUMP_VECTOR_YAML==="
cat "$WORK/vector.yaml"
echo "===DUMP_BRONZE_SCHEMA==="
cat "$WORK/bronze_v1.schema"
echo "===DUMP_END==="
