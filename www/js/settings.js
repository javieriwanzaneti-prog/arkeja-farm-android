/* ============ Settings ============ */
const Settings = {
  async render(container){
    const activeSeasonId = Prefs.get('activeSeasonId', null);
    container.innerHTML = `
      <h2 class="page-title">Pengaturan</h2>
      <p class="subtitle">Master data, identitas, dan preferensi.</p>
      <div class="card">
        <h3>Master Data</h3>
        <div class="btn-row"><button class="btn outline" data-goto="master-commodities">Komoditas</button><button class="btn outline" data-goto="master-varieties">Varietas</button></div>
        <div class="btn-row"><button class="btn outline" data-goto="master-fertilizers">Pupuk</button><button class="btn outline" data-goto="master-pesticides">Pestisida</button></div>
        <div class="btn-row"><button class="btn outline" data-goto="master-zpts">ZPT</button><button class="btn outline" data-goto="sop">SOP</button></div>
      </div>
      <div class="card">
        <h3>PWA & Offline</h3>
        <p class="tiny muted">Install aplikasi agar bisa diakses offline dari home screen Android. Memerlukan HTTPS/localhost.</p>
        <button class="btn" id="pwa-install">Install Aplikasi</button>
      </div>
      <div class="card">
        <h3>Backup & Restore</h3>
        <div class="btn-row"><button class="btn" id="set-backup">Backup</button><button class="btn secondary" id="set-restore">Restore</button></div>
        <input type="file" id="set-restore-file" accept="application/json" style="display:none">
      </div>
      <div class="card">
        <h3>Reset Data</h3>
        <p class="tiny muted">Menghapus seluruh data dari IndexedDB. Tidak dapat dibatalkan.</p>
        <button class="btn danger" id="set-reset">Hapus Semua Data</button>
      </div>
      <div class="card">
        <h3>Tentang</h3>
        <p class="tiny muted">ARKEJA FARM — Universal Crop Management System<br>
        v1.0 · Data disimpan lokal di perangkat ini.<br>
        Tidak ada backend, tidak ada pengiriman data.</p>
      </div>`;
    container.querySelectorAll('[data-goto]').forEach(b=>b.onclick = ()=> Router.go(b.dataset.goto));

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
    $('#pwa-install').onclick = async ()=>{
      if(deferredPrompt){ deferredPrompt.prompt(); const r = await deferredPrompt.userChoice; toast(r.outcome==='accepted'?'Aplikasi diinstall':'Install dibatalkan'); deferredPrompt = null; }
      else toast('Install via menu browser → Add to Home Screen');
    };
    $('#set-backup').onclick = async ()=>{
      const data = await backupAll();
      downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}), `arkeja-backup-${todayISO()}.json`);
      toast('Backup diunduh');
    };
    $('#set-restore').onclick = ()=> $('#set-restore-file').click();
    $('#set-restore-file').onchange = async e => {
      const f = e.target.files[0]; if(!f) return;
      try {
        const data = JSON.parse(await f.text());
        confirmDialog('Restore akan menimpa data. Lanjutkan?', async ()=>{
          await restoreAll(data); toast('Dipulihkan'); setTimeout(()=>location.reload(), 600);
        });
      } catch(_){ toast('File tidak valid'); }
    };
    $('#set-reset').onclick = ()=> confirmDialog('Yakin hapus SEMUA data?', async ()=>{
      const d = await openDB();
      for(const store of Object.keys(STORES)){
        const t = d.transaction([store], 'readwrite');
        t.objectStore(store).clear();
      }
      Prefs.del('seeded_v1'); localStorage.removeItem('atk_demo_db');
      toast('Data dihapus'); setTimeout(()=>location.reload(), 600);
    });
  },

  /* ---- Master Komoditas ---- */
  async renderCommodities(container){
    const list = await getAll('commodities');
    container.innerHTML = `
      <h2 class="page-title">Komoditas</h2>
      <p class="subtitle">Master database komoditas.</p>
      <button class="btn" id="com-add" style="margin-bottom:10px">+ Tambah Komoditas</button>
      ${list.map(c=>`<div class="card">
        <div class="list-row" style="border:0;padding:0">
          <div><strong>${esc(c.name)}</strong><small>${esc(c.category)} · ${esc(c.scientific||'')} · ${c.lifespanDays} hari</small></div>
          <div style="display:flex;gap:4px"><button class="btn small secondary" data-edit="${c.id}">Edit</button><button class="btn small danger" data-del="${c.id}">✕</button></div>
        </div>
        ${c.phases ? `<div class="tiny muted" style="margin-top:4px">${c.phases.map(p=>p.name+' ('+p.startDay+'-'+p.endDay+'d)').join(' · ')}</div>`:''}
      </div>`).join('') || '<div class="empty">Belum ada komoditas.</div>'}`;
    $('#com-add').onclick = ()=> Settings._formCommodity(null, container);
    container.querySelectorAll('[data-edit]').forEach(b=>b.onclick=async()=>{
      const c = await getOne('commodities', b.dataset.edit); Settings._formCommodity(c, container);
    });
    container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus komoditas?', async ()=>{
      await del('commodities', b.dataset.del); toast('Terhapus'); Settings.renderCommodities(container);
    }));
  },
  _formCommodity(c, container){
    const isEdit = !!c;
    modal(isEdit?'Edit Komoditas':'Tambah Komoditas', `
      <div class="field"><label>Nama</label><input id="c-name" value="${esc(c?.name||'')}"></div>
      <div class="field"><label>Kategori</label><input id="c-cat" value="${esc(c?.category||'')}" placeholder="Sayur, Buah, Pangan..."></div>
      <div class="field"><label>Nama ilmiah</label><input id="c-sci" value="${esc(c?.scientific||'')}"></div>
      <div class="field"><label>Umur (hari)</label><input id="c-life" type="number" value="${c?.lifespanDays||90}"></div>
      <div class="field"><label>Satuan hasil</label><input id="c-unit" value="${esc(c?.yieldUnit||'kg')}"></div>
      <div class="field"><label>Sistem budidaya</label><input id="c-sys" value="${esc(c?.cultivationSystem||'')}"></div>
      <button class="btn" id="c-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#c-save').onclick = async ()=>{
          const phases = c?.phases || [
            {name:'Persemaian', startDay:0, endDay:14},
            {name:'Vegetatif awal', startDay:15, endDay:30},
            {name:'Vegetatif', startDay:31, endDay:45},
            {name:'Pembungaan', startDay:46, endDay:60},
            {name:'Pembuahan', startDay:61, endDay:80},
            {name:'Panen', startDay:81, endDay:100}
          ];
          const obj = { id: c?.id || uid('com'), name:b.querySelector('#c-name').value||'Tanpa nama',
            category:b.querySelector('#c-cat').value, scientific:b.querySelector('#c-sci').value,
            lifespanDays:num(b.querySelector('#c-life').value), yieldUnit:b.querySelector('#c-unit').value,
            cultivationSystem:b.querySelector('#c-sys').value, phases };
          await put('commodities', obj); close(); toast('Tersimpan'); Settings.renderCommodities(container);
        };
      });
  },

  /* ---- Master Varietas ---- */
  async renderVarieties(container){
    const list = await getAll('varieties');
    const coms = await getAll('commodities');
    container.innerHTML = `
      <h2 class="page-title">Varietas</h2>
      <button class="btn" id="var-add" style="margin-bottom:10px">+ Tambah Varietas</button>
      ${list.map(v=>{
        const c = coms.find(x=>x.id===v.commodityId);
        return `<div class="card"><div class="list-row" style="border:0;padding:0">
          <div><strong>${esc(v.name)}</strong><small>${esc(c?.name||'—')} · ${v.harvestAgeDays} hari · Target ${v.targetProductionKg||'—'} kg</small></div>
          <div style="display:flex;gap:4px"><button class="btn small secondary" data-edit="${v.id}">Edit</button><button class="btn small danger" data-del="${v.id}">✕</button></div>
        </div></div>`; }).join('') || '<div class="empty">Belum ada varietas.</div>'}`;
    $('#var-add').onclick = ()=> Settings._formVariety(null, container);
    container.querySelectorAll('[data-edit]').forEach(b=>b.onclick=async()=>{
      const v = await getOne('varieties', b.dataset.edit); Settings._formVariety(v, container);
    });
    container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus varietas?', async ()=>{
      await del('varieties', b.dataset.del); toast('Terhapus'); Settings.renderVarieties(container);
    }));
  },
  async _formVariety(v, container){
    const coms = await getAll('commodities');
    modal(v?'Edit Varietas':'Tambah Varietas', `
      <div class="field"><label>Komoditas induk</label><select id="v-com">${coms.map(c=>`<option value="${c.id}" ${v?.commodityId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Nama varietas</label><input id="v-name" value="${esc(v?.name||'')}"></div>
      <div class="field"><label>Produsen</label><input id="v-prod" value="${esc(v?.producer||'')}"></div>
      <div class="field"><label>Karakteristik</label><textarea id="v-char">${esc(v?.characteristics||'')}</textarea></div>
      <div class="field-row">
        <div class="field"><label>Umur panen (hari)</label><input id="v-age" type="number" value="${v?.harvestAgeDays||70}"></div>
        <div class="field"><label>Target produksi (kg/tan)</label><input id="v-target" type="number" step="0.1" value="${v?.targetProductionKg||0}"></div>
      </div>
      <button class="btn" id="v-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#v-save').onclick = async ()=>{
          await put('varieties', { id: v?.id || uid('var'), commodityId:b.querySelector('#v-com').value,
            name:b.querySelector('#v-name').value||'Tanpa nama', producer:b.querySelector('#v-prod').value,
            characteristics:b.querySelector('#v-char').value, harvestAgeDays:num(b.querySelector('#v-age').value),
            targetProductionKg:num(b.querySelector('#v-target').value) });
          close(); toast('Tersimpan'); Settings.renderVarieties(container);
        };
      });
  },

  /* ---- Master Pupuk ---- */
  async renderFertilizers(container){
    const list = await getAll('fertilizers');
    container.innerHTML = `
      <h2 class="page-title">Pupuk</h2>
      <button class="btn" id="fer-add" style="margin-bottom:10px">+ Tambah Pupuk</button>
      ${list.map(f=>`<div class="card"><div class="list-row" style="border:0;padding:0">
        <div><strong>${esc(f.name)}</strong><small>N:${f.N} P:${f.P2O5} K:${f.K2O} Ca:${f.Ca} Mg:${f.Mg} S:${f.S}</small>
          <div class="tiny muted">${esc(f.producer||'')} · ${rupiah(f.price)} / ${f.packageWeightKg||1} kg</div>
        </div>
        <div style="display:flex;gap:4px"><button class="btn small secondary" data-edit="${f.id}">Edit</button><button class="btn small danger" data-del="${f.id}">✕</button></div>
      </div></div>`).join('') || '<div class="empty">Belum ada pupuk.</div>'}`;
    $('#fer-add').onclick = ()=> Settings._formFertilizer(null, container);
    container.querySelectorAll('[data-edit]').forEach(b=>b.onclick=async()=>{
      const f = await getOne('fertilizers', b.dataset.edit); Settings._formFertilizer(f, container);
    });
    container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus pupuk?', async ()=>{
      await del('fertilizers', b.dataset.del); toast('Terhapus'); Settings.renderFertilizers(container);
    }));
  },
  _formFertilizer(f, container){
    const fields = ['N','P2O5','K2O','Ca','Mg','S','Fe','Mn','Zn','Cu','B','Mo'];
    modal(f?'Edit Pupuk':'Tambah Pupuk', `
      <div class="field"><label>Nama produk</label><input id="f-name" value="${esc(f?.name||'')}"></div>
      <div class="field"><label>Produsen</label><input id="f-prod" value="${esc(f?.producer||'')}"></div>
      <div class="field-row-3">${fields.map(k=>`<div class="field"><label>${k} (%)</label><input id="f-${k}" type="number" step="0.01" value="${f?.[k]||0}"></div>`).join('')}</div>
      <div class="field-row">
        <div class="field"><label>Harga (Rp)</label><input id="f-price" type="number" value="${f?.price||0}"></div>
        <div class="field"><label>Berat kemasan (kg)</label><input id="f-weight" type="number" step="0.1" value="${f?.packageWeightKg||1}"></div>
      </div>
      <button class="btn" id="f-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#f-save').onclick = async ()=>{
          const obj = { id: f?.id || uid('fer'), name:b.querySelector('#f-name').value||'Pupuk',
            producer:b.querySelector('#f-prod').value, price:num(b.querySelector('#f-price').value),
            packageWeightKg:num(b.querySelector('#f-weight').value) };
          fields.forEach(k=> obj[k] = num(b.querySelector('#f-'+k).value));
          await put('fertilizers', obj); close(); toast('Tersimpan'); Settings.renderFertilizers(container);
        };
      });
  },

  /* ---- Master Pestisida ---- */
  async renderPesticides(container){
    const list = await getAll('pesticides');
    container.innerHTML = `
      <h2 class="page-title">Pestisida</h2>
      <button class="btn" id="pes-add" style="margin-bottom:10px">+ Tambah Pestisida</button>
      ${list.map(p=>`<div class="card"><div class="list-row" style="border:0;padding:0">
        <div><strong>${esc(p.name)}</strong><small>${esc(p.activeIngredient)} · ${esc(p.formulation)} · Target: ${esc(p.target)}</small>
        <div class="tiny muted">Dosis: ${esc(p.labelDose)} · PHI: ${p.phiDays||'—'} hari</div></div>
        <div style="display:flex;gap:4px"><button class="btn small secondary" data-edit="${p.id}">Edit</button><button class="btn small danger" data-del="${p.id}">✕</button></div>
      </div></div>`).join('') || '<div class="empty">Belum ada pestisida.</div>'}`;
    $('#pes-add').onclick = ()=> Settings._formPesticide(null, container);
    container.querySelectorAll('[data-edit]').forEach(b=>b.onclick=async()=>{
      const p = await getOne('pesticides', b.dataset.edit); Settings._formPesticide(p, container);
    });
    container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus pestisida?', async ()=>{
      await del('pesticides', b.dataset.del); toast('Terhapus'); Settings.renderPesticides(container);
    }));
  },
  _formPesticide(p, container){
    modal(p?'Edit Pestisida':'Tambah Pestisida', `
      <div class="field"><label>Nama produk</label><input id="p-name" value="${esc(p?.name||'')}"></div>
      <div class="field"><label>Bahan aktif</label><input id="p-ai" value="${esc(p?.activeIngredient||'')}"></div>
      <div class="field-row">
        <div class="field"><label>Konsentrasi</label><input id="p-conc" value="${esc(p?.concentration||'')}"></div>
        <div class="field"><label>Formulasi</label><input id="p-form" value="${esc(p?.formulation||'')}"></div>
      </div>
      <div class="field"><label>Sasaran</label><input id="p-target" value="${esc(p?.target||'')}"></div>
      <div class="field-row">
        <div class="field"><label>Dosis label</label><input id="p-dose" value="${esc(p?.labelDose||'')}"></div>
        <div class="field"><label>Interval (hari)</label><input id="p-int" type="number" value="${p?.intervalDays||7}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>PHI (hari)</label><input id="p-phi" type="number" value="${p?.phiDays||0}"></div>
        <div class="field"><label>Info keamanan</label><input id="p-safe" value="${esc(p?.safety||'')}"></div>
      </div>
      <button class="btn" id="p-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#p-save').onclick = async ()=>{
          await put('pesticides', { id:p?.id||uid('pes'), name:b.querySelector('#p-name').value||'Pestisida',
            activeIngredient:b.querySelector('#p-ai').value, concentration:b.querySelector('#p-conc').value,
            formulation:b.querySelector('#p-form').value, target:b.querySelector('#p-target').value,
            labelDose:b.querySelector('#p-dose').value, intervalDays:num(b.querySelector('#p-int').value),
            phiDays:num(b.querySelector('#p-phi').value), safety:b.querySelector('#p-safe').value });
          close(); toast('Tersimpan'); Settings.renderPesticides(container);
        };
      });
  },

  /* ---- Master ZPT ---- */
  async renderZpts(container){
    const list = await getAll('zpts');
    container.innerHTML = `
      <h2 class="page-title">ZPT</h2>
      <button class="btn" id="zpt-add" style="margin-bottom:10px">+ Tambah ZPT</button>
      ${list.map(z=>`<div class="card"><div class="list-row" style="border:0;padding:0">
        <div><strong>${esc(z.name)}</strong><small>${esc(z.activeIngredient)} · ${esc(z.function)}</small></div>
        <button class="btn small danger" data-del="${z.id}">✕</button>
      </div></div>`).join('') || '<div class="empty">Belum ada ZPT.</div>'}`;
    $('#zpt-add').onclick = ()=> modal('Tambah ZPT', `
      <div class="field"><label>Nama</label><input id="z-name"></div>
      <div class="field"><label>Bahan aktif</label><input id="z-ai"></div>
      <div class="field"><label>Konsentrasi</label><input id="z-conc"></div>
      <div class="field"><label>Fungsi</label><textarea id="z-func"></textarea></div>
      <div class="field"><label>Dosis referensi</label><input id="z-dose"></div>
      <button class="btn" id="z-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#z-save').onclick = async ()=>{
          await put('zpts', { id:uid('zpt'), name:b.querySelector('#z-name').value||'ZPT',
            activeIngredient:b.querySelector('#z-ai').value, concentration:b.querySelector('#z-conc').value,
            function:b.querySelector('#z-func').value, referenceDose:b.querySelector('#z-dose').value });
          close(); toast('Tersimpan'); Settings.renderZpts(container);
        };
      });
    container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus ZPT?', async ()=>{
      await del('zpts', b.dataset.del); toast('Terhapus'); Settings.renderZpts(container);
    }));
  },

  /* ---- SOP ---- */
