#!/usr/bin/env bash
set -euo pipefail
log=$(mktemp)
minikube kubectl -- -n nescom port-forward --address=127.0.0.1 service/frontend 18080:80 >"$log" 2>&1 &
pf_pid=$!
cleanup() { kill "$pf_pid" 2>/dev/null || true; wait "$pf_pid" 2>/dev/null || true; rm -f "$log"; }
trap cleanup EXIT
ready=false
for attempt in $(seq 1 30); do
  if ! kill -0 "$pf_pid" 2>/dev/null; then cat "$log"; exit 1; fi
  if curl -fsS --max-time 3 http://127.0.0.1:18080/api/health >/dev/null; then ready=true; break; fi
  sleep 2
done
if [ "$ready" != true ]; then cat "$log"; exit 1; fi
python3 - <<'PY'
import json, urllib.request
base='http://127.0.0.1:18080'
with urllib.request.urlopen(base+'/', timeout=10) as response:
    assert 'NESCOM TechFest' in response.read().decode()
with urllib.request.urlopen(base+'/api/events', timeout=10) as response:
    events=json.load(response)
    assert len(events) >= 4 and all('remaining' in event for event in events)
print('Smoke check passed: homepage, reverse proxy, API, and database.')
PY
