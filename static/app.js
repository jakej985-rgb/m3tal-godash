/* app.js — M3TAL Dashboard v2 */

const socket = io();

// ── Clock ────────────────────────────────────────────────────────
function tick() {
    const el = document.getElementById('live-clock');
    if (!el) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    el.textContent = `${hh}:${mm}:${ss}`;
}
setInterval(tick, 1000);
tick();

// ── Resource Chart ───────────────────────────────────────────────
let chart = null;
let currentHours = 1; 
const MAX_POINTS = 60; // 1 point per minute = 1 hour
const cpuData  = Array(MAX_POINTS).fill(null);
const memData  = Array(MAX_POINTS).fill(null);
const timeLabels = Array(MAX_POINTS).fill('');

function setTimeframe(val) {
    console.log(`Setting timeframe to: ${val}`);
    
    // Update UI active state
    document.querySelectorAll('.time-selectors .panel-badge').forEach(b => {
        b.classList.remove('active');
        if (b.textContent.toLowerCase() === val.toLowerCase()) b.classList.add('active');
    });

    // In a real implementation, this would fetch from /api/metrics/history?hours=...
    // For now, we update the display and refresh the chart
    currentHours = parseInt(val) || 1;
    if (val.includes('d')) currentHours *= 24;
    
    refreshHistory();
}

