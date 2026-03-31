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
  mapZoneId: null
};

const el = {
  heroEyebrow: document.getElementById('heroEyebrow'),
  heroTitle: document.getElementById('heroTitle'),
  heroSub: document.getElementById('heroSub'),
  heroStats: document.getElementById('heroStats'),
  heroProgressText: document.getElementById('heroProgressText'),
  heroProgressFill: document.getElementById('heroProgressFill'),
  caseSelect: document.getElementById('caseSelect'),
  loadCaseBtn: document.getElementById('loadCaseBtn'),
  newRunBtn: document.getElementById('newRunBtn'),
  resumeBtn: document.getElementById('resumeBtn'),
  caseMetaLine: document.getElementById('caseMetaLine'),
  score: document.getElementById('score'),
  roundLabel: document.getElementById('roundLabel'),
  panel: document.getElementById('panel'),
  tabs: document.getElementById('tabs'),
  mainNav: document.getElementById('mainNav'),
  hintBtn: document.getElementById('hintBtn'),
  hintBox: document.getElementById('hintBox'),
  saveBtn: document.getElementById('saveBtn'),
  loadBtn: document.getElementById('loadBtn'),
  resetBtn: document.getElementById('resetBtn')
};

const FINAL_PRESETS = {
  case_001: [
    {
      id: 'killer',
      label: 'Who killed Ricky Vale?',
      options: [
        ['suspect_selena', 'Selena March'],
        ['suspect_jax', 'Jax Turner'],
        ['suspect_mia', 'Mia Monroe'],
        ['suspect_damien', 'Damien Cross']
      ]
    },
    {
      id: 'motive',
      label: 'Why did the killer do it?',
      options: [
        ['hide_staff_theft', 'To hide staff theft Ricky discovered'],
        ['expose_stolen_lyrics', 'To stop Ricky from exposing stolen lyrics'],
        ['collect_money', 'To collect money Ricky owed'],
        ['personal_betrayal', 'To retaliate for a personal betrayal']
      ]
    },
    {
      id: 'method',
      label: 'How was the murder committed?',
      options: [
        ['backstage_fight', 'Ricky was struck during a backstage fight'],
        ['poisoned_drink_then_collapse', 'Ricky was poisoned through his drink and then collapsed'],
        ['strangulation', 'Ricky was strangled behind the curtain'],
        ['alcohol_overdose', 'Ricky overdosed on alcohol alone']
      ]
    },
    {
      id: 'proof',
      label: 'Which clue most strongly supports the killer’s connection to the method?',
      options: [
        ['evidence_broken_flute', 'Broken champagne flute'],
        ['evidence_missing_cash_envelope', 'Missing cash envelope'],
        ['evidence_pill_bottle_cap', 'Pill bottle cap in Selena’s area'],
        ['evidence_bloody_curtain_smear', 'Jax’s scraped knuckles / blood smear']
      ]
    }
  ],
  case_002: [
    {
      id: 'killer',
      label: 'Who killed Nolan Pierce?',
      options: [
        ['suspect_vanessa', 'Vanessa Cole'],
        ['suspect_marcus', 'Marcus Reed'],
        ['suspect_elise', 'Elise Benton'],
        ['suspect_trent', 'Trent Holloway'],
        ['suspect_jordan', 'Jordan Pike']
      ]
    },
    {
      id: 'motive',
      label: 'Why did the killer do it?',
      options: [
        ['job_humiliation', 'To retaliate for workplace humiliation'],
        ['expose_theft_and_pattern', 'To stop Nolan from exposing her theft and the larger nightlife pattern'],
        ['vip_scandal_only', 'To bury a VIP comp scandal'],
        ['security_complaint', 'To prevent a security complaint']
      ]
    },
    {
      id: 'method',
      label: 'How was the murder committed?',
      options: [
        ['pushed_in_argument', 'Nolan was shoved during an ordinary corridor fight'],
        ['drugged_drink_lured_downstairs_staged_impact', 'Nolan was drugged through his drink, lured downstairs, and staged into a fatal impact'],
        ['equipment_failure', 'A faulty cart mechanism caused the death'],
        ['stress_collapse', 'Nolan collapsed naturally and the scene only looked suspicious']
      ]
    },
    {
      id: 'proof',
      label: 'Which evidence best proves the death was staged and not random?',
      options: [
        ['evidence_signout_sheet', 'Marcus’s falsified sign-out sheet'],
        ['evidence_deleted_texts', 'Elise’s deleted texts'],
        ['evidence_medical_incapacitation_flag', 'The medical finding that Nolan was incapacitated before impact'],
        ['evidence_missing_keycard', 'The missing utility keycard']
      ]
    }
  ]
};