async renderSOP(container){
  const sops = await getAll('sops');
  container.innerHTML = `
    <h2 class="page-title">SOP Management</h2>
    <p class="subtitle">Standard Operating Procedure untuk kegiatan budidaya.</p>
    <button class="btn" id="sop-add" style="margin-bottom:10px">+ Tambah SOP</button>
    ${sops.map(s=>`<div class="card"><div class="list-row" style="border:0;padding:0">
      <div><strong>${esc(s.name)}</strong><small>${s.isTemplate?'Template':'Custom'} · ID: ${s.id.slice(0,10)}</small></div>
      <div style="display:flex;gap:4px"><button class="btn small secondary" data-open="${s.id}">Buka</button><button class="btn small danger" data-del="${s.id}">✕</button></div>
    </div></div>`).join('') || '<div class="empty">Belum ada SOP.</div>'}`;
  
  // PERBAIKAN: Tambahkan parameter container saat memanggil _formSOP
  $('#sop-add').onclick = ()=> Settings._formSOP(null, container);
  
  container.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>Router.go('sop-detail', {id:b.dataset.open}));
  container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus SOP dan item-nya?', async ()=>{
    const items = await getByIndex('sop_items','sopId', b.dataset.del);
    for(const it of items) await del('sop_items', it.id);
    await del('sops', b.dataset.del); toast('Terhapus'); Settings.renderSOP(container);
  }));
},

