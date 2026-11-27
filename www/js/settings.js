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
        <h3>Penyimpanan Perangkat</h3>
        <p class="tiny muted" id="storage-info">Memeriksa kapasitas penyimpanan…</p>
        <button class="btn small secondary" id="set-storage-check">Periksa Penyimpanan</button>
      </div>
      <div class="card">
        <h3>Backup & Restore</h3>
        <p class="tiny muted">Backup JSON dilengkapi manifest jumlah data dan checksum SHA-256. Pada APK, file disimpan ke Documents/ARKEJA FARM; pada PWA masuk ke Download.</p>
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
        Revisi 4.16 · Tahap 12A · Data disimpan lokal di perangkat ini.<br>
        Tidak ada backend, tidak ada pengiriman data.</p>
      </div>`;
    container.querySelectorAll('[data-goto]').forEach(b=>b.onclick = ()=> Router.go(b.dataset.goto));

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
    $('#pwa-install').onclick = async ()=>{
      if(deferredPrompt){ deferredPrompt.prompt(); const r = await deferredPrompt.userChoice; toast(r.outcome==='accepted'?'Aplikasi diinstall':'Install dibatalkan'); deferredPrompt = null; }
      else toast('Install via menu browser → Add to Home Screen');
    };
    const refreshStorageInfo=async()=>{
      const el=$('#storage-info'); if(!el)return;
      const status=await storageStatus();
      if(!status.supported){el.textContent='Informasi kuota tidak didukung browser ini. Backup secara berkala.';return;}
      if(status.error){el.textContent='Kapasitas penyimpanan belum dapat diperiksa. Backup secara berkala.';return;}
      const mb=n=>(n/1024/1024).toLocaleString('id-ID',{maximumFractionDigits:1});
      el.textContent=`Terpakai sekitar ${mb(status.usage)} MB dari ${mb(status.quota)} MB. Sisa terdeteksi ${mb(status.available)} MB. Angka merupakan perkiraan browser.`;
    };
    $('#set-storage-check').onclick=refreshStorageInfo;
    refreshStorageInfo();
    $('#set-backup').onclick = async ()=>{
      try { const data=await backupAll(); const saved=await saveBackupFile(data,`arkeja-backup-${todayISO()}.json`);
        toast(`Backup berhasil disimpan di ${saved.location||'Download'}`); }
      catch(err){console.error(err);toast('Backup gagal: '+(err.message||'kesalahan'));}
    };
    $('#set-restore').onclick = ()=> $('#set-restore-file').click();
    $('#set-restore-file').onchange = async e => {
      const f = e.target.files[0]; if(!f) return;
      try {
        const data = JSON.parse(await f.text()); validateBackupPayload(data);
        const verification=await verifyBackupIntegrity(data), summary=verification.summary;
        const detail=`${summary.totalRecords} baris data dari ${summary.storeCount} kelompok penyimpanan. `+
          (verification.legacy?'Backup format lama (tanpa checksum SHA-256). ':'Checksum SHA-256 valid. ')+
          'Restore akan mengganti seluruh data lokal. Lanjutkan?';
        confirmDialog(detail, async ()=>{
          try { const safety=await backupAll(); const saved=await saveBackupFile(safety,`arkeja-pre-restore-${todayISO()}.json`);
            await restoreAll(data); toast(`Data dipulihkan. Backup pengaman: ${saved.location||'Download'}.`); setTimeout(()=>location.reload(),600); }
          catch(err) { console.error(err); toast('Restore gagal: ' + (err.message || 'kesalahan data')); }
        });
      } catch(err){ console.error(err); toast('Backup ditolak: '+(err.message||'file JSON tidak valid')); }
      e.target.value = '';
    };
    $('#set-reset').onclick = ()=> confirmDialog('Yakin hapus SEMUA data? Disarankan membuat backup terlebih dahulu. Penghapusan tidak dapat dibatalkan.', async ()=>{
      try{
        await clearAllData();
        toast('Seluruh data ARKEJA FARM berhasil dihapus');
        setTimeout(()=>location.reload(),600);
      }catch(error){console.error('Reset data gagal:',error);toast('Reset gagal: '+(error.message||error));}
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
        ${c.phases ? `<div class="tiny muted" style="margin-top:4px">${c.phases.map(p=>esc(p.name)+' ('+p.startDay+'-'+p.endDay+'d)').join(' · ')}</div>`:''}
      </div>`).join('') || '<div class="empty">Belum ada komoditas.</div>'}`;
    $('#com-add').onclick = ()=> Settings._formCommodity(null, container);
    container.querySelectorAll('[data-edit]').forEach(b=>b.onclick=async()=>{
      const c = await getOne('commodities', b.dataset.edit); Settings._formCommodity(c, container);
    });
    container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus komoditas?', async ()=>{
      try{await deleteMasterIfUnreferenced('commodities', b.dataset.del); toast('Komoditas dihapus'); await Settings.renderCommodities(container);}
      catch(error){console.error(error);toast(error.message||'Komoditas tidak dapat dihapus');}
    }));
  },
  _formCommodity(c, container){
    const isEdit = !!c;
    modal(isEdit?'Edit Komoditas':'Tambah Komoditas', `
      <div class="field"><label>Nama</label><input id="c-name" value="${esc(c?.name||'')}"></div>
      <div class="field"><label>Kategori</label><input id="c-cat" value="${esc(c?.category||'')}" placeholder="Sayur, Buah, Pangan..."></div>
      <div class="field"><label>Nama ilmiah</label><input id="c-sci" value="${esc(c?.scientific||'')}"></div>
      <div class="field"><label>Tipe siklus tanaman</label><select id="c-cycle"><option value="annual">Semusim / annual</option><option value="perennial">Tahunan / perennial</option><option value="production">Siklus produksi berulang</option></select></div>
      <div class="field"><label>Dasar perhitungan umur</label><select id="c-age-basis"><option value="plantingDate">Tanggal tanam</option><option value="transplantDate">Tanggal pindah tanam</option><option value="cycleStartDate">Awal siklus / pemangkasan</option></select></div>
      <div class="field"><label>Umur/target siklus (hari)</label><input id="c-life" type="number" min="1" value="${c?.lifespanDays||90}"></div>
      <div class="field"><label>Satuan hasil</label><input id="c-unit" value="${esc(c?.yieldUnit||'kg')}"></div>
      <div class="field"><label>Sistem budidaya</label><input id="c-sys" value="${esc(c?.cultivationSystem||'')}"></div>
      <div class="field"><label>Fase pertumbuhan (Nama | Hari awal | Hari akhir; dihitung dari dasar umur profil)</label><textarea id="c-phases" rows="7">${esc((c?.phases?.length ? c.phases : CropEngine.defaultPhases(c?.lifespanDays||90)).map(p=>`${p.name} | ${p.startDay} | ${p.endDay}`).join('\n'))}</textarea><small class="muted">Rentang fase tidak boleh tumpang tindih. Contoh: Vegetatif | 15 | 30. Label HST/HSTP/HSP mengikuti dasar umur musim.</small></div>
      <button class="btn" id="c-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#c-cycle').value=c?.cycleType||'annual';
        b.querySelector('#c-age-basis').value=c?.ageBasis||'plantingDate';
        b.querySelector('#c-save').onclick = async ()=>{
          const name=b.querySelector('#c-name').value.trim();
          const lifespanDays=Number(b.querySelector('#c-life').value);
          const lines=b.querySelector('#c-phases').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
          const phases=[];
          for(const line of lines){
            const parts=line.split('|').map(x=>x.trim());
            const startDay=Number(parts[1]), endDay=Number(parts[2]);
            if(parts.length!==3 || !parts[0] || !Number.isInteger(startDay) || !Number.isInteger(endDay) || startDay<0 || endDay<startDay){toast('Format fase tidak valid. Gunakan Nama | HST awal | HST akhir.');return;}
            phases.push({name:parts[0],startDay,endDay});
          }
          phases.sort((a,b)=>a.startDay-b.startDay);
          for(let i=1;i<phases.length;i++) if(phases[i].startDay<=phases[i-1].endDay){toast('Rentang fase tumpang tindih. Periksa kembali HST awal dan akhir.');return;}
          if(!name || !Number.isInteger(lifespanDays) || lifespanDays<1 || !phases.length){toast('Nama, umur siklus, dan minimal satu fase wajib valid.');return;}
          if(phases[0].startDay!==0 || phases[phases.length-1].endDay>lifespanDays){toast('Fase pertama harus dimulai HST 0 dan fase terakhir tidak boleh melewati umur/target siklus.');return;}
          for(let i=1;i<phases.length;i++) if(phases[i].startDay!==phases[i-1].endDay+1){toast('Rentang fase harus berurutan tanpa celah.');return;}
          const obj = { id:c?.id||uid('com'), name,
            category:b.querySelector('#c-cat').value, scientific:b.querySelector('#c-sci').value,
            lifespanDays, yieldUnit:b.querySelector('#c-unit').value,
            cultivationSystem:b.querySelector('#c-sys').value, cycleType:b.querySelector('#c-cycle').value,
            ageBasis:b.querySelector('#c-age-basis').value, phases };
          try{await put('commodities',obj);close();toast('Profil komoditas tersimpan');await Settings.renderCommodities(container);}
          catch(error){console.error(error);toast('Gagal menyimpan profil: '+(error.message||error));}
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
      try{await deleteMasterIfUnreferenced('varieties', b.dataset.del); toast('Varietas dihapus'); await Settings.renderVarieties(container);}
      catch(error){console.error(error);toast(error.message||'Varietas tidak dapat dihapus');}
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
      try{await deleteMasterIfUnreferenced('fertilizers', b.dataset.del); toast('Pupuk dihapus'); await Settings.renderFertilizers(container);}
      catch(error){console.error(error);toast(error.message||'Pupuk tidak dapat dihapus');}
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
      await deleteMasterIfUnreferenced('pesticides', b.dataset.del); toast('Terhapus'); Settings.renderPesticides(container);
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
        <div><strong>${esc(z.name)}</strong><small>${esc(z.activeIngredient||'')} · ${esc(z.function||'')}</small>
          <div class="tiny muted">Konsentrasi: ${esc(z.concentration||'—')} · Dosis referensi: ${esc(z.referenceDose||'—')}</div></div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn small secondary" data-edit-zpt="${esc(z.id)}">Edit</button>
          <button class="btn small danger" data-del-zpt="${esc(z.id)}">✕</button>
        </div>
      </div></div>`).join('') || '<div class="empty">Belum ada ZPT.</div>'}`;

    $('#zpt-add').onclick = ()=> Settings._formZpt(null, container);
    container.querySelectorAll('[data-edit-zpt]').forEach(b=>b.onclick=async()=>{
      try{
        const z = await getOne('zpts', b.dataset.editZpt);
        if(!z){ toast('Data ZPT tidak ditemukan'); return; }
        Settings._formZpt(z, container);
      }catch(error){ console.error(error); toast('Gagal membuka ZPT: '+(error.message||error)); }
    });
    container.querySelectorAll('[data-del-zpt]').forEach(b=>b.onclick=()=>confirmDialog('Hapus ZPT?', async ()=>{
      try{
        await deleteMasterIfUnreferenced('zpts', b.dataset.delZpt);
        toast('ZPT terhapus');
        await Settings.renderZpts(container);
      }catch(error){ console.error(error); toast('Gagal menghapus ZPT: '+(error.message||error)); }
    }));
  },

  _formZpt(z, container){
    modal(z?'Edit ZPT':'Tambah ZPT', `
      <div class="field"><label>Nama</label><input id="z-name" maxlength="120" value="${esc(z?.name||'')}"></div>
      <div class="field"><label>Bahan aktif</label><input id="z-ai" value="${esc(z?.activeIngredient||'')}"></div>
      <div class="field"><label>Konsentrasi</label><input id="z-conc" value="${esc(z?.concentration||'')}"></div>
      <div class="field"><label>Fungsi</label><textarea id="z-func">${esc(z?.function||'')}</textarea></div>
      <div class="field"><label>Dosis referensi</label><input id="z-dose" value="${esc(z?.referenceDose||'')}"></div>
      <button class="btn" id="z-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#z-save').onclick = async ()=>{
          const save = b.querySelector('#z-save');
          if(save.disabled) return;
          const name = b.querySelector('#z-name').value.trim();
          if(!name){ toast('Nama ZPT wajib diisi'); return; }
          save.disabled = true;
          try{
            await put('zpts', {
              id: z?.id || uid('zpt'),
              name,
              activeIngredient: b.querySelector('#z-ai').value.trim(),
              concentration: b.querySelector('#z-conc').value.trim(),
              function: b.querySelector('#z-func').value.trim(),
              referenceDose: b.querySelector('#z-dose').value.trim(),
              ...(z?.createdAt ? {createdAt:z.createdAt} : {}),
              updatedAt: todayISO()
            });
            close();
            toast(z?'Perubahan ZPT tersimpan':'ZPT tersimpan');
            await Settings.renderZpts(container);
          }catch(error){
            console.error(error);
            toast('ZPT gagal disimpan: '+(error.message||error));
            save.disabled = false;
          }
        };
      });
  },

  /* ---- SOP ---- */
  async renderSOP(container){
    const [owned,recommendations,seasons]=await Promise.all([SopEngine.listOwned(),SopEngine.listRecommendations(),getAll('seasons')]);
    const activeId=Prefs.get('activeSeasonId',null);
    const seasonOptions=seasons.filter(x=>x.status!=='selesai');
    const selectedSeason=seasonOptions.find(x=>String(x.id)===String(activeId))||seasonOptions[0]||null;
    container.innerHTML = `
      <h2 class="page-title">Manajemen SOP</h2>
      <p class="subtitle">SOP manual tetap menjadi milik Anda. Rekomendasi sistem hanya sebagai referensi dan tidak mengubah SOP maupun jadwal secara otomatis.</p>
      <div class="btn-row" style="margin-bottom:12px">
        <button class="btn small" data-sop-tab="owned">SOP Saya (${owned.length})</button>
        <button class="btn small secondary" data-sop-tab="recommended">Rekomendasi (${recommendations.length})</button>
        <button class="btn small outline" data-sop-tab="evaluation">Evaluasi SOP</button>
      </div>
      <section data-sop-panel="owned">
        <div class="btn-row"><button class="btn" id="sop-add">+ Buat SOP Manual</button></div>
        ${owned.map(s=>`<div class="card"><div class="list-row" style="border:0;padding:0">
          <div><strong>${esc(s.name)}</strong><small>${s.origin==='recommendation'?'Salinan dari rekomendasi':'Dibuat manual'} · ${esc(String(s.id).slice(0,10))}</small></div>
          <div style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn small secondary" data-open="${esc(s.id)}">Buka</button><button class="btn small outline" data-edit-sop="${esc(s.id)}">Edit</button><button class="btn small danger" data-del-sop="${esc(s.id)}">✕</button></div>
        </div></div>`).join('') || '<div class="empty">Belum ada SOP milik Anda. Buat SOP manual atau salin rekomendasi sistem.</div>'}
      </section>
      <section data-sop-panel="recommended" hidden>
        <div class="notice">Sumber rekomendasi saat ini adalah SOP template yang tersedia di aplikasi. Sistem tidak membuat dosis atau resep agronomi baru tanpa data tervalidasi.</div>
        ${recommendations.map(s=>`<div class="card"><strong>${esc(s.name)}</strong><p class="tiny muted">${esc(s.description||'Template SOP')}</p><div class="btn-row"><button class="btn small secondary" data-preview-recommendation="${esc(s.id)}">Pratinjau & Evaluasi</button></div></div>`).join('') || '<div class="empty">Belum ada template rekomendasi yang tersedia.</div>'}
      </section>
      <section data-sop-panel="evaluation" hidden>
        <div class="field"><label>Musim tanam untuk evaluasi</label><select id="sop-eval-season">${seasonOptions.map(x=>`<option value="${esc(x.id)}" ${selectedSeason&&String(x.id)===String(selectedSeason.id)?'selected':''}>${esc(x.name||x.commodityName||'Musim tanam')}</option>`).join('')}</select></div>
        <button class="btn" id="sop-evaluate" ${seasonOptions.length?'':'disabled'}>Evaluasi SOP untuk Musim Ini</button>
        <div id="sop-evaluation-result" style="margin-top:12px">${seasonOptions.length?'Pilih musim lalu jalankan evaluasi.':'Belum ada musim tanam aktif/tersedia.'}</div>
      </section>`;
    const showTab=tab=>{
      container.querySelectorAll('[data-sop-panel]').forEach(p=>p.hidden=p.dataset.sopPanel!==tab);
      container.querySelectorAll('[data-sop-tab]').forEach(b=>{const active=b.dataset.sopTab===tab;b.classList.toggle('secondary',!active);b.classList.toggle('outline',!active);});
    };
    container.querySelectorAll('[data-sop-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.sopTab));
    $('#sop-add').onclick=()=>Settings._formSOP(null,container);
    container.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>Router.go('sop-detail',{id:b.dataset.open}));
    container.querySelectorAll('[data-edit-sop]').forEach(b=>b.onclick=async()=>{const sop=await getOne('sops',b.dataset.editSop);if(sop)Settings._formSOP(sop,container);});
    container.querySelectorAll('[data-del-sop]').forEach(b=>b.onclick=()=>confirmDialog('Hapus SOP dan item-nya? Jadwal kegiatan yang sudah dibuat akan tetap disimpan sebagai riwayat.',async()=>{
      try{await deleteSOPCascade(b.dataset.delSop);toast('SOP dihapus; jadwal lama dipertahankan');await Settings.renderSOP(container);}catch(error){console.error(error);toast('Gagal menghapus SOP: '+(error.message||error));}
    }));
    container.querySelectorAll('[data-preview-recommendation]').forEach(b=>b.onclick=()=>Settings._previewRecommendation(b.dataset.previewRecommendation,container));
    const evaluate=async()=>{
      const seasonId=container.querySelector('#sop-eval-season')?.value;
      if(!seasonId)return;
      const result=container.querySelector('#sop-evaluation-result');result.innerHTML='<p class="muted">Mengevaluasi…</p>';
      try{
        const report=await SopEngine.evaluateForSeason(seasonId);
        const context=`${esc(report.season.name||'Musim tanam')} · ${esc(report.profile?.name||report.season.commodityName||'Komoditas')} · ${esc(report.phase?.name||'Fase belum diketahui')} · ${esc(report.age)} ${esc(CropEngine.ageLabel(report.season))} · Populasi ${fmtNum(report.population,0)} tanaman · Luas ${fmtNum(report.area,2)} m²`;
        const cards=report.owned.map(x=>`<div class="card"><strong>${esc(x.sop.name)}</strong><p class="tiny">Kesesuaian ${x.compatible?'sesuai':'perlu penyesuaian'} · ${x.items.length} item · ${x.currentCount} item aktif pada umur sekarang · ${x.phaseCount} item fase saat ini</p>${x.reasons.length?`<ul class="tiny">${x.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:'<p class="tiny">Tidak ditemukan catatan evaluasi dasar.</p>'}<button class="btn small secondary" data-eval-open="${esc(x.sop.id)}">Buka SOP</button></div>`).join('');
        result.innerHTML=`<div class="notice">Konteks evaluasi: ${context}. Evaluasi ini memeriksa kecocokan identitas komoditas/varietas, fase, umur, kelengkapan dosis, dan cakupan item. Bukan validasi agronomi atau rekomendasi dosis.</div>${cards||'<div class="empty">Belum ada SOP Saya untuk dievaluasi.</div>'}<h3>Template rekomendasi yang tersedia</h3>${report.recommendations.filter(x=>x.compatible).map(x=>`<div class="card"><strong>${esc(x.sop.name)}</strong><p class="tiny">${x.items.length} item · ${x.phaseCount} item pada fase saat ini${x.missingDoseCount?` · ${x.missingDoseCount} item tanpa dosis`:''}</p><button class="btn small secondary" data-eval-preview="${esc(x.sop.id)}">Pratinjau</button></div>`).join('')||'<p class="tiny muted">Tidak ada template yang cocok dengan komoditas/varietas musim ini.</p>'}`;
        result.querySelectorAll('[data-eval-open]').forEach(btn=>btn.onclick=()=>Router.go('sop-detail',{id:btn.dataset.evalOpen}));
        result.querySelectorAll('[data-eval-preview]').forEach(btn=>btn.onclick=()=>Settings._previewRecommendation(btn.dataset.evalPreview,container));
      }catch(error){result.innerHTML=`<div class="notice red-notice">Evaluasi gagal: ${esc(error.message||error)}</div>`;}
    };
    $('#sop-evaluate')?.addEventListener('click',evaluate);
  },
  async _previewRecommendation(sopId,container){
    const source=await getOne('sops',sopId);if(!source||source.isTemplate!==true)return toast('Template rekomendasi tidak ditemukan');
    const items=await SopEngine.items(sopId);
    const [commodities,varieties]=await Promise.all([getAll('commodities'),getAll('varieties')]);
    const com=commodities.find(x=>String(x.id)===String(source.commodityId));
    const variety=varieties.find(x=>String(x.id)===String(source.varietyId));
    modal('Pratinjau Rekomendasi SOP',`<h3>${esc(source.name)}</h3><p class="tiny muted">${esc(source.description||'Template sistem')} · ${esc(com?.name||'Semua komoditas')} · ${esc(variety?.name||'Semua varietas')}</p><div class="notice">Periksa seluruh kegiatan, dosis, rentang umur, dan kecocokan tanaman sebelum menyalin. Menyalin tidak membuat jadwal kegiatan.</div>${items.map(it=>`<div class="card"><strong>${esc(it.name)}</strong><p class="tiny">${esc(it.phase||'Fase belum ditentukan')} · HST ${esc(it.hstStart)}–${esc(it.hstEnd)} · ${esc(it.appType||'Jenis aplikasi belum ditentukan')}</p><p class="tiny">${esc((it.products||[]).map(x=>`${x.name}${x.dose?' — '+x.dose:''}`).join('; ')||it.productName||'Produk/dosis belum dicantumkan')}</p><p class="tiny muted">Frekuensi: ${esc(it.frequency||'—')} · Volume: ${esc(it.waterVolume||'—')}</p></div>`).join('')||'<div class="empty">Template belum memiliki item.</div>'}<div class="btn-row"><button class="btn secondary" data-cancel>Batalkan</button><button class="btn" data-adopt ${items.length?'':'disabled'}>Salin ke SOP Saya</button></div>`,(body,close)=>{
      body.querySelector('[data-cancel]').onclick=close;
      body.querySelector('[data-adopt]').onclick=async()=>{
        const button=body.querySelector('[data-adopt]');if(button.disabled)return;button.disabled=true;
        try{const copy=await SopEngine.adoptRecommendation(sopId);close();toast('Rekomendasi disalin. SOP sumber tetap utuh; jadwal belum dibuat.');await Settings.renderSOP(container);Router.current='sop';}
        catch(error){button.disabled=false;toast('Gagal menyalin SOP: '+(error.message||error));}
      };
    });
  },
  async _formSOP(s, container){
    const coms = await getAll('commodities');
    const vars = await getAll('varieties');
    const currentCom = s?.commodityId ?? '';
    modal(s?'Edit SOP':'Tambah SOP', `
      <div class="field"><label>Nama SOP</label><input id="s-name" maxlength="100" value="${esc(s?.name||'')}"></div>
      <div class="field"><label>Komoditas</label><select id="s-com"><option value="">— Semua —</option>${coms.map(c=>`<option value="${esc(c.id)}" ${String(currentCom)===String(c.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Varietas</label><select id="s-var"><option value="">— Semua —</option></select></div>
      <div class="field"><label>Deskripsi</label><textarea id="s-desc">${esc(s?.description||'')}</textarea></div>
      <button class="btn" id="s-save">Simpan</button>`, (b,close)=>{
        const comSelect = b.querySelector('#s-com');
        const varSelect = b.querySelector('#s-var');
        const updateVars = ()=>{
          const comId = comSelect.value;
          const filtered = vars.filter(v=>!comId || String(v.commodityId)===String(comId));
          varSelect.innerHTML = '<option value="">— Semua —</option>' + filtered.map(v=>
            `<option value="${esc(v.id)}" ${s?.varietyId!=null && String(s.varietyId)===String(v.id)?'selected':''}>${esc(v.name)}</option>`).join('');
          if(s?.varietyId && !filtered.some(v=>String(v.id)===String(s.varietyId))) varSelect.value='';
        };
        updateVars();
        comSelect.onchange = updateVars;
        b.querySelector('#s-save').onclick = async ()=>{
          const name = b.querySelector('#s-name').value.trim();
          const commodityId = comSelect.value || null;
          const varietyId = varSelect.value || null;
          if(!name){ toast('Nama SOP wajib diisi'); return; }
          const variety = varietyId ? vars.find(v=>String(v.id)===String(varietyId)) : null;
          if(varietyId && !variety){ toast('Varietas tidak valid'); return; }
          if(variety && commodityId && String(variety.commodityId)!==String(commodityId)){
            toast('Varietas tidak sesuai dengan komoditas'); return;
          }
          const save = b.querySelector('#s-save');
          if(save.disabled) return;
          save.disabled = true;
          try{
            const obj = { id:s?.id||uid('sop'), name, commodityId,
              varietyId, description:b.querySelector('#s-desc').value.trim(),
              isTemplate:s?.isTemplate===true, ...(s?.origin?{origin:s.origin}:{}), ...(s?.sourceSopId?{sourceSopId:s.sourceSopId}:{}), updatedAt:todayISO(), ...(s?.createdAt?{createdAt:s.createdAt}:{}) };
            await put('sops', obj);
            close(); toast('SOP tersimpan'); await Settings.renderSOP(container);
          }catch(error){ console.error(error); toast('SOP gagal disimpan: '+(error.message||error)); save.disabled=false; }
        };
      });
  },

  async renderSOPDetail(container, sopId){
    if(!sopId){ container.innerHTML='<div class="notice red-notice">ID SOP tidak valid.</div>'; return; }
    const sop = (await getAll('sops')).find(row=>String(row.id)===String(sopId));
    if(!sop){ container.innerHTML='<div class="notice red-notice">SOP tidak ditemukan di database.</div>'; return; }
    const items = await SopEngine.items(sopId);
    const commodity = sop.commodityId ? (await getAll('commodities')).find(row=>String(row.id)===String(sop.commodityId)) : null;
    const sopAgeLabel=commodity?.ageBasis==='cycleStartDate'?'HSP':(commodity?.ageBasis==='transplantDate'?'HSTP':'HST');
    const variety = sop.varietyId ? (await getAll('varieties')).find(row=>String(row.id)===String(sop.varietyId)) : null;
    container.innerHTML = `
      <button class="btn small outline" id="sop-back" style="margin-bottom:12px">← Kembali ke Daftar SOP</button>
      <h2 class="page-title">${esc(sop.name)}</h2>
      <p class="subtitle">${esc(sop.description||'Belum ada deskripsi')}</p>
      <p class="tiny muted">Komoditas: ${esc(commodity?.name||'Semua')} · Varietas: ${esc(variety?.name||'Semua')}</p>
      <div class="btn-row"><button class="btn outline" id="sop-edit">Edit SOP</button><button class="btn" id="sop-item-add">+ Tambah Item SOP</button></div>
      ${items.length ? items.map(it=>`<div class="card"><div class="list-row" style="border:0;padding:0">
        <div><strong>${esc(it.name)}</strong><small>${sopAgeLabel} ${esc(it.hstStart)}-${esc(it.hstEnd)} · ${esc(it.phase||'-')} · ${esc(it.appType||'-')}</small>
        <div class="tiny muted">${esc((Array.isArray(it.products)&&it.products.length ? it.products.map(p=>p.name+(p.dose?' ('+p.dose+')':'')).join(', ') : [it.productName||'-',it.dose||''].filter(Boolean).join(' ')))} · ${esc(it.frequency||'-')} · ${esc(it.waterVolume||'')}</div></div>
        <div style="display:flex;gap:4px"><button class="btn small secondary" data-edit-item="${esc(it.id)}">Edit</button><button class="btn small danger" data-del-item="${esc(it.id)}">✕</button></div>
      </div></div>`).join('') : '<div class="empty">Belum ada item. Klik tombol di atas untuk menambahkan.</div>'}`;
    $('#sop-back').onclick = ()=>Router.go('sop');
    $('#sop-edit').onclick = ()=>Settings._formSOP(sop, container);
    $('#sop-item-add').onclick = ()=>Settings._formSOPItem(null, sopId, container);
    container.querySelectorAll('[data-edit-item]').forEach(b=>b.onclick=async()=>{
      const it = (await getAll('sop_items')).find(row=>String(row.id)===String(b.dataset.editItem));
      if(it) Settings._formSOPItem(it, sopId, container); else toast('Item SOP tidak ditemukan');
    });
    container.querySelectorAll('[data-del-item]').forEach(b=>b.onclick=()=>confirmDialog('Hapus item SOP? Jadwal yang pernah dibuat dari item ini tetap disimpan sebagai riwayat.', async ()=>{
      try{ await deleteSOPItemCascade(b.dataset.delItem); toast('Item SOP dihapus'); await Settings.renderSOPDetail(container,sopId); }
      catch(error){ console.error(error); toast('Gagal menghapus item: '+(error.message||error)); }
    }));
  },

  async _formSOPItem(it, sopId, container){
    const sopContext=await getOne('sops',sopId);
    const sopCommodity=sopContext?.commodityId?await getOne('commodities',sopContext.commodityId):null;
    const sopAgeLabel=sopCommodity?.ageBasis==='cycleStartDate'?'HSP':(sopCommodity?.ageBasis==='transplantDate'?'HSTP':'HST');
    const [fertilizers,pesticides,zpts,mixedRecipes] = await Promise.all([getAll('fertilizers'),getAll('pesticides'),getAll('zpts'),getAll('mixed_recipes')]);
    const catalog = [
      ...fertilizers.map(x=>({name:x.name, category:'Pupuk', productId:ProductMapping.key('fertilizer',x.id)})),
      ...pesticides.map(x=>({name:x.name, category:'Pestisida', productId:ProductMapping.key('pesticide',x.id), suggestedDose:x.labelDose||''})),
      ...zpts.map(x=>({name:x.name, category:'ZPT', productId:ProductMapping.key('zpt',x.id), suggestedDose:x.referenceDose||''})),
      ...mixedRecipes.flatMap(recipe=>(Array.isArray(recipe.phases)?recipe.phases:[]).map(phase=>({
        name:`${recipe.name} — ${phase.name} (HST ${num(phase.hstStart)}-${num(phase.hstEnd)})`, category:'Pupuk Campuran', recipeId:recipe.id, recipePhaseId:phase.id||'',
        recipeSnapshot:MixedFertilizer.phaseSnapshot(recipe,phase,fertilizers),
        detail:`Komposisi: ${phase.items.map(item=>`${fertilizers.find(f=>String(f.id)===String(item.fertId))?.name||'Pupuk'} rasio ${num(item.ratio)}`).join(' + ')} · HST fase ${num(phase.hstStart)}-${num(phase.hstEnd)}`,
        suggestedDose:`${num(phase.dosePerPlant)} g/tanaman; ${num(phase.waterPerPlant)} ml/tanaman`
      })))
    ].filter(x=>x.name).filter((x,i,a)=>a.findIndex(y=>y.category===x.category && y.name===x.name)===i)
      .sort((a,b)=>a.category.localeCompare(b.category,'id') || a.name.localeCompare(b.name,'id'));
    // Kompatibilitas: data SOP lama yang hanya menyimpan productName/dose
    // ditampilkan sebagai satu produk terpilih.
    const savedProducts = Array.isArray(it?.products) ? it.products :
      (it?.productName ? [{name:it.productName, category:'', dose:it.dose||''}] : []);
    const savedByKey = new Map(savedProducts.map(x=>[`${x.category||''}|${x.name}`,x]));
    const catalogHtml = catalog.length ? catalog.map((p,i)=>{
      const key=`${p.category}|${p.name}`, saved=savedProducts.find(x=>x.productId&&x.productId===p.productId) || savedByKey.get(key) || savedByKey.get(`|${p.name}`);
      return `<div class="card" style="padding:9px;margin:6px 0;box-shadow:none">
        <label style="display:flex;gap:9px;align-items:center;font-weight:600;margin:0">
          <input type="checkbox" data-product-check="${i}" ${saved?'checked':''} style="width:auto">
          <span>${esc(p.name)} <small class="muted">(${p.category})</small>${p.detail?`<small class="muted" style="display:block;font-weight:400">${esc(p.detail)}</small>`:''}</span>
        </label>
        <div class="field" style="margin:7px 0 0 27px"><label>${p.recipeId?'Ringkasan dosis resep':'Dosis produk ini'}</label>
          <input data-product-dose="${i}" value="${esc(saved?.dose||p.suggestedDose||'')}" placeholder="Contoh: 1 g/L atau 0,5 ml/L" ${p.recipeId?'readonly':''}></div>
      </div>`;
    }).join('') : '<div class="empty">Belum ada produk pada Master Data. Tambahkan pupuk, pestisida, atau ZPT terlebih dahulu.</div>';
    // Produk lama yang sudah tidak ada di master tetap dipertahankan saat edit.
    const missingProducts = savedProducts.filter(x=>!catalog.some(p=>(x.productId&&p.productId===x.productId) || (p.name===x.name && (!x.category || p.category===x.category))));
    modal(it?'Edit Item SOP':'Tambah Item SOP', `
      <div class="field"><label>Nama kegiatan</label><input id="si-name" maxlength="120" value="${esc(it?.name||'')}" placeholder="Contoh: Pemupukan susulan"></div>
      <div class="field-row"><div class="field"><label>${sopAgeLabel} awal</label><input id="si-hs" type="number" min="0" max="3650" step="1" value="${it?.hstStart??0}"></div>
      <div class="field"><label>${sopAgeLabel} akhir</label><input id="si-he" type="number" min="0" max="3650" step="1" value="${it?.hstEnd??0}"></div></div>
      <div class="field"><label>Fase</label><input id="si-phase" value="${esc(it?.phase||'')}" placeholder="Contoh: Vegetatif"></div>
      <div class="field"><label>Jenis aplikasi</label><select id="si-app">${['Semprot','Kocor','Tabur','Fertigasi','Hidroponik'].map(x=>`<option ${it?.appType===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Pilih produk (bisa lebih dari satu)</label><p class="tiny muted">Centang semua produk yang digunakan. Masukkan dosis masing-masing produk secara terpisah.</p>
        <div id="si-product-list" style="max-height:260px;overflow:auto">${catalogHtml}</div>
        ${missingProducts.map((p,i)=>`<div class="card" style="padding:9px;margin:6px 0;box-shadow:none"><label style="display:flex;gap:9px;align-items:center"><input type="checkbox" data-missing-product="${i}" checked style="width:auto"><span>${esc(p.name)} <small class="muted">(produk lama)</small></span></label><div class="field" style="margin:7px 0 0 27px"><label>Dosis produk ini</label><input data-missing-dose="${i}" value="${esc(p.dose||'')}"></div></div>`).join('')}
      </div>
      <div class="field-row"><div class="field"><label>Frekuensi</label><input id="si-freq" value="${esc(it?.frequency||'')}" placeholder="Contoh: 1x atau setiap 7 hari"></div>
      <div class="field"><label>Volume air / volume aplikasi</label><input id="si-water" value="${esc(it?.waterVolume||'')}" placeholder="Contoh: 250 ml/tanaman"></div></div>
      <div class="field"><label>Catatan teknis</label><textarea id="si-note">${esc(it?.note||'')}</textarea></div>
      <button class="btn" id="si-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#si-save').onclick = async ()=>{
          const name=b.querySelector('#si-name').value.trim();
          const hs=b.querySelector('#si-hs').value, he=b.querySelector('#si-he').value;
          const hstStart=Number(hs), hstEnd=Number(he);
          if(!name){ toast('Nama kegiatan wajib diisi'); return; }
          if(hs==='' || he==='' || !Number.isInteger(hstStart) || !Number.isInteger(hstEnd) || hstStart<0 || hstEnd<hstStart || hstEnd>3650){
            toast(`${sopAgeLabel} harus bilangan bulat 0–3650 dan hari akhir tidak boleh lebih kecil dari hari awal`); return;
          }
          const selectedProducts=[];
          catalog.forEach((product,i)=>{
            const check=b.querySelector(`[data-product-check="${i}"]`);
            if(check?.checked){
              selectedProducts.push({name:product.name,category:product.category,dose:b.querySelector(`[data-product-dose="${i}"]`)?.value.trim()||'', ...(product.productId?{productId:product.productId}:{}), ...(product.recipeId?{recipeId:product.recipeId,recipePhaseId:product.recipePhaseId,recipeSnapshot:clone(product.recipeSnapshot)}:{})});
            }
          });
          missingProducts.forEach((product,i)=>{
            if(b.querySelector(`[data-missing-product="${i}"]`)?.checked){
              selectedProducts.push({name:product.name,category:product.category||'',dose:b.querySelector(`[data-missing-dose="${i}"]`)?.value.trim()||'', ...(product.recipeId?{recipeId:product.recipeId,recipePhaseId:product.recipePhaseId||'',recipeSnapshot:clone(product.recipeSnapshot)}:{})});
            }
          });
          const productNames=selectedProducts.map(p=>p.name);
          const productDoseSummary=selectedProducts.map(p=>p.dose?`${p.name}: ${p.dose}`:p.name).join('; ');
          const save=b.querySelector('#si-save'); if(save.disabled) return; save.disabled=true;
          try{
            await put('sop_items', { id:it?.id||uid('si'), sopId,
              name, hstStart, hstEnd, phase:b.querySelector('#si-phase').value.trim(),
              appType:b.querySelector('#si-app').value, products:selectedProducts,
              // Field lama tetap disimpan agar kompatibel dengan modul/riwayat versi sebelumnya.
              productName:productNames.join(', '), dose:selectedProducts.length===1?selectedProducts[0].dose:productDoseSummary,
              frequency:b.querySelector('#si-freq').value.trim(),
              waterVolume:b.querySelector('#si-water').value.trim(), note:b.querySelector('#si-note').value.trim() });
            close(); toast('Item SOP tersimpan'); await Settings.renderSOPDetail(container,sopId);
          }catch(error){ console.error(error); toast('Item SOP gagal disimpan: '+(error.message||error)); save.disabled=false; }
        };
      });
  }
};