function getStorageKey(file = currentCaseFile) {
  return `barfly_mystery_engine__${file || 'unknown'}`;
}

function escapeHtml(text = '') {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function escapeJs(text = '') {
  return String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
function sceneEntries() { return Object.entries(sceneMap()); }
function totalPlayableScenes() { return sceneEntries().filter(([, s]) => !['ending'].includes(s.type)).length; }
function visitedProgressPercent() {
  const total = Math.max(totalPlayableScenes(), 1);
  return Math.min(100, Math.round((state.visitedScenes.size / total) * 100));
}

function resetStateToCaseStart() {
  const entry = currentCaseMeta().entryScene || currentCaseMeta().entry_scene_id || 'scene_001_opening';
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
    mapZoneId: state.mapZoneId
  };
}

function hydrateState(data) {
  if (!data) return false;
  state.currentSceneId = data.currentSceneId || currentCaseMeta().entryScene || currentCaseMeta().entry_scene_id || 'scene_001_opening';
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
  return true;
}

function saveState() {
  localStorage.setItem(getStorageKey(), JSON.stringify(serializeState()));
  el.caseMetaLine.textContent = `Saved progress for ${currentCaseMeta().title || 'current case'}.`;
}

function loadState() {
  const raw = localStorage.getItem(getStorageKey());
  if (!raw) return false;
  try { return hydrateState(JSON.parse(raw)); }
  catch { return false; }
}

function grantEvidence(ids = []) {
  ids.forEach(id => { if (evidenceMap()[id]) state.evidence.add(id); });
}

function setFlags(ids = []) {
  ids.forEach(id => { if (id) state.flags.add(id); });
}

function maybeApplySceneEffects(scene) {
  if (!scene) return;
  if (scene.grants) grantEvidence(scene.grants);
  if (scene.grants_evidence) grantEvidence(scene.grants_evidence);
  if (scene.flags) setFlags(scene.flags);
  if (scene.sets_flags) setFlags(scene.sets_flags);
  if (scene.unlocks_suspects) { /* UI-only currently */ }
}

function goScene(id) {
  const scene = sceneMap()[id];
  if (!scene) return showError(`Scene not found: ${id}`);
  state.currentSceneId = id;
  state.currentTab = 'scene';
  state.visitedScenes.add(id);
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
    manifest = { default_case: 'case_001.json', cases: [{ id: 'case_001', file: 'case_001.json', label: 'Crime 001 — The Karaoke Killer' }] };
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
  if (!(preferSave && loadState())) resetStateToCaseStart();
  render();
}

function decorateCaseDefaults() {
  const c = currentCaseMeta();
  c.id ||= currentCaseFile.replace(/\.json$/i, '');
  c.entryScene ||= c.entry_scene_id || 'scene_001_opening';
  c.title ||= c.id;
  c.subtitle ||= 'Load into the venue, investigate the scene, and build the final accusation.';
  c.solution ||= { killer: '', motive: '', method: '', proof: '' };
}

function getCaseLabel() {
  return (manifest?.cases || []).find(x => x.file === currentCaseFile)?.label || currentCaseMeta().title || currentCaseFile;
}

function getNavItems() {
  const base = [
    { id: 'scene', label: 'Scene' },
    { id: 'clues', label: 'Clues' },
    { id: 'suspects', label: 'Suspects' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'interviews', label: 'Interviews' }
  ];
  if (game?.map || game?.map_visual) base.push({ id: 'map', label: 'Map' });
  return base;
}

function renderHero() {
  const c = currentCaseMeta();
  const progress = visitedProgressPercent();
  el.heroEyebrow.textContent = `${c.crime_number ? `Crime ${c.crime_number} • ` : ''}${(c.difficulty || '').toString().replace(/^./, m => m.toUpperCase())}${c.tone ? ` • ${c.tone}` : ''}`.replace(/^ • | • $/g, '') || 'Mystery Engine';
  el.heroTitle.textContent = c.title || 'Barfly Mystery Engine';
  el.heroSub.textContent = c.subtitle || 'Load a case and begin investigating.';
  const pills = [
    c.setting ? `Setting: ${c.setting}` : null,
    c.series_arc ? `Series Arc: ${String(c.series_arc).replaceAll('_', ' ')}` : null,
    c.rank_required ? `Rank Required: ${c.rank_required}` : 'Rank Required: None',
    `Evidence Found: ${state.evidence.size}`
  ].filter(Boolean);
  el.heroStats.innerHTML = pills.map(p => `<div class="pill">${escapeHtml(p)}</div>`).join('');
  const saveExists = !!localStorage.getItem(getStorageKey());
  el.caseMetaLine.textContent = `${getCaseLabel()} • ${saveExists ? 'Save Available' : 'No Save Yet'}`;
  el.heroProgressText.textContent = `${progress}%`;
  el.heroProgressFill.style.width = `${progress}%`;
}

function renderTabs() {
  el.tabs.innerHTML = getNavItems().map(item => {
    const active = state.currentTab === item.id ? ' active' : '';
    return `<button class="tabbtn${active}" onclick="switchTab('${item.id}')">${escapeHtml(item.label)}</button>`;
  }).join('');
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

function render() {
  renderHero();
  renderTabs();
  renderNav();
  el.score.textContent = state.score;
  el.roundLabel.textContent = currentRound();
  el.hintBox.hidden = true;

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

  let html = `<div class="view-shell">`;
  html += `
    <div class="scene-header">
      <div>
        <div class="scene-kicker">Round ${escapeHtml(String(s.round || 'Final'))} • ${escapeHtml((s.type || 'scene').replaceAll('_', ' '))}</div>
        <h2 class="scene-title">${escapeHtml(s.title || 'Untitled Scene')}</h2>
      </div>
      <div class="case-chip-row">
        <span class="case-chip">Visited Scenes: ${state.visitedScenes.size}</span>
        <span class="case-chip">Flags: ${state.flags.size}</span>
      </div>
    </div>`;

  if (s.text) html += `<div class="scene-card hero-scene"><div class="body">${escapeHtml(s.text)}</div></div>`;
  if (s.audio_transcript) html += `<div class="response"><div class="tiny-label">Audio Transcript</div><div class="body">${escapeHtml(s.audio_transcript)}</div></div>`;

  if (s.type === 'checkpoint') html += renderCheckpoint(s);
  else if (s.type === 'final') html += renderFinalAccusation();
  else if (s.type === 'ending') html += `<div class="notice">Case complete.</div><div class="footer-actions"><button class="ghostbtn" onclick="startNewRun()">Start Over</button></div>`;
  else html += renderSceneChoices(s);

  html += `</div>`;
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
    if (needed.every(id => state.visitedScenes.has(id))) buttons.push(`<button class="choice primary" onclick="goScene('scene_007_round1_checkpoint')">Make your first call</button>`);
  }

  if (['scene_008_tasha_intro', 'scene_009_leon_intro', 'scene_010_selena_intro', 'scene_011_jax_intro', 'scene_012_mia_intro', 'scene_013_damien_intro'].includes(scene.id)) {
    buttons.push(`<button class="choice" onclick="maybeGotoRound2Checkpoint()">Review your first contradictions</button>`);
  }

  if (!buttons.length) return '';
  return `<div class="scene-card"><div class="tiny-label">Available Actions</div><div class="footer-actions">${buttons.join('')}</div></div>`;
}

function renderCheckpoint(scene) {
  let html = `<div class="final-stack"><div class="final-group"><div class="question">${escapeHtml(scene.prompt)}</div><div class="answer-list">`;
  scene.answers.forEach((ans, idx) => {
    const label = Array.isArray(ans) ? ans[0] : ans.label;
    html += `<button class="answer" onclick="answerCheckpoint('${escapeJs(scene.id)}', ${idx})">${escapeHtml(label)}</button>`;
  });
  html += `</div></div>`;

  const result = state.checkpointResults[scene.id];
  if (result) {
    html += `<div class="response ${result.correct ? 'good' : 'warn'}"><div class="body">${escapeHtml(result.text)}</div></div>`;
    html += `<div class="footer-actions"><button class="primary" onclick="goScene('${escapeJs(scene.next)}')">Continue</button></div>`;
  }
  html += `</div>`;
  return html;
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
    const tags = (item.tags || []).slice(0, 4).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const card = found
      ? `<div class="clue"><div class="row-between"><div class="tiny-label">${escapeHtml(cat.replaceAll('_', ' '))}</div><span class="tag good">Found</span></div><h3 class="clue-title">${escapeHtml(item.title)}</h3><div class="body">${escapeHtml(item.desc || item.description || item.short_card || item.short || '')}</div>${tags ? `<div class="tags">${tags}</div>` : ''}</div>`
      : `<div class="clue"><div class="row-between"><div class="tiny-label">Locked</div><span class="tag warn">Hidden</span></div><h3 class="clue-title">Unknown Evidence</h3><div class="tiny">Find more scene clues and interview details to unlock this card.</div></div>`;
    (grouped[cat] || grouped.supporting).push(card);
  }

  el.panel.innerHTML = `
    <div class="view-shell">
      <div class="scene-header">
        <div>
          <div class="scene-kicker">Evidence Board</div>
          <h2 class="scene-title">Clues and Recoveries</h2>
        </div>
        <div class="case-chip-row">
          <span class="case-chip">Found: ${state.evidence.size}</span>
          <span class="case-chip">Total: ${entries.length}</span>
        </div>
      </div>
      ${['core', 'supporting', 'bonus', 'red_herring'].map(cat => `
        <section class="clue-stack">
          <div>
            <h3 class="section-title">${escapeHtml(cat.replaceAll('_', ' ').replace(/^./, m => m.toUpperCase()))}</h3>
            <p class="section-sub">${cat === 'core' ? 'Critical pieces that carry the main solve chain.' : cat === 'supporting' ? 'Evidence that narrows routes, contradictions, and opportunity.' : cat === 'bonus' ? 'Optional reinforces that strengthen your certainty.' : 'Plausible noise designed to tempt a bad theory.'}</p>
          </div>
          ${grouped[cat].join('') || `<div class="empty">No entries.</div>`}
        </section>
      `).join('')}
    </div>`;
}

