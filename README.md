```markdown
# 🖥️ M3TAL GoDash (Visual Interface)

**DocSmith Status:** *Modernization Applied | Go-Native Migration: Phase 1 (Python Legacy Wrapper)*

GoDash serves as the **Visualization & Control Layer** for the M3TAL ecosystem. It provides the "Mission Control" interface required for monitoring container health, system metrics, and AI node stability.

---

## 🏗️ Architectural Role
As a core component of the M3TAL ecosystem, GoDash acts as the frontend client for the `m3tal-goback` service. 

*   **Communication Flow:** All state mutations and data retrieval occur strictly via API calls to the `m3tal-goback` service.
*   **Infrastructure Consistency:** GoDash adheres to M3TAL path standards, expecting mounted volumes at `/mnt` for log persistence and state tracking.
*   **Decoupling:** As part of the Go-native migration, this interface is being transitioned to support static asset serving, decoupling the presentation layer from the Python-based legacy logic.

---

## 📦 Deployment (Docker)

> [!IMPORTANT]
> GoDash is designed to operate within the unified M3TAL stack. Standalone deployment requires manual resolution of the `proxy` network and backend connectivity.

### 1. Configuration
Create a `.env` file to establish the handshake between the dashboard and the backend:

```ini
BACKEND_URL=http://m3tal-goback:8080
DASHBOARD_SECRET=your_shared_secret
STATE_DIR=/mnt/m3tal/state
DEBUG=false
```

### 2. Launch
```bash
# Build the container
docker build -t ghcr.io/jakej985-rgb/m3tal-godash:latest .

# Launch into the M3TAL mesh
docker run -d \
  --name m3tal-godash \
  --network proxy \
  -v /mnt/m3tal:/mnt/m3tal \
  -p 8080:8080 \
  --env-file .env \
  ghcr.io/jakej985-rgb/m3tal-godash:latest
```

---

## 🛠 Development
The current architecture utilizes a Flask-based wrapper. To contribute to the Go-native migration or update UI components:

```bash
# Environment Setup
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Launch Debug Mode
python server.py
```

*Note: For performance testing, ensure `BACKEND_URL` is pointed to a local instance of the `m3tal-goback` development build.*

---

## 🔗 Related Projects
This repository is part of the integrated M3TAL infrastructure. For a complete system deployment, refer to:

*   **[m3tal-goback](https://github.com/jakej985-rgb/m3tal-goback)**: The Go-native Backend API (The Ecosystem Brain).
*   **[m3tal-media-server](https://github.com/jakej985-rgb/m3tal-media-server)**: The primary Orchestrator/Core.

---
*DocSmith: M3TAL Documentation Architecture | Protocol v2.0*
```