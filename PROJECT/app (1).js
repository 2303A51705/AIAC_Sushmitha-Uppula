/**
 * Smart Traffic Multi-Agent AI System
 * app.js — Deterministic Confidence-Based Arbitration
 *
 * Core Formulas (MANDATORY, same in frontend & backend):
 *   confidence = 0.5×urgency + 0.3×(speed/100) + 0.2×type_weight
 *   priority   = confidence × urgency
 *   decision   = argmax(priority)
 *
 * Fully works without backend (fallback).
 */

'use strict';

// ── CONFIG ────────────────────────────────────────────────────────────────────

// Set this to your deployed Render/Railway URL (no trailing slash):
const API_URL = "https://YOUR_DEPLOYED_BACKEND_URL";

// Type weights (must match backend)
const TYPE_WEIGHTS = { Ambulance: 1.0, Bus: 0.7, Car: 0.5, Bike: 0.4 };
const TYPE_EMOJI   = { Ambulance: '🚑', Bus: '🚌', Car: '🚗', Bike: '🏍' };
const TYPE_COLOR   = { Ambulance: '#ff3a5c', Bus: '#ffb800', Car: '#00e5ff', Bike: '#00ff88' };

// ── STATE ─────────────────────────────────────────────────────────────────────

const State = {
  agents: [],        // raw agents (id, type, speed, urgency)
  ranked: [],        // after computation: agents with confidence, priority, rank
  simCount: 0,
  selectedId: null,
  apiOnline: null,   // true | false | null
  nextId: 1,
};

// ── CORE LOGIC (DETERMINISTIC) ────────────────────────────────────────────────

/**
 * Compute confidence for a single agent.
 * DETERMINISTIC — same input always gives same output.
 */
function computeConfidence(agent) {
  const w = TYPE_WEIGHTS[agent.type] ?? 0.5;
  return 0.5 * agent.urgency + 0.3 * (agent.speed / 100) + 0.2 * w;
}

/**
 * Compute priority for a single agent (requires confidence first).
 */
function computePriority(confidence, urgency) {
  return confidence * urgency;
}

/**
 * Run the full arbitration pipeline on an array of agents.
 * Returns: { selected, ranking }
 *   selected: { id, type, speed, urgency, confidence, priority }
 *   ranking: [ ...same shape, rank ]
 */
function runArbitration(agents) {
  if (!agents || agents.length === 0) throw new Error('No agents provided');

  const scored = agents.map(a => {
    const confidence = parseFloat(computeConfidence(a).toFixed(4));
    const priority   = parseFloat(computePriority(confidence, a.urgency).toFixed(4));
    return { ...a, confidence, priority };
  });

  // Sort descending by priority; tie-break by confidence, then by urgency
  const ranked = [...scored].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.urgency - a.urgency;
  });

  ranked.forEach((a, i) => { a.rank = i + 1; });

  return { selected: ranked[0], ranking: ranked };
}

// ── API LAYER ─────────────────────────────────────────────────────────────────