function renderSuspects() {
  const html = suspectList().map(s => `
    <div class="suspect">
      <div class="row-between">
        <div class="tiny-label">${escapeHtml(s.role || 'Suspect')}</div>
        <span class="tag">Profile</span>
      </div>
      <h3>${escapeHtml(s.name)}</h3>
      <div class="body">${escapeHtml(s.public_read || '')}</div>
      <div class="tags">
        ${(s.relationship || s.relationship_to_victim) ? `<span class="tag">Connection: ${escapeHtml(s.relationship || s.relationship_to_victim)}</span>` : ''}
        ${s.status_early ? `<span class="tag warn">Early: ${escapeHtml(s.status_early)}</span>` : ''}
        ${s.status_late ? `<span class="tag good">Late: ${escapeHtml(s.status_late)}</span>` : ''}
      </div>
    </div>`).join('');
  el.panel.innerHTML = `
    <div class="view-shell">
      <div class="scene-header">
        <div>
          <div class="scene-kicker">Suspect Board</div>
          <h2 class="scene-title">People With Access</h2>
        </div>
        <div class="case-chip-row"><span class="case-chip">Suspects: ${suspectList().length}</span></div>
      </div>
      <div class="suspect-grid columns">${html}</div>
    </div>`;
}

function renderTimeline() {
  const items = game?.timeline?.public || [];
  if (!items.length) return void (el.panel.innerHTML = `<div class="empty">No public timeline entries.</div>`);
  el.panel.innerHTML = `
    <div class="view-shell">
      <div class="scene-header">
        <div>
          <div class="scene-kicker">Case Timeline</div>
          <h2 class="scene-title">Known Sequence</h2>
        </div>
        <div class="case-chip-row"><span class="case-chip">Public Beats: ${items.length}</span></div>
      </div>
      <div class="timeline-stack">${items.map(item => {
        const time = Array.isArray(item) ? item[0] : item.time;
        const text = Array.isArray(item) ? item[1] : item.text;
        return `<div class="timeline-item"><div class="time">${escapeHtml(time)}</div><div class="body">${escapeHtml(text)}</div></div>`;
      }).join('')}</div>
    </div>`;
}

