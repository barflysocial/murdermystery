let game = null;
let started = false;
let timerInterval = null;

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
  { id: 'interviews', label: 'Interviews' }
];

function escapeHtml(text=''){ return String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function escapeJs(text=''){ return String(text).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function sceneMap(){ return game?.scenes || {}; }
function evidenceList(){
  if (Array.isArray(game?.evidence)) return game.evidence;
  return Object.entries(game?.evidence || {}).map(([id, item]) => ({ id, ...item }));
}
function interviewMap(){ return game?.interviews || {}; }
function currentScene(){ return sceneMap()[state.currentSceneId] || null; }
function currentRound(){ const s = currentScene(); return s?.round || '—'; }
function hasFlags(flags=[]){ return flags.every(f=>state.flags.has(f)); }
function hasEvidence(ids=[]){ return ids.every(id=>state.evidence.has(id)); }

async function init(){
  try{
    const res = await fetch('./case_001.json', { cache: 'no-store' });
    if(!res.ok) throw new Error(`Failed to load case_001.json (${res.status})`);
    game = await res.json();
    el.heroTitle.textContent = game.case?.title || 'Crime 001';
    el.heroSub.textContent = game.case?.subtitle || 'Press Start to begin Attempt 1.';
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
    if(confirm('Start a new attempt? This will end the current run and begin a new timed attempt.')){
      beginAttempt(true);
    }
  });
}

function hardReset(includeUI=true){
  started = false;
  clearInterval(timerInterval);
  timerInterval = null;
  state.currentSceneId = game?.case?.entryScene || 'scene_001_opening';
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
  timerInterval = null;
  state.currentSceneId = game?.case?.entryScene || 'scene_001_opening';
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

function startCase(){
  if(started) return;
  beginAttempt(false);
}

function beginAttempt(isRestart){
  started = true;
  state.attempts += 1;
  resetRunState();
  startTimer();
  renderNav();
  goScene(game.case?.entryScene || 'scene_001_opening');
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

function formatClock(sec){
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function updateRunUI(){
  el.roundLabel.textContent = started ? currentRound() : '—';
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
  el.mainNav.innerHTML = items.map(item=>{
    const enabled = item.always || started;
    const active = state.currentTab === item.id ? ' active' : '';
    return `<button class="${active ? 'active' : ''}" ${enabled ? '' : 'disabled'} onclick="switchTab('${item.id}')">${escapeHtml(item.label)}</button>`;
  }).join('');
  el.hintBtn.disabled = !started;
}

function switchTab(tab){
  state.currentTab = tab;
  renderNav();
  render();
}

function goScene(id){
  if(typeof id === 'string' && id.startsWith('__INTERVIEW__:')){
    const interviewId = id.split(':')[1];
    state.activeInterviewId = interviewId;
    state.currentTab = 'interviews';
    renderNav();
    render();
    return;
  }
  const scene = sceneMap()[id];
  if(!scene) return;
  state.currentSceneId = id;
  state.visitedScenes.add(id);
  (scene.grantsEvidence || scene.grants_evidence || []).forEach(x=>state.evidence.add(x));
  (scene.grants || []).forEach(x=>state.evidence.add(x));
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
    case 'scene': el.panel.innerHTML = renderScene(); break;
    case 'clues': el.panel.innerHTML = renderClues(); break;
    case 'suspects': el.panel.innerHTML = renderSuspects(); break;
    case 'timeline': el.panel.innerHTML = renderTimeline(); break;
    case 'interviews': el.panel.innerHTML = renderInterviews(); break;
    default: el.panel.innerHTML = renderHome();
  }
}

function renderHome(){
  return `<div class="start-card"><h2>${escapeHtml(game.case?.title || 'Crime 001')}</h2><div class="body">${escapeHtml(game.case?.setting || '')}\n\nPress Start to begin Attempt 1. Home will hide once the run begins.</div></div>`;
}

function renderInstructions(){
  return `<div class="start-card"><h2>How to Play</h2><div class="body">1. Press Start to begin Attempt 1.\n2. Read each scene and follow the choices.\n3. Collect clues and question suspects and witnesses.\n4. On checkpoint screens, select one answer, then press Submit Answer.\n5. Wrong answers and hints add time penalties.\n6. New Attempt ends the current run and starts a new timed attempt.\n7. At the end, make your final accusation.\n\nFastest correct final time wins.</div></div>`;
}

function renderScene(){
  const scene = currentScene();
  if(!scene) return `<div class="empty">No scene loaded.</div>`;
  if(scene.type === 'checkpoint') return renderCheckpoint(scene);
  if(scene.id === game.case?.finalScene) return renderFinalAccusation();
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

function renderCheckpoint(scene){
  const selected = state.selectedCheckpointAnswers[scene.id];
  const result = state.checkpointResults[scene.id];
  let html = `<div class="final-group"><div class="question">${escapeHtml(scene.prompt)}</div><div class="answer-list" style="display:flex;flex-direction:column;align-items:stretch">`;
  scene.answers.forEach((ans, idx) => {
    const label = Array.isArray(ans) ? ans[0] : ans.label;
    const active = selected === idx ? ' active' : '';
    html += `<button class="answer${active}" onclick="selectCheckpointAnswer('${escapeJs(scene.id)}', ${idx})">${escapeHtml(label)}</button>`;
  });
  html += `</div>`;
  if(!result){
    html += `<div class="footer-actions" style="margin-top:14px"><button class="primary" ${selected === undefined ? 'disabled' : ''} onclick="submitCheckpointAnswer('${escapeJs(scene.id)}')">Submit Answer</button></div>`;
  }else{
    html += `<div class="response ${result.correct ? 'good' : 'warn'}"><div class="body">${escapeHtml(result.text)}</div></div>`;
    if(scene.next) html += `<div class="footer-actions" style="margin-top:14px"><button class="primary" onclick="goScene('${escapeJs(scene.next)}')">Continue</button></div>`;
  }
  html += `</div>`;
  return html;
}

function selectCheckpointAnswer(sceneId, idx){
  state.selectedCheckpointAnswers[sceneId] = idx;
  render();
}

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
}

function renderClues(){
  const items = evidenceList().filter(e => state.evidence.has(e.id));
  if(!items.length) return `<div class="empty">No clues unlocked yet.</div>`;
  return items.map(item => `
    <div class="clue">
      <h3 class="clue-title">${escapeHtml(item.title)}</h3>
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

function openInterview(id){
  state.activeInterviewId = id;
  state.currentTab = 'interviews';
  renderNav();
  render();
}

function openInterviewTopic(interviewId, topicId){
  const interview = interviewMap()[interviewId];
  if(!interview) return;
  const topic = (interview.topics || []).find(t=>t.id===topicId);
  if(!topic || !topicUnlocked(topic)) return;
  const store = state.interviewState[interviewId] || (state.interviewState[interviewId] = {});
  store.activeTopic = topicId;
  (topic.flags || []).forEach(f=>state.flags.add(f));
  (topic.grants || topic.grants_evidence || []).forEach(g=>state.evidence.add(g));
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

function setFinalAnswer(id, value){
  state.finalAnswers[id] = value;
}

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
  updateRunUI();
  render();
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
