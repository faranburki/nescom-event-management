#!/usr/bin/env bash
set -euo pipefail
mkdir -p backups
chmod 700 backups
backup="backups/nescom-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
umask 077
minikube kubectl -- -n nescom exec deployment/postgres -- sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$backup"
gzip -t "$backup"
echo "Backup written to $backup. Copy it off the EC2 server for durable recovery."
