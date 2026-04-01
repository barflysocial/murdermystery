const ROUND_CONFIG = {"firstSceneByRound": {"1": "scene_001_opening", "2": "scene_008_tasha_intro", "3": "scene_015_carla_intro", "4": "scene_020_dr_price_intro", "5": "scene_024_phone_review"}, "checkpointByRound": {"1": "scene_007_round1_checkpoint", "2": "scene_014_round2_checkpoint", "3": "scene_019_round3_checkpoint", "4": "scene_023_round4_checkpoint", "5": "scene_027_round5_checkpoint"}, "requiredByRound": {"1": ["scene_001_opening", "scene_002_body_reveal", "scene_003_whiskey_glass", "scene_004_lyric_fragment", "scene_005_broken_glass", "scene_006_suspect_board_intro"], "2": ["scene_008_tasha_intro", "scene_009_leon_intro", "scene_010_selena_intro", "scene_011_jax_intro", "scene_012_mia_intro", "scene_013_damien_intro"], "3": ["scene_015_carla_intro", "scene_016_register_log", "scene_017_booth_ping", "scene_018_mia_followup"], "4": ["scene_020_dr_price_intro", "scene_021_dressing_search", "scene_022_selena_followup"], "5": ["scene_024_phone_review", "scene_025_setlist_scribble", "scene_026_case_synthesis"]}};

let game = null;
let started = false;
let timerInterval = null;
let checkpointAdvanceTimer = null;

const state = {
  currentSceneId: null,
  currentTab: 'home',
  score: 0,
  flags: new Set(),
  evidence: new Set(),
  visitedScenes: new Set(),
  usedHints: {},
  interviewState: {},
  checkpointResults: {},
  selectedCheckpointAnswers: {},
  finalAnswers: {},
  finalResult: null,
  activeInterviewId: null,
  startedAt: null,
  penaltiesSec: 0,
  timerSeconds: 0,
  attempts: 0
};

const PENALTIES = { hint:60, wrongCheckpoint:90, wrongKiller:300, wrongMotive:120, wrongMethod:120, wrongProof:60 };
const CHECKPOINT_ADVANCE_DELAY_MS = 10000;

const el = {
  heroTitle: document.getElementById('heroTitle'),
  heroSub: document.getElementById('heroSub'),
  startBtn: document.getElementById('startBtn'),
  roundLabel: document.getElementById('roundLabel'),
  elapsedLabel: document.getElementById('elapsedLabel'),
  penaltyLabel: document.getElementById('penaltyLabel'),
  finalTimeLabel: document.getElementById('finalTimeLabel'),
  finalTimeCard: document.getElementById('finalTimeCard'),
  attemptLabel: document.getElementById('attemptLabel'),
  mainNav: document.getElementById('mainNav'),
  hintBtn: document.getElementById('hintBtn'),
  attemptBtn: document.getElementById('attemptBtn'),
  hintBox: document.getElementById('hintBox'),
  panel: document.getElementById('panel')
};

const NAV_ITEMS = [
  { id: 'home', label: 'Home', always: true, prestartOnly: true },
  { id: 'instructions', label: 'Instructions', always: true },
  { id: 'scene', label: 'Scene' },
  { id: 'clues', label: 'Clues' },
  { id: 'suspects', label: 'Suspects' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'checkpoint', label: 'Checkpoint' }
];