async _formSOP(s, container){
  const coms = await getAll('commodities');
  const vars = await getAll('varieties');
  modal(s?'Edit SOP':'Tambah SOP', `
    <div class="field"><label>Nama SOP</label><input id="s-name" value="${esc(s?.name||'')}"></div>
    <div class="field"><label>Komoditas</label><select id="s-com"><option value="">— Semua —</option>${coms.map(c=>`<option value="${c.id}" ${s?.commodityId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Varietas</label><select id="s-var"><option value="">— Semua —</option>${vars.map(v=>`<option value="${v.id}" ${s?.varietyId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Deskripsi</label><textarea id="s-desc">${esc(s?.description||'')}</textarea></div>
    <button class="btn" id="s-save">Simpan</button>`, (b,close)=>{
      b.querySelector('#s-save').onclick = async ()=>{
        const obj = { id: s?.id||uid('sop'), name:b.querySelector('#s-name').value||'SOP Baru',
          commodityId:b.querySelector('#s-com').value||null, varietyId:b.querySelector('#s-var').value||null,
          description:b.querySelector('#s-desc').value, isTemplate:false };
        await put('sops', obj); 
        close(); 
        toast('SOP tersimpan'); 
        Settings.renderSOP(container);
      };
    });
},
  async renderSOPDetail(container, sopId){
  // Pastikan sopId tidak kosong
  if(!sopId) {
    container.innerHTML = '<div class="notice red-notice">ID SOP tidak valid.</div>'; 
    return; 
  }

  const sop = await getOne('sops', sopId);
  if(!sop){ 
    container.innerHTML = '<div class="notice red-notice">SOP tidak ditemukan di database.</div>'; 
    return; 
  }
  
  const items = await SopEngine.items(sopId);
  container.innerHTML = `
    <button class="btn small outline" id="sop-back" style="margin-bottom:12px">← Kembali ke Daftar SOP</button>
    <h2 class="page-title">${esc(sop.name)}</h2>
    <p class="subtitle">${esc(sop.description||'Belum ada deskripsi')}</p>
    <button class="btn" id="sop-item-add" style="margin-bottom:10px">+ Tambah Item SOP</button>
    ${items.length ? items.map(it=>`<div class="card">
      <div class="list-row" style="border:0;padding:0">
        <div><strong>${esc(it.name)}</strong><small>HST ${it.hstStart}-${it.hstEnd} · ${esc(it.phase||'-')} · ${esc(it.appType||'-')}</small>
        <div class="tiny muted">${esc(it.productName||'-')} ${esc(it.dose||'')} · ${esc(it.frequency||'-')} · ${esc(it.waterVolume||'')}</div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn small secondary" data-edit="${it.id}">Edit</button>
          <button class="btn small danger" data-del="${it.id}">✕</button>
        </div>
      </div></div>`).join('') : '<div class="empty">Belum ada item. Klik tombol di atas untuk menambahkan.</div>'}`;
  
  $('#sop-back').onclick = ()=> Router.go('sop');
  $('#sop-item-add').onclick = ()=> Settings._formSOPItem(null, sopId, container);
  
  container.querySelectorAll('[data-edit]').forEach(b=>b.onclick=async()=>{
    const it = await getOne('sop_items', b.dataset.edit); 
    Settings._formSOPItem(it, sopId, container);
  });
  
  container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus item SOP?', async ()=>{
    await del('sop_items', b.dataset.del); 
    toast('Terhapus'); 
    Settings.renderSOPDetail(container, sopId);
  }));
},

