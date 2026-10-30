# NESCOM Event Management

A three-tier student demonstration: Nginx frontend, Express API, and PostgreSQL database. Events, venues, and dates are fictional. Created for Faran Burki's Jenkins, Git, Docker, and Kubernetes lab.

## Features

- Responsive green and cream homepage, event filtering, schedule, and registration form.
- Database-backed events and registrations, immediate on-screen confirmation.
- Input validation, duplicate prevention, and transactional capacity checks.
- One pod per tier for a small Minikube cluster, with application health probes.
- PostgreSQL persistent volume claim. Data survives pod replacement, not destruction of Minikube or its underlying disk.
- Jenkins tests, image builds, integration tests, deployment, smoke verification, and recovery of previous application images after a failed deployment.
- Prometheus-format backend metrics ready for the later monitoring stage.

## Current lab topology

Windows laptop: Jenkins controller at http://localhost:8080.

Ubuntu EC2: Jenkins SSH agent (label `nescom-linux`, login `ubuntu`), Docker, and Minikube. Both Jenkins and manual Minikube commands use the same Ubuntu account.

A second EC2 instance will run Prometheus and Grafana later. It is not created by this repository.

## 1. Upload this source to GitHub

Extract the ZIP. Open the extracted `nescom-event-management` folder and upload its CONTENTS to https://github.com/faranburki/nescom-event-management using Add file > Upload files. `Jenkinsfile` must be at the repository root, alongside `backend`, `frontend`, `scripts`, and `k8s`. Upload extracted source files, not the ZIP. Do not upload node_modules, private keys, passwords, or runtime backups.

## 2. Prepare the EC2 build tool

On the already connected Ubuntu EC2 server:

```bash
sudo apt update
sudo apt install -y docker-buildx
docker buildx version
```

Docker, Git, Java 21, Python 3, OpenSSL, and Minikube must already be installed. The existing `nescom-environment-check` job should pass. If a Windows-side Git executable is required for SCM checkout, install Git for Windows and set its path in Manage Jenkins > Tools > Git installations.

## 3. Create the real Jenkins job

1. New Item > `nescom-cicd` > Pipeline > OK.
2. Pipeline > Definition: Pipeline script from SCM.
3. SCM: Git.
4. Repository URL: `https://github.com/faranburki/nescom-event-management.git`.
5. Credentials: none for the public repository.
6. Branch specifier: `*/main` (use the actual branch if different).
7. Script Path: `Jenkinsfile`.
8. Save > Build Now.

Pipeline stages: Checkout, Unit Tests, Build Images, Database Integration Tests, Deploy and Verify.

Jenkins polls Git every two minutes after the initial build registers the pipeline trigger. GitHub cannot directly deliver a webhook to a controller at localhost. Your laptop, Jenkins, and EC2 must stay running for this lab pipeline to work.

Images use a Git commit plus build number tag. They are built on EC2 and loaded into Minikube using `minikube image load`, without a Docker registry. This deliberately fits a single-node lab. A multi-node deployment should use a registry accessible to every node.

## 4. View the deployed website safely

After a successful build, run in the Ubuntu SSH terminal and leave it open:

```bash
minikube kubectl -- -n nescom port-forward --address=127.0.0.1 service/frontend 8081:80
```

Open another Windows PowerShell window:

```powershell
ssh -i "$env:USERPROFILE\Downloads\nescom-key.pem" -N -L 8081:127.0.0.1:8081 ubuntu@16.16.202.199
```

Keep that window open and visit http://localhost:8081. Replace the EC2 IP if it changes. This uses the existing SSH rule and does not expose the database or Kubernetes API. A public URL requires a separate host proxy or ingress exposure step; this package does not claim that an internal Minikube IP is publicly accessible.

Test with a sample name and an `example.com` email. A reference number should appear. Registering the same email for the same event must return a duplicate message. Refresh to confirm that available spaces update. No email is sent.

## 5. Demonstrate CI/CD

1. Edit the homepage heading in `frontend/index.html` through GitHub and commit to main.
2. Wait for polling, or click Build Now.
3. Watch the pipeline pass through all stages.
4. Refresh the website to see the new heading.

## API

| Method and path | Purpose |
| --- | --- |
| GET /api/events | Events and remaining places |
| POST /api/registrations | Register `{name, email, eventId}` |
| GET /api/health | Readiness including database |
| GET /healthz | Process liveness |
| GET /metrics | Prometheus metrics on the backend service |

The frontend proxies `/api/` to the backend. The backend metrics endpoint is intentionally not exposed by the frontend. Registration records have no public listing API.

## Tests and verification limits

Run backend tests with Node 24: `cd backend && npm ci && npm test`.

The unit tests use a stub database and cover HTTP status codes, validation, duplicates, transaction behavior, and capacity rejection. The integration test uses real PostgreSQL inside temporary Docker containers in Jenkins. It verifies database writes, case-insensitive duplicate rejection, and two concurrent bookings for the last seat. Its temporary database is removed afterwards.

The deployment smoke test checks the homepage, API reverse proxy, and live database without adding registrations. Docker builds, database integration, Kubernetes rollout, and browser behavior must be verified on your EC2 environment; local source checks alone do not prove deployment success.

## Maintenance

See `docs/maintenance.md` for backups, rollback, updates, storage cleanup, and monitoring connection notes.

This lab is not a production event service: it does not provide login, payment, cancellation, email delivery, public TLS hosting, or protection against automated registration abuse. Use sample details during demonstrations.