async function pingApi() {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${API_URL}/health`, { signal: ctrl.signal });
    clearTimeout(tid);
    return res.ok;
  } catch { return false; }
}

/**
 * Call backend POST /decision.
 * Falls back to local computation if API is unavailable.
 */
async function callDecision(agents) {
  // Try backend first
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${API_URL}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agents),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    setApiStatus(true);
    log(`Backend computed decision (server-side)`, 'ok');
    return { data, fromBackend: true };
  } catch (err) {
    // Fallback to frontend computation
    setApiStatus(false);
    log(`API unavailable (${err.message}) — using frontend fallback`, 'inf');
    const data = runArbitration(agents);
    return { data, fromBackend: false };
  }
}

// ── UI UTILITIES ──────────────────────────────────────────────────────────────

function setLoading(on) {
  document.getElementById('loadingOverlay').classList.toggle('show', on);
}

function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

function log(msg, type = 'inf') {
  const box = document.getElementById('logBox');
  const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const div = document.createElement('div');
  div.className = 'log-line';
  div.innerHTML = `<span class="log-ts">[${ts}]</span><span class="log-${type}">${msg}</span>`;
  box.prepend(div);
  while (box.children.length > 60) box.removeChild(box.lastChild);
}

function setApiStatus(online) {
  State.apiOnline = online;
  const dot  = document.getElementById('apiDot');
  const lbl  = document.getElementById('apiLabel');
  const mode = document.getElementById('stMode');
  if (online === true) {
    dot.className  = 'api-dot online';
    lbl.textContent = 'BACKEND ONLINE';
    mode.textContent = 'BACKEND';
  } else if (online === false) {
    dot.className  = 'api-dot offline';
    lbl.textContent = 'FALLBACK MODE';
    mode.textContent = 'FRONTEND';
  } else {
    dot.className  = 'api-dot';
    lbl.textContent = 'CHECKING API…';
  }
}

// ── RENDERING ─────────────────────────────────────────────────────────────────

function renderTable() {
  const tbody = document.getElementById('agentTbody');
  const hint  = document.getElementById('tblHint');

  if (State.agents.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10"><div class="empty-st"><div style="font-size:2rem">🚦</div>No agents yet — add agents or use auto-generate</div></td></tr>`;
    hint.textContent = 'Add agents, then click RUN SIMULATION.';
    document.getElementById('stAgents').textContent = '0';
    return;
  }

  // Use ranked list if available, else raw agents
  const list = State.ranked.length ? State.ranked : State.agents.map(a => ({ ...a, confidence: null, priority: null, rank: null }));

  const maxConf = list.reduce((m, a) => Math.max(m, a.confidence ?? 0), 0) || 1;
  const maxPri  = list.reduce((m, a) => Math.max(m, a.priority  ?? 0), 0) || 1;

  tbody.innerHTML = list.map(a => {
    const isWinner = a.id === State.selectedId;
    const rankBadge = a.rank
      ? `<span class="rank-badge ${a.rank <= 3 ? 'r' + a.rank : ''}">${a.rank}</span>`
      : `<span class="rank-badge">—</span>`;

    const typeClass = `type-${a.type}`;
    const confStr  = a.confidence != null ? a.confidence.toFixed(4) : '—';
    const priStr   = a.priority   != null ? a.priority.toFixed(4)   : '—';
    const confPct  = a.confidence != null ? (a.confidence / maxConf * 100).toFixed(1) : 0;
    const priPct   = a.priority   != null ? (a.priority   / maxPri  * 100).toFixed(1) : 0;

    let signal;
    if (!State.selectedId) signal = `<span class="signal-queue">PENDING</span>`;
    else if (isWinner)     signal = `<span class="signal-grant">✅ GREEN LIGHT</span>`;
    else if (a.rank === 2) signal = `<span class="signal-queue">🟡 NEXT</span>`;
    else                   signal = `<span class="signal-wait">🔴 WAITING</span>`;

    return `
    <tr class="${isWinner ? 'winner' : ''}" id="row-${a.id}">
      <td>${rankBadge}</td>
      <td><code>${a.id}</code></td>
      <td><span class="type-pill ${typeClass}">${TYPE_EMOJI[a.type] || ''} ${a.type}</span></td>
      <td>${a.speed}</td>
      <td>${a.urgency}</td>
      <td>${TYPE_WEIGHTS[a.type] ?? '?'}</td>
      <td>
        <div class="bar-cell">
          <span class="conf-val">${confStr}</span>
          <div class="mini-bar"><div class="mini-fill fill-conf" style="width:${confPct}%"></div></div>
        </div>
      </td>
      <td>
        <div class="bar-cell">
          <span class="pri-val">${priStr}</span>
          <div class="mini-bar"><div class="mini-fill fill-pri" style="width:${priPct}%"></div></div>
        </div>
      </td>
      <td>${signal}</td>
      <td><button class="del-btn" onclick="UI.removeAgent('${a.id}')">✕</button></td>
    </tr>`;
  }).join('');

  hint.textContent = State.ranked.length
    ? `Sorted by priority (descending) · Last run: ${new Date().toLocaleTimeString()}`
    : `${State.agents.length} agent(s) added. Click RUN SIMULATION to compute.`;

  document.getElementById('stAgents').textContent = State.agents.length;
}

