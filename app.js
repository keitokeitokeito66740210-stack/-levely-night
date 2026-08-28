(() => {
  const cfg = window.LEVELY_CONFIG || {};
  const isConfigured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR_PROJECT') && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  const sb = isConfigured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = (id) => document.getElementById(id);
  const views = ['setupView','hostView','playerView','staffView'];
  const missions = [
    '3分以内に誰かから「乾杯しよ」を自然に引き出してください。',
    '誰か1人に「それマジ？」と言わせてください。',
    'スタッフと一度だけ目を合わせてください。理由は言わないこと。',
    '誰かにメニューを手渡してもらってください。',
    '全員を一度だけ同じ方向へ向かせてください。',
    '誰かから「なんで？」を引き出してください。',
    '誰か1人に自分からではなく名前を呼ばせてください。',
    '60秒以内に2人を同時に笑わせてください。'
  ];
  let state = { room:null, player:null, players:[], subscription:null, eventSub:null };

  function showView(id){ views.forEach(v => $(v).classList.toggle('active', v===id)); }
  function toast(msg){ const el=$('toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1800); }
  function code(){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return 'LV'+Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); }
  function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
  function saveLocal(){ localStorage.setItem('levely_state', JSON.stringify({room:state.room?.code, player:state.player})); }
  function clearLocal(){ localStorage.removeItem('levely_state'); location.href=location.pathname; }
  function requireConfig(){ if(isConfigured) return true; alert('Supabase設定がまだです。README.mdの手順で config.js を設定してください。'); return false; }

  async function createRoom(){
    if(!requireConfig()) return;
    const room = { id:uuid(), code:code(), phase:'waiting', status:'open', created_at:new Date().toISOString() };
    const {error}=await sb.from('rooms').insert(room); if(error){alert(error.message);return;}
    state.room=room; saveLocal(); showHost(); subscribeRoom(room.id); subscribeEvents(room.id);
  }

  async function joinRoom(){
    if(!requireConfig()) return;
    const roomCode=$('joinCode').value.trim().toUpperCase(); const name=$('joinName').value.trim();
    if(!roomCode || !name){toast('ROOM CODEと名前を入力');return;}
    const {data:room,error}=await sb.from('rooms').select('*').eq('code',roomCode).maybeSingle(); if(error||!room){alert('ROOMが見つかりません');return;}
    let deviceId=localStorage.getItem('levely_device')||uuid(); localStorage.setItem('levely_device',deviceId);
    const player={id:uuid(),room_id:room.id,name,device_id:deviceId,mission:missions[Math.floor(Math.random()*missions.length)],status:'joined',score:0,created_at:new Date().toISOString()};
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
  function renderPlayerLists(){
    const html=state.players.length?state.players.map((p,i)=>`<div class="playerrow"><strong>${escapeHtml(p.name)}</strong><small>PLAYER ${i+1}</small></div>`).join(''):'<p class="muted">まだ参加者はいません。</p>';
    if($('hostPlayers'))$('hostPlayers').innerHTML=html;if($('staffPlayers'))$('staffPlayers').innerHTML=html;if($('hostCount'))$('hostCount').textContent=`${state.players.length} PLAYERS`;
  }

  async function startGame(){
    if(state.players.length<2 && !confirm('参加者が2人未満です。このまま開始しますか？'))return;
    await sb.from('rooms').update({phase:'mission',status:'live'}).eq('id',state.room.id);
    await pushEvent('system','LEVELY IS WATCHING','ゲームが開始されました。各プレイヤーに秘密ミッションが届きます。',false);
    toast('GAME START');
  }

  function showPlayer(){ showView('playerView'); $('playerRoom').textContent='ROOM '+state.room.code; }
  function renderPlayer(){
    const phase=state.room?.phase||'waiting'; $('playerPhase').textContent=phase.toUpperCase();
    if(phase==='waiting'){
      $('playerContent').innerHTML=`<div class="card center"><div class="bigicon">⌛</div><h2>WAITING FOR LEVELY</h2><p class="muted">${escapeHtml(state.player?.name||'PLAYER')}として参加しました。ホストが開始するまで、そのままお待ちください。</p></div>`;
    } else if(phase==='mission'){
      $('playerContent').innerHTML=`<div class="card reveal"><div class="eyebrow">SECRET MISSION / ${escapeHtml(state.player?.name||'')}</div><div class="mission">${escapeHtml(state.player?.mission||'ミッションを準備中…')}</div><p class="muted">他の人には見せないでください。成功しても自分から申告しないこと。</p></div><div class="card"><div class="eyebrow">LIVE</div><p class="muted">普通に飲んで会話してください。LEVELYから突然イベントが届きます。</p></div>`;
    } else if(phase==='final'){
      renderFinal();
    }
  }

  async function pushEvent(type,title,message,isReal=true){
    if(!state.room)return; const ev={id:uuid(),room_id:state.room.id,type,title,message,is_real:isReal,created_at:new Date().toISOString()};
    const {error}=await sb.from('events').insert(ev); if(error) alert(error.message);
  }

  function renderIncomingEvent(ev){
    if(state.player){
      const sub=ev.is_real?'これは本当にスタッフが発動したイベントです。':'スタッフが関与したように見えますが、真相はまだ分かりません。';
      $('playerContent').innerHTML=`<div class="card reveal"><div class="eyebrow">${escapeHtml(ev.title)}</div><div class="mission">${escapeHtml(ev.message)}</div><p class="muted">${sub}</p><button class="primary" id="eventAck">確認した</button></div>`;
      setTimeout(()=>{ const b=$('eventAck'); if(b)b.onclick=renderPlayer; },0);
      navigator.vibrate?.([120,70,120]);
    }
    logStaff(`${ev.is_real?'REAL':'FAKE'} / ${ev.title}`);
  }

  async function staffEvent(type){
    const map={
      karaoke:['LEVELY JACK','カラオケが検知されました。歌っている本人にバレず、曲が終わった瞬間に全員で拍手してください。'],
      attack:['STAFF ATTACK','スタッフがこのテーブルへ介入しました。30秒以内に誰か1人を笑わせてください。'],
      order:['BLACK ORDER','次にドリンクまたはノンアルを注文したプレイヤーは特殊能力を獲得します。'],
      chaos:['CHAOS MODE','今から60秒間「マジ」と言わないでください。誰が最初に言うかLEVELYが見ています。']
    };
    const [t,m]=map[type]; await pushEvent(type,t,m,true); toast(t);
  }
  async function fakeStaff(){ await pushEvent('fake','STAFF INTERVENTION','スタッフから情報提供がありました。「この中に1人、嘘をついている人物がいます。」',false); toast('FAKE EVENT'); }
  async function finishGame(){ await sb.from('rooms').update({phase:'final',status:'finished'}).eq('id',state.room.id); await pushEvent('final','FINAL REVEAL','LEVELY NIGHTの結果が確定しました。',false); }
  function renderFinal(){
    const seed=state.players.length?state.players:[state.player].filter(Boolean); const names=seed.map(p=>p.name); const a=names[0]||'PLAYER';const b=names[1]||a;const c=names[2]||a;
    $('playerContent').innerHTML=`<div class="card"><div class="eyebrow">LEVELY NIGHT / RESULT</div><div class="playerrow"><span>最も人を操った人</span><strong>${escapeHtml(a)}</strong></div><div class="playerrow"><span>最も操られた人</span><strong>${escapeHtml(b)}</strong></div><div class="playerrow"><span>最もスタッフを疑った人</span><strong>${escapeHtml(c)}</strong></div></div><div class="card reveal center"><div class="eyebrow">FINAL REVEAL</div><div class="mission">あなた達が「スタッフの指示」だと思ったイベントの一部は、スタッフとは無関係でした。</div><p class="muted">ただし、一部だけ本当にスタッフが操作していました。</p><h2>LEVEL 1 COMPLETE</h2></div>`;
  }

  function subscribePlayers(roomId){
    sb.channel('players-'+roomId).on('postgres_changes',{event:'*',schema:'public',table:'players',filter:`room_id=eq.${roomId}`},()=>refreshPlayers()).subscribe();
  }
  function subscribeRoom(roomId){
    sb.channel('room-'+roomId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms',filter:`id=eq.${roomId}`},payload=>{state.room=payload.new;if(state.player)renderPlayer();if(state.room.phase==='final')refreshPlayers();}).subscribe();
  }
  function subscribeEvents(roomId){
    state.eventSub=sb.channel('events-'+roomId).on('postgres_changes',{event:'INSERT',schema:'public',table:'events',filter:`room_id=eq.${roomId}`},payload=>renderIncomingEvent(payload.new)).subscribe();
  }
  function logStaff(txt){ if(!$('staffLog'))return; const tm=new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); $('staffLog').innerHTML=`<div>[${tm}] ${escapeHtml(txt)}</div>`+$('staffLog').innerHTML; }
  function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }

  async function loadStaff(roomCode){
    if(!requireConfig())return; const {data:room}=await sb.from('rooms').select('*').eq('code',roomCode.toUpperCase()).maybeSingle(); if(!room){alert('ROOMが見つかりません');return;}
    state.room=room; showView('staffView'); $('staffRoomLabel').textContent='ROOM '+room.code; subscribePlayers(room.id);subscribeRoom(room.id);subscribeEvents(room.id);refreshPlayers();
  }
  async function autoRoute(){
    const q=new URLSearchParams(location.search); const staff=q.get('staff'); const room=q.get('room');
    if(staff){await loadStaff(staff);return;} if(room){$('joinCode').value=room.toUpperCase();}
  }

  $('createRoomBtn').onclick=createRoom; $('joinRoomBtn').onclick=joinRoom; $('startLiveBtn').onclick=startGame; $('resetBtn').onclick=clearLocal;
  $('copyLinkBtn').onclick=async()=>{const url=`${location.origin}${location.pathname}?room=${state.room.code}`; if(navigator.share){await navigator.share({title:'LEVELY NIGHT',text:'このROOMに参加',url});}else{await navigator.clipboard.writeText(url);toast('リンクをコピーしました');}};
  document.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>staffEvent(b.dataset.event)); $('staffFakeBtn').onclick=fakeStaff; $('staffFinalBtn').onclick=finishGame;
  autoRoute();
})();
