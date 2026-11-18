'use strict';
// Academia Pixel v8 — cliente de la API FastAPI.
const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
let user = null, subjects = [], currentScreen = 'login';
let mode = null, currentSubject = '', lastRouletteSubject = null, wheelRotation = 0;
let sessionId = null, soloScore = 0, soloTotal = 0;
let localQueue = [], localIndex = 0, localPlayers = [], localScores = [0,0], localCallback = null;
let aiQuestions = [], aiSubject = '';
let ws = null, roomInfo = null, roomAnswered = false, nextOnlineQuestionAfter = 0;
let tournamentRounds = [], tournamentRound = 0, tournamentMatch = 0, tournamentChampion = null;
const NATIVE = window.ACADEMIA_RUNTIME?.native === true;
const LOCKED_SERVER = NATIVE && window.ACADEMIA_RUNTIME?.serverLocked === true;
let SERVER_ORIGIN = NATIVE ? (LOCKED_SERVER ? (window.ACADEMIA_RUNTIME.serverOrigin || '') : (localStorage.getItem('pixel_server_origin') || window.ACADEMIA_RUNTIME?.serverOrigin || '')) : '';
const AUTH_KEY = 'pixel_native_auth';
let music = localStorage.getItem('pixel_music') !== 'off', sfx = localStorage.getItem('pixel_sfx') !== 'off';