function renderDecision(result) {
  const sec  = document.getElementById('decSection');
  const pan  = document.getElementById('decPanel');
  const { selected, ranking } = result;

  sec.style.display = 'block';

  const reason = buildReason(selected, ranking);

  pan.innerHTML = `
    <div class="dec-winner">
      <div class="dec-w-label">▶ ARBITRATION DECISION — AGENT GRANTED SIGNAL PRIORITY</div>
      <div class="dec-w-agent">${TYPE_EMOJI[selected.type] || ''} ${selected.id} · ${selected.type.toUpperCase()}</div>
      <div class="dec-w-sub">Speed: ${selected.speed} km/h &nbsp;|&nbsp; Urgency: ${selected.urgency}/10 &nbsp;|&nbsp; Type Weight: ${TYPE_WEIGHTS[selected.type]}</div>
      <div class="dec-w-reason">${reason}</div>
    </div>
    <div class="dec-stat">
      <div class="dec-stat-label">CONFIDENCE SCORE</div>
      <div class="dec-stat-val">${selected.confidence.toFixed(4)}</div>
    </div>
    <div class="dec-stat">
      <div class="dec-stat-label">PRIORITY SCORE</div>
      <div class="dec-stat-val green">${selected.priority.toFixed(4)}</div>
    </div>
    <div class="dec-stat">
      <div class="dec-stat-label">TOTAL AGENTS</div>
      <div class="dec-stat-val">${ranking.length}</div>
    </div>
    <div class="dec-stat">
      <div class="dec-stat-label">COMPUTE MODE</div>
      <div class="dec-stat-val">${State.apiOnline ? 'BACKEND' : 'FRONTEND FALLBACK'}</div>
    </div>
  `;
}

function buildReason(winner, ranking) {
  const w = TYPE_WEIGHTS[winner.type];
  const formula = `confidence = 0.5×${winner.urgency} + 0.3×(${winner.speed}/100) + 0.2×${w} = ${winner.confidence.toFixed(4)}`;
  const priCalc = `priority = ${winner.confidence.toFixed(4)} × ${winner.urgency} = ${winner.priority.toFixed(4)}`;
  const runnerUp = ranking[1] ? `Runner-up: ${ranking[1].id} (priority ${ranking[1].priority.toFixed(4)})` : 'Only agent in simulation.';
  return `${formula} &nbsp;→&nbsp; ${priCalc}. Highest priority in this cycle. ${runnerUp}`;
}

function updateStats(selected) {
  document.getElementById('stSims').textContent    = State.simCount;
  document.getElementById('stWinner').textContent  = selected.id;
  document.getElementById('stConf').textContent    = selected.confidence.toFixed(3);
  document.getElementById('stPri').textContent     = selected.priority.toFixed(3);
}

// ── CANVAS ────────────────────────────────────────────────────────────────────

