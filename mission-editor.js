(()=>{
  const $=id=>document.getElementById(id);
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const cfg=window.LEVELY_CONFIG||{};
  const configured=window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY;
  if(!configured){ alert('Supabase設定を読み込めません。config.js を確認してください。'); return; }
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const library=window.LEVELY_SCENARIOS||{missions:[],events:[]};
  const editor={rows:[]};

  const categoryLabels={
    karaoke:'KARAOKE',social:'SOCIAL / POINT',chaos:'CHAOS / NG',staff:'STAFF ATTACK',
    order:'BLACK ORDER',vote:'VOTE / POINT',duo:'DUO',secret:'SECRET EVENT',
    speed:'SPEED',voice:'VOICE',mind:'MIND',bar:'GUERRILLA / BAR',event:'EVENT'
  };

  function editableRows(){
    return [
      ...(library.missions||[]).map((m,i)=>({
        key:'mission:'+(m.id||i),kind:'mission',id:m.id||String(i),cat:'secret_mission',
        title:'SECRET MISSION '+(i+1),original:m.text||m.message||m.mission||''
      })),
      ...(library.events||[]).map((e,i)=>({
        key:'event:'+(e.id||i),kind:'event',id:e.id||String(i),cat:e.cat||'event',
        title:e.title||('EVENT '+(i+1)),original:e.message||''
      }))
    ];
  }

  async function load(){
    const base=editableRows();
    const {data,error}=await sb.from('mission_overrides').select('*');
    if(error){
      $('editorStatus').textContent='読み込みエラー: '+error.message;
      editor.rows=base.map(r=>({...r,text:r.original,enabled:true}));
    }else{
      const map=new Map((data||[]).map(x=>[x.item_key,x]));
      editor.rows=base.map(r=>({...r,text:map.get(r.key)?.custom_text??r.original,enabled:map.get(r.key)?.enabled??true}));
    }
    fillCategories();
    render();
  }

  function fillCategories(){
    const sel=$('editorCategory');
    [...new Set((library.events||[]).map(e=>e.cat).filter(Boolean))].forEach(c=>{
      const o=document.createElement('option');o.value=c;o.textContent=categoryLabels[c]||c.toUpperCase();sel.appendChild(o);
    });
  }

  function sync(){
    document.querySelectorAll('.mission-editor-item').forEach(el=>{
      const r=editor.rows.find(x=>x.key===el.dataset.key); if(!r)return;
      r.text=el.querySelector('.ed-text')?.value??r.text;
      r.enabled=!!el.querySelector('.ed-enabled')?.checked;
    });
  }

  function render(){
    const box=$('missionEditorList'),cat=$('editorCategory').value,q=$('editorSearch').value.trim().toLowerCase();
    const rows=editor.rows.filter(r=>(cat==='all'||r.cat===cat)&&(!q||(`${r.title} ${r.text}`).toLowerCase().includes(q)));
    box.innerHTML=rows.map(r=>`<div class="mission-editor-item" data-key="${escapeHtml(r.key)}">
      <div class="mission-editor-head">
        <strong>${escapeHtml(r.title)}</strong>
        <label class="editor-switch"><input class="ed-enabled" type="checkbox" ${r.enabled?'checked':''}> ${r.enabled?'ON':'OFF'}</label>
      </div>
      <textarea class="ed-text" rows="4">${escapeHtml(r.text)}</textarea>
      <button type="button" class="secondary ed-reset">この指令だけ元に戻す</button>
    </div>`).join('')||'<p class="muted">該当する指令がありません。</p>';
  }

  async function save(){
    sync();
    const payload=editor.rows.map(r=>({
      item_key:r.key,item_type:r.kind,item_id:r.id,category:r.cat,
      custom_text:r.text,enabled:r.enabled,updated_at:new Date().toISOString()
    }));
    const {error}=await sb.from('mission_overrides').upsert(payload,{onConflict:'item_key'});
    if(error)return alert('保存できません: '+error.message);
    $('editorStatus').textContent='保存しました。ゲーム側には次回読込時から反映されます。';
  }

  async function resetAll(){
    if(!confirm('編集内容とON/OFFをすべて初期状態に戻しますか？'))return;
    const {error}=await sb.from('mission_overrides').delete().neq('item_key','__never__');
    if(error)return alert('初期化できません: '+error.message);
    editor.rows=editableRows().map(r=>({...r,text:r.original,enabled:true}));
    render(); $('editorStatus').textContent='すべて初期状態に戻しました。';
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest?.('.ed-reset');
    if(b){
      const el=b.closest('.mission-editor-item'),r=editor.rows.find(x=>x.key===el?.dataset.key);
      if(r){r.text=r.original;r.enabled=true;render();}
    }
  });
  $('editorCategory').onchange=()=>{sync();render();};
  $('editorSearch').oninput=()=>{sync();render();};
  $('editorSaveAll').onclick=save;
  $('editorResetAll').onclick=resetAll;
  $('backStaffBtn').onclick=()=>{
    const code=new URLSearchParams(location.search).get('staff')||'';
    location.href=`./${code?`?staff=${encodeURIComponent(code)}`:''}`;
  };

  load();
})();