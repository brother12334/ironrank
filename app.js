// app.js (ES module)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { KEYWORD_MAP, MUSCLE_GROUPS } from './data.js';
setLocalOpenAIKey('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');


/* ========== CONFIG - set these after creating Supabase project ========== */
const SUPABASE_URL = 'https://zbzjdkauormqdfrxxdrn.supabase.co';     // << replace
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpiempka2F1b3JtcWRmcnh4ZHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5MzA1NDYsImV4cCI6MjA3NzUwNjU0Nn0.umdLyMHoWUNADUw4uoIWapWAfZrAj_C4ZDGh7p0kIdE';                      // << replace
const CLASSIFY_ENDPOINT = null; // optional: you can set to server classifier; leave null to use client OpenAI key
/* ====================================================================== */

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// helper: convert phone to pseudo-email for password auth
// helper: convert phone to pseudo-email for password auth
function phoneToEmail(phone){
  // remove everything except digits
  const cleaned = (phone||'').replace(/[^\d]/g,''); 
  // prefix with 'u' to make a valid email
  return `u${cleaned}@phone.ironrank`;
}



document.getElementById('btnSignUp').onclick = async ()=>{
  const phone = document.getElementById('phoneIn').value.trim();
  const pw = document.getElementById('pwIn').value;
  if(!phone || !pw) return alert('enter phone and password');
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signUp({ email, password: pw });
  if(error){ alert('signup error: ' + error.message); return; }
  // after signUp, prompt for display name
  const name = prompt('display name to show on leaderboard?') || phone;
  const userId = data?.user?.id;
  if(userId){
    await supabase.from('profiles').upsert({ id: userId, phone, display_name: name });
    alert('signed up! logged in.');
    renderLogPage();
  } else {
    alert('sign up complete. sign in to continue.');
  }
};

document.getElementById('btnSignIn').onclick = async ()=>{
  const phone = document.getElementById('phoneIn').value.trim();
  const pw = document.getElementById('pwIn').value;
  if(!phone || !pw) return alert('enter phone and password');
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
  if(error){ alert('sign in error: ' + error.message); return; }
  // ensure profile exists
  const userId = data.user?.id;
  if(userId){
    const { data:profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if(!profile){
      const name = prompt('display name to show on leaderboard?') || phone;
      await supabase.from('profiles').upsert({ id: userId, phone, display_name: name });
    }
  }
  renderLogPage();
};


/* --- local OpenAI key handling (stored locally per device) --- */
function getLocalOpenAIKey(){ return localStorage.getItem('ir_openai_key') || '' }
function setLocalOpenAIKey(k){ if(k) localStorage.setItem('ir_openai_key', k); else localStorage.removeItem('ir_openai_key') }

/* --- classification: local keywords first, else client calls OpenAI (if key set) --- */
function classifyLocal(name){
  const n = (name||'').toLowerCase();
  for(const [muscle, kws] of Object.entries(KEYWORD_MAP)){
    for(const kw of kws){
      if(n.includes(kw)) return muscle;
    }
  }
  // word match fallback
  const words = n.split(/[^a-z0-9]+/);
  for(const w of words){
    for(const [muscle, kws] of Object.entries(KEYWORD_MAP)){
      if(kws.includes(w)) return muscle;
    }
  }
  return 'other';
}

async function classify(name){
  const local = classifyLocal(name);
  if(local !== 'other') return local;

  // if user provided server classify endpoint (not required), call it
  if(CLASSIFY_ENDPOINT){
    try{
      const res = await fetch(CLASSIFY_ENDPOINT, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
      const json = await res.json();
      if(json?.muscle) return json.muscle;
    }catch(e){ console.warn('server classify failed', e) }
  }

  // else attempt client-side OpenAI call if key present
  const key = getLocalOpenAIKey();
  if(!key) return 'other';
  try{
    const prompt = `Classify the primary muscle group targeted by this exercise name into one of: ${MUSCLE_GROUPS.join(", ")}. Answer with exactly one of those words. Exercise: "${name}"`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer ' + key},
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{role:'user', content:prompt}],
        max_tokens:10,
        temperature:0
      })
    });
    if(!res.ok) throw new Error('openai error');
    const data = await res.json();
    const txt = (data.choices?.[0]?.message?.content||'').trim().toLowerCase().replace(/[^a-z\-]/g,'');
    if(MUSCLE_GROUPS.includes(txt)) return txt;
  }catch(e){
    console.warn('openai classify failed', e);
  }
  return 'other';
}