function renderMap() {
  const map = game?.map;
  const visual = game?.map_visual;
  if (visual && Array.isArray(visual.floors) && visual.floors.length) return renderVisualMap(visual, map);
  if (!map || !Array.isArray(map.levels) || !map.levels.length) return void (el.panel.innerHTML = `<div class="empty">No map data for this case.</div>`);
  const notes = (map.notes || []).map(n => `<li>${escapeHtml(n)}</li>`).join('');
  const levels = map.levels.map(level => `
    <div class="map-card">
      <div class="tiny-label">${escapeHtml(level.id || 'level')}</div>
      <h3>${escapeHtml(level.label || level.id || 'Level')}</h3>
      <div class="tags">${(level.zones || []).map(z => `<span class="tag">${escapeHtml(z)}</span>`).join('')}</div>
    </div>`).join('');
  el.panel.innerHTML = `
    <div class="view-shell">
      <div class="scene-header">
        <div>
          <div class="scene-kicker">Venue Layout</div>
          <h2 class="scene-title">Floor Map</h2>
        </div>
      </div>
      <div class="map-stack">${levels}</div>
      ${notes ? `<div class="scene-card"><ul class="body">${notes}</ul></div>` : ''}
    </div>`;
}

function renderVisualMap(visual, map) {
  const defaultFloor = state.mapFloor || visual.default_floor || visual.floors[0]?.id;
  state.mapFloor = visual.floors.find(f => f.id === defaultFloor) ? defaultFloor : visual.floors[0]?.id;
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
    <div class="view-shell">
      <div class="scene-header">
        <div>
          <div class="scene-kicker">Interactive Floor Map</div>
          <h2 class="scene-title">${escapeHtml(floor.label)}</h2>
          <p class="section-sub">${escapeHtml(floor.subtitle || 'Use the layout to test whether movement and cover make sense.')}</p>
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
          <div class="scene-card compact">
            <div class="tiny-label">Selected Zone</div>
            <h3>${escapeHtml(selectedZone?.label || 'No zone selected')}</h3>
            <div class="tags"><span class="tag">${escapeHtml(selectedZone?.kind || 'zone')}</span>${selectedZone?.id ? `<span class="tag">${escapeHtml(selectedZone.id)}</span>` : ''}</div>
            ${zoneNotes ? `<ul class="body map-note-list">${zoneNotes}</ul>` : `<div class="tiny">Tap a zone to inspect why it matters.</div>`}
          </div>
          ${clueLinks.length ? `<div class="scene-card compact"><div class="tiny-label">Linked Clues</div>${clueLinks.join('')}</div>` : ''}
          ${(floor.routes || []).length ? `<div class="scene-card compact"><div class="tiny-label">Critical Routes</div>${routeCards}</div>` : ''}
          ${mapNotes ? `<div class="scene-card compact"><div class="tiny-label">Building Logic</div><ul class="body map-note-list">${mapNotes}</ul></div>` : ''}
        </div>
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
    const viewed = state.interviewState[id]?.opened ? 'Opened' : 'Available';
    const usedCount = state.interviewState[id]?.exhausted?.length || 0;
    return `
      <div class="interview-card">
        <div class="row-between"><div class="tiny-label">Interview</div><span class="tag">${escapeHtml(viewed)}</span></div>
        <h3>${escapeHtml(interview.name || id)}</h3>
        <div class="tiny">Topics explored: ${usedCount}</div>
        <div class="footer-actions"><button class="smallbtn" onclick="openInterview('${escapeJs(id)}')">Open</button></div>
      </div>`;
  }).join('');
  el.panel.innerHTML = `
    <div class="view-shell">
      <div class="scene-header">
        <div>
          <div class="scene-kicker">Witness and Suspect Interviews</div>
          <h2 class="scene-title">Question the Room</h2>
        </div>
      </div>
      <div class="interview-grid columns">${cards}</div>
    </div>`;
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
  const last = state.interviewState[id].last ? `<div class="response"><div class="tiny-label">Latest Answer</div><div class="body">${escapeHtml(state.interviewState[id].last)}</div></div>` : '';
  el.panel.innerHTML = `
    <div class="view-shell">
      <div class="scene-header">
        <div>
          <div class="scene-kicker">Interview</div>
          <h2 class="scene-title">${escapeHtml(interview.name || id)}</h2>
        </div>
        <div class="case-chip-row"><span class="case-chip">Topics: ${interview.topics.length}</span></div>
      </div>
      <div class="scene-card"><div class="body">${escapeHtml(interview.intro || '')}</div></div>
      <div class="scene-card">
        <div class="tiny-label">Available Topics</div>
        <div class="topic-list">${topicsHtml}</div>
      </div>
      ${last}
      <div class="footer-actions"><button class="ghostbtn" onclick="switchTab('interviews')">Back to Interview List</button><button class="ghostbtn" onclick="switchTab('scene')">Back to Scene</button></div>
    </div>`;
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
  if (topic.sets_flags) setFlags(topic.sets_flags);
  if (topic.grants) grantEvidence(topic.grants);
  if (topic.grants_evidence) grantEvidence(topic.grants_evidence);
  bucket.last = topic.response;
  openInterview(interviewId);
}

