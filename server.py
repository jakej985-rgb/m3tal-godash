import os
try:
    import eventlet
    eventlet.monkey_patch()
except ImportError:
    pass

import json
import secrets
import threading
import hmac
import time
from flask import Flask, render_template, jsonify, request, session, redirect, url_for
from flask_socketio import SocketIO, emit, join_room
from functools import wraps
import requests
import sys
import logging
from auth import load_users, resolve_users_path, verify_password
from pathlib import Path

# M3TAL Dashboard (v2.1 Hardened)
# Responsibility: Visual interface. NO system logic allowed.

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger("m3tal-godash")

# Configuration
GO_API_URL = os.getenv("GO_API_URL", "http://localhost:5050")
GO_API_TOKEN = os.getenv("GO_API_TOKEN")
DASHBOARD_SECRET = os.getenv("DASHBOARD_SECRET") or secrets.token_hex(32)
USERS_JSON = os.fspath(resolve_users_path(Path(__file__).resolve().parent))
ASYNC_MODE = "eventlet" if eventlet is not None else "threading"
AUTHENTICATED_ROOM = "authenticated-clients"

app = Flask(__name__)
app.config['SECRET_KEY'] = DASHBOARD_SECRET
socketio = SocketIO(app, async_mode=ASYNC_MODE, cors_allowed_origins="*")

# --- Helpers ---

def login_required(role=None):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'username' not in session:
                return redirect(url_for('login', next=request.url))
            if role and session.get('role') != role and session.get('role') != 'admin':
                return jsonify({"error": "Unauthorized"}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def fetch_api(endpoint, retries=3):
    """Hardened proxy helper with retry logic."""
    for attempt in range(retries):
        try:
            headers = {}
            if GO_API_TOKEN:
                headers["X-API-Token"] = GO_API_TOKEN
                
            resp = requests.get(f"{GO_API_URL}{endpoint}", headers=headers, timeout=3)
            if resp.status_code == 200:
                return resp.json()
            logger.warning(f"API Attempt {attempt+1} failed: HTTP {resp.status_code}")
        except Exception as e:
            logger.warning(f"API Attempt {attempt+1} failed: {e}")
        
        if attempt < retries - 1:
            time.sleep(0.5)
            
    return {"error": "API Unavailable after multiple retries"}

# --- Routes ---

@app.route('/')
@login_required()
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if 'csrf_token' not in session:
        session['csrf_token'] = secrets.token_hex(16)

    if request.method == 'POST':
        form_token = request.form.get('csrf_token')
        session_token = session.get('csrf_token')
        
        if not form_token or not session_token or not hmac.compare_digest(form_token, session_token):
            return render_template('login.html', error="Security violation", csrf_token=session['csrf_token']), 403

        username = request.form.get('username')
        password = request.form.get('password')
        
        users = load_users(users_path=USERS_JSON)
        user = next((u for u in users if u['username'] == username), None)
        
        if user and password and verify_password(password, user['token_hash']):
            session['username'] = username
            session['role'] = user.get('role', 'viewer')
            session['csrf_token'] = secrets.token_hex(16)
            return redirect(url_for('index'))
            
        return render_template('login.html', error="Invalid credentials", csrf_token=session['csrf_token'])
    
    return render_template('login.html', csrf_token=session['csrf_token'])

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# --- Dashboard Views ---

@app.route('/fleet')
@login_required()
def fleet():
    return render_template('fleet.html')

@app.route('/intelligence')
@login_required()
def intelligence():
    return render_template('intelligence.html')

@app.route('/logs')
@login_required()
def logs_view():
    return render_template('logs.html')

# --- API Proxies (Enforcing PLAN.md) ---

@app.route('/api/health')
@login_required()
def get_health():
    return jsonify(fetch_api("/api/health"))

@app.route('/api/metrics')
@login_required()
def get_metrics():
    return jsonify(fetch_api("/api/metrics"))

@app.route('/api/registry')
@login_required()
def get_registry():
    return jsonify(fetch_api("/api/registry"))

@app.route('/api/storage')
@login_required()
def get_storage():
    return jsonify(fetch_api("/api/storage"))

@app.route('/api/gpu')
@login_required()
def get_gpu():
    return jsonify(fetch_api("/api/gpu"))

@app.route('/api/logs')
@login_required()
def get_logs():
    return jsonify(fetch_api("/api/logs"))

@app.route('/api/action', methods=['POST'])
@login_required()
def api_action():
    data = request.get_json(silent=True) or {}
    action = (data.get('action') or '').strip().lower()
    container = (data.get('container') or '').strip()

    if not action or not container:
        return jsonify({"ok": False, "error": "Missing action or container"}), 400

    try:
        # Action requests have longer timeouts
        headers = {}
        if GO_API_TOKEN:
            headers["X-API-Token"] = GO_API_TOKEN
            
        resp = requests.post(f"{GO_API_URL}/api/containers/{action}", json={"name": container}, headers=headers, timeout=15)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        logger.error(f"Action failed: {e}")
        return jsonify({"ok": False, "error": f"API Connection Failure: {e}"}), 500

# --- Websocket Stream ---

@socketio.on('connect')
def handle_connect():
    if 'username' not in session:
        return False
    join_room(AUTHENTICATED_ROOM)
    start_background_tasks()

def background_metrics_stream():
    """Push real-time metric updates from Go API to clients."""
    while True:
        socketio.sleep(2)
        try:
            metrics = fetch_api("/api/metrics", retries=1) # Fast fail for real-time
            if "error" not in metrics:
                socketio.emit('metrics_update', {"system": metrics}, to=AUTHENTICATED_ROOM)
        except Exception as e:
            logger.error(f"Stream error: {e}")

def start_background_tasks():
    global background_thread
    with _bg_lock:
        if background_thread is None:
            background_thread = socketio.start_background_task(background_metrics_stream)

background_thread = None
_bg_lock = threading.Lock()

if __name__ == '__main__':
    host = os.getenv("DASHBOARD_HOST", "0.0.0.0")
    port = int(os.getenv("DASHBOARD_PORT", 8082))
    logger.info(f"🚀 M3TAL Dashboard starting on {host}:{port}")
    socketio.run(app, host=host, port=port)
