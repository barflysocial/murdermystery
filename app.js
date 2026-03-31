
const el = {
  caseTitle: document.getElementById('caseTitle'), caseSubtitle: document.getElementById('caseSubtitle'),
  startBtn: document.getElementById('startBtn'), resumeBtn: document.getElementById('resumeBtn'), resetBtn: document.getElementById('resetBtn'),
  roundLabel: document.getElementById('roundLabel'), scoreLabel: document.getElementById('scoreLabel'), elapsedLabel: document.getElementById('elapsedLabel'),
  penaltyLabel: document.getElementById('penaltyLabel'), finalTimeLabel: document.getElementById('finalTimeLabel'),
  nav: document.getElementById('nav'), screen: document.getElementById('screen'), hintBtn: document.getElementById('hintBtn'),
  hintBox: document.getElementById('hintBox'), saveBtn: document.getElementById('saveBtn')
};
const SAVE_KEY='barfly_case_001_save';
let game = null;
let state = {
  currentSceneId:null, currentTab:'home', score:0, penaltySeconds:0, startedAt:null,
  selectedCheckpointAnswers:{}, checkpointResults:{}, finalAnswers:{}, flags:{}, foundEvidence:{}, visited:{}, askedTopics:{}, currentInterview:null
};
const navItems=[['home','Home'],['instructions','Instructions'],['scene','Scene'],['clues','Clues'],['suspects','Suspects'],['timeline','Timeline'],['interviews','Interviews']];
function formatSec(s){s=Math.max(0,Math.floor(s));const m=String(Math.floor(s/60)).padStart(2,'0');const ss=String(s%60).padStart(2,'0');return `${m}:${ss}`}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#39;"}[c]))}
function save(){localStorage.setItem(SAVE_KEY, JSON.stringify(state));}
function loadSave(){try{const d=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); if(d) state={...state,...d};}catch(e){}}
function clearSave(){localStorage.removeItem(SAVE_KEY)}
function sceneMap(){return game.scenes}
function interviewMap(){return game.interviews}
function evidenceMap(){return game.evidence}
function suspectMap(){return game.suspects}
function currentScene(){return sceneMap()[state.currentSceneId]}
function roundLabelFor(v){return v===undefined||v===null?'—':String(v)}
function updateRunPanel(){
  const sc=currentScene();
  el.roundLabel.textContent=sc?roundLabelFor(sc.round):'—';
  el.scoreLabel.textContent=String(state.score);
  const elapsed=state.startedAt?((Date.now()-state.startedAt)/1000):0;
  const final=elapsed+state.penaltySeconds;
  el.elapsedLabel.textContent=formatSec(elapsed);
  el.penaltyLabel.textContent='+'+formatSec(state.penaltySeconds);
  el.finalTimeLabel.textContent=formatSec(final);
  const warn=elapsed>=120;
  el.elapsedLabel.classList.toggle('warning',warn);
  el.finalTimeLabel.classList.toggle('warning',warn);
}
setInterval(updateRunPanel,1000);
function setFlag(f){if(f) state.flags[f]=true}
function grantEvidence(ids=[]){ids.forEach(id=>state.foundEvidence[id]=true)}
function renderNav(){el.nav.innerHTML=navItems.map(([id,label])=>`<button class="${state.currentTab===id?'active':''}" onclick="switchTab('${id}')">${label}</button>`).join('')}
function switchTab(tab){state.currentTab=tab; render();}
function startRun(){state.currentSceneId=game.case.entryScene; state.currentTab='scene'; state.score=0; state.penaltySeconds=0; state.startedAt=Date.now(); state.selectedCheckpointAnswers={}; state.checkpointResults={}; state.finalAnswers={}; state.flags={}; state.foundEvidence={}; state.visited={}; state.askedTopics={}; state.currentInterview=null; save(); render();}
function goScene(id){if(!sceneMap()[id]) return; state.currentSceneId=id; state.currentTab='scene'; state.visited[id]=true; const sc=sceneMap()[id]; grantEvidence(sc.grants||[]); if(!state.startedAt && sc.round && sc.round!=='Final') state.startedAt=Date.now(); save(); render();}
function selectCheckpointAnswer(sceneId, idx){state.selectedCheckpointAnswers[sceneId]=idx; save(); render();}
function submitCheckpointAnswer(sceneId){const sc=sceneMap()[sceneId]; const idx=state.selectedCheckpointAnswers[sceneId]; if(idx===undefined) return; const ans=sc.answers[idx]; const ok=!!ans[1]; if(!state.checkpointResults[sceneId]){ if(ok){state.score+=25}else{state.penaltySeconds+=90} setFlag(sc.flag); } state.checkpointResults[sceneId]={correct:ok,text: ok? sc.correct : sc.incorrect}; save(); render();}
function submitFinal(){const qs=game.case.finalQuestions; let correct=0; let killerOk=false; qs.forEach(q=>{const ans=state.finalAnswers[q.id]; if(ans===q.correct){correct++; if(q.id==='killer') killerOk=true; state.score += (q.id==='killer'?60:q.id==='motive'||q.id==='method'?35:15);} else {
 if(q.id==='killer') state.penaltySeconds += 300; else if(q.id==='motive'||q.id==='method') state.penaltySeconds += 120; else state.penaltySeconds += 60; }});
 let ending='ending_failed'; if(correct>=4) ending='ending_perfect'; else if(killerOk && correct>=3) ending='ending_solved'; else if(correct>=2) ending='ending_partial'; goScene(ending);
}
function useHint(){const sc=currentScene(); if(!sc) return; const hint=(game.hints||[]).find(h=>Number(h.round)===Number(sc.round)); if(!hint) return; el.hintBox.classList.remove('hidden'); el.hintBox.textContent=hint.text||hint; state.penaltySeconds += 60; updateRunPanel(); save();}
function openInterview(id){state.currentInterview=id; state.currentTab='interviews'; render();}
function askTopic(interviewId, topicId){state.askedTopics[topicId]=true; const t=interviewMap()[interviewId].topics.find(x=>x.id===topicId); grantEvidence(t.grants||[]); (t.flags||[]).forEach(setFlag); save(); render();}
function availableTopics(interview){return interview.topics.filter(t=>{
  const needFlags=t.requires_flags||t.requires||[]; const needEvidence=t.requires_evidence||[];
  return needFlags.every(f=>state.flags[f]) && needEvidence.every(e=>state.foundEvidence[e]);
})}
function renderHome(){ return `<div class="panel center"><div class="eyebrow">Case File</div><h2>${escapeHtml(game.case.title)}</h2><p class="lead">${escapeHtml(game.case.subtitle||'')}</p><p>${escapeHtml(game.case.setting)}</p><div class="footer-actions"><button class="primary" onclick="startRun()">Start</button><button onclick="switchTab('instructions')">Instructions</button></div></div>`; }
function renderInstructions(){return `<div class="panel"><h2>How to Play</h2><div class="card-grid"><div class="info-card"><strong>1. Investigate scenes</strong><p>Read each scene and choose where to look next.</p></div><div class="info-card"><strong>2. Unlock clues</strong><p>Evidence is added to the Clues tab as you investigate and ask questions.</p></div><div class="info-card"><strong>3. Interview suspects</strong><p>Ask topics to reveal contradictions and unlock new information.</p></div><div class="info-card"><strong>4. Answer checkpoints</strong><p>Select one answer, press Submit Answer, then Continue.</p></div><div class="info-card"><strong>5. Beat the clock</strong><p>Your time counts up. Hints and wrong answers add penalty time.</p></div><div class="info-card"><strong>6. Make the final accusation</strong><p>Name the killer, motive, method, and strongest proof clue.</p></div></div></div>`}
function renderScene(){const sc=currentScene(); if(!sc) return `<div class="panel center"><h2>No scene loaded</h2><div class="footer-actions"><button class="primary" onclick="startRun()">Start</button></div></div>`; if(sc.type==='scene'||sc.type==='narrative_scene'||sc.type==='evidence_discovery'||sc.type==='synthesis_scene'){let html=`<div class="panel"><div class="eyebrow">Round ${escapeHtml(roundLabelFor(sc.round))}</div><h2>${escapeHtml(sc.title||'')}</h2><p class="lead">${escapeHtml(sc.text||'')}</p>`; if(sc.choices){ html += `<div class="choice-grid">`+sc.choices.map(ch=>`<button onclick="goScene('${ch[1]}')">${escapeHtml(ch[0])}</button>`).join('')+`</div>`;} html += `</div>`; return html;} if(sc.type==='interviewEntry'){ const iid=sc.interview||('interview_'+(sc.title||'').toLowerCase().split(' ')[0]); return `<div class="panel center"><div class="eyebrow">Round ${escapeHtml(roundLabelFor(sc.round))}</div><h2>${escapeHtml(sc.title)}</h2><p class="lead">${escapeHtml(sc.text||'')}</p><div class="footer-actions"><button class="primary" onclick="openInterview('${iid}')">Open Interview</button></div></div>`;} if(sc.type==='checkpoint'){const selected=state.selectedCheckpointAnswers[sc.id]; const result=state.checkpointResults[sc.id]; let html=`<div class="panel"><div class="eyebrow">Round ${escapeHtml(roundLabelFor(sc.round))}</div><h2>${escapeHtml(sc.title)}</h2><p class="lead">${escapeHtml(sc.prompt)}</p><div class="answer-list">`; sc.answers.forEach((a,i)=>{html+=`<button class="${selected===i?'active':''}" onclick="selectCheckpointAnswer('${sc.id}',${i})">${escapeHtml(a[0])}</button>`}); html += `</div>`; if(!result){ html += `<div class="footer-actions"><button class="primary" ${selected===undefined?'disabled':''} onclick="submitCheckpointAnswer('${sc.id}')">Submit Answer</button></div>`;} if(result){ html += `<div class="response ${result.correct?'good':'warn'}">${escapeHtml(result.text)}</div><div class="footer-actions"><button class="primary" onclick="goScene('${sc.next}')">Continue</button></div>`;} html += `</div>`; return html;} if(sc.type==='final'){ let html=`<div class="panel"><div class="eyebrow">Final Accusation</div><h2>${escapeHtml(sc.title)}</h2><p class="lead">${escapeHtml(sc.text||'')}</p>`; game.case.finalQuestions.forEach(q=>{ html += `<div class="info-card"><h3>${escapeHtml(q.label)}</h3><div class="answer-list">`; q.options.forEach(opt=>{ const active=state.finalAnswers[q.id]===opt[0]?'active':''; html += `<button class="${active}" onclick="selectFinal('${q.id}','${opt[0]}')">${escapeHtml(opt[1])}</button>`}); html += `</div></div>`; }); html += `<div class="footer-actions"><button class="primary" onclick="submitFinal()">Submit Final Accusation</button></div></div>`; return html;} if(sc.type==='ending'){return `<div class="panel center"><div class="eyebrow">Case Closed</div><h2>${escapeHtml(sc.title)}</h2><p class="lead">${escapeHtml(sc.text||'')}</p><div class="footer-actions"><button class="primary" onclick="startRun()">Restart Case</button></div></div>`;} return `<div class="panel"><pre>${escapeHtml(JSON.stringify(sc,null,2))}</pre></div>`;}
function selectFinal(qid,val){state.finalAnswers[qid]=val; save(); render();}
function renderClues(){const items=Object.keys(state.foundEvidence).map(id=>[id,evidenceMap()[id]]).filter(Boolean); return `<div class="panel"><h2>Clues</h2><div class="card-grid">${items.map(([id,e])=>`<div class="info-card"><strong>${escapeHtml(e.title||id)}</strong><p>${escapeHtml(e.short_card||e.description||'')}</p></div>`).join('') || '<p class="center">No clues found yet.</p>'}</div></div>`}
function renderSuspects(){const items=Object.entries(suspectMap()); return `<div class="panel"><h2>Suspects</h2><div class="card-grid">${items.map(([id,s])=>`<div class="info-card"><strong>${escapeHtml(s.name)}</strong><p>${escapeHtml(s.role||'')}</p><p>${escapeHtml(s.public_read||'')}</p></div>`).join('')}</div></div>`}
function renderTimeline(){const rows=game.timeline.public||[]; return `<div class="panel"><h2>Timeline</h2><div class="timeline">${rows.map(r=>`<div class="time-row"><strong>${escapeHtml(r[0])}</strong><div>${escapeHtml(r[1])}</div></div>`).join('')}</div></div>`}
function renderInterviews(){const ids=Object.keys(interviewMap()); if(!state.currentInterview){ return `<div class="panel"><h2>Interviews</h2><div class="choice-grid">${ids.map(id=>`<button onclick="openInterview('${id}')">${escapeHtml(interviewMap()[id].name)}</button>`).join('')}</div></div>`;} const iv=interviewMap()[state.currentInterview]; const topics=availableTopics(iv); return `<div class="panel"><div class="footer-actions"><button onclick="state.currentInterview=null; render()">Back</button></div><h2>${escapeHtml(iv.name)}</h2><p class="lead">${escapeHtml(iv.intro||'')}</p><div class="topic-list">${topics.map(t=>`<button onclick="askTopic('${state.currentInterview}','${t.id}')">${escapeHtml(t.label)}</button>`).join('')}</div>${topics.map(t=> state.askedTopics[t.id] ? `<div class="response"><strong>${escapeHtml(t.label)}</strong><div>${escapeHtml(t.response)}</div></div>` : '').join('')}</div>`;}
function render(){renderNav(); updateRunPanel(); let html=''; if(state.currentTab==='home') html=renderHome(); else if(state.currentTab==='instructions') html=renderInstructions(); else if(state.currentTab==='scene') html=renderScene(); else if(state.currentTab==='clues') html=renderClues(); else if(state.currentTab==='suspects') html=renderSuspects(); else if(state.currentTab==='timeline') html=renderTimeline(); else if(state.currentTab==='interviews') html=renderInterviews(); el.screen.innerHTML=html;}
async function init(){ game = await fetch('case_001.json').then(r=>r.json()); el.caseTitle.textContent = game.case.title; el.caseSubtitle.textContent = game.case.subtitle || game.case.setting || ''; loadSave(); render(); }
el.startBtn.onclick=()=>startRun(); el.resumeBtn.onclick=()=>{loadSave(); if(state.currentSceneId){state.currentTab='scene'; render();} else startRun();}; el.resetBtn.onclick=()=>{if(confirm('Reset this case?')){clearSave(); state={currentSceneId:null,currentTab:'home',score:0,penaltySeconds:0,startedAt:null,selectedCheckpointAnswers:{},checkpointResults:{},finalAnswers:{},flags:{},foundEvidence:{},visited:{},askedTopics:{},currentInterview:null}; render();}}; el.hintBtn.onclick=useHint; el.saveBtn.onclick=()=>save();
window.switchTab=switchTab; window.goScene=goScene; window.selectCheckpointAnswer=selectCheckpointAnswer; window.submitCheckpointAnswer=submitCheckpointAnswer; window.openInterview=openInterview; window.askTopic=askTopic; window.selectFinal=selectFinal; window.startRun=startRun; window.state=state;
init();
