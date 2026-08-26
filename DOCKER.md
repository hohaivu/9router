# Docker

Run 9Router from a published image or build the repository locally. Both modes persist state at `/app/data`.

> **Keep the data volume.** It contains the SQLite database, certificates, runtime configuration, and generated secrets. Updating a container does not require deleting its volume.

---

# User deployment: published image

```bash
mkdir 9router && cd 9router
curl -fsSLO https://raw.githubusercontent.com/decolua/9router/main/.env.example
cp .env.example .env
# Replace every required placeholder in .env, then:
chmod 600 .env

docker run -d \
  --name 9router \
  --restart unless-stopped \
  --env-file .env \
  -e DATA_DIR=/app/data \
  -e PORT=20128 \
  -e HOSTNAME=0.0.0.0 \
  -p 20128:20128 \
  -v 9router-data:/app/data \
  decolua/9router:latest
```

Open <http://localhost:20128>.

## Update a published image

```bash
docker pull decolua/9router:latest
docker rm -f 9router
docker run -d \
  --name 9router \
  --restart unless-stopped \
  --env-file .env \
  -e DATA_DIR=/app/data \
  -e PORT=20128 \
  -e HOSTNAME=0.0.0.0 \
  -p 20128:20128 \
  -v 9router-data:/app/data \
  decolua/9router:latest
```

This recreates only the container. The `9router-data` volume remains intact.

---

# Repository deployment: local source build

The repository's canonical local deployment definition is [`compose.yaml`](./compose.yaml). [`deploy.sh`](./deploy.sh) always uses this file; do not deploy the legacy [`docker-compose.yml`](./docker-compose.yml).

```bash
git clone https://github.com/decolua/9router.git
cd 9router
cp .env.example .env
# Edit .env: replace required placeholders and set the public URL if applicable.
chmod 600 .env
./deploy.sh
```

`deploy.sh` validates Compose, rebuilds the local image, recreates only the `9router` service, and waits for its health check. It preserves the named volume `9router_9router-data`; never use `docker compose down --volumes` unless you deliberately intend to erase all 9Router data.

Useful commands:

```bash
docker compose -f compose.yaml ps
docker compose -f compose.yaml logs -f 9router
docker compose -f compose.yaml config
docker volume inspect 9router_9router-data
```

## Runtime configuration

`.env` is deliberately ignored by Git and excluded from Docker build context. Do not commit it or put secrets in a Compose file.

Required values:

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Persistent secret that signs dashboard authentication cookies. |
| `INITIAL_PASSWORD` | First dashboard password, until a password hash is saved in the database. |
| `API_KEY_SECRET` | HMAC secret for generated API keys. |
| `MACHINE_ID_SALT` | Salt used to derive the stable machine ID. |

Generate a value with `openssl rand -hex 32` (or another cryptographically secure generator). For a public HTTPS deployment, set `BASE_URL` and `NEXT_PUBLIC_BASE_URL` to its externally reachable `https://` URL, set `AUTH_COOKIE_SECURE=true`, and generally set `REQUIRE_API_KEY=true`.

`DATA_DIR` is fixed to `/app/data` by `compose.yaml`, regardless of an `.env` value, so the mounted persistent volume is always used.

## Data persistence

```text
/app/data/
├── db/
│   ├── data.sqlite       # main SQLite database
│   └── backups/          # auto backups
├── certs/                # generated certificates, if used
└── ...                   # runtime configs and logs
```

For the repository Compose project, Docker stores that data in the named volume `9router_9router-data`. Inspect it with:

```bash
docker volume inspect 9router_9router-data
```

---

# Optional Headroom sidecar

The standard local deployment does **not** start Headroom. If you use an externally managed Headroom proxy, set `HEADROOM_URL` in `.env` to an address reachable from inside the 9Router container.

- Docker Desktop (macOS/Windows) host service: `http://host.docker.internal:8787`
- Docker Engine (Linux) host service: add an `extra_hosts` mapping for `host.docker.internal:host-gateway`, then use that URL
- Compose sidecar: use its service DNS name, e.g. `http://headroom:8787`

In the dashboard, open `Endpoint` → `Token Saver` → `Headroom`, confirm the URL, recheck status, then enable Headroom. Do not set it to `localhost` for a host-side service: `localhost` inside the 9Router container refers to the container itself.

---

# Container management

```bash
docker logs -f 9router
docker restart 9router
docker stop 9router
docker rm -f 9router             # safe for data; removes only the container
docker volume rm 9router-data     # destructive; deletes all data
```

The image listens on port `20128` with `HOSTNAME=0.0.0.0`.