/* --- scoring --- */
function computeScore({sets, reps, weight, to_failure}){
  const w = (weight && Number(weight)>0) ? Number(weight) : 1;
  return (Number(sets) * Number(reps) * w) + (to_failure ? 20 : 0);
}

/* --- UI helpers --- */
const main = document.getElementById('main');
const tabs = document.querySelectorAll('.tabbar button');
tabs.forEach(b => b.addEventListener('click', ()=>navigate(b.dataset.page)));

function setActiveTab(page){
  tabs.forEach(b=>b.classList.toggle('active', b.dataset.page===page));
}

/* --- main pages --- */
async function renderLogPage(){
  setActiveTab('log');
  main.innerHTML = `
    <div class="card">
      <div class="small">signed in as: <span id="displayName"></span></div>
      <div id="authArea" style="margin-top:8px"></div>
    </div>

    <div id="logCard" class="card" style="display:none">
      <label>Exercise name</label>
      <input id="exName" placeholder="e.g. bench press, goblet squat" />
      <div class="row">
        <input id="exSets" type="number" placeholder="Sets" />
        <input id="exReps" type="number" placeholder="Reps" />
        <input id="exWeight" type="number" placeholder="Weight (kg or lb)" />
      </div>
      <label><input id="exFailure" type="checkbox" /> did any set to failure</label>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="btnAdd">Add log</button>
        <button id="btnClear" class="pill">Clear my logs</button>
      </div>
      <div class="footer-note">Score = sets × reps × weight (or 1 if blank) + 20 if failure</div>
    </div>

    <div id="history" class="card"></div>
  `;

  // auth area
  const authArea = document.getElementById('authArea');
  const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data?.user : null;
  const session = (await supabase.auth.getSession()).data?.session;
  let profile = null;
  if(session && session.user){
    const { data } = await supabase.from('profiles').select('display_name').eq('id', session.user.id).maybeSingle();
    profile = data;
  }

  if(!session || !session.user){
    // show sign-up / sign-in form (phone + password)
 // inside renderLogPage(), auth area for sign-up / sign-in
authArea.innerHTML = `
  <label>phone number</label><input id="phoneIn" placeholder="+15551234567" />
  <label>password</label><input id="pwIn" type="password" />
  <div style="display:flex;gap:8px">
    <button id="btnSignUp">Sign up</button>
    <button id="btnSignIn" class="pill">Sign in</button>
  </div>
  <div style="margin-top:8px" class="small">phone+password uses a pseudo-email behind the scenes.</div>
`;

document.getElementById('btnSignUp').onclick = async ()=>{
  const phone = document.getElementById('phoneIn').value.trim();
  const pw = document.getElementById('pwIn').value;
  if(!phone || !pw) return alert('enter phone and password');
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signUp({ email, password: pw });
  if(error){ alert('signup error: ' + error.message); return; }
  // after signUp, prompt for display name
  const name = prompt('display name to show on leaderboard?') || phone;
  const userId = data?.user?.id;
  if(userId){
    await supabase.from('profiles').upsert({ id: userId, phone, display_name: name });
    alert('signed up! logged in.');
    renderLogPage();
  } else {
    alert('sign up complete. sign in to continue.');
  }
};

document.getElementById('btnSignIn').onclick = async ()=>{
  const phone = document.getElementById('phoneIn').value.trim();
  const pw = document.getElementById('pwIn').value;
  if(!phone || !pw) return alert('enter phone and password');
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
  if(error){ alert('sign in error: ' + error.message); return; }
  // ensure profile exists
  const userId = data.user?.id;
  if(userId){
    const { data:profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if(!profile){
      const name = prompt('display name to show on leaderboard?') || phone;
      await supabase.from('profiles').upsert({ id: userId, phone, display_name: name });
    }
  }
  renderLogPage();
};
  } else {
    // show display name & logout
    document.getElementById('displayName').textContent = profile?.display_name || session.user.user_metadata?.full_name || session.user.email || 'user';
    authArea.innerHTML = `<div style="display:flex;gap:8px"><button id="btnLogout" class="pill">Log out</button></div>`;
    document.getElementById('btnLogout').onclick = async ()=>{
      await supabase.auth.signOut();
      renderLogPage();
    };

    // show log UI
    document.getElementById('logCard').style.display = 'block';
    document.getElementById('btnAdd').onclick = async ()=>{
      const ex = document.getElementById('exName').value.trim();
      const sets = Number(document.getElementById('exSets').value) || 0;
      const reps = Number(document.getElementById('exReps').value) || 0;
      const weight = Number(document.getElementById('exWeight').value) || null;
      const to_failure = document.getElementById('exFailure').checked;
      if(!ex || sets<=0 || reps<=0) return alert('enter exercise, sets, reps');

      const muscle = await classify(ex);
      const score = computeScore({sets,reps,weight,to_failure});
      const userId = session.user.id;
      const { error } = await supabase.from('workouts').insert([{
        user_id: userId,
        exercise: ex,
        muscle,
        sets,
        reps,
        weight,
        to_failure,
        score
      }]);
      if(error) return alert('insert error: ' + error.message);
      // clear
      document.getElementById('exName').value=''; document.getElementById('exSets').value=''; document.getElementById('exReps').value=''; document.getElementById('exWeight').value=''; document.getElementById('exFailure').checked=false;
      renderHistory();
      // leaderboard updates automatically via subscription (below)
    };

    document.getElementById('btnClear').onclick = async ()=>{
      if(!confirm('clear ALL your logs? this cannot be undone on the backend')) return;
      const userId = session.user.id;
      await supabase.from('workouts').delete().eq('user_id', userId);
      renderHistory();
    };

    renderHistory();
  }
}

async function renderHistory(){
  const session = (await supabase.auth.getSession()).data?.session;
  const hist = document.getElementById('history');
  if(!session || !session.user){ hist.innerHTML = '<div class="list-empty">sign in to see history</div>'; return; }
  const userId = session.user.id;
  const { data, error } = await supabase.from('workouts').select('*').eq('user_id', userId).order('created_at',{ascending:false});
  if(error) return hist.innerHTML = '<div class="list-empty">error loading</div>';
  if(!data || data.length===0) return hist.innerHTML = '<div class="list-empty">no logs yet</div>';
  hist.innerHTML = `<div class="small">Your recent logs</div>
    <table class="table"><thead><tr><th>when</th><th>exercise</th><th>sets×reps</th><th>muscle</th><th>score</th></tr></thead>
    <tbody>${data.map(r=>`<tr><td class="small">${new Date(r.created_at).toLocaleString()}</td><td>${r.exercise}</td><td>${r.sets}×${r.reps}${r.weight?('@'+r.weight):''}</td><td>${r.muscle}</td><td class="score">${Math.round(r.score)}</td></tr>`).join('')}</tbody></table>`;
}

/* --- leaderboard page --- */
async function renderBoard(){
  setActiveTab('board');
  main.innerHTML = `<div class="card"><div class="small">Filter by muscle</div><select id="filter">${['all',...MUSCLE_GROUPS].map(m=>`<option value="${m}">${m}</option>`).join('')}</select></div>
    <div id="boardArea"></div>`;

  document.getElementById('filter').onchange = renderLeaderboard;
  renderLeaderboard();
}

async function renderLeaderboard(){
  const sel = document.getElementById('filter');
  const muscle = sel ? sel.value : 'all';

  // query aggregate: total score per user, and optional per-muscle
  // use Supabase RPC via SQL view: simple approach - fetch joined rows and aggregate in JS
  let { data: rows, error } = await supabase.from('workouts').select('*, profiles!inner(display_name)').order('created_at',{ascending:false});
  if(error) return document.getElementById('boardArea').innerHTML = '<div class="list-empty">error loading</div>';
  // rows contains workouts joined to profiles
  // aggregate
  const map = {};
  rows.forEach(r=>{
    const id = r.user_id;
    if(!map[id]) map[id] = { id, name: r.profiles.display_name || r.profiles.display_name || 'anon', total:0, muscles:{} , history:[]};
    if(muscle==='all' || r.muscle===muscle){
      map[id].total += Number(r.score || 0);
    }
    map[id].history.push(r);
    // accumulate per-muscle scoreboard
    map[id].muscles[r.muscle] = (map[id].muscles[r.muscle]||0) + Number(r.score||0);
  });

  const arr = Object.values(map).sort((a,b)=>b.total - a.total);
  const area = document.getElementById('boardArea');
  if(arr.length===0) return area.innerHTML = '<div class="list-empty">no logs yet</div>';

  area.innerHTML = `<table class="table"><thead><tr><th>rank</th><th>name</th><th>score</th><th>top muscles</th></tr></thead><tbody>${
    arr.map((u,i) => {
      const top = Object.entries(u.muscles).sort((a,b)=>b[1]-a[1]).slice(0,3).map(t=>`<span class="pill">${t[0]}</span>`).join(' ');
      return `<tr><td>${i+1}</td><td><a href="#" class="showUser" data-id="${u.id}">${u.name}</a></td><td class="score">${Math.round(u.total)}</td><td>${top}</td></tr>`;
    }).join('')
  }</tbody></table>`;

  // attach click handlers to show history for a user
  document.querySelectorAll('.showUser').forEach(a=>{
    a.addEventListener('click', async (e)=>{
      e.preventDefault();
      const uid = a.dataset.id;
      const { data } = await supabase.from('workouts').select('*, profiles!inner(display_name)').eq('user_id', uid).order('created_at',{ascending:false});
      if(!data || data.length===0) return alert('no logs');
      const html = `<div class="card"><div class="small">history for ${data[0].profiles.display_name}</div>
        <table class="table"><thead><tr><th>when</th><th>exercise</th><th>sets×reps</th><th>muscle</th><th>score</th></tr></thead>
        <tbody>${data.map(r=>`<tr><td class="small">${new Date(r.created_at).toLocaleString()}</td><td>${r.exercise}</td><td>${r.sets}×${r.reps}${r.weight?('@'+r.weight):''}</td><td>${r.muscle}</td><td class="score">${Math.round(r.score)}</td></tr>`).join('')}</tbody></table></div>`;
      main.scrollTo({top:0, behavior:'smooth'});
      main.insertAdjacentHTML('afterbegin', html);
    });
  });
}

/* --- settings page --- */
async function renderSettings(){
  setActiveTab('settings');
  main.innerHTML = `
    <div class="card">
      <div class="small">OpenAI Key (optional) — stored only in this browser</div>
      <input id="openAIKey" placeholder="sk-..." />
      <div style="display:flex;gap:8px;margin-top:6px"><button id="saveKey">Save key</button><button id="clearKey" class="pill">Clear key</button></div>
      <div class="footer-note">If you supply a key, the app will call OpenAI to classify obscure exercises. Keep your key secret on your device.</div>
    </div>
    <div class="card">
      <div class="small">Account</div>
      <div id="accountArea"></div>
    </div>
    <div class="card">
      <div class="small">App</div>
      <button id="btnExport" class="pill">Export my data (JSON)</button>
    </div>
  `;
  document.getElementById('openAIKey').value = getLocalOpenAIKey();
  document.getElementById('saveKey').onclick = ()=>{
    const v = document.getElementById('openAIKey').value.trim();
    setLocalOpenAIKey(v);
    alert('saved locally');
  };
  document.getElementById('clearKey').onclick = ()=>{
    setLocalOpenAIKey('');
    document.getElementById('openAIKey').value='';
    alert('cleared');
  };

  const session = (await supabase.auth.getSession()).data?.session;
  const acct = document.getElementById('accountArea');
  if(!session || !session.user){
    acct.innerHTML = `<div class="small">not signed in</div>`;
  } else {
    const { data } = await supabase.from('profiles').select('display_name, phone').eq('id', session.user.id).maybeSingle();
    acct.innerHTML = `<div class="small">signed in as <strong>${data?.display_name||'user'}</strong> (${data?.phone||'no-phone'})</div>
      <div style="display:flex;gap:8px;margin-top:8px"><button id="btnLogout">Log out</button></div>`;
    document.getElementById('btnLogout').onclick = async ()=>{ await supabase.auth.signOut(); renderSettings(); };
  }

  document.getElementById('btnExport').onclick = async ()=>{
    const session = (await supabase.auth.getSession()).data?.session;
    if(!session || !session.user) return alert('sign in to export your logs');
    const uid = session.user.id;
    const { data } = await supabase.from('workouts').select('*').eq('user_id', uid);
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ir_logs_export.json'; a.click();
    URL.revokeObjectURL(url);
  };
}

/* --- navigation --- */
function navigate(page){
  if(page==='log') renderLogPage();
  if(page==='board') renderBoard();
  if(page==='settings') renderSettings();
}

/* --- realtime subscription so leaderboard updates for everyone --- */
function setRealtime(){
  const channel = supabase.channel('public:workouts')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' }, payload => {
      // if leaderboards visible, refresh
      const active = document.querySelector('.tabbar button.active')?.dataset.page;
      if(active === 'board') renderLeaderboard();
      if(active === 'log') renderHistory();
    }).subscribe();
}

/* --- bootstrap --- */
(async function(){
  // initial nav
  navigate('log');
  setRealtime();
})();
