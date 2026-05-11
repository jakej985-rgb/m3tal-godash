# 🖥️ M3TAL GoDash (Visual Interface)

This repository contains the **Dashboard and Visualization Layer** for the M3TAL platform. It provides a real-time "Mission Control" interface for monitoring container health, system metrics, and AI stability.

## 📦 Deployment (Standalone)

> [!IMPORTANT]
> GoDash is typically deployed as part of the unified M3TAL stack via `m3tal.py up`. Use these instructions only for standalone development or debugging.

### 1. Prerequisites
- **Python**: v3.10+
- **Docker**: For containerized deployment
- **M3TAL Backend**: Requires a running instance of `m3tal-goback` API

### 2. Configuration (`.env`)
GoDash requires the following environment variables:

```ini
BACKEND_URL=http://m3tal-goback:8080
DASHBOARD_SECRET=your_shared_secret
STATE_DIR=./state
DEBUG=false
```

### 3. Docker Launch
```bash
docker build -t ghcr.io/jakej985-rgb/m3tal-godash:latest .
docker run -d \
  --name m3tal-godash \
  --network proxy \
  -p 8080:8080 \
  -e BACKEND_URL=http://m3tal-goback:8080 \
  ghcr.io/jakej985-rgb/m3tal-godash:latest
```

## 🧱 Architecture
GoDash is a lightweight Flask-based web application that consumes the M3TAL Backend API. It handles:
- **Metric Visualization**: High-density instrument cards for CPU/GPU/Network.
- **Service Management**: Start/Stop/Restart actions via the API.
- **Log Streaming**: Real-time access to system and agent logs.

## 🛠 Development
```bash
# Setup environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run in debug mode
python server.py
```