function message(id, value) { $(id).textContent = value || ''; }
function errorText(e) { return typeof e?.message === 'string' ? e.message : 'Ocurrió un error inesperado.'; }
async function api(route, { method='GET', body=null }={}) {
  const opts = {method, credentials:NATIVE?'omit':'same-origin',headers:{}};
  if(NATIVE && localStorage.getItem(AUTH_KEY))opts.headers.Authorization = 'Bearer ' + localStorage.getItem(AUTH_KEY);
  if (body instanceof FormData) opts.body = body;
  else if (body !== null) {opts.body=JSON.stringify(body);opts.headers['Content-Type']='application/json';}
  let response;
  try {response=await fetch(SERVER_ORIGIN+'/api'+route, opts);} catch {throw new Error('No se puede conectar con el servidor. Verificá que esté encendido.');}
  let data;
  try {data=await response.json();} catch {throw new Error('Respuesta inválida del servidor.');}
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Error '+response.status);
  return data;
}
function show(screen) {
  if (currentScreen === 'game' && screen !== 'game' && mode === 'online' && roomInfo?.status === 'playing') { /* los cierres online se manejan explícitamente */ }
  all('.screen').forEach(x=>x.classList.toggle('active', x.id===screen));
  currentScreen=screen; updateMusic();
}
function play(id) {if (!sfx) return; const a=$(id); if(a){a.currentTime=0;a.play().catch(()=>{});}}
function updateMusic() {
  const menu=$('bgm-menu'), battle=$('bgm-battle');
  if (!music) {menu.pause();battle.pause();return;}
  const selected=currentScreen==='game' ? battle:menu, other=selected===menu?battle:menu;
  other.pause(); if(other.currentTime>0) other.currentTime=0;
  selected.play().catch(()=>{});
}
function setSound(type) {
  if(type==='music') {music=!music;localStorage.setItem('pixel_music',music?'on':'off');}
  else {sfx=!sfx;localStorage.setItem('pixel_sfx',sfx?'on':'off');}
  $('btn-music').textContent='♪ Música: '+(music?'ON':'OFF');
  $('btn-sfx').textContent='♫ Efectos: '+(sfx?'ON':'OFF');
  updateMusic();
}
function shuffle(xs) {const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function el(tag,text,klass) {const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(klass)n.className=klass;return n;}
function button(text,onclick) {const b=el('button',text);b.type='button';b.onclick=onclick;return b;}
function appendRow(t, values) {const r=el('tr');values.forEach(v=>r.append(el('td',v)));t.append(r);}

async function login(register=false) {
  const username=$('login-username').value.trim(), password=$('login-password').value;
  message('login-msg','');
  try {
    user=await api('/auth/'+(register?'register':'login'), {method:'POST',body:{username,password}});
    if(NATIVE && user.token)localStorage.setItem(AUTH_KEY,user.token);
    $('login-password').value='';
    await enterMenu();
  } catch(e) {message('login-msg',errorText(e));}
}
async function enterMenu() {
  message('current-user-label',user.username);
  $('go-teacher').hidden=user.role!=='teacher';
  await loadSubjects();
  show('menu');
}
async function init() {
  if(NATIVE){
    $('change-server-btn').hidden=LOCKED_SERVER;
    if(!SERVER_ORIGIN){showServerSetup();return;}
    try { await testServer(); }
    catch(e) {showServerSetup(errorText(e));return;}
    if(!localStorage.getItem(AUTH_KEY)){show('login');return;}
  }
  try {user=await api('/me'); await enterMenu();}
  catch {show('login');}
}
async function logout() {
  closeSocket();
  try {await api('/auth/logout',{method:'POST'});}catch(e){console.warn(e);}
  if(NATIVE)localStorage.removeItem(AUTH_KEY);
  user=null;subjects=[];sessionId=null;show('login');
}
async function loadSubjects() {
  subjects=await api('/subjects');
  fillSubjectPicker('vs-subject-select',true);
  fillSubjectPicker('online-subject');
  const d=$('subjects-list');d.replaceChildren(...subjects.map(s=>{const o=el('option');o.value=s.name;return o;}));
  if(!ideSubjectAlready()) $('ai-subject').value='Programación';
  drawWheel();
}
function ideSubjectAlready(){return $('ai-subject').value.trim().length>0;}
function fillSubjectPicker(id,random=false) {
  const select=$(id);select.replaceChildren();
  if(random){const o=el('option','Aleatoria');o.value='random';select.append(o);}
  const candidates=id==='vs-subject-select' ? subjects.filter(x=>x.is_base) : subjects.filter(x=>x.question_count>0);
  candidates.forEach(s=>{const o=el('option',s.name);o.value=s.code;select.append(o);});
}
function wheelSubjects() {
  const selection=$('roulette-mode').value;
  return subjects.filter(s=>s.question_count>0 && (selection==='all'||(selection==='base'?s.is_base:!s.is_base)));
}
function drawWheel() {
  const entries=wheelSubjects(), wheel=$('roulette-wheel');wheel.replaceChildren();
  if(!entries.length) {message('selected-subject-label','No hay materias en ese grupo. Generá preguntas primero.');$('spin-btn').disabled=true;return;}
  $('spin-btn').disabled=false;message('selected-subject-label','');
  const n=entries.length, r=130, svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','100%');svg.setAttribute('height','100%');svg.setAttribute('viewBox','0 0 260 260');
  entries.forEach((s,i)=>{
    const start=(i/n)*2*Math.PI-Math.PI/2,end=((i+1)/n)*2*Math.PI-Math.PI/2;
    const x1=r+r*Math.cos(start), y1=r+r*Math.sin(start), x2=r+r*Math.cos(end), y2=r+r*Math.sin(end);
    const path=document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d',`M ${r} ${r} L ${x1} ${y1} A ${r} ${r} 0 ${end-start>Math.PI?1:0} 1 ${x2} ${y2} Z`);
    path.setAttribute('fill',s.color);path.setAttribute('stroke','#1a0033');path.setAttribute('stroke-width','2.5');svg.append(path);
    const angle=(start+end)/2,tx=r+80*Math.cos(angle),ty=r+80*Math.sin(angle);
    const label=document.createElementNS(svg.namespaceURI,'text');
    label.setAttribute('x',tx);label.setAttribute('y',ty);label.setAttribute('font-size',Math.max(10,Math.min(14,50/n)));
    label.setAttribute('fill','#1a0033');label.setAttribute('font-family','monospace');label.setAttribute('text-anchor','middle');
    label.setAttribute('dominant-baseline','middle');label.setAttribute('transform',`rotate(${angle*180/Math.PI+90},${tx},${ty})`);
    label.textContent=s.name.length>14?s.name.slice(0,12)+'…':s.name;svg.append(label);
  });
  const center=document.createElementNS(svg.namespaceURI,'circle');center.setAttribute('cx','130');center.setAttribute('cy','130');center.setAttribute('r','18');center.setAttribute('fill','#1a0033');center.setAttribute('stroke','#ffd700');center.setAttribute('stroke-width','4');svg.append(center);
  wheel.style.transition='none';wheelRotation=0;wheel.style.transform='rotate(0deg)';wheel.append(svg);
}
async function spin() {
  const options=wheelSubjects();if(!options.length)return;
  const allowed=options.length>1?options.filter(s=>s.code!==lastRouletteSubject):options;
  const chosen=allowed[Math.floor(Math.random()*allowed.length)],i=options.findIndex(s=>s.code===chosen.code);
  const slice=360/options.length, desired=(360-(i+.5)*slice)%360;
  const delta=(desired-(wheelRotation%360)+360)%360;
  wheelRotation+=360*5+delta;
  $('spin-btn').disabled=true;message('selected-subject-label','Girando...');
  const wheel=$('roulette-wheel');wheel.style.transition='transform 3.5s cubic-bezier(.17,.67,.12,1)';wheel.style.transform=`rotate(${wheelRotation}deg)`;
  setTimeout(async()=>{
    if(currentScreen!=='roulette')return;
    lastRouletteSubject=chosen.code;message('selected-subject-label','► '+chosen.name+' ◄');
    try{await startSolo(chosen.code);}catch(e){message('selected-subject-label',errorText(e));$('spin-btn').disabled=false;}
  },3800);
}

function gameVisual(p1,p2,p2Real,online=false) {
  message('player-name-label',p1);message('boss-name',p2);message('boss-realname',p2Real||'');
  $('boss-sprite-imagen').src=online?'images/idle.gif':'images/profesor2.gif';
  message('player-health','0 puntos');message('boss-health','0 puntos');message('answer-feedback','');
  show('game');
}
function displayQuestion(q, subtitle, callback) {
  message('turn-indicator',subtitle);
  message('question-text',q.q);
  message('answer-feedback','');
  const area=$('answers-box');area.replaceChildren();
  shuffle(q.options).forEach(opt=>{
    const b=button(opt,()=>{
      all('#answers-box button').forEach(x=>x.disabled=true);
      callback(opt);
    });area.append(b);
  });
}
function feedback(correct, answer) {
  message('answer-feedback',(correct?'✅ ¡Correcto!':'❌ Incorrecto.')+(answer?' Respuesta: '+answer:''));
  const box=$('game-container');box.classList.remove('flash-green','flash-red');void box.offsetWidth;box.classList.add(correct?'flash-green':'flash-red');
  play(correct?'sfx-correct':'sfx-wrong');
}
function resultScreen(title,content, allowReplay=true) {
  mode=null;
  message('result-message',title+'\n'+content);
  $('result-replay').hidden=!allowReplay;
  show('result');
}
async function startSolo(subject) {
  mode='solo';currentSubject=subject;sessionId=null;
  const game=await api('/sessions',{method:'POST',body:{subject}});
  sessionId=game.session;soloScore=0;soloTotal=game.total;
  gameVisual(user.username,game.boss_name,game.boss_realname);
  displaySoloQuestion(game.question,1);
}
function displaySoloQuestion(q,index) {
  message('player-health',`${soloScore} / ${soloTotal} puntos`);
  message('boss-health',`${index-1-soloScore} errores`);
  displayQuestion(q,`Pregunta ${index} de ${soloTotal} — ${currentSubject}`,answerSolo);
}
async function answerSolo(option) {
  try {
    const data=await api('/sessions/'+sessionId+'/answer',{method:'POST',body:{option}});
    soloScore=data.score;
    feedback(data.correct,data.correctAnswer);
    message('player-health',soloScore+' / '+soloTotal+' puntos');
    message('boss-health',(data.index-1-soloScore)+' errores');
    setTimeout(()=>{
      if(currentScreen!=='game'||mode!=='solo')return;
      if(data.finished) {
        const pct=data.percentage;
        resultScreen(`Obtuviste ${soloScore}/${soloTotal} (${pct}%).`,
          pct>=60?'¡Buen trabajo! Alcanzaste el nivel orientativo de aprobación.':'Todavía podés mejorar. Repasá el material y volvé a intentarlo.');
      } else displaySoloQuestion(data.question,data.index);
    },1250);
  } catch(e) {message('answer-feedback',errorText(e));}
}

async function openLocal() {
  $('vs-p1-name').value=user.username;$('vs-p2-name').value='';
  show('vsplayer-setup');
}
async function startLocal(p1,p2,subject,callback=null) {
  mode='local';currentSubject=subject;localPlayers=[p1,p2];localScores=[0,0];localIndex=0;localCallback=callback;
  const questions=await api('/questions/local?subject='+encodeURIComponent(subject));
  if(questions.length<2)throw Error('No hay suficientes preguntas para el duelo.');
  localQueue=shuffle(questions).slice(0,10);
  if(localQueue.length%2) localQueue.pop();
  gameVisual(p1,p2,'Duelo local',true);showLocalQuestion();
}
function showLocalQuestion() {
  const turn=localIndex%2;
  message('player-health',localScores[0]+' puntos');message('boss-health',localScores[1]+' puntos');
  displayQuestion(localQueue[localIndex],`Turno de ${localPlayers[turn]} — Pregunta ${localIndex+1}`, answerLocal);
}
function answerLocal(option) {
  const q=localQueue[localIndex], good=option===q.answer;
  if(good)localScores[localIndex%2]++;
  feedback(good,q.answer);localIndex++;
  message('player-health',localScores[0]+' puntos');message('boss-health',localScores[1]+' puntos');
  setTimeout(async()=>{
    if(currentScreen!=='game'||mode!=='local')return;
    if(localIndex>=localQueue.length) {
      if(localScores[0]===localScores[1]) {
        // Una pregunta extra para cada participante hasta desempatar.
        try {
          const questions=await api('/questions/local?subject='+encodeURIComponent(currentSubject));
          localQueue.push(...shuffle(questions).slice(0,2));
          showLocalQuestion();
        } catch(e){message('answer-feedback',errorText(e));}
        return;
      }
      const winner=localPlayers[localScores[0]>localScores[1]?0:1];
      const callback=localCallback;localCallback=null;
      if(callback){mode=null;callback(winner);}
      else resultScreen('🏆 Ganó '+winner,`${localPlayers[0]}: ${localScores[0]} puntos · ${localPlayers[1]}: ${localScores[1]} puntos`,false);
      return;
    }
    showLocalQuestion();
  },1100);
}

function tournamentInputs() {
  const count=Number($('tournament-count').value),wrap=$('tournament-players-list');wrap.replaceChildren();
  for(let i=0;i<count;i++){
    const field=el('div',undefined,'form-row'),label=el('label','Jugador '+(i+1)),input=el('input');
    input.type='text';input.maxLength=32;input.className='styled-input tournament-player-input';input.value=i===0?user.username:'';input.placeholder='Jugador '+(i+1);
    field.append(label,input);wrap.append(field);
  }
}
function newTournament() {tournamentInputs();show('tournament-setup');}
function generateBracket() {
  const names=all('.tournament-player-input').map((i,n)=>i.value.trim()||'Jugador '+(n+1));
  if(new Set(names.map(x=>x.toLowerCase())).size!==names.length){alert('Los nombres deben ser distintos.');return;}
  const rnd=shuffle(names),first=[];
  for(let i=0;i<rnd.length;i+=2)first.push({p1:rnd[i],p2:rnd[i+1],winner:null});
  tournamentRounds=[first];tournamentRound=0;tournamentMatch=0;tournamentChampion=null;renderBracket();show('tournament-bracket');
}
function renderBracket() {
  const list=$('bracket-list');list.replaceChildren();
  tournamentRounds.forEach((round,r)=>{
    const d=el('div',undefined,'bracket-round');d.append(el('strong','Ronda '+(r+1)));
    const ul=el('ul');round.forEach((m,j)=>{
      const li=el('li',`${m.p1} vs ${m.p2} ${m.winner?'— Ganó: '+m.winner:''}`);
      if(r===tournamentRound&&j===tournamentMatch&&!m.winner)li.className='current-match';ul.append(li);
    });d.append(ul);list.append(d);
  });
  message('champion-banner',tournamentChampion?'🏆 Campeón: '+tournamentChampion:'');
  const curr=tournamentRounds[tournamentRound]?.[tournamentMatch];
  message('bracket-current-match',curr?`${curr.p1} ⚔ ${curr.p2}`:'');
  $('play-match-btn').hidden=!curr;$('new-tournament-btn').hidden=!tournamentChampion;
}
async function playTournament() {
  const match=tournamentRounds[tournamentRound]?.[tournamentMatch];if(!match)return;
  const options=subjects.filter(x=>x.is_base);
  const choice=options[Math.floor(Math.random()*options.length)];
  try{await startLocal(match.p1,match.p2,choice.code,winner=>{
    match.winner=winner;tournamentMatch++;
    if(tournamentMatch===tournamentRounds[tournamentRound].length){
      const winners=tournamentRounds[tournamentRound].map(m=>m.winner);
      if(winners.length===1)tournamentChampion=winners[0];
      else {const next=[];for(let i=0;i<winners.length;i+=2)next.push({p1:winners[i],p2:winners[i+1],winner:null});tournamentRounds.push(next);tournamentRound++;tournamentMatch=0;}
    }
    renderBracket();show('tournament-bracket');
  });}catch(e){alert(errorText(e));}
}

async function openAi() {
  aiQuestions=[];$('ai-play-btn').hidden=true;message('ai-status','');$('ai-preview').replaceChildren();
  await loadMaterials();show('ai-docs');
}
async function loadMaterials() {
  try{
    const materials=await api('/materials'),wrap=$('materials-list');wrap.replaceChildren();
    if(!materials.length)wrap.append(el('p','Todavía no subiste materiales.'));
    materials.forEach(m=>{
      const line=el('div',`${m.filename} · ${m.subject_name} · ${m.questions} preguntas`);wrap.append(line);
    });
  }catch(e){message('materials-list',errorText(e));}
}
function showAiPreview(qs) {
  const preview=$('ai-preview');preview.replaceChildren();
  qs.forEach((q,i)=>{
    const item=el('div',undefined,'ai-q-item');item.append(el('div',`${i+1}. ${q.q}`,'q-title'));
    q.options.forEach(o=>item.append(el('div',`• ${o}${o===q.answer?' ✓':''}`,'q-opt'+(o===q.answer?' correct':''))));
    preview.append(item);
  });
}
async function generateAI() {
  const btn=$('generate-ai'), file=$('ai-doc-file').files[0], raw=$('ai-doc-text').value.trim();
  if(!file&&raw.length<80){message('ai-status','Subí un documento o pegá al menos 80 caracteres.');return;}
  const qty=Number($('ai-qty').value), subject=$('ai-subject').value.trim();
  if(!subject){message('ai-status','Elegí una materia.');return;}
  if(!Number.isInteger(qty)||qty<3||qty>15){message('ai-status','Cantidad: entre 3 y 15.');return;}
  if(file&&file.size>5*1024*1024){message('ai-status','Archivo demasiado grande (máximo 5 MB).');return;}
  btn.disabled=true;$('ai-play-btn').hidden=true;$('ai-preview').replaceChildren();
  try{
    message('ai-status','Subiendo y leyendo el material...');
    const form=new FormData();form.append('subject',subject);form.append('text',raw);if(file)form.append('file',file);
    const upload=await api('/materials',{method:'POST',body:form});
    message('ai-status','Generando preguntas...');
    const result=await api('/materials/'+upload.id+'/generate',{method:'POST',body:{qty}});
    aiQuestions=result.questions;aiSubject=result.subject;
    showAiPreview(aiQuestions);$('ai-play-btn').hidden=!aiQuestions.length;
    message('ai-status',`${result.count} preguntas guardadas con ${result.mode}. ${result.warning||'Podés jugar con ellas.'}`);
    await loadSubjects();await loadMaterials();
  }catch(e){message('ai-status',errorText(e));}
  finally{btn.disabled=false;}
}

async function renderRanking() {
  show('scoreboard');const area=$('scoreboard-list');area.replaceChildren(el('p','Cargando ranking...'));
  try {
    const rows=await api('/ranking');area.replaceChildren();
    if(!rows.length){area.append(el('p','No hay partidas terminadas.'));return;}
    const table=el('table',undefined,'score-table'),head=el('tr');
    ['#','Usuario','Puntos','Victorias','Partidas'].forEach(x=>head.append(el('th',x)));table.append(head);
    rows.forEach((r,i)=>appendRow(table,[String(i+1),r.name,String(r.points),String(r.wins),String(r.played)]));area.append(table);
  } catch(e){area.replaceChildren(el('p',errorText(e)));}
}
async function renderHistory() {
  show('history');const area=$('history-list');area.replaceChildren(el('p','Cargando...'));
  try{
    const rows=await api('/history');area.replaceChildren();
    if(!rows.length){area.append(el('p','Todavía no terminaste ninguna partida.'));return;}
    rows.forEach(r=>area.append(el('p',`${r.subject} · ${r.mode} · ${r.score}/${r.total} · ${r.created_at}`)));
  }catch(e){area.replaceChildren(el('p',errorText(e)));}
}
async function renderTeacher() {
  show('teacher');const area=$('teacher-list');area.replaceChildren(el('p','Cargando...'));
  try{
    const rows=await api('/teacher/pending');area.replaceChildren();
    if(!rows.length){area.append(el('p','No hay preguntas pendientes de revisión.'));return;}
    rows.forEach(q=>{
      const item=el('div',undefined,'teacher-item');item.append(el('strong',q.subject+' — '+q.author));
      item.append(el('p',q.q));q.options.forEach(o=>item.append(el('p',(o===q.answer?'✅ ':'• ')+o)));
      for(const [name,decision] of [['✅ Aprobar','approved'],['❌ Rechazar','rejected']]){
        item.append(button(name,async()=>{
          try{await api('/teacher/review/'+q.id,{method:'POST',body:{decision}});await renderTeacher();}catch(e){alert(errorText(e));}
        }));
      }
      area.append(item);
    });
  }catch(e){area.replaceChildren(el('p',errorText(e)));}
}

function sendOnline(obj) {if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));else message('online-status','La conexión con el servidor no está abierta.');}
function closeSocket() {
  if(ws){try{ws.close(1000,'Salir');}catch{}ws=null;}
  roomInfo=null;roomAnswered=false;nextOnlineQuestionAfter=0;
}
function openOnline() {closeSocket();show('online-setup');message('online-status','');}
let pendingOnlineAction = null;
function connectOnline(action) {
  pendingOnlineAction = action;
  closeSocket();message('online-status','Conectando...');
  const endpoint = new URL((NATIVE ? SERVER_ORIGIN : location.origin)+'/ws/online');
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  ws=new WebSocket(endpoint.toString());
  ws.addEventListener('open',()=>{
    message('online-status','Conectado.');
    if(NATIVE)sendOnline({type:'auth', token:localStorage.getItem(AUTH_KEY)});
    else sendOnline(action);
  });
  ws.addEventListener('message',ev=>{
    try{handleOnline(JSON.parse(ev.data));}catch(e){console.error('Mensaje online inválido',e);}
  });
  ws.addEventListener('close',()=>{
    if(mode==='online' && currentScreen==='game')resultScreen('Conexión perdida','El duelo se canceló. No se registró puntuación.',false);
    else if(currentScreen==='online-room'){message('room-status','Conexión cerrada. Regresá al menú y creá otra sala.');$('start-online').hidden=true;}
    else if(currentScreen==='online-setup')message('online-status','Conexión cerrada.');
    ws=null;
  });
  ws.addEventListener('error',()=>message('online-status','Error de conexión. Revisá que el servidor esté encendido.'));
}
function onlineRoomScreen() {
  show('online-room');message('room-code',roomInfo.code);message('room-subject','Materia: '+roomInfo.subject);
  const p=$('room-players');p.replaceChildren(...roomInfo.players.map(x=>el('p','👤 '+x.name+(x.id===roomInfo.host?' (anfitrión)':''))));
  message('room-status',roomInfo.players.length<2?'Esperando al segundo jugador...':'¡Los dos jugadores están conectados!');
  $('start-online').hidden=!(roomInfo.players.length===2&&user.id===roomInfo.host&&roomInfo.status==='waiting');
}
function onlineQuestion(data) {
  if(currentScreen!=='game')show('game');
  roomAnswered=false;
  const players=roomInfo.players;const opponent=players.find(p=>p.id!==user.id);
  message('player-health',(data.scores[user.id]||0)+' puntos');message('boss-health',(data.scores[opponent.id]||0)+' puntos');
  displayQuestion(data.question,`Pregunta ${data.index} de ${data.total} — Ambos responden`,opt=>{
    roomAnswered=true;sendOnline({type:'answer',option:opt});message('answer-feedback','Esperando la respuesta del rival...');
  });
}
function handleOnline(data) {
  if(data.type==='auth_ok') {sendOnline(pendingOnlineAction);return;}
  if(data.type==='error') {message(currentScreen==='online-room'?'room-status':'online-status',data.message);return;}
  if(data.type==='room_state') {
    roomInfo=data;
    if(data.status==='playing' && currentScreen!=='game'){
      mode='online';const opponent=data.players.find(p=>p.id!==user.id);
      gameVisual(user.username,opponent?.name||'Rival','Duelo en línea',true);
    }else if(data.status==='waiting')onlineRoomScreen();
  }else if(data.type==='question'){
    mode='online';
    const delay = Math.max(0, nextOnlineQuestionAfter - Date.now());
    if (delay > 0) setTimeout(() => {if (mode==='online' && roomInfo) onlineQuestion(data);}, delay);
    else onlineQuestion(data);
  }else if(data.type==='answered'){
    message('answer-feedback',data.correct?'✅ Respuesta enviada':'❌ Respuesta enviada');
  }else if(data.type==='round_result'){
    nextOnlineQuestionAfter = Date.now() + 1200;
    message('answer-feedback',`Respuesta correcta: ${data.correctAnswer} · Marcador: ${data.scores[user.id]} puntos`);
    const rival=roomInfo.players.find(p=>p.id!==user.id);
    message('player-health',(data.scores[user.id]||0)+' puntos');
    message('boss-health',(data.scores[rival.id]||0)+' puntos');
  }else if(data.type==='finished'){
    const rival=roomInfo.players.find(p=>p.id!==user.id);
    const you=data.scores[user.id],them=data.scores[rival.id],result=data.winner===null?'Empate':data.winner===user.id?'¡Ganaste!':'Ganó '+rival.name;
    closeSocket();resultScreen('🏆 '+result,`Tu puntaje: ${you}/${data.total}. ${rival.name}: ${them}/${data.total}. Los resultados se guardaron.`,false);
  }else if(data.type==='closed'){
    closeSocket();resultScreen('Rival desconectado',data.message,false);
  }else if(data.type==='left'){
    closeSocket();show('menu');
  }
}
function back(screen) {
  if(screen==='menu' && currentScreen==='game' && mode==='solo'){
    if(!confirm('¿Abandonar la partida? El progreso incompleto no suma puntos.'))return;
    mode=null;
  }
  show(screen);
}
function exitGame() {
  if(mode==='online'){
    if(confirm('¿Abandonar el duelo online? Se cancelará para ambos.')){sendOnline({type:'leave'});closeSocket();mode=null;show('menu');}
    return;
  }
  if(mode==='local' && localCallback){
    if(!confirm('¿Abandonar el torneo en curso?'))return;
    localCallback=null;
  }
  if(!confirm('¿Salir de la partida? El progreso incompleto no se guarda como puntaje.'))return;
  mode=null;show('menu');
}
function showServerSetup(err='') {
  if(!NATIVE)return;
  $('native-server-url').value=SERVER_ORIGIN;
  $('native-server-url').disabled=LOCKED_SERVER;
  $('native-connect-btn').textContent=LOCKED_SERVER ? '🔄 Reintentar conexión' : '🔌 Conectar';
  message('native-connect-msg',err);
  show('server-setup');
}
async function testServer() {
  // A diferencia del sitio web, Android consume la API desde su propio origen.
  const response=await fetch(SERVER_ORIGIN+'/api/health',{method:'GET',cache:'no-store'});
  if(!response.ok || !(await response.json()).ok)throw Error('El servidor no respondió correctamente.');
}
async function saveServer() {
  let candidate=(LOCKED_SERVER ? window.ACADEMIA_RUNTIME.serverOrigin : $('native-server-url').value).trim().replace(/\/+$/,'');
  try {
    const url=new URL(candidate);
    if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash)
      throw Error('La aplicación requiere HTTPS.');
    candidate=url.origin;
  } catch(e) {message('native-connect-msg',e.message||'Ingresá una dirección completa, por ejemplo https://ejemplo.com');return;}
  const previous=SERVER_ORIGIN; SERVER_ORIGIN=candidate;
  message('native-connect-msg','Comprobando conexión...');
  try {
    await testServer();
    if (!LOCKED_SERVER && SERVER_ORIGIN!==previous) {
      closeSocket();user=null;localStorage.removeItem(AUTH_KEY);
      localStorage.setItem('pixel_server_origin',SERVER_ORIGIN);
    }
    message('native-connect-msg','¡Servidor conectado!');
    if (LOCKED_SERVER) await init(); else show('login');
  } catch(e){SERVER_ORIGIN=previous;message('native-connect-msg','No se pudo conectar: '+errorText(e));}
}
function setupEvents() {
  $('native-connect-btn').onclick=saveServer;
  $('change-server-btn').onclick=()=>showServerSetup();
  $('btn-login').onclick=()=>login(false);$('btn-register').onclick=()=>login(true);
  $('login-password').onkeydown=e=>{if(e.key==='Enter')login(false);};
  $('go-logout').onclick=logout;
  $('go-roulette').onclick=async()=>{await loadSubjects();show('roulette');};
  $('roulette-mode').onchange=drawWheel;$('spin-btn').onclick=spin;
  $('go-local').onclick=openLocal;
  $('start-local').onclick=async()=>{
    const p1=$('vs-p1-name').value.trim()||'Jugador 1',p2=$('vs-p2-name').value.trim()||'Jugador 2';
    if(p1.toLowerCase()===p2.toLowerCase()){alert('Elegí nombres distintos.');return;}
    let subject=$('vs-subject-select').value;
    if(subject==='random'){const options=subjects.filter(x=>x.is_base);subject=options[Math.floor(Math.random()*options.length)].code;}
    try{await startLocal(p1,p2,subject);}catch(e){alert(errorText(e));}
  };
  $('go-online').onclick=async()=>{await loadSubjects();openOnline();};
  $('create-room').onclick=()=>connectOnline({type:'create',subject:$('online-subject').value});
  $('join-room').onclick=()=>{const code=$('online-code').value.trim().toUpperCase();if(!/^[A-F0-9]{6}$/.test(code)){message('online-status','Ingresá un código de 6 caracteres.');return;}connectOnline({type:'join',code});};
  $('start-online').onclick=()=>sendOnline({type:'start'});
  $('leave-room').onclick=()=>{sendOnline({type:'leave'});closeSocket();show('menu');};
  $('copy-code').onclick=async()=>{
    const code=roomInfo?.code||'';
    try{
      if(!navigator.clipboard)throw new Error('Clipboard no disponible');
      await navigator.clipboard.writeText(code);
      message('room-status','Código copiado. Compartilo con tu rival.');
    }catch{prompt('Copiá el código de la sala:',code);}
  };
  $('go-tournament').onclick=newTournament;$('tournament-count').onchange=tournamentInputs;
  $('generate-bracket').onclick=generateBracket;$('play-match-btn').onclick=playTournament;$('new-tournament-btn').onclick=newTournament;
  $('go-ai').onclick=openAi;$('generate-ai').onclick=generateAI;$('ai-play-btn').onclick=()=>startSolo(aiSubject).catch(e=>message('ai-status',errorText(e)));
  $('go-ranking').onclick=renderRanking;$('refresh-ranking').onclick=renderRanking;$('go-history').onclick=renderHistory;
  $('go-teacher').onclick=renderTeacher;$('teacher-refresh').onclick=renderTeacher;
  $('go-options').onclick=()=>show('options');$('btn-music').onclick=()=>setSound('music');$('btn-sfx').onclick=()=>setSound('sfx');
  $('leave-game').onclick=exitGame;
  $('result-menu').onclick=()=>show('menu');
  $('result-replay').onclick=()=>startSolo(currentSubject).catch(e=>alert(errorText(e)));
  all('[data-back]').forEach(b=>b.onclick=()=>back(b.dataset.back));
  // Efecto clic sin sobreescribir los manejadores.
  all('button').forEach(b=>b.addEventListener('click',()=>play('sfx-click')));
  $('btn-music').textContent='♪ Música: '+(music?'ON':'OFF');
  $('btn-sfx').textContent='♫ Efectos: '+(sfx?'ON':'OFF');
}
setupEvents();init();