function getFinalQuestions() {
  const caseId = currentCaseMeta().id;
  const preset = FINAL_PRESETS[caseId];
  if (preset) {
    return preset.map(q => ({ ...q, correct: currentCaseMeta().solution?.[q.id] }));
  }
  return [
    { id: 'killer', label: 'Who killed the victim?', options: suspectList().map(s => [s.id, s.name]), correct: currentCaseMeta().solution?.killer },
    { id: 'motive', label: 'Why did the killer do it?', options: [], correct: currentCaseMeta().solution?.motive },
    { id: 'method', label: 'How was the murder committed?', options: [], correct: currentCaseMeta().solution?.method },
    { id: 'proof', label: 'Which clue most strongly supports the killer’s connection to the method?', options: Object.keys(evidenceMap()).slice(0, 4).map(id => [id, evidenceMap()[id]?.title || id]), correct: currentCaseMeta().solution?.proof }
  ];
}

function renderFinalAccusation() {
  const questions = getFinalQuestions();
  let html = `<div class="view-shell"><div class="scene-card"><div class="tiny-label">Final Accusation</div><div class="body">Lock the name, motive, method, and strongest proof. Your ending route is based on the full chain, not just one lucky answer.</div></div><div class="final-stack">`;
  questions.forEach(q => {
    html += `<div class="final-group"><div class="question">${escapeHtml(q.label)}</div>`;
    (q.options || []).forEach(opt => {
      const value = Array.isArray(opt) ? opt[0] : opt.value;
      const label = Array.isArray(opt) ? opt[1] : opt.label;
      const checked = state.finalAnswers[q.id] === value ? 'checked' : '';
      html += `<label class="radio-choice"><input type="radio" name="${escapeHtml(q.id)}" value="${escapeHtml(value)}" ${checked} onchange="setFinalAnswer('${escapeJs(q.id)}','${escapeJs(value)}')"> ${escapeHtml(label)}</label>`;
    });
    html += `</div>`;
  });
  html += `<div class="footer-actions"><button class="primary" onclick="submitFinal()">Lock accusation</button></div>`;
  if (state.finalResult) {
    const ending = sceneMap()[state.finalResult];
    html += `<div class="response"><div class="tiny-label">Result</div><strong>${escapeHtml(ending?.title || 'Result')}</strong><div class="body">${escapeHtml(ending?.text || '')}</div></div>`;
    html += `<div class="footer-actions"><button class="ghostbtn" onclick="goScene('${escapeJs(state.finalResult)}')">Open ending screen</button></div>`;
  }
  html += `</div></div>`;
  return html;
}

