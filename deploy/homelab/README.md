# Deploying Logicals on the homelab server

Matches the `~/docker/stacks/<name>` + `~/docker/data/<name>/repo` layout used by the
other self-built stacks (snake-ai, rummikub).

## One-time setup

```bash
# 1. Check out the app where the compose build context expects it
mkdir -p ~/docker/data/logicals
git clone https://github.com/jonasyr/-german-logic-puzzle-generator.git ~/docker/data/logicals/repo
# The web app currently lives on the feature branch; adjust BRANCH in autodeploy.sh
# if you deploy it before merging to main:
#   git -C ~/docker/data/logicals/repo checkout claude/logical-generator-analysis-fx42or

# 2. Install the stack files
mkdir -p ~/docker/stacks/logicals
cp ~/docker/data/logicals/repo/deploy/homelab/compose.yaml   ~/docker/stacks/logicals/
cp ~/docker/data/logicals/repo/deploy/homelab/autodeploy.sh  ~/docker/stacks/logicals/
chmod +x ~/docker/stacks/logicals/autodeploy.sh

# 3. Build and start
docker compose -f ~/docker/stacks/logicals/compose.yaml up -d --build
```

The app is then reachable on `http://<server>:3070`.

## Auto-deploy timer (same pattern as snake-ai)

```bash
sudo tee /etc/systemd/system/logicals-deploy.service > /dev/null <<'SERVICE'
[Unit]
Description=Logicals Auto-Deploy Check
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/home/jonas/docker/stacks/logicals/autodeploy.sh
WorkingDirectory=/home/jonas/docker/stacks/logicals
User=jonas
Group=jonas
Environment="HOME=/home/jonas"
StandardOutput=journal
StandardError=journal
SERVICE

sudo tee /etc/systemd/system/logicals-deploy.timer > /dev/null <<'TIMER'
[Unit]
Description=Logicals Auto-Deploy Timer (every 5 min)

[Timer]
OnBootSec=60
OnUnitActiveSec=5min
AccuracySec=30s

[Install]
WantedBy=timers.target
TIMER

sudo systemctl daemon-reload
sudo systemctl enable --now logicals-deploy.timer
```

## Reverse proxy / DNS

* Pi-hole: add a local DNS record `logicals.home` → server IP.
* Nginx Proxy Manager: proxy host `logicals.home` → `logicals:4173` (the container is on
  the shared `proxy` network, so no port needs to be published for this path).

## Measured resource usage

| Metric | Value |
| :--- | :--- |
| Image on disk | ~335 MB (Node Alpine base + python3/ReportLab) |
| Idle RAM | ~12 MiB |
| Peak RAM (2 parallel booklets + PDF) | ~55 MiB |
| CPU, 10 puzzles 5x5 "schwer" | ~14 s on 2 cores, ~17 s on 1 core |
| CPU, 3 puzzles 3x4 "leicht" | <0.1 s |
| PDF rendering (10 puzzles) | ~0.5 s, ~120 kB |
| Idle CPU | 0 % (no background work, no database) |

Generation runs in a worker thread, so the health check and other requests stay responsive
while a booklet is being built.
