const DEFAULT_NAV_ITEMS = [
  { id: 'scene', label: 'Scene' },
  { id: 'clues', label: 'Clues' },
  { id: 'suspects', label: 'Suspects' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'interviews', label: 'Interviews' }
];

function getNavItems() {
  const tabs = currentCaseMeta().tabs;
  if (!Array.isArray(tabs) || !tabs.length) return DEFAULT_NAV_ITEMS;
  return tabs.map(tab => {
    if (typeof tab === 'string') return { id: tab, label: tab.charAt(0).toUpperCase() + tab.slice(1) };
    return { id: tab.id, label: tab.label || (tab.id ? tab.id.charAt(0).toUpperCase() + tab.id.slice(1) : 'Tab') };
  }).filter(x => x.id);
}

let manifest = null;
let game = null;
let currentCaseFile = null;

const state = {
  currentSceneId: null,
  currentTab: 'scene',
  score: 0,
  flags: new Set(),
  evidence: new Set(),
  visitedScenes: new Set(),
  usedHints: {},
  interviewState: {},
  checkpointResults: {},
  finalAnswers: {},
  finalResult: null,
  mapFloor: null,
  mapZoneId: null,
  activeHint: '',
  checkpointSelections: {},
  roundTimers: {}
};

const el = {
  heroEyebrow: document.getElementById('heroEyebrow'),
  heroTitle: document.getElementById('heroTitle'),
  heroSub: document.getElementById('heroSub'),
  heroStats: document.getElementById('heroStats'),
  caseSelect: document.getElementById('caseSelect'),
  loadCaseBtn: document.getElementById('loadCaseBtn'),
  newRunBtn: document.getElementById('newRunBtn'),
  resumeBtn: document.getElementById('resumeBtn'),
  caseMetaLine: document.getElementById('caseMetaLine'),
  score: document.getElementById('score'),
  roundLabel: document.getElementById('roundLabel'),
  timerLabel: document.getElementById('timerLabel'),
  timerCard: document.getElementById('timerCard'),
  panel: document.getElementById('panel'),
  tabs: document.getElementById('tabs'),
  mainNav: document.getElementById('mainNav'),
  hintBtn: document.getElementById('hintBtn'),
  hintBox: document.getElementById('hintBox'),
  saveBtn: document.getElementById('saveBtn'),
  loadBtn: document.getElementById('loadBtn'),
  resetBtn: document.getElementById('resetBtn')
};

function getStorageKey(file = currentCaseFile) {
  return `barfly_mystery_engine__${file || 'unknown'}`;
}

