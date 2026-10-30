# Maintenance and monitoring

## Status and troubleshooting

```bash
minikube status
minikube kubectl -- -n nescom get pods,services,pvc
minikube kubectl -- -n nescom get events --sort-by=.lastTimestamp
minikube kubectl -- -n nescom logs deployment/backend --tail=80
free -h
df -h
docker system df
```

If a pod is Pending, inspect its events with `minikube kubectl -- -n nescom describe pod POD_NAME`. If the EC2 host runs out of memory, increase its instance memory before expanding replicas. Application requests total 250 millicores and 256 MiB; container limits total 1.25 CPUs and 512 MiB. Kubernetes, the host, builds, and integration test containers need additional memory.

## Backup

Run from a checked-out repository on EC2:

```bash
bash scripts/backup.sh
```

The script uses the authenticated local database connection inside the PostgreSQL pod and does not print its password. Download backups from EC2 to another durable location. Local backups are lost with the server disk. Git ignores the backups directory.

For a restore, first take a current backup and stop the backend to avoid writes. The SQL backup is a full plain-format database dump. Restore to an empty database, not over existing populated tables. Test restore in a separate environment before using it for recovery.

## Rollback

The deploy script remembers the prior frontend/backend image names and attempts to restore them if rollout or smoke verification fails. A first deployment has no prior version to restore. Database schema changes are not automatically rolled back.

For a manual application rollback:

```bash
minikube kubectl -- -n nescom rollout history deployment/backend
minikube kubectl -- -n nescom rollout undo deployment/backend
minikube kubectl -- -n nescom rollout undo deployment/frontend
minikube kubectl -- -n nescom rollout status deployment/backend --timeout=180s
minikube kubectl -- -n nescom rollout status deployment/frontend --timeout=180s
bash scripts/smoke.sh
```

Keep the previous release images in Minikube. Do not delete the cluster, database PVC, or EC2 volume as part of routine cleanup. Review `docker system df` and old release usage before deleting particular unused images. Build history retention does not remove Docker images automatically.

## Updates

Commit source changes to GitHub; Jenkins polls for changes. Keep package-lock.json committed. Update dependencies deliberately, run the tests, and rebuild. Base images are fixed to major/minor channels (Node 24, PostgreSQL 17, Nginx 1.28), not immutable digests. Update approved base images and use digest pinning for stronger reproducibility. Review Jenkins and plugin updates, disk capacity, and backups regularly.

## Additional monitoring EC2 instance

Create the monitoring server later, in the same VPC as the application instance. Install Prometheus to collect metrics and Grafana to display them. Grafana alone does not collect host or application metrics.

Suggested lab metrics:

- Host CPU, RAM, disk through node_exporter on the application host.
- API request count and uptime from backend `/metrics`.
- HTTP availability through blackbox_exporter or an explicit application probe.
- Pod status requires Kubernetes metrics such as kube-state-metrics and authenticated API connectivity; node_exporter alone does not provide pod status.

For the initial monitoring lab, forward the backend service to the application host's PRIVATE IP on port 9101:

```bash
minikube kubectl -- -n nescom port-forward --address=APP_PRIVATE_IP service/backend 9101:3000
```

Replace APP_PRIVATE_IP with the EC2 private IPv4 address. This temporary terminal command must stay running; use a systemd service for persistent forwarding later. Allow inbound TCP 9101 and node_exporter TCP 9100 on the application security group only from the monitoring server's security group. Keep the PostgreSQL port private.

Prometheus scrape configuration on the monitoring server:

```yaml
scrape_configs:
  - job_name: nescom-api
    static_configs:
      - targets: ['APP_PRIVATE_IP:9101']
  - job_name: nescom-host
    static_configs:
      - targets: ['APP_PRIVATE_IP:9100']
```

Node exporter must be installed and listening before its target becomes healthy. Use Grafana with a Prometheus datasource at http://localhost:9090 when both run on the same monitoring host. Restrict Grafana TCP 3000 to your IP or access it through an SSH tunnel. Do not open Prometheus TCP 9090 publicly. Suggested dashboard queries include `rate(nescom_http_requests_total[5m])`, `nescom_process_uptime_seconds`, and `up{job="nescom-api"}`.

Monitoring is planned here, not installed automatically. No EC2 instances are created by these files, and no recurring maintenance task is scheduled.