async function refreshHistory() {
    try {
        const res = await fetch(`/api/metrics/history?hours=${currentHours}`);
        const data = await res.json();
        if (!data || !Array.isArray(data)) return;

        const now = Math.floor(Date.now() / 1000);
        const cutoff = now - (currentHours * 3600);
        
        // Filter and downsample if needed
        const filtered = data.filter(p => p.timestamp >= cutoff);
        
        // For larger timeframes, we take every Nth point to keep the graph smooth
        let step = 1;
        if (currentHours > 12) step = 10;
        else if (currentHours > 6) step = 5;

        const plotData = filtered.filter((_, i) => i % step === 0);

        chart.data.labels = plotData.map(p => {
            const d = new Date(p.timestamp * 1000);
            if (currentHours > 24) return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:00`;
            return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        });
        chart.data.datasets[0].data = plotData.map(p => p.cpu);
        chart.data.datasets[1].data = plotData.map(p => p.mem);
        chart.data.datasets[2].data = plotData.map(p => p.net_down || 0);
        chart.data.datasets[3].data = plotData.map(p => p.net_up || 0);
        
        chart.update('none');
    } catch (e) {
        console.error("Failed to refresh history:", e);
    }
}

function initChart() {
    const canvas = document.getElementById('resource-chart');
    if (!canvas) return;

    chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [
                {
                    label: 'CPU',
                    data: cpuData,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34,197,94,0.08)',
                    borderWidth: 1.5,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    yAxisID: 'y'
                },
                {
                    label: 'MEM',
                    data: memData,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168,85,247,0.08)',
                    borderWidth: 1.5,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    yAxisID: 'y'
                },
                {
                    label: 'DOWN',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    borderWidth: 1.5,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    yAxisID: 'y1'
                },
                {
                    label: 'UP',
                    data: [],
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245,158,11,0.08)',
                    borderWidth: 1.5,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    display: false,
                    grid: { display: false }
                },
                y: {
                    min: 0, max: 100,
                    grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                    ticks: {
                        color: '#4b5e75',
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                        callback: v => `${v}%`,
                        maxTicksLimit: 5,
                    },
                    border: { display: false }
                },
                y1: {
                    position: 'right',
                    grid: { display: false },
                    ticks: {
                        color: '#4b5e75',
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                        callback: v => `${v} MB/s`,
                        maxTicksLimit: 5,
                    },
                    border: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(13,17,23,0.9)',
                    borderColor: 'rgba(0,212,170,0.2)',
                    borderWidth: 1,
                    titleColor: '#94a3b8',
                    bodyColor: '#e2e8f0',
                    bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
                }
            }
        }
    });
}

function pushChartPoint(cpu, mem, netDownStr, netUpStr) {
    if (!chart) return;
    
    // Only push live updates to the chart if we are in the 1H (Real-time) view
    // Otherwise, it will cause the historical data to shift and eventually vanish
    if (currentHours > 1) return;
    
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    // Parse network strings (e.g. "1.2 MB/s" -> 1.2)
    const parseSpeed = (s) => {
        if (!s || typeof s !== 'string') return 0;
        const val = parseFloat(s.split(' ')[0]);
        return isNaN(val) ? 0 : val;
    };

    chart.data.labels.push(timeStr);
    chart.data.datasets[0].data.push(cpu);
    chart.data.datasets[1].data.push(mem);
    chart.data.datasets[2].data.push(parseSpeed(netDownStr));
    chart.data.datasets[3].data.push(parseSpeed(netUpStr));
    
    if (chart.data.labels.length > MAX_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets.forEach(ds => ds.data.shift());
    }
    
    chart.update('none');
}

// Global state for single-line metric synchronization
const liveStats = {
    cpu: 0,
    mem: 0,
    cpuTemp: '--',
    gpuLoad: 0,
    gpuTemp: '--',
    gpuMem: '--',
    gpuActive: false,
    netDown: '0.0',
    netUp: '0.0',
    netLoad: '0'
};

function updateCpuFull() {
    setText('stat-cpu-usage-val', `${liveStats.cpu.toFixed(1)}%`);
    setText('stat-cpu-temp-val-split', `${liveStats.cpuTemp}°C`);
    const total = liveStats.memTotal || 16.0;
    setText('stat-cpu-mem-label', `${total.toFixed(1)} GB RAM`);
    setText('stat-cpu-mem-val-split', `${liveStats.mem.toFixed(1)} GB`);
}

function updateGpuFull() {
    if (liveStats.gpuActive) {
        setText('stat-gpu-usage-val', `${liveStats.gpuLoad}%`);
        setText('stat-gpu-temp-val-split', `${liveStats.gpuTemp}°C`);
        const total = liveStats.gpuMemTotal || 1024;
        const totalStr = total >= 1024 ? `${(total/1024).toFixed(0)}GB` : `${total}MB`;
        setText('stat-gpu-mem-label', `${totalStr} VRAM`);
        setText('stat-gpu-mem-val-split', `${liveStats.gpuMem}MB`);
    } else {
        setText('stat-gpu-usage-val', 'OFF');
        setText('stat-gpu-temp-val-split', '--°C');
        setText('stat-gpu-mem-label', 'VRAM');
        setText('stat-gpu-mem-val-split', 'SB');
    }
}

function updateNetworkFull() {
    setText('stat-net-down-val', liveStats.netDown);
    setText('stat-net-up-val', liveStats.netUp);
    setText('stat-net-load-val', `${liveStats.netLoad}%`);
}

// ── Socket – real-time metrics ────────────────────────────────────
socket.on('metrics_update', (data) => {
    const sys = data.system || {};
    liveStats.cpu = sys.cpu || 0;
    liveStats.mem = sys.mem_gb || 0;
    liveStats.memTotal = sys.mem_total || 0;

    // Update the single-line display
    updateCpuFull();

    // Update Network display
    const net = data.network || {};
    liveStats.netDown = net.down != null ? net.down : '0.0';
    liveStats.netUp   = net.up   != null ? net.up   : '0.0';
    liveStats.netLoad = net.load != null ? Math.round(net.load) : '0';
    updateNetworkFull();

    // Legacy stat cards (if still in HTML)
    setText('stat-cpu', `${liveStats.cpu.toFixed(1)}%`);
    setText('stat-mem', `${liveStats.mem.toFixed(1)} GB`);

    // Push to chart
    pushChartPoint(liveStats.cpu, sys.mem || 0, liveStats.netDown, liveStats.netUp);
});

// ── Helpers ───────────────────────────────────────────────────────
function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function getStatusClass(status) {
    const s = (status || '').toLowerCase();
    if (s === 'running' || s === 'online') return 'running';
    if (s === 'restarting') return 'restarting';
    if (s === 'offline' || s === 'exited') return 'offline';
    if (s === 'missing') return 'missing';
    return 'unknown';
}

function getCpuClass(cpu) {
    if (cpu >= 80) return 'cpu-crit';
    if (cpu >= 50) return 'cpu-high';
    return '';
}

function renderBar(percent) {
    const total = 10;
    const filled = Math.round((Math.min(percent, 100) / 100) * total);
    const bar = "█".repeat(filled) + "░".repeat(total - filled);
    
    let color = "#22c55e"; // Green
    if (percent >= 80) color = "#ef4444"; // Red
    else if (percent >= 50) color = "#f59e0b"; // Yellow
    
    return `<span style="color: ${color}; font-family: 'JetBrains Mono', monospace; letter-spacing: -1px;">${bar}</span>`;
}

// ── UI Interactions ───────────────────────────────────────────────
function togglePanel(header) {
    const panel = header.parentElement;
    panel.classList.toggle('collapsed');
}

function toggleRow(rowId) {
    const detailsRow = document.getElementById(rowId);
    if (!detailsRow) return;
    
    const isVisible = detailsRow.style.display !== 'none';
    
    // Hide all other details rows first (optional, for accordion effect)
    // document.querySelectorAll('.details-row').forEach(r => r.style.display = 'none');
    
    detailsRow.style.display = isVisible ? 'none' : 'table-row';
}

// ── Health score ──────────────────────────────────────────────────
async function refreshHealth() {
    try {
        const res  = await fetch('/api/health/report');
        const data = await res.json();
        const score = data.score || 0;
        const verdict = data.verdict || 'Healthy';

        // Main Score
        const scoreEl = document.getElementById('health-score');
        if (scoreEl) scoreEl.textContent = score;
        
        // Mini Card Score (Standardized ID)
        const healthVal = document.getElementById('stat-ai-health-val');
        if (healthVal) {
            healthVal.textContent = `${score}%`;
        }
        
        const ring = document.getElementById('health-ring');
        if (ring) {
            const offset = 220 - (220 * score / 100);
            ring.style.strokeDashoffset = offset;
        }

        // Mini Card Score
        setText('stat-ai-health-val', `${score}%`);
        
        const ringMini = document.getElementById('gsi-ring-mini');
        if (ringMini) {
            const offset = 220 - (220 * score / 100);
            ringMini.style.strokeDashoffset = offset;
        }

        const verdictEl = document.getElementById('system-verdict');
        if (verdictEl) {
            const agents = data.agent_health || {};
            const total = Object.keys(agents).length;
            const online = Object.values(agents).filter(a => {
                const s = (a.status || '').toLowerCase();
                return s === 'healthy' || s === 'ok' || s === 'online' || s === 'up' || s === 'running';
            }).length;
            
            verdictEl.textContent = `${online} / ${total}`;
            
            let statusClass = 'offline';
            if (online === total && total > 0 && score >= 90) statusClass = 'running';
            else if (online > 0 && score >= 60) statusClass = 'restarting';
            
            verdictEl.className = `badge ${statusClass}`;
        }
    } catch (_) {}
}

// ── Hardware Metrics ──────────────────────────────────────────────
async function refreshHardware() {
    try {
        const [tRes, sRes, gRes] = await Promise.all([
            fetch('/api/metrics/temperature'),
            fetch('/api/metrics/storage'),
            fetch('/api/metrics/gpu')
        ]);
        const tData = await tRes.json();
        const sData = await sRes.json();
        const gData = await gRes.json();

        // Update GPU Card (Single Line)
        liveStats.gpuActive = gData.active;
        if (gData.active) {
            liveStats.gpuLoad = gData.load !== undefined ? gData.load : 0;
            liveStats.gpuTemp = gData.temp != null ? Math.round(gData.temp) : '--';
            liveStats.gpuMem  = gData.mem_used != null ? gData.mem_used : '--';
            liveStats.gpuMemTotal = gData.mem_total != null ? gData.mem_total : 1024;
        }
        updateGpuFull();

        const gpuIcon = document.getElementById('stat-gpu-card')?.querySelector('.stat-icon');
        if (gpuIcon) {
            if (gData.load >= 80 || gData.temp >= 80) {
                gpuIcon.style.background = 'rgba(239, 68, 68, 0.15)'; gpuIcon.style.color = '#ef4444';
            } else if (gData.load >= 50 || gData.temp >= 70) {
                gpuIcon.style.background = 'rgba(245, 158, 11, 0.15)'; gpuIcon.style.color = '#f59e0b';
            } else {
                gpuIcon.style.background = 'rgba(249, 115, 22, 0.15)'; gpuIcon.style.color = '#f97316';
            }
        }

        // Update Temperature Card & CPU Split
        liveStats.cpuTemp = tData.cpu_temp != null ? Math.round(tData.cpu_temp) : '--';
        liveStats.gpuTemp = tData.gpu_temp != null ? Math.round(tData.gpu_temp) : '--';
        updateCpuFull();

        const cpuTempEl = document.getElementById('stat-cpu-temp-val');
        const gpuTempEl = document.getElementById('stat-gpu-temp-val');
        
        if (cpuTempEl && gpuTempEl) {
            cpuTempEl.textContent = `${liveStats.cpuTemp}°C`;
            gpuTempEl.textContent = `${liveStats.gpuTemp}°C`;
            
            const maxTemp = Math.max(tData.cpu_temp || 0, tData.gpu_temp || 0);
            const tempIcon = cpuTempEl.closest('.stat-card').querySelector('.stat-icon');
            if (maxTemp >= 85) {
                tempIcon.style.background = 'rgba(239, 68, 68, 0.15)'; tempIcon.style.color = '#ef4444';
            } else if (maxTemp >= 75) {
                tempIcon.style.background = 'rgba(245, 158, 11, 0.15)'; tempIcon.style.color = '#f59e0b';
            } else {
                tempIcon.style.background = 'rgba(34, 197, 94, 0.15)'; tempIcon.style.color = '#22c55e';
            }
        }

        // Update Storage Card
        const storageGrid = document.getElementById('stat-storage-grid');
        if (storageGrid && sData.disks) {
            let maxUsage = 0;
            let gridHtml = '';
            const driveKeys = Object.keys(sData.disks).sort(); 
            
            if (driveKeys.length === 0) {
                gridHtml = '<div class="stat-sub">No drives detected</div>';
            } else {
                let rows = { names: '', space: '', temp: '' };
                
                driveKeys.forEach(key => {
                    const disk = sData.disks[key];
                    if (disk.percent > maxUsage) maxUsage = disk.percent;
                    
                    const free = disk.free != null ? `${disk.free}G` : '--';
                    const temp = disk.temp != null ? `${Math.round(disk.temp)}°C` : '--';
                    
                    rows.names += `<div>${key}</div>`;
                    rows.space += `<div>${free}</div>`;
                    rows.temp  += `<div>${temp}</div>`;
                });

                gridHtml = `
                    <div class="storage-table">
                        <div class="row names">${rows.names}</div>
                        <div class="row space">${rows.space}</div>
                        <div class="row temp">${rows.temp}</div>
                    </div>
                `;
            }
            
            storageGrid.innerHTML = gridHtml;
            
            const storageIcon = document.getElementById('stat-storage-card').querySelector('.stat-icon');
            if (maxUsage >= 95) {
                storageIcon.style.background = 'rgba(239, 68, 68, 0.15)'; storageIcon.style.color = '#ef4444';
            } else if (maxUsage >= 85) {
                storageIcon.style.background = 'rgba(245, 158, 11, 0.15)'; storageIcon.style.color = '#f59e0b';
            } else {
                storageIcon.style.background = 'rgba(14, 165, 233, 0.15)'; storageIcon.style.color = '#0ea5e9';
            }
        }
    } catch (_) {}
}

// ── Network Links (Traefik Discovery) ──────────────────────────────
async function refreshLinks() {
    try {
        const res = await fetch('/api/network/routes');
        const routes = await res.json();
        const grid = document.getElementById('dynamic-links-grid');
        if (!grid) return;

        if (routes.length === 0) {
            grid.innerHTML = '<div class="stat-sub">No web routes discovered</div>';
            return;
        }

        grid.innerHTML = routes.map(r => `
            <a href="${r.url}" class="big-btn" target="_blank">
                <span style="font-size: 1.2rem;">🌐</span>
                ${r.name}
            </a>
        `).join('');
    } catch (_) {}
}

// ── Container table ───────────────────────────────────────────────
async function refreshFleet() {
    try {
        const [hRes, rRes, tRes, sRes] = await Promise.all([
            fetch('/api/health'),
            fetch('/api/health/report'),
            fetch('/api/metrics/temperature'),
            fetch('/api/metrics/storage')
        ]);
        const hData = await hRes.json();
        const rData = await rRes.json();
        const tData = await tRes.json();
        const sData = await sRes.json();

        // Go backend writes containers as a flat array in health.json
        const containers = hData.containers || [];
        const online = containers.filter(c => (c.state || '').toLowerCase() === 'running').length;
        const total = containers.length;
        setText('stat-fleet-count', `${online} / ${total} UP`);

        // Uptime from health report
        const uptimeSubEl = document.getElementById('stat-fleet-uptime');
        if (uptimeSubEl && rData.uptime) uptimeSubEl.textContent = rData.uptime;

        // Table body
        const tbody = document.getElementById('fleet-tbody');
        if (!tbody) return;

        if (containers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading-text">Waiting for agent data…</td></tr>';
            return;
        }

        // Sort: running first
        const order = { running: 0, created: 1, restarting: 2, paused: 3, exited: 4, dead: 5 };
        containers.sort((a, b) => (order[(a.state||'').toLowerCase()] ?? 6) - (order[(b.state||'').toLowerCase()] ?? 6));

        let html = '';
        containers.forEach(c => {
            const name   = c.name || 'unknown';
            const state  = c.state || 'unknown';
            const status = c.status || state;
            const sc     = getStatusClass(state);
            const cpu    = c.cpu != null ? c.cpu.toFixed(1) + '%' : '—';
            const mem    = c.mem != null ? c.mem.toFixed(1) + '%' : '—';
            const cpuClass = c.cpu != null ? getCpuClass(c.cpu) : '';

            // Sub-metrics for details
            const cpuTemp = tData.cpu_temp != null ? Math.round(tData.cpu_temp) : '--';
            const gpuTemp = tData.gpu_temp != null ? Math.round(tData.gpu_temp) : '--';

            const rowId = `details-${name.replace(/[^a-z0-9]/gi, '-')}`;

            html += `
                <tr class="container-row" onclick="toggleRow('${rowId}')">
                    <td><span class="container-name">${name}</span></td>
                    <td><span class="badge ${sc}">${state.toUpperCase()}</span></td>
                    <td class="metric-cell ${cpuClass}">${cpu}</td>
                    <td class="metric-cell">${mem}</td>
                    <td class="metric-cell">${status}</td>
                    <td>
                        <div class="actions-cell">
                            <button class="action-btn logs" title="Logs" onclick="event.stopPropagation(); doAction('logs','${name}')">≡</button>
                        </div>
                    </td>
                </tr>
                <tr id="${rowId}" class="details-row" style="display: none;">
                    <td colspan="6">
                        <div class="details-box">
                            <div class="details-metrics">
                                <div style="margin-bottom: 0.5rem; opacity: 0.8; font-size: 0.75rem;">CONTAINER DETAILS</div>
                                <div><strong>STATE:</strong> ${state}</div>
                                <div><strong>STATUS:</strong> ${status}</div>
                                <div><strong>MANAGED:</strong> ${c.managed ? 'Yes' : 'No'}</div>
                                <div style="margin-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.5rem;">
                                    <strong>HOST TEMP:</strong> ${cpuTemp}°C / ${gpuTemp}°C
                                </div>
                            </div>
                            <div class="details-actions">
                                <button class="big-btn heal action-btn" onclick="event.stopPropagation(); doAction('restart','${name}')">↺ Restart</button>
                                <button class="big-btn reboot action-btn" onclick="event.stopPropagation(); doAction('stop','${name}')">■ Stop</button>
                                <button class="big-btn scan action-btn" onclick="event.stopPropagation(); doAction('logs','${name}')">≡ Logs</button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (_) {}
}

// ── Activity feed ─────────────────────────────────────────────────
async function refreshActivity() {
    try {
        const [aRes, hRes] = await Promise.all([
            fetch('/api/anomalies'),
            fetch('/api/health/report')
        ]);
        const aData = await aRes.json();
        const hData = await hRes.json();

        const feed = document.getElementById('activity-feed');
        if (!feed) return;

        const issues = [
            ...(aData.issues || []).map(i => ({
                title: i.target || 'Container',
                sub:   i.reason || i.message || '',
                type:  (i.type === 'critical') ? 'warn' : 'warn',
                time:  formatTime()
            })),
            ...(hData.issues || []).map(msg => ({
                title: 'System',
                sub:   msg,
                type:  'warn',
                time:  formatTime()
            }))
        ];

        const now = formatTime();

        const pinned = [{
            title: issues.length === 0 ? 'All systems operational' : `${issues.length} issue(s) detected`,
            sub:   issues.length === 0 ? 'No issues detected'       : 'Review anomalies below',
            type:  issues.length === 0 ? 'ok' : 'warn',
            time:  now
        }];

        const all = [...pinned, ...issues].slice(0, 8);

        const iconMap = { ok: '✓', warn: '⚠', info: 'ℹ' };

        feed.innerHTML = all.map(item => `
            <div class="activity-item">
                <div class="activity-icon ${item.type}">${iconMap[item.type] || 'ℹ'}</div>
                <div class="activity-text">
                    <div class="activity-title">${item.title}</div>
                    ${item.sub ? `<div class="activity-sub">${item.sub}</div>` : ''}
                </div>
                <div class="activity-time">${item.time}</div>
            </div>
        `).join('');
    } catch (_) {}
}


function formatTime() {
    const n = new Date();
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

// ── Actions (wired to /api/action) ───────────────────────────
async function doAction(action, container) {
    console.log(`Action: ${action} on ${container}`);
    const btn = event.currentTarget;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '⏳';
    btn.disabled = true;

    try {
        const res = await fetch('/api/action', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ action, container })
        });
        const data = await res.json();
        
        if (data.ok) {
            if (action === 'logs' && data.logs) {
                // Show logs in an alert or custom overlay
                alert(`Logs for ${container}:\n\n${data.logs.substring(0, 1000)}${data.logs.length > 1000 ? '...' : ''}`);
            } else {
                btn.style.background = 'var(--green-dim)';
                btn.style.color = 'var(--green)';
                setTimeout(() => {
                    btn.style.background = '';
                    btn.style.color = '';
                }, 2000);
            }
        } else {
            alert(`Error: ${data.error || 'Failed'}`);
            btn.style.background = 'var(--red-dim)';
            btn.style.color = 'var(--red)';
        }
    } catch (e) {
        alert(`Request failed: ${e.message}`);
    } finally {
        setTimeout(() => {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }, action === 'logs' ? 0 : 2000);
    }
}

async function doGlobalAction(action) {
    console.log(`Global action: ${action}`);
    
    // Add confirmation for reboot
    if (action === 'reboot' && !confirm('Are you sure you want to reboot the entire host system?')) {
        return;
    }

    const btn = event.currentTarget;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '⏳ Processing...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/action', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ action })
        });
        const data = await res.json();
        
        if (data.ok) {
            if (action === 'status') {
                 alert(`Status:\nScore: ${data.score}%\nVerdict: ${data.verdict}\nSystem: ${data.system}`);
            } else {
                 btn.innerHTML = `✅ ${data.message || 'Success'}`;
            }
        } else {
            alert(`Error: ${data.error || 'Failed'}`);
            btn.innerHTML = '❌ Error';
        }
    } catch (e) {
        alert(`Request failed: ${e.message}`);
        btn.innerHTML = '❌ Failed';
    } finally {
        setTimeout(() => {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }, 3000);
    }
}

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Telegram Web App Initialization
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
    }

    initChart();
    refreshHealth();
    refreshHardware();
    refreshFleet();
    refreshActivity();
    refreshLinks();

    setInterval(refreshHealth,   5000);
    setInterval(refreshHardware, 10000);
    setInterval(refreshFleet,    8000);
    setInterval(refreshActivity, 12000);
    setInterval(refreshLinks,    60000); // Check for new routes every minute
});

async function refreshLinks() {
    const container = document.getElementById('dynamic-links-grid');
    if (!container) return;

    try {
        const res = await fetch('/api/network/routes');
        const links = await res.json();

        if (!links || links.length === 0) {
            container.innerHTML = '<div class="loading-text">No web routes discovered</div>';
            return;
        }

        container.innerHTML = links.map(link => `
            <a href="${link.url}" target="_blank" class="network-link">
                <div class="link-info">
                    <span class="link-name">${link.name}</span>
                </div>
                <div class="link-icon-container">
                    <img src="${link.icon}" alt="${link.name}" class="link-icon" onerror="this.style.opacity='0.5';">
                </div>
                <div class="link-status ${link.status === 'enabled' ? 'up' : 'down'}"></div>
            </a>
        `).join('');
    } catch (e) {
        console.error("Failed to refresh links:", e);
    }
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