function escapeHtml(text = '') {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function sceneMap() { return game?.scenes || {}; }
function evidenceMap() { return game?.evidence || {}; }
function suspectList() { return game?.suspects || []; }
function interviewMap() { return game?.interviews || {}; }
function currentScene() { return sceneMap()[state.currentSceneId] || null; }
function currentRound() { return currentScene()?.round || 'Final'; }
function currentCaseMeta() { return game?.case || {}; }
function hasAllFlags(flags = []) { return flags.every(f => state.flags.has(f)); }
function hasAllEvidence(ids = []) { return ids.every(id => state.evidence.has(id)); }

function resetStateToCaseStart() {
  const entry = currentCaseMeta().entryScene || 'scene_001_opening';
  state.currentSceneId = entry;
  state.currentTab = 'scene';
  state.score = 0;
  state.flags = new Set();
  state.evidence = new Set();
  state.visitedScenes = new Set();
  state.usedHints = {};
  state.interviewState = {};
  state.checkpointResults = {};
  state.finalAnswers = {};
  state.finalResult = null;
  state.mapFloor = null;
  state.mapZoneId = null;
  state.activeHint = '';
  state.checkpointSelections = {};
  state.roundTimers = {};
}

function serializeState() {
  return {
    currentSceneId: state.currentSceneId,
    currentTab: state.currentTab,
    score: state.score,
    flags: [...state.flags],
    evidence: [...state.evidence],
    visitedScenes: [...state.visitedScenes],
    usedHints: state.usedHints,
    interviewState: state.interviewState,
    checkpointResults: state.checkpointResults,
    finalAnswers: state.finalAnswers,
    finalResult: state.finalResult,
    mapFloor: state.mapFloor,
    mapZoneId: state.mapZoneId,
    activeHint: state.activeHint,
    checkpointSelections: state.checkpointSelections,
    roundTimers: state.roundTimers
  };
}

function hydrateState(data) {
  if (!data) return false;
  state.currentSceneId = data.currentSceneId || currentCaseMeta().entryScene || 'scene_001_opening';
  state.currentTab = data.currentTab || 'scene';
  state.score = data.score || 0;
  state.flags = new Set(data.flags || []);
  state.evidence = new Set(data.evidence || []);
  state.visitedScenes = new Set(data.visitedScenes || []);
  state.usedHints = data.usedHints || {};
  state.interviewState = data.interviewState || {};
  state.checkpointResults = data.checkpointResults || {};
  state.finalAnswers = data.finalAnswers || {};
  state.finalResult = data.finalResult || null;
  state.mapFloor = data.mapFloor || null;
  state.mapZoneId = data.mapZoneId || null;
  state.activeHint = data.activeHint || '';
  state.checkpointSelections = data.checkpointSelections || {};
  state.roundTimers = data.roundTimers || {};
  return true;
}

function saveState() {
  localStorage.setItem(getStorageKey(), JSON.stringify(serializeState()));
  el.caseMetaLine.textContent = `Saved progress for ${currentCaseMeta().title || 'current case'}.`;
}

function loadState() {
  const raw = localStorage.getItem(getStorageKey());
  if (!raw) return false;
  try {
    return hydrateState(JSON.parse(raw));
  } catch {
    return false;
  }
}

function grantEvidence(ids = []) {
  ids.forEach(id => { if (evidenceMap()[id]) state.evidence.add(id); });
}

function setFlags(ids = []) {
  ids.forEach(id => state.flags.add(id));
}

function maybeApplySceneEffects(scene) {
  if (!scene) return;
  if (scene.grants) grantEvidence(scene.grants);
  if (scene.flags) setFlags(scene.flags);
}


function getRoundConfig(round) {
  const rounds = game?.rounds || [];
  return rounds.find(r => String(r.number) === String(round) || String(r.id) === String(round)) || null;
}

function ensureRoundTimer(round) {
  const key = String(round || '');
  if (!key || key === '0' || key.toLowerCase() === 'final') return;
  if (!state.roundTimers[key]) {
    const cfg = getRoundConfig(round);
    const duration = Number(cfg?.timer_seconds || 0);
    if (duration > 0) state.roundTimers[key] = { startedAt: Date.now(), duration };
  }
}

function getRemainingRoundSeconds(round) {
  const key = String(round || '');
  const timer = state.roundTimers[key];
  if (!timer) return null;
  const elapsed = Math.floor((Date.now() - timer.startedAt) / 1000);
  return Math.max(0, timer.duration - elapsed);
}

function formatSeconds(total) {
  if (total == null || Number.isNaN(total)) return '--:--';
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function goScene(id) {
  const scene = sceneMap()[id];
  if (!scene) {
    showError(`Scene not found: ${id}`);
    return;
  }
  state.currentSceneId = id;
  state.currentTab = 'scene';
  state.visitedScenes.add(id);
  ensureRoundTimer(scene.round);
  maybeApplySceneEffects(scene);
  render();
}

function getManifestDefault() {
  const urlCase = new URLSearchParams(location.search).get('case');
  return urlCase || manifest?.default_case || manifest?.cases?.[0]?.file || 'case_001.json';
}

async function loadManifest() {
  try {
    const res = await fetch('./cases.json', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    manifest = await res.json();
  } catch {
    manifest = {
      default_case: 'case_001.json',
      cases: [{ id: 'case_001', file: 'case_001.json', label: 'Crime 001 — The Karaoke Killer' }]
    };
  }
  renderCaseSelect();
}

function renderCaseSelect() {
  el.caseSelect.innerHTML = '';
  (manifest?.cases || []).forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.file;
    opt.textContent = item.label || item.file;
    el.caseSelect.appendChild(opt);
  });
  el.caseSelect.value = getManifestDefault();
}

async function loadCase(file, { preferSave = true } = {}) {
  const res = await fetch(`./${file}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${file} (${res.status})`);
  game = await res.json();
  currentCaseFile = file;
  decorateCaseDefaults();
  renderHero();
  if (!(preferSave && loadState())) resetStateToCaseStart();
  render();
}

function decorateCaseDefaults() {
  const c = currentCaseMeta();
  c.id ||= currentCaseFile.replace(/\.json$/i, '');
  c.entryScene ||= 'scene_001_opening';
  c.title ||= c.id;
  c.subtitle ||= 'Investigate the case, unlock clues, and make the final accusation.';
  c.solution ||= {
    killer: 'suspect_selena',
    motive: 'expose_stolen_lyrics',
    method: 'poisoned_drink_then_collapse',
    proof: 'evidence_pill_bottle_cap'
  };
}

function renderHero() {
  const c = currentCaseMeta();
  el.heroEyebrow.textContent = `${c.crime_number ? `Crime ${c.crime_number} • ` : ''}${c.difficulty || ''}${c.tone ? ` • ${c.tone}` : ''}`.replace(/^ • | • $/g, '') || 'Mystery Engine';
  el.heroTitle.textContent = c.title || 'Barfly Mystery Engine';
  el.heroSub.textContent = c.subtitle || 'Load a case and begin investigating.';
  const pills = [
    c.setting ? `Setting: ${c.setting}` : null,
    c.series_arc ? `Series Arc: ${c.series_arc}` : null,
    c.mode ? `Mode: ${c.mode}` : null,
    c.rank_required ? `Rank Required: ${c.rank_required}` : null
  ].filter(Boolean);
  el.heroStats.innerHTML = pills.map(p => `<div class="pill">${escapeHtml(p)}</div>`).join('');
  const manifestItem = (manifest?.cases || []).find(x => x.file === currentCaseFile);
  const details = [manifestItem?.label, currentCaseFile, localStorage.getItem(getStorageKey()) ? 'Saved run found' : 'No save yet'].filter(Boolean);
  el.caseMetaLine.textContent = details.join(' • ');
}

function renderTabs() {
  el.tabs.innerHTML = '';
  el.tabs.hidden = true;
}

function renderNav() {
  el.mainNav.innerHTML = getNavItems().map(item => {
    const active = state.currentTab === item.id ? ' active' : '';
    return `<button class="${active.trim()}" onclick="switchTab('${item.id}')">${escapeHtml(item.label)}</button>`;
  }).join('');
}

function switchTab(tab) {
  const valid = new Set(getNavItems().map(x => x.id));
  state.currentTab = valid.has(tab) ? tab : 'scene';
  render();
}


function updateTimerDisplay() {
  const value = formatSeconds(getRemainingRoundSeconds(currentRound()));
  if (el.timerLabel) el.timerLabel.textContent = value;
  const remaining = getRemainingRoundSeconds(currentRound());
  if (el.timerCard) el.timerCard.classList.toggle('is-warning', typeof remaining === 'number' && remaining <= 120);
}

function render() {
  renderHero();
  renderTabs();
  renderNav();
  if (el.score) el.score.textContent = state.score;
  if (el.roundLabel) el.roundLabel.textContent = currentRound();
  updateTimerDisplay();
  if (state.activeHint) {
    el.hintBox.hidden = false;
    el.hintBox.style.display = 'block';
    el.hintBox.textContent = state.activeHint;
  } else {
    el.hintBox.hidden = true;
    el.hintBox.style.display = 'none';
    el.hintBox.textContent = '';
  }

  if (!game) {
    el.panel.innerHTML = `<div class="start-card"><h2>No case loaded</h2><div class="body">Choose a case file above to begin.</div></div>`;
    return;
  }

  if (state.currentTab === 'scene') renderScene();
  else if (state.currentTab === 'clues') renderClues();
  else if (state.currentTab === 'suspects') renderSuspects();
  else if (state.currentTab === 'timeline') renderTimeline();
  else if (state.currentTab === 'interviews') renderInterviews();
  else if (state.currentTab === 'map') renderMap();

  saveState();
}

function renderScene() {
  const s = currentScene();
  if (!s) return showError('Current scene not found.');

  let html = `<div class="muted">Round ${escapeHtml(String(s.round || 'Final'))} • ${escapeHtml(s.type)}</div>`;
  html += `<h2>${escapeHtml(s.title || 'Untitled Scene')}</h2>`;
  if (s.text) html += `<div class="scene-block"><div class="body">${escapeHtml(s.text)}</div></div>`;
  if (s.audio_transcript) html += `<div class="response"><strong>Audio Transcript</strong><div class="body">${escapeHtml(s.audio_transcript)}</div></div>`;

  if (s.type === 'checkpoint') {
    html += renderCheckpoint(s);
  } else if (s.type === 'final') {
    html += renderFinalAccusation();
  } else if (s.type === 'ending') {
    html += `<div class="notice">Case complete.</div><div class="footer-actions"><button class="ghost" onclick="startNewRun()">Start Over</button></div>`;
  } else if (s.type === 'interviewEntry') {
    html += `<div class="footer-actions"><button class="primary" onclick="openInterview('${escapeJs(s.character)}')">Open interview topics</button></div>`;
  } else {
    html += renderSceneChoices(s);
  }

  el.panel.innerHTML = html;
}

function renderSceneChoices(scene) {
  const buttons = [];
  (scene.choices || []).forEach(choice => {
    const [label, next] = choice;
    if (scene.id === 'scene_002_body_reveal' && next === 'scene_007_round1_checkpoint') return;
    buttons.push(`<button class="choice" onclick="goScene('${escapeJs(next)}')">${escapeHtml(label)}</button>`);
  });

  if (scene.id === 'scene_002_body_reveal') {
    const needed = ['scene_003_whiskey_glass', 'scene_004_lyric_fragment', 'scene_005_broken_glass', 'scene_006_suspect_board_intro'];
    if (needed.every(id => state.visitedScenes.has(id))) {
      buttons.push(`<button class="choice" onclick="goScene('scene_007_round1_checkpoint')">Make your first call</button>`);
    }
  }

  if (['scene_008_tasha_intro', 'scene_009_leon_intro', 'scene_010_selena_intro', 'scene_011_jax_intro', 'scene_012_mia_intro', 'scene_013_damien_intro'].includes(scene.id)) {
    buttons.push(`<button class="choice" onclick="maybeGotoRound2Checkpoint()">Review your first contradictions</button>`);
  }

  return `<div class="footer-actions">${buttons.join('')}</div>`;
}

function renderCheckpoint(scene) {
  const selected = state.checkpointSelections[scene.id];
  let html = `<div class="final-group"><div class="question">${escapeHtml(scene.prompt)}</div><div class="answer-list checkpoint-list">`;
  scene.answers.forEach((ans, idx) => {
    const label = Array.isArray(ans) ? ans[0] : ans.label;
    const active = selected === idx ? ' selected' : '';
    html += `<button class="answer${active}" onclick="selectCheckpointAnswer('${escapeJs(scene.id)}', ${idx})">${escapeHtml(label)}</button>`;
  });
  html += `</div>`;

  const result = state.checkpointResults[scene.id];
  if (!result) {
    html += `<div class="footer-actions"><button class="primary" ${selected == null ? 'disabled' : ''} onclick="submitCheckpoint('${escapeJs(scene.id)}')">Submit Answer</button></div>`;
  }
  html += `</div>`;

  if (result) {
    html += `<div class="response ${result.correct ? 'good' : 'warn'}">${escapeHtml(result.text)}</div>`;
    html += `<div class="footer-actions"><button class="primary" onclick="goScene('${escapeJs(scene.next)}')">Continue</button></div>`;
  }
  return html;
}

function selectCheckpointAnswer(sceneId, idx) {
  if (state.checkpointResults[sceneId]) return;
  state.checkpointSelections[sceneId] = idx;
  render();
}

function submitCheckpoint(sceneId) {
  const idx = state.checkpointSelections[sceneId];
  if (idx == null) return;
  answerCheckpoint(sceneId, idx);
}

function answerCheckpoint(sceneId, idx) {
  const scene = sceneMap()[sceneId];
  if (!scene) return;
  const ans = scene.answers[idx];
  const isCorrect = Array.isArray(ans) ? !!ans[1] : !!ans.is_correct;
  if (!state.checkpointResults[sceneId]) {
    if (isCorrect) state.score += 25;
    setFlags([scene.flag, ...(scene.extraFlags || [])].filter(Boolean));
  }
  state.checkpointResults[sceneId] = { correct: isCorrect, text: isCorrect ? scene.correct : scene.incorrect };
  render();
}

function maybeGotoRound2Checkpoint() {
  const needed = ['scene_008_tasha_intro', 'scene_009_leon_intro', 'scene_010_selena_intro', 'scene_011_jax_intro', 'scene_012_mia_intro', 'scene_013_damien_intro'];
  if (needed.every(id => state.visitedScenes.has(id))) goScene('scene_014_round2_checkpoint');
  else alert('Finish visiting all first interview entries before moving on.');
}

function renderClues() {
  const entries = Object.entries(evidenceMap());
  if (!entries.length) {
    el.panel.innerHTML = `<div class="empty">No evidence found for this case.</div>`;
    return;
  }
  const grouped = { core: [], supporting: [], bonus: [], red_herring: [] };
  for (const [id, item] of entries) {
    const found = state.evidence.has(id);
    const cat = item.category || 'supporting';
    const card = found
      ? `<div class="clue"><div class="muted">${escapeHtml(cat)}</div><h3 class="clue-title">${escapeHtml(item.title)}</h3><div class="body">${escapeHtml(item.desc || item.short || '')}</div><div class="tags">${(item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div></div>`
      : `<div class="clue"><div class="muted">Locked</div><h3 class="clue-title">Unknown Evidence</h3><div class="tiny">Find more scene clues and interview details to unlock this card.</div></div>`;
    (grouped[cat] || grouped.supporting).push(card);
  }
  el.panel.innerHTML = ['core', 'supporting', 'bonus', 'red_herring']
    .map(cat => `<section><h2>${escapeHtml(cat.replace('_', ' '))}</h2>${grouped[cat].join('') || `<div class="empty">No entries.</div>`}</section>`).join('');
}

function renderSuspects() {
  const html = suspectList().map(s => `
    <div class="suspect">
      <div class="muted">${escapeHtml(s.role || 'Suspect')}</div>
      <h3>${escapeHtml(s.name)}</h3>
      <div class="body">${escapeHtml(s.public_read || '')}</div>
      <div class="tiny" style="margin-top:10px">Connection: ${escapeHtml(s.relationship || s.relationship_to_victim || '')}</div>
      <div class="tiny">Early Read: ${escapeHtml(s.status_early || '')}</div>
      <div class="tiny">Late Read: ${escapeHtml(s.status_late || '')}</div>
    </div>`).join('');
  el.panel.innerHTML = `<h2>Suspects</h2>${html}`;
}

function renderTimeline() {
  const items = game?.timeline?.public || [];
  if (!items.length) return void (el.panel.innerHTML = `<div class="empty">No public timeline entries.</div>`);
  el.panel.innerHTML = `<h2>Timeline</h2><div class="list">${items.map(item => {
    const time = Array.isArray(item) ? item[0] : item.time;
    const text = Array.isArray(item) ? item[1] : item.text;
    return `<div class="timeline-item"><div class="time">${escapeHtml(time)}</div><div class="body">${escapeHtml(text)}</div></div>`;
  }).join('')}</div>`;
}

function renderMap() {
  const map = game?.map;
  const visual = game?.map_visual;
  if (visual && Array.isArray(visual.floors) && visual.floors.length) {
    renderVisualMap(visual, map);
    return;
  }
  if (!map || !Array.isArray(map.levels) || !map.levels.length) {
    el.panel.innerHTML = `<div class="empty">No map data for this case.</div>`;
    return;
  }
  const notes = (map.notes || []).map(n => `<li>${escapeHtml(n)}</li>`).join('');
  const levels = map.levels.map(level => `
    <div class="suspect">
      <div class="muted">${escapeHtml(level.id || 'level')}</div>
      <h3>${escapeHtml(level.label || level.id || 'Level')}</h3>
      <div class="tags">${(level.zones || []).map(z => `<span class="tag">${escapeHtml(z)}</span>`).join('')}</div>
    </div>`).join('');
  el.panel.innerHTML = `<h2>Map</h2>${levels}${notes ? `<div class="scene-block"><ul class="body">${notes}</ul></div>` : ''}`;
}

function renderVisualMap(visual, map) {
  const defaultFloor = state.mapFloor || visual.default_floor || visual.floors[0]?.id;
  if (!visual.floors.find(f => f.id === defaultFloor)) state.mapFloor = visual.floors[0]?.id;
  else state.mapFloor = defaultFloor;
  const floor = visual.floors.find(f => f.id === state.mapFloor) || visual.floors[0];
  const selectedZoneId = state.mapZoneId && floor.zones?.find(z => z.id === state.mapZoneId) ? state.mapZoneId : (floor.zones?.[0]?.id || null);
  state.mapZoneId = selectedZoneId;
  const selectedZone = floor.zones?.find(z => z.id === selectedZoneId) || null;

  const floorButtons = visual.floors.map(f => `<button class="tabbtn${state.mapFloor === f.id ? ' active' : ''}" onclick="setMapFloor('${escapeJs(f.id)}')">${escapeHtml(f.label)}</button>`).join('');
  const legend = (visual.legend || []).map(item => `<span class="legend-item"><span class="legend-swatch ${escapeHtml(item.key)}"></span>${escapeHtml(item.label)}</span>`).join('');
  const zones = (floor.zones || []).map(zone => {
    const active = zone.id === selectedZoneId ? ' active' : '';
    const style = `left:${zone.x}%;top:${zone.y}%;width:${zone.w}%;height:${zone.h}%;`;
    return `<button class="map-zone ${escapeHtml(zone.kind || 'public')}${active}" style="${style}" onclick="setMapZone('${escapeJs(zone.id)}')"><span>${escapeHtml(zone.label)}</span></button>`;
  }).join('');

  const routeSvgs = (floor.routes || []).map(route => {
    const pts = (route.points || []).map(p => `${p[0]},${p[1]}`).join(' ');
    return `<polyline class="map-route ${escapeHtml(route.style || 'staff')}" points="${pts}"></polyline>`;
  }).join('');

  const clueLinks = [];
  if (selectedZone && floor.highlights) {
    floor.highlights.filter(h => h.zone_id === selectedZone.id).forEach(h => {
      const clue = evidenceMap()[h.evidence_id];
      if (clue) clueLinks.push(`<div class="mini-clue"><strong>${escapeHtml(clue.title)}</strong><div class="tiny">${escapeHtml(clue.short_card || clue.short || clue.description || '')}</div></div>`);
    });
  }
  const routeCards = (floor.routes || []).map(route => `<div class="mini-route"><strong>${escapeHtml(route.label)}</strong><div class="tiny">${escapeHtml((route.notes || []).join(' '))}</div></div>`).join('');
  const mapNotes = (map?.notes || []).map(n => `<li>${escapeHtml(n)}</li>`).join('');
  const zoneNotes = (selectedZone?.notes || []).map(n => `<li>${escapeHtml(n)}</li>`).join('');

  el.panel.innerHTML = `
    <div class="map-header-row">
      <div>
        <div class="muted">Interactive Floor Map</div>
        <h2>${escapeHtml(floor.label)}</h2>
        <div class="tiny">${escapeHtml(floor.subtitle || '')}</div>
      </div>
      <div class="map-floor-buttons">${floorButtons}</div>
    </div>
    <div class="map-legend">${legend}</div>
    <div class="map-layout-grid">
      <div class="map-stage-wrap">
        <div class="map-stage">
          <svg class="map-routes" viewBox="0 0 100 100" preserveAspectRatio="none">${routeSvgs}</svg>
          ${zones}
        </div>
      </div>
      <div class="map-sidebar-panel">
        <div class="scene-block compact">
          <div class="muted">Selected Zone</div>
          <h3>${escapeHtml(selectedZone?.label || 'No zone selected')}</h3>
          <div class="tags"><span class="tag">${escapeHtml(selectedZone?.kind || 'zone')}</span>${selectedZone?.id ? `<span class="tag">${escapeHtml(selectedZone.id)}</span>` : ''}</div>
          ${zoneNotes ? `<ul class="body map-note-list">${zoneNotes}</ul>` : `<div class="tiny">Tap a zone to inspect why it matters.</div>`}
        </div>
        ${clueLinks.length ? `<div class="scene-block compact"><div class="muted">Case Clues Tied Here</div>${clueLinks.join('')}</div>` : ''}
        ${(floor.routes || []).length ? `<div class="scene-block compact"><div class="muted">Important Routes</div>${routeCards}</div>` : ''}
        ${mapNotes ? `<div class="scene-block compact"><div class="muted">Building Logic</div><ul class="body map-note-list">${mapNotes}</ul></div>` : ''}
      </div>
    </div>`;
}

function setMapFloor(floorId) {
  state.currentTab = 'map';
  state.mapFloor = floorId;
  state.mapZoneId = null;
  render();
}

function setMapZone(zoneId) {
  state.currentTab = 'map';
  state.mapZoneId = zoneId;
  render();
}

function renderInterviews() {
  const cards = Object.entries(interviewMap()).map(([id, interview]) => {
    const name = interview.name || id;
    const viewed = state.interviewState[id]?.opened ? 'Opened' : 'Not opened';
    return `<div class="suspect"><div class="muted">Interview</div><h3>${escapeHtml(name)}</h3><div class="tiny">${escapeHtml(viewed)}</div><div class="footer-actions"><button class="smallbtn" onclick="openInterview('${escapeJs(id)}')">Open</button></div></div>`;
  }).join('');
  el.panel.innerHTML = `<h2>Interviews</h2>${cards}`;
}

function openInterview(id) {
  const interview = interviewMap()[id];
  if (!interview) return showError(`Interview not found: ${id}`);
  state.currentTab = 'interviews';
  state.interviewState[id] ||= { opened: true, exhausted: [], last: '' };
  state.interviewState[id].opened = true;
  const topicsHtml = interview.topics.map(topic => {
    const available = topicAvailable(topic);
    const exhausted = state.interviewState[id].exhausted.includes(topic.id);
    const cls = `topic ${available ? '' : 'locked'} ${exhausted ? 'used' : ''}`.trim();
    const label = exhausted ? `${topic.label} ✓` : topic.label;
    return `<button class="${cls}" ${available ? `onclick="askTopic('${escapeJs(id)}','${escapeJs(topic.id)}')"` : ''}>${escapeHtml(label)}</button>`;
  }).join('');
  const last = state.interviewState[id].last ? `<div class="response"><div class="body">${escapeHtml(state.interviewState[id].last)}</div></div>` : '';
  el.panel.innerHTML = `
    <div class="muted">Interview</div>
    <h2>${escapeHtml(interview.name || id)}</h2>
    <div class="scene-block"><div class="body">${escapeHtml(interview.intro || '')}</div></div>
    <div class="topic-list">${topicsHtml}</div>
    ${last}
    <div class="footer-actions"><button class="ghost" onclick="switchTab('scene')">Back to Scene</button></div>`;
}

function topicAvailable(topic) {
  return hasAllFlags(topic.requiresFlags || []) && hasAllEvidence(topic.requiresEvidence || []);
}

function askTopic(interviewId, topicId) {
  const interview = interviewMap()[interviewId];
  const topic = interview?.topics?.find(t => t.id === topicId);
  if (!topic || !topicAvailable(topic)) return;
  const bucket = state.interviewState[interviewId] ||= { opened: true, exhausted: [], last: '' };
  if (!bucket.exhausted.includes(topicId)) bucket.exhausted.push(topicId);
  if (topic.flags) setFlags(topic.flags);
  if (topic.grants) grantEvidence(topic.grants);
  bucket.last = topic.response;
  openInterview(interviewId);
}

function renderFinalAccusation() {
  const solution = currentCaseMeta().solution || {};
  const defaultQuestions = [
    {
      id: 'killer', label: 'Who killed the victim?', options: suspectList().map(s => [s.id, s.name]), correct: solution.killer
    },
    {
      id: 'motive', label: 'Why did the killer do it?', correct: solution.motive, options: [
        ['hide_staff_theft', 'To hide staff theft the victim discovered'],
        ['expose_stolen_lyrics', 'To stop the victim from exposing stolen lyrics'],
        ['collect_money', 'To collect money the victim owed'],
        ['personal_betrayal', 'To retaliate for a personal betrayal']
      ]
    },
    {
      id: 'method', label: 'How was the murder committed?', correct: solution.method, options: [
        ['backstage_fight', 'The victim was struck during a backstage fight'],
        ['poisoned_drink_then_collapse', 'The victim was poisoned through a drink and then collapsed'],
        ['strangulation', 'The victim was strangled behind the curtain'],
        ['alcohol_overdose', 'The victim overdosed on alcohol alone']
      ]
    },
    {
      id: 'proof', label: 'Which clue most strongly supports the killer’s connection to the method?', correct: solution.proof, options: [
        ['evidence_broken_flute', 'Broken champagne flute'],
        ['evidence_missing_cash_envelope', 'Missing cash envelope'],
        ['evidence_pill_bottle_cap', 'Pill bottle cap in the killer’s area'],
        ['evidence_bloody_curtain_smear', 'Scraped knuckles / blood smear']
      ]
    }
  ];
  const questions = (currentCaseMeta().finalQuestions || defaultQuestions).map(q => ({
    ...q,
    options: (q.options || []).map(opt => Array.isArray(opt) ? { value: opt[0], label: opt[1] } : opt)
  }));

  let html = '';
  questions.forEach(q => {
    html += `<div class="final-group"><div class="question">${escapeHtml(q.label)}</div>`;
    q.options.forEach(opt => {
      const checked = state.finalAnswers[q.id] === opt.value ? 'checked' : '';
      html += `<label class="radio-choice"><input type="radio" name="${escapeHtml(q.id)}" value="${escapeHtml(opt.value)}" ${checked} onchange="setFinalAnswer('${escapeJs(q.id)}','${escapeJs(opt.value)}')"> ${escapeHtml(opt.label)}</label>`;
    });
    html += `</div>`;
  });
  html += `<div class="footer-actions"><button class="primary" onclick="submitFinal()">Lock accusation</button></div>`;
  if (state.finalResult) {
    const ending = sceneMap()[state.finalResult];
    html += `<div class="response"><strong>${escapeHtml(ending?.title || 'Result')}</strong><div class="body">${escapeHtml(ending?.text || '')}</div></div>`;
    html += `<div class="footer-actions"><button class="ghost" onclick="goScene('${escapeJs(state.finalResult)}')">Open ending screen</button></div>`;
  }
  return html;
}

function setFinalAnswer(id, value) {
  state.finalAnswers[id] = value;
}

function submitFinal() {
  const answers = state.finalAnswers;
  if (!answers.killer || !answers.motive || !answers.method || !answers.proof) {
    alert('Answer all four questions first.');
    return;
  }
  const solution = currentCaseMeta().solution || {};
  let correctCount = 0;
  const killerCorrect = answers.killer === solution.killer;
  const motiveCorrect = answers.motive === solution.motive;
  const methodCorrect = answers.method === solution.method;
  const proofCorrect = answers.proof === solution.proof;

  if (killerCorrect) { correctCount++; state.score += 60; }
  if (motiveCorrect) { correctCount++; state.score += 35; }
  if (methodCorrect) { correctCount++; state.score += 35; }
  if (proofCorrect) { correctCount++; state.score += 15; }

  if (correctCount === 4) state.finalResult = 'ending_perfect';
  else if (killerCorrect && correctCount >= 3) state.finalResult = 'ending_solved';
  else if (correctCount >= 2) state.finalResult = 'ending_partial';
  else state.finalResult = 'ending_failed';
  render();
}

function useHint() {
  const scene = currentScene();
  const round = Number(scene?.round || 0);
  if (!round) return alert('Hints are only available during active rounds.');
  if (scene?.type === 'final') return alert('No hints in the final accusation.');
  if (state.usedHints[round]) return alert('You already used the hint for this round.');
  state.usedHints[round] = true;
  state.score = Math.max(0, state.score - Number(game?.ui?.hint_penalty || 8));
  state.activeHint = game?.hints?.[round]?.text || game?.hints?.[round] || 'No hint available.';
  render();
}

function startNewRun() {
  if (!game) return;
  resetStateToCaseStart();
  render();
}

function showError(message) {
  el.panel.innerHTML = `<div class="start-card"><h2>Engine Error</h2><div class="body">${escapeHtml(message)}</div></div>`;
}

function escapeJs(text = '') {
  return String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function bindEvents() {
  el.loadCaseBtn.onclick = async () => {
    try { await loadCase(el.caseSelect.value, { preferSave: true }); }
    catch (err) { showError(err.message || String(err)); }
  };
  el.newRunBtn.onclick = async () => {
    try { await loadCase(el.caseSelect.value, { preferSave: false }); }
    catch (err) { showError(err.message || String(err)); }
  };
  el.resumeBtn.onclick = () => {
    if (loadState()) render();
    else alert('No saved progress found for this case.');
  };
  el.hintBtn.onclick = useHint;
  el.saveBtn.onclick = () => { saveState(); alert('Progress saved in this browser.'); };
  el.loadBtn.onclick = () => { if (loadState()) render(); else alert('No saved progress found for this case.'); };
  el.resetBtn.onclick = () => {
    if (!game) return;
    if (confirm(`Reset all progress for ${currentCaseMeta().title}?`)) {
      localStorage.removeItem(getStorageKey());
      startNewRun();
    }
  };
}

async function init() {
  try {
    await loadManifest();
    bindEvents();
    await loadCase(getManifestDefault(), { preferSave: true });
  } catch (err) {
    showError(err.message || String(err));
  }
}

window.goScene = goScene;
window.switchTab = switchTab;
window.answerCheckpoint = answerCheckpoint;
window.openInterview = openInterview;
window.askTopic = askTopic;
window.setFinalAnswer = setFinalAnswer;
window.submitFinal = submitFinal;
window.maybeGotoRound2Checkpoint = maybeGotoRound2Checkpoint;
window.startNewRun = startNewRun;
window.setMapFloor = setMapFloor;
window.setMapZone = setMapZone;
window.selectCheckpointAnswer = selectCheckpointAnswer;
window.submitCheckpoint = submitCheckpoint;

setInterval(() => {
  if (game) updateTimerDisplay();
}, 1000);

init();
