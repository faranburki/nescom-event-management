#!/usr/bin/env bash
set -euo pipefail
tag=${1:?Usage: bash scripts/integration.sh IMAGE_TAG}
run="nescom-test-$(date +%s)-$$"
cleanup() { docker rm -f "$run" >/dev/null 2>&1 || true; docker network rm "$run" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker network create "$run" >/dev/null
docker run -d --name "$run" --network "$run" --network-alias test-db --memory=192m \
  -e POSTGRES_USER=nescom -e POSTGRES_DB=nescom -e POSTGRES_PASSWORD=integration-only \
  postgres:17-alpine >/dev/null
ready=false
for attempt in $(seq 1 60); do
  if docker exec "$run" pg_isready -U nescom -d nescom >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
if [ "$ready" != true ]; then docker logs "$run"; exit 1; fi
docker run --rm --network "$run" --memory=192m \
  -e RUN_DB_TESTS=1 -e PGHOST=test-db -e PGUSER=nescom -e PGDATABASE=nescom -e PGPASSWORD=integration-only \
  "nescom-backend:$tag" node --test test/integration.test.js