function setFinalAnswer(id, value) {
  state.finalAnswers[id] = value;
}

function submitFinal() {
  const answers = state.finalAnswers;
  const questions = getFinalQuestions();
  if (!questions.every(q => answers[q.id])) return alert('Answer all final questions first.');

  if (!state.finalResult) {
    let correctCount = 0;
    const solution = currentCaseMeta().solution || {};
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
  }
  render();
}

function useHint() {
  const scene = currentScene();
  const round = Number(scene?.round || 0);
  if (!round) return alert('Hints are only available during active rounds.');
  if (scene?.type === 'final') return alert('No hints in the final accusation.');
  if (state.usedHints[round]) return alert('You already used the hint for this round.');
  const hintText = game?.hints?.[String(round)] || game?.hints?.[round] || 'No hint available.';
  state.usedHints[round] = true;
  state.score = Math.max(0, state.score - (currentCaseMeta().id === 'case_002' ? 10 : 8));
  el.hintBox.hidden = false;
  el.hintBox.textContent = hintText;
  el.hintBox.className = 'notice hint-notice';
  render();
  el.hintBox.hidden = false;
  el.hintBox.textContent = hintText;
}

function startNewRun() {
  if (!game) return;
  resetStateToCaseStart();
  render();
}

function showError(message) {
  el.panel.innerHTML = `<div class="start-card"><h2>Engine Error</h2><div class="body">${escapeHtml(message)}</div></div>`;
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
  el.resumeBtn.onclick = () => { if (loadState()) render(); else alert('No saved progress found for this case.'); };
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

init();
