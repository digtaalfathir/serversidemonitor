# Hardware Monitoring System v2.0.0

Real-time server-side hardware device monitoring system with WebSocket-based dashboard.

## Quick Start

```bash
# Install dependencies
npm install

# Run directly
npm start

# Or with PM2
pm2 start ecosystem.config.js
```

Dashboard: `http://localhost:3000`

---

## Project Structure

```
ServerSideMonitoring
├── src
│   ├── monitor
│   │   ├── monitor.js          # Core monitoring engine
│   │   ├── deviceManager.js    # Device CRUD operations
│   │   ├── historyManager.js   # 24h event history
│   │   ├── statsManager.js     # Daily stats, latency, snapshots
│   │   └── networkManager.js   # Runtime network state
│   │
│   ├── websocket
│   │   └── websocketServer.js  # WebSocket server (path-based)
│   │
│   ├── routes
│   │   └── api.js              # REST API endpoints
│   │
│   ├── utils
│   │   ├── logger.js           # Daily rotating log files
│   │   ├── time.js             # Timezone-aware date helpers
│   │   └── fileStore.js        # JSON file I/O utility
│   │
│   └── app.js                  # Main entry point
│
├── public
│   ├── dashboard.html          # Frontend dashboard
│   ├── css/dashboard.css       # Styles
│   ├── js/dashboard.js         # Client-side logic
│   └── assets/                 # Static assets
│
├── data
│   ├── devices.json            # Device definitions
│   ├── history.json            # Event history (auto-managed)
│   ├── daily_stats.json        # Daily uptime stats (auto-managed)
│   ├── network_stats.json      # Network statistics
│   └── status_snapshot.json    # State snapshot (auto-managed)
│
├── logs/                       # Daily log files
├── config.json                 # Application configuration
├── ecosystem.config.js         # PM2 configuration
├── package.json
└── README.md
```

---

## API Endpoints

| Method | Path           | Description                      |
|--------|----------------|----------------------------------|
| GET    | `/`            | Dashboard (serves dashboard.html)|
| GET    | `/health`      | Server health check              |
| GET    | `/api/status`  | Full device status with metrics  |
| GET    | `/api/devices` | Device list with metadata        |
| GET    | `/api/summary` | Health score summary             |
| WS     | `/ws`          | WebSocket real-time updates      |

### Examples

```bash
# Health check
curl http://localhost:3000/health

# Health score summary
curl http://localhost:3000/api/summary

# All device status
curl http://localhost:3000/api/status
```

---

## Configuration (config.json)

```json
{
  "webPort": 3000,
  "wsPath": "/ws",
  "monitorInterval": 3000,
  "timezone": "Asia/Jakarta",
  "logDir": "logs",
  "dataDir": "data",
  "publicDir": "public",
  "latencyWindowSize": 20,
  "historyMaxAgeMs": 86400000,
  "pingTimeout": 1
}
```

---

## PM2 Deployment

```bash
# Start
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs hardware-monitoring

# Restart
pm2 restart hardware-monitoring

# Auto-start on boot
pm2 startup
pm2 save
```

---

## Nginx Reverse Proxy Configuration

Target: `https://monitoring.sugity.stechoq-j.com`

```nginx
server {
    listen 80;
    server_name monitoring.sugity.stechoq-j.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name monitoring.sugity.stechoq-j.com;

    ssl_certificate     /etc/letsencrypt/live/monitoring.sugity.stechoq-j.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitoring.sugity.stechoq-j.com/privkey.pem;

    # HTTP requests -> Express
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket upgrade -> Express /ws
    location /ws {
        proxy_pass http://127.0.0.1:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

### Deploy steps:

```bash
# 1. Copy nginx config
sudo cp nginx.conf /etc/nginx/sites-available/monitoring
sudo ln -s /etc/nginx/sites-available/monitoring /etc/nginx/sites-enabled/

# 2. Test and reload
sudo nginx -t
sudo systemctl reload nginx

# 3. SSL certificate (if using certbot)
sudo certbot --nginx -d monitoring.sugity.stechoq-j.com
```

---

## Architecture

```
Internet
   ↓
Nginx (443/SSL)
   ↓
localhost:3000
   ↓
Express Server
   ├── Static Files (public/)
   ├── REST API (/api/*)
   ├── Health Check (/health)
   └── WebSocket (/ws)
         ↓
   Monitoring Engine
         ↓
   Ping (172.x.x.x / 10.x.x.x / 192.168.x.x)
```

The monitoring engine runs on the customer's local server, giving it direct access to local device IPs. External users connect through the Nginx reverse proxy and see real-time data without needing network access to the devices.

---

## License

ISC
