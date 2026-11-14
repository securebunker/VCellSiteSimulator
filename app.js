/* ==========================================================================
   VCSS 4G — synthetic virtual cell site simulator
   All subscribers, radio values and incidents are generated locally.
   No RF, EPC, HSS or real UE is contacted.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const formatElapsed = (seconds) => seconds < 60
    ? seconds.toFixed(1) + 's'
    : Math.floor(seconds / 60) + 'm ' + pad(Math.floor(seconds % 60)) + 's';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
  const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const fmtMoney2 = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compactMoney = (n) => {
    const sign = n < 0 ? '−' : '';
    const abs = Math.abs(n);
    if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e3) return sign + '$' + Math.round(abs / 1e3) + 'K';
    return sign + '$' + Math.round(abs);
  };
  const fmtPct = (n, digits = 1) => Number(n).toFixed(digits) + '%';
  const fmtTime = (d = new Date()) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' });
  const fmtTimeShort = (d = new Date()) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  const uid = (prefix = 'ID') => prefix + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();

  const CELL = {
    name: 'VCSS-ENB-0417',
    short: '0417',
    plmn: '001-01',
    mcc: '001',
    mnc: '01',
    earfcn: 1850,
    band: 3,
    bw: 20,
    pci: 127,
    tac: 4102,
  };

  const MODEL_DEFAULTS = {
    zoneSubs: 180000,
    exposure: 6.8,
    arpu: 14.2,
    duration: 6,
    annualIncidents: 1,
    churn: 2.4,
    ltv: 680,
    credit: 4.5,
    contactRate: 30,
    contactCost: 8.2,
    fixed: 120000,
    response: 28000,
    program: 185000,
    effectiveness: 72,
  };

  const TAB_NAMES = ['overview', 'noc', 'ues', 'signaling', '3d', 'rogue', 'business', 'guidance'];
  const APP_VERSION = '1.8.0';
  const viewDirty = new Set(TAB_NAMES);
  let lastLiveAnnounceAt = 0;
  let liveAnnounceTimer = 0;

  const NOC_STAFF = {
    manager: { name: 'Layla Mansour', role: 'NOC duty manager', initials: 'LM' },
    ran: { name: 'Omar Haddad', role: 'RAN engineer', initials: 'OH' },
    transport: { name: 'Priya Nair', role: 'Transport engineer', initials: 'PN' },
    soc: { name: 'Jonas Weber', role: 'SOC analyst', initials: 'JW' },
    commander: { name: 'Dana Whitfield', role: 'Incident commander', initials: 'DW' },
  };

  const SHIFT_OPERATOR = 'NOC Shift B · synthetic operator';

  const SHARE_BTS = { name: 'GhostCell-01', pci: 412, tac: 9999, band: 3, power: 46, targetCount: 8 };
  const CONTAINMENT_PLAY = [
    ['Correlate RF + NMS', 'PCI, TAC, PLMN and S1 source'],
    ['Triangulate transmitter', 'RF sensor bearings and timing'],
    ['Push deny policy', 'PCI / TAC / forbidden PLMN'],
    ['Recover UEs', 'Force reselection to macro'],
    ['Close incident', 'Preserve evidence package'],
  ];

  let modalReturnFocus = null;
  let drawerReturnFocus = null;
  let paletteResults = [];
  let paletteIndex = 0;

  const MODEL_FIELDS = [
    { key: 'zoneSubs', label: 'Subscribers in coverage zone', min: 50000, max: 500000, step: 5000, fmt: (v) => fmtInt(v), hint: 'How many subscribers camp in the faked coverage area.' },
    { key: 'exposure', label: 'Subscriber exposure rate', min: 1, max: 15, step: 0.1, fmt: (v) => fmtPct(v), hint: 'Share of camped subscribers that reselect during the incident.' },
    { key: 'arpu', label: 'Monthly ARPU', min: 5, max: 30, step: 0.5, fmt: (v) => fmtMoney2(v), hint: 'Average revenue per affected subscriber.' },
    { key: 'duration', label: 'Incident duration', min: 1, max: 24, step: 1, fmt: (v) => v + ' h', hint: 'Time from rogue activation to validated containment.' },
    { key: 'annualIncidents', label: 'Expected incidents per year', min: 0, max: 10, step: 0.1, fmt: (v) => Number(v).toFixed(1) + ' / year', hint: 'Modeled rogue-cell events the program should expect.' },
    { key: 'churn', label: 'Churn uplift from incident', min: 0, max: 5, step: 0.1, fmt: (v) => fmtPct(v), hint: 'Extra monthly churn among affected subscribers.' },
    { key: 'ltv', label: 'Subscriber lifetime value', min: 200, max: 1200, step: 20, fmt: (v) => fmtMoney(v), hint: 'Value lost per churned subscriber.' },
    { key: 'credit', label: 'Service credit per subscriber', min: 0, max: 15, step: 0.5, fmt: (v) => fmtMoney2(v), hint: 'Goodwill credit granted per affected subscriber.' },
    { key: 'contactRate', label: 'Customers contacting care', min: 0, max: 100, step: 1, fmt: (v) => fmtPct(v, 0), hint: 'Share of affected subscribers that open a care contact.' },
    { key: 'contactCost', label: 'Cost per care contact', min: 1, max: 30, step: 0.5, fmt: (v) => fmtMoney2(v), hint: 'Fully loaded cost of one care interaction.' },
    { key: 'fixed', label: 'Regulatory & brand exposure', min: 0, max: 500000, step: 5000, fmt: (v) => fmtMoney(v), hint: 'Per-incident fixed exposure: reporting, legal and brand repair.' },
    { key: 'response', label: 'Incident response cost', min: 0, max: 100000, step: 1000, fmt: (v) => fmtMoney(v), hint: 'NOC, SOC and RF-labor cost to detect and contain one event.' },
    { key: 'program', label: 'Annual VCSS program cost', min: 50000, max: 500000, step: 5000, fmt: (v) => fmtMoney(v), hint: 'Yearly cost of running the detection-validation program.' },
    { key: 'effectiveness', label: 'Detection effectiveness', min: 30, max: 95, step: 1, fmt: (v) => fmtPct(v, 0), hint: 'Share of incidents the program catches before subscriber harm.' },
  ];

  const state = {
    tab: 'overview',
    cell: {
      online: true,
      restarting: false,
      pci: 127,
      tac: 4102,
      earfcn: 1850,
      band: 3,
      bw: 20,
      duplex: 'FDD',
      txPower: 43,
      baseLoad: 62,
      load: 62,
    },
    ues: [],
    ueSeq: 24,
    events: [],
    rogue: null,
    incident: null,
    containmentRunning: false,
    containmentStep: 0,
    runToken: 0,
    model: { ...MODEL_DEFAULTS },
    chartData: [],
    trace: {
      procedure: 'attach',
      ueId: null,
      step: -1,
      playing: false,
      timer: null,
      speed: 1800,
      built: false,
    },
    noc: null,
    lastKpi: {},
  };

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DEVICES = [
    { model: 'Nova X2', type: 'Smartphone', cat: 'Cat-6', apn: 'internet.mno' },
    { model: 'Orion Air', type: 'Smartphone', cat: 'Cat-9', apn: 'internet.mno' },
    { model: 'Helio CPE 4G', type: 'CPE', cat: 'Cat-4', apn: 'broadband.mno' },
    { model: 'Pulse Tab', type: 'Tablet', cat: 'Cat-4', apn: 'internet.mno' },
    { model: 'M2M Link 200', type: 'IoT', cat: 'Cat-M1', apn: 'iot.mno' },
    { model: 'Nova Mini', type: 'Smartphone', cat: 'Cat-4', apn: 'internet.mno' },
    { model: 'Aster Router', type: 'CPE', cat: 'Cat-6', apn: 'broadband.mno' },
    { model: 'Kite Sensor', type: 'IoT', cat: 'Cat-M1', apn: 'iot.mno' },
  ];

  /* Synthetic subscriber backstories (v1.5.0 content depth). Fictional people and
     sites for training narratives — no real subscriber data. */
  const UE_STORIES = {
    1: 'Field technician running a coverage-validation route for the test range. Carries the Nova X2 with a diagnostic APN.',
    3: 'Helio CPE serving a model home-office site. Fixed broadband profile; watched for attach stability during drills.',
    7: 'Sales engineer phone used for executive demos. Expected to stay on the macro layer during a rogue-cell drill.',
    12: 'Utility IoT gateway on the range fence. Low data, high availability expectation; QCI 9 best-effort.',
    15: 'Visitor-device profile for the training lab. Rotates through detach and re-attach between sessions.',
    19: 'Seasonal point-of-sale terminal at the range kiosk. Idle most of the day; brief bursts at shift change.',
    24: 'Demo phone of the program lead. Deliberately included in the affected-UE set during containment rehearsals.',
  };

  function generateUEs() {
    const rng = mulberry32(0x4a7c0de);
    const ues = [];
    for (let i = 0; i < 24; i += 1) {
      const dev = DEVICES[i % DEVICES.length];
      const stateName = i < 7 ? 'connected' : i < 18 ? 'idle' : 'detached';
      const connected = stateName === 'connected';
      const idle = stateName === 'idle';
      const rsrp = connected ? -72 - rng() * 20 : idle ? -79 - rng() * 24 : -102 - rng() * 15;
      const sinr = connected ? 12 + rng() * 12 : idle ? 5 + rng() * 13 : 0;
      const dl = connected ? 18 + rng() * 27 : 0;
      const ul = connected ? 3 + rng() * 9 : 0;
      const imsi = '00101' + String(1000000000 + i * 317 + 41);
      const msisdn = '+1 555 010 ' + String(1000 + i);
      const imei = '35' + String(1000000000000 + i * 7919).padStart(13, '0');
      ues.push({
        id: 'UE-' + pad(i + 1, 3),
        story: UE_STORIES[i + 1] || null,
        imsi,
        msisdn,
        imei,
        device: dev.model,
        type: dev.type,
        category: dev.cat,
        apn: dev.apn,
        state: stateName,
        serving: CELL.name,
        band: 'B3',
        rsrp: Number(rsrp.toFixed(1)),
        rsrq: Number((-8 - rng() * 7).toFixed(1)),
        sinr: Number(sinr.toFixed(1)),
        cqi: connected ? Math.round(8 + rng() * 7) : idle ? Math.round(5 + rng() * 6) : 0,
        dl: Number(dl.toFixed(1)),
        ul: Number(ul.toFixed(1)),
        ip: stateName === 'detached' ? '—' : '10.42.' + (i % 4 + 1) + '.' + (20 + i),
        qci: dev.type === 'IoT' ? 9 : 9,
        security: stateName === 'detached' ? 'No session' : 'EPS-AKA · 128-EEA2',
        lastProcedure: connected ? 'Service Request' : idle ? 'Periodic TAU' : 'Detach',
        lastSeen: new Date(Date.now() - Math.floor(rng() * 540000)),
        arpu: Number((9.5 + rng() * 10).toFixed(2)),
        dataGb: Number((0.4 + rng() * 31).toFixed(1)),
        topoAngle: rng() * Math.PI * 2,
        topoRadius: 30 + rng() * 95,
        prevState: null,
        prevServing: null,
        prevRsrp: null,
        prevSecurity: null,
        prevSinr: null,
        prevCqi: null,
        prevDl: null,
        prevUl: null,
        rogueId: null,
      });
    }
    return ues;
  }

  function generateNewUE() {
    const rng = mulberry32(Date.now() & 0xffffffff);
    const dev = DEVICES[state.ueSeq % DEVICES.length];
    state.ueSeq += 1;
    const i = state.ueSeq;
    const ue = {
      id: 'UE-' + pad(i, 3),
      imsi: '00101' + String(1000000000 + i * 317 + 41),
      msisdn: '+1 555 010 ' + String(1000 + i),
      imei: '35' + String(1000000000000 + i * 7919).padStart(13, '0'),
      device: dev.model,
      type: dev.type,
      category: dev.cat,
      apn: dev.apn,
      state: 'idle',
      serving: CELL.name,
      band: 'B3',
      rsrp: Number((-79 - rng() * 22).toFixed(1)),
      rsrq: Number((-8 - rng() * 6).toFixed(1)),
      sinr: Number((6 + rng() * 12).toFixed(1)),
      cqi: Math.round(5 + rng() * 6),
      dl: 0,
      ul: 0,
      ip: '10.42.' + (i % 4 + 1) + '.' + (20 + (i % 200)),
      qci: 9,
      security: 'EPS-AKA · 128-EEA2',
      lastProcedure: 'Initial Attach',
      lastSeen: new Date(),
      arpu: Number((9.5 + rng() * 10).toFixed(2)),
      dataGb: Number((0.1 + rng() * 8).toFixed(1)),
      topoAngle: rng() * Math.PI * 2,
      topoRadius: 30 + rng() * 90,
      prevState: null,
      prevServing: null,
      prevRsrp: null,
      prevSecurity: null,
      prevSinr: null,
      prevCqi: null,
      prevDl: null,
      prevUl: null,
      rogueId: null,
    };
    state.ues.push(ue);
    addEvent('ok', ue.id + ' registered on VCSS', ue.imsi + ' · ' + ue.device + ' · EPS attach complete');
    return ue;
  }

  function generateChartData() {
    const rng = mulberry32(0x51c7);
    return Array.from({ length: 28 }, (_, i) => 188 + Math.sin(i / 2.65) * 14 + (rng() - 0.5) * 10);
  }

  function initialEvents() {
    const now = Date.now();
    return [
      { ts: now - 26000, sev: 'ok', title: 'S1-MME link healthy', detail: '12 ms RTT · 0 retransmits · 3/3 neighbors' },
      { ts: now - 71000, sev: 'info', title: 'UE-014 completed periodic TAU', detail: 'TAI 4102 · GUTI reallocated' },
      { ts: now - 132000, sev: 'info', title: 'PRB utilization within policy', detail: '62% · Band 3 · 20 MHz' },
      { ts: now - 205000, sev: 'ok', title: 'SIB1 broadcast refreshed', detail: 'PLMN 001-01 · TAC 4102 · cell barred = false' },
      { ts: now - 288000, sev: 'info', title: 'HSS response normal', detail: 'S6a AIR/AIA · 9 ms' },
    ];
  }

  function announceLive(text) {
    const node = $('#eventStatus');
    if (!node) return;
    const now = Date.now();
    const wait = Math.max(0, 4000 - (now - lastLiveAnnounceAt));
    window.clearTimeout(liveAnnounceTimer);
    if (!wait) {
      node.textContent = text;
      lastLiveAnnounceAt = now;
      return;
    }
    liveAnnounceTimer = window.setTimeout(() => {
      node.textContent = text;
      lastLiveAnnounceAt = Date.now();
    }, wait);
  }

  function addEvent(sev, title, detail) {
    state.events.unshift({ ts: new Date(), sev, title, detail });
    if (state.events.length > 30) state.events.length = 30;
    renderEvents();
    announceLive(title + '. ' + detail);
  }

  function getMetrics() {
    const total = state.ues.length;
    const connected = state.ues.filter((u) => u.state === 'connected').length;
    const idle = state.ues.filter((u) => u.state === 'idle').length;
    const rogue = state.ues.filter((u) => u.state === 'rogue').length;
    const detached = state.ues.filter((u) => u.state === 'detached').length;
    const attached = connected + idle;
    const load = state.cell.load;
    const throughput = Math.max(8, 86 + load * 1.45 + connected * 4.2 - rogue * 12);
    const attachSuccess = clamp(99.2 - rogue * 1.2, 60, 99.9);
    const availability = state.cell.online ? (rogue ? 99.91 : 99.98) : 0;
    const latency = 18 + rogue * 3.2;
    const loss = 0.02 + rogue * 0.12;
    const ho = clamp(99.4 - rogue * 2.1, 60, 99.9);
    const nps = -1.35 * rogue;
    return {
      total, connected, idle, rogue, detached, attached,
      load, throughput, attachSuccess, availability, latency, loss, ho, nps,
      attachedPct: total ? (attached / total) * 100 : 0,
      connectedPct: total ? (connected / total) * 100 : 0,
      roguePct: total ? (rogue / total) * 100 : 0,
      exposed: rogue,
      sessionsDropped: state.incident ? state.incident.sessionsDropped : 0,
    };
  }

  function modelImpact(model = state.model) {
    const affected = model.zoneSubs * (model.exposure / 100);
    const revenue = affected * model.arpu * (model.duration / 730);
    const credits = affected * model.credit;
    const care = affected * (model.contactRate / 100) * model.contactCost;
    const churn = affected * (model.churn / 100) * model.ltv;
    const fixed = model.fixed;
    const response = model.response;
    const total = revenue + credits + care + churn + fixed + response;
    const annualTotal = total * model.annualIncidents;
    const avoided = annualTotal * (model.effectiveness / 100);
    const residual = annualTotal - avoided;
    const withProgram = residual + model.program;
    const net = avoided - model.program;
    const roi = model.program ? (net / model.program) * 100 : 0;
    const payback = avoided > 0 ? model.program / (avoided / 12) : 0;
    return {
      affected, revenue, credits, care, churn, fixed, response, total, annualTotal,
      avoided, residual, withProgram, net, roi, payback,
      categories: [
        { label: 'Revenue leakage', value: revenue, color: '#38bdf8' },
        { label: 'Service credits', value: credits, color: '#a78bfa' },
        { label: 'Customer care', value: care, color: '#fbbf24' },
        { label: 'Churn / lifetime value', value: churn, color: '#fb7185' },
        { label: 'Regulatory & brand', value: fixed, color: '#f43f5e' },
        { label: 'Incident response', value: response, color: '#94a3b8' },
      ],
    };
  }

  function stateBadge(ue) {
    if (ue.state === 'rogue') return '<span class="badge badge-rogue"><i></i>Rogue</span>';
    if (ue.state === 'connected') return '<span class="badge badge-connected"><i></i>Connected</span>';
    if (ue.state === 'idle') return '<span class="badge badge-idle"><i></i>Idle</span>';
    return '<span class="badge badge-detached"><i></i>Detached</span>';
  }

  function securityBadge(ue) {
    if (ue.state === 'rogue') return '<span class="badge badge-danger"><i></i>IMSI exposed</span>';
    if (ue.state === 'detached') return '<span class="badge badge-muted">No session</span>';
    return '<span class="badge badge-secure">EPS-AKA</span>';
  }

  function signalMini(ue) {
    const pct = clamp(((ue.rsrp + 120) / 50) * 100, 4, 100);
    const cls = ue.rsrp > -85 ? '' : ue.rsrp > -100 ? 'warn' : 'bad';
    return '<span class="signal-mini"><span class="signal-bar"><i class="' + cls + '" style="width:' + pct.toFixed(0) + '%"></i></span><b>' + ue.rsrp.toFixed(0) + '</b></span>';
  }

  function ueIdentity(ue) {
    const initials = ue.device.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
    return '<div class="ue-cell ' + (ue.state === 'rogue' ? 'rogue' : '') + '"><span class="ue-avatar">' + esc(initials) + '</span><div><strong>' + esc(ue.id) + '</strong><small>' + esc(ue.device) + '</small></div></div>';
  }

  function updateHeader() {
    const m = getMetrics();
    const rogueActive = !!state.rogue && !state.incident?.contained;
    const contained = !!state.incident?.contained;

    $('#ueTabCount').textContent = state.ues.length;
    $('#metaBand').textContent = state.cell.band;
    $('#idPci').textContent = state.cell.pci;
    $('#idTac').textContent = state.cell.tac;
    $('#idBandBw').textContent = 'B' + state.cell.band + ' · ' + state.cell.bw + ' MHz';

    const badge = $('#cellStateBadge');
    if (!state.cell.online) {
      badge.className = 'state-badge offline';
      badge.innerHTML = '<i></i>Offline';
    } else if (state.cell.restarting) {
      badge.className = 'state-badge offline';
      badge.innerHTML = '<i></i>Restarting';
    } else {
      badge.className = 'state-badge online';
      badge.innerHTML = '<i></i>Broadcasting';
    }

    const mode = $('#modePill');
    if (contained) {
      mode.className = 'status-pill contained';
      mode.innerHTML = '<i class="dot"></i><span>Contained</span>';
    } else if (rogueActive) {
      mode.className = 'status-pill critical';
      mode.innerHTML = '<i class="dot"></i><span>Rogue cell active</span>';
    } else {
      mode.className = 'status-pill';
      mode.innerHTML = '<i class="dot"></i><span>Nominal</span>';
    }

    const rogueBadge = $('#rogueTabBadge');
    if (state.rogue && !contained) {
      rogueBadge.hidden = false;
      rogueBadge.textContent = String(m.rogue || 1);
    } else {
      rogueBadge.hidden = true;
    }

    const addLabel = state.rogue
      ? (contained ? 'New fake BTS' : 'View fake BTS')
      : 'Add fake BTS';
    const addBtn = $('#addFakeBtn');
    if (addBtn) {
      const span = addBtn.querySelector('span');
      if (span) span.textContent = addLabel;
      addBtn.setAttribute('aria-label', state.rogue && !contained ? 'View fake BTS incident' : addLabel);
    }
    const addBtn2 = $('#addFakeBtn2');
    if (addBtn2) {
      const span = addBtn2.querySelector('span');
      if (span) span.textContent = state.rogue ? (contained ? 'New fake BTS' : 'View incident') : 'Add fake BTS';
      addBtn2.setAttribute('aria-label', state.rogue && !contained ? 'View fake BTS incident' : addLabel);
    }

    const topoCount = $('#rogueTopoCount');
    if (topoCount) {
      topoCount.textContent = state.rogue ? (contained ? '0' : '1') : '0';
      topoCount.className = state.rogue && !contained ? 'danger-text' : 'ok';
    }

    const prb = clamp(state.cell.load, 0, 99);
    const prbText = $('#prbText');
    const prbBar = $('#prbBar');
    if (prbText) prbText.textContent = Math.round(prb) + '%';
    if (prbBar) {
      prbBar.style.width = prb + '%';
      prbBar.className = prb > 80 ? 'hot' : '';
    }

    document.title = rogueActive ? 'Rogue cell active — VCSS 4G' : contained ? 'Incident contained — VCSS 4G' : 'VCSS 4G — Virtual Cell Site Simulator';
  }

  function updateClock() {
    const now = new Date();
    const clock = $('#clock');
    if (clock) clock.textContent = fmtTime(now) + ' UTC';
    const lab = $('#labTime');
    if (lab) lab.textContent = fmtTimeShort(now);
    if (state.tab === 'noc') updateNocAges();
  }

  function setText(selector, value) {
    const el = $(selector);
    if (el) el.textContent = value;
  }

  function renderKpis() {
    const m = getMetrics();
    const rogueActive = !!state.rogue && !state.incident?.contained;
    setText('#kpiAttached', m.attached);
    setText('#kpiAttachedTotal', '/ ' + m.total);
    setText('#kpiAttachedSub', Math.round(m.attachedPct) + '% of virtual fleet');
    setText('#kpiAttachedTrend', rogueActive ? '-' + m.rogue + ' on rogue' : 'stable');
    $('#kpiAttachedBar').style.width = clamp(m.attachedPct, 0, 100) + '%';

    setText('#kpiConnected', m.connected);
    setText('#kpiConnectedTrend', rogueActive ? 'degraded' : 'nominal');
    $('#kpiConnectedBar').style.width = clamp(m.connectedPct, 0, 100) + '%';

    setText('#kpiThroughput', m.throughput.toFixed(1));
    setText('#kpiThroughputTrend', rogueActive ? 'degraded' : 'live');
    $('#kpiThroughputBar').style.width = clamp((m.throughput / 280) * 100, 0, 100) + '%';
    $('#kpiThroughputTrend').className = 'trend ' + (rogueActive ? 'down' : 'up');

    setText('#kpiAttachSuccess', m.attachSuccess.toFixed(1));
    setText('#kpiAttachTrend', rogueActive ? 'degraded' : 'healthy');
    $('#kpiAttachBar').style.width = clamp(m.attachSuccess, 0, 100) + '%';
    $('#kpiAttachTrend').className = 'trend ' + (rogueActive ? 'down' : 'up');

    setText('#kpiAvailability', m.availability.toFixed(2));
    setText('#kpiAvailabilityTrend', rogueActive ? 'SLA at risk' : 'SLA met');
    $('#kpiAvailabilityBar').style.width = clamp(m.availability, 0, 100) + '%';
    $('#kpiAvailabilityTrend').className = 'trend ' + (rogueActive ? 'down' : '');

    setText('#kpiRogue', m.rogue);
    setText('#kpiRogueSub', rogueActive ? m.rogue + ' UEs on rogue cell' : 'Clean spectrum');
    setText('#kpiRogueTrend', rogueActive ? 'active threat' : 'no anomaly');
    $('#kpiRogueBar').style.width = clamp(m.roguePct, 0, 100) + '%';
    $('#kpiRogueTrend').className = 'trend ' + (rogueActive ? 'down' : '');
    const rogueCard = $('[data-kpi="rogue"]');
    if (rogueCard) rogueCard.classList.toggle('alert', rogueActive);

    const kpiValues = {
      attached: String(m.attached),
      connected: String(m.connected),
      throughput: m.throughput.toFixed(1),
      attach: m.attachSuccess.toFixed(1),
      availability: m.availability.toFixed(2),
      rogue: String(m.rogue),
    };
    Object.entries(kpiValues).forEach(([key, value]) => {
      if (state.lastKpi[key] !== undefined && state.lastKpi[key] !== value) {
        const card = $('[data-kpi="' + key + '"]');
        if (card) {
          card.classList.remove('flash');
          void card.offsetWidth;
          card.classList.add('flash');
        }
      }
      state.lastKpi[key] = value;
    });
  }

  function renderOverviewTable() {
    const tbody = $('#overviewUeTable tbody');
    if (!tbody) return;
    const order = { rogue: 0, connected: 1, idle: 2, detached: 3 };
    const rows = [...state.ues]
      .sort((a, b) => (order[a.state] - order[b.state]) || a.id.localeCompare(b.id))
      .slice(0, 7);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="feed-empty">No virtual UEs registered.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((ue) => `
      <tr data-ue-id="${esc(ue.id)}" class="${ue.state === 'rogue' ? 'is-rogue' : ''}">
        <td>${ueIdentity(ue)}</td>
        <td class="mono">${esc(ue.imsi)}</td>
        <td>${stateBadge(ue)}</td>
        <td class="mono">${esc(ue.serving)}</td>
        <td>${signalMini(ue)}</td>
        <td class="mono">${ue.dl ? ue.dl.toFixed(1) + ' Mbps' : '—'}</td>
        <td>${securityBadge(ue)}</td>
        <td><button class="table-action" data-trace="${esc(ue.id)}" type="button">Trace</button></td>
      </tr>
    `).join('');
  }

  function renderEvents() {
    const feed = $('#eventFeed');
    if (!feed) return;
    if (!state.events.length) {
      feed.innerHTML = '<div class="feed-empty">No events in the NOC stream.</div>';
      return;
    }
    feed.innerHTML = state.events.slice(0, 10).map((event) => `
      <div class="feed-item ${event.sev}">
        <span class="feed-dot"></span>
        <div>
          <div class="feed-top"><span class="feed-title">${esc(event.title)}</span><span class="feed-time">${fmtTime(new Date(event.ts))}</span></div>
          <div class="feed-detail">${esc(event.detail)}</div>
        </div>
      </div>
    `).join('');
  }

  function renderPerformance() {
    const chart = $('#throughputChart');
    if (!chart) return;
    const m = getMetrics();
    const target = m.throughput;
    const data = state.chartData.map((v, i) => {
      if (i < 18) return v;
      const t = (i - 18) / 9;
      return v * (1 - t) + target * t + Math.sin(i * 1.7) * 2.3;
    });
    const width = 460;
    const height = 170;
    const left = 12;
    const right = 452;
    const top = 12;
    const bottom = 145;
    const max = 280;
    const x = (i) => left + (i / (data.length - 1)) * (right - left);
    const y = (v) => bottom - (clamp(v, 0, max) / max) * (bottom - top);
    const line = data.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const area = line + ' L ' + right + ' ' + bottom + ' L ' + left + ' ' + bottom + ' Z';
    const danger = !!state.rogue && !state.incident?.contained;
    const last = data[data.length - 1];
    const grid = [0, 140, 280].map((value) => `
      <line class="chart-grid" x1="${left}" y1="${y(value)}" x2="${right}" y2="${y(value)}"></line>
      <text class="chart-label" x="2" y="${y(value) + 2}">${value}</text>
    `).join('');
    chart.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Synthetic downlink throughput trend">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${danger ? '#fb7185' : '#38bdf8'}" stop-opacity=".28"></stop>
            <stop offset="100%" stop-color="${danger ? '#fb7185' : '#38bdf8'}" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        ${grid}
        <path class="chart-area" d="${area}"></path>
        <path class="chart-line ${danger ? 'danger' : ''}" pathLength="1" d="${line}"></path>
        <g class="chart-hover ${danger ? 'danger' : ''}" aria-hidden="true" hidden>
          <line class="chart-hover-line" x1="0" x2="0" y1="${top}" y2="${bottom}"></line>
          <circle class="chart-hover-dot" cx="0" cy="0" r="3.2"></circle>
        </g>
        <circle class="chart-dot ${danger ? 'danger' : ''}" cx="${x(data.length - 1)}" cy="${y(last)}" r="3"></circle>
        <rect class="chart-hit" x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"></rect>
        <text class="chart-label" x="${left}" y="162">30m ago</text>
        <text class="chart-label" x="${width / 2}" y="162" text-anchor="middle">15m</text>
        <text class="chart-label" x="${right}" y="162" text-anchor="end">now</text>
      </svg>
      <div class="chart-tip${danger ? ' danger' : ''}" aria-hidden="true" hidden><span>DL throughput</span><b>—</b></div>
    `;
    const hit = chart.querySelector('.chart-hit');
    const hover = chart.querySelector('.chart-hover');
    const tip = chart.querySelector('.chart-tip');
    if (hit && hover && tip && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const cross = hover.querySelector('.chart-hover-line');
      const dot = hover.querySelector('.chart-hover-dot');
      hit.addEventListener('pointermove', (event) => {
        const rect = hit.getBoundingClientRect();
        if (!rect.width) return;
        const chartRect = chart.getBoundingClientRect();
        const plotLeft = rect.left - chartRect.left;
        const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const index = Math.round(ratio * (data.length - 1));
        const px = x(index);
        cross.setAttribute('x1', px);
        cross.setAttribute('x2', px);
        dot.setAttribute('cx', px);
        dot.setAttribute('cy', y(data[index]));
        hover.removeAttribute('hidden');
        tip.hidden = false;
        tip.querySelector('b').textContent = data[index].toFixed(1) + ' Mbps';
        tip.querySelector('span').textContent = index === data.length - 1
          ? 'now'
          : Math.round(30 - (index / (data.length - 1)) * 30) + 'm ago';
        tip.style.left = clamp(plotLeft + (px - left) * (rect.width / (right - left)), 64, chart.clientWidth - 64) + 'px';
      });
      hit.addEventListener('pointerleave', () => {
        hover.setAttribute('hidden', '');
        tip.hidden = true;
      });
    }
    const badge = $('#perfBadge');
    if (badge) {
      badge.textContent = target.toFixed(1) + ' Mbps';
      badge.className = 'metric-badge' + (danger ? ' danger' : '');
    }
    setText('#perfLatency', m.latency.toFixed(0) + ' ms');
    setText('#perfLoss', m.loss.toFixed(2) + '%');
    setText('#perfHo', m.ho.toFixed(1) + '%');
    $('#perfLatency').className = danger ? 'danger' : '';
    $('#perfLoss').className = danger ? 'danger' : '';
    $('#perfHo').className = danger ? 'danger' : '';
  }

  function renderTopologies() {
    const overview = $('#overviewTopology');
    if (overview) renderTopology(overview, 'overview');
    const rogue = $('#rogueTopology');
    if (rogue && state.rogue) renderTopology(rogue, 'rogue');
  }

  function renderTopology(container, variant) {
    const rogue = state.rogue;
    const contained = !!state.incident?.contained;
    const macro = { x: 250, y: 178 };
    const roguePos = { x: 428, y: 137 };
    const neighbors = [
      { x: 74, y: 76, label: 'NBR-118' },
      { x: 486, y: 306, label: 'NBR-203' },
      { x: 76, y: 310, label: 'NBR-077' },
    ];
    const gridId = 'topoGrid-' + variant;
    const ring = (cx, cy, r, cls) => `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"></circle>`;
    const neighborMarkup = neighbors.map((n) => `
      <g>
        ${ring(n.x, n.y, 22, 'neighbor-ring')}
        <path class="neighbor-line" d="M${n.x} ${n.y - 10}v18M${n.x - 5} ${n.y + 8}h10M${n.x} ${n.y - 10}l-4 18M${n.x} ${n.y - 10}l4 18"></path>
        <circle class="neighbor-dot" cx="${n.x}" cy="${n.y - 11}" r="2"></circle>
        <text class="topo-sub" x="${n.x}" y="${n.y + 20}" text-anchor="middle">${n.label}</text>
      </g>
    `).join('');

    const rogueMarkup = rogue ? `
      <g class="${contained ? 'contained' : ''}">
        ${ring(roguePos.x, roguePos.y, 34, 'rogue-ring')}
        ${ring(roguePos.x, roguePos.y, 62, 'rogue-ring r2')}
        ${ring(roguePos.x, roguePos.y, 92, 'rogue-ring r3')}
        <line class="rogue-line" x1="${macro.x}" y1="${macro.y}" x2="${roguePos.x}" y2="${roguePos.y}"></line>
        <g transform="translate(${roguePos.x} ${roguePos.y})">
          <path class="rogue-tower" d="M0 20V-8M-7 20H7M0 -8l-5 28M0 -8l5 28M-4 6H4"></path>
          <circle class="rogue-tower" cx="0" cy="-10" r="2.5"></circle>
        </g>
        <text class="rogue-label" x="${roguePos.x}" y="${roguePos.y + 37}" text-anchor="middle">${contained ? 'CONTAINED' : esc(rogue.name)}</text>
        <text class="rogue-sub" x="${roguePos.x}" y="${roguePos.y + 47}" text-anchor="middle">PCI ${rogue.pci} · TAC ${rogue.tac}</text>
      </g>
    ` : '';

    const affected = state.ues.filter((u) => u.state === 'rogue');
    const rogueLinks = rogue ? affected.map((ue) => {
      const angle = ue.topoAngle;
      const radius = 22 + (ue.topoRadius % 55);
      const cx = clamp(roguePos.x + Math.cos(angle) * radius, 350, 535);
      const cy = clamp(roguePos.y + Math.sin(angle) * radius, 42, 270);
      return `<line class="rogue-line" x1="${roguePos.x}" y1="${roguePos.y}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}"></line>`;
    }).join('') : '';

    const ueMarkup = state.ues.map((ue) => {
      const isRogue = ue.state === 'rogue' && rogue;
      const angle = ue.topoAngle;
      const radius = isRogue ? 22 + (ue.topoRadius % 55) : 28 + (ue.topoRadius % 100);
      const cx = isRogue ? clamp(roguePos.x + Math.cos(angle) * radius, 350, 535) : clamp(macro.x + Math.cos(angle) * radius, 90, 400);
      const cy = isRogue ? clamp(roguePos.y + Math.sin(angle) * radius, 42, 270) : clamp(macro.y + Math.sin(angle) * radius, 40, 300);
      const cls = isRogue ? 'rogue' : ue.state;
      return `<circle class="ue-halo ${isRogue ? 'rogue' : ''}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6" style="animation-delay:-${((ue.topoRadius % 11) * 0.36).toFixed(2)}s"></circle>
        <circle class="ue-dot ${cls}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2"><title>${esc(ue.id)} · ${esc(ue.state)} · ${esc(ue.serving)}</title></circle>`;
    }).join('');

    container.innerHTML = `
      <svg viewBox="0 0 560 360" class="${contained ? 'contained' : ''}" role="img" aria-label="Synthetic LTE coverage map">
        <defs>
          <pattern id="${gridId}" width="28" height="28" patternUnits="userSpaceOnUse">
            <path class="topo-grid-line" d="M28 0H0V28" fill="none" stroke="rgba(151,180,207,.06)" stroke-width="1"></path>
          </pattern>
        </defs>
        <rect class="topo-bg" x="0" y="0" width="560" height="360" fill="url(#${gridId})"></rect>
        ${ring(macro.x, macro.y, 58, 'coverage-ring strong')}
        ${ring(macro.x, macro.y, 100, 'coverage-ring')}
        ${ring(macro.x, macro.y, 145, 'coverage-ring')}
        ${neighborMarkup}
        ${rogueMarkup}
        ${rogueLinks}
        <g transform="translate(${macro.x} ${macro.y})">
          <path class="enb-line" d="M0 22V-10M-8 22H8M0 -10l-5 32M0 -10l5 32M-4 5H4"></path>
          <circle class="enb-dot" cx="0" cy="-12" r="3.5"></circle>
        </g>
        <text class="topo-label" x="${macro.x}" y="${macro.y + 42}" text-anchor="middle">VCSS-ENB-0417</text>
        <text class="topo-sub" x="${macro.x}" y="${macro.y + 52}" text-anchor="middle">B3 · 20 MHz · PCI ${state.cell.pci}</text>
        ${ueMarkup}
        <text class="topo-sub" x="536" y="20" text-anchor="end">N ↑</text>
      </svg>
    `;
  }

  function renderUeRegistry() {
    const search = ($('#ueSearch')?.value || '').trim().toLowerCase();
    const stateFilter = $('#ueStateFilter')?.value || 'all';
    const typeFilter = $('#ueTypeFilter')?.value || 'all';
    const order = { rogue: 0, connected: 1, idle: 2, detached: 3 };

    const filtered = state.ues.filter((ue) => {
      const haystack = [ue.id, ue.imsi, ue.msisdn, ue.device, ue.type, ue.serving].join(' ').toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (stateFilter === 'attached' && !['connected', 'idle'].includes(ue.state)) return false;
      if (['connected', 'idle', 'rogue', 'detached'].includes(stateFilter) && ue.state !== stateFilter) return false;
      if (typeFilter !== 'all' && ue.type !== typeFilter) return false;
      return true;
    }).sort((a, b) => (order[a.state] - order[b.state]) || a.id.localeCompare(b.id));

    const m = getMetrics();
    setText('#ueTotal', m.total);
    setText('#ueAttached', m.attached);
    setText('#ueConnected', m.connected);
    setText('#ueRogue', m.rogue);
    setText('#ueResultCount', filtered.length + (filtered.length === 1 ? ' UE' : ' UEs'));

    const tbody = $('#ueTable tbody');
    if (tbody) {
      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="feed-empty">No virtual UEs match the current filters.</td></tr>';
      } else {
        tbody.innerHTML = filtered.map((ue) => `
          <tr data-ue-id="${esc(ue.id)}" class="${ue.state === 'rogue' ? 'is-rogue' : ''}">
            <td>${ueIdentity(ue)}</td>
            <td class="mono">${esc(ue.imsi)}</td>
            <td class="mono">${esc(ue.msisdn)}</td>
            <td>${stateBadge(ue)}</td>
            <td class="mono">${esc(ue.serving)}</td>
            <td><span class="mono">${ue.rsrp.toFixed(0)} dBm</span><span class="subline">SINR ${ue.sinr.toFixed(1)} dB · CQI ${ue.cqi}</span></td>
            <td><span class="mono">${ue.dl ? ue.dl.toFixed(1) : '0.0'} / ${ue.ul ? ue.ul.toFixed(1) : '0.0'}</span><span class="subline">Mbps</span></td>
            <td>${securityBadge(ue)}</td>
            <td><span class="mono">${esc(ue.lastProcedure)}</span><span class="subline">${fmtTime(ue.lastSeen)} UTC</span></td>
            <td><button class="table-action" data-trace="${esc(ue.id)}" type="button">Trace</button></td>
          </tr>
        `).join('');
      }
    }

    const typeCounts = {};
    state.ues.forEach((ue) => { typeCounts[ue.type] = (typeCounts[ue.type] || 0) + 1; });
    const maxType = Math.max(1, ...Object.values(typeCounts));
    const typeColors = { Smartphone: '', CPE: '', IoT: 'rose', Tablet: '' };
    const composition = $('#fleetComposition');
    if (composition) {
      composition.innerHTML = Object.entries(typeCounts).map(([type, count]) => `
        <div class="hbar-row">
          <span class="hbar-name">${esc(type)}</span>
          <span class="hbar-track"><i class="hbar-fill ${typeColors[type] || ''}" style="width:${(count / maxType) * 100}%"></i></span>
          <span class="hbar-val">${count} · ${Math.round((count / m.total) * 100)}%</span>
        </div>
      `).join('');
    }

    const protectedCount = state.ues.filter((ue) => ue.state !== 'rogue' && ue.security.startsWith('EPS-AKA')).length;
    const exposedCount = state.ues.filter((ue) => ue.state === 'rogue').length;
    const noneCount = Math.max(0, m.total - protectedCount - exposedCount);
    const pct = m.total ? (protectedCount / m.total) * 100 : 0;
    const donut = $('#securityDonut');
    if (donut) donut.style.setProperty('--p', pct.toFixed(1));
    setText('#securityPct', Math.round(pct) + '%');
    const summary = $('#securitySummary');
    if (summary) {
      summary.innerHTML = `
        <div class="sec-row"><span><i class="sec-dot teal"></i>EPS-AKA protected</span><b>${protectedCount}</b></div>
        <div class="sec-row"><span><i class="sec-dot rose"></i>Identity exposed</span><b>${exposedCount}</b></div>
        <div class="sec-row"><span><i class="sec-dot muted"></i>No active session</span><b>${noneCount}</b></div>
      `;
    }
  }

  function initBusinessControls() {
    const wrap = $('#modelControls');
    if (!wrap) return;
    wrap.innerHTML = MODEL_FIELDS.map((field) => `
      <label class="model-field">
        <span>${field.label}<output id="m_${field.key}"></output></span>
        <input type="range" data-model="${field.key}" min="${field.min}" max="${field.max}" step="${field.step}" value="${state.model[field.key]}" aria-label="${field.label}">
        <small class="model-hint">${esc(field.hint)}</small>
      </label>
    `).join('');
    wrap.addEventListener('input', (event) => {
      const input = event.target.closest('input[data-model]');
      if (!input) return;
      state.model[input.dataset.model] = Number(input.value);
      updateBusinessOutputs();
    });
  }

  function syncModelControls() {
    MODEL_FIELDS.forEach((field) => {
      const input = $('input[data-model="' + field.key + '"]');
      if (input) input.value = state.model[field.key];
    });
  }

  function updateBusinessOutputs() {
    const m = modelImpact();
    const model = state.model;
    MODEL_FIELDS.forEach((field) => {
      const output = $('#m_' + field.key);
      if (output) output.textContent = field.fmt(model[field.key]);
    });

    setText('#bcHeroTotal', compactMoney(m.total));
    setText('#bcHeroSub', fmtInt(m.affected) + ' subscribers · ' + model.duration + ' h');
    setText('#bcDonutTotal', compactMoney(m.total));
    setText('#bcCostTag', 'Per incident');

    const heroTags = $('.hero-tags');
    if (heroTags) {
      heroTags.innerHTML = `<span>${model.duration}-hour incident</span><span>${fmtInt(model.zoneSubs)} subscriber zone</span><span>${Number(model.annualIncidents).toFixed(1)} incidents / year</span><span>${model.effectiveness}% detection effectiveness</span>`;
    }

    const narrative = `One ${model.duration}-hour rogue-cell incident across ${fmtInt(model.zoneSubs)} subscribers could create ${fmtMoney(m.total)} in direct and indirect cost. At ${Number(model.annualIncidents).toFixed(1)} modeled incidents per year and ${model.effectiveness}% detection effectiveness, VCSS avoids ${fmtMoney(m.avoided)} and delivers ${fmtMoney(m.net)} of net benefit in year one.`;
    setText('#bcNarrative', narrative);

    const total = Math.max(1, m.total);
    let cursor = 0;
    const stops = m.categories.map((cat) => {
      const start = cursor;
      cursor += (cat.value / total) * 100;
      return cat.color + ' ' + start.toFixed(2) + '% ' + cursor.toFixed(2) + '%';
    });
    const donut = $('#bcDonut');
    if (donut) donut.style.background = 'conic-gradient(' + stops.join(', ') + ')';

    const legend = $('#bcLegend');
    if (legend) {
      legend.innerHTML = m.categories.map((cat) => `
        <div class="legend-row">
          <i class="legend-swatch" style="background:${cat.color}"></i>
          <span class="legend-name">${cat.label}</span>
          <span class="legend-val">${compactMoney(cat.value)}</span>
        </div>
      `).join('');
    }

    const maxCat = Math.max(1, ...m.categories.map((c) => c.value));
    const bars = $('#bcBars');
    if (bars) {
      bars.innerHTML = m.categories.map((cat) => `
        <div class="hbar-row">
          <span class="hbar-name">${cat.label}</span>
          <span class="hbar-track"><i class="hbar-fill" style="width:${(cat.value / maxCat) * 100}%;background:linear-gradient(90deg,${cat.color},${cat.color}aa)"></i></span>
          <span class="hbar-val">${compactMoney(cat.value)}</span>
        </div>
      `).join('');
    }

    setText('#bcNet', (m.net >= 0 ? '' : '−') + compactMoney(Math.abs(m.net)));
    setText('#bcRoi', Math.round(m.roi) + '% ROI');
    setText('#bcAvoided', compactMoney(m.avoided));
    setText('#bcProgram', compactMoney(model.program));
    setText('#bcPayback', m.payback ? m.payback.toFixed(1) + ' months' : '—');
    setText('#bcResidual', compactMoney(m.residual));
    const netEl = $('#bcNet');
    if (netEl) netEl.classList.toggle('danger-text', m.net < 0);
    setText('#bcRoiNote', `Each additional point of detection effectiveness avoids about ${compactMoney(m.annualTotal / 100)} per year at the modeled incident frequency. Residual annual risk is ${compactMoney(m.residual)}.`);

    const without = m.annualTotal;
    const withProgram = m.withProgram;
    const scale = Math.max(without, withProgram, 1);
    const compare = $('#bcCompare');
    if (compare) {
      compare.innerHTML = `
        <div class="compare-row">
          <span class="compare-label">Without VCSS</span>
          <span class="compare-track"><i class="compare-fill" style="width:${(without / scale) * 100}%"></i></span>
          <span class="compare-val">${compactMoney(without)}</span>
        </div>
        <div class="compare-row">
          <span class="compare-label">With VCSS</span>
          <span class="compare-track"><i class="compare-fill good" style="width:${(withProgram / scale) * 100}%"></i></span>
          <span class="compare-val">${compactMoney(withProgram)}</span>
        </div>
        <div class="compare-row">
          <span class="compare-label">Net savings</span>
          <span class="compare-track"><i class="compare-fill good" style="width:${(Math.max(0, without - withProgram) / scale) * 100}%"></i></span>
          <span class="compare-val">${compactMoney(without - withProgram)}</span>
        </div>
      `;
    }

    const callout = $('#bcCallout');
    if (callout) {
      callout.innerHTML = `<svg class="icon"><use href="#i-shield"></use></svg><span><b>Board message:</b> at ${Number(state.model.annualIncidents).toFixed(1)} modeled incidents per year, a validated rogue-cell detection program turns ${compactMoney(m.annualTotal)} of annual exposure into ${compactMoney(withProgram)} of residual risk plus program cost — a ${compactMoney(without - withProgram)} annual improvement at the modeled assumptions.</span>`;
    }
  }

  /* ==========================================================================
     Signaling procedures
     ========================================================================== */

  const LTE_LANES = [
    { name: 'UE', sub: 'Virtual subscriber' },
    { name: 'eNodeB', sub: 'VCSS-ENB-0417' },
    { name: 'MME', sub: 'EPC control plane' },
    { name: 'HSS', sub: 'S6a subscriber DB' },
    { name: 'S/P-GW', sub: 'GTP-C / user plane' },
  ];
  const ROGUE_LANES = [
    { name: 'UE', sub: 'Virtual subscriber' },
    { name: 'Fake eNB', sub: 'GhostCell-01' },
    { name: 'MNO MME', sub: 'EPC control plane' },
    { name: 'HSS', sub: 'S6a subscriber DB' },
    { name: 'S/P-GW', sub: 'GTP-C / user plane' },
  ];
  const st = (from, to, proto, name, desc, ies, ref, note = '') => ({ from, to, proto, name, desc, ies, ref, note });

  const PROCEDURES = {
    attach: {
      title: 'Initial EPS attach',
      tag: 'TRC-8F21',
      lanes: LTE_LANES,
      steps: [
        st(0, 1, 'RRC', 'RRC Connection Request', 'UE completes random access and asks VCSS for an RRC connection. Establishment cause is mobile-originated signalling.', [['ue-Identity', 'randomValue'], ['establishmentCause', 'mo-Signalling']], '3GPP TS 36.331 §5.3.3'),
        st(1, 0, 'RRC', 'RRC Connection Setup', 'VCSS assigns SRB1, a C-RNTI and the initial PHY/MAC configuration.', [['rrc-TransactionIdentifier', '0'], ['radioResourceConfigDedicated', 'SRB1'], ['c-rnti', '0x4A17']], '3GPP TS 36.331 §5.3.3'),
        st(0, 1, 'NAS', 'RRC Setup Complete + Attach Request', 'UE confirms SRB1 and encapsulates the NAS Attach Request. EPS attach type = EPS attach.', [['selectedPLMN-Identity', '001-01'], ['EPS Attach Type', 'EPS attach'], ['PDN Type', 'IPv4v6']], '3GPP TS 24.301 §5.5.1'),
        st(1, 2, 'S1AP', 'S1AP Initial UE Message', 'VCSS forwards the NAS PDU to the MME over S1-MME with the eNB UE S1AP ID and TAI.', [['eNB-UE-S1AP-ID', '10417'], ['NAS-PDU', 'Attach Request'], ['TAI', '001-01 / 4102']], '3GPP TS 36.413 §8.6.1'),
        st(2, 0, 'NAS', 'NAS Identity Request', 'MME requests the IMSI because no valid GUTI is available. Identity type = IMSI.', [['EPS Identity Type', 'IMSI']], '3GPP TS 24.301 §5.4.3'),
        st(0, 2, 'NAS', 'NAS Identity Response', 'Virtual UE returns its synthetic test IMSI. On a managed network this exchange is protected after the first attach.', [['EPS Mobile Identity', 'IMSI 00101…']], '3GPP TS 24.301 §5.4.3'),
        st(2, 3, 'S6a', 'S6a Authentication Information Request', 'MME retrieves EPS authentication vectors from the HSS for the subscriber.', [['IMSI', '00101…'], ['Number-of-Requested-Vectors', '1'], ['Visited-PLMN-Id', '001-01']], '3GPP TS 29.272 §7.2.5'),
        st(3, 2, 'S6a', 'S6a Authentication Information Answer', 'HSS returns RAND, AUTN, XRES and the KASME-derived E-UTRAN vector.', [['Authentication-Info', 'RAND / AUTN / XRES'], ['E-UTRAN-Vector', 'KASME']], '3GPP TS 29.272 §7.2.5'),
        st(2, 0, 'NAS', 'EPS-AKA Authentication Request', 'MME challenges the UE with RAND and AUTN. The UE verifies the network before responding.', [['RAND', '128-bit'], ['AUTN', '128-bit'], ['NAS key set identifier', 'eKSI 0']], '3GPP TS 33.401 §6.1'),
        st(0, 2, 'NAS', 'Authentication Response', 'UE returns RES; MME compares RES with XRES and derives the NAS and AS keys.', [['Authentication Response Parameter', 'RES']], '3GPP TS 33.401 §6.1'),
        st(2, 0, 'NAS', 'Security Mode Command', 'MME activates NAS integrity and ciphering using the negotiated algorithm set.', [['Selected NAS Security Algorithms', '128-EEA2 / 128-EIA2'], ['UE Security Capability', 'EEA2 / EIA2'], ['eKSI', '0']], '3GPP TS 24.301 §5.4.2'),
        st(0, 2, 'NAS', 'Security Mode Complete', 'UE confirms security activation. Subsequent NAS messages are integrity protected and ciphered.', [['NAS-Message', 'protected']], '3GPP TS 24.301 §5.4.2'),
        st(2, 3, 'S6a', 'Update Location Request', 'MME registers as the serving MME and downloads the subscription profile.', [['IMSI', '00101…'], ['RAT-Type', 'EUTRAN'], ['ULR-Flags', 'S6a indicator']], '3GPP TS 29.272 §7.2.1'),
        st(3, 2, 'S6a', 'Update Location Answer', 'HSS returns subscription data, APN configuration and QoS parameters.', [['Subscription-Data', 'APN / AMBR'], ['APN-Configuration', 'internet.mno']], '3GPP TS 29.272 §7.2.1'),
        st(2, 4, 'GTP-C', 'Create Session Request', 'MME creates the default EPS bearer for APN internet.mno through the S/P-GW.', [['IMSI', '00101…'], ['APN', 'internet.mno'], ['EPS Bearer ID', '5'], ['S5/S8 TEID', 'allocated']], '3GPP TS 29.274 §7.2.1'),
        st(4, 2, 'GTP-C', 'Create Session Response', 'S/P-GW allocates the UE IP address and returns the default bearer parameters.', [['Cause', 'Request accepted'], ['PDN Address Allocation', '10.42.x.x'], ['S5/S8 TEID', 'allocated']], '3GPP TS 29.274 §7.2.1'),
        st(2, 1, 'S1AP', 'Initial Context Setup + Attach Accept', 'MME sends Attach Accept, GUTI and the default bearer context. VCSS sets up SRB2 and DRB1.', [['MME-UE-S1AP-ID', '22017'], ['E-RAB Setup List', 'ID 5'], ['NAS-PDU', 'Attach Accept']], '3GPP TS 36.413 §8.3.1'),
        st(0, 2, 'NAS', 'Attach Complete + RRC Reconfiguration Complete', 'UE applies the radio bearer configuration and confirms the default bearer.', [['RRCConnectionReconfigurationComplete', 'SRB2 / DRB1'], ['NAS Attach Complete', 'EPS Bearer ID 5']], '3GPP TS 24.301 §5.5.1'),
        st(1, 2, 'S1AP', 'Initial Context Setup Response', 'VCSS confirms the E-RAB setup. The UE can now send uplink data.', [['E-RAB Setup List', 'success'], ['S1AP Cause', 'success']], '3GPP TS 36.413 §8.3.2'),
      ],
    },
    service: {
      title: 'Service request',
      tag: 'TRC-4B02',
      lanes: LTE_LANES,
      steps: [
        st(0, 1, 'RRC', 'RRC Connection Request', 'Idle UE requests an RRC connection to send uplink data or signalling.', [['establishmentCause', 'mo-Data'], ['ue-Identity', 'randomValue']], '3GPP TS 36.331 §5.3.3'),
        st(1, 0, 'RRC', 'RRC Connection Setup', 'VCSS assigns SRB1 and a temporary C-RNTI.', [['c-rnti', '0x4B22'], ['radioResourceConfigDedicated', 'SRB1']], '3GPP TS 36.331 §5.3.3'),
        st(0, 1, 'NAS', 'RRC Setup Complete + Service Request', 'UE requests restoration of its EPS bearer context using the existing GUTI and security context.', [['Service Type', 'mobile originated'], ['GUTI', 'valid'], ['EPS Bearer ID', '5']], '3GPP TS 24.301 §5.6.1'),
        st(1, 2, 'S1AP', 'S1AP Initial UE Message', 'VCSS forwards the Service Request to the MME over S1-MME.', [['eNB-UE-S1AP-ID', '10422'], ['NAS-PDU', 'Service Request'], ['TAI', '4102']], '3GPP TS 36.413 §8.6.1'),
        st(2, 1, 'S1AP', 'Initial Context Setup Request', 'MME restores the UE context and asks VCSS to set up the E-RAB.', [['E-RAB to be Setup', 'ID 5'], ['UE Security Capabilities', 'EEA2 / EIA2'], ['NAS-PDU', 'Service Accept']], '3GPP TS 36.413 §8.3.1'),
        st(1, 0, 'RRC', 'RRC Connection Reconfiguration', 'VCSS configures DRB1 and maps the EPS bearer to the radio bearer.', [['drb-ToAddMod', 'DRB1'], ['logicalChannelConfig', 'QCI 9']], '3GPP TS 36.331 §5.3.5'),
        st(0, 1, 'RRC', 'RRC Reconfiguration Complete', 'UE confirms the radio bearer configuration.', [['rrc-TransactionIdentifier', '1']], '3GPP TS 36.331 §5.3.5'),
        st(1, 2, 'S1AP', 'Initial Context Setup Response', 'VCSS confirms E-RAB setup and the user plane is restored.', [['E-RAB Setup List', 'success'], ['S1AP Cause', 'success']], '3GPP TS 36.413 §8.3.2'),
        st(2, 4, 'GTP-C', 'Modify Bearer Request', 'MME updates the S/P-GW with the eNB TEID for the restored bearer.', [['EPS Bearer ID', '5'], ['eNB TEID', 'allocated']], '3GPP TS 29.274 §7.2.7'),
        st(4, 2, 'GTP-C', 'Modify Bearer Response', 'S/P-GW confirms the path update and downlink data can resume.', [['Cause', 'Request accepted']], '3GPP TS 29.274 §7.2.7'),
      ],
    },
    tau: {
      title: 'Tracking area update',
      tag: 'TRC-7C14',
      lanes: LTE_LANES,
      steps: [
        st(0, 1, 'RRC', 'RRC Connection Request', 'UE detects a new TAI and starts a tracking area update procedure.', [['establishmentCause', 'mo-Signalling'], ['ue-Identity', 'randomValue']], '3GPP TS 36.331 §5.3.3'),
        st(1, 0, 'RRC', 'RRC Connection Setup', 'VCSS establishes SRB1 for the NAS TAU exchange.', [['c-rnti', '0x4C08'], ['radioResourceConfigDedicated', 'SRB1']], '3GPP TS 36.331 §5.3.3'),
        st(0, 1, 'NAS', 'RRC Setup Complete + TAU Request', 'UE reports the new TAI and its EPS update type.', [['EPS Update Type', 'TA updating'], ['Old GUTI', 'valid'], ['Last visited TAI', '4101']], '3GPP TS 24.301 §5.5.3'),
        st(1, 2, 'S1AP', 'S1AP Initial UE Message', 'VCSS forwards the TAU Request to the MME.', [['NAS-PDU', 'TAU Request'], ['TAI', '001-01 / 4102']], '3GPP TS 36.413 §8.6.1'),
        st(2, 3, 'S6a', 'Update Location Request', 'MME updates the serving node and requests the current subscription profile.', [['IMSI', '00101…'], ['RAT-Type', 'EUTRAN'], ['ULR-Flags', 'initial attach']], '3GPP TS 29.272 §7.2.1'),
        st(3, 2, 'S6a', 'Update Location Answer', 'HSS confirms the location update and returns subscription data.', [['Subscription-Data', 'current'], ['ULA-Flags', 'accepted']], '3GPP TS 29.272 §7.2.1'),
        st(2, 0, 'NAS', 'TAU Accept', 'MME accepts the update and may allocate a new GUTI.', [['EPS Update Result', 'TA updated'], ['GUTI', 'reallocated']], '3GPP TS 24.301 §5.5.3'),
        st(0, 2, 'NAS', 'TAU Complete', 'UE confirms the new GUTI. The update is complete.', [['EPS Mobile Identity', 'new GUTI']], '3GPP TS 24.301 §5.5.3'),
        st(2, 1, 'S1AP', 'UE Context Release Command', 'MME asks VCSS to release the signalling connection after the update.', [['MME-UE-S1AP-ID', '22017'], ['Cause', 'normal release']], '3GPP TS 36.413 §8.3.4'),
        st(1, 2, 'S1AP', 'UE Context Release Complete', 'VCSS releases the UE context and the UE returns to ECM-IDLE.', [['eNB-UE-S1AP-ID', '10417']], '3GPP TS 36.413 §8.3.5'),
      ],
    },
    detach: {
      title: 'UE detach',
      tag: 'TRC-2D09',
      lanes: LTE_LANES,
      steps: [
        st(0, 1, 'NAS', 'Detach Request', 'UE requests a normal detach. The NAS message is carried in RRC uplink information.', [['Detach Type', 'EPS detach'], ['Switch Off', 'false']], '3GPP TS 24.301 §5.5.2'),
        st(1, 2, 'S1AP', 'S1AP Uplink NAS Transport', 'VCSS forwards the Detach Request to the MME.', [['NAS-PDU', 'Detach Request'], ['eNB-UE-S1AP-ID', '10417']], '3GPP TS 36.413 §8.6.2'),
        st(2, 4, 'GTP-C', 'Delete Session Request', 'MME deletes the default bearer and releases the UE IP address.', [['EPS Bearer ID', '5'], ['Linked EPS Bearer ID', '5']], '3GPP TS 29.274 §7.2.4'),
        st(4, 2, 'GTP-C', 'Delete Session Response', 'S/P-GW confirms the session deletion and frees the TEID.', [['Cause', 'Request accepted']], '3GPP TS 29.274 §7.2.4'),
        st(2, 0, 'NAS', 'Detach Accept', 'MME confirms the detach to the UE.', [['NAS-Message', 'Detach Accept']], '3GPP TS 24.301 §5.5.2'),
        st(2, 1, 'S1AP', 'UE Context Release Command', 'MME asks VCSS to release the S1 and radio resources.', [['Cause', 'detach']], '3GPP TS 36.413 §8.3.4'),
        st(1, 0, 'RRC', 'RRC Connection Release', 'VCSS releases the RRC connection. The UE is now detached.', [['releaseCause', 'other']], '3GPP TS 36.331 §5.3.8'),
      ],
    },
    rogue: {
      title: 'Rogue attach / IMSI exposure',
      tag: 'TRC-RG41',
      lanes: ROGUE_LANES,
      steps: [
        st(1, 0, 'RRC', 'SIB1 broadcast — cloned PLMN', 'A simulated rogue eNB advertises the MNO PLMN with a stronger signal and an unexpected TAC. Virtual UEs evaluate reselection.', [['PLMN', '001-01 (cloned)'], ['TAC', '9999'], ['PCI', '412'], ['cellBarred', 'false']], '3GPP TS 36.331 §5.2.1'),
        st(0, 1, 'RRC', 'RRC Connection Request', 'A virtual UE reselects to the rogue cell and requests an RRC connection.', [['establishmentCause', 'mo-Signalling'], ['ue-Identity', 'randomValue']], '3GPP TS 36.331 §5.3.3', 'The rogue cell is not in the MNO ANR or eNB inventory.'),
        st(1, 0, 'RRC', 'RRC Connection Setup', 'The rogue cell accepts the UE without an authenticated S1 association.', [['c-rnti', '0xBAD1'], ['radioResourceConfigDedicated', 'SRB1']], '3GPP TS 36.331 §5.3.3', 'A managed eNB would have a valid S1-MME association first.'),
        st(0, 1, 'NAS', 'Attach Request', 'UE starts an attach toward the rogue cell. The core network is not reachable from this cell.', [['EPS Attach Type', 'EPS attach'], ['PDN Type', 'IPv4v6']], '3GPP TS 24.301 §5.5.1'),
        st(1, 0, 'NAS', 'Identity Request — IMSI', 'The rogue cell requests the IMSI before NAS security is established.', [['EPS Identity Type', 'IMSI']], '3GPP TS 24.301 §5.4.3', 'This is the primary identity-exposure signal in the demo.'),
        st(0, 1, 'NAS', 'Identity Response — IMSI exposed', 'The virtual UE discloses its synthetic IMSI to the unverified cell.', [['EPS Mobile Identity', 'IMSI 00101…']], '3GPP TS 24.301 §5.4.3', 'Synthetic data only. The IMSI is not tied to a real subscriber.'),
        st(1, 2, 'S1AP', 'S1 Setup Request — unmanaged eNB', 'The rogue cell attempts to reach the MNO core. Its S1 source address is not in the managed inventory.', [['eNB-Identity', 'unknown'], ['Source IP', '10.66.42.9']], '3GPP TS 36.413 §8.7.1', 'The MNO core has no record of this eNB.'),
        st(2, 1, 'S1AP', 'S1 Setup Failure', 'The MME rejects the unmanaged S1 association. No default bearer can be established.', [['Cause', 'unknown eNB'], ['S1AP Outcome', 'failure']], '3GPP TS 36.413 §8.7.2'),
        st(1, 0, 'RRC', 'UE stranded — no service', 'The UE remains camped on the rogue cell with no data bearer. The MNO has no S1 context and no service visibility.', [['RRC State', 'connected'], ['EPS Bearer', 'none']], '3GPP TS 36.331 §5.3.8', 'Detection must come from RF monitoring and NMS correlation, not the core alone.'),
      ],
    },
  };

  function protocolClass(proto) {
    if (proto === 'S6a') return 's6a';
    if (proto === 'GTP-C') return 'gtp';
    if (proto === 'S1AP') return 's1ap';
    if (proto === 'NAS') return 'nas';
    return 'rrc';
  }

  function initSignaling() {
    if (state.trace.built) return;
    state.trace.built = true;
    const bar = $('#procedureBar');
    if (bar) {
      bar.addEventListener('click', (event) => {
        const button = event.target.closest('[data-procedure]');
        if (!button) return;
        setProcedure(button.dataset.procedure);
      });
    }
    $('#tracePlay')?.addEventListener('click', toggleTrace);
    $('#traceNext')?.addEventListener('click', () => {
      stopTrace();
      stepTrace(state.trace.step + 1);
    });
    $('#traceReset')?.addEventListener('click', resetTrace);
    $('#traceSpeed')?.addEventListener('change', (event) => {
      state.trace.speed = Number(event.target.value);
    });
    $('#traceUeSelect')?.addEventListener('change', (event) => {
      state.trace.ueId = event.target.value;
      setText('#traceUe', state.trace.ueId);
      resetTrace();
    });
    setProcedure('attach');
  }

  function setProcedure(key) {
    if (!PROCEDURES[key]) return;
    stopTrace();
    state.trace.procedure = key;
    state.trace.step = -1;
    const proc = PROCEDURES[key];
    const rogueUE = state.ues.find((u) => u.state === 'rogue');
    if (!state.trace.ueId || !state.ues.some((u) => u.id === state.trace.ueId)) {
      state.trace.ueId = key === 'rogue' && rogueUE ? rogueUE.id : (state.ues[0]?.id || 'UE-001');
    }
    if (key === 'rogue' && rogueUE) state.trace.ueId = rogueUE.id;
    $$('#procedureBar [data-procedure]').forEach((button) => {
      const active = button.dataset.procedure === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    setText('#traceTitle', proc.title);
    setText('#traceId', proc.tag);
    setText('#traceUe', state.trace.ueId);
    updateTraceSubjectOptions();
    buildLadder();
    setTraceStatus(key === 'rogue' ? 'Suspicious' : 'Ready');
    setText('#traceCount', '0 / ' + proc.steps.length);
    setTraceLog(-1);
    setInspector(-1);
    updateTraceButtons();
  }

  function updateTraceSubjectOptions() {
    const select = $('#traceUeSelect');
    if (!select) return;
    const current = state.trace.ueId;
    select.innerHTML = state.ues.map((ue) => `<option value="${esc(ue.id)}">${esc(ue.id)} · ${esc(ue.imsi.slice(-6))}</option>`).join('');
    if (current && state.ues.some((u) => u.id === current)) select.value = current;
  }

  function traceSteps() {
    const proc = PROCEDURES[state.trace.procedure];
    if (state.trace.procedure !== 'rogue' || !state.rogue) return proc.steps;
    return proc.steps.map((step, index) => {
      if (index !== 0) return step;
      const ies = step.ies.map(([key, value]) => {
        if (key === 'TAC') return [key, String(state.rogue.tac)];
        if (key === 'PCI') return [key, String(state.rogue.pci)];
        return [key, value];
      });
      return { ...step, ies };
    });
  }

  function traceLanes() {
    const proc = PROCEDURES[state.trace.procedure];
    if (state.trace.procedure !== 'rogue') return proc.lanes;
    return proc.lanes.map((lane, index) => index === 1
      ? { ...lane, sub: state.rogue?.name || 'Simulated fake eNB' }
      : lane);
  }

  function buildLadder() {
    const proc = PROCEDURES[state.trace.procedure];
    const header = $('#laneHeader');
    const ladder = $('#ladder');
    if (!header || !ladder) return;
    const lanes = traceLanes();
    header.innerHTML = lanes.map((lane) => `<div class="lane"><b>${esc(lane.name)}</b><span>${esc(lane.sub)}</span></div>`).join('');
    const count = proc.lanes.length;
    const center = (index) => ((index + 0.5) / count) * 100;
    ladder.innerHTML = traceSteps().map((step, index) => {
      const a = center(step.from);
      const b = center(step.to);
      const left = Math.min(a, b);
      const width = Math.abs(b - a);
      const dir = b < a ? 'dir-left' : '';
      const nas = step.proto === 'NAS' && Math.abs(step.to - step.from) > 1 ? 'nas' : '';
      const rogue = state.trace.procedure === 'rogue' ? 'rogue' : '';
      return `<div class="sig-row ${nas} ${rogue} ${dir}" data-step="${index}" style="--left:${left}%;--width:${width}%">
        <span class="sig-num">${pad(index + 1)}</span>
        <span class="sig-line"></span>
        <span class="sig-arrow"></span>
        <span class="sig-label"><span class="proto proto-${protocolClass(step.proto)}">${esc(step.proto)}</span>${esc(step.name)}</span>
      </div>`;
    }).join('');
    ladder.onclick = (event) => {
      const row = event.target.closest('.sig-row');
      if (!row) return;
      stopTrace();
      stepTrace(Number(row.dataset.step));
    };
  }

  function setTraceStatus(label) {
    const el = $('#traceStatus');
    if (!el) return;
    el.textContent = label;
    el.className = state.trace.procedure === 'rogue' || label === 'Suspicious' ? 'danger-text' : label === 'Complete' ? 'ok' : '';
  }

  function stepTrace(n) {
    const proc = PROCEDURES[state.trace.procedure];
    const max = proc.steps.length - 1;
    const next = clamp(n, -1, max);
    state.trace.step = next;
    $$('#ladder .sig-row').forEach((row, index) => {
      row.classList.toggle('done', index < next);
      row.classList.toggle('active', index === next);
    });
    setInspector(next);
    setTraceLog(next);
    setText('#traceCount', (next + 1) + ' / ' + proc.steps.length);
    if (next < 0) {
      setTraceStatus(state.trace.procedure === 'rogue' ? 'Suspicious' : 'Ready');
    } else if (state.trace.playing) {
      setTraceStatus('Running');
    } else if (next === max) {
      setTraceStatus('Complete');
    } else {
      setTraceStatus('Paused');
    }
    if (next >= 0) {
      const active = $('#ladder .sig-row.active');
      const ladder = $('#ladder');
      if (active && ladder) {
        const top = active.offsetTop - ladder.clientHeight / 2;
        ladder.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }
  }

  function setInspector(index) {
    const proc = PROCEDURES[state.trace.procedure];
    const step = traceSteps()[index];
    const title = $('#inspectorTitle');
    const proto = $('#inspectorProto');
    const body = $('#messageInspector');
    if (!body) return;
    if (!step) {
      if (title) title.textContent = 'Select a message';
      if (proto) proto.textContent = '—';
      body.innerHTML = `<div class="inspector-empty"><svg class="icon"><use href="#i-terminal"></use></svg>Select a message in the ladder or play the trace to inspect decoded fields.</div>`;
      return;
    }
    if (title) title.textContent = step.name;
    if (proto) {
      proto.textContent = step.proto;
      proto.className = 'proto-badge proto-' + protocolClass(step.proto);
    }
    const route = `${esc(proc.lanes[step.from].name)} <span class="route-arrow">→</span> ${esc(proc.lanes[step.to].name)}`;
    const ies = step.ies.map(([key, value]) => `<tr><td>${esc(key)}</td><td>${esc(value)}</td></tr>`).join('');
    body.innerHTML = `
      <div class="inspector-step"><b>${pad(index + 1)}</b><span>${esc(proc.title)}</span></div>
      <div class="inspector-name">${esc(step.name)}</div>
      <div class="inspector-route"><span class="route-chip">${esc(proc.lanes[step.from].name)}</span><span class="route-arrow">→</span><span class="route-chip">${esc(proc.lanes[step.to].name)}</span></div>
      <p class="inspector-desc">${esc(step.desc)}</p>
      <table class="ie-table"><caption class="sr-only">Signaling information elements for the selected step</caption><thead><tr><th scope="col">Information element</th><th scope="col">Value</th></tr></thead><tbody>${ies}</tbody></table>
      <div class="ref-line">${esc(step.ref)}</div>
      ${step.note ? `<div class="security-note">${esc(step.note)}</div>` : ''}
    `;
    if (state.trace.procedure === 'rogue') {
      const routeEl = body.querySelector('.inspector-route');
      if (routeEl) routeEl.insertAdjacentHTML('beforeend', '<span class="route-arrow">·</span><span class="route-chip" style="color:var(--rose)">suspicious</span>');
    }
    void route;
  }

  function traceSeconds(index) {
    const total = Math.max(0, (index + 1) * 0.9);
    return 'T+' + pad(Math.floor(total / 60)) + ':' + pad(Math.floor(total % 60)) + '.' + Math.round((total % 1) * 10);
  }

  function setTraceLog(index) {
    const log = $('#traceLog');
    if (!log) return;
    if (index < 0) {
      log.innerHTML = '<span class="log-time">[idle]</span> Select a procedure and press play to begin.';
      return;
    }
    const proc = PROCEDURES[state.trace.procedure];
    const lines = [];
    for (let i = 0; i <= index; i += 1) {
      const step = proc.steps[i];
      const from = proc.lanes[step.from].name;
      const to = proc.lanes[step.to].name;
      const bad = state.trace.procedure === 'rogue' && i >= 4 ? 'log-bad' : '';
      lines.push(`<span class="log-time">[${traceSeconds(i)}]</span> <span class="${bad}">${esc(from)} <span class="log-arrow">→</span> ${esc(to)}</span>  <span class="log-proto">${esc(step.proto)}</span>  ${esc(step.name)}`);
    }
    if (index === proc.steps.length - 1) lines.push('<span class="log-ok">[complete] procedure trace finished · synthetic data</span>');
    log.innerHTML = lines.join('\n');
    log.scrollTop = log.scrollHeight;
  }

  function updateTraceButtons() {
    const play = $('#tracePlay');
    if (play) {
      play.innerHTML = state.trace.playing
        ? '<svg class="icon"><use href="#i-pause"></use></svg>'
        : '<svg class="icon"><use href="#i-play"></use></svg>';
      play.classList.toggle('active', state.trace.playing);
      play.setAttribute('aria-label', state.trace.playing ? 'Pause trace' : 'Play trace');
    }
    const globalPlay = $('#playTraceBtn');
    if (globalPlay) {
      const span = globalPlay.querySelector('span');
      if (span) span.textContent = state.trace.playing ? 'Pause trace' : 'Play trace';
      globalPlay.setAttribute('aria-label', state.trace.playing ? 'Pause trace' : 'Play trace');
    }
  }

  function startTrace() {
    const proc = PROCEDURES[state.trace.procedure];
    if (state.trace.step >= proc.steps.length - 1) stepTrace(-1);
    if (state.trace.playing) return;
    state.trace.playing = true;
    updateTraceButtons();
    setTraceStatus('Running');
    const tick = () => {
      if (!state.trace.playing) return;
      const next = state.trace.step + 1;
      if (next >= proc.steps.length) {
        stopTrace();
        setTraceStatus('Complete');
        addEvent(state.trace.procedure === 'rogue' ? 'crit' : 'ok', state.trace.procedure === 'rogue' ? 'Rogue attach trace captured' : 'Signaling trace completed', proc.title + ' · ' + proc.steps.length + ' messages · synthetic UE data');
        showToast(state.trace.procedure === 'rogue' ? 'Rogue attach trace complete — IMSI exposure recorded.' : 'Attach trace complete.', state.trace.procedure === 'rogue' ? 'bad' : 'ok');
        return;
      }
      stepTrace(next);
      state.trace.timer = setTimeout(tick, state.trace.speed);
    };
    state.trace.timer = setTimeout(tick, 500);
  }

  function stopTrace(update = true) {
    if (state.trace.timer) clearTimeout(state.trace.timer);
    state.trace.timer = null;
    state.trace.playing = false;
    if (update) updateTraceButtons();
  }

  function toggleTrace() {
    if (state.trace.playing) {
      stopTrace();
      setTraceStatus(state.trace.step >= 0 ? 'Paused' : 'Ready');
    } else {
      startTrace();
    }
  }

  function resetTrace() {
    stopTrace();
    stepTrace(-1);
    setTraceLog(-1);
    setInspector(-1);
    setText('#traceCount', '0 / ' + PROCEDURES[state.trace.procedure].steps.length);
    setTraceStatus(state.trace.procedure === 'rogue' ? 'Suspicious' : 'Ready');
    updateTraceButtons();
  }

  /* ==========================================================================
     Fake BTS scenario
     ========================================================================== */

  function renderRogueView() {
    const empty = $('#rogueEmpty');
    const active = $('#rogueActive');
    if (!empty || !active) return;
    if (!state.rogue) {
      empty.hidden = false;
      active.hidden = true;
      empty.innerHTML = `
        <div class="empty-rogue card">
          <div class="empty-copy">
            <span class="eyebrow rose"><i></i> Incident rehearsal</span>
            <h2>Add a fake BTS. See what the MNO cannot see.</h2>
            <p>Deploy a simulated rogue LTE cell inside the VCSS test range. Virtual UEs reselect, identity exposure appears in the trace, and the incident is translated into subscriber, revenue and churn impact.</p>
            <div class="empty-actions">
              <button class="btn btn-rogue" type="button" data-action="deploy"><svg class="icon"><use href="#i-plus"></use></svg>Configure fake BTS</button>
              <button class="btn btn-outline" type="button" data-action="business"><svg class="icon"><use href="#i-signal"></use></svg>Open business case</button>
            </div>
            <div class="empty-features">
              <span class="empty-feature"><svg class="icon"><use href="#i-radio"></use></svg>RF anomaly</span>
              <span class="empty-feature"><svg class="icon"><use href="#i-eye"></use></svg>IMSI exposure</span>
              <span class="empty-feature"><svg class="icon"><use href="#i-users"></use></svg>Reselection cluster</span>
              <span class="empty-feature"><svg class="icon"><use href="#i-signal"></use></svg>MNO impact</span>
            </div>
          </div>
          <div class="radar-visual" aria-hidden="true">
            <div class="radar-sweep"></div>
            <span class="radar-blip b1"></span><span class="radar-blip b2"></span><span class="radar-blip b3"></span>
            <div class="radar-tower"><svg class="icon"><use href="#i-tower"></use></svg></div>
            <span class="radar-label">NO ROGUE CELL DETECTED</span>
          </div>
        </div>
      `;
      return;
    }

    empty.hidden = true;
    active.hidden = false;
    const incident = state.incident || {};
    const contained = !!incident.contained;
    const running = state.containmentRunning;
    const m = getMetrics();
    const impact = modelImpact();
    const rogueUEs = state.ues.filter((u) => u.state === 'rogue');
    const affectedUEs = (incident.affectedIds || [])
      .map((id) => state.ues.find((u) => u.id === id))
      .filter(Boolean);
    const affectedCount = affectedUEs.length || incident.affected || rogueUEs.length;

    setText('#rogueName', state.rogue.name);
    const stateBadgeEl = $('#rogueStateBadge');
    if (stateBadgeEl) {
      stateBadgeEl.className = 'state-badge ' + (contained ? 'online' : 'danger');
      stateBadgeEl.innerHTML = '<i></i>' + (contained ? 'Contained' : 'Broadcasting');
    }

    const banner = $('#rogueBanner');
    if (banner) {
      banner.className = 'alert-banner' + (contained ? ' ok' : '');
      banner.innerHTML = `
        <div class="alert-icon"><svg class="icon"><use href="#${contained ? 'i-check' : 'i-alert'}"></use></svg></div>
        <div class="alert-copy">
          <strong>${contained ? 'Rogue cell contained — evidence preserved' : 'Rogue cell broadcasting · ' + esc(state.rogue.name)}</strong>
          <span>${contained ? `${affectedCount} virtual UEs recovered to the macro layer · drill MTTR ${esc(incident.mttr || 'recording')} · modeled exposure retained for the business case.` : `PCI ${state.rogue.pci} · TAC ${state.rogue.tac} · ${affectedCount} virtual UEs affected · ${fmtMoney(impact.total)} modeled exposure.`}</span>
        </div>
        <div class="alert-actions">
          ${contained
            ? '<button class="btn btn-outline btn-sm" type="button" data-action="reset"><svg class="icon"><use href="#i-reset"></use></svg>Reset scenario</button>'
            : `<button class="btn btn-rogue btn-sm" type="button" data-action="contain" ${running ? 'disabled' : ''}><svg class="icon"><use href="#${running ? 'i-clock' : 'i-shield'}"></use></svg>${running ? 'Containing…' : 'Contain rogue cell'}</button>`}
        </div>
      `;
    }

    const kpis = $('#rogueKpis');
    if (kpis) {
      kpis.innerHTML = `
        <article class="kpi"><div class="kpi-top"><span class="kpi-label">Affected virtual UEs</span><span class="kpi-icon"><svg class="icon"><use href="#i-users"></use></svg></span></div><div class="kpi-value"><span>${affectedCount}</span><small>/ ${m.total}</small></div><div class="kpi-foot"><span>${Math.round((affectedCount / Math.max(1, m.total)) * 100)}% of fleet</span><span class="trend down">${contained ? 'recovered' : 'reselecting'}</span></div><div class="kpi-bar"><i style="width:${((affectedCount / Math.max(1, m.total)) * 100).toFixed(0)}%"></i></div></article>
        <article class="kpi"><div class="kpi-top"><span class="kpi-label">Sessions dropped</span><span class="kpi-icon"><svg class="icon"><use href="#i-activity"></use></svg></span></div><div class="kpi-value"><span>${incident.sessionsDropped || 0}</span><small>RRC</small></div><div class="kpi-foot"><span>Default bearers lost</span><span class="trend down">${contained ? 'restored' : 'active'}</span></div><div class="kpi-bar"><i style="width:${Math.min(100, (incident.sessionsDropped || 0) * 14)}%"></i></div></article>
        <article class="kpi"><div class="kpi-top"><span class="kpi-label">Modeled exposure</span><span class="kpi-icon"><svg class="icon"><use href="#i-signal"></use></svg></span></div><div class="kpi-value"><span>${compactMoney(impact.total)}</span></div><div class="kpi-foot"><span>${state.model.duration} h · ${fmtInt(impact.affected)} subs</span><span class="trend down">business case</span></div><div class="kpi-bar"><i style="width:100%"></i></div></article>
        <article class="kpi"><div class="kpi-top"><span class="kpi-label">Detection confidence</span><span class="kpi-icon"><svg class="icon"><use href="#i-eye"></use></svg></span></div><div class="kpi-value"><span>${incident.detectionConfidence || 0}</span><small>%</small></div><div class="kpi-foot"><span>RF + NMS correlation</span><span class="trend ${contained ? 'up' : ''}">${contained ? 'confirmed' : 'correlating'}</span></div><div class="kpi-bar"><i style="width:${incident.detectionConfidence || 0}%"></i></div></article>
        <article class="kpi"><div class="kpi-top"><span class="kpi-label">NPS impact</span><span class="kpi-icon"><svg class="icon"><use href="#i-users"></use></svg></span></div><div class="kpi-value"><span>${m.nps.toFixed(1)}</span><small>pts</small></div><div class="kpi-foot"><span>Modeled churn risk</span><span class="trend down">${contained ? 'recovering' : 'negative'}</span></div><div class="kpi-bar"><i style="width:${Math.min(100, Math.abs(m.nps) * 8)}%"></i></div></article>
      `;
    }

    const detail = $('#rogueDetail');
    if (detail) {
      detail.innerHTML = `
        <div class="detail-grid">
          <div><span>Cell identity</span><b>${esc(state.rogue.name)}</b></div>
          <div><span>Status</span><b>${contained ? 'Contained' : 'Broadcasting'}</b></div>
          <div><span>PCI</span><b>${state.rogue.pci}</b></div>
          <div><span>TAC</span><b>${state.rogue.tac}</b></div>
          <div><span>Band</span><b>B${state.rogue.band}</b></div>
          <div><span>Tx power</span><b>${state.rogue.power} dBm</b></div>
          <div><span>Cloned PLMN</span><b>001-01</b></div>
          <div><span>Affected UEs</span><b>${affectedCount}</b></div>
        </div>
        <div class="detection-meter">
          <div class="meter-row"><span>Detection confidence</span><b>${incident.detectionConfidence || 0}%</b></div>
          <div class="meter"><i style="width:${incident.detectionConfidence || 0}%"></i></div>
          <div class="meter-row muted"><span>Evidence package</span><b>${contained ? 'preserved' : 'collecting'}</b></div>
        </div>
      `;
    }

    const evidence = $('#rogueEvidence');
    if (evidence) {
      const pciItem = state.rogue.pci === state.cell.pci
        ? ['crit', 'PCI collision with macro layer', `PCI ${state.rogue.pci} duplicates the managed cell; reselection is ambiguous.`]
        : ['crit', 'Unplanned PCI', `PCI ${state.rogue.pci} is absent from the ANR and neighbor plan.`];
      const tacItem = state.rogue.tac === state.cell.tac
        ? ['warn', 'Cloned TAC', `TAC ${state.rogue.tac} matches the macro cell; TAC alone is not sufficient.`]
        : ['warn', 'TAC mismatch', `TAC ${state.rogue.tac} does not match the managed TAC ${state.cell.tac}.`];
      const items = [
        pciItem,
        tacItem,
        ['crit', 'Unmanaged S1 source', 'S1 Setup from 10.66.42.9 is not in the eNB inventory.'],
        ['crit', 'IMSI requested before security', 'Identity request observed before EPS-AKA completion.'],
        ['warn', 'Reselection cluster', contained ? `${affectedCount} UEs were moved to one PCI; all recovered to the macro layer.` : `${rogueUEs.length} UEs moved to one PCI within the observation window.`],
        contained ? ['ok', 'Evidence package preserved', 'RF fingerprint, trace and UE impact are attached to the incident.'] : ['warn', 'PLMN clone detected', 'SIB1 advertises 001-01 with an unexpected timing offset.'],
      ];
      evidence.innerHTML = items.map(([sev, title, text]) => `
        <div class="evidence-item ${sev}"><span class="ev-dot"></span><div><b>${esc(title)}</b><span>${esc(text)}</span></div></div>
      `).join('');
    }

    const impactEl = $('#rogueImpact');
    if (impactEl) {
      const max = Math.max(1, ...impact.categories.map((c) => c.value));
      impactEl.innerHTML = `
        <div class="impact-total"><span>${contained ? 'Incident exposure' : 'Modeled exposure'}</span><b>${compactMoney(impact.total)}</b></div>
        <div class="hbar-list impact-bars">
          ${impact.categories.slice(0, 5).map((cat) => `
            <div class="hbar-row"><span class="hbar-name">${cat.label}</span><span class="hbar-track"><i class="hbar-fill" style="width:${(cat.value / max) * 100}%;background:linear-gradient(90deg,${cat.color},${cat.color}aa)"></i></span><span class="hbar-val">${compactMoney(cat.value)}</span></div>
          `).join('')}
        </div>
        <p class="impact-note">Modeled from the business-case assumptions. Adjust the model in Business case to update this view.</p>
      `;
    }

    const table = $('#rogueUeTable tbody');
    if (table) {
      const tableUEs = affectedUEs.length ? affectedUEs : rogueUEs;
      table.innerHTML = tableUEs.length ? tableUEs.map((ue) => {
        const camped = ue.state === 'rogue';
        return `
        <tr data-ue-id="${esc(ue.id)}" class="${camped ? 'is-rogue' : ''}">
          <td>${ueIdentity(ue)}</td>
          <td class="mono">${esc(ue.imsi)}</td>
          <td><span class="badge badge-muted">${esc(ue.prevState || 'idle')}</span></td>
          <td>${signalMini(ue)}</td>
          <td>${securityBadge(ue)}</td>
          <td><span class="badge ${camped ? 'badge-rogue' : 'badge-connected'}"><i></i>${camped ? 'Camped' : 'Recovered'}</span></td>
        </tr>`;
      }).join('') : '<tr><td colspan="6" class="feed-empty">No virtual UEs are currently attached to the rogue cell.</td></tr>';
    }
    setText('#rogueUeCount', affectedCount + (affectedCount === 1 ? ' UE' : ' UEs'));
    setText('#rogueImpactTag', contained ? 'Incident' : 'Scenario');

    renderContainmentSteps(state.containmentStep || 0);
    const topo = $('#rogueTopology');
    if (topo) renderTopology(topo, 'rogue');
  }

  function renderContainmentSteps(active = 0) {
    const wrap = $('#containSteps');
    if (!wrap) return;
    const steps = CONTAINMENT_PLAY;
    const contained = !!state.incident?.contained;
    const running = state.containmentRunning;
    wrap.innerHTML = steps.map(([title, text], index) => {
      const done = contained || index < active;
      const isActive = running && index === active;
      return `<div class="play-step ${done ? 'done' : ''} ${isActive ? 'active' : ''} ${contained ? 'contained' : ''}">
        <span class="play-num">${done ? '✓' : index + 1}</span><b>${title}</b><span>${text}</span>
      </div>`;
    }).join('');
    const tag = $('#containTag');
    if (tag) tag.textContent = contained ? 'Complete' : running ? 'Running' : 'Ready';
  }

  function restoreUeFromRogue(ue) {
    ue.state = ue.prevState || 'idle';
    ue.serving = ue.prevServing || CELL.name;
    ue.rsrp = ue.prevRsrp ?? ue.rsrp;
    ue.security = ue.prevSecurity || 'EPS-AKA · 128-EEA2';
    ue.sinr = ue.prevSinr ?? ue.sinr;
    ue.cqi = ue.prevCqi ?? ue.cqi;
    ue.dl = ue.prevDl ?? 0;
    ue.ul = ue.prevUl ?? 0;
    ue.lastProcedure = 'Service Request';
    ue.lastSeen = new Date();
    ue.rogueId = null;
  }

  function clearContainedScenario() {
    if (!state.rogue || !state.incident?.contained) return false;
    state.runToken += 1;
    state.ues.forEach((ue) => {
      if (ue.state === 'rogue') restoreUeFromRogue(ue);
    });
    state.rogue = null;
    state.incident = null;
    state.containmentRunning = false;
    state.containmentStep = 0;
    state.cell.load = state.cell.baseLoad;
    refreshAll();
    return true;
  }

  function deployFakeBTS(config) {
    if (state.rogue && !state.incident?.contained) {
      setTab('rogue');
      showToast('A fake BTS is already active. Contain or reset the scenario first.', 'warn');
      return;
    }
    const candidates = state.ues.filter((ue) => ue.state === 'connected' || ue.state === 'idle').sort((a, b) => b.rsrp - a.rsrp);
    if (!candidates.length) {
      showToast('No attached virtual UEs are available for the scenario.', 'bad');
      return;
    }
    if (state.rogue) clearContainedScenario();
    const count = clamp(Number(config.targetCount) || 7, 1, Math.min(10, candidates.length));
    const selected = candidates.slice(0, count);
    const rogueId = uid('RG');
    selected.forEach((ue, index) => {
      ue.prevState = ue.state;
      ue.prevServing = ue.serving;
      ue.prevRsrp = ue.rsrp;
      ue.prevSecurity = ue.security;
      ue.prevSinr = ue.sinr;
      ue.prevCqi = ue.cqi;
      ue.prevDl = ue.dl;
      ue.prevUl = ue.ul;
      ue.state = 'rogue';
      ue.serving = config.name;
      ue.rsrp = Number((-58 - (index % 6) * 2 - Math.random() * 3).toFixed(1));
      ue.sinr = Number((18 + Math.random() * 8).toFixed(1));
      ue.cqi = 12;
      ue.dl = 0;
      ue.ul = 0;
      ue.security = 'IMSI exposed';
      ue.lastProcedure = 'Rogue attach';
      ue.lastSeen = new Date();
      ue.rogueId = rogueId;
    });
    const sessionsDropped = selected.filter((ue) => ue.prevState === 'connected').length;
    const detectionConfidence = clamp(82 + (Number(config.pci) !== state.cell.pci ? 3 : 0) + (Number(config.tac) !== state.cell.tac ? 2 : 0), 70, 96);
    state.rogue = {
      id: rogueId,
      name: config.name,
      band: Number(config.band) || 3,
      pci: Number.isFinite(Number(config.pci)) ? Number(config.pci) : 412,
      tac: Number.isFinite(Number(config.tac)) ? Number(config.tac) : 9999,
      power: Number(config.power) || 46,
      targetCount: count,
      status: 'broadcasting',
      deployedAt: new Date(),
    };
    state.incident = {
      id: 'INC-' + Math.floor(2000 + Math.random() * 7000),
      start: new Date(),
      affected: count,
      affectedIds: selected.map((ue) => ue.id),
      sessionsDropped,
      contained: false,
      detected: false,
      detectedAt: null,
      containedAt: null,
      steps: [],
      note: '',
      detectionConfidence,
      mttr: null,
      evidenceVerifiedAt: null,
      reportedAt: null,
      alarmsLinked: false,
    };
    state.containmentStep = 0;
    state.cell.load = clamp(state.cell.baseLoad + 16, 0, 95);
    addEvent('crit', 'Unplanned PCI ' + state.rogue.pci + ' detected', 'No ANR entry · ' + state.rogue.name + ' · B' + state.rogue.band);
    addEvent('warn', count + ' virtual UEs reselected to rogue cell', 'Identity requests observed before EPS-AKA');
    addEvent('crit', 'S1 Setup rejected from unmanaged eNB', 'Source 10.66.42.9 · no managed inventory record');
    addEvent('warn', 'Service degradation on macro layer', 'Attach success and DL throughput trending down');
    refreshAll();
    setTab('rogue');
    showToast('Fake BTS deployed — ' + count + ' virtual UEs reselected.', 'bad');
    const incidentId = state.incident.id;
    setTimeout(() => {
      if (!state.rogue || state.incident?.contained || state.incident?.id !== incidentId) return;
      state.incident.detected = true;
      state.incident.detectedAt = new Date().toISOString();
      recordIncidentStep('detect', 'Detect · RF/NMS correlation', 'Complete');
      addNocLog('warn', 'Incident detected · ' + incidentId, 'Synthetic RF/NMS correlation completed · rule score ' + detectionConfidence + '/100');
      addEvent('warn', 'RF + NMS anomaly correlated', 'Detection confidence ' + detectionConfidence + '% · evidence package opened');
      refreshAll();
    }, 2200);
  }

  async function runContainment(options = {}) {
    if (!state.rogue || !state.incident || state.incident.contained || state.containmentRunning) return;
    const fast = !!options.fast;
    const token = ++state.runToken;
    const startedAt = performance.now();
    state.containmentRunning = true;
    state.containmentStep = 0;
    state.replayMode = fast;
    recordIncidentStep('contain', 'Containment playbook', fast ? 'Running · fast replay' : 'Running');
    addNocLog('warn', 'Containment started · ' + state.incident.id, fast
      ? 'Fast replay · compressed synthetic timing.'
      : 'Synthetic response sequence initiated by the operator.');
    renderNoc();
    renderRogueView();
    for (let i = 0; i < 5; i += 1) {
      await delay(fast ? 220 : 820);
      if (token !== state.runToken) return;
      state.containmentStep = i + 1;
      renderContainmentSteps(i + 1);
      recordIncidentStep('contain', 'Containment step ' + (i + 1) + ' · ' + CONTAINMENT_PLAY[i][0], 'Complete');
      const tag = $('#containTag');
      if (tag) tag.textContent = 'Running';
    }
    await delay(fast ? 180 : 420);
    if (token !== state.runToken) return;
    state.ues.forEach((ue) => {
      if (ue.state !== 'rogue' || ue.rogueId !== state.rogue.id) return;
      restoreUeFromRogue(ue);
    });
    state.rogue.status = 'contained';
    state.incident.contained = true;
    state.incident.containedAt = new Date().toISOString();
    const mttr = formatElapsed((performance.now() - startedAt) / 1000);
    state.incident.mttr = mttr;
    recordIncidentStep('contain', 'Containment playbook', 'Complete · MTTR ' + mttr);
    recordIncidentStep('recover', 'Recover virtual UEs', 'Complete · ' + state.incident.affected + ' restored');
    state.containmentRunning = false;
    state.replayMode = false;
    state.containmentStep = 5;
    addNocLog('ok', 'Incident contained · ' + state.incident.id, 'Virtual UEs restored · measured containment time ' + mttr + (fast ? ' · fast replay' : ''));
    state.cell.load = state.cell.baseLoad;
    addEvent('ok', 'Rogue cell contained', 'UEs recovered to macro layer · evidence package preserved');
    addEvent('ok', 'Incident closed · MTTR ' + mttr, 'Policy updated: PCI/TAC deny list and RF monitoring rule');
    refreshAll();
    showToast('Incident contained. Affected UEs recovered to the macro layer.', 'ok');
  }

  function resetSimulation(options = {}) {
    state.runToken += 1;
    stopTrace();
    state.ues = generateUEs();
    state.ueSeq = 24;
    state.events = initialEvents();
    state.rogue = null;
    state.incident = null;
    state.containmentRunning = false;
    state.containmentStep = 0;
    state.replayMode = false;
    state.cell = { online: true, restarting: false, pci: 127, tac: 4102, earfcn: 1850, band: 3, bw: 20, duplex: 'FDD', txPower: 43, baseLoad: 62, load: 62 };
    state.model = { ...MODEL_DEFAULTS };
    state.chartData = generateChartData();
    state.noc = createNocState();
    state.lastKpi = {};
    state.trace.ueId = null;
    state.trace.step = -1;
    const tx = $('#txPower');
    const load = $('#load');
    const pci = $('#pciInput');
    const tac = $('#tacInput');
    const bw = $('#bwSelect');
    const duplex = $('#duplexSelect');
    if (tx) tx.value = 43;
    if (load) load.value = 62;
    if (pci) pci.value = 127;
    if (tac) tac.value = 4102;
    if (bw) bw.value = '20';
    if (duplex) duplex.value = 'FDD';
    const ueSearch = $('#ueSearch');
    const ueStateFilter = $('#ueStateFilter');
    const ueTypeFilter = $('#ueTypeFilter');
    const nocFilter = $('#nocAlarmFilter');
    if (ueSearch) ueSearch.value = '';
    if (ueStateFilter) ueStateFilter.value = 'all';
    if (ueTypeFilter) ueTypeFilter.value = 'all';
    if (nocFilter) nocFilter.value = state.noc.filter;
    setText('#txPowerOut', '43 dBm');
    setText('#loadOut', '62%');
    syncModelControls();
    if (state.trace.built) setProcedure('attach');
    refreshAll();
    if (options.silent) return;
    setTab('overview');
    showToast('Simulation reset to the clean baseline.', 'ok');
  }

  /* ==========================================================================
     NOC / SOC operations
     Baseline alarms plus scenario alarms derived from the local rogue-cell
     incident. All actions are synthetic and only change browser state.
     ========================================================================== */

  function createNocState() {
    const now = Date.now();
    const alarms = [
      {
        id: 'ALM-4102-JITTER',
        sev: 3,
        domain: 'Transport',
        source: 'IP-AGG-02 · S1-MME',
        title: 'S1-MME path jitter above threshold',
        detail: 'Packet jitter is 14.2 ms against a 10 ms policy threshold on the primary S1-MME aggregation path. No control-plane failures have been observed.',
        impact: 'No subscriber impact. Control-plane latency headroom is reduced.',
        affected: 0,
        state: 'active',
        raisedAt: now - 16 * 60000,
        ackAt: null,
        clearedAt: null,
        owner: null,
        escalated: false,
        scenario: 'baseline',
        incidentId: null,
        runbook: [
          { s: 'Compare jitter on the redundant path and review interface counters.', o: 'Redundant path stays under the 10 ms policy threshold.' },
          { s: 'Validate the QoS shaping policy on IP-AGG-02.', o: 'Shaping profile matches the signed transport design.' },
          { s: 'If jitter exceeds 20 ms, open a transport ticket and shift S1 traffic.', o: 'Traffic rides the redundant path within one maintenance window.' },
          { s: 'Record the counter snapshot in the shift handoff.', o: 'Next operator inherits the evidence trail.' },
        ],
        evidence: 'Baseline · 3 synthetic probes · P3 transport threshold',
      },
      {
        id: 'ALM-2088-ANR',
        sev: 4,
        domain: 'RAN',
        source: 'ANR-SVC · NBR-118',
        title: 'Neighbor relation audit incomplete',
        detail: 'The automatic neighbor relation audit did not complete for NBR-118 during the last reporting window. Existing handovers remain unaffected.',
        impact: 'No subscriber impact. Neighbor-plan housekeeping only.',
        affected: 0,
        state: 'active',
        raisedAt: now - 2 * 3600000 - 8 * 60000,
        ackAt: null,
        clearedAt: null,
        owner: null,
        escalated: false,
        scenario: 'baseline',
        incidentId: null,
        runbook: [
          { s: 'Re-run the ANR audit for NBR-118.', o: 'Audit completes with no missing neighbor relation.' },
          { s: 'Compare X2 handover counters with the neighbor plan.', o: 'Handover success stays within the seasonal band.' },
          { s: 'Close the alarm if no missing neighbor relation is found.', o: 'Alarm closes as housekeeping with no service impact.' },
          { s: 'Flag the audit window in the neighbor plan.', o: 'The next audit starts from an updated baseline.' },
        ],
        evidence: 'Baseline · ANR audit window · no service impact',
      },
      {
        id: 'ALM-1129-PRB',
        sev: 4,
        domain: 'RAN',
        source: 'VCSS-ENB-0417 · Cell 0',
        title: 'PRB utilization drift',
        detail: 'Physical resource block utilization has drifted above the seasonal planning band for the current traffic profile.',
        impact: 'No subscriber impact. Capacity headroom remains within policy.',
        affected: 0,
        state: 'active',
        raisedAt: now - 5 * 3600000 - 41 * 60000,
        ackAt: null,
        clearedAt: null,
        owner: null,
        escalated: false,
        scenario: 'baseline',
        incidentId: null,
        runbook: [
          { s: 'Confirm the traffic profile matches the current load plan.', o: 'Profile and seasonal band are re-confirmed for the cell.' },
          { s: 'Review PRB utilization against the weekly baseline.', o: 'Drift is explained or confirmed as a real trend.' },
          { s: 'Open a capacity-review task if the drift persists for 24 hours.', o: 'Capacity planning owns the follow-up with evidence.' },
          { s: 'Annotate the KPI window in the shift log.', o: 'Trend evidence is preserved for the capacity review.' },
        ],
        evidence: 'Baseline · 28-point KPI window · no service impact',
      },
    ];
    return {
      filter: 'active',
      selectedId: alarms[0].id,
      alarms,
      log: [
        { ts: new Date(now - 2 * 60000), tone: 'ok', title: 'Shift B handoff accepted', detail: 'Layla Mansour · baseline alarm queue reviewed' },
        { ts: new Date(now - 8 * 60000), tone: 'warn', title: 'P4 RAN housekeeping alarms open', detail: 'ALM-2088-ANR, ALM-1129-PRB · no subscriber impact' },
        { ts: new Date(now - 16 * 60000), tone: 'info', title: 'P3 transport jitter raised', detail: 'ALM-4102-JITTER · S1-MME · 14.2 ms' },
        { ts: new Date(now - 19 * 60000), tone: 'info', title: 'SOC correlation queue idle', detail: 'No identity exposure or unmanaged eNB in the last 24 h' },
      ],
      lastHandoffAt: new Date(now - 4 * 3600000),
    };
  }

  function addNocLog(tone, title, detail, when = new Date()) {
    if (!state.noc) return;
    state.noc.log.unshift({ ts: when, tone, title, detail });
    if (state.noc.log.length > 40) state.noc.log.length = 40;
  }

  function recordIncidentStep(key, label, status) {
    const incident = state.incident;
    if (!incident) return;
    incident.steps = incident.steps || [];
    incident.steps.push({ key, label, status, at: new Date().toISOString(), by: SHIFT_OPERATOR });
    if (incident.steps.length > 12) incident.steps.length = 12;
  }

  function incidentStepMeta(incident, key) {
    const records = (incident?.steps || []).filter((rec) => rec.key === key);
    return records[records.length - 1] || null;
  }

  function nocAge(alarm) {
    const end = alarm.clearedAt || Date.now();
    const ms = Math.max(0, end - alarm.raisedAt);
    if (ms < 60000) return Math.max(1, Math.round(ms / 1000)) + 's';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return minutes + 'm';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ' + pad(minutes % 60) + 'm';
    return Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h';
  }

  function nocStatusLabel(alarm) {
    if (alarm.state === 'cleared') return 'Cleared';
    if (alarm.state === 'ack') return 'Acknowledged';
    return 'New';
  }

  function nocScenarioMetrics() {
    const active = !!state.rogue && !state.incident?.contained;
    const contained = !!state.incident?.contained;
    const affected = state.incident?.affected || 0;
    const activeUes = state.ues.filter((ue) => ue.state === 'rogue').length;
    const modeledSubs = active ? Math.round(state.model.zoneSubs * (state.model.exposure / 100)) : 0;
    const revenueHour = active ? modeledSubs * (state.model.arpu / 730) : 0;
    const slaCredits = active ? modeledSubs * state.model.credit : 0;
    return { active, contained, affected, activeUes, modeledSubs, revenueHour, slaCredits };
  }

  function syncNocIncident() {
    if (!state.noc || !state.incident || !state.rogue) return false;
    const incident = state.incident;
    const scenarioAlarms = state.noc.alarms.filter((alarm) => alarm.scenario === 'rogue'
      && (alarm.incidentId === incident.id || (alarm.mergedFrom || []).includes(incident.id)));
    if (incident.contained) {
      const open = scenarioAlarms.filter((alarm) => alarm.state !== 'cleared');
      if (!open.length) return false;
      const now = Date.now();
      open.forEach((alarm) => {
        alarm.state = 'cleared';
        alarm.clearedAt = now;
        alarm.clearedBy = 'Auto-resolution';
        alarm.owner = alarm.owner || NOC_STAFF.commander.name;
      });
      addNocLog('ok', 'Rogue scenario alarms auto-cleared', open.length + ' alarms closed after containment · evidence preserved for ' + incident.id);
      return true;
    }
    if (incident.alarmsLinked || scenarioAlarms.length) return false;

    const incidentNumber = String(incident.id).replace(/\D/g, '').slice(-4) || String(Date.now()).slice(-4);
    const raisedAt = new Date(incident.start).getTime();
    const affected = incident.affected || 0;
    const name = state.rogue.name;
    const rfAlarm = {
      id: 'ALM-' + incidentNumber + '-RF',
      dedupKey: 'rogue-rf',
      occurrences: 1,
      mergedFrom: [],
      sev: 1,
      domain: 'RAN / RF',
      source: 'RF-SENSOR-03 · ' + name,
      title: 'Unmanaged PCI ' + state.rogue.pci + ' broadcasting',
      detail: 'An unmanaged LTE carrier is transmitting inside the macro coverage area. PCI ' + state.rogue.pci + ' is absent from the ANR and the managed eNB inventory.',
      impact: affected + ' virtual UEs reselected to ' + name + '; macro-layer throughput is degraded.',
      affected,
      state: 'active',
      raisedAt,
      ackAt: null,
      clearedAt: null,
      owner: null,
      escalated: false,
      scenario: 'rogue',
      incidentId: incident.id,
      runbook: [
        { s: 'Validate PCI and TAC against the ANR and managed inventory.', o: 'The cell is confirmed unmanaged — not a planning gap.' },
        { s: 'Task RF sensor bearings and confirm the transmitter location.', o: 'Bearing intersections localize the transmitter to a searchable area.' },
        { s: 'Open the SOC bridge and preserve S1 and identity-request evidence.', o: 'Evidence package and NAS trace are sealed for the incident.' },
        { s: 'Push the PCI/TAC deny policy and force UE reselection to the macro layer.', o: 'Affected UEs reselect to the macro cell within the drill window.' },
        { s: 'Re-scan the band after containment and confirm the cell is silent.', o: 'No further rogue carrier is observed; incident closes contained.' },
      ],
      evidence: 'RF fingerprint · S1 source 10.66.42.9 · ' + incident.id,
    };
    const imsiAlarm = {
      id: 'ALM-' + incidentNumber + '-IMSI',
      dedupKey: 'rogue-imsi',
      occurrences: 1,
      mergedFrom: [],
      sev: 1,
      domain: 'Security / SOC',
      source: 'SOC-SIEM · ' + name,
      title: 'Pre-auth identity requests from unmanaged eNB',
      detail: 'The unmanaged cell requested subscriber identity before EPS-AKA completion. Synthetic IMSIs are exposed in the trace and queued for SOC correlation.',
      impact: affected + ' synthetic IMSIs disclosed before authentication.',
      affected,
      state: 'active',
      raisedAt,
      ackAt: null,
      clearedAt: null,
      owner: null,
      escalated: false,
      scenario: 'rogue',
      incidentId: incident.id,
      runbook: [
        { s: 'Correlate the identity-request burst with the RF anomaly.', o: 'Burst timing matches the unmanaged carrier activation.' },
        { s: 'Preserve the NAS trace and evidence package for the incident.', o: 'IMSI catalog is sealed for SOC correlation and review.' },
        { s: 'Confirm no EPS-AKA exchange completed on the unmanaged cell.', o: 'Exposure scope is bounded to pre-authentication requests.' },
        { s: 'Notify the incident commander and start the identity-exposure playbook.', o: 'IC and SOC leads are engaged with the evidence attached.' },
        { s: 'Queue exposed IMSIs for rotation review after containment.', o: 'Subscriber-impact actions are tracked to closure.' },
      ],
      evidence: 'NAS trace · IMSI requests before security · ' + incident.id,
    };
    const s1Alarm = {
      id: 'ALM-' + incidentNumber + '-S1',
      dedupKey: 'rogue-s1',
      occurrences: 1,
      mergedFrom: [],
      sev: 2,
      domain: 'Core / Transport',
      source: 'MME-01 · S1 Setup',
      title: 'S1 Setup rejected from unmanaged eNB',
      detail: 'The MME rejected an S1 Setup request from an untrusted source. No bearer or EPC session was established for the unmanaged cell.',
      impact: 'No core bearer for ' + name + '; the control-plane request was blocked.',
      affected: 0,
      state: 'active',
      raisedAt,
      ackAt: null,
      clearedAt: null,
      owner: null,
      escalated: false,
      scenario: 'rogue',
      incidentId: incident.id,
      runbook: [
        { s: 'Confirm the S1 source is not in the managed eNB inventory.', o: 'Source IP has no OAM or signed-transport record.' },
        { s: 'Verify the MME deny policy and SCTP association state.', o: 'Deny policy held — no association or bearer was created.' },
        { s: 'Retain the rejected setup message for the evidence package.', o: 'Rejection evidence is attached to the incident record.' },
        { s: 'Review deny-policy hits after containment for repeat attempts.', o: 'No repeat setup attempts from the contained source.' },
      ],
      evidence: 'Rejected S1 Setup · source 10.66.42.9 · ' + incident.id,
    };
    const kpiAlarm = {
      id: 'ALM-' + incidentNumber + '-KPI',
      dedupKey: 'rogue-kpi',
      occurrences: 1,
      mergedFrom: [],
      sev: 2,
      domain: 'RAN / Performance',
      source: 'VCSS-ENB-0417 · KPI',
      title: 'Attach success and DL throughput degraded',
      detail: 'Macro-layer attach success and downlink throughput are trending below the rolling baseline while the unmanaged carrier is active.',
      impact: affected + ' UEs lost from the macro layer; cell KPI degradation is active.',
      affected,
      state: 'active',
      raisedAt,
      ackAt: null,
      clearedAt: null,
      owner: null,
      escalated: false,
      scenario: 'rogue',
      incidentId: incident.id,
      runbook: [
        { s: 'Confirm the KPI deviation aligns with the reselection cluster.', o: 'Degradation scope matches the affected-UE set.' },
        { s: 'Check PRB utilization and attach failure counters on the macro cell.', o: 'Macro counters isolate the unmanaged carrier as the cause.' },
        { s: 'Recover UEs and verify KPI restoration after containment.', o: 'Attach success and DL throughput return to baseline.' },
        { s: 'Record the recovery window in the incident timeline.', o: 'MTTR evidence is preserved for the review.' },
      ],
      evidence: 'KPI trend · attach and throughput deviation · ' + incident.id,
    };
    const byDedupKey = {};
    state.noc.alarms.forEach((alarm) => {
      if (alarm.scenario === 'rogue' && alarm.dedupKey && alarm.state === 'cleared') byDedupKey[alarm.dedupKey] = alarm;
    });
    const candidates = { 'rogue-rf': rfAlarm, 'rogue-imsi': imsiAlarm, 'rogue-s1': s1Alarm, 'rogue-kpi': kpiAlarm };
    const mergedIds = [];
    let primary = rfAlarm;
    Object.entries(candidates).forEach(([key, alarm]) => {
      const existing = byDedupKey[key];
      if (existing) {
        existing.occurrences = (existing.occurrences || 1) + 1;
        existing.mergedFrom = ([...(existing.mergedFrom || []), incident.id]);
        existing.lastOccurredAt = alarm.raisedAt;
        existing.affected = alarm.affected;
        existing.impact = alarm.impact;
        existing.detail = alarm.detail;
        existing.state = 'active';
        existing.ackAt = null;
        existing.clearedAt = null;
        existing.clearedBy = null;
        existing.escalated = false;
        if (!mergedIds.includes(existing.id)) mergedIds.push(existing.id);
        primary = mergedIds.length === 1 ? existing : primary;
      } else {
        state.noc.alarms.push(alarm);
      }
    });
    incident.alarmsLinked = true;
    state.noc.selectedId = primary.id;
    if (mergedIds.length) {
      addNocLog('warn', 'Recurring rogue alarms merged · occurrence dedup', mergedIds.length + ' keys reopened for ' + incident.id + ' · occurrences counted (×N).');
      addNocLog('info', 'Rogue recurrence recorded · ' + incident.id, 'Alarm history preserved on ' + mergedIds.join(', '));
    } else {
      addNocLog('crit', 'P1 RF alarm raised · unmanaged cell', rfAlarm.id + ' · ' + name + ' · PCI ' + state.rogue.pci);
      addNocLog('crit', 'P1 identity exposure alarm raised', imsiAlarm.id + ' · ' + affected + ' synthetic IMSIs before EPS-AKA');
      addNocLog('warn', 'P2 service alarms raised', s1Alarm.id + ', ' + kpiAlarm.id + ' · S1 rejection and KPI degradation');
      addNocLog('warn', 'Incident ' + incident.id + ' opened', 'NOC and SOC bridges linked · evidence collection started');
    }
    return true;
  }

  function nocVisibleAlarms() {
    const filter = state.noc?.filter || 'active';
    return (state.noc?.alarms || []).filter((alarm) => {
      if (filter === 'all') return true;
      if (filter === 'active') return alarm.state !== 'cleared';
      if (filter === 'ack') return alarm.state === 'ack';
      if (filter === 'p1') return alarm.state !== 'cleared' && alarm.sev === 1;
      if (filter === 'p2') return alarm.state !== 'cleared' && alarm.sev === 2;
      if (filter === 'minor') return alarm.state !== 'cleared' && alarm.sev >= 3;
      return true;
    }).sort((a, b) => {
      const aOpen = a.state !== 'cleared';
      const bOpen = b.state !== 'cleared';
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      if (aOpen && a.sev !== b.sev) return a.sev - b.sev;
      return b.raisedAt - a.raisedAt;
    });
  }

  function nocStatusBadge(alarm) {
    if (alarm.state === 'cleared') return '<span class="badge badge-cleared"><i></i>Cleared</span>';
    if (alarm.state === 'ack') return '<span class="badge badge-ack"><i></i>Ack</span>';
    return '<span class="badge ' + (alarm.sev <= 2 ? 'badge-danger' : 'badge-idle') + '"><i></i>New</span>';
  }

  function normalizeNocSelection() {
    if (!state.noc) return;
    const visible = nocVisibleAlarms();
    if (!visible.some((alarm) => alarm.id === state.noc.selectedId)) {
      state.noc.selectedId = visible[0]?.id || null;
    }
  }

  function updateNocAges() {
    if (!state.noc) return;
    $$('#nocAlarmTable tr[data-alarm-id]').forEach((row) => {
      const alarm = state.noc.alarms.find((item) => item.id === row.dataset.alarmId);
      const ageEl = row.querySelector('[data-alarm-age]');
      if (alarm && ageEl) ageEl.textContent = nocAge(alarm);
    });
  }

  function setNocBar(selector, pct) {
    const el = $(selector);
    if (el) el.style.width = clamp(Number(pct) || 0, 0, 100) + '%';
  }

  function setNocTrend(selector, text, tone = '') {
    const el = $(selector);
    if (!el) return;
    el.textContent = text;
    el.className = 'trend' + (tone ? ' ' + tone : '');
  }

  function renderNocKpis() {
    const active = state.noc.alarms.filter((alarm) => alarm.state !== 'cleared');
    const p1 = active.filter((alarm) => alarm.sev === 1);
    const p2 = active.filter((alarm) => alarm.sev === 2);
    const acknowledged = active.filter((alarm) => alarm.state === 'ack');
    const firstMajor = p1[0] || p2[0];
    const scenario = nocScenarioMetrics();

    setText('#nocActive', active.length);
    setText('#nocActiveSub', p1.length + ' P1 · ' + p2.length + ' P2');
    setNocTrend('#nocActiveTrend', acknowledged.length ? acknowledged.length + ' acknowledged' : active.length ? 'queue stable' : 'queue clear', p1.length ? 'down' : '');
    setNocBar('#nocActiveBar', (active.length / 12) * 100);

    setText('#nocP1P2', p1.length + ' / ' + p2.length);
    setText('#nocP1P2Sub', firstMajor ? firstMajor.title : 'No major alarms');
    setNocTrend('#nocP1P2Trend', p1.length ? 'P1 critical' : p2.length ? 'P2 major' : 'clear', p1.length || p2.length ? 'down' : 'up');
    setNocBar('#nocP1P2Bar', ((p1.length + p2.length) / 6) * 100);

    setText('#nocSubsImpact', fmtInt(scenario.modeledSubs));
    setText('#nocSubsSub', scenario.active
      ? scenario.affected + ' virtual UEs · ' + state.incident.id
      : scenario.contained ? scenario.affected + ' recovered · ' + state.incident.id : 'No active service impact');
    setNocTrend('#nocSubsTrend', scenario.active ? 'active' : scenario.contained ? 'recovered' : 'steady', scenario.active ? 'down' : scenario.contained ? 'up' : '');
    setNocBar('#nocSubsBar', scenario.active ? (scenario.modeledSubs / Math.max(1, state.model.zoneSubs * 0.15)) * 100 : 0);

    setText('#nocRevenueRisk', compactMoney(scenario.revenueHour));
    setText('#nocRevenueSub', scenario.active ? fmtInt(scenario.modeledSubs) + ' modeled subs · ARPU' : 'ARPU model idle');
    setNocTrend('#nocRevenueTrend', scenario.active ? 'at risk' : 'nominal', scenario.active ? 'down' : '');
    setNocBar('#nocRevenueBar', scenario.active ? (scenario.revenueHour / 1000) * 100 : 0);

    setText('#nocSlaRisk', compactMoney(scenario.slaCredits));
    setText('#nocSlaSub', scenario.active ? 'Credits if SLA is breached' : 'No open exposure');
    setNocTrend('#nocSlaTrend', scenario.active ? 'exposed' : 'within SLA', scenario.active ? 'down' : 'up');
    setNocBar('#nocSlaBar', scenario.active ? (scenario.slaCredits / 100000) * 100 : 0);

    let posture = 'Normal';
    let postureSub = '0 IMSI exposures';
    let postureTrend = 'EPS-AKA';
    let postureTone = '';
    if (scenario.active) {
      posture = state.incident?.detected ? 'Critical' : 'Elevated';
      postureSub = scenario.activeUes + ' IMSI exposures';
      postureTrend = (state.incident?.detectionConfidence || 0) + '% correlated';
      postureTone = 'down';
    } else if (scenario.contained) {
      posture = 'Monitoring';
      postureSub = 'Evidence sealed · ' + state.incident.id;
      postureTrend = 'contained';
      postureTone = 'up';
    }
    setText('#nocPosture', posture);
    setText('#nocPostureSub', postureSub);
    setNocTrend('#nocPostureTrend', postureTrend, postureTone);
    setNocBar('#nocPostureBar', posture === 'Critical' ? 24 : posture === 'Elevated' ? 52 : posture === 'Monitoring' ? 74 : 100);

    $('#nocKpiActive')?.classList.toggle('alert', p1.length > 0 && scenario.active);
    $('#nocKpiMajor')?.classList.toggle('alert', p1.length + p2.length > 0);
    $('#nocKpiPosture')?.classList.toggle('alert', scenario.active);
  }

  function renderNocTable() {
    const tbody = $('#nocAlarmTable tbody');
    if (!tbody) return;
    const alarms = nocVisibleAlarms();
    const major = state.noc.alarms.some((alarm) => alarm.state !== 'cleared' && alarm.sev <= 2);
    const queueTag = $('#nocQueueTag');
    if (queueTag) {
      queueTag.className = 'live-tag' + (major ? ' danger' : '');
      queueTag.innerHTML = '<i></i>' + (major ? 'MAJOR' : alarms.length ? 'LIVE' : 'CLEAR');
    }
    if (!alarms.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="feed-empty">No alarms match this filter.</td></tr>';
      return;
    }
    tbody.innerHTML = alarms.map((alarm) => {
      const selected = alarm.id === state.noc.selectedId;
      const repeats = (alarm.occurrences || 1) > 1
        ? `<span class="alarm-repeat" title="${alarm.occurrences} occurrences merged (dedup)">×${alarm.occurrences}</span>`
        : '';
      return `
        <tr data-alarm-id="${esc(alarm.id)}" class="${selected ? 'is-selected' : ''} ${alarm.state === 'cleared' ? 'is-cleared' : ''} ${alarm.state !== 'cleared' && alarm.sev === 1 ? 'is-p1' : ''}">
          <td><span class="sev-badge sev-${alarm.sev}">P${alarm.sev}</span></td>
          <td><span class="alarm-title">${esc(alarm.title)}${repeats}</span><span class="alarm-id">${esc(alarm.id)}</span></td>
          <td><span class="alarm-source">${esc(alarm.domain)}<small>${esc(alarm.source)}</small></span></td>
          <td><span class="alarm-impact">${esc(alarm.impact)}</span></td>
          <td><span class="mono">${alarm.affected ?? 0}</span></td>
          <td><span class="alarm-age" data-alarm-age>${nocAge(alarm)}</span></td>
          <td>${nocStatusBadge(alarm)}</td>
          <td><button class="table-action" type="button" data-noc-action="select" data-alarm-id="${esc(alarm.id)}" aria-label="Open ${esc(alarm.id)}">Open</button></td>
        </tr>`;
    }).join('');
  }

  function renderNocDetail() {
    const title = $('#nocDetailTitle');
    const sev = $('#nocDetailSev');
    const body = $('#nocAlarmDetail');
    if (!title || !sev || !body) return;
    const visible = nocVisibleAlarms();
    const selected = visible.find((alarm) => alarm.id === state.noc.selectedId) || visible[0] || null;
    if (!selected) {
      title.textContent = 'No alarm selected';
      sev.className = 'sev-badge';
      sev.textContent = '—';
      body.innerHTML = '<div class="noc-empty"><div class="noc-empty-icon"><svg class="icon"><use href="#i-check"></use></svg></div><b>Queue clear.</b> No alarms match the current filter. Select another filter to review cleared alarms.</div>';
      return;
    }
    if (state.noc.selectedId !== selected.id) state.noc.selectedId = selected.id;
    title.textContent = selected.title;
    sev.className = 'sev-badge sev-' + selected.sev;
    sev.textContent = 'P' + selected.sev;
    const cleared = selected.state === 'cleared';
    const ackButton = selected.state === 'active'
      ? `<button class="btn btn-outline btn-sm" type="button" data-noc-action="ack" data-alarm-id="${esc(selected.id)}"><svg class="icon"><use href="#i-check"></use></svg>Acknowledge</button>`
      : '<button class="btn btn-ghost btn-sm" type="button" disabled>Acknowledged</button>';
    const escalateButton = cleared || selected.escalated
      ? `<button class="btn btn-ghost btn-sm" type="button" disabled>${selected.escalated ? 'Escalated' : 'Escalate'}</button>`
      : `<button class="btn btn-outline btn-sm" type="button" data-noc-action="escalate" data-alarm-id="${esc(selected.id)}"><svg class="icon"><use href="#i-arrow"></use></svg>Escalate</button>`;
    const clearButton = cleared
      ? '<button class="btn btn-ghost btn-sm" type="button" disabled>Cleared</button>'
      : selected.state === 'ack'
        ? `<button class="btn btn-outline btn-sm" type="button" data-noc-action="clear" data-alarm-id="${esc(selected.id)}"><svg class="icon"><use href="#i-x"></use></svg>Clear</button>`
        : '<button class="btn btn-ghost btn-sm" type="button" disabled title="Acknowledge before clearing">Clear</button>';
    const rogueButton = selected.scenario === 'rogue' && state.rogue
      ? '<button class="btn btn-rogue btn-sm" type="button" data-noc-action="open-rogue"><svg class="icon"><use href="#i-alert"></use></svg>Open fake BTS</button>'
      : '';
    body.innerHTML = `
      <div class="noc-detail-meta">
        <div><span>Alarm ID</span><b>${esc(selected.id)}</b></div>
        <div><span>State</span><b>${nocStatusLabel(selected)}</b></div>
        <div><span>Source</span><b>${esc(selected.source)}</b></div>
        <div><span>Raised</span><b>${fmtTimeShort(new Date(selected.raisedAt))} UTC · ${nocAge(selected)}</b></div>
        <div><span>Owner</span><b>${esc(selected.owner || 'NOC queue')}</b></div>
        <div><span>Incident</span><b>${esc(selected.incidentId || '—')}</b></div>
        ${(selected.occurrences || 1) > 1 ? `<div><span>Occurrences</span><b>×${selected.occurrences} merged</b></div><div><span>Also covers incidents</span><b>${esc((selected.mergedFrom || []).join(', ') || '—')}</b></div><div><span>Last occurrence</span><b>${selected.lastOccurredAt ? fmtTimeShort(new Date(selected.lastOccurredAt)) + ' UTC' : '—'}</b></div>` : ''}
        ${cleared ? `<div><span>Cleared</span><b>${fmtTimeShort(new Date(selected.clearedAt))} UTC · ${esc(selected.clearedBy || 'NOC')}</b></div>` : ''}
      </div>
      <p class="noc-detail-desc">${esc(selected.detail)}</p>
      <div class="noc-impact-line"><span>${esc(selected.impact)}</span><b>${selected.affected || 0} UEs</b></div>
      <div class="noc-detail-block">
        <h3>Runbook <span class="tag">${selected.runbook.length} steps · expected outcomes</span></h3>
        <ol class="noc-runbook">${selected.runbook.map((step) => `<li>${esc(step.s)}<small>→ ${esc(step.o)}</small></li>`).join('')}</ol>
      </div>
      <div class="noc-evidence-line"><svg class="icon"><use href="#i-lock"></use></svg><span>${esc(selected.evidence)}</span></div>
      <div class="noc-detail-actions">
        ${ackButton}
        ${escalateButton}
        ${clearButton}
        ${rogueButton}
      </div>
    `;
  }

  function renderNocImpact() {
    const scenario = nocScenarioMetrics();
    const m = getMetrics();
    const tag = $('#nocImpactTag');
    if (tag) {
      tag.className = 'tag' + (scenario.active ? ' danger' : scenario.contained ? ' ok' : '');
      tag.textContent = scenario.active ? 'Active' : scenario.contained ? 'Contained' : 'Nominal';
    }
    const body = $('#nocImpact');
    if (!body) return;
    const subscriberWidth = scenario.active ? clamp((state.model.exposure / 15) * 100, 0, 100) : 0;
    const attachWidth = clamp(m.attachSuccess, 0, 100);
    const throughputWidth = clamp((m.throughput / 280) * 100, 0, 100);
    const slaWidth = scenario.active ? clamp((scenario.slaCredits / 100000) * 100, 0, 100) : 0;
    body.innerHTML = `
      <div class="noc-impact-grid">
        <div class="noc-impact-item ${scenario.active ? 'hot' : ''}"><span>Virtual UEs active</span><b>${scenario.activeUes} <small>/ ${m.total}</small></b></div>
        <div class="noc-impact-item ${scenario.active ? 'hot' : ''}"><span>Modeled subscribers</span><b>${fmtInt(scenario.modeledSubs)}</b></div>
        <div class="noc-impact-item"><span>Sessions dropped</span><b>${state.incident?.sessionsDropped || 0}</b></div>
        <div class="noc-impact-item"><span>Attach success</span><b>${m.attachSuccess.toFixed(1)}<small>%</small></b></div>
      </div>
      <div class="hbar-list noc-bars">
        <div class="hbar-row"><span class="hbar-name">Subscriber impact</span><span class="hbar-track"><i class="hbar-fill${scenario.active ? ' rose' : ''}" style="width:${subscriberWidth}%"></i></span><span class="hbar-val">${scenario.active ? fmtPct(state.model.exposure, 1) : '0%'}</span></div>
        <div class="hbar-row"><span class="hbar-name">Attach success</span><span class="hbar-track"><i class="hbar-fill${m.attachSuccess < 95 ? ' rose' : ''}" style="width:${attachWidth}%"></i></span><span class="hbar-val">${m.attachSuccess.toFixed(1)}%</span></div>
        <div class="hbar-row"><span class="hbar-name">DL throughput</span><span class="hbar-track"><i class="hbar-fill${scenario.active ? ' rose' : ''}" style="width:${throughputWidth}%"></i></span><span class="hbar-val">${m.throughput.toFixed(0)} Mbps</span></div>
        <div class="hbar-row"><span class="hbar-name">SLA credit risk</span><span class="hbar-track"><i class="hbar-fill${scenario.active ? ' amber' : ''}" style="width:${slaWidth}%"></i></span><span class="hbar-val">${compactMoney(scenario.slaCredits)}</span></div>
      </div>
      <p class="noc-impact-note">${scenario.active
        ? 'Derived from the synthetic incident and business-case assumptions. Containment recovers UEs; incident exposure remains visible in the business case.'
        : scenario.contained
          ? 'Incident contained. Affected UEs are recovered and the evidence package remains attached to ' + state.incident.id + '.'
          : 'No active service impact. Baseline NOC alarms are transport and RAN housekeeping only.'}</p>
    `;
  }

  function renderNocHealth() {
    const active = state.noc.alarms.filter((alarm) => alarm.state !== 'cleared');
    const hasMajor = active.some((alarm) => alarm.sev <= 2);
    const scenario = nocScenarioMetrics();
    const rows = scenario.active
      ? [
        { name: 'RAN', tone: 'bad', status: 'Impaired', value: 42 },
        { name: 'Transport', tone: 'warn', status: 'Degraded', value: 64 },
        { name: 'Core / EPC', tone: 'warn', status: 'Guard', value: 70 },
        { name: 'Security', tone: 'bad', status: 'Exposed', value: 28 },
        { name: 'Facilities', tone: '', status: 'Healthy', value: 98 },
      ]
      : scenario.contained
        ? [
          { name: 'RAN', tone: 'warn', status: 'Minor', value: 82 },
          { name: 'Transport', tone: 'warn', status: 'Minor', value: 74 },
          { name: 'Core / EPC', tone: '', status: 'Healthy', value: 98 },
          { name: 'Security', tone: 'warn', status: 'Sealed', value: 84 },
          { name: 'Facilities', tone: '', status: 'Healthy', value: 98 },
        ]
        : [
          { name: 'RAN', tone: 'warn', status: 'Minor', value: 76 },
          { name: 'Transport', tone: 'warn', status: 'Minor', value: 68 },
          { name: 'Core / EPC', tone: '', status: 'Healthy', value: 98 },
          { name: 'Security', tone: '', status: 'Healthy', value: 99 },
          { name: 'Facilities', tone: '', status: 'Healthy', value: 98 },
        ];
    const tag = $('#nocHealthTag');
    if (tag) {
      tag.className = 'live-tag' + (hasMajor ? ' danger' : '');
      tag.innerHTML = '<i></i>' + (hasMajor ? 'DEGRADED' : scenario.contained ? 'STABLE' : 'SYNC');
    }
    const body = $('#nocHealth');
    if (!body) return;
    body.innerHTML = `
      <div class="health-list">
        ${rows.map((row) => `<div class="health-row ${row.tone}"><i></i><span class="health-name">${row.name}</span><span class="health-bar"><i style="width:${row.value}%"></i></span><span class="health-status">${row.status}</span></div>`).join('')}
      </div>
      <p class="noc-health-note">Domain rollup from active synthetic alarms. Security includes SOC identity exposure; no live EPC or HSS telemetry is used.</p>
    `;
  }

  function renderNocSoc() {
    const scenario = nocScenarioMetrics();
    const detected = !!state.incident?.detected;
    const confidence = state.incident?.detectionConfidence || 0;
    const tag = $('#nocSocTag');
    const posture = scenario.active ? (detected ? 'Critical' : 'Elevated') : scenario.contained ? 'Contained' : 'Nominal';
    if (tag) {
      tag.className = 'tag' + (posture === 'Critical' ? ' danger' : posture === 'Elevated' ? ' warn' : posture === 'Contained' ? ' ok' : '');
      tag.textContent = posture;
    }
    const body = $('#nocSoc');
    if (!body) return;
    const exposure = scenario.activeUes;
    const rows = [
      ['Identity exposure', exposure ? exposure + ' IMSIs' : scenario.contained ? 'Sealed' : 'None', exposure ? 'bad' : 'ok'],
      ['Unmanaged eNB', state.rogue ? state.rogue.name + ' · PCI ' + state.rogue.pci : 'None', state.rogue && scenario.active ? 'bad' : 'ok'],
      ['S1 source validation', scenario.active ? 'Rejected · 10.66.42.9' : 'Enforced', scenario.active ? 'warn' : 'ok'],
      ['RF / NMS rule score', scenario.active ? (detected ? confidence + '/100 · synthetic' : 'Correlating') : scenario.contained ? 'Evidence sealed' : 'Idle', scenario.active ? (detected ? 'bad' : 'warn') : 'ok'],
      ['EPS-AKA integrity', exposure ? 'Exposure pre-auth' : 'Nominal', exposure ? 'bad' : 'ok'],
      ['Evidence package', state.incident ? state.incident.id + (scenario.contained ? ' · sealed' : ' · open') : '—', state.incident && !scenario.contained ? 'warn' : 'ok'],
    ];
    let callout = 'No identity exposure. SOC correlation queue is idle; baseline alarms are NOC-only.';
    if (scenario.active) {
      callout = detected
        ? 'SOC bridge opened for ' + state.incident.id + '. ' + exposure + ' virtual UEs requested identity before EPS-AKA; the displayed rule score is synthetic, not a probability.'
        : 'RF and NMS evidence is correlating. Identity-request evidence is already queued for the SOC bridge.';
    } else if (scenario.contained) {
      callout = 'Incident contained. Evidence for ' + state.incident.id + ' is preserved for forensic review; no active identity exposure.';
    }
    body.innerHTML = `
      <div class="soc-list">${rows.map(([label, value, tone]) => `<div class="soc-row"><span>${label}</span><b class="${tone}">${value}</b></div>`).join('')}</div>
      <div class="soc-callout ${scenario.active ? '' : 'ok'}"><svg class="icon"><use href="#${scenario.active ? 'i-alert' : 'i-shield'}"></use></svg><span>${callout}</span></div>
      ${state.rogue ? '<div class="soc-actions"><button class="btn btn-outline btn-sm" type="button" data-noc-action="open-rogue"><svg class="icon"><use href="#i-radio"></use></svg>Open fake BTS evidence</button></div>' : ''}
    `;
  }

  function renderNocLog() {
    const feed = $('#nocLog');
    if (!feed) return;
    const entries = state.noc.log.slice(0, 20);
    feed.innerHTML = entries.length
      ? entries.map((entry) => `
        <div class="feed-item ${entry.tone}">
          <span class="feed-dot"></span>
          <div>
            <div class="feed-top"><span class="feed-title">${esc(entry.title)}</span><span class="feed-time">${fmtTime(entry.ts)}</span></div>
            <div class="feed-detail">${esc(entry.detail)}</div>
          </div>
        </div>`).join('')
      : '<div class="feed-empty">No operational actions recorded.</div>';
    setText('#nocLogCount', state.noc.log.length + (state.noc.log.length === 1 ? ' entry' : ' entries'));
  }

  function renderNocShift() {
    const body = $('#nocShift');
    if (!body) return;
    const active = state.noc.alarms.filter((alarm) => alarm.state !== 'cleared');
    const major = active.some((alarm) => alarm.sev <= 2);
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(18, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const mins = Math.max(0, Math.round((next - now) / 60000));
    const handoffIn = Math.floor(mins / 60) + 'h ' + pad(mins % 60) + 'm';
    const owner = major ? NOC_STAFF.commander : NOC_STAFF.manager;
    const tag = $('#nocShiftTag');
    if (tag) {
      tag.className = 'tag' + (major ? ' danger' : '');
      tag.textContent = 'Shift B';
    }
    body.innerHTML = `
      <div class="shift-list">
        <div class="shift-row"><span>Shift</span><b>B · 06:00–18:00 UTC</b></div>
        <div class="shift-row"><span>Primary owner</span><div class="shift-owner"><span class="shift-avatar">${owner.initials}</span><div><b>${owner.name}</b><small>${owner.role}</small></div></div></div>
        <div class="shift-row"><span>RAN on-call</span><b>${NOC_STAFF.ran.name}</b></div>
        <div class="shift-row"><span>Transport</span><b>${NOC_STAFF.transport.name}</b></div>
        <div class="shift-row"><span>SOC analyst</span><b>${NOC_STAFF.soc.name}</b></div>
        <div class="shift-row"><span>Last handoff</span><b>${fmtTimeShort(state.noc.lastHandoffAt)} UTC</b></div>
      </div>
      <div class="shift-bridge ${major ? 'warn' : ''}"><svg class="icon"><use href="#${major ? 'i-alert' : 'i-check'}"></use></svg><span>${major ? 'Major incident bridge open · IC and SOC lead engaged' : 'Quiet bridge · alarm queue and runbooks only'}</span></div>
      <div class="shift-row"><span>Escalation clock</span><b>P1 5m · P2 15m</b></div>
      <div class="shift-actions">
        <button class="btn btn-outline" type="button" data-noc-action="handoff"><svg class="icon"><use href="#i-copy"></use></svg>Copy handoff</button>
        <button class="btn btn-outline" type="button" data-noc-action="export-shift-log"><svg class="icon"><use href="#i-export"></use></svg>Export shift log</button>
        <button class="btn btn-ghost" type="button" data-noc-action="page-backup"><svg class="icon"><use href="#i-radio"></use></svg>Page backup</button>
      </div>
      <p class="noc-shift-note">Next handoff in ${handoffIn}. Synthetic roster only; no pager, ticket or SOC integration.</p>
    `;
  }

  function updateNocTabBadge() {
    if (!state.noc) state.noc = createNocState();
    const active = state.noc.alarms.filter((alarm) => alarm.state !== 'cleared');
    const tabCount = $('#nocTabCount');
    if (tabCount) {
      tabCount.textContent = String(active.length);
      tabCount.className = active.some((alarm) => alarm.sev <= 2) ? 'tab-alert' : 'tab-count';
      tabCount.title = active.length + ' active alarms';
    }
  }

  function syncNocData() {
    if (!state.noc) state.noc = createNocState();
    syncNocIncident();
    updateNocTabBadge();
  }

  function renderNocIncidentCockpit() {
    const body = $('#nocIncidentCockpit');
    if (!body) return;
    const incident = state.incident;
    const active = !!state.rogue && !incident?.contained;
    const title = $('#nocIncidentTitle');
    const status = $('#nocIncidentStatus');
    if (!incident) {
      if (title) title.textContent = 'Incident cockpit';
      if (status) { status.textContent = 'Monitoring'; status.className = 'tag'; }
      body.innerHTML = '<div class="noc-cockpit-empty"><b>No active scenario incident</b><span>Baseline alarms remain below. Deploy the synthetic fake BTS scenario to exercise correlation, containment, and evidence capture.</span></div>';
      return;
    }
    if (title) title.textContent = incident.id + ' · ' + (state.rogue?.name || 'Rogue cell scenario');
    if (status) { status.textContent = active ? (incident.detected ? 'Investigating' : 'Correlating') : 'Contained'; status.className = 'tag ' + (active ? (incident.detected ? 'danger' : 'warn') : 'ok'); }
    const stepDone = {
      detect: !!incident.detectedAt || incident.detected,
      verify: !!incident.evidenceVerifiedAt,
      contain: !!incident.contained,
      recover: !!incident.contained,
      report: !!incident.reportedAt,
    };
    const pct = Math.round(Object.values(stepDone).filter(Boolean).length / 5 * 100);
    const stepStamp = (key) => {
      const rec = incidentStepMeta(incident, key);
      return rec ? ' · ' + fmtTimeShort(new Date(rec.at)) + ' UTC' : '';
    };
    const windowBits = ['Started ' + fmtTimeShort(incident.start) + ' UTC'];
    if (incident.detectedAt) windowBits.push('Detected ' + fmtTimeShort(new Date(incident.detectedAt)) + ' UTC');
    if (incident.contained) windowBits.push('Contained ' + fmtTimeShort(new Date(incident.containedAt)) + ' UTC · MTTR ' + (incident.mttr || '—'));
    const signals = [
      ['PCI absent from ANR', Number(state.rogue?.pci) !== state.cell.pci, 'A cell ID outside the managed ANR plan usually means an unmanaged transmitter.'],
      ['TAC differs from macro cell', Number(state.rogue?.tac) !== state.cell.tac, 'A mismatched tracking area breaks paging consistency inside the faked coverage area.'],
      ['S1 source lacks managed inventory', !!state.rogue, 'The cell has no eNB inventory record — no signed transport or OAM trail.'],
      ['Identity requested before EPS-AKA', !!state.rogue, 'IMSI requests before authentication are the classic rogue-cell signature.'],
    ];
    const steps = [
      ['Detect', stepDone.detect ? 'Complete' + stepStamp('detect') : 'Correlating', stepDone.detect],
      ['Verify evidence', incident.evidenceVerifiedAt ? 'Verified' : 'Review signal breakdown', stepDone.verify],
      ['Contain', incident.contained ? 'Complete' : state.containmentRunning ? (state.replayMode ? 'Fast replay' : 'In progress') : 'Pending', stepDone.contain],
      ['Recover', incident.contained ? incident.affected + ' virtual UEs restored' + stepStamp('recover') : 'Pending containment', stepDone.recover],
      ['Report', incident.reportedAt ? 'Evidence exported' + stepStamp('report') : 'Export JSON package', stepDone.report],
    ];
    const timeline = (state.noc?.log || []).filter((entry) => /incident|rogue|identity|correlat|contain|alarm acknowledged|alarm escalated|alarm cleared|evidence package/i.test(entry.title + ' ' + entry.detail)).slice(0, 8).reverse();
    body.innerHTML = `<div class="noc-cockpit-grid">
      <section class="noc-cockpit-section"><h3>Response progress <span class="tag">${pct}%</span></h3><div class="noc-progress" aria-hidden="true"><i style="width:${pct}%"></i></div><p class="noc-cockpit-window mono">${esc(windowBits.join(' · '))}${state.replayMode ? ' · fast replay' : ''}</p><ol class="noc-response-steps">${steps.map(([label, value, done], index) => `<li class="${done ? 'is-done' : index === 0 && active ? 'is-current' : ''}"><span class="noc-step-mark">${done ? '✓' : index + 1}</span><span><b>${label}</b><small>${esc(value)}</small></span></li>`).join('')}</ol><div class="noc-cockpit-actions">${incident.evidenceVerifiedAt ? '' : '<button class="btn btn-outline btn-sm" type="button" data-noc-action="verify-evidence">Mark evidence reviewed</button>'}${active && !state.containmentRunning ? '<button class="btn btn-rogue btn-sm" type="button" data-noc-action="contain-incident">Start containment</button>' : ''}</div></section>
      <section class="noc-cockpit-section"><h3>SOC signal basis <span class="tag">Synthetic rule score · not probability</span></h3><ul class="noc-signal-list">${signals.map(([label, observed, why]) => `<li><i class="${observed ? 'observed' : ''}"></i><span>${label}</span><b>${observed ? 'Observed' : 'Clear'}</b>${observed && why ? `<small>${esc(why)}</small>` : ''}</li>`).join('')}</ul><p class="noc-cockpit-note">The score derives from scenario inputs and is not a calibrated likelihood or live telemetry. Why-lines explain what each signal means for detection.</p></section>
      <section class="noc-cockpit-section"><h3>Incident timeline <span>${timeline.length} recent events</span></h3><ol class="noc-incident-timeline">${timeline.length ? timeline.map((entry) => `<li><time>${esc(entry.ts instanceof Date ? entry.ts.toLocaleTimeString() : new Date(entry.ts).toLocaleTimeString())}</time><span><b>${esc(entry.title)}</b><small>${esc(entry.detail)}</small></span></li>`).join('') : '<li class="timeline-empty">Waiting for incident events.</li>'}</ol></section>
      <section class="noc-cockpit-section noc-cockpit-note-section"><h3>Operator note</h3><p class="noc-note-line">${incident.note ? '<b>Operator note:</b> ' + esc(incident.note) : 'No operator note yet — add one in the evidence package (joins the SHA-256 payload).'}</p></section>
    </div>`;
  }

  function renderNoc() {
    if (!state.noc) state.noc = createNocState();
    normalizeNocSelection();
    renderNocIncidentCockpit();
    renderNocKpis();
    renderNocTable();
    renderNocDetail();
    renderNocImpact();
    renderNocHealth();
    renderNocSoc();
    renderNocLog();
    renderNocShift();
    updateNocTabBadge();
  }

  function refreshNoc() {
    syncNocData();
    renderNoc();
  }

  function selectNocAlarm(id) {
    if (!state.noc || !state.noc.alarms.some((alarm) => alarm.id === id)) return;
    state.noc.selectedId = id;
    renderNoc();
    const open = $('#nocAlarmTable tr[data-alarm-id="' + id + '"] [data-noc-action="select"]');
    if (open) open.focus();
  }

  function setNocFilter(value) {
    if (!state.noc) return;
    state.noc.filter = value;
    const visible = nocVisibleAlarms();
    if (!visible.some((alarm) => alarm.id === state.noc.selectedId)) {
      state.noc.selectedId = visible[0]?.id || null;
    }
    renderNoc();
  }

  function focusNocSelection() {
    const row = $('#nocAlarmTable tr.is-selected [data-noc-action="select"]');
    if (row) {
      row.focus();
      return;
    }
    $('#nocAlarmFilter')?.focus();
  }

  function runNocAction(action, alarmId) {
    if (!state.noc) return;
    if (action === 'handoff') { copyNocHandoff(); return; }
    if (action === 'export-shift-log') { exportShiftLog(); return; }
    if (action === 'evidence-preview') { openIncidentEvidencePreview(); return; }
    if (action === 'verify-evidence') {
      if (!state.incident) return;
      state.incident.evidenceVerifiedAt = new Date().toISOString();
      addNocLog('info', 'Incident evidence reviewed · ' + state.incident.id, 'Operator reviewed the synthetic RF, S1, and pre-auth identity signal breakdown.');
      renderNoc();
      showToast('Evidence marked reviewed in the local incident record.', 'ok');
      return;
    }
    if (action === 'contain-incident') { setTab('rogue'); runContainment(); return; }
    if (action === 'download-evidence') { exportIncidentEvidence(); return; }
    if (action === 'copy-evidence') { copyIncidentEvidence(); return; }
    if (action === 'page-backup') {
      addNocLog('warn', 'Backup engineer paged', 'Synthetic escalation · no pager or external system contacted');
      renderNocLog();
      showToast('Backup on-call paged in the local simulation.', 'warn');
      return;
    }
    if (action === 'open-rogue') { setTab('rogue'); return; }
    const alarm = state.noc.alarms.find((item) => item.id === alarmId);
    if (!alarm) return;
    if (action === 'select') { selectNocAlarm(alarm.id); return; }
    if (action === 'ack') {
      if (alarm.state !== 'active') return;
      alarm.state = 'ack';
      alarm.ackAt = Date.now();
      alarm.owner = NOC_STAFF.manager.name;
      addNocLog('info', 'Alarm acknowledged · ' + alarm.id, alarm.title + ' · owner ' + alarm.owner);
      renderNoc();
      $('#nocAlarmDetail [data-noc-action="clear"]')?.focus();
      showToast(alarm.id + ' acknowledged by NOC.', 'ok');
      return;
    }
    if (action === 'escalate') {
      if (alarm.state === 'cleared' || alarm.escalated) return;
      const previous = alarm.sev;
      alarm.sev = Math.max(1, alarm.sev - 1);
      alarm.escalated = true;
      alarm.escalatedAt = Date.now();
      alarm.owner = NOC_STAFF.commander.name;
      addNocLog(alarm.sev === 1 ? 'crit' : 'warn', 'Alarm escalated · ' + alarm.id, 'P' + previous + ' → P' + alarm.sev + ' · ' + alarm.title + ' · incident commander assigned');
      renderNoc();
      focusNocSelection();
      showToast(alarm.id + ' escalated to the incident commander.', 'warn');
      return;
    }
    if (action === 'clear') {
      if (alarm.state === 'cleared') return;
      if (alarm.state !== 'ack') {
        showToast('Acknowledge the alarm before clearing it.', 'warn');
        return;
      }
      alarm.state = 'cleared';
      alarm.clearedAt = Date.now();
      alarm.clearedBy = NOC_STAFF.manager.name;
      if (!alarm.owner) alarm.owner = NOC_STAFF.manager.name;
      addNocLog('ok', 'Alarm cleared · ' + alarm.id, alarm.title + ' · evidence retained in the NOC log');
      renderNoc();
      focusNocSelection();
      showToast(alarm.id + ' cleared. Evidence retained.', 'ok');
    }
  }

  function buildIncidentEvidence() {
    const incident = state.incident;
    return {
      schema: 'vcss-incident-evidence/1.0',
      app: { name: 'VCSS 4G', version: APP_VERSION },
      generatedAt: new Date().toISOString(),
      syntheticSimulationOnly: true,
      incident: incident ? {
        id: incident.id, startedAt: new Date(incident.start).toISOString(),
        status: incident.contained ? 'contained' : 'active', detected: !!incident.detected,
        detectedAt: incident.detectedAt, containedAt: incident.containedAt,
        affectedVirtualUes: incident.affected, affectedUeIds: [...incident.affectedIds],
        sessionsDropped: incident.sessionsDropped, measuredContainmentTime: incident.mttr,
        evidenceVerifiedAt: incident.evidenceVerifiedAt,
        operatorNote: incident.note ? incident.note : null,
        responseSteps: (incident.steps || []).map((rec) => ({ step: rec.key, label: rec.label, status: rec.status, at: rec.at, by: rec.by })),
        signalBasis: {
          pciMismatch: Number(state.rogue?.pci) !== state.cell.pci,
          tacMismatch: Number(state.rogue?.tac) !== state.cell.tac,
          unmanagedS1Source: !!state.rogue,
          preAuthIdentityRequest: !!state.rogue,
          ruleScore: incident.detectionConfidence,
          scoreMeaning: 'Synthetic scenario rule score; not a probability or live SOC confidence.',
        },
      } : null,
      alarms: (state.noc?.alarms || []).filter((alarm) => !incident || alarm.incidentId === incident.id || (alarm.mergedFrom || []).includes(incident.id)).map((alarm) => ({
        id: alarm.id, severity: 'P' + alarm.sev, domain: alarm.domain, title: alarm.title,
        state: alarm.state, source: alarm.source, owner: alarm.owner,
        occurrences: alarm.occurrences || 1, mergedIncidents: [...(alarm.mergedFrom || [])],
        raisedAt: new Date(alarm.raisedAt).toISOString(),
        acknowledgedAt: alarm.ackAt ? new Date(alarm.ackAt).toISOString() : null,
        clearedAt: alarm.clearedAt ? new Date(alarm.clearedAt).toISOString() : null,
        evidenceReference: alarm.evidence || null,
      })),
      timeline: (state.noc?.log || []).map((entry) => ({
        at: entry.ts instanceof Date ? entry.ts.toISOString() : new Date(entry.ts).toISOString(),
        type: entry.tone, title: entry.title, detail: entry.detail,
      })),
      limitation: 'All identities, alarms, impact figures, sources, and actions in this package are synthetic browser simulation data. This package does not establish a real network incident.',
    };
  }

  async function incidentEvidenceText() {
    const payload = buildIncidentEvidence();
    let integrity = { algorithm: 'SHA-256', status: 'unavailable', digest: null, scope: 'JSON payload before integrity field' };
    try {
      if (window.crypto?.subtle && window.TextEncoder) {
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
        integrity = { algorithm: 'SHA-256', status: 'computed', digest: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''), scope: 'UTF-8 JSON.stringify of payload before integrity field' };
      }
    } catch (_) { /* keep integrity explicitly unavailable */ }
    payload.integrity = integrity;
    return JSON.stringify(payload, null, 2);
  }

  async function openIncidentEvidencePreview() {
    const root = $('#modalRoot');
    if (!root) return;
    const content = await incidentEvidenceText();
    const evidence = JSON.parse(content);
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.innerHTML = `<div class="modal-backdrop"><section class="modal evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidenceModalTitle"><div class="modal-head"><div><h2 id="evidenceModalTitle">Synthetic incident evidence</h2><p>Versioned JSON record for review and handoff · simulation data only.</p></div><button class="icon-btn" type="button" data-close="modal" aria-label="Close dialog">×</button></div><div class="modal-body"><div class="evidence-note-block"><label for="evidenceNoteInput">Operator note <span>(synthetic · joins the SHA-256 payload)</span></label><textarea id="evidenceNoteInput" rows="2" maxlength="400" placeholder="Reviewer context for this evidence package…">${esc(state.incident?.note || '')}</textarea><button class="btn btn-outline btn-sm" type="button" id="evidenceNoteSave"><svg class="icon"><use href="#i-check"></use></svg>Save note</button></div><p class="evidence-integrity"><b>Integrity:</b> ${esc(evidence.integrity.status)}${evidence.integrity.digest ? ' · SHA-256 ' + esc(evidence.integrity.digest) : ''}</p><pre class="evidence-preview">${esc(content)}</pre></div><div class="modal-foot"><button class="btn btn-ghost" type="button" data-close="modal">Close</button><button class="btn btn-outline" type="button" data-noc-action="copy-evidence">Copy JSON</button><button class="btn btn-primary" type="button" data-noc-action="download-evidence">Download JSON</button></div></section></div>`;
    document.body.style.overflow = 'hidden';
    root.querySelectorAll('[data-close="modal"]').forEach((button) => button.addEventListener('click', closeModal));
    root.querySelector('.modal-backdrop')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) closeModal(); });
    root.querySelector('#evidenceNoteSave')?.addEventListener('click', async () => {
      const box = root.querySelector('#evidenceNoteInput');
      if (!box || !state.incident) return;
      const value = String(box.value || '').trim();
      if (value === (state.incident.note || '')) { showToast('Operator note already up to date.', 'ok'); box.focus(); return; }
      state.incident.note = value;
      recordIncidentStep('note', 'Operator note', value ? 'Saved · ' + value.length + ' chars' : 'Cleared');
      addNocLog('info', 'Operator note saved · ' + state.incident.id, value ? 'Note recorded and covered by the evidence SHA-256 payload.' : 'Operator note cleared.');
      const fresh = await incidentEvidenceText();
      const preview = root.querySelector('.evidence-preview');
      if (preview) preview.textContent = fresh;
      const line = root.querySelector('.evidence-integrity');
      const parsed = JSON.parse(fresh);
      if (line) line.innerHTML = '<b>Integrity:</b> ' + esc(parsed.integrity.status) + (parsed.integrity.digest ? ' · SHA-256 ' + esc(parsed.integrity.digest) : '');
      renderNocLog();
      renderNoc();
      showToast('Operator note saved to the evidence package.', 'ok');
      box.focus();
    });
    root.querySelector('.modal-foot button')?.focus();
  }

  async function writeClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* fallback below */ }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    area.remove();
    return ok;
  }

  async function copyIncidentEvidence() {
    if (state.incident) {
      state.incident.reportedAt = state.incident.reportedAt || new Date().toISOString();
      recordIncidentStep('report', 'Report · evidence package', 'Copied to clipboard');
      addNocLog('info', 'Evidence package copied · ' + state.incident.id, 'Synthetic incident JSON copied locally.');
    }
    const content = await incidentEvidenceText();
    await writeClipboard(content);
    if (state.incident) renderNoc();
    showToast('Incident evidence JSON copied.', 'ok');
  }

  async function exportIncidentEvidence() {
    if (state.incident) {
      state.incident.reportedAt = state.incident.reportedAt || new Date().toISOString();
      recordIncidentStep('report', 'Report · evidence package', 'Downloaded as JSON');
      addNocLog('info', 'Evidence package exported · ' + state.incident.id, 'Synthetic incident JSON downloaded locally.');
    }
    const content = await incidentEvidenceText();
    downloadFile('vcss-incident-evidence-' + (state.incident?.id || 'baseline') + '.json', content, 'application/json;charset=utf-8');
    if (state.incident) renderNoc();
    showToast('Incident evidence JSON downloaded.', 'ok');
  }

  function nocHandoffText() {
    const active = state.noc.alarms.filter((alarm) => alarm.state !== 'cleared').sort((a, b) => a.sev - b.sev);
    const scenario = nocScenarioMetrics();
    const counts = { p1: 0, p2: 0, p3: 0, p4: 0, ack: 0 };
    active.forEach((alarm) => {
      counts['p' + alarm.sev] += 1;
      if (alarm.state === 'ack') counts.ack += 1;
    });
    const lines = [
      'VCSS 4G v' + APP_VERSION + ' — NOC / SOC shift handoff',
      'Generated ' + new Date().toISOString() + ' · Shift B · synthetic operations',
      'Simulation only: no RF, EPC, HSS, ticket, pager or SOC integration.',
      '',
      'Queue: ' + active.length + ' active alarms · P1 ' + counts.p1 + ' · P2 ' + counts.p2 + ' · P3 ' + counts.p3 + ' · P4 ' + counts.p4 + ' · acknowledged ' + counts.ack,
      '',
      'Active alarms',
      ...(active.length ? active.map((alarm) => '- [P' + alarm.sev + '][' + nocStatusLabel(alarm) + '] ' + alarm.id + ' — ' + alarm.title + ' — ' + alarm.source) : ['- None']),
      '',
      'Service impact',
      scenario.active
        ? '- Active incident ' + state.incident.id + ': ' + scenario.activeUes + ' virtual UEs on ' + state.rogue.name + '; ' + fmtInt(scenario.modeledSubs) + ' modeled subscribers; ' + compactMoney(scenario.revenueHour) + '/h revenue at risk; ' + compactMoney(scenario.slaCredits) + ' SLA credit exposure.'
        : scenario.contained
          ? '- Incident ' + state.incident.id + ' contained; ' + scenario.affected + ' virtual UEs recovered; evidence package preserved.'
          : '- No active service impact. Baseline transport jitter and RAN housekeeping alarms remain.',
      '',
      'SOC',
      scenario.active ? '- Identity exposure in progress; RF/NMS correlation ' + (state.incident.detected ? state.incident.detectionConfidence + '%' : 'in progress') + '.' : scenario.contained ? '- Evidence sealed; no active identity exposure.' : '- SOC correlation queue idle.',
      '',
      'Owners',
      '- NOC duty manager: ' + NOC_STAFF.manager.name,
      '- Incident commander: ' + NOC_STAFF.commander.name,
      '- RAN on-call: ' + NOC_STAFF.ran.name + ' · Transport: ' + NOC_STAFF.transport.name + ' · SOC: ' + NOC_STAFF.soc.name,
      '',
      'Next actions',
      scenario.active
        ? '- Hold the incident bridge; contain the rogue cell; preserve S1/NAS evidence; verify UE recovery.'
        : counts.p1 + counts.p2 > 0
          ? '- Work the P1/P2 queue, confirm owners and escalate on the 5/15 minute clocks.'
          : '- Continue monitoring S1 jitter and the ANR/PRB housekeeping queue.',
      '',
      'Synthetic data only. Local demo state.',
    ];
    return lines.join('\n');
  }

  async function copyNocHandoff() {
    const text = nocHandoffText();
    if (!(await writeClipboard(text))) {
      showToast('Could not access the clipboard. Open the alarm CSV export instead.', 'warn');
      return;
    }
    state.noc.lastHandoffAt = new Date();
    addNocLog('ok', 'Shift handoff copied', 'Synthetic NOC/SOC handoff generated for Shift B');
    renderNocLog();
    renderNocShift();
    showToast('NOC/SOC shift handoff copied to clipboard.', 'ok');
  }

  function exportNocAlarms() {
    if (!state.noc) return;
    const headers = ['Alarm ID', 'Severity', 'State', 'Domain', 'Source', 'Title', 'Impact', 'Affected UEs', 'Raised UTC', 'Acknowledged UTC', 'Cleared UTC', 'Owner', 'Incident', 'Occurrences', 'Merged incidents', 'Runbook', 'Evidence', 'App version'];
    const rows = [...state.noc.alarms]
      .sort((a, b) => (a.state === 'cleared' ? 1 : 0) - (b.state === 'cleared' ? 1 : 0) || a.sev - b.sev || b.raisedAt - a.raisedAt)
      .map((alarm) => [
        alarm.id,
        'P' + alarm.sev,
        nocStatusLabel(alarm),
        alarm.domain,
        alarm.source,
        alarm.title,
        alarm.impact,
        alarm.affected || 0,
        new Date(alarm.raisedAt).toISOString(),
        alarm.ackAt ? new Date(alarm.ackAt).toISOString() : '',
        alarm.clearedAt ? new Date(alarm.clearedAt).toISOString() : '',
        alarm.owner || '',
        alarm.incidentId || '',
        alarm.occurrences || 1,
        (alarm.mergedFrom || []).join(' | '),
        alarm.runbook.map((step) => step.s).join(' | '),
        alarm.evidence,
        APP_VERSION,
      ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    downloadFile('vcss-4g-noc-alarms.csv', csv, 'text/csv;charset=utf-8');
    addNocLog('info', 'Alarm queue exported', rows.length + ' alarms included in the synthetic CSV export');
    renderNocLog();
    showToast(rows.length + ' alarms exported as CSV.', 'ok');
  }

  /* Shift log · presets · share/import state (v1.4.0) */

  const SCENARIO_PRESETS = {
    baseline: { label: 'Clean baseline' },
    incident: { label: 'Incident in progress', config: SHARE_BTS },
    aftermath: { label: 'Contained aftermath', config: SHARE_BTS },
  };

  function applyScenarioPreset(key) {
    const preset = SCENARIO_PRESETS[key];
    if (!preset) return;
    if (state.containmentRunning) {
      state.runToken += 1;
      state.containmentRunning = false;
    }
    if (key === 'baseline') {
      resetSimulation({ silent: true });
      setTab('rogue');
      showToast('Baseline preset applied · clean site, no rogue cells.', 'ok');
      addNocLog('info', 'Scenario preset · clean baseline', 'Reset to the deployment-free starting state.');
      return;
    }
    resetSimulation({ silent: true });
    deployFakeBTS(preset.config);
    if (key === 'incident') {
      showToast('Incident preset · GhostCell-01 deployed.', 'warn');
      return;
    }
    showToast('Aftermath preset · fast-replay containment running (~4 s).', 'ok');
    setTimeout(() => {
      if (state.rogue && state.incident && !state.incident.contained && !state.containmentRunning) runContainment({ fast: true });
    }, 2450);
  }

  function exportShiftLog() {
    if (!state.noc) state.noc = createNocState();
    const scope = 'Synthetic';
    const headers = ['Recorded UTC', 'Type', 'Entry', 'Detail', 'Scope'];
    const clip = (text) => String(text || '').replace(/\s+/g, ' ').slice(0, 120);
    const rows = [[new Date().toISOString(), 'Meta', 'Shift log generated', 'VCSS ' + APP_VERSION + ' · Shift B · synthetic ops · no external systems', scope]];
    const incident = state.incident;
    if (incident?.steps?.length) {
      incident.steps.forEach((rec) => rows.push([
        rec.at, 'Response step', clip(rec.key + ' · ' + rec.label), clip(rec.status + ' · by ' + rec.by), scope,
      ]));
    } else {
      rows.push([new Date().toISOString(), 'Response step', 'None recorded', incident ? 'Open incident, no steps yet' : 'No incident open; baseline only', scope]);
    }
    state.noc.log.forEach((entry) => rows.push([
      entry.ts instanceof Date ? entry.ts.toISOString() : new Date(entry.ts).toISOString(),
      'Ops log · ' + entry.tone,
      clip(entry.title),
      clip(entry.detail),
      scope,
    ]));
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const stamp = new Date();
    const file = 'vcss-4g-shift-log-' + stamp.getUTCFullYear() + pad(stamp.getUTCMonth() + 1) + pad(stamp.getUTCDate()) + '-' + pad(stamp.getUTCHours()) + pad(stamp.getUTCMinutes()) + 'Z.csv';
    downloadFile(file, csv, 'text/csv;charset=utf-8');
    addNocLog('info', 'Shift log exported', rows.length + ' rows · ops log plus response-step timeline (synthetic only)');
    renderNocLog();
    renderNocShift();
    showToast('Shift log exported · ' + rows.length + ' rows.', 'ok');
  }

  function buildShareState() {
    return JSON.stringify({
      schema: 'vcss-scenario-state/1.0',
      version: APP_VERSION,
      generatedAt: new Date().toISOString(),
      syntheticSimulationOnly: true,
      stage: state.rogue ? (state.incident?.contained ? 'contained' : 'active') : 'baseline',
      bts: state.rogue ? {
        name: state.rogue.name, band: state.rogue.band, pci: state.rogue.pci,
        tac: state.rogue.tac, power: state.rogue.power, targetCount: state.rogue.targetCount,
      } : null,
      incident: state.incident ? {
        id: state.incident.id, detected: !!state.incident.detected, contained: !!state.incident.contained,
        affected: state.incident.affected, note: state.incident.note || '',
      } : null,
      model: { ...state.model },
      limitation: 'Local synthetic browser state. Import reconfigures this browser simulation; nothing is transmitted.',
    }, null, 2);
  }

  function validateShareState(text) {
    let payload = null;
    try { payload = JSON.parse(text); } catch (_) { return { ok: false, error: 'not valid JSON' }; }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, error: 'payload is not an object' };
    if (payload.schema !== 'vcss-scenario-state/1.0') return { ok: false, error: 'bad schema ' + (payload.schema == null ? '(missing)' : String(payload.schema)) };
    if (payload.version !== APP_VERSION) return { ok: false, error: 'version mismatch ' + (payload.version == null ? '(missing)' : String(payload.version)) + ' · expected ' + APP_VERSION };
    if (payload.syntheticSimulationOnly !== true) return { ok: false, error: 'missing synthetic-only marker' };
    if (!['baseline', 'active', 'contained'].includes(payload.stage)) return { ok: false, error: 'unknown stage ' + (payload.stage == null ? '(missing)' : String(payload.stage)) };
    if (payload.model && typeof payload.model !== 'object') return { ok: false, error: 'model block is not an object' };
    if (payload.stage !== 'baseline') {
      const bts = payload.bts;
      if (!bts || typeof bts !== 'object') return { ok: false, error: 'missing BTS config for stage ' + payload.stage };
      if (typeof bts.name !== 'string' || !bts.name.trim()) return { ok: false, error: 'fake BTS name is missing' };
    }
    return { ok: true, payload };
  }

  function importShareState(text) {
    const validated = validateShareState(text);
    if (!validated.ok) {
      showToast('Import rejected · ' + validated.error + '.', 'bad');
      addNocLog('warn', 'Scenario state import rejected', 'Validation: ' + validated.error);
      return false;
    }
    const payload = validated.payload;
    resetSimulation({ silent: true });
    if (payload.model && typeof payload.model === 'object') {
      Object.entries(payload.model).forEach(([key, value]) => {
        if (key in state.model && typeof value === 'number' && Number.isFinite(value)) state.model[key] = value;
      });
    }
    if (payload.stage !== 'baseline' && payload.bts) {
      deployFakeBTS({
        name: payload.bts.name, pci: payload.bts.pci, tac: payload.bts.tac,
        band: payload.bts.band, power: payload.bts.power, targetCount: payload.bts.targetCount,
      });
      if (payload.stage === 'contained') {
        showToast('Contained-stage state imported · fast-replay containment finishing.', 'ok');
        setTimeout(() => {
          if (state.rogue && state.incident && !state.incident.contained && !state.containmentRunning) runContainment({ fast: true });
        }, 2450);
      }
    }
    if (payload.incident?.note && state.incident) state.incident.note = String(payload.incident.note).slice(0, 400);
    syncModelControls();
    refreshAll();
    showToast('Scenario state imported · stage ' + payload.stage + '.', 'ok');
    addNocLog('info', 'Scenario state imported', 'Schema vcss-scenario-state/1.0 validated · stage ' + payload.stage + ' restored locally.');
    return true;
  }

  async function copyShareState() {
    const copied = await writeClipboard(buildShareState());
    if (copied) {
      addNocLog('info', 'Scenario state copied', 'Compact vcss-scenario-state/1.0 record placed on the local clipboard.');
      showToast('Scenario state JSON copied · schema vcss-scenario-state/1.0.', 'ok');
    } else {
      openScenarioStateModal('share');
      showToast('Clipboard unavailable — copy the JSON from the dialog.', 'warn');
    }
  }

  function openScenarioStateModal(mode) {
    const root = $('#modalRoot');
    if (!root) return;
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isImport = mode === 'import';
    const shareText = isImport ? '' : buildShareState();
    root.innerHTML = `<div class="modal-backdrop"><section class="modal state-modal" role="dialog" aria-modal="true" aria-labelledby="stateModalTitle"><div class="modal-head"><div><h2 id="stateModalTitle">${isImport ? 'Import scenario state' : 'Copy scenario state'}</h2><p>${isImport
      ? 'Paste a vcss-scenario-state/1.0 record · schema and version are validated.'
      : 'Compact local JSON of the current scenario · paste into Import here or in another local session.'}</p></div><button class="icon-btn" type="button" data-close="modal" aria-label="Close dialog">×</button></div><div class="modal-body"><label class="state-label" for="stateJsonInput">${isImport ? 'State JSON to validate' : 'Current state JSON'}</label><textarea id="stateJsonInput" rows="12" spellcheck="false" ${isImport ? '' : 'readonly'} placeholder='${isImport ? '{"schema":"vcss-scenario-state/1.0",…}' : ''}'>${isImport ? '' : esc(shareText)}</textarea><p class="state-note">Simulation data only · stays in this browser · no network.</p></div><div class="modal-foot"><button class="btn btn-ghost" type="button" data-close="modal">Close</button><button class="btn btn-primary" type="button" data-state-action="${isImport ? 'import' : 'copy'}">${isImport ? 'Validate &amp; import' : 'Copy JSON'}</button></div></section></div>`;
    document.body.style.overflow = 'hidden';
    root.querySelectorAll('[data-close="modal"]').forEach((button) => button.addEventListener('click', closeModal));
    root.querySelector('.modal-backdrop')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) closeModal(); });
    root.querySelector('[data-state-action]')?.addEventListener('click', async (event) => {
      const box = root.querySelector('#stateJsonInput');
      if (!box) return;
      if (event.currentTarget.dataset.stateAction === 'import') {
        if (importShareState(box.value)) closeModal();
        return;
      }
      if (await writeClipboard(box.value)) showToast('Scenario state JSON copied.', 'ok');
    });
    (isImport ? root.querySelector('#stateJsonInput') : root.querySelector('[data-state-action]'))?.focus();
  }

  /* ==========================================================================
     UI: modal, drawer, toast, exports
     ========================================================================== */

  function showToast(message, tone = 'ok') {
    const wrap = $('#toastWrap');
    if (!wrap) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + tone;
    const icon = tone === 'bad' || tone === 'warn' ? 'i-alert' : 'i-check';
    toast.innerHTML = `<svg class="icon"><use href="#${icon}"></use></svg><span>${esc(message)}</span>`;
    wrap.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 240);
    }, 4200);
  }

  function trapFocus(event, root) {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const nodes = $$(selector, root).filter((el) => el.getClientRects().length > 0);
    if (!nodes.length) {
      event.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !root.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ---- v1.6.0 landing gate: hashless loads get the animated arrival screen;
     deep links (any #tab) and post-entry reloads skip straight to the app. ---- */
  function gateEl() { return $('#landingGate'); }
  function gateOpen() { const gate = gateEl(); return !!gate && !gate.hidden; }
  function setGateInert(on) {
    [$('.app-shell'), $('.skip-link')].forEach((el) => {
      if (!el) return;
      if (on) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
  }
  function initGate(hadHash) {
    const gate = gateEl();
    if (!gate || hadHash) return;
    gate.hidden = false;
    setGateInert(true);
    /* v1.8.0 gate parallax: cursor drives --gx/--gy (-1..1) for the CSS side
       (core/stage forward, aurora blobs counter). Skipped under reduced motion. */
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gate.addEventListener('pointermove', (e) => {
        const r = gate.getBoundingClientRect();
        gate.style.setProperty('--gx', ((e.clientX - r.left) / r.width * 2 - 1).toFixed(3));
        gate.style.setProperty('--gy', ((e.clientY - r.top) / r.height * 2 - 1).toFixed(3));
      }, { passive: true });
    }
    setTimeout(() => $('#gateEnter')?.focus(), 90);
  }
  function enterApp(options = {}) {
    const gate = gateEl();
    if (!gate || gate.hidden) return;
    const finish = () => {
      gate.hidden = true;
      gate.classList.remove('gate-leaving');
      setGateInert(false);
      document.body.classList.add('app-entered');
      if (options.focus !== false) $('#main')?.focus({ preventScroll: true });
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    gate.classList.add('gate-leaving');
    setTimeout(finish, 600);
  }

  function restoreFocusTo(target, fallbackSelector) {
    setTimeout(() => {
      if (target && document.contains(target) && target.getClientRects().length) {
        target.focus();
        return;
      }
      const fallback = fallbackSelector ? $(fallbackSelector) : null;
      if (fallback && fallback.getClientRects().length) {
        fallback.focus();
        return;
      }
      $('#tab-' + state.tab)?.focus();
    }, 0);
  }

  function openFakeModal() {
    if (state.rogue && !state.incident?.contained) {
      setTab('rogue');
      showToast('A fake BTS is already active. Contain or reset the scenario first.', 'warn');
      return;
    }
    const root = $('#modalRoot');
    if (!root) return;
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="fakeModalTitle">
          <div class="modal-head">
            <div><h2 id="fakeModalTitle">Deploy a simulated fake BTS</h2><p>Add a rogue LTE cell to the VCSS test range and watch the MNO impact unfold.</p></div>
            <button class="icon-btn" type="button" data-close="modal" aria-label="Close dialog"><svg class="icon"><use href="#i-x"></use></svg></button>
          </div>
          <form id="fakeForm">
            <div class="modal-body">
              <div class="modal-warning"><svg class="icon"><use href="#i-alert"></use></svg><span>Defensive simulation only. No RF is transmitted and no real subscriber identity is used. This configures a synthetic incident inside the browser.</span></div>
              ${state.incident?.contained ? '<div class="modal-warning"><svg class="icon"><use href="#i-alert"></use></svg><span>Deploying a new scenario clears the contained incident evidence and affected-UE snapshot.</span></div>' : ''}
              <div class="form-grid">
                <label class="form-field full"><span>Rogue cell name</span><input id="fakeName" name="name" type="text" maxlength="28" value="GhostCell-01" required></label>
                <label class="form-field"><span>Band</span><select id="fakeBand" name="band"><option value="3">Band 3 · 1800 MHz</option><option value="7">Band 7 · 2600 MHz</option><option value="20">Band 20 · 800 MHz</option></select></label>
                <label class="form-field"><span>PCI</span><input id="fakePci" name="pci" type="number" min="0" max="503" value="412" required></label>
                <label class="form-field"><span>TAC</span><input id="fakeTac" name="tac" type="number" min="1" max="65535" value="9999" required></label>
                <label class="form-field"><span>Tx power <output id="fakePowerOut">46 dBm</output></span><input id="fakePower" name="power" type="range" min="30" max="46" step="1" value="46"></label>
                <label class="form-field full"><span>Virtual UEs to reselect <output id="fakeTargetOut">7 UEs</output></span><input id="fakeTarget" name="target" type="range" min="4" max="10" step="1" value="7"></label>
              </div>
            </div>
            <div class="modal-foot">
              <button class="btn btn-ghost" type="button" data-close="modal">Cancel</button>
              <button class="btn btn-rogue" type="submit"><svg class="icon"><use href="#i-radio"></use></svg>Deploy fake BTS</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.style.overflow = 'hidden';
    const power = $('#fakePower');
    const target = $('#fakeTarget');
    power?.addEventListener('input', () => { setText('#fakePowerOut', power.value + ' dBm'); });
    target?.addEventListener('input', () => { setText('#fakeTargetOut', target.value + ' UEs'); });
    root.querySelector('.modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeModal();
    });
    root.querySelectorAll('button[data-close="modal"]').forEach((button) => button.addEventListener('click', closeModal));
    $('#fakeForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const pciValue = Number($('#fakePci')?.value);
      const tacValue = Number($('#fakeTac')?.value);
      const config = {
        name: ($('#fakeName')?.value || 'GhostCell-01').trim() || 'GhostCell-01',
        band: Number($('#fakeBand')?.value || 3),
        pci: Number.isFinite(pciValue) ? pciValue : 412,
        tac: Number.isFinite(tacValue) ? tacValue : 9999,
        power: Number($('#fakePower')?.value || 46),
        targetCount: Number($('#fakeTarget')?.value || 7),
      };
      if (!Number.isInteger(config.pci) || config.pci < 0 || config.pci > 503) { showToast('PCI must be an integer between 0 and 503.', 'bad'); return; }
      if (!Number.isInteger(config.tac) || config.tac < 1 || config.tac > 65535) { showToast('TAC must be an integer between 1 and 65535.', 'bad'); return; }
      closeModal();
      deployFakeBTS(config);
    });
    setTimeout(() => $('#fakeName')?.focus(), 40);
  }

  function closeModal(restoreFocus = true) {
    const root = $('#modalRoot');
    if (root) root.innerHTML = '';
    document.body.style.overflow = '';
    const target = modalReturnFocus;
    modalReturnFocus = null;
    if (restoreFocus) restoreFocusTo(target, '#addFakeBtn');
  }

  function openDrawer(ueId) {
    const ue = state.ues.find((item) => item.id === ueId);
    if (!ue) return;
    const root = $('#drawerRoot');
    if (!root) return;
    drawerReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isRogue = ue.state === 'rogue';
    const securityText = isRogue ? 'IMSI disclosed to unverified cell' : ue.security;
    root.innerHTML = `
      <div class="drawer-backdrop">
        <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
          <div class="drawer-head">
            <div><h2 id="drawerTitle">${esc(ue.id)}</h2><p>${esc(ue.imsi)} · ${esc(ue.device)}</p></div>
            <button class="icon-btn" type="button" data-action="close-drawer" aria-label="Close subscriber details"><svg class="icon"><use href="#i-x"></use></svg></button>
          </div>
          <div class="drawer-body">
            ${ue.story ? `<div class="drawer-section drawer-story"><h3>Profile</h3><p>${esc(ue.story)}</p><small>Synthetic persona for training narratives — not a real subscriber.</small></div>` : ''}
            ${isRogue ? '<div class="drawer-alert"><svg class="icon"><use href="#i-alert"></use></svg><span>This virtual UE is camped on a simulated rogue cell. Its IMSI has been exposed before authentication. Synthetic data only.</span></div>' : ''}
            <div class="drawer-section">
              <h3>Identity &amp; device</h3>
              <div class="detail-list">
                <div><span>IMSI</span><b>${esc(ue.imsi)}</b></div>
                <div><span>MSISDN</span><b>${esc(ue.msisdn)}</b></div>
                <div><span>IMEI</span><b>${esc(ue.imei)}</b></div>
                <div><span>Device</span><b>${esc(ue.device)}</b></div>
                <div><span>Category</span><b>${esc(ue.category)}</b></div>
                <div><span>APN</span><b>${esc(ue.apn)}</b></div>
              </div>
            </div>
            <div class="drawer-section">
              <h3>Radio &amp; session</h3>
              <div class="detail-list">
                <div><span>State</span><b>${esc(ue.state)}</b></div>
                <div><span>Serving cell</span><b>${esc(ue.serving)}</b></div>
                <div><span>RSRP / RSRQ</span><b>${ue.rsrp.toFixed(1)} / ${ue.rsrq.toFixed(1)} dB</b></div>
                <div><span>SINR / CQI</span><b>${ue.sinr.toFixed(1)} dB / ${ue.cqi}</b></div>
                <div><span>DL / UL</span><b>${ue.dl.toFixed(1)} / ${ue.ul.toFixed(1)} Mbps</b></div>
                <div><span>IP address</span><b>${esc(ue.ip)}</b></div>
                <div><span>QCI</span><b>${ue.qci}</b></div>
                <div><span>Data usage</span><b>${ue.dataGb.toFixed(1)} GB</b></div>
              </div>
            </div>
            <div class="drawer-section">
              <h3>Security</h3>
              <div class="detail-list">
                <div><span>NAS security</span><b>${esc(securityText)}</b></div>
                <div><span>Last procedure</span><b>${esc(ue.lastProcedure)}</b></div>
                <div><span>Last seen</span><b>${fmtTime(ue.lastSeen)} UTC</b></div>
                <div><span>Monthly ARPU</span><b>${fmtMoney2(ue.arpu)}</b></div>
              </div>
            </div>
            <div class="drawer-actions">
              <button class="btn btn-primary btn-sm" type="button" data-action="trace-ue" data-ue-id="${esc(ue.id)}"><svg class="icon"><use href="#i-activity"></use></svg>Trace attach</button>
              <button class="btn btn-outline btn-sm" type="button" data-action="release-ue" data-ue-id="${esc(ue.id)}">${isRogue ? 'Recover UE' : 'Release UE'}</button>
              <button class="btn btn-ghost btn-sm" type="button" data-action="close-drawer">Close</button>
            </div>
          </div>
        </aside>
      </div>
    `;
    document.body.style.overflow = 'hidden';
    root.querySelector('.drawer-backdrop')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeDrawer();
    });
    setTimeout(() => root.querySelector('[data-action="close-drawer"]')?.focus(), 40);
  }

  function closeDrawer(restoreFocus = true) {
    const root = $('#drawerRoot');
    if (root) root.innerHTML = '';
    document.body.style.overflow = '';
    const target = drawerReturnFocus;
    drawerReturnFocus = null;
    if (restoreFocus) restoreFocusTo(target, '#ueSearch');
  }

  function traceUE(ueId) {
    closeDrawer(false);
    setTab('signaling');
    initSignaling();
    state.trace.ueId = ueId;
    setProcedure('attach');
    state.trace.ueId = ueId;
    updateTraceSubjectOptions();
    setText('#traceUe', ueId);
    resetTrace();
    startTrace();
    setTimeout(() => $('#tracePlay')?.focus(), 0);
  }

  function releaseUE(ueId) {
    const ue = state.ues.find((item) => item.id === ueId);
    if (!ue) return;
    if (ue.state === 'rogue') {
      restoreUeFromRogue(ue);
      addEvent('ok', ue.id + ' recovered to macro layer', 'Identity exposure ended · EPS-AKA session restored');
      showToast(ue.id + ' recovered to the macro layer.', 'ok');
    } else {
      ue.state = 'detached';
      ue.serving = '—';
      ue.ip = '—';
      ue.dl = 0;
      ue.ul = 0;
      ue.security = 'No session';
      ue.lastProcedure = 'Detach';
      ue.lastSeen = new Date();
      ue.rogueId = null;
      addEvent('info', ue.id + ' released from VCSS', 'Detach complete · bearer and IP address released');
      showToast(ue.id + ' detached from the virtual cell.', 'ok');
    }
    closeDrawer();
    refreshAll();
  }

  function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
    const payload = /^text\/csv/i.test(mime) && !String(content).startsWith('\uFEFF') ? '\uFEFF' + content : content;
    const blob = new Blob([payload], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function csvCell(value) {
    let text = String(value ?? '');
    // Neutralise spreadsheet formula prefixes (OWASP CSV injection guidance).
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function exportUesCsv() {
    const headers = ['UE ID', 'IMSI', 'MSISDN', 'IMEI', 'Device', 'Type', 'Category', 'State', 'Serving cell', 'RSRP dBm', 'SINR dB', 'CQI', 'DL Mbps', 'UL Mbps', 'Security', 'APN', 'IP', 'Last procedure', 'App version'];
    const rows = state.ues.map((ue) => [ue.id, ue.imsi, ue.msisdn, ue.imei, ue.device, ue.type, ue.category, ue.state, ue.serving, ue.rsrp, ue.sinr, ue.cqi, ue.dl, ue.ul, ue.security, ue.apn, ue.ip, ue.lastProcedure, APP_VERSION]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    downloadFile('vcss-4g-virtual-ues.csv', csv, 'text/csv;charset=utf-8');
    showToast('Virtual UE registry exported as CSV.', 'ok');
  }

  function businessSummaryText() {
    const m = modelImpact();
    return [
      'VCSS 4G — MNO business case summary',
      'Synthetic planning model · no RF transmission',
      '',
      'Scenario',
      `Subscribers in coverage zone: ${fmtInt(state.model.zoneSubs)}`,
      `Subscriber exposure rate: ${fmtPct(state.model.exposure)}`,
      `Expected incidents per year: ${Number(state.model.annualIncidents).toFixed(1)}`,
      `Affected subscribers: ${fmtInt(m.affected)}`,
      `Incident duration: ${state.model.duration} hours`,
      `Monthly ARPU: ${fmtMoney2(state.model.arpu)}`,
      `Churn uplift: ${fmtPct(state.model.churn)}`,
      `Subscriber LTV: ${fmtMoney(state.model.ltv)}`,
      '',
      'Impact',
      `Revenue leakage: ${fmtMoney(m.revenue)}`,
      `Service credits: ${fmtMoney(m.credits)}`,
      `Customer care: ${fmtMoney(m.care)}`,
      `Churn / LTV: ${fmtMoney(m.churn)}`,
      `Regulatory & brand: ${fmtMoney(m.fixed)}`,
      `Incident response: ${fmtMoney(m.response)}`,
      `Modeled exposure per incident: ${fmtMoney(m.total)}`,
      `Annual modeled exposure: ${fmtMoney(m.annualTotal)}`,
      '',
      'VCSS value',
      `Detection effectiveness: ${fmtPct(state.model.effectiveness, 0)}`,
      `Annual loss avoided: ${fmtMoney(m.avoided)}`,
      `Annual VCSS program: ${fmtMoney(state.model.program)}`,
      `Net benefit: ${fmtMoney(m.net)}`,
      `ROI: ${Math.round(m.roi)}%`,
      `Payback: ${m.payback ? m.payback.toFixed(1) + ' months' : '—'}`,
      '',
      'All figures are illustrative and use synthetic assumptions.',
    ].join('\n');
  }

  async function copySummary() {
    const text = businessSummaryText();
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { copied = document.execCommand('copy'); } catch (err) { copied = false; }
      area.remove();
    }
    showToast(copied ? 'Business case summary copied to clipboard.' : 'Could not access the clipboard. Use CSV export instead.', copied ? 'ok' : 'warn');
  }

  function downloadBusinessCsv() {
    const m = modelImpact();
    const rows = [
      ['VCSS 4G business case — synthetic model'],
      ['App version', APP_VERSION],
      [],
      ['Assumption', 'Value'],
      ...MODEL_FIELDS.map((field) => [field.label, field.fmt(state.model[field.key])]),
      [],
      ['Impact', 'USD'],
      ['Affected subscribers', Math.round(m.affected)],
      ['Revenue leakage', Math.round(m.revenue)],
      ['Service credits', Math.round(m.credits)],
      ['Customer care', Math.round(m.care)],
      ['Churn / LTV', Math.round(m.churn)],
      ['Regulatory & brand', Math.round(m.fixed)],
      ['Incident response', Math.round(m.response)],
      ['Modeled exposure per incident', Math.round(m.total)],
      ['Annual modeled exposure', Math.round(m.annualTotal)],
      ['Annual loss avoided', Math.round(m.avoided)],
      ['Annual VCSS program', Math.round(state.model.program)],
      ['Net benefit', Math.round(m.net)],
      ['ROI percent', Math.round(m.roi)],
      ['Payback months', Number(m.payback.toFixed(1))],
      [],
      ['Notice', 'Illustrative synthetic data. No RF transmission or live network integration.'],
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    downloadFile('vcss-4g-business-case.csv', csv, 'text/csv;charset=utf-8');
    showToast('Business case model exported as CSV.', 'ok');
  }

  /* ==========================================================================
     3D emulation — synthetic RAN volume
     A dependency-free canvas renderer with perspective projection, orbit and
     zoom controls, layer toggles and node selection. Geometry only; no RF.
     ========================================================================== */

  const TAU = Math.PI * 2;
  const SCENE_FOV = (46 * Math.PI) / 180;
  const SCENE_NEAR = 1.5;

  const SCENE3D = {
    macro: { x: 0, z: 0, height: 27, radius: 38, pci: 127 },
    neighbors: [
      { id: 'NBR-118', x: -54, z: -28, height: 20, radius: 27, pci: 118 },
      { id: 'NBR-203', x: 50, z: 34, height: 20, radius: 27, pci: 203 },
      { id: 'NBR-077', x: 8, z: -60, height: 20, radius: 27, pci: 77 },
    ],
    rogue: { x: 48, z: 12, height: 19, radius: 21 },
  };

  const SCENE_PRESETS = {
    iso: { theta: -0.68, phi: 0.52, zoom: 1.04, target: { x: 0, y: 8, z: 0 } },
    top: { theta: 0, phi: 1.33, zoom: 0.62, target: { x: 0, y: 6, z: -15 } },
    ground: { theta: -0.68, phi: 0.2, zoom: 1.08, target: { x: 0, y: 12, z: 0 } },
  };

  const SCENE_HEADINGS = {
    north: { theta: Math.PI, phi: 0.42, zoom: 0.88, target: { x: 0, y: 9, z: 0 } },
    east: { theta: Math.PI / 2, phi: 0.42, zoom: 0.88, target: { x: 0, y: 9, z: 0 } },
    south: { theta: 0, phi: 0.42, zoom: 0.88, target: { x: 0, y: 9, z: 0 } },
    west: { theta: -Math.PI / 2, phi: 0.42, zoom: 0.88, target: { x: 0, y: 9, z: 0 } },
  };

  const SCENE_BOOKMARK_KEY = 'vcss-3d-camera';

  const scene = {
    ready: false,
    active: false,
    running: false,
    canvas: null,
    stage: null,
    ctx: null,
    w: 0,
    h: 0,
    dpr: 1,
    raf: 0,
    lastFrame: 0,
    fps: 60,
    fpsFrames: 0,
    fpsTime: 0,
    telemetryAt: 0,
    reduced: false,
    reducedQuery: null,
    resizeObserver: null,
    camera: { theta: -0.68, phi: 0.52, zoom: 1.04, target: { x: 0, y: 8, z: 0 } },
    tween: null,
    autoOrbit: false,
    layers: { coverage: true, beams: true, ues: true, links: true, grid: true, labels: true },
    drag: { active: false, moved: false, pointerId: null, x: 0, y: 0, startX: 0, startY: 0 },
    pointers: new Map(),
    pinch: null,
    hover: null,
    selected: null,
    savedCamera: null,
    everActivated: false,
    hits: [],
    labels: [],
    palette: null,
  };

  function sceneCssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function scenePalette() {
    if (scene.palette) return scene.palette;
    scene.palette = {
      skyTop: sceneCssVar('--scene-sky-top', 'rgba(5,13,21,.45)'),
      skyMid: sceneCssVar('--scene-sky-mid', 'rgba(6,19,30,.2)'),
      skyBottom: sceneCssVar('--scene-sky-bottom', 'rgba(3,10,16,.8)'),
      pool: sceneCssVar('--scene-pool', 'rgba(45,212,191,.075)'),
      groundFill: sceneCssVar('--scene-ground-fill', 'rgba(7,20,30,.55)'),
      groundStroke: sceneCssVar('--scene-ground-stroke', 'rgba(151,180,207,.08)'),
      gridMajor: sceneCssVar('--scene-grid-major', 'rgba(94,234,212,.14)'),
      gridMinor: sceneCssVar('--scene-grid-minor', 'rgba(151,180,207,.075)'),
      ringOuter: sceneCssVar('--scene-ring-outer', 'rgba(151,180,207,.16)'),
      ringInner: sceneCssVar('--scene-ring-inner', 'rgba(94,234,212,.09)'),
      labelBg: sceneCssVar('--scene-label-bg', 'rgba(4,12,19,.84)'),
      labelBorder: sceneCssVar('--scene-label-border', 'rgba(151,180,207,.2)'),
      labelTitle: sceneCssVar('--scene-label-title', '#e2f2fb'),
      labelSub: sceneCssVar('--scene-label-sub', 'rgba(141,164,186,.92)'),
      compassBg: sceneCssVar('--scene-compass-bg', 'rgba(4,12,19,.66)'),
      compassStroke: sceneCssVar('--scene-compass-stroke', 'rgba(151,180,207,.2)'),
      compassText: sceneCssVar('--scene-compass-text', 'rgba(141,164,186,.9)'),
      macro: sceneCssVar('--scene-macro', '#5eead4'),
      neighbor: sceneCssVar('--scene-neighbor', '#60a5fa'),
      rogue: sceneCssVar('--scene-rogue', '#fb7185'),
      connected: sceneCssVar('--scene-connected', '#5eead4'),
      idle: sceneCssVar('--scene-idle', '#8da4ba'),
      detached: sceneCssVar('--scene-detached', '#4d6379'),
      contained: sceneCssVar('--scene-contained', '#94a3b8'),
    };
    return scene.palette;
  }

  function sceneRgba(hex, alpha) {
    const value = parseInt(hex.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + clamp(alpha, 0, 1) + ')';
  }

  function sceneVec(x, y, z) { return { x, y, z }; }
  function sceneSub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function sceneDot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function sceneCross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }
  function sceneNormalize(v) {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  function sceneFitDistance() {
    const aspect = Math.max(0.4, scene.w / Math.max(1, scene.h));
    const halfV = SCENE_FOV / 2;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const widthNeed = scene.w < 520 ? 145 : 132;
    const heightNeed = 100;
    const distW = (widthNeed / 2) / Math.max(0.05, Math.tan(halfH));
    const distH = (heightNeed / 2) / Math.max(0.05, Math.tan(halfV));
    return Math.max(104, distW, distH);
  }

  function sceneCamera() {
    const cam = scene.camera;
    const distance = sceneFitDistance() / clamp(cam.zoom, 0.55, 2.1);
    const cp = Math.cos(cam.phi);
    const sp = Math.sin(cam.phi);
    const ct = Math.cos(cam.theta);
    const st = Math.sin(cam.theta);
    const pos = {
      x: cam.target.x + distance * cp * st,
      y: cam.target.y + distance * sp,
      z: cam.target.z + distance * cp * ct,
    };
    const forward = sceneNormalize(sceneSub(cam.target, pos));
    const right = sceneNormalize(sceneCross(forward, { x: 0, y: 1, z: 0 }));
    const up = sceneCross(right, forward);
    const focal = (scene.h / 2) / Math.tan(SCENE_FOV / 2);
    return { pos, forward, right, up, focal, cx: scene.w / 2, cy: scene.h / 2, distance };
  }

  function sceneToCam(p, cam) {
    const rx = p.x - cam.pos.x;
    const ry = p.y - cam.pos.y;
    const rz = p.z - cam.pos.z;
    return {
      x: rx * cam.right.x + ry * cam.right.y + rz * cam.right.z,
      y: rx * cam.up.x + ry * cam.up.y + rz * cam.up.z,
      z: rx * cam.forward.x + ry * cam.forward.y + rz * cam.forward.z,
    };
  }

  function sceneScreen(c, cam) {
    const s = cam.focal / Math.max(c.z, 0.001);
    return { x: cam.cx + c.x * s, y: cam.cy - c.y * s, z: c.z, s };
  }

  function sceneProject(p, cam) {
    const c = sceneToCam(p, cam);
    if (c.z <= SCENE_NEAR) return null;
    return sceneScreen(c, cam);
  }

  function sceneCamLerp(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: Math.max(SCENE_NEAR + 0.001, a.z + (b.z - a.z) * t),
    };
  }

  function sceneClipSegment(a, b, cam) {
    let ca = sceneToCam(a, cam);
    let cb = sceneToCam(b, cam);
    if (ca.z <= SCENE_NEAR && cb.z <= SCENE_NEAR) return null;
    if (ca.z <= SCENE_NEAR) {
      const t = (SCENE_NEAR - ca.z) / (cb.z - ca.z);
      ca = sceneCamLerp(ca, cb, t);
    } else if (cb.z <= SCENE_NEAR) {
      const t = (SCENE_NEAR - cb.z) / (ca.z - cb.z);
      cb = sceneCamLerp(cb, ca, t);
    }
    return [sceneScreen(ca, cam), sceneScreen(cb, cam)];
  }

  function sceneDepthAlpha(depth, min = 0.25, max = 1) {
    return clamp(1.2 - depth / 260, min, max);
  }

  function sceneLine(ctx, a, b, cam, color, width = 1) {
    const seg = sceneClipSegment(a, b, cam);
    if (!seg) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(seg[0].x, seg[0].y);
    ctx.lineTo(seg[1].x, seg[1].y);
    ctx.stroke();
    ctx.restore();
  }

  function scenePolyline(ctx, points, cam, color, width = 1, dash = null, closed = false, dashOffset = 0) {
    if (!points.length) return;
    const list = closed ? points.concat([points[0]]) : points;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    if (dashOffset) ctx.lineDashOffset = dashOffset;
    ctx.beginPath();
    let previous = null;
    for (let i = 0; i < list.length - 1; i += 1) {
      const seg = sceneClipSegment(list[i], list[i + 1], cam);
      if (!seg) { previous = null; continue; }
      if (!previous || Math.hypot(previous.x - seg[0].x, previous.y - seg[0].y) > 0.5) {
        ctx.moveTo(seg[0].x, seg[0].y);
      }
      ctx.lineTo(seg[1].x, seg[1].y);
      previous = seg[1];
    }
    ctx.stroke();
    ctx.restore();
  }

  function scenePolygon(ctx, points, cam, fill, stroke = null, lineWidth = 1) {
    const camPoints = points.map((p) => sceneToCam(p, cam));
    const clipped = [];
    for (let i = 0; i < camPoints.length; i += 1) {
      const a = camPoints[i];
      const b = camPoints[(i + 1) % camPoints.length];
      const aIn = a.z > SCENE_NEAR;
      const bIn = b.z > SCENE_NEAR;
      if (aIn) clipped.push(a);
      if (aIn !== bIn) {
        const t = (SCENE_NEAR - a.z) / (b.z - a.z);
        clipped.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: SCENE_NEAR + 0.01,
        });
      }
    }
    if (clipped.length < 3) return;
    ctx.beginPath();
    clipped.forEach((c, index) => {
      const s = sceneScreen(c, cam);
      if (index === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function sceneCircle(cx, cz, radius, segments = 72, y = 0.06) {
    const points = [];
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * TAU;
      points.push({ x: cx + Math.cos(a) * radius, y, z: cz + Math.sin(a) * radius });
    }
    return points;
  }

  function sceneSector(cx, cz, radius, angle, halfAngle, segments = 20, y = 0.08) {
    const points = [{ x: cx, y, z: cz }];
    for (let i = 0; i <= segments; i += 1) {
      const a = angle - halfAngle + (i / segments) * halfAngle * 2;
      points.push({ x: cx + Math.cos(a) * radius, y, z: cz + Math.sin(a) * radius });
    }
    return points;
  }

  function drawGroundCircle(ctx, cam, cx, cz, radius, color, width = 1, dash = null, dashOffset = 0) {
    scenePolyline(ctx, sceneCircle(cx, cz, radius), cam, color, width, dash, true, dashOffset);
  }

  function sceneRoundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function drawSceneLabel(ctx, x, y, title, sub, color, placed = null) {
    const palette = scenePalette();
    ctx.save();
    ctx.font = '600 9px "Segoe UI", system-ui, sans-serif';
    const titleWidth = ctx.measureText(title).width;
    ctx.font = '500 7px Consolas, monospace';
    const subWidth = sub ? ctx.measureText(sub).width : 0;
    const width = Math.ceil(Math.max(titleWidth, subWidth) + 16);
    const height = sub ? 27 : 17;
    const bx = clamp(x - width / 2, 6, Math.max(6, scene.w - width - 6));
    let by = clamp(y - height, 6, Math.max(6, scene.h - height - 6));
    if (placed) {
      for (let pass = 0; pass < 5; pass += 1) {
        const overlap = placed.find((rect) => !(
          bx + width + 4 <= rect.x
          || bx >= rect.x + rect.w + 4
          || by + height + 4 <= rect.y
          || by >= rect.y + rect.h + 4
        ));
        if (!overlap) break;
        by = clamp(overlap.y - height - 5, 6, Math.max(6, scene.h - height - 6));
        if (by === 6 && overlap.y < 40) {
          by = clamp(overlap.y + overlap.h + 5, 6, Math.max(6, scene.h - height - 6));
        }
      }
      placed.push({ x: bx, y: by, w: width, h: height });
    }
    sceneRoundRect(ctx, bx, by, width, height, 5);
    ctx.fillStyle = palette.labelBg;
    ctx.fill();
    ctx.strokeStyle = palette.labelBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(bx + 4, by + 4, 2, height - 8);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 9px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = palette.labelTitle;
    ctx.fillText(title, bx + 10, by + (sub ? 9 : height / 2));
    if (sub) {
      ctx.font = '500 7px Consolas, monospace';
      ctx.fillStyle = palette.labelSub;
      ctx.fillText(sub, bx + 10, by + 19);
    }
    ctx.restore();
  }

  function sceneMacroRadius() {
    return SCENE3D.macro.radius * (0.86 + ((clamp(state.cell.txPower, 20, 46) - 20) / 26) * 0.26);
  }

  function getSceneTowers() {
    const macroRadius = sceneMacroRadius();
    const palette = scenePalette();
    const towers = [{
      type: 'macro',
      id: 'MACRO',
      label: CELL.name,
      sub: 'PCI ' + state.cell.pci + ' · ' + state.ues.filter((ue) => ue.state !== 'detached' && ue.state !== 'rogue').length + ' UEs',
      x: SCENE3D.macro.x,
      z: SCENE3D.macro.z,
      height: SCENE3D.macro.height,
      radius: macroRadius,
      pci: state.cell.pci,
      color: palette.macro,
      sectors: [0, 120, 240],
    }];
    SCENE3D.neighbors.forEach((n) => {
      towers.push({
        type: 'neighbor',
        id: n.id,
        label: n.id,
        sub: 'PCI ' + n.pci + ' · neighbor',
        x: n.x,
        z: n.z,
        height: n.height,
        radius: n.radius,
        pci: n.pci,
        color: palette.neighbor,
        sectors: [30, 150, 270],
      });
    });
    if (state.rogue) {
      const contained = !!state.incident?.contained;
      towers.push({
        type: 'rogue',
        id: state.rogue.id,
        label: state.rogue.name,
        sub: contained ? 'contained · evidence' : 'PCI ' + state.rogue.pci + ' · rogue',
        x: SCENE3D.rogue.x,
        z: SCENE3D.rogue.z,
        height: SCENE3D.rogue.height,
        radius: SCENE3D.rogue.radius,
        pci: state.rogue.pci,
        color: contained ? palette.contained : palette.rogue,
        sectors: [45, 165, 285],
        contained,
      });
    }
    return towers;
  }

  function sceneUeColor(ue) {
    const palette = scenePalette();
    if (ue.state === 'rogue') return palette.rogue;
    if (ue.state === 'connected') return palette.connected;
    if (ue.state === 'idle') return palette.idle;
    return palette.detached;
  }

  function sceneUeWorld(ue) {
    const angle = ue.topoAngle;
    if (ue.state === 'rogue' && state.rogue) {
      const radius = 6 + ((ue.topoRadius % 55) / 55) * 11;
      return {
        x: SCENE3D.rogue.x + Math.cos(angle) * radius,
        y: 1.25,
        z: SCENE3D.rogue.z + Math.sin(angle) * radius,
      };
    }
    const radius = 7 + ((ue.topoRadius - 30) / 95) * 27;
    return { x: Math.cos(angle) * radius, y: 1.25, z: Math.sin(angle) * radius };
  }

  function drawSceneGrid(ctx, cam) {
    const palette = scenePalette();
    const extent = 100;
    const step = 10;
    for (let i = -extent; i <= extent; i += step) {
      const major = i === 0;
      const color = major ? palette.gridMajor : palette.gridMinor;
      const width = major ? 1.2 : 0.7;
      sceneLine(ctx, { x: i, y: 0, z: -extent }, { x: i, y: 0, z: extent }, cam, color, width);
      sceneLine(ctx, { x: -extent, y: 0, z: i }, { x: extent, y: 0, z: i }, cam, color, width);
    }
    drawGroundCircle(ctx, cam, 0, 0, 68, palette.ringOuter, 1, [5, 7]);
    drawGroundCircle(ctx, cam, 0, 0, 50, palette.ringInner, 1);
  }

  function drawSceneCoverage(ctx, cam) {
    const palette = scenePalette();
    getSceneTowers().forEach((t) => {
      const contained = !!t.contained;
      const color = t.type === 'rogue' ? palette.rogue : t.type === 'macro' ? palette.macro : palette.neighbor;
      if (contained) {
        drawGroundCircle(ctx, cam, t.x, t.z, t.radius * 0.6, sceneRgba(color, .08), 1);
        return;
      }
      const rings = t.type === 'macro' ? [0.42, 0.72, 1] : t.type === 'rogue' ? [0.55, 1] : [0.62, 1];
      rings.forEach((factor, index) => {
        const alpha = t.type === 'macro'
          ? 0.1 + index * 0.045
          : t.type === 'rogue' ? 0.16 + index * 0.07 : 0.1 + index * 0.04;
        drawGroundCircle(
          ctx,
          cam,
          t.x,
          t.z,
          t.radius * factor,
          sceneRgba(color, alpha),
          t.type === 'macro' && index === 2 ? 1.2 : 1,
          t.type === 'macro' && index === 2 ? [4, 6] : null,
        );
      });
    });
  }

  function drawSceneBeams(ctx, cam, now) {
    const palette = scenePalette();
    getSceneTowers().forEach((t) => {
      if (t.contained) return;
      const color = t.type === 'rogue' ? palette.rogue : t.type === 'macro' ? palette.macro : palette.neighbor;
      const half = t.type === 'macro' ? 0.55 : 0.5;
      const baseAlpha = t.type === 'rogue' ? 0.075 : t.type === 'macro' ? 0.045 : 0.032;
      const shimmer = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(now / 1100 + t.x * 0.05 + t.z * 0.031));
      t.sectors.forEach((deg) => {
        const angle = (deg * Math.PI) / 180;
        scenePolygon(ctx, sceneSector(t.x, t.z, t.radius, angle, half, 20), cam, sceneRgba(color, baseAlpha * shimmer), sceneRgba(color, .12), 1);
        scenePolygon(ctx, sceneSector(t.x, t.z, t.radius * 0.6, angle, half * 0.8, 16), cam, sceneRgba(color, baseAlpha * 1.7 * shimmer), null);
      });
      if (t.type === 'macro') {
        const sweep = (now * 0.00032) % TAU;
        scenePolygon(ctx, sceneSector(t.x, t.z, t.radius, sweep, 0.2, 10), cam, sceneRgba(palette.macro, .05), sceneRgba(palette.macro, .2), 1);
        sceneLine(
          ctx,
          { x: t.x, y: 0.12, z: t.z },
          { x: t.x + Math.cos(sweep) * t.radius, y: 0.12, z: t.z + Math.sin(sweep) * t.radius },
          cam,
          sceneRgba(palette.macro, .28),
          1,
        );
      }
    });
    if (state.rogue && !state.incident?.contained) {
      scenePolyline(
        ctx,
        [
          { x: SCENE3D.macro.x, y: SCENE3D.macro.height * 0.86, z: SCENE3D.macro.z },
          { x: SCENE3D.rogue.x, y: SCENE3D.rogue.height * 0.86, z: SCENE3D.rogue.z },
        ],
        cam,
        sceneRgba(palette.rogue, .32),
        1,
        [3, 7],
        false,
        -(now / 60) % 10,
      );
      for (let i = 0; i < 2; i += 1) {
        const phase = ((now * 0.00045 + i * 0.5) % 1);
        const radius = 5 + phase * (SCENE3D.rogue.radius - 5);
        drawGroundCircle(
          ctx,
          cam,
          SCENE3D.rogue.x,
          SCENE3D.rogue.z,
          radius,
          sceneRgba(palette.rogue, (1 - phase) * 0.3),
          1.4,
        );
      }
    }
  }

  function drawSceneLinks(ctx, cam, now) {
    const palette = scenePalette();
    const towers = getSceneTowers();
    const macro = towers.find((t) => t.type === 'macro');
    const rogue = towers.find((t) => t.type === 'rogue' && !t.contained);
    state.ues.forEach((ue, ueIndex) => {
      if (ue.state === 'detached') return;
      const target = ue.state === 'rogue' && rogue ? rogue : macro;
      if (!target) return;
      const node = sceneUeWorld(ue);
      const from = { x: target.x, y: target.height * 0.7, z: target.z };
      const control = {
        x: (from.x + node.x) / 2,
        y: Math.max(from.y, node.y) + 3.2,
        z: (from.z + node.z) / 2,
      };
      const points = [];
      for (let i = 0; i <= 14; i += 1) {
        const t = i / 14;
        const mt = 1 - t;
        points.push({
          x: mt * mt * from.x + 2 * mt * t * control.x + t * t * node.x,
          y: mt * mt * from.y + 2 * mt * t * control.y + t * t * node.y,
          z: mt * mt * from.z + 2 * mt * t * control.z + t * t * node.z,
        });
      }
      const isRogue = ue.state === 'rogue';
      const isData = isRogue || ue.state === 'connected';
      const color = isRogue
        ? sceneRgba(palette.rogue, .55)
        : ue.state === 'connected' ? sceneRgba(palette.connected, .26) : sceneRgba(palette.idle, .13);
      scenePolyline(ctx, points, cam, color, isRogue ? 1.2 : 0.9, isData ? [4, 4] : null, false, isData ? -(now / (isRogue ? 80 : 240)) % 8 : 0);
      if (now > 0 && isData) drawScenePacket(ctx, points, cam, now, ueIndex, isRogue, palette);
    });
  }

  /* Traffic pulses ride each serving link: teal packets flow macro -> UE and
     rose packets flow UE -> fake BTS, a visual read of the synthetic
     identity-exposure narrative. Frozen to nothing under reduced motion. */
  function drawScenePacket(ctx, points, cam, now, ueIndex, isRogue, palette) {
    const speed = isRogue ? 0.00042 : 0.00028;
    const phase = (now * speed + (ueIndex % 7) * 0.143) % 1;
    const f = isRogue ? 1 - phase : phase;
    const at = f * (points.length - 1);
    const i0 = Math.floor(at);
    const i1 = Math.min(points.length - 1, i0 + 1);
    const mix = at - i0;
    const world = {
      x: points[i0].x + (points[i1].x - points[i0].x) * mix,
      y: points[i0].y + (points[i1].y - points[i0].y) * mix,
      z: points[i0].z + (points[i1].z - points[i0].z) * mix,
    };
    const screen = sceneProject(world, cam);
    if (!screen) return;
    const fade = Math.sin(phase * Math.PI);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, isRogue ? 2 : 1.7, 0, TAU);
    ctx.fillStyle = isRogue ? sceneRgba(palette.rogue, .8 * fade) : sceneRgba(palette.connected, .7 * fade);
    ctx.fill();
  }

  function drawSceneTower(ctx, t, cam, now) {
    const palette = scenePalette();
    const contained = !!t.contained;
    const selected = !!scene.selected && scene.selected.type === t.type && scene.selected.id === t.id;
    const hovered = !!scene.hover && scene.hover.type === t.type && scene.hover.id === t.id;
    const color = contained ? palette.contained : t.color;
    const depth = sceneToCam({ x: t.x, y: t.height * 0.5, z: t.z }, cam).z;
    const alpha = sceneDepthAlpha(depth, 0.4, 1);
    const baseRadius = t.type === 'macro' ? 4.4 : 3.2;
    const legAngles = [Math.PI / 2, Math.PI / 2 + TAU / 3, Math.PI / 2 + (TAU * 2) / 3];
    const legs = legAngles.map((a) => ({ x: t.x + Math.cos(a) * baseRadius, z: t.z + Math.sin(a) * baseRadius }));
    const apex = { x: t.x, y: t.height, z: t.z };

    scenePolygon(ctx, sceneCircle(t.x, t.z, baseRadius * 3.2, 40), cam, sceneRgba(color, 0.045 * alpha), null);
    scenePolygon(
      ctx,
      sceneCircle(t.x, t.z, baseRadius * 1.8, 36),
      cam,
      sceneRgba(color, 0.035 * alpha),
      sceneRgba(color, 0.22 * alpha),
      1,
    );

    const apexScreen = sceneProject({ x: t.x, y: t.height + 5.6, z: t.z }, cam);
    if (apexScreen) {
      const glow = ctx.createRadialGradient(apexScreen.x, apexScreen.y, 0, apexScreen.x, apexScreen.y, 26);
      glow.addColorStop(0, sceneRgba(color, 0.3 * alpha));
      glow.addColorStop(1, sceneRgba(color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(apexScreen.x, apexScreen.y, 26, 0, TAU);
      ctx.fill();
    }

    legs.forEach((leg) => sceneLine(ctx, { x: leg.x, y: 0, z: leg.z }, apex, cam, sceneRgba(color, 0.8 * alpha), 1.2));

    [0.3, 0.55, 0.78].forEach((fraction) => {
      const points = legs.map((leg) => ({
        x: leg.x + (apex.x - leg.x) * fraction,
        y: t.height * fraction,
        z: leg.z + (apex.z - leg.z) * fraction,
      }));
      sceneLine(ctx, points[0], points[1], cam, sceneRgba(color, 0.45 * alpha), 0.9);
      sceneLine(ctx, points[1], points[2], cam, sceneRgba(color, 0.45 * alpha), 0.9);
      sceneLine(ctx, points[2], points[0], cam, sceneRgba(color, 0.45 * alpha), 0.9);
    });

    for (let i = 0; i < 3; i += 1) {
      const f1 = [0.3, 0.55, 0.78][i];
      const f2 = [0.55, 0.78, 1][i];
      const a = legs[i];
      const b = legs[(i + 1) % 3];
      sceneLine(
        ctx,
        { x: a.x + (apex.x - a.x) * f1, y: t.height * f1, z: a.z + (apex.z - a.z) * f1 },
        { x: b.x + (apex.x - b.x) * f2, y: t.height * f2, z: b.z + (apex.z - b.z) * f2 },
        cam,
        sceneRgba(color, 0.28 * alpha),
        0.7,
      );
    }

    scenePolyline(
      ctx,
      sceneCircle(t.x, t.z, baseRadius * 0.45, 24, t.height * 0.78),
      cam,
      sceneRgba(color, 0.5 * alpha),
      1,
      null,
      true,
    );

    for (let i = 0; i < 3; i += 1) {
      const a = legAngles[i] + Math.PI / 3;
      const px = t.x + Math.cos(a) * baseRadius * 0.55;
      const pz = t.z + Math.sin(a) * baseRadius * 0.55;
      sceneLine(
        ctx,
        { x: px, y: t.height - 2, z: pz },
        { x: px, y: t.height + 3.2, z: pz },
        cam,
        sceneRgba(color, 0.72 * alpha),
        1.6,
      );
    }

    sceneLine(ctx, apex, { x: t.x, y: t.height + 5.6, z: t.z }, cam, sceneRgba(color, 0.85 * alpha), 1.3);
    if (apexScreen) {
      const blink = contained ? 0.3 : 0.55 + 0.35 * Math.sin(now / 380 + t.x * 0.4);
      ctx.save();
      ctx.globalAlpha = clamp(blink, 0.15, 1);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(apexScreen.x, apexScreen.y, 2.2, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    if (selected) {
      drawGroundCircle(ctx, cam, t.x, t.z, baseRadius * 2.7, sceneRgba(palette.macro, .85), 1.4, [4, 4], -(now / 110) % 8);
    }

    const showLabel = scene.layers.labels && (
      scene.w >= 520
      || t.type === 'macro'
      || t.type === 'rogue'
      || selected
      || hovered
    );
    if (showLabel) {
      const labelPoint = sceneProject({ x: t.x, y: t.height + 8.4, z: t.z }, cam);
      if (labelPoint) {
        scene.labels.push({
          x: labelPoint.x,
          y: labelPoint.y,
          title: t.label,
          sub: t.sub,
          color: contained ? palette.contained : t.color,
        });
      }
    }

    const hit = sceneProject({ x: t.x, y: t.height * 0.55, z: t.z }, cam);
    if (hit) {
      scene.hits.push({
        type: t.type,
        id: t.id,
        x: hit.x,
        y: hit.y,
        r: t.type === 'macro' ? 22 : 17,
        label: t.label,
      });
    }
  }

  function drawSceneUe(ctx, node, cam, now) {
    const ue = node.ue;
    const point = sceneProject({ x: node.x, y: node.y, z: node.z }, cam);
    if (!point) return;
    const base = sceneProject({ x: node.x, y: 0, z: node.z }, cam);
    const depth = sceneToCam({ x: node.x, y: node.y, z: node.z }, cam).z;
    const alpha = sceneDepthAlpha(depth, 0.35, 1);
    const color = node.color;
    const selected = scene.selected && scene.selected.type === 'ue' && scene.selected.id === ue.id;
    const hovered = scene.hover && scene.hover.type === 'ue' && scene.hover.id === ue.id;

    if (base) {
      sceneLine(
        ctx,
        { x: node.x, y: 0, z: node.z },
        { x: node.x, y: node.y, z: node.z },
        cam,
        sceneRgba(color, 0.2 * alpha),
        0.8,
      );
    }

    const radius = clamp(point.s * 0.68, 3.4, 7);
    const breathe = ue.state === 'connected' ? 1 : 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(now / 1400 + node.x * 0.37 + node.z * 0.23));
    const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 2.8);
    glow.addColorStop(0, sceneRgba(color, (selected || hovered ? 0.55 : 0.3) * alpha * breathe));
    glow.addColorStop(1, sceneRgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 2.8, 0, TAU);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(2, radius * 0.55), 0, TAU);
    ctx.fillStyle = sceneRgba(color, alpha);
    ctx.fill();

    if (ue.state === 'rogue') {
      const phase = (now * 0.001 + ue.topoAngle) % 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * (1.2 + phase * 1.8), 0, TAU);
      ctx.strokeStyle = sceneRgba(color, (1 - phase) * 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (selected || hovered) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * 1.9, 0, TAU);
      ctx.strokeStyle = selected ? sceneRgba(scenePalette().macro, .95) : sceneRgba(color, 0.7);
      ctx.lineWidth = selected ? 1.6 : 1;
      ctx.stroke();
    }

    scene.hits.push({
      type: 'ue',
      id: ue.id,
      x: point.x,
      y: point.y,
      r: Math.max(10, radius * 2.2),
      label: ue.id,
    });

    if (scene.layers.labels && (selected || hovered)) {
      scene.labels.push({
        x: point.x,
        y: point.y - 10,
        title: ue.id,
        sub: ue.state + ' · ' + ue.rsrp.toFixed(0) + ' dBm',
        color,
      });
    }
  }

  function drawSceneCompass(ctx, cam) {
    const palette = scenePalette();
    const x = scene.w - 36;
    const y = Math.max(54, scene.h - 74);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, TAU);
    ctx.fillStyle = palette.compassBg;
    ctx.fill();
    ctx.strokeStyle = palette.compassStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    let nx = -cam.right.z;
    let ny = cam.up.z;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    ctx.strokeStyle = sceneRgba(palette.macro, .85);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-nx * 5, -ny * 5);
    ctx.lineTo(nx * 10, ny * 10);
    ctx.stroke();
    ctx.fillStyle = sceneRgba(palette.macro, .95);
    ctx.beginPath();
    ctx.moveTo(nx * 12, ny * 12);
    ctx.lineTo(-ny * 3.2 + nx * 6, nx * 3.2 + ny * 6);
    ctx.lineTo(ny * 3.2 + nx * 6, -nx * 3.2 + ny * 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.compassText;
    ctx.font = '600 7px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx * 21, ny * 21);
    ctx.restore();
  }

  function drawScene(now) {
    if (!scene.ctx || !scene.w || !scene.h) return;
    const ctx = scene.ctx;
    const palette = scenePalette();
    const cam = sceneCamera();
    scene.labels = [];
    scene.hits = [];

    ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
    ctx.clearRect(0, 0, scene.w, scene.h);

    const background = ctx.createLinearGradient(0, 0, 0, scene.h);
    background.addColorStop(0, palette.skyTop);
    background.addColorStop(0.58, palette.skyMid);
    background.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, scene.w, scene.h);

    const pool = ctx.createRadialGradient(
      scene.w * 0.5, scene.h * 0.6, 8,
      scene.w * 0.5, scene.h * 0.6, Math.max(scene.w, scene.h) * 0.56,
    );
    pool.addColorStop(0, palette.pool);
    pool.addColorStop(1, 'rgba(45,212,191,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, scene.w, scene.h);

    const time = scene.reduced ? 0 : now;

    scenePolygon(ctx, sceneCircle(0, 0, 100, 96), cam, palette.groundFill, palette.groundStroke, 1);
    if (scene.layers.grid) drawSceneGrid(ctx, cam);
    if (scene.layers.coverage) drawSceneCoverage(ctx, cam);
    if (scene.layers.beams) drawSceneBeams(ctx, cam, time);
    if (scene.layers.links) drawSceneLinks(ctx, cam, time);

    const drawables = [];
    getSceneTowers().forEach((tower) => {
      drawables.push({
        kind: 'tower',
        depth: sceneToCam({ x: tower.x, y: tower.height * 0.5, z: tower.z }, cam).z,
        tower,
      });
    });
    if (scene.layers.ues) {
      state.ues.forEach((ue) => {
        const node = sceneUeWorld(ue);
        node.ue = ue;
        node.color = sceneUeColor(ue);
        drawables.push({
          kind: 'ue',
          depth: sceneToCam({ x: node.x, y: node.y, z: node.z }, cam).z,
          node,
        });
      });
    }
    drawables.sort((a, b) => b.depth - a.depth);
    drawables.forEach((item) => {
      if (item.kind === 'tower') drawSceneTower(ctx, item.tower, cam, time);
      else drawSceneUe(ctx, item.node, cam, time);
    });

    const placedLabels = [];
    scene.labels.forEach((label) => drawSceneLabel(ctx, label.x, label.y, label.title, label.sub, label.color, placedLabels));
    drawSceneCompass(ctx, cam);

    if (!scene.hits.length) scene.hover = null;
  }

  function sceneSetHoverFromEvent(event) {
    if (!scene.canvas) return;
    const rect = scene.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = null;
    let bestDistance = Infinity;
    scene.hits.forEach((hit) => {
      const distance = Math.hypot(hit.x - x, hit.y - y);
      if (distance <= hit.r && distance < bestDistance) {
        best = hit;
        bestDistance = distance;
      }
    });
    scene.hover = best ? { type: best.type, id: best.id } : null;
    scene.canvas.style.cursor = best ? 'pointer' : 'grab';
  }

  function sceneSelectFromEvent(event) {
    if (!scene.canvas) return;
    const rect = scene.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = null;
    let bestDistance = Infinity;
    scene.hits.forEach((hit) => {
      const distance = Math.hypot(hit.x - x, hit.y - y);
      if (distance <= hit.r && distance < bestDistance) {
        best = hit;
        bestDistance = distance;
      }
    });
    scene.selected = best ? { type: best.type, id: best.id } : null;
    renderSceneInspector();
  }

  function scenePointerDistance() {
    const values = Array.from(scene.pointers.values());
    if (values.length < 2) return 0;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }

  function scenePointerDown(event) {
    if (!scene.canvas) return;
    scene.canvas.dataset.pointerFocus = '1';
    scene.canvas.focus({ preventScroll: true });
    try { scene.canvas.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
    scene.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (scene.pointers.size === 2) {
      scene.pinch = { distance: scenePointerDistance(), zoom: scene.camera.zoom };
      scene.drag.active = false;
      scene.tween = null;
      return;
    }
    scene.drag = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    };
    scene.tween = null;
  }

  function scenePointerMove(event) {
    if (scene.pointers.has(event.pointerId)) {
      scene.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (scene.pointers.size === 2 && scene.pinch) {
      const distance = scenePointerDistance();
      if (distance > 0) {
        scene.camera.zoom = clamp(scene.pinch.zoom * (distance / scene.pinch.distance), 0.55, 2.1);
      }
      scene.drag.moved = true;
      return;
    }
    if (!scene.drag.active || scene.drag.pointerId !== event.pointerId) {
      sceneSetHoverFromEvent(event);
      return;
    }
    const dx = event.clientX - scene.drag.x;
    const dy = event.clientY - scene.drag.y;
    if (!scene.drag.moved && Math.hypot(event.clientX - scene.drag.startX, event.clientY - scene.drag.startY) > 4) {
      scene.drag.moved = true;
    }
    if (scene.drag.moved) {
      scene.camera.theta -= dx * 0.0055;
      scene.camera.theta = ((scene.camera.theta + Math.PI) % TAU + TAU) % TAU - Math.PI;
      scene.camera.phi = clamp(scene.camera.phi + dy * 0.0045, 0.12, 1.42);
    }
    scene.drag.x = event.clientX;
    scene.drag.y = event.clientY;
  }

  function scenePointerUp(event) {
    if (!scene.canvas) return;
    scene.pointers.delete(event.pointerId);
    if (scene.pointers.size < 2) scene.pinch = null;
    const wasDrag = scene.drag.active && scene.drag.pointerId === event.pointerId;
    const moved = scene.drag.moved;
    if (wasDrag) {
      scene.drag.active = false;
      scene.drag.pointerId = null;
      if (!moved) sceneSelectFromEvent(event);
    }
    try { scene.canvas.releasePointerCapture(event.pointerId); } catch (error) { /* ignore */ }
    if (!scene.pointers.size) sceneSetHoverFromEvent(event);
  }

  function scenePointerLeave() {
    if (scene.drag.active) return;
    scene.hover = null;
    if (scene.canvas) scene.canvas.style.cursor = 'grab';
  }

  function sceneWheel(event) {
    if (!scene.active) return;
    event.preventDefault();
    scene.camera.zoom = clamp(scene.camera.zoom * Math.exp(-event.deltaY * 0.0011), 0.55, 2.1);
    scene.tween = null;
    if (!scene.running) drawScene(performance.now());
  }

  function sceneKeyDown(event) {
    if (scene.canvas) delete scene.canvas.dataset.pointerFocus;
    const key = event.key;
    let handled = true;
    if (key === 'ArrowLeft') scene.camera.theta -= 0.1;
    else if (key === 'ArrowRight') scene.camera.theta += 0.1;
    else if (key === 'ArrowUp') scene.camera.phi = clamp(scene.camera.phi + 0.07, 0.12, 1.42);
    else if (key === 'ArrowDown') scene.camera.phi = clamp(scene.camera.phi - 0.07, 0.12, 1.42);
    else if (key === '+' || key === '=') scene.camera.zoom = clamp(scene.camera.zoom * 1.1, 0.55, 2.1);
    else if (key === '-' || key === '_') scene.camera.zoom = clamp(scene.camera.zoom / 1.1, 0.55, 2.1);
    else if (key === 'Home' || key === '0') {
      event.preventDefault();
      sceneApplyPreset('iso');
      return;
    } else handled = false;
    if (!handled) return;
    event.preventDefault();
    scene.camera.theta = ((scene.camera.theta + Math.PI) % TAU + TAU) % TAU - Math.PI;
    scene.tween = null;
    if (!scene.running) drawScene(performance.now());
  }

  function sceneTweenTo(goal, duration = 620) {
    const target = {
      theta: goal.theta,
      phi: goal.phi,
      zoom: goal.zoom,
      target: { x: goal.target.x, y: goal.target.y, z: goal.target.z },
    };
    if (scene.reduced) {
      scene.camera.theta = target.theta;
      scene.camera.phi = target.phi;
      scene.camera.zoom = target.zoom;
      scene.camera.target = { ...target.target };
      scene.tween = null;
      if (!scene.running) drawScene(performance.now());
      return;
    }
    scene.tween = {
      start: performance.now(),
      duration,
      from: {
        theta: scene.camera.theta,
        phi: scene.camera.phi,
        zoom: scene.camera.zoom,
        target: { ...scene.camera.target },
      },
      to: target,
    };
  }

  function sceneUpdateTween(now) {
    const tween = scene.tween;
    if (!tween) return;
    const t = clamp((now - tween.start) / tween.duration, 0, 1);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    scene.camera.theta = tween.from.theta + (tween.to.theta - tween.from.theta) * eased;
    scene.camera.phi = tween.from.phi + (tween.to.phi - tween.from.phi) * eased;
    scene.camera.zoom = tween.from.zoom + (tween.to.zoom - tween.from.zoom) * eased;
    scene.camera.target = {
      x: tween.from.target.x + (tween.to.target.x - tween.from.target.x) * eased,
      y: tween.from.target.y + (tween.to.target.y - tween.from.target.y) * eased,
      z: tween.from.target.z + (tween.to.target.z - tween.from.target.z) * eased,
    };
    if (t >= 1) scene.tween = null;
  }

  function sceneApplyPreset(name) {
    const preset = SCENE_PRESETS[name] || SCENE_HEADINGS[name] || SCENE_PRESETS.iso;
    sceneTweenTo(preset);
    $$('.scene-preset').forEach((button) => {
      button.classList.toggle('active', button.dataset.camera === name);
    });
    scene.autoOrbit = false;
    syncSceneOrbitButton();
  }

  function sanitizeSceneCamera(value) {
    if (!value || typeof value !== 'object' || !value.target || typeof value.target !== 'object') return null;
    const fields = [value.theta, value.phi, value.zoom, value.target.x, value.target.y, value.target.z];
    if (!fields.every((field) => Number.isFinite(Number(field)))) return null;
    return {
      theta: ((Number(value.theta) + Math.PI) % TAU + TAU) % TAU - Math.PI,
      phi: clamp(Number(value.phi), 0.12, 1.42),
      zoom: clamp(Number(value.zoom), 0.55, 2.1),
      target: {
        x: clamp(Number(value.target.x), -180, 180),
        y: clamp(Number(value.target.y), -20, 100),
        z: clamp(Number(value.target.z), -180, 180),
      },
    };
  }

  function syncSceneBookmarkButtons() {
    const restore = $('#sceneRestoreViewBtn');
    if (restore) restore.disabled = !scene.savedCamera;
  }

  function loadSceneBookmark() {
    try {
      scene.savedCamera = sanitizeSceneCamera(JSON.parse(localStorage.getItem(SCENE_BOOKMARK_KEY) || 'null'));
    } catch (error) {
      scene.savedCamera = null;
    }
    syncSceneBookmarkButtons();
  }

  function saveSceneBookmark() {
    const camera = sanitizeSceneCamera(scene.camera);
    if (!camera) return;
    try {
      localStorage.setItem(SCENE_BOOKMARK_KEY, JSON.stringify(camera));
      scene.savedCamera = camera;
      syncSceneBookmarkButtons();
      showToast('Camera view saved on this device.', 'ok');
    } catch (error) {
      showToast('Could not save the camera view in local storage.', 'warn');
    }
  }

  function restoreSceneBookmark() {
    if (!scene.savedCamera) loadSceneBookmark();
    if (!scene.savedCamera) {
      showToast('Save a camera view before restoring it.', 'warn');
      return;
    }
    sceneTweenTo(scene.savedCamera);
    $$('.scene-preset').forEach((button) => button.classList.remove('active'));
    scene.autoOrbit = false;
    syncSceneOrbitButton();
    showToast('Saved camera view restored.', 'ok');
  }

  function syncSceneFullscreenButton() {
    const button = $('#sceneFullscreenBtn');
    if (!button) return;
    const active = document.fullscreenElement === scene.stage;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', active ? 'Exit full screen 3D view' : 'Open full screen 3D view');
    button.title = active ? 'Exit full screen' : 'Open full screen';
    setText('#sceneFullscreenLabel', active ? 'Exit full screen' : 'Full screen');
  }

  async function toggleSceneFullscreen() {
    if (!scene.stage) return;
    try {
      if (document.fullscreenElement === scene.stage) await document.exitFullscreen();
      else if (scene.stage.requestFullscreen) await scene.stage.requestFullscreen();
      else {
        showToast('Full screen is not available in this browser.', 'warn');
        return;
      }
      syncSceneFullscreenButton();
    } catch (error) {
      showToast('Could not change the 3D viewport display mode.', 'warn');
    }
  }

  async function exportSceneSnapshot() {
    if (!scene.canvas || !scene.w || !scene.h) return;
    if (!scene.running) drawScene(performance.now());
    const source = scene.canvas;
    const output = document.createElement('canvas');
    const scale = scene.dpr || 1;
    const footerHeight = Math.round(44 * scale);
    output.width = source.width;
    output.height = source.height + footerHeight;
    const ctx = output.getContext('2d');
    if (!ctx) {
      showToast('Could not create the scene snapshot.', 'bad');
      return;
    }
    ctx.fillStyle = activeTheme() === 'light' ? '#eef3f8' : '#040b12';
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(source, 0, 0);
    ctx.fillStyle = activeTheme() === 'light' ? '#e5edf4' : '#07131e';
    ctx.fillRect(0, source.height, output.width, footerHeight);
    ctx.strokeStyle = scenePalette().labelBorder;
    ctx.lineWidth = scale;
    ctx.beginPath();
    ctx.moveTo(0, source.height + scale / 2);
    ctx.lineTo(output.width, source.height + scale / 2);
    ctx.stroke();
    const generated = new Date();
    const stamp = generated.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const mode = state.incident?.contained ? 'Contained evidence' : state.rogue ? 'Fake BTS active' : 'Nominal';
    ctx.fillStyle = scenePalette().labelTitle;
    ctx.font = `600 ${11 * scale}px Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`VCSS 4G v${APP_VERSION} · SYNTHETIC TEST RANGE`, 14 * scale, source.height + 15 * scale);
    ctx.fillStyle = scenePalette().labelSub;
    ctx.font = `${9 * scale}px Consolas, monospace`;
    ctx.fillText(`${mode} · ${stamp} · no live RF or network data`, 14 * scale, source.height + 31 * scale);

    const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
    if (!blob) {
      showToast('The browser could not encode the scene snapshot.', 'bad');
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'vcss-4g-scene-' + generated.toISOString().replace(/[:.]/g, '-') + '.png';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast('3D scene snapshot downloaded as PNG.', 'ok');
  }

  function syncSceneOrbitButton() {
    const button = $('#sceneOrbitBtn');
    if (!button) return;
    button.setAttribute('aria-pressed', scene.autoOrbit ? 'true' : 'false');
    button.classList.toggle('btn-outline', scene.autoOrbit);
    button.classList.toggle('btn-ghost', !scene.autoOrbit);
  }

  function sceneToggleOrbit() {
    if (!scene.autoOrbit && scene.reduced) {
      showToast('Auto-orbit is disabled by your reduced-motion preference.', 'warn');
      return;
    }
    scene.autoOrbit = !scene.autoOrbit;
    syncSceneOrbitButton();
  }

  function sceneFocusSelected() {
    if (!scene.selected) return;
    if (scene.selected.type === 'ue') {
      const ue = state.ues.find((item) => item.id === scene.selected.id);
      if (!ue) return;
      const node = sceneUeWorld(ue);
      sceneTweenTo({
        theta: scene.camera.theta,
        phi: clamp(scene.camera.phi, 0.32, 0.85),
        zoom: 1.85,
        target: { x: node.x, y: node.y + 3, z: node.z },
      });
      return;
    }
    const tower = getSceneTowers().find((item) => item.id === scene.selected.id);
    if (!tower) return;
    sceneTweenTo({
      theta: scene.camera.theta,
      phi: clamp(scene.camera.phi, 0.32, 0.85),
      zoom: tower.type === 'macro' ? 1.45 : 1.65,
      target: { x: tower.x, y: tower.height * 0.55, z: tower.z },
    });
  }

  function renderSceneInspector() {
    const wrap = $('#sceneInspector');
    if (!wrap) return;
    const title = $('#sceneInspectorTitle');
    const badge = $('#sceneInspectorBadge');
    const selected = scene.selected;

    if (!selected) {
      if (title) title.textContent = 'Select a node';
      if (badge) {
        badge.textContent = '—';
        badge.className = 'proto-badge';
      }
      wrap.innerHTML = `
        <div class="scene-empty">
          <span class="scene-empty-icon"><svg class="icon"><use href="#i-cube"></use></svg></span>
          <b>Inspect the RAN volume.</b><br>Click a tower or a virtual UE in the scene. Camera presets change the viewpoint; layer toggles isolate coverage, links or nodes.
        </div>
      `;
      return;
    }

    if (selected.type === 'ue') {
      const ue = state.ues.find((item) => item.id === selected.id);
      if (!ue) {
        scene.selected = null;
        renderSceneInspector();
        return;
      }
      const color = sceneUeColor(ue);
      if (title) title.textContent = ue.id;
      if (badge) {
        badge.textContent = ue.state.toUpperCase();
        badge.className = 'proto-badge' + (ue.state === 'rogue' ? ' danger' : '');
      }
      wrap.innerHTML = `
        <div class="scene-node-head">
          <span class="scene-node-dot" style="background:${color};color:${color}"></span>
          <div><strong>${esc(ue.id)} · ${esc(ue.device)}</strong><small>${esc(ue.imsi)}</small></div>
        </div>
        <div class="detail-grid">
          <div><span>State</span><b>${esc(ue.state)}</b></div>
          <div><span>Serving</span><b>${esc(ue.serving)}</b></div>
          <div><span>RSRP</span><b>${ue.rsrp.toFixed(1)} dBm</b></div>
          <div><span>SINR</span><b>${ue.sinr.toFixed(1)} dB</b></div>
          <div><span>DL / UL</span><b>${ue.dl.toFixed(1)} / ${ue.ul.toFixed(1)} Mbps</b></div>
          <div><span>Security</span><b>${esc(ue.security)}</b></div>
        </div>
        <div class="scene-node-actions">
          <button class="btn btn-outline btn-sm" type="button" data-action="scene-open-ue" data-ue-id="${esc(ue.id)}">Open record</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="scene-focus">Focus</button>
        </div>
      `;
      return;
    }

    const tower = getSceneTowers().find((item) => item.id === selected.id);
    if (!tower) {
      scene.selected = null;
      renderSceneInspector();
      return;
    }
    const contained = !!tower.contained;
    const served = tower.type === 'rogue'
      ? state.ues.filter((ue) => ue.state === 'rogue').length
      : tower.type === 'neighbor'
        ? 0
        : state.ues.filter((ue) => ue.state !== 'detached' && ue.state !== 'rogue').length;
    const servedLabel = tower.type === 'rogue' ? 'Affected UEs' : tower.type === 'neighbor' ? 'Attached UEs' : 'Served UEs';
    const role = tower.type === 'macro' ? 'Managed macro' : tower.type === 'neighbor' ? 'Neighbor cell' : 'Fake BTS';
    const status = contained ? 'Contained' : tower.type === 'rogue' ? 'Broadcasting' : 'On air';
    const color = contained ? '#94a3b8' : tower.color;
    if (title) title.textContent = tower.label;
    if (badge) {
      badge.textContent = tower.type.toUpperCase();
      badge.className = 'proto-badge' + (tower.type === 'rogue' && !contained ? ' danger' : '');
    }
    wrap.innerHTML = `
      <div class="scene-node-head">
        <span class="scene-node-dot" style="background:${color};color:${color}"></span>
        <div><strong>${esc(tower.label)}</strong><small>${esc(role)} · ${esc(status)}</small></div>
      </div>
      <div class="detail-grid">
        <div><span>Role</span><b>${esc(role)}</b></div>
        <div><span>Status</span><b>${esc(status)}</b></div>
        <div><span>PCI</span><b>${tower.pci}</b></div>
        <div><span>Band</span><b>B${tower.type === 'rogue' ? state.rogue.band : state.cell.band}</b></div>
        <div><span>Height</span><b>${tower.height} m</b></div>
        <div><span>Coverage</span><b>${Math.round(tower.radius)} m</b></div>
        <div><span>${servedLabel}</span><b>${served}</b></div>
        <div><span>Distance</span><b>${Math.round(Math.hypot(tower.x, tower.z))} m</b></div>
      </div>
      <div class="scene-node-actions">
        <button class="btn btn-outline btn-sm" type="button" data-action="scene-focus">Focus camera</button>
        ${tower.type === 'rogue' ? '<button class="btn btn-ghost btn-sm" type="button" data-action="scene-open-rogue">Open incident</button><button class="btn btn-ghost btn-sm" type="button" data-action="scene-open-runbook">Open runbook</button>' : ''}
      </div>
    `;
  }

  function updateSceneSummary() {
    const rogue = state.rogue
      ? (state.incident?.contained
        ? ' A contained rogue cell remains in the scene as preserved evidence.'
        : ' A rogue cell is broadcasting and its affected UEs are highlighted.')
      : ' No rogue cell is present.';
    setText('#scene3dSummary', 'The scene contains four managed towers and ' + state.ues.length + ' virtual UEs.' + rogue);
  }

  function updateSceneTelemetry(now) {
    if (!scene.ready) return;
    if (now - scene.telemetryAt < 220) return;
    scene.telemetryAt = now;
    const towers = getSceneTowers();
    const attached = state.ues.filter((ue) => ue.state !== 'detached').length;
    const rogueActive = !!state.rogue && !state.incident?.contained;
    const mode = state.rogue ? (state.incident?.contained ? 'Contained' : 'Rogue active') : 'Nominal';
    const azimuth = ((scene.camera.theta * 180) / Math.PI + 360) % 360;
    const elevation = (scene.camera.phi * 180) / Math.PI;
    const distance = sceneFitDistance() / clamp(scene.camera.zoom, 0.55, 2.1);

    setText('#sceneTowers', String(towers.length));
    setText('#sceneUes', scene.layers.ues ? String(state.ues.length) : '0');
    setText('#sceneLinks', scene.layers.links ? String(attached) : '0');
    setText('#sceneRogue', String(rogueActive ? 1 : 0));
    setText('#sceneCamera', azimuth.toFixed(0) + '° / ' + elevation.toFixed(0) + '°');
    setText('#sceneRange', Math.round(distance) + ' m');
    setText('#sceneBeams', scene.layers.beams ? String(towers.filter((tower) => !tower.contained).length * 3) : '0');
    setText('#sceneFps', Math.round(scene.fps) + ' fps');
    setText('#sceneHudFps', Math.round(scene.fps) + ' fps');
    setText('#sceneModeTag', mode);
    setText('#sceneHudMode', mode);
    const hudState = $('#sceneHudState');
    if (hudState) hudState.className = 'scene-chip' + (mode === 'Rogue active' ? ' danger' : '');
    const stateEl = $('#sceneState');
    if (stateEl) {
      stateEl.textContent = mode;
      stateEl.className = mode === 'Rogue active' ? 'danger-text' : 'ok';
    }
    const modeTag = $('#sceneModeTag');
    if (modeTag) modeTag.className = 'tag' + (mode === 'Rogue active' ? ' danger-text' : '');
  }

  function sceneFrame(now) {
    if (!scene.running || !scene.active) return;
    const dt = scene.lastFrame ? Math.min(64, now - scene.lastFrame) : 16;
    scene.lastFrame = now;
    scene.fpsFrames += 1;
    scene.fpsTime += dt;
    if (scene.fpsTime >= 500) {
      scene.fps = (scene.fpsFrames * 1000) / scene.fpsTime;
      scene.fpsFrames = 0;
      scene.fpsTime = 0;
    }
    sceneUpdateTween(now);
    if (scene.autoOrbit && !scene.drag.active && !scene.reduced) {
      scene.camera.theta += dt * 0.00009;
      scene.camera.theta = ((scene.camera.theta + Math.PI) % TAU + TAU) % TAU - Math.PI;
    }
    drawScene(now);
    updateSceneTelemetry(now);
    scene.raf = requestAnimationFrame(sceneFrame);
  }

  function sceneStart() {
    if (!scene.ready || scene.running || !scene.active) return;
    scene.running = true;
    scene.lastFrame = 0;
    /* v1.7.0: begin one frame late so a tab switch's first paint — the frame
       the click interaction is measured against — is never blocked by a full
       scene redraw; the canvas shows its last frame until the loop takes over. */
    scene.raf = requestAnimationFrame(() => {
      if (!scene.running || !scene.active) return;
      scene.raf = requestAnimationFrame(sceneFrame);
    });
  }

  function sceneStop() {
    scene.running = false;
    if (scene.raf) cancelAnimationFrame(scene.raf);
    scene.raf = 0;
  }

  function resizeScene3D() {
    if (!scene.ready || !scene.canvas || !scene.stage) return;
    const rect = scene.stage.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    /* v1.7.0: skip the canvas backing-store realloc (clears + reallocates the
       bitmap) when the size and DPR are unchanged, e.g. every warm tab switch. */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (scene.w === w && scene.h === h && scene.dpr === dpr) {
      /* v1.7.0: warm re-activation — the canvas still holds its last frame and
         the scene loop (started right after) repaints it, so keep a full
         redraw off the click's critical paint path. Sync-draw only for static
         contexts (scene not active and not running). */
      if (!scene.active && !scene.running) drawScene(performance.now());
      return;
    }
    scene.dpr = dpr;
    scene.w = w;
    scene.h = h;
    scene.canvas.width = Math.round(rect.width * dpr);
    scene.canvas.height = Math.round(rect.height * dpr);
    scene.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!scene.running) drawScene(performance.now());
  }

  function initScene3D() {
    if (scene.ready) {
      resizeScene3D();
      return;
    }
    const canvas = $('#scene3d');
    const stage = $('#sceneStage');
    if (!canvas || !stage) return;
    scene.canvas = canvas;
    scene.stage = stage;
    scene.ctx = canvas.getContext('2d');
    if (!scene.ctx) return;
    scene.ready = true;
    loadSceneBookmark();
    syncSceneFullscreenButton();

    try {
      scene.reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      scene.reduced = scene.reducedQuery.matches;
      scene.reducedQuery.addEventListener('change', (event) => {
        scene.reduced = event.matches;
        if (scene.reduced) {
          scene.autoOrbit = false;
          syncSceneOrbitButton();
        }
      });
    } catch (error) {
      scene.reduced = false;
    }

    canvas.addEventListener('pointerdown', scenePointerDown);
    canvas.addEventListener('pointermove', scenePointerMove);
    canvas.addEventListener('pointerup', scenePointerUp);
    canvas.addEventListener('pointercancel', scenePointerUp);
    canvas.addEventListener('pointerleave', scenePointerLeave);
    canvas.addEventListener('wheel', sceneWheel, { passive: false });
    canvas.addEventListener('keydown', sceneKeyDown);
    canvas.addEventListener('dblclick', () => sceneApplyPreset('iso'));

    $$('input[data-layer]').forEach((input) => {
      input.addEventListener('change', () => {
        scene.layers[input.dataset.layer] = input.checked;
        scene.telemetryAt = 0;
        updateSceneTelemetry(performance.now());
        if (!scene.running) drawScene(performance.now());
      });
    });

    if ('ResizeObserver' in window) {
      scene.resizeObserver = new ResizeObserver(() => resizeScene3D());
      scene.resizeObserver.observe(stage);
    }
    window.addEventListener('resize', () => {
      if (scene.active) resizeScene3D();
    });
    document.addEventListener('fullscreenchange', () => {
      syncSceneFullscreenButton();
      if (scene.active) resizeScene3D();
    });

    resizeScene3D();
    renderSceneInspector();
    updateSceneSummary();
    updateSceneTelemetry(performance.now());
  }

  function sceneSetActive(active) {
    if (active) {
      /* v1.7.0: mark active before init/resize so the warm-switch resize guard
         defers the redraw to the scene loop instead of the click path. */
      scene.active = true;
      initScene3D();
      resizeScene3D();
      if (!scene.everActivated && !scene.reduced) {
        /* One-time arrival tween: start wider and higher, settle into Iso. */
        scene.everActivated = true;
        const iso = SCENE_PRESETS.iso;
        scene.camera = {
          theta: iso.theta + 0.55,
          phi: Math.min(1.36, iso.phi + 0.28),
          zoom: clamp(iso.zoom * 0.72, 0.55, 2.1),
          target: { ...iso.target },
        };
        sceneTweenTo(iso, 1150);
      }
      scene.everActivated = true;
      sceneStart();
      scene.telemetryAt = 0;
      updateSceneTelemetry(performance.now());
    } else {
      scene.active = false;
      sceneStop();
      scene.pointers.clear();
      scene.pinch = null;
      scene.drag.active = false;
      scene.hover = null;
    }
  }

  function renderScene3D() {
    if (!scene.ready) return;
    if (scene.selected) {
      if (scene.selected.type === 'ue' && !state.ues.some((ue) => ue.id === scene.selected.id)) scene.selected = null;
      if (scene.selected.type === 'rogue' && !state.rogue) scene.selected = null;
    }
    renderSceneInspector();
    updateSceneSummary();
    scene.telemetryAt = 0;
    updateSceneTelemetry(performance.now());
    if (!scene.running) drawScene(performance.now());
  }

  /* ==========================================================================
     UI events / application lifecycle
     ========================================================================== */

  function setTab(name, options = {}) {
    if (!TAB_NAMES.includes(name)) name = 'overview';
    const previousTab = state.tab;

    // Measure the strip before any class, hidden or history writes. This keeps
    // tab activation free of a write -> read -> write forced reflow.
    const tabs = $$('.tab');
    const nextTab = tabs.find((tab) => tab.dataset.view === name);
    const tabStrip = nextTab?.parentElement;
    let tabScroll = null;
    if (nextTab && tabStrip && tabStrip.scrollWidth > tabStrip.clientWidth + 2) {
      const tabRect = nextTab.getBoundingClientRect();
      const stripRect = tabStrip.getBoundingClientRect();
      const edge = 10;
      if (tabRect.left < stripRect.left + edge) {
        tabScroll = tabRect.left - stripRect.left - edge;
      } else if (tabRect.right > stripRect.right - edge) {
        tabScroll = tabRect.right - stripRect.right + edge;
      }
    }

    if (name !== 'signaling' && state.trace.playing) {
      stopTrace();
      const proc = PROCEDURES[state.trace.procedure];
      if (state.trace.step < 0) setTraceStatus(state.trace.procedure === 'rogue' ? 'Suspicious' : 'Ready');
      else if (state.trace.step >= proc.steps.length - 1) setTraceStatus('Complete');
      else setTraceStatus('Paused');
    }
    state.tab = name;
    tabs.forEach((tab) => {
      const active = tab.dataset.view === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    $$('.view').forEach((view) => {
      const active = view.id === 'view-' + name;
      view.hidden = !active;
      view.classList.toggle('active', active);
    });
    if (tabScroll !== null && tabStrip) {
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      requestAnimationFrame(() => tabStrip.scrollBy({ left: tabScroll, behavior }));
    }
    sceneSetActive(name === '3d');
    if (viewDirty.has(name)) renderView(name);
    const historyMode = options.history || 'push';
    if (historyMode !== 'none') {
      try {
        const target = '#' + name;
        const duplicate = previousTab === name && location.hash === target;
        if (historyMode === 'replace') history.replaceState(null, '', target);
        else if (!duplicate) history.pushState(null, '', target);
      } catch (error) { /* file:// edge case */ }
    }
    if (!options.noScroll && window.scrollY > 140) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function applyRouteFromHash() {
    const hash = (location.hash || '').replace('#', '') || 'overview';
    if (!TAB_NAMES.includes(hash) || hash === state.tab) return;
    setTab(hash, { noScroll: true, history: 'none' });
    if (gateOpen()) enterApp({ focus: false });
  }

  function runAttachDemo() {
    setTab('signaling');
    initSignaling();
    const ue = state.ues.find((item) => item.state === 'connected') || state.ues[0];
    state.trace.ueId = ue?.id || 'UE-001';
    setProcedure('attach');
    state.trace.ueId = ue?.id || 'UE-001';
    updateTraceSubjectOptions();
    setText('#traceUe', state.trace.ueId);
    resetTrace();
    startTrace();
  }

  function initScrollProgress() {
    const bar = $('#scrollProgressBar');
    const topbar = $('.topbar');
    let queued = false;
    const update = () => {
      queued = false;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = clamp(window.scrollY / max, 0, 1);
      if (bar) bar.style.transform = 'scaleX(' + progress.toFixed(4) + ')';
      if (topbar) topbar.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
  }

  const THEME_KEY = 'vcss-theme';
  const THEME_CHOICES = ['light', 'dark', 'system'];
  let themeChoice = null;
  let themeTransitionTimer = 0;

  function storedThemeChoice() {
    try {
      const value = localStorage.getItem(THEME_KEY);
      return THEME_CHOICES.includes(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function systemTheme() {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function preferredTheme() {
    return themeChoice || storedThemeChoice() || 'system';
  }

  function activeTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function syncThemeChoiceUI() {
    const preference = preferredTheme();
    $$('[data-theme-choice]').forEach((button) => {
      const active = button.dataset.themeChoice === preference;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('active', active);
    });
  }

  function syncThemeUI(theme) {
    const toggle = $('#themeToggle');
    const next = theme === 'light' ? 'dark' : 'light';
    const nextLabel = next === 'light' ? 'Light' : 'Dark';
    if (toggle) {
      toggle.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      toggle.setAttribute('title', 'Switch to ' + next + ' theme');
      const label = $('.theme-toggle-label', toggle);
      if (label) label.textContent = nextLabel;
    }
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#eef3f8' : '#060e16');
    document.documentElement.style.colorScheme = theme;
    setText('#guideThemeTag', theme === 'light' ? 'Light' : 'Dark');
    syncThemeChoiceUI();
  }

  function applyTheme(theme, options = {}) {
    const root = document.documentElement;
    const next = theme === 'light' ? 'light' : 'dark';
    const previous = activeTheme();
    if (previous !== next && !options.silent) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) {
        root.classList.add('theme-transition');
        window.clearTimeout(themeTransitionTimer);
        themeTransitionTimer = window.setTimeout(() => root.classList.remove('theme-transition'), 360);
      }
    }
    if (options.persist) {
      themeChoice = next;
      try { localStorage.setItem(THEME_KEY, next); } catch (error) { /* storage unavailable */ }
    }
    root.setAttribute('data-theme', next);
    syncThemeUI(next);
    scene.palette = null;
    if (scene.ready && !scene.running) drawScene(performance.now());
    if (options.announce !== false && previous !== next) {
      setText('#themeStatus', (next === 'light' ? 'Light' : 'Dark') + ' theme enabled');
    }
  }

  function setThemePreference(choice) {
    if (!THEME_CHOICES.includes(choice)) return;
    themeChoice = choice;
    try { localStorage.setItem(THEME_KEY, choice); } catch (error) { /* storage unavailable */ }
    if (choice === 'system') {
      const resolved = systemTheme();
      applyTheme(resolved, { announce: false });
      setText('#themeStatus', 'System theme enabled. Currently ' + (resolved === 'light' ? 'Light' : 'Dark') + '.');
    } else {
      applyTheme(choice, { announce: true });
    }
    syncThemeChoiceUI();
  }

  function initTheme() {
    const systemLight = window.matchMedia('(prefers-color-scheme: light)');
    const preference = preferredTheme();
    const initial = preference === 'system' ? systemTheme() : preference;
    if (activeTheme() !== initial) applyTheme(initial, { silent: true, announce: false });
    else syncThemeUI(initial);

    $('#themeToggle')?.addEventListener('click', () => {
      applyTheme(activeTheme() === 'light' ? 'dark' : 'light', { persist: true });
    });

    const onSystemChange = (event) => {
      if (preferredTheme() !== 'system') return;
      applyTheme(event.matches ? 'light' : 'dark', { announce: false });
    };
    if (systemLight.addEventListener) systemLight.addEventListener('change', onSystemChange);
    else if (systemLight.addListener) systemLight.addListener(onSystemChange);
  }

  /* ==========================================================================
     Command palette and shortcut sheet
     ========================================================================== */

  const PALETTE_GROUPS = ['Go to', 'Actions', 'Subscribers', 'Alarms', 'Procedures'];
  const SHORTCUT_GROUPS = [
    ['Global', [
      ['Ctrl K', 'Open the command palette; <b>⌘K</b> on macOS.'],
      ['?', 'Open this shortcut sheet outside a text field.'],
      ['Esc', 'Close the palette, a dialog or the UE drawer.'],
    ]],
    ['Navigation', [
      ['Tab', 'Move focus; the skip link is the first stop.'],
      ['← → Home End', 'Move between workspace tabs.'],
      ['↑ ↓ Enter', 'Move through palette results and run one.'],
    ]],
    ['3D viewport', [
      ['← →', 'Orbit the synthetic scene.'],
      ['↑ ↓ + −', 'Tilt or zoom the camera.'],
      ['Home', 'Reset the camera to the isometric view.'],
    ]],
  ];
  let paletteTabs = null;

  function isEditableTarget(target) {
    return target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable);
  }

  function paletteFuzzyScore(q, text) {
    q = String(q || '').toLowerCase().trim();
    const value = String(text || '').toLowerCase();
    if (!q) return 1;
    const direct = value.indexOf(q);
    if (direct >= 0) return 1000 - direct + (direct ? 0 : 100);
    let score = 0, pos = -1, streak = 0;
    for (const char of q) {
      if (char === ' ') continue;
      const index = value.indexOf(char, pos + 1);
      if (index < 0) return 0;
      score += 2;
      if (index === pos + 1) score += 3 + ++streak;
      else streak = 0;
      pos = index;
    }
    return score;
  }

  function paletteScore(q, command) {
    const score = (text) => paletteFuzzyScore(q, text);
    const label = score(command.label), keywords = score(command.keywords), meta = score(command.meta);
    return label || keywords || meta ? Math.max(label * 2, keywords, meta / 2) : 0;
  }

  function paletteTabEntries() {
    if (!paletteTabs) {
      paletteTabs = $$('.tab').map((tab) => ({
        name: tab.dataset.view,
        label: [...tab.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim(),
        icon: tab.querySelector('use').getAttribute('href').slice(1),
      }));
    }
    return paletteTabs;
  }

  function buildPaletteCommands() {
    const commands = [];
    const add = (id, group, icon, label, meta, keywords, run) => commands.push({ id, group, icon, label, meta, keywords, run });
    paletteTabEntries().forEach((tab) => add('goto-' + tab.name, 'Go to', tab.icon, tab.label, 'Workspace', tab.name + ' tab workspace', () => {
      setTab(tab.name);
      $('#tab-' + tab.name)?.focus();
    }));
    [
      ['deploy', 'i-radio', 'Deploy fake BTS', 'Open the synthetic rogue-cell configuration', 'configure add fake bts rogue transmitter', openFakeModal],
      ['contain', 'i-shield', 'Contain rogue cell', 'Run the five-step containment playbook', 'contain rogue incident recover playbook', () => {
        if (!state.rogue || !state.incident) {
          setTab('rogue');
          showToast('No active fake BTS to contain. Configure one first.', 'warn');
          return;
        }
        setTab('rogue');
        if (state.incident.contained) showToast('The synthetic incident is already contained.', 'warn');
        else runContainment();
      }],
      ['reset', 'i-reset', 'Reset simulation', 'Return every tab to the clean baseline', 'reset restart clear baseline start over', resetSimulation],
      ['export-alarms', 'i-export', 'Export NOC alarms (CSV)', (state.noc ? state.noc.alarms.length : 0) + ' synthetic alarms in the current queue', 'export download alarms noc csv', exportNocAlarms],
      ['export-ues', 'i-export', 'Export virtual UEs (CSV)', state.ues.length + ' synthetic subscribers', 'export download ues subscribers csv', exportUesCsv],
      ['handoff', 'i-copy', 'Copy shift handoff', 'NOC summary for the next operator', 'copy handoff shift noc summary clipboard', copyNocHandoff],
      ['export-shift-log', 'i-export', 'Export shift log (CSV)', 'Ops log + response-step timeline', 'shift log csv export timeline', exportShiftLog],
      ['preset-baseline', 'i-reset', 'Scenario: clean baseline', 'Deployment-free starting state', 'scenario baseline preset reset', () => applyScenarioPreset('baseline')],
      ['preset-incident', 'i-radio', 'Scenario: incident in progress', 'Deploy GhostCell-01, run the incident', 'scenario incident preset rogue', () => applyScenarioPreset('incident')],
      ['preset-aftermath', 'i-shield', 'Scenario: contained aftermath', 'Fast-replay a contained incident', 'scenario aftermath preset replay', () => applyScenarioPreset('aftermath')],
      ['share-state', 'i-copy', 'Copy scenario state', 'vcss-scenario-state JSON to clipboard', 'share state copy json clipboard', copyShareState],
      ['import-state', 'i-down', 'Import scenario state', 'Validate and apply scenario-state JSON', 'import state paste validate json', () => openScenarioStateModal('import')],
      ['shortcuts', 'i-terminal', 'Keyboard shortcuts', 'Open the shortcut sheet', 'keyboard shortcuts keys help', openShortcutSheet],
    ].forEach(([id, icon, label, meta, keywords, run]) => add('action-' + id, 'Actions', icon, label, meta, keywords, run));
    const light = activeTheme() === 'light';
    add('action-theme', 'Actions', light ? 'i-moon' : 'i-sun', 'Switch to ' + (light ? 'dark' : 'light') + ' theme', 'Persist the two-state theme choice locally', 'theme dark light appearance toggle', () => applyTheme(activeTheme() === 'light' ? 'dark' : 'light', { persist: true }));
    const presets = { iso: 'Isometric', top: 'Top-down', ground: 'Ground level' };
    Object.keys(SCENE_PRESETS).forEach((key) => add('action-camera-' + key, 'Actions', 'i-camera', 'Camera: ' + presets[key], '3D emulation viewport preset', 'camera view preset 3d scene ' + key, () => {
      setTab('3d');
      sceneApplyPreset(key);
      setTimeout(() => $('#scene3d')?.focus(), 60);
    }));
    state.ues.forEach((ue) => add('ue-' + ue.id, 'Subscribers', 'i-users', ue.id + ' · ' + ue.imsi, ue.msisdn + ' · ' + ue.state + ' · ' + ue.device, [ue.imei, ue.serving, 'ue subscriber imsi msisdn'].join(' '), () => {
      setTab('ues');
      openDrawer(ue.id);
    }));
    (state.noc?.alarms || []).forEach((alarm) => add('alarm-' + alarm.id, 'Alarms', 'i-alert', alarm.id + ' · ' + alarm.title, 'P' + alarm.sev + ' · ' + alarm.domain + ' · ' + alarm.source, [alarm.detail, (alarm.runbook || []).map((step) => step.s).join(' '), 'alarm incident runbook'].join(' '), () => {
      setTab('noc');
      if (state.noc && !nocVisibleAlarms().some((item) => item.id === alarm.id)) {
        const filter = $('#nocAlarmFilter');
        if (filter) filter.value = 'all';
        setNocFilter('all');
      }
      selectNocAlarm(alarm.id);
    }));
    Object.entries(PROCEDURES).forEach(([key, procedure]) => add('procedure-' + key, 'Procedures', 'i-activity', procedure.title, 'Signaling trace · ' + procedure.tag + ' · ' + procedure.steps.length + ' steps', key + ' procedure trace signaling', () => {
      setTab('signaling');
      initSignaling();
      setProcedure(key);
      $('#tracePlay')?.focus();
    }));
    return commands;
  }

  function setPaletteActive(index) {
    if (!paletteResults.length) {
      $('#paletteInput')?.removeAttribute('aria-activedescendant');
      return;
    }
    paletteIndex = (index + paletteResults.length) % paletteResults.length;
    $$('.palette-item').forEach((item) => item.setAttribute('aria-selected', 'false'));
    const active = $('#palette-opt-' + paletteIndex);
    if (!active) return;
    active.setAttribute('aria-selected', 'true');
    $('#paletteInput')?.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
  }

  function renderPaletteResults(query) {
    const list = $('#paletteList');
    if (!list) return;
    const q = String(query || '').trim();
    const groups = new Map();
    buildPaletteCommands().forEach((command, order) => {
      const score = q ? paletteScore(q, command) : 1;
      if (!score || (!q && command.group !== 'Go to' && command.group !== 'Actions')) return;
      if (!groups.has(command.group)) groups.set(command.group, []);
      groups.get(command.group).push({ command, order, score });
    });
    const best = (group) => Math.max(0, ...(groups.get(group) || []).map((item) => item.score));
    const ranked = q ? [...PALETTE_GROUPS].sort((a, b) => best(b) - best(a) || PALETTE_GROUPS.indexOf(a) - PALETTE_GROUPS.indexOf(b)) : PALETTE_GROUPS;
    const html = [], flattened = [];
    ranked.forEach((group, groupIndex) => {
      const items = groups.get(group);
      if (!items) return;
      if (q) items.sort((a, b) => b.score - a.score || a.order - b.order);
      const groupId = 'palette-group-' + groupIndex;
      html.push('<div class="palette-group" role="group" aria-labelledby="' + groupId + '"><div class="palette-group-title" id="' + groupId + '"><span>' + esc(group) + '</span><span>' + items.length + '</span></div>');
      items.forEach(({ command }) => {
        const index = flattened.length;
        flattened.push(command);
        html.push('<div class="palette-item" id="palette-opt-' + index + '" role="option" aria-selected="false" data-palette-command="' + esc(command.id) + '"><span class="palette-item-icon"><svg class="icon" aria-hidden="true"><use href="#' + esc(command.icon) + '"></use></svg></span><span class="palette-item-copy"><strong>' + esc(command.label) + '</strong><small>' + esc(command.meta) + '</small></span><kbd class="palette-item-enter" aria-hidden="true">Enter</kbd></div>');
      });
      html.push('</div>');
    });
    if (!flattened.length) html.push('<div class="palette-empty" role="status"><b>No matches for “' + esc(q) + '”</b><br>Try a tab name, action, UE ID, IMSI, MSISDN, alarm or procedure.</div>');
    list.innerHTML = html.join('');
    paletteResults = flattened;
    paletteIndex = 0;
    const count = $('#paletteCount');
    if (count) count.textContent = flattened.length + ' result' + (flattened.length === 1 ? '' : 's');
    if (flattened.length) setPaletteActive(0);
    else $('#paletteInput')?.removeAttribute('aria-activedescendant');
  }

  function onPaletteKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (paletteResults.length) setPaletteActive(paletteIndex + (key === 'ArrowDown' ? 1 : -1));
    } else if (key === 'Enter') {
      event.preventDefault();
      const command = paletteResults[paletteIndex];
      if (command) runPaletteCommand(command.id);
    } else if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
    }
  }

  function runPaletteCommand(id) {
    const command = buildPaletteCommands().find((item) => item.id === id);
    if (!command) return;
    closeModal(false);
    $('#paletteBtn')?.focus();
    command.run();
  }

  function openCommandPalette() {
    if ($('#modalRoot')?.innerHTML || $('#drawerRoot')?.innerHTML) return;
    const root = $('#modalRoot');
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.innerHTML = `
      <div class="modal-backdrop palette-backdrop">
        <div class="modal palette-modal" role="dialog" aria-modal="true" aria-labelledby="paletteTitle">
          <h2 class="sr-only" id="paletteTitle">Command palette</h2>
          <div class="palette-search"><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg><input id="paletteInput" type="text" role="combobox" aria-expanded="true" aria-controls="paletteList" aria-autocomplete="list" aria-labelledby="paletteTitle" placeholder="Search tabs, actions, UEs, alarms, procedures…" autocomplete="off" spellcheck="false"><button class="icon-btn" type="button" data-palette-close aria-label="Close command palette"><svg class="icon"><use href="#i-x"></use></svg></button></div>
          <div class="palette-results" id="paletteList" role="listbox" aria-label="Command results"></div>
          <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> run</span><span><kbd>Esc</kbd> close</span><span class="palette-count" id="paletteCount" aria-live="polite"></span></div>
        </div>
      </div>
    `;
    document.body.style.overflow = 'hidden';
    const input = $('#paletteInput');
    input?.addEventListener('input', () => renderPaletteResults(input.value));
    input?.addEventListener('keydown', onPaletteKeyDown);
    $('#paletteList')?.addEventListener('mousedown', (event) => event.preventDefault());
    root.querySelector('.palette-backdrop')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeModal();
    });
    renderPaletteResults('');
    setTimeout(() => input?.focus(), 20);
  }

  function openShortcutSheet() {
    if ($('#modalRoot')?.innerHTML || $('#drawerRoot')?.innerHTML) return;
    const root = $('#modalRoot');
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = SHORTCUT_GROUPS.map(([title, rows]) => '<div class="shortcut-group"><h3>' + title + '</h3>' + rows.map(([keys, text]) => '<div class="shortcut-row"><span class="shortcut-keys">' + keys.split(' ').map((key) => '<kbd>' + key + '</kbd>').join('') + '</span><span>' + text + '</span></div>').join('') + '</div>').join('');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcutsTitle">
          <div class="modal-head"><div><h2 id="shortcutsTitle">Keyboard shortcuts</h2><p>Every shortcut runs locally in this browser.</p></div><button class="icon-btn" type="button" data-close="modal" aria-label="Close shortcut sheet"><svg class="icon"><use href="#i-x"></use></svg></button></div>
          <div class="modal-body">${body}</div>
        </div>
      </div>
    `;
    document.body.style.overflow = 'hidden';
    root.querySelector('.modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeModal();
    });
    root.querySelector('button[data-close="modal"]')?.addEventListener('click', () => closeModal());
    setTimeout(() => root.querySelector('button[data-close="modal"]')?.focus(), 40);
  }

  function bindEvents() {
    initScrollProgress();
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => setTab(tab.dataset.view)));
    $('.tabs')?.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = $$('.tab');
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      let next = current;
      if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      tabs[next].focus();
      setTab(tabs[next].dataset.view);
    });
    window.addEventListener('hashchange', applyRouteFromHash);
    window.addEventListener('popstate', applyRouteFromHash);
    $('#gateEnter')?.addEventListener('click', () => enterApp());
    $('#gateSkip')?.addEventListener('click', () => enterApp());

    $('#addFakeBtn')?.addEventListener('click', openFakeModal);
    $('#addFakeBtn2')?.addEventListener('click', openFakeModal);
    $('#resetBtn')?.addEventListener('click', resetSimulation);
    $('#paletteBtn')?.addEventListener('click', openCommandPalette);
    $('#runTraceBtn')?.addEventListener('click', runAttachDemo);
    $('#injectUeBtn')?.addEventListener('click', () => { generateNewUE(); refreshAll(); showToast('A new virtual UE was injected and attached.', 'ok'); });
    $('#addUeBtn')?.addEventListener('click', () => { generateNewUE(); refreshAll(); showToast('A new virtual UE was generated.', 'ok'); });
    $('#viewAllUesBtn')?.addEventListener('click', () => setTab('ues'));
    $('#playTraceBtn')?.addEventListener('click', () => {
      setTab('signaling');
      initSignaling();
      if (state.trace.playing) toggleTrace(); else startTrace();
    });

    $('#applyConfigBtn')?.addEventListener('click', () => {
      const pci = Number($('#pciInput')?.value);
      const tac = Number($('#tacInput')?.value);
      if (!Number.isInteger(pci) || pci < 0 || pci > 503) { showToast('PCI must be an integer between 0 and 503.', 'bad'); return; }
      if (!Number.isInteger(tac) || tac < 1 || tac > 65535) { showToast('TAC must be an integer between 1 and 65535.', 'bad'); return; }
      state.cell.pci = pci;
      state.cell.tac = tac;
      state.cell.bw = Number($('#bwSelect')?.value || 20);
      state.cell.duplex = $('#duplexSelect')?.value || 'FDD';
      addEvent('ok', 'Cell configuration applied', 'PCI ' + pci + ' · TAC ' + tac + ' · B' + state.cell.band + ' · ' + state.cell.bw + ' MHz');
      refreshAll();
      showToast('VCSS cell configuration applied.', 'ok');
    });
    $('#txPower')?.addEventListener('input', (event) => {
      state.cell.txPower = Number(event.target.value);
      setText('#txPowerOut', state.cell.txPower + ' dBm');
    });
    $('#load')?.addEventListener('input', (event) => {
      state.cell.baseLoad = Number(event.target.value);
      state.cell.load = clamp(state.cell.baseLoad + (state.rogue && !state.incident?.contained ? 16 : 0), 0, 99);
      setText('#loadOut', state.cell.load + '%');
      updateHeader();
      renderKpis();
      renderPerformance();
    });
    $('#broadcastBtn')?.addEventListener('click', () => {
      addEvent('ok', 'SIB1 / SIB2 broadcast refreshed', 'PLMN 001-01 · TAC ' + state.cell.tac + ' · PCI ' + state.cell.pci);
      showToast('System information broadcast refreshed.', 'ok');
    });
    $('#restartBtn')?.addEventListener('click', async () => {
      if (state.cell.restarting) return;
      state.cell.restarting = true;
      updateHeader();
      addEvent('warn', 'VCSS cell restart initiated', 'Cell service interrupted for configuration reload');
      await delay(1500);
      state.cell.restarting = false;
      state.cell.online = true;
      addEvent('ok', 'VCSS cell restart complete', 'S1-MME, S1-U and broadcast restored');
      refreshAll();
      showToast('VCSS cell restarted. Broadcast and S1 links restored.', 'ok');
    });

    $('#ueSearch')?.addEventListener('input', renderUeRegistry);
    $('#ueStateFilter')?.addEventListener('change', renderUeRegistry);
    $('#ueTypeFilter')?.addEventListener('change', renderUeRegistry);
    $('#refreshUesBtn')?.addEventListener('click', () => {
      state.ues.forEach((ue) => {
        if (ue.state === 'detached') return;
        ue.rsrp = Number(clamp(ue.rsrp + (Math.random() - 0.5) * 3, -118, -62).toFixed(1));
        ue.sinr = Number(clamp(ue.sinr + (Math.random() - 0.5) * 2, 0, 28).toFixed(1));
        ue.cqi = clamp(ue.cqi + Math.round((Math.random() - 0.5) * 2), 0, 15);
        if (ue.state === 'connected') {
          ue.dl = Number(clamp(ue.dl + (Math.random() - 0.5) * 4, 2, 50).toFixed(1));
          ue.ul = Number(clamp(ue.ul + (Math.random() - 0.5) * 2, 0.5, 18).toFixed(1));
        }
        ue.lastSeen = new Date();
      });
      addEvent('info', 'Virtual UE radio metrics refreshed', 'RSRP / SINR / CQI jitter applied to active subscribers');
      refreshAll();
      showToast('Virtual UE metrics refreshed.', 'ok');
    });
    $('#exportUesBtn')?.addEventListener('click', exportUesCsv);

    $('#nocAlarmFilter')?.addEventListener('change', (event) => setNocFilter(event.target.value));
    $('#exportAlarmsBtn')?.addEventListener('click', exportNocAlarms);
    $('#handoffBtn')?.addEventListener('click', copyNocHandoff);

    $('#resetModelBtn')?.addEventListener('click', () => {
      state.model = { ...MODEL_DEFAULTS };
      syncModelControls();
      updateBusinessOutputs();
      showToast('Business case assumptions reset.', 'ok');
    });
    $('#copyCaseBtn')?.addEventListener('click', copySummary);
    $('#downloadCaseBtn')?.addEventListener('click', downloadBusinessCsv);
    $('#printCaseBtn')?.addEventListener('click', () => window.print());

    $$('.scene-preset').forEach((button) => {
      button.addEventListener('click', () => sceneApplyPreset(button.dataset.camera));
    });
    $('#sceneResetBtn')?.addEventListener('click', () => sceneApplyPreset('iso'));
    $('#sceneOrbitBtn')?.addEventListener('click', sceneToggleOrbit);
    $('#sceneSaveViewBtn')?.addEventListener('click', saveSceneBookmark);
    $('#sceneRestoreViewBtn')?.addEventListener('click', restoreSceneBookmark);
    $('#sceneSnapshotBtn')?.addEventListener('click', exportSceneSnapshot);
    $('#sceneFullscreenBtn')?.addEventListener('click', toggleSceneFullscreen);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) sceneStop();
      else if (scene.active) sceneStart();
    });

    document.addEventListener('click', (event) => {
      const paletteItemEl = event.target.closest('[data-palette-command]');
      if (paletteItemEl) {
        runPaletteCommand(paletteItemEl.dataset.paletteCommand);
        return;
      }
      if (event.target.closest('[data-palette-close]')) {
        closeModal();
        return;
      }
      const nocActionEl = event.target.closest('[data-noc-action]');
      if (nocActionEl) {
        runNocAction(nocActionEl.dataset.nocAction, nocActionEl.dataset.alarmId);
        return;
      }
      const alarmRow = event.target.closest('tr[data-alarm-id]');
      if (alarmRow) {
        selectNocAlarm(alarmRow.dataset.alarmId);
        return;
      }
      const guideTabEl = event.target.closest('[data-guidance-tab]');
      if (guideTabEl) {
        setTab(guideTabEl.dataset.guidanceTab);
        return;
      }
      const themeChoiceEl = event.target.closest('[data-theme-choice]');
      if (themeChoiceEl) {
        setThemePreference(themeChoiceEl.dataset.themeChoice);
        return;
      }
      const actionEl = event.target.closest('[data-action]');
      if (actionEl) {
        const action = actionEl.dataset.action;
        if (action === 'deploy') openFakeModal();
        else if (action === 'business') setTab('business');
        else if (action === 'toggle-theme') $('#themeToggle')?.click();
        else if (action === 'contain') runContainment();
        else if (action === 'reset') resetSimulation();
        else if (action === 'close-drawer') closeDrawer();
        else if (action === 'trace-ue') traceUE(actionEl.dataset.ueId);
        else if (action === 'release-ue') releaseUE(actionEl.dataset.ueId);
        else if (action === 'scene-open-ue') openDrawer(actionEl.dataset.ueId);
        else if (action === 'scene-open-rogue') setTab('rogue');
        else if (action === 'scene-open-runbook') {
          const alarms = state.noc?.alarms || [];
          const rf = alarms.find((alarm) => alarm.dedupKey === 'rogue-rf' && alarm.state !== 'cleared') || alarms.find((alarm) => alarm.dedupKey === 'rogue-rf');
          setTab('noc');
          if (rf) selectNocAlarm(rf.id);
        }
        else if (action === 'scene-focus') sceneFocusSelected();
        else if (action === 'preset-baseline') applyScenarioPreset('baseline');
        else if (action === 'preset-incident') applyScenarioPreset('incident');
        else if (action === 'preset-aftermath') applyScenarioPreset('aftermath');
        else if (action === 'share-state') copyShareState();
        else if (action === 'import-state') openScenarioStateModal('import');
        return;
      }
      const traceEl = event.target.closest('[data-trace]');
      if (traceEl) {
        event.stopPropagation();
        traceUE(traceEl.dataset.trace);
        return;
      }
      const row = event.target.closest('tr[data-ue-id]');
      if (row) openDrawer(row.dataset.ueId);
    });

    document.addEventListener('keydown', (event) => {
      if (gateOpen()) {
        if (event.key === 'Tab') trapFocus(event, gateEl());
        else if (event.key === 'Escape') { event.preventDefault(); enterApp({ focus: false }); }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && String(event.key).toLowerCase() === 'k') {
        event.preventDefault();
        if ($('#modalRoot .palette-modal')) closeModal();
        else openCommandPalette();
        return;
      }
      if (!isEditableTarget(event.target) && event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey
        && !$('#modalRoot')?.innerHTML && !$('#drawerRoot')?.innerHTML) {
        event.preventDefault();
        openShortcutSheet();
        return;
      }
      if (event.key === 'Tab') {
        const root = $('#modalRoot .modal') || $('#drawerRoot .drawer');
        if (root) trapFocus(event, root);
        return;
      }
      if (event.key !== 'Escape') return;
      if ($('#modalRoot')?.innerHTML) closeModal();
      else if ($('#drawerRoot')?.innerHTML) closeDrawer();
    });
  }

  function renderView(name) {
    switch (name) {
      case 'overview':
        renderKpis();
        renderOverviewTable();
        renderEvents();
        renderPerformance();
        renderTopologies();
        break;
      case 'noc':
        refreshNoc();
        break;
      case 'ues':
        renderUeRegistry();
        break;
      case 'signaling':
        if (!state.trace.built) initSignaling();
        else updateTraceSubjectOptions();
        break;
      case '3d':
        renderScene3D();
        break;
      case 'rogue':
        renderRogueView();
        break;
      case 'business':
        updateBusinessOutputs();
        break;
      default:
        break;
    }
    viewDirty.delete(name);
  }

  function refreshAll() {
    updateHeader();
    syncNocData();
    renderView('overview');
    renderView('noc');
    renderView('ues');
    renderView('rogue');
    renderView('business');
    renderScene3D();
    viewDirty.add('signaling');
  }

  function init() {
    state.ues = generateUEs();
    state.events = initialEvents();
    state.chartData = generateChartData();
    state.noc = createNocState();
    initBusinessControls();
    initTheme();
    const paletteKbd = $('#paletteKbd');
    if (paletteKbd && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)) {
      paletteKbd.textContent = '⌘K';
      $('#paletteBtn')?.setAttribute('title', 'Open command palette (⌘K)');
    }
    bindEvents();
    updateClock();
    setInterval(updateClock, 1000);
    updateHeader();
    syncNocData();
    setText('#appVersionTag', 'v' + APP_VERSION);
    const hash = (location.hash || '').replace('#', '');
    const hadHash = !!hash;
    setTab(hash || 'overview', { noScroll: true, history: 'replace' });
    initGate(hadHash);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