function escapeHtml(text=''){ return String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function escapeJs(text=''){ return String(text).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function sceneMap(){ return game?.scenes || {}; }
function evidenceEntries(){
  const raw = game?.evidence || {};
  if(Array.isArray(raw)) return raw.map((e, idx) => ({ id: e.id || `evidence_${idx}`, ...e }));
  return Object.entries(raw).map(([id, e]) => ({ id, ...e }));
}
function interviewMap(){ return game?.interviews || {}; }
function currentScene(){ return sceneMap()[state.currentSceneId] || null; }
function currentRound(){
  const s = currentScene();
  const r = s?.round;
  if(typeof r === 'number') return r;
  if(state.flags.has('round_5_complete')) return 'Final';
  if(state.flags.has('round_4_complete')) return 5;
  if(state.flags.has('round_3_complete')) return 4;
  if(state.flags.has('round_2_complete')) return 3;
  if(state.flags.has('round_1_complete')) return 2;
  return 1;
}
function hasFlags(flags=[]){ return flags.every(f=>state.flags.has(f)); }
function hasEvidence(ids=[]){ return ids.every(id=>state.evidence.has(id)); }
function roundSceneIds(round){ return ROUND_CONFIG.requiredByRound[String(round)] || []; }
function checkpointSceneId(round){ return ROUND_CONFIG.checkpointByRound[String(round)] || null; }
function firstSceneForRound(round){ return ROUND_CONFIG.firstSceneByRound[String(round)] || null; }
function checkpointUnlocked(round){
  return roundSceneIds(round).every(id => state.visitedScenes.has(id));
}
function checkpointAlreadyAnswered(round){
  const sid = checkpointSceneId(round);
  return !!(sid && state.checkpointResults[sid]);
}

async function init(){
  try{
    const res = await fetch('./case_001.json', { cache: 'no-store' });
    if(!res.ok) throw new Error(`Failed to load case_001.json (${res.status})`);
    game = await res.json();
    el.heroTitle.textContent = game.case?.title || 'Crime 001';
    el.heroSub.textContent = 'Press Start to begin Attempt 1.';
    hardReset(false);
    bind();
    renderNav();
    render();
  }catch(err){
    el.panel.innerHTML = `<div class="empty bad">Failed to load Crime 001.<br>${escapeHtml(err.message)}</div>`;
  }
}

function bind(){
  el.startBtn.addEventListener('click', startCase);
  el.hintBtn.addEventListener('click', useHint);
  el.attemptBtn.addEventListener('click', ()=>{
    if(!started) return;
    if(confirm('Start a new attempt? This will end the current run and begin a new timed attempt.')) beginAttempt();
  });
}

function hardReset(includeUI=true){
  started = false;
  clearInterval(timerInterval);
  clearTimeout(checkpointAdvanceTimer);
  timerInterval = null;
  checkpointAdvanceTimer = null;
  state.currentSceneId = game?.case?.entryScene || firstSceneForRound(1);
  state.currentTab = 'home';
  state.score = 0;
  state.flags = new Set();
  state.evidence = new Set();
  state.visitedScenes = new Set();
  state.usedHints = {};
  state.interviewState = {};
  state.checkpointResults = {};
  state.selectedCheckpointAnswers = {};
  state.finalAnswers = {};
  state.finalResult = null;
  state.activeInterviewId = null;
  state.startedAt = null;
  state.penaltiesSec = 0;
  state.timerSeconds = 0;
  state.attempts = 0;
  el.hintBox.hidden = true;
  el.hintBox.textContent = '';
  if(includeUI) updateRunUI();
}

function resetRunState(){
  clearInterval(timerInterval);
  clearTimeout(checkpointAdvanceTimer);
  timerInterval = null;
  checkpointAdvanceTimer = null;
  state.currentSceneId = firstSceneForRound(1);
  state.currentTab = 'scene';
  state.score = 0;
  state.flags = new Set();
  state.evidence = new Set();
  state.visitedScenes = new Set();
  state.usedHints = {};
  state.interviewState = {};
  state.checkpointResults = {};
  state.selectedCheckpointAnswers = {};
  state.finalAnswers = {};
  state.finalResult = null;
  state.activeInterviewId = null;
  state.startedAt = Date.now();
  state.penaltiesSec = 0;
  state.timerSeconds = 0;
  el.hintBox.hidden = true;
  el.hintBox.textContent = '';
}

function startCase(){ if(started) return; beginAttempt(); }
function beginAttempt(){
  started = true;
  state.attempts += 1;
  resetRunState();
  startTimer();
  renderNav();
  goScene(firstSceneForRound(1));
}

function startTimer(){
  clearInterval(timerInterval);
  timerInterval = setInterval(()=>{
    if(!started || !state.startedAt) return;
    state.timerSeconds = Math.floor((Date.now() - state.startedAt) / 1000);
    updateRunUI();
  }, 1000);
  updateRunUI();
}

function formatClock(sec){ const m = Math.floor(sec/60), s = sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function updateRunUI(){
  el.roundLabel.textContent = started ? String(currentRound()) : '—';
  el.elapsedLabel.textContent = formatClock(state.timerSeconds);
  el.penaltyLabel.textContent = `+${formatClock(state.penaltiesSec)}`;
  el.finalTimeLabel.textContent = formatClock(state.timerSeconds + state.penaltiesSec);
  el.attemptLabel.textContent = String(state.attempts);
  if(started && state.timerSeconds >= 120) el.finalTimeCard.classList.add('timer-warn');
  else el.finalTimeCard.classList.remove('timer-warn');
  el.startBtn.disabled = started;
  el.attemptBtn.disabled = !started;
}

function renderNav(){
  const items = NAV_ITEMS.filter(item => !(started && item.prestartOnly));
  el.mainNav.innerHTML = items.map(item => {
    const enabled = item.always || started;
    const isCheckpointReady = item.id === 'checkpoint' && started && checkpointUnlocked(currentRound()) && !checkpointAlreadyAnswered(currentRound());
    const cls = `${state.currentTab === item.id ? 'active' : ''}${isCheckpointReady && state.currentTab !== item.id ? ' ready' : ''}`.trim();
    return `<button class="${cls}" ${enabled ? '' : 'disabled'} onclick="switchTab('${item.id}')">${escapeHtml(item.label)}</button>`;
  }).join('');
  el.hintBtn.disabled = !started;
}

function switchTab(tab){ state.currentTab = tab; renderNav(); render(); }

function grantFromObject(obj){
  (obj.grantsEvidence || []).forEach(x=>state.evidence.add(x));
  (obj.grants || []).forEach(x=>state.evidence.add(x));
  (obj.grants_evidence || []).forEach(x=>state.evidence.add(x));
  (obj.flags || []).forEach(f=>state.flags.add(f));
}

function goScene(id){
  if(typeof id === 'string' && id.startsWith('__INTERVIEW__:')){
    const interviewId = id.split(':')[1];
    state.activeInterviewId = interviewId;
    state.currentTab = 'interviews';
    renderNav(); render(); return;
  }
  const scene = sceneMap()[id];
  if(!scene) return;
  state.currentSceneId = id;
  state.visitedScenes.add(id);
  grantFromObject(scene);
  state.currentTab = 'scene';
  renderNav();
  render();
}

function useHint(){
  if(!started) return;
  const round = String(currentRound());
  if(state.usedHints[round]) return;
  const hint = game.hints?.[round];
  if(!hint) return;
  state.usedHints[round] = true;
  state.penaltiesSec += PENALTIES.hint;
  el.hintBox.hidden = false;
  el.hintBox.textContent = hint;
  updateRunUI();
}

function render(){
  updateRunUI();
  switch(state.currentTab){
    case 'home': el.panel.innerHTML = renderHome(); break;
    case 'instructions': el.panel.innerHTML = renderInstructions(); break;
    case 'scene': el.panel.innerHTML = renderSceneTab(); break;
    case 'clues': el.panel.innerHTML = renderClues(); break;
    case 'suspects': el.panel.innerHTML = renderSuspects(); break;
    case 'timeline': el.panel.innerHTML = renderTimeline(); break;
    case 'interviews': el.panel.innerHTML = renderInterviews(); break;
    case 'checkpoint': el.panel.innerHTML = renderCheckpointTab(); break;
    default: el.panel.innerHTML = renderHome();
  }
}

function renderHome(){
  return `<div class="start-card"><h2>${escapeHtml(game.case?.title || 'Crime 001')}</h2><div class="body">${escapeHtml(game.case?.setting || '')}\n\nPress Start to begin Attempt 1. Home will hide once the run begins.</div></div>`;
}
function renderInstructions(){
  return `<div class="start-card"><h2>How to Play</h2><div class="body">1. Press Start to begin Attempt 1.
2. Use Scene, Clues, Suspects, Timeline, and Interviews to investigate freely.
3. The Checkpoint tab unlocks when you have finished the required leads for the current round.
4. On checkpoint screens, select one answer, then press Submit Answer.
5. After the short reveal, the game auto-advances to the next round.
6. New Attempt ends the current run and starts a new timed attempt.

How Scoring Works
Final Time = Elapsed Time + Penalties

Penalty Times
• Hint: +1:00
• Wrong checkpoint answer: +1:30
• Wrong killer: +5:00
• Wrong motive: +2:00
• Wrong method: +2:00
• Wrong proof clue: +1:00

Attempts
• Start = Attempt 1
• New Attempt restarts the run and increases your attempt count</div></div>`;
}

function renderSceneTab(){
  const round = currentRound();
  if(round === 'Final') return renderCurrentScene();
  const required = roundSceneIds(round);
  let html = `<div class="checkpoint-card"><h2>Round ${round} Investigation</h2><div class="progress-meta">${required.filter(id=>state.visitedScenes.has(id)).length} / ${required.length} leads completed</div></div>`;
  html += `<div class="scene-list">`;
  for(const sid of required){
    const scene = sceneMap()[sid];
    const visited = state.visitedScenes.has(sid) ? ' visited' : '';
    const active = state.currentSceneId === sid ? ' active' : '';
    html += `<button class="scene-jump${visited}${active}" onclick="goScene('${escapeJs(sid)}')">${escapeHtml(scene.title || sid)}</button>`;
  }
  html += `</div>`;
  html += renderCurrentScene();
  return html;
}

function renderCurrentScene(){
  const scene = currentScene();
  if(!scene) return `<div class="empty">No scene loaded.</div>`;
  if(scene.type === 'final') return renderFinalAccusation();
  let html = `<div class="scene-block"><h2>${escapeHtml(scene.title || '')}</h2>`;
  if(scene.text) html += `<div class="body">${escapeHtml(scene.text)}</div>`;
  html += `</div>`;
  if(scene.choices?.length){
    html += `<div class="clue"><div class="question">Choose your next action</div><div class="choices">`;
    for(const choice of scene.choices){
      const [label, next] = choice;
      html += `<button class="choice" onclick="goScene('${escapeJs(next)}')">${escapeHtml(label)}</button>`;
    }
    html += `</div></div>`;
  }
  return html;
}

function renderCheckpointTab(){
  const round = currentRound();
  if(round === 'Final') return `<div class="start-card"><h2>Checkpoint</h2><div class="body">All round checkpoints are complete. Proceed to the final accusation in the Scene tab.</div></div>`;
  const required = roundSceneIds(round);
  const done = required.filter(id=>state.visitedScenes.has(id)).length;
  const total = required.length;
  const cId = checkpointSceneId(round);
  const cScene = sceneMap()[cId];
  let html = `<div class="checkpoint-card"><h2>Round ${round} Checkpoint</h2><div class="progress-meta">${done} / ${total} leads completed</div></div>`;
  if(!checkpointUnlocked(round)){
    html += `<div class="empty">Checkpoint locked. Complete the remaining investigation steps in the Scene tab to unlock this round’s question.</div>`;
    return html;
  }
  if(checkpointAlreadyAnswered(round)){
    const res = state.checkpointResults[cId];
    html += `<div class="response ${res.correct ? 'good' : 'warn'}"><div class="body">${escapeHtml(res.text)}</div></div>`;
    return html;
  }
  return html + renderCheckpoint(cScene, cId);
}

function renderCheckpoint(scene, checkpointKey){
  const selected = state.selectedCheckpointAnswers[checkpointKey];
  let html = `<div class="final-group"><div class="question">${escapeHtml(scene.prompt)}</div><div class="answer-list" style="display:flex;flex-direction:column;align-items:stretch">`;
  scene.answers.forEach((ans, idx) => {
    const label = Array.isArray(ans) ? ans[0] : ans.label;
    const active = selected === idx ? ' active' : '';
    html += `<button class="answer${active}" onclick="selectCheckpointAnswer('${escapeJs(checkpointKey)}', ${idx})">${escapeHtml(label)}</button>`;
  });
  html += `</div>`;
  html += `<div class="footer-actions" style="margin-top:14px"><button class="primary" ${selected === undefined ? 'disabled' : ''} onclick="submitCheckpointAnswer('${escapeJs(checkpointKey)}')">Submit Answer</button></div>`;
  html += `</div>`;
  return html;
}

function selectCheckpointAnswer(sceneId, idx){ state.selectedCheckpointAnswers[sceneId] = idx; render(); }

function submitCheckpointAnswer(sceneId){
  const scene = sceneMap()[sceneId];
  if(!scene) return;
  const idx = state.selectedCheckpointAnswers[sceneId];
  if(idx === undefined || idx === null) return;
  const ans = scene.answers[idx];
  const isCorrect = Array.isArray(ans) ? !!ans[1] : !!ans.is_correct;
  if(!state.checkpointResults[sceneId]){
    if(isCorrect) state.score += 25;
    else state.penaltiesSec += PENALTIES.wrongCheckpoint;
    if(scene.flag) state.flags.add(scene.flag);
  }
  state.checkpointResults[sceneId] = { correct: isCorrect, text: isCorrect ? (scene.correct || 'Correct.') : (scene.incorrect || 'Not quite.') };
  updateRunUI();
  render();
  if(scene.next){
    clearTimeout(checkpointAdvanceTimer);
    checkpointAdvanceTimer = setTimeout(() => { goScene(scene.next); }, CHECKPOINT_ADVANCE_DELAY_MS);
  }
}

function renderClues(){
  const items = evidenceEntries().filter(e => state.evidence.has(e.id));
  if(!items.length) return `<div class="empty">No clues unlocked yet.</div>`;
  return items.map(item => `
    <div class="clue">
      <h3 class="clue-title">${escapeHtml(item.title || item.name || item.id)}</h3>
      <div class="body">${escapeHtml(item.description || item.desc || item.short_card || item.short || '')}</div>
      ${item.tags ? `<div class="tags">${item.tags.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </div>
  `).join('');
}

function renderSuspects(){
  const suspects = game.suspects || [];
  return `<div class="columns">` + suspects.map(s => `
    <div class="suspect">
      <h3>${escapeHtml(s.name)}</h3>
      <div class="tiny">${escapeHtml(s.role || '')}</div>
      <div class="body">${escapeHtml(s.public_read || s.publicRead || '')}</div>
    </div>
  `).join('') + `</div>`;
}

function renderTimeline(){
  const items = game.timeline?.public || [];
  if(!items.length) return `<div class="empty">No timeline entries available.</div>`;
  return items.map(item => {
    const time = Array.isArray(item) ? item[0] : item.time;
    const text = Array.isArray(item) ? item[1] : item.text;
    return `<div class="timeline-item"><h3>${escapeHtml(time || '')}</h3><div class="body">${escapeHtml(text || '')}</div></div>`;
  }).join('');
}

function topicUnlocked(topic){
  return hasFlags(topic.requires_flags || topic.requiresFlags || []) &&
         hasEvidence(topic.requires_evidence || topic.requiresEvidence || []);
}
function openInterview(id){ state.activeInterviewId = id; state.currentTab='interviews'; renderNav(); render(); }
function openInterviewTopic(interviewId, topicId){
  const interview = interviewMap()[interviewId]; if(!interview) return;
  const topic = (interview.topics || []).find(t=>t.id===topicId); if(!topic || !topicUnlocked(topic)) return;
  const store = state.interviewState[interviewId] || (state.interviewState[interviewId] = {});
  store.activeTopic = topicId;
  grantFromObject(topic);
  render();
}

function renderInterviews(){
  const interviews = interviewMap();
  let html = `<div class="clue"><div class="question">Choose an interview</div><div class="choices">`;
  for(const [id, interview] of Object.entries(interviews)){
    html += `<button class="choice" onclick="openInterview('${escapeJs(id)}')">${escapeHtml(interview.name)}</button>`;
  }
  html += `</div></div>`;
  const currentId = state.activeInterviewId;
  if(!currentId || !interviews[currentId]) return html;
  const interview = interviews[currentId];
  const store = state.interviewState[currentId] || {};
  html += `<div class="scene-block"><h2>${escapeHtml(interview.name)}</h2><div class="body">${escapeHtml(interview.intro || '')}</div></div>`;
  html += `<div class="clue"><div class="question">Topics</div><div class="topic-list">`;
  for(const topic of interview.topics || []){
    const enabled = topicUnlocked(topic);
    html += `<button class="topic${enabled ? '' : ' locked'}" ${enabled ? `onclick="openInterviewTopic('${escapeJs(currentId)}','${escapeJs(topic.id)}')"` : 'disabled'}>${escapeHtml(topic.label)}</button>`;
  }
  html += `</div></div>`;
  if(store.activeTopic){
    const topic = (interview.topics || []).find(t=>t.id===store.activeTopic);
    if(topic){
      html += `<div class="response"><h3>${escapeHtml(topic.label)}</h3><div class="body">${escapeHtml(topic.response || '')}</div></div>`;
    }
  }
  return html;
}

function renderFinalAccusation(){
  const questions = game.case?.finalQuestions || [];
  let html = `<div class="final-group"><div class="question">Final Accusation</div>`;
  for(const q of questions){
    html += `<div class="clue"><h3>${escapeHtml(q.label)}</h3>`;
    for(const [value,label] of q.options){
      const checked = state.finalAnswers[q.id] === value ? 'checked' : '';
      html += `<label class="radio-choice"><input type="radio" name="${escapeHtml(q.id)}" value="${escapeHtml(value)}" ${checked} onchange="setFinalAnswer('${escapeJs(q.id)}','${escapeJs(value)}')"> ${escapeHtml(label)}</label>`;
    }
    html += `</div>`;
  }
  html += `<div class="footer-actions"><button class="primary" onclick="submitFinal()">Submit Final Accusation</button></div>`;
  if(state.finalResult){
    html += `<div class="response"><div class="body">${escapeHtml(state.finalResult.summary)}</div></div>`;
  }
  html += `</div>`;
  return html;
}

function setFinalAnswer(id, value){ state.finalAnswers[id] = value; }
function submitFinal(){
  const qs = game.case?.finalQuestions || [];
  let correctCount = 0;
  let killerCorrect = false;
  for(const q of qs){
    const ans = state.finalAnswers[q.id];
    const ok = ans === q.correct;
    if(ok) correctCount++;
    else{
      if(q.id === 'killer') state.penaltiesSec += PENALTIES.wrongKiller;
      else if(q.id === 'motive') state.penaltiesSec += PENALTIES.wrongMotive;
      else if(q.id === 'method') state.penaltiesSec += PENALTIES.wrongMethod;
      else if(q.id === 'proof') state.penaltiesSec += PENALTIES.wrongProof;
    }
    if(q.id === 'killer' && ok) killerCorrect = true;
  }
  let tier = 'Failed';
  if(correctCount >= 4) tier = 'Perfect Solve';
  else if(killerCorrect && correctCount >= 3) tier = 'Solved';
  else if(correctCount >= 2) tier = 'Partial';
  state.finalResult = {
    summary: `${tier}\nElapsed: ${formatClock(state.timerSeconds)}\nPenalties: +${formatClock(state.penaltiesSec)}\nFinal Time: ${formatClock(state.timerSeconds + state.penaltiesSec)}\nAttempts: ${state.attempts}`
  };
  updateRunUI(); render();
}

window.switchTab = switchTab;
window.goScene = goScene;
window.selectCheckpointAnswer = selectCheckpointAnswer;
window.submitCheckpointAnswer = submitCheckpointAnswer;
window.openInterview = openInterview;
window.openInterviewTopic = openInterviewTopic;
window.setFinalAnswer = setFinalAnswer;
window.submitFinal = submitFinal;

init();
