#!/bin/bash
# run.sh "comando" — ejecuta un comando en la EC2 del pipeline vía SSM y trae
# el output. Se usa desde AWS CloudShell (us-east-1).
#
# CloudShell recicla el home (~120 días de inactividad, y es por región): este
# archivo se VERSIONA acá (infra/cloudshell/) como fuente de verdad. Para
# restaurarlo en CloudShell: pegar el contenido con `cat > run.sh << 'OUTER'
# ... OUTER` o bajarlo de S3 (ver infra/README.md).

set -euo pipefail
IID="i-0c3181f7280153931"

CMD_ID=$(aws ssm send-command --instance-ids "$IID" \
  --document-name "AWS-RunShellScript" \
  --parameters commands="$1" \
  --query "Command.CommandId" --output text)

for i in $(seq 1 15); do
  sleep 2
  STATUS=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$IID" --query Status --output text 2>/dev/null || echo Pending)
  if [ "$STATUS" = "Success" ] || [ "$STATUS" = "Failed" ]; then break; fi
done

aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$IID" \
  --query "[Status,StandardOutputContent,StandardErrorContent]" --output text
