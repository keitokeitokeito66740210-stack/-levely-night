(() => {
  const cfg = window.LEVELY_CONFIG || {};
  const library = window.LEVELY_SCENARIOS || {missions:[],events:[]};
  const isConfigured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR_PROJECT') && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  const sb = isConfigured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = (id) => document.getElementById(id);
  const views = ['setupView','hostView','playerView','staffView'];
  let state = { room:null, player:null, players:[], eventSub:null, lastEvent:null, recognition:null, voiceActive:false };

  function showView(id){ views.forEach(v => $(v).classList.toggle('active', v===id)); }
  function toast(msg){ const el=$('toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1800); }
  function code(){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return 'LV'+Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); }
  function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
  function saveLocal(){ localStorage.setItem('levely_state', JSON.stringify({room:state.room?.code, player:state.player})); }
  function clearLocal(){ localStorage.removeItem('levely_state'); location.href=location.pathname; }
  function requireConfig(){ if(isConfigured) return true; alert('Supabase設定がまだです。config.js を確認してください。'); return false; }
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function byCategory(cat){ const list=library.events.filter(e=>e.cat===cat); return list.length?pick(list):pick(library.events); }
  function missionById(id){ return library.missions.find(m=>m.id===id) || library.missions.find(m=>m.text===state.player?.mission); }
  function currentKeyword(){ const mission=missionById(state.player?.mission_id); return state.lastEvent?.keyword || mission?.keyword || ''; }

  async function createRoom(){
    if(!requireConfig()) return;
    const room = { id:uuid(), code:code(), phase:'waiting', status:'open', created_at:new Date().toISOString() };
    const {error}=await sb.from('rooms').insert(room); if(error){alert(error.message);return;}
    state.room=room; saveLocal(); showHost(); subscribeRoom(room.id); subscribePlayers(room.id); subscribeEvents(room.id);
  }

  async function joinRoom(){
    if(!requireConfig()) return;
    const roomCode=$('joinCode').value.trim().toUpperCase(); const name=$('joinName').value.trim();
    if(!roomCode || !name){toast('ROOM CODEと名前を入力');return;}
    const {data:room,error}=await sb.from('rooms').select('*').eq('code',roomCode).maybeSingle(); if(error||!room){alert('ROOMが見つかりません');return;}
    let deviceId=localStorage.getItem('levely_device')||uuid(); localStorage.setItem('levely_device',deviceId);
    const mission=pick(library.missions) || {id:'fallback',text:'誰か1人を自然に笑わせてください。'};
    const player={id:uuid(),room_id:room.id,name,device_id:deviceId,mission:mission.text,mission_id:mission.id,mission_keyword:mission.keyword||null,status:'joined',score:0,created_at:new Date().toISOString()};
    const {error:pe}=await sb.from('players').insert(player); if(pe){alert(pe.message);return;}
    state.room=room;state.player=player;saveLocal();showPlayer();subscribeRoom(room.id);subscribePlayers(room.id);subscribeEvents(room.id);renderPlayer();
  }

  async function showHost(){
    showView('hostView'); $('hostRoomCode').textContent='ROOM '+state.room.code; $('roomCodeBig').textContent=state.room.code;
    const joinUrl=`${location.origin}${location.pathname}?room=${state.room.code}`;
    $('qr').innerHTML=''; if(window.QRCode) new QRCode($('qr'),{text:joinUrl,width:180,height:180});
    await refreshPlayers();
  }

  async function refreshPlayers(){
    if(!sb||!state.room)return; const {data}=await sb.from('players').select('*').eq('room_id',state.room.id).order('created_at'); state.players=data||[];
    renderPlayerLists();
  }
  

function eventCategoryLabel(cat){
  const labels={
    karaoke:'KARAOKE',
    social:'SOCIAL / POINT',
    chaos:'CHAOS / NG',
    staff:'STAFF ATTACK',
    order:'BLACK ORDER',
    vote:'VOTE / POINT',
    duo:'DUO',
    secret:'SECRET',
    speed:'SPEED',
    voice:'VOICE',
    mind:'MIND',
    bar:'GUERRILLA / BAR'
  };
  return labels[cat]||String(cat||'EVENT').toUpperCase();
}

function renderStaffEventControl(){
  const catSel=$('staffEventCategory');
  const eventSel=$('staffEventSelect');
  if(!catSel||!eventSel) return;

  const events=(window.LEVELY_SCENARIOS&&window.LEVELY_SCENARIOS.events)||[];
  const categories=[...new Set(events.map(e=>e.cat).filter(Boolean))];

  const prevCat=catSel.value;
  const prevEvent=eventSel.value;

  catSel.innerHTML=[
    '<option value="all">ALL EVENTS</option>',
    ...categories.map(cat=>`<option value="${escapeHtml(cat)}">${escapeHtml(eventCategoryLabel(cat))}</option>`)
  ].join('');

  if(prevCat && (prevCat==='all'||categories.includes(prevCat))) catSel.value=prevCat;

  const selectedCat=catSel.value||'all';
  const filtered=selectedCat==='all' ? events : events.filter(e=>e.cat===selectedCat);

  eventSel.innerHTML=filtered.map((ev,i)=>`
    <option value="${escapeHtml(ev.id)}">${escapeHtml(ev.title)}｜${escapeHtml(ev.message)}</option>
  `).join('');

  if(prevEvent && filtered.some(e=>e.id===prevEvent)) eventSel.value=prevEvent;
}

async function staffSendSelectedEvent(){
  if(!state.room) return alert('ROOMが読み込まれていません。');

  const eventId=$('staffEventSelect')?.value;
  const events=(window.LEVELY_SCENARIOS&&window.LEVELY_SCENARIOS.events)||[];
  const ev=events.find(e=>e.id===eventId);

  if(!ev) return alert('送るイベントを選択してください。');

  await pushEvent(ev,true);
  await loadLatestStaffEvent();
}

function renderStaffMissionControl(){
  const playerSel=$('staffMissionPlayer');
  const missionSel=$('staffMissionSelect');
  if(!playerSel||!missionSel) return;

  const prevPlayer=playerSel.value;
  const prevMission=missionSel.value;
  playerSel.innerHTML=state.players.length
    ? state.players.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')
    : '<option value="">参加者なし</option>';

  const missions=(window.LEVELY_SCENARIOS&&window.LEVELY_SCENARIOS.missions)||[];
  missionSel.innerHTML=missions.map((m,i)=>`<option value="${escapeHtml(m.id)}">MISSION ${i+1}｜${escapeHtml(m.text)}</option>`).join('');

  if(prevPlayer&&state.players.some(p=>p.id===prevPlayer)) playerSel.value=prevPlayer;
  if(prevMission&&missions.some(m=>m.id===prevMission)) missionSel.value=prevMission;
}

async function staffAssignSelectedMission(){
  if(!state.room) return alert('ROOMが読み込まれていません。');
  const playerId=$('staffMissionPlayer')?.value;
  const missionId=$('staffMissionSelect')?.value;
  const missions=(window.LEVELY_SCENARIOS&&window.LEVELY_SCENARIOS.missions)||[];
  const mission=missions.find(m=>m.id===missionId);
  const player=state.players.find(p=>p.id===playerId);
  if(!player||!mission) return alert('プレイヤーとミッションを選択してください。');

  const {error}=await sb.from('players').update({
    mission:mission.text,
    mission_id:mission.id,
    mission_keyword:mission.keyword||null,
    status:'joined'
  }).eq('id',player.id);

  if(error) return alert(error.message);
  await loadPlayers();
  renderAll();
  alert(`${player.name} に新しいシークレットミッションを送りました。`);
}

function renderPlayerLists(){
    const empty='<p class="muted">まだ参加者はいません。</p>';
    const hostHtml=state.players.length?state.players.map((p,i)=>`<div class="playerrow"><strong>${escapeHtml(p.name)}</strong><small>PLAYER ${i+1}</small></div>`).join(''):empty;
    const staffHtml=state.players.length?state.players.map((p,i)=>{
      const mission=p.mission||'ミッション未設定';
      const keyword=p.mission_keyword||'';
      const status=(p.status||'joined').toUpperCase();
      return `<div class="staff-player-card">
        <div class="staff-player-head"><div><strong>${escapeHtml(p.name)}</strong><small>PLAYER ${i+1}</small></div><span class="mission-status">${escapeHtml(status)}</span></div>
        <div class="staff-mission-label">SECRET MISSION</div>
        <div class="staff-mission-text">${escapeHtml(mission)}</div>
        ${keyword?`<div class="staff-keyword">🎙 検知ワード：<strong>${escapeHtml(keyword)}</strong></div>`:''}
      </div>`;
    }).join(''):empty;
    if($('hostPlayers'))$('hostPlayers').innerHTML=hostHtml;
    if($('staffPlayers'))$('staffPlayers').innerHTML=staffHtml;
    if($('hostCount'))$('hostCount').textContent=`${state.players.length} PLAYERS`;
  renderStaffMissionControl();
  renderStaffEventControl();
  }

  async function startGame(){
    if(state.players.length<2 && !confirm('参加者が2人未満です。このまま開始しますか？'))return;
    await sb.from('rooms').update({phase:'mission',status:'live'}).eq('id',state.room.id);
    await pushEvent({id:'system',cat:'system',title:'LEVELY IS WATCHING',message:'ゲームが開始されました。各プレイヤーに秘密ミッションが届きます.'},false);
    toast('GAME START');
  }

  function showPlayer(){ showView('playerView'); $('playerRoom').textContent='ROOM '+state.room.code; }
  function renderPlayer(){
    stopVoice();
    const phase=state.room?.phase||'waiting'; $('playerPhase').textContent=phase.toUpperCase();
    if(phase==='waiting'){
      $('playerContent').innerHTML=`<div class="card center"><div class="bigicon">⌛</div><h2>WAITING FOR LEVELY</h2><p class="muted">${escapeHtml(state.player?.name||'PLAYER')}として参加しました。ホストが開始するまで、そのままお待ちください。</p></div>`;
    } else if(phase==='mission'){
      const kw=state.player?.mission_keyword||missionById(state.player?.mission_id)?.keyword;
      $('playerContent').innerHTML=`<div class="card reveal"><div class="eyebrow">SECRET MISSION / ${escapeHtml(state.player?.name||'')}</div><div class="mission">${escapeHtml(state.player?.mission||'ミッションを準備中…')}</div><p class="muted">他の人には見せないでください。成功しても自分から申告しないこと。</p>${kw?voiceControls(kw):''}</div><div class="card"><div class="eyebrow">LIVE</div><p class="muted">普通に飲んで会話してください。LEVELYから突然イベントが届きます。</p></div>`;
      bindVoiceButton();
    } else if(phase==='final') renderFinal();
  }

  function voiceControls(keyword){
    return `<div class="voicebox"><div class="eyebrow">VOICE BETA</div><p class="muted">「${escapeHtml(keyword)}」を検知できます。対応端末のみ。認識結果はこの端末内で判定します。</p><button class="voicebtn" id="voiceBtn">🎙 音声判定を開始</button><div id="voiceStatus" class="voice-status">OFF</div><button class="ghost" id="manualSuccessBtn">手動で成功にする</button></div>`;
  }
  function bindVoiceButton(){
    const btn=$('voiceBtn'); if(btn) btn.onclick=toggleVoice;
    const manual=$('manualSuccessBtn'); if(manual) manual.onclick=()=>{toast('MISSION COMPLETE'); $('voiceStatus').textContent='MANUAL COMPLETE ✓';};
  }

  async function pushEvent(ev,isReal=true){
    if(!state.room||!ev)return;
    const row={id:uuid(),room_id:state.room.id,type:ev.cat||'event',title:ev.title,message:ev.message,is_real:isReal,scenario_id:ev.id||null,keyword:ev.keyword||null,created_at:new Date().toISOString()};
    const {error}=await sb.from('events').insert(row); if(error) alert(error.message);
  }

  async function staffSecretWordTrap(){
    if(!state.room) return alert('ROOMが読み込まれていません。');
    const custom=($('staffSecretWordCustom')?.value||'').trim();
    const selected=($('staffSecretWord')?.value||'').trim();
    const keyword=custom||selected;
    if(!keyword) return alert('NGワードを選択してください。');

    const ev={
      id:'secret-word-trap',
      cat:'secret_word',
      title:'SECRET WORD TRAP',
      message:'このゲーム中、「ある言葉」がNGワードに指定された。その言葉を口にした人は罰ゲーム。NGワードの正体はスタッフだけが知っている。',
      keyword
    };
    await pushEvent(ev,true);
    if($('staffSecretWordCustom')) $('staffSecretWordCustom').value='';
    toast('SECRET WORD / '+keyword);
  }

  function renderIncomingEvent(ev){
    state.lastEvent={...ev,keyword:ev.keyword||null};
    if(state.player){
      stopVoice();
      const isSecretWord=ev.scenario_id==='secret-word-trap'||ev.type==='secret_word';
      const voice=ev.keyword&&!isSecretWord?voiceControls(ev.keyword):'';
      const safeTitle=isSecretWord?'HIDDEN WORD':'';
      $('playerContent').innerHTML=`<div class="card reveal"><div class="eyebrow">${escapeHtml(safeTitle||ev.title)}</div><div class="mission">${escapeHtml(ev.message)}</div>${voice}<button class="primary" id="eventAck">確認した</button></div>`;
      setTimeout(()=>{ const b=$('eventAck'); if(b)b.onclick=renderPlayer; bindVoiceButton(); },0);
      navigator.vibrate?.([120,70,120]);
    }
    renderStaffCurrentEvent(ev);
    logStaffEvent(ev);
  }

  async function staffEvent(cat){ const ev=byCategory(cat); await pushEvent(ev,true); toast(ev?.title||'EVENT'); }
  async function randomEvent(){ const ev=pick(library.events); await pushEvent(ev,true); toast('RANDOM / '+(ev?.title||'EVENT')); }
  async function fakeStaff(){ const list=library.events.filter(e=>['staff','secret','social'].includes(e.cat)); const ev=pick(list); await pushEvent(ev,false); toast('FAKE EVENT'); }
  async function finishGame(){ await sb.from('rooms').update({phase:'final',status:'finished'}).eq('id',state.room.id); await pushEvent({id:'final',cat:'final',title:'FINAL REVEAL',message:'LEVELY NIGHTの結果が確定しました。'},false); }
  function renderFinal(){
    const seed=state.players.length?state.players:[state.player].filter(Boolean); const names=seed.map(p=>p.name); const a=names[0]||'PLAYER';const b=names[1]||a;const c=names[2]||a;
    $('playerContent').innerHTML=`<div class="card"><div class="eyebrow">LEVELY NIGHT / RESULT</div><div class="playerrow"><span>最も人を操った人</span><strong>${escapeHtml(a)}</strong></div><div class="playerrow"><span>最も操られた人</span><strong>${escapeHtml(b)}</strong></div><div class="playerrow"><span>最もスタッフを疑った人</span><strong>${escapeHtml(c)}</strong></div></div><div class="card reveal center"><div class="eyebrow">FINAL REVEAL</div><div class="mission">あなた達が「スタッフの指示」だと思ったイベントの一部は、スタッフとは無関係でした。</div><p class="muted">ただし、一部だけ本当にスタッフが操作していました。</p><h2>LEVEL 1 COMPLETE</h2></div>`;
  }

  function voiceApi(){ return window.SpeechRecognition || window.webkitSpeechRecognition; }
  function toggleVoice(){ state.voiceActive ? stopVoice() : startVoice(); }
  function startVoice(){
    const SR=voiceApi(); const status=$('voiceStatus'); const btn=$('voiceBtn');
    if(!SR){ if(status)status.textContent='このブラウザは音声認識に未対応'; toast('音声認識は未対応です'); return; }
    const keyword=currentKeyword(); if(!keyword){ toast('検知ワードがありません'); return; }
    try{
      const rec=new SR(); state.recognition=rec; rec.lang='ja-JP'; rec.continuous=true; rec.interimResults=true;
      rec.onstart=()=>{state.voiceActive=true;if(btn)btn.textContent='⏹ 音声判定を停止';if(status)status.textContent=`LISTENING / 「${keyword}」を待機中`;};
      rec.onresult=(e)=>{ let text=''; for(let i=e.resultIndex;i<e.results.length;i++) text+=e.results[i][0].transcript; if(status)status.textContent='聞き取り: '+text.slice(-40); if(normalize(text).includes(normalize(keyword))){ if(status)status.textContent=`DETECTED ✓ 「${keyword}」`; toast('VOICE DETECTED'); navigator.vibrate?.([180,80,180]); stopVoice(false); } };
      rec.onerror=(e)=>{ if(status)status.textContent='音声認識エラー: '+(e.error||'unknown'); stopVoice(false); };
      rec.onend=()=>{ state.voiceActive=false; if(btn)btn.textContent='🎙 音声判定を開始'; };
      rec.start();
    }catch(err){ if(status)status.textContent='開始できませんでした'; state.voiceActive=false; }
  }
  function stopVoice(update=true){
    try{ state.recognition?.stop(); }catch(e){}
    state.recognition=null;state.voiceActive=false;
    if(update){ const btn=$('voiceBtn');if(btn)btn.textContent='🎙 音声判定を開始'; const status=$('voiceStatus');if(status && !status.textContent.includes('DETECTED'))status.textContent='OFF'; }
  }
  function normalize(s=''){ return String(s).toLowerCase().replace(/[\s　、。！？!?]/g,''); }

  function subscribePlayers(roomId){ sb.channel('players-'+roomId).on('postgres_changes',{event:'*',schema:'public',table:'players',filter:`room_id=eq.${roomId}`},()=>refreshPlayers()).subscribe(); }
  function subscribeRoom(roomId){ sb.channel('room-'+roomId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms',filter:`id=eq.${roomId}`},payload=>{state.room=payload.new;if(state.player)renderPlayer();if(state.room.phase==='final')refreshPlayers();}).subscribe(); }
  function subscribeEvents(roomId){ state.eventSub=sb.channel('events-'+roomId).on('postgres_changes',{event:'INSERT',schema:'public',table:'events',filter:`room_id=eq.${roomId}`},payload=>renderIncomingEvent(payload.new)).subscribe(); }
  function renderStaffCurrentEvent(ev){
    const el=$('staffCurrentEvent'); if(!el||!ev)return;
    el.classList.remove('empty');
    el.innerHTML=`<div class="current-order-head"><strong>${escapeHtml(ev.title||'EVENT')}</strong><span>${ev.is_real?'REAL STAFF':'FAKE'}</span></div><div class="current-order-message">${escapeHtml(ev.message||'')}</div>${ev.keyword?`<div class="staff-keyword">🎙 検知ワード：<strong>${escapeHtml(ev.keyword)}</strong></div>`:''}`;
  }
  function logStaffEvent(ev){
    if(!$('staffLog')||!ev)return;
    const tm=new Date(ev.created_at||Date.now()).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    $('staffLog').innerHTML=`<div class="log-event"><div class="log-event-head">[${tm}] ${escapeHtml(ev.is_real?'REAL':'FAKE')} / ${escapeHtml(ev.title||'EVENT')}</div><div class="log-event-message">${escapeHtml(ev.message||'')}</div>${ev.keyword?`<div class="staff-keyword">SECRET WORD：<strong>${escapeHtml(ev.keyword)}</strong></div>`:''}</div>`+$('staffLog').innerHTML;
  }
  async function loadLatestStaffEvent(){
    if(!state.room)return;
    const {data,error}=await sb.from('events').select('*').eq('room_id',state.room.id).order('created_at',{ascending:false}).limit(1);
    if(!error && data && data[0]) renderStaffCurrentEvent(data[0]);
  }
  function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }

  async function loadStaff(roomCode){
    if(!requireConfig()) return;
    const normalized=String(roomCode||'').trim().toUpperCase();
    if(!normalized){ alert('STAFF用ROOM CODEがありません'); return; }
    const {data:room,error}=await sb.from('rooms').select('*').eq('code',normalized).maybeSingle();
    if(error){ alert('STAFF ROOM読込エラー: '+error.message); return; }
    if(!room){ alert('ROOMが見つかりません: '+normalized); return; }
    state.room=room;
    showView('staffView');
    $('staffRoomLabel').textContent='ROOM '+room.code;
    subscribePlayers(room.id);
    subscribeRoom(room.id);
    subscribeEvents(room.id);
    await refreshPlayers();
    await loadLatestStaffEvent();
  }

  async function autoRoute(){
    try{
      const q=new URLSearchParams(window.location.search);
      const staff=(q.get('staff')||'').trim();
      const room=(q.get('room')||'').trim();
      if(staff){
        await loadStaff(staff);
        return;
      }
      if(room && $('joinCode')) $('joinCode').value=room.toUpperCase();
    }catch(err){
      console.error('STAFF ROUTE ERROR',err);
      alert('スタッフ画面の読込でエラーが発生しました: '+(err?.message||err));
    }
  }

  $('createRoomBtn').onclick=createRoom; $('joinRoomBtn').onclick=joinRoom; $('startLiveBtn').onclick=startGame; $('resetBtn').onclick=clearLocal;
  $('copyLinkBtn').onclick=async()=>{const url=`${location.origin}${location.pathname}?room=${state.room.code}`; if(navigator.share){await navigator.share({title:'LEVELY NIGHT',text:'このROOMに参加',url});}else{await navigator.clipboard.writeText(url);toast('リンクをコピーしました');}};
  document.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>staffEvent(b.dataset.event));
  $('staffRandomBtn').onclick=randomEvent;
  $('staffFakeBtn').onclick=fakeStaff;
  $('staffFinalBtn').onclick=finishGame;
  if($('staffAssignMission')) $('staffAssignMission').onclick=staffAssignSelectedMission;
  if($('staffEventCategory')) $('staffEventCategory').onchange=renderStaffEventControl;
  if($('staffSendSelectedEvent')) $('staffSendSelectedEvent').onclick=staffSendSelectedEvent;
  if($('staffSecretWordBtn')) $('staffSecretWordBtn').onclick=staffSecretWordTrap;
  if($('hostStaffBtn')) $('hostStaffBtn').onclick=()=>{
    if(!state.room) return alert('ROOMがまだ作成されていません。');
    const url=`${location.origin}${location.pathname}?staff=${encodeURIComponent(state.room.code)}`;
    const w=window.open(url,'_blank');
    if(!w) location.href=url;
  };

  function openRules(){
    const modal=$('rulesModal');
    if(!modal)return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  }
  function closeRules(){
    const modal=$('rulesModal');
    if(!modal)return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  }

  document.addEventListener('click',(e)=>{
    const target=e.target;
    if(!target) return;

    if(target.closest?.('#rulesOpenBtn')){
      e.preventDefault();
      openRules();
      return;
    }

    if(target.closest?.('#rulesCloseBtn') || target.closest?.('#rulesCloseBottomBtn')){
      e.preventDefault();
      closeRules();
      return;
    }

    if(target.id==='rulesModal'){
      closeRules();
    }
  });

  if($('staffCodeBtn')) $('staffCodeBtn').onclick=async()=>{
    const code=($('staffCodeInput')?.value||'').trim().toUpperCase();
    if(!code) return alert('ROOM CODEを入力してください。');
    history.replaceState(null,'',`${location.pathname}?staff=${encodeURIComponent(code)}`);
    await loadStaff(code);
  };
  autoRoute();
})();
