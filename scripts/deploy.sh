#!/usr/bin/env bash
set -Eeuo pipefail
tag=${1:?Usage: bash scripts/deploy.sh IMAGE_TAG}
[[ "$tag" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$ ]] || { echo 'Invalid image tag'; exit 1; }
k() { minikube kubectl -- "$@"; }
minikube status
minikube image load "nescom-backend:$tag"
minikube image load "nescom-frontend:$tag"
k apply -f k8s/namespace.yaml
if ! k -n nescom get secret database-credentials >/dev/null 2>&1; then
  secret_file=$(mktemp)
  chmod 600 "$secret_file"
  trap 'rm -f "$secret_file"' EXIT
  { printf 'POSTGRES_USER=nescom\nPOSTGRES_DB=nescom\nPOSTGRES_PASSWORD='; openssl rand -hex 24; } > "$secret_file"
  k -n nescom create secret generic database-credentials --from-env-file="$secret_file"
  rm -f "$secret_file"
  trap - EXIT
fi
k apply -f k8s/database.yaml
k -n nescom rollout status deployment/postgres --timeout=240s
old_backend=$(k -n nescom get deployment backend -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)
old_frontend=$(k -n nescom get deployment frontend -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)
rollback() {
  trap - ERR
  echo 'Deployment verification failed. Restoring previous application images where available.'
  if [ -n "$old_backend" ]; then k -n nescom set image deployment/backend "backend=$old_backend" || true; k -n nescom rollout status deployment/backend --timeout=180s || true; fi
  if [ -n "$old_frontend" ]; then k -n nescom set image deployment/frontend "frontend=$old_frontend" || true; k -n nescom rollout status deployment/frontend --timeout=180s || true; fi
  k -n nescom get pods
  exit 1
}
trap rollback ERR
sed "s/__TAG__/$tag/g" k8s/application.yaml | k apply -f -
k -n nescom rollout status deployment/backend --timeout=240s
k -n nescom rollout status deployment/frontend --timeout=240s
bash scripts/smoke.sh
trap - ERR
k -n nescom get pods,services,pvc
echo "Deployed release: $tag"