_formSOPItem(it, sopId, container){
  modal(it?'Edit Item':'Tambah Item', `
    <div class="field"><label>Nama kegiatan</label><input id="si-name" value="${esc(it?.name||'')}" placeholder="Contoh: Pemupukan Dasar"></div>
    <div class="field-row">
      <div class="field"><label>HST awal</label><input id="si-hs" type="number" value="${it?.hstStart||0}"></div>
      <div class="field"><label>HST akhir</label><input id="si-he" type="number" value="${it?.hstEnd||0}"></div>
    </div>
    <div class="field"><label>Fase</label><input id="si-phase" value="${esc(it?.phase||'')}" placeholder="Contoh: Vegetatif"></div>
    <div class="field"><label>Jenis aplikasi</label><select id="si-app">
      <option ${it?.appType==='Semprot'?'selected':''}>Semprot</option>
      <option ${it?.appType==='Kocor'?'selected':''}>Kocor</option>
      <option ${it?.appType==='Tabur'?'selected':''}>Tabur</option>
      <option ${it?.appType==='Fertigasi'?'selected':''}>Fertigasi</option>
      <option ${it?.appType==='Hidroponik'?'selected':''}>Hidroponik</option>
    </select></div>
    <div class="field"><label>Produk</label><input id="si-prod" value="${esc(it?.productName||'')}"></div>
    <div class="field-row">
      <div class="field"><label>Dosis</label><input id="si-dose" value="${esc(it?.dose||'')}" placeholder="Contoh: 5 g/L"></div>
      <div class="field"><label>Frekuensi</label><input id="si-freq" value="${esc(it?.frequency||'')}" placeholder="Contoh: 1x, 7 hari"></div>
    </div>
    <div class="field"><label>Volume air</label><input id="si-water" value="${esc(it?.waterVolume||'')}" placeholder="Contoh: 250 ml/tanaman"></div>
    <div class="field"><label>Catatan teknis</label><textarea id="si-note">${esc(it?.note||'')}</textarea></div>
    <button class="btn" id="si-save">Simpan</button>`, (b,close)=>{
      b.querySelector('#si-save').onclick = async ()=>{
        await put('sop_items', { id: it?.id||uid('si'), sopId,
          name:b.querySelector('#si-name').value||'Kegiatan',
          hstStart:num(b.querySelector('#si-hs').value), hstEnd:num(b.querySelector('#si-he').value),
          phase:b.querySelector('#si-phase').value, appType:b.querySelector('#si-app').value,
          productName:b.querySelector('#si-prod').value, dose:b.querySelector('#si-dose').value,
          frequency:b.querySelector('#si-freq').value, waterVolume:b.querySelector('#si-water').value,
          note:b.querySelector('#si-note').value });
        close(); 
        toast('Item SOP tersimpan'); 
        Settings.renderSOPDetail(container, sopId);
      };
    });
}
};