function drawCanvas() {
  const canvas = document.getElementById('trafficCanvas');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width, H = 220;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#030a16';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(0,229,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  const CX = W/2, CY = H/2, RD = 52; // road half-width

  // Roads
  ctx.fillStyle = '#0e1a2e';
  ctx.fillRect(CX - RD, 0, RD*2, H);
  ctx.fillRect(0, CY - RD, W, RD*2);
  ctx.fillStyle = '#0b1626';
  ctx.fillRect(CX - RD, CY - RD, RD*2, RD*2);

  // Lane dashes
  ctx.setLineDash([14, 10]); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, 0); ctx.lineTo(CX, CY-RD); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CX, CY+RD); ctx.lineTo(CX, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, CY); ctx.lineTo(CX-RD, CY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CX+RD, CY); ctx.lineTo(W, CY); ctx.stroke();
  ctx.setLineDash([]);

  // Stop lines
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
  [[CX-RD,CY-RD,CX+RD,CY-RD],[CX-RD,CY+RD,CX+RD,CY+RD],
   [CX-RD,CY-RD,CX-RD,CY+RD],[CX+RD,CY-RD,CX+RD,CY+RD]].forEach(([x1,y1,x2,y2]) => {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  });

  // Traffic lights
  const hasWinner = !!State.selectedId;
  function drawLight(x, y, green) {
    ctx.fillStyle = '#08111e'; ctx.strokeStyle = '#1a3055'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x-7,y-18,14,34,3); ctx.fill(); ctx.stroke();
    [[0, green?'#550010':'#ff3a5c'],[10,green?'#554400':'#ffb800'],[20,green?'#004422':'#00ff88']].forEach(([oy,col],i) => {
      const lit = (i === 2 && green) || (i === 0 && !green && hasWinner);
      ctx.shadowColor = lit ? col : 'transparent'; ctx.shadowBlur = lit ? 10 : 0;
      ctx.fillStyle = lit ? col : col + '44';
      ctx.beginPath(); ctx.arc(x, y-8+oy, 4, 0, Math.PI*2); ctx.fill();
    });
    ctx.shadowBlur = 0;
  }
  drawLight(CX-RD-16, CY-RD+4,  hasWinner);
  drawLight(CX+RD+4,  CY+RD-18, false);
  drawLight(CX-RD+4,  CY+RD+4,  false);
  drawLight(CX+RD-16, CY-RD-18, false);

  // Vehicles — place along approach lanes
  const approaches = [
    (i) => ({ x: CX - 18, y: (CY - RD - 16) - i * 32 }), // North
    (i) => ({ x: W - (W - CX - RD - 16) + i * 32, y: CY - 18 }), // East
    (i) => ({ x: CX + 18, y: (CY + RD + 16) + i * 32 }), // South
    (i) => ({ x: (CX - RD - 16) - i * 32, y: CY + 18 }), // West
  ];

  const list = State.ranked.length ? State.ranked : State.agents.map((a,i) => ({ ...a, rank: i+1 }));
  list.forEach((a, idx) => {
    const lane  = idx % 4;
    const pos   = approaches[lane](Math.floor(idx / 4));
    const col   = TYPE_COLOR[a.type] || '#00e5ff';
    const isWin = a.id === State.selectedId;

    if (isWin) { ctx.shadowColor = col; ctx.shadowBlur = 22; }
    ctx.fillStyle = isWin ? col : col + '70';
    ctx.beginPath(); ctx.roundRect(pos.x - 11, pos.y - 7, 22, 14, 3); ctx.fill();
    ctx.shadowBlur = 0;

    if (isWin) {
      ctx.fillStyle = '#ffd700'; ctx.font = '10px serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', pos.x, pos.y - 9);
    }

    ctx.fillStyle = isWin ? '#000' : '#ffffffaa';
    ctx.font = `bold 6px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(a.type.slice(0,3).toUpperCase(), pos.x, pos.y);
    ctx.textBaseline = 'alphabetic';
  });

  // Center marker
  ctx.fillStyle = 'rgba(0,229,255,0.25)';
  ctx.beginPath(); ctx.arc(CX, CY, 5, 0, Math.PI*2); ctx.fill();

  // Labels
  ctx.fillStyle = 'rgba(0,229,255,0.35)'; ctx.font = '9px JetBrains Mono, monospace';
  ctx.textAlign = 'center'; ctx.fillText('N', CX, 10);
  ctx.fillText('S', CX, H-4);
  ctx.textAlign = 'left';  ctx.fillText('W', 5, CY+4);
  ctx.textAlign = 'right'; ctx.fillText('E', W-4, CY+4);
}

// ── UI ACTIONS (exposed as UI.* to keep HTML clean) ───────────────────────────

const UI = {

  addAgent() {
    const type    = document.getElementById('addType').value;
    const speed   = parseFloat(document.getElementById('addSpeed').value);
    const urgency = parseInt(document.getElementById('addUrgency').value);

    if (!speed || speed < 1 || speed > 200) { toast('Speed must be 1–200 km/h', 'err'); return; }
    if (!urgency || urgency < 1 || urgency > 10) { toast('Urgency must be 1–10', 'err'); return; }

    const id = `${type.slice(0,3).toUpperCase()}-${String(State.nextId++).padStart(3,'0')}`;
    State.agents.push({ id, type, speed, urgency });
    State.ranked = [];
    State.selectedId = null;
    log(`Agent added: ${id} (${type}, ${speed} km/h, urgency ${urgency})`, 'ok');
    renderTable(); drawCanvas();
    toast(`${TYPE_EMOJI[type]} ${type} added`);
  },

  removeAgent(id) {
    State.agents = State.agents.filter(a => a.id !== id);
    State.ranked = State.ranked.filter(a => a.id !== id);
    if (State.selectedId === id) State.selectedId = null;
    log(`Agent removed: ${id}`, 'inf');
    renderTable(); drawCanvas();
    toast('Agent removed');
  },

  autoGenerate() {
    const n = parseInt(document.getElementById('numAuto').value) || 4;
    const types = ['Ambulance','Bus','Car','Car','Bike','Car','Bus','Bike'];
    State.agents = [];
    State.ranked = [];
    State.selectedId = null;
    State.nextId = 1;

    for (let i = 0; i < n; i++) {
      const type    = types[i % types.length];
      const speed   = Math.round(20 + (type === 'Ambulance' ? 60 : type === 'Bus' ? 30 : 40) + (i * 7) % 40);
      const urgency = type === 'Ambulance' ? 9 : type === 'Bus' ? 6 : (3 + (i * 3) % 6);
      const id = `${type.slice(0,3).toUpperCase()}-${String(State.nextId++).padStart(3,'0')}`;
      State.agents.push({ id, type, speed, urgency });
    }
    log(`Auto-generated ${n} agents`, 'ok');
    renderTable(); drawCanvas();
    toast(`${n} agents generated!`);
  },

  async runSimulation() {
    if (State.agents.length === 0) { toast('Add agents first!', 'err'); return; }
    setLoading(true);
    document.getElementById('runBtn').disabled = true;
    try {
      const { data, fromBackend } = await callDecision(State.agents);

      // Normalize: backend may return snake_case
      const ranking  = data.ranking  || data.ranked || [];
      const selected = data.selected || data.winner || ranking[0];

      if (!selected || !ranking.length) throw new Error('Invalid response from computation');

      // Merge back into State
      State.ranked     = ranking;
      State.selectedId = selected.id;
      State.simCount++;

      renderTable();
      renderDecision({ selected, ranking });
      updateStats(selected);
      drawCanvas();

      log(`Simulation #${State.simCount} complete. Winner: ${selected.id} (priority ${selected.priority.toFixed(4)}) via ${fromBackend ? 'backend' : 'frontend fallback'}`, 'ok');
      toast(`✅ Winner: ${selected.id} (${selected.type})`);
      document.getElementById('decSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      log(`Simulation error: ${err.message}`, 'err');
      toast('Simulation failed: ' + err.message, 'err');
    } finally {
      setLoading(false);
      document.getElementById('runBtn').disabled = false;
    }
  },

  resetAll() {
    State.agents     = [];
    State.ranked     = [];
    State.selectedId = null;
    State.simCount   = 0;
    State.nextId     = 1;
    document.getElementById('decSection').style.display = 'none';
    document.getElementById('stSims').textContent    = '0';
    document.getElementById('stWinner').textContent  = '—';
    document.getElementById('stConf').textContent    = '—';
    document.getElementById('stPri').textContent     = '—';
    log('System reset', 'inf');
    renderTable(); drawCanvas();
    toast('Reset complete');
  },
};

// ── CLOCK ─────────────────────────────────────────────────────────────────────

function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('en-GB', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ── INIT ──────────────────────────────────────────────────────────────────────

window.addEventListener('load', async () => {
  log('System initialized — deterministic arbitration engine ready', 'ok');

  // Check API
  const online = await pingApi();
  setApiStatus(online);
  if (online) log('Backend API connected', 'ok');
  else log('Backend offline — frontend fallback active', 'inf');

  renderTable();
  drawCanvas();
  window.addEventListener('resize', drawCanvas);
});

// ── VERIFY LOCAL FORMULA (self-test on load) ──────────────────────────────────
(function selfTest() {
  const testAgent = { id: 'TEST-001', type: 'Ambulance', speed: 80, urgency: 9 };
  const conf = computeConfidence(testAgent);
  // Expected: 0.5*9 + 0.3*(80/100) + 0.2*1.0 = 4.5 + 0.24 + 0.2 = 4.94
  const expected = 4.94;
  if (Math.abs(conf - expected) > 0.001) {
    console.error(`[SELF-TEST FAILED] confidence=${conf}, expected=${expected}`);
  } else {
    console.log(`[SELF-TEST PASSED] confidence=${conf} ✓`);
  }
})();
