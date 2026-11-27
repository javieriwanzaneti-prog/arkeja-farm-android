/* ============ ARKEJA FARM — Utilities ============ */
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const rupiah = n => 'Rp' + Math.round(num(n)).toLocaleString('id-ID');
const fmtNum = (n, d=0) => num(n).toLocaleString('id-ID',{maximumFractionDigits:d});
// Tanggal kalender lokal perangkat (hindari pergeseran tanggal akibat UTC).
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const uid = (p='id') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const daysBetween = (a,b) => Math.floor((new Date(b) - new Date(a)) / 86400000);
const addDays = (iso, n) => { const [y,m,day] = String(iso).slice(0,10).split('-').map(Number); const d = new Date(y, m-1, day); d.setDate(d.getDate()+Number(n||0)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const fmtDate = d => d ? new Date(d+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '—';
const fmtDateShort = d => d ? new Date(d+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short'}) : '—';


function bindOnce(button, handler){
  button.onclick=async function(event){
    if(button.disabled || button.dataset.busy==='1') return;
    button.dataset.busy='1'; button.disabled=true;
    try { return await handler.call(this,event); }
    catch(error){ console.error(error); toast(error && error.message ? error.message : 'Operasi gagal. Silakan coba kembali.'); }
    finally { if(button.isConnected){ button.disabled=false; delete button.dataset.busy; } }
  };
}

async function storageStatus(){
  if(!navigator.storage || !navigator.storage.estimate) return {supported:false};
  try { const estimate=await navigator.storage.estimate(); return {supported:true,usage:estimate.usage||0,quota:estimate.quota||0,available:Math.max(0,(estimate.quota||0)-(estimate.usage||0))}; }
  catch(error){ return {supported:true,error:error.message}; }
}

function toast(msg, ms=2400){
  const el = $('#toast'); if(!el) return;
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function modal(title, bodyHTML, onMount){
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal"><div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h2>${esc(title)}</h2>
      <button class="btn small outline" data-close>✕</button>
    </div>
    <div id="modal-body">${bodyHTML}</div>
  </div></div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('[data-close]').onclick = close;
  root.querySelector('.modal').onclick = e => { if(e.target.classList.contains('modal')) close(); };
  if(onMount) onMount(root.querySelector('#modal-body'), close);
  return close;
}

function confirmDialog(msg, onYes){
  modal('Konfirmasi', `<p style="margin:0 0 14px">${esc(msg)}</p>
    <div class="btn-row"><button class="btn secondary" data-no>Batal</button><button class="btn" data-yes>Ya, Lanjut</button></div>`,
  (b,close)=>{ b.querySelector('[data-no]').onclick = close; b.querySelector('[data-yes]').onclick = ()=>{ close(); onYes(); }; });
}

function formValues(form){
  const data = {}; const fd = new FormData(form);
  for(const [k,v] of fd.entries()){
    if (data[k] !== undefined){
      if(!Array.isArray(data[k])) data[k]=[data[k]];
      data[k].push(v);
    } else data[k]=v;
  }
  return data;
}

function imageToDataURL(file, maxW=800){
  return new Promise((res,rej)=>{
    if(!file) return res('');
    if(file.size>12*1024*1024) return rej(new Error('Ukuran foto melebihi 12 MB. Pilih foto lebih kecil.')); 
    const r = new FileReader();
    r.onload = ()=>{
      const img = new Image();
      img.onerror = ()=>rej(new Error('Foto tidak dapat dibaca.'));
      img.onload = ()=>{
        const scale = Math.min(1, maxW/img.width);
        const c = document.createElement('canvas');
        c.width = img.width*scale; c.height = img.height*scale;
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        try { res(c.toDataURL('image/jpeg', .7)); } catch(error){ rej(error); }
      };
      img.src = r.result;
    };
    r.onerror=()=>rej(new Error('Gagal membaca file foto.'));
    r.readAsDataURL(file);
  });
}

function downloadBlob(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

async function saveBackupFile(payload, filename){
  const json=JSON.stringify(payload,null,2);
  const bytes=new TextEncoder().encode(json);
  if(window.ArkejaFileSaver && typeof window.ArkejaFileSaver.saveFile==='function')
    return await window.ArkejaFileSaver.saveFile(bytes,filename,'application/json');
  downloadBlob(new Blob([json],{type:'application/json'}),filename);
  return {filename,location:'Download',download:true};
}

function toCSV(rows){
  if(!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc2 = v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  return [cols.join(','), ...rows.map(r=>cols.map(c=>esc2(r[c])).join(','))].join('\n');
}

function sortBy(arr, key, dir=1){ return [...arr].sort((a,b)=> (a[key]>b[key]?1:a[key]<b[key]?-1:0)*dir); }