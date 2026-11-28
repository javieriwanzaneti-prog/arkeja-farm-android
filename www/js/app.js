/* ============ App Main ============ */
const App = {
  async init(){
    try {
      await openDB();
      await seedIfEmpty();
      await migrateLegacyLocalStorage();
      // Pilih musim aktif
      let active = Prefs.get('activeSeasonId', null);
      if(!active){
        const seasons = await getAll('seasons');
        if(seasons.length){ active = seasons[0].id; Prefs.set('activeSeasonId', active); }
      }
      // Nav clicks
      $$('#main-nav button').forEach(b=>b.onclick = ()=> Router.go(b.dataset.page));
      await this.updateHeader();
      await Router.go('home');
      if('serviceWorker' in navigator){
        try { await navigator.serviceWorker.register('sw.js'); } catch(e){ console.warn('SW:', e); }
      }
    } catch(err){
      console.error('Init error:', err);
      $('#view').innerHTML = `<div class="notice red-notice">Gagal inisialisasi: ${esc(err.message)}</div>`;
    }
  },

  async updateHeader(){
    const today = new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    $('#todayLine').textContent = today + ' · Data tersimpan lokal';
    const seasons = await getAll('seasons');
    const activeId = Prefs.get('activeSeasonId', null);
    const picker = $('#season-picker');
    if(seasons.length > 1){
      picker.innerHTML = `<select id="sp-select">${seasons.map(s=>`<option value="${s.id}" ${String(s.id)===String(activeId)?'selected':''}>${esc(s.commodityName||s.name)}</option>`).join('')}</select>`;
      $('#sp-select').onchange = e => { Prefs.set('activeSeasonId', e.target.value); this.updateHeader(); Router.render(); };
    } else {
      picker.innerHTML = '';
    }
  },

  /* ============== HOME ============== */
  async renderHome(container, season){
    const s = season;
    const seasons = await getAll('seasons');
    const lands = await getAll('lands');
    const hst = s ? CropEngine.hstOf(s) : 0;
    const ageLabel = s ? CropEngine.ageLabel(s) : 'HST';
    const phase = s ? (await CropEngine.phaseForSeason(s, hst)).name : '—';
    const cropProfile = s ? await CropEngine.getSeasonProfile(s) : null;
    const cycleLabel = ({annual:'Semusim',perennial:'Tahunan / perennial',production:'Siklus produksi berulang'})[cropProfile?.cycleType||'annual'];
    const acts = s ? await getByIndex('activities','seasonId', s.id) : [];
    const todayActs = acts.filter(a=>a.date === todayISO() && a.status !== 'selesai');
    const lateActs = acts.filter(a=>a.status==='terlambat' || (a.date < todayISO() && a.status !== 'selesai'));
    const fin = s ? await Financial.summary(s.id) : null;
    const harvests = s ? await getByIndex('harvests','seasonId', s.id) : [];
    const totalKg = harvests.reduce((a,h)=>a+num(h.weightKg),0);
    const totalRev = harvests.reduce((a,h)=>a+num(h.revenue||h.weightKg*h.pricePerKg),0);
    const fertActs = acts.filter(a=>a.type==='Pemupukan');
    const mon = s ? await getByIndex('monitorings','seasonId', s.id) : [];
    container.innerHTML = `
      <div class="section-head"><h2>Dashboard</h2>
        <button class="btn small outline" data-go="season-form">+ Musim</button>
      </div>
      ${s ? `
      <div class="season-card">
        <div class="hstdot"><small>${ageLabel}</small>${hst}</div>
        <h3>${esc(s.commodityName)}</h3>
        <p>${esc(s.landName)} · ${esc(phase)}</p>
        <div class="pill">${esc(s.weather||'—')}</div>
        <div class="pill">${fmtNum(s.area)} m²</div>
        <div class="pill">${esc(cycleLabel)}</div>
        <div class="progress"><div style="width:${Math.min(100, hst / Math.max(1, cropProfile?.lifespanDays||90) * 100)}%"></div></div>
        <small style="font-size:11px">Tanam ${fmtDate(s.plantingDate)} · ${ageLabel}: ${hst} · Target: ${esc(s.targetHarvest||'—')} · Siklus ${fmtNum(cropProfile?.lifespanDays||90)} hari</small>
      </div>
      <div class="grid">
        <div class="metric"><span>Lahan</span><strong>${lands.length}</strong></div>
        <div class="metric"><span>Musim</span><strong>${seasons.length}</strong></div>
        <div class="metric"><span>Kegiatan Hari Ini</span><strong>${todayActs.length}</strong></div>
        <div class="metric"><span>Terlambat</span><strong style="color:var(--red)">${lateActs.length}</strong></div>
        <div class="metric orange"><span>Total Biaya</span><strong>${rupiah(fin?.totalCost)}</strong></div>
        <div class="metric green"><span>Hasil Panen</span><strong>${fmtNum(totalKg,1)} kg</strong></div>
        <div class="metric green"><span>Estimasi Laba</span><strong>${rupiah(fin?.profit)}</strong></div>
        <div class="metric"><span>Monitoring</span><strong>${mon.length}</strong></div>
      </div>
      <div class="card">
        <div class="section-head"><h3>Kegiatan Hari Ini</h3><button class="btn small outline" data-go="activity">Lihat</button></div>
        ${todayActs.length ? todayActs.map(a=>`
          <div class="task"><div class="task-icon">🌿</div>
            <div class="task-main"><strong>${esc(a.title)}</strong><small>${esc(a.type)} · ${ageLabel} ${a.hst} · ${esc(a.dose||'')}</small></div>
          </div>`).join('') : '<div class="empty" style="padding:14px">Tidak ada kegiatan hari ini.</div>'}
      </div>
      <div class="card">
        <div class="section-head"><h3>Status Pemupukan</h3></div>
        <div class="list-row"><span>Total kegiatan pemupukan</span><strong>${fertActs.length}</strong></div>
        <div class="list-row"><span>Sudah realisasi</span><strong>${fertActs.filter(a=>a.status==='selesai').length}</strong></div>
        <div class="list-row"><span>Belum realisasi</span><strong>${fertActs.filter(a=>a.status!=='selesai').length}</strong></div>
      </div>
      ` : `
      <div class="card empty"><div class="emoji">🌱</div><strong>Belum ada musim tanam</strong>
        <p>Mulai dengan membuat lahan dan musim tanam.</p>
        <button class="btn" data-go="season-form">Mulai Musim Tanam</button></div>`}
      <div class="card">
        <div class="section-head"><h3>Navigasi Cepat</h3></div>
        <div class="grid">
          <button class="metric" data-go="monitoring" style="text-align:left">📊 Monitoring</button>
          <button class="metric" data-go="harvest" style="text-align:left">🌾 Panen</button>
          <button class="metric" data-go="financial" style="text-align:left">💰 Keuangan</button>
          <button class="metric" data-go="pest" style="text-align:left">🐛 Hama</button>
          <button class="metric" data-go="irrigation" style="text-align:left">💧 Irigasi</button>
          <button class="metric" data-go="reports" style="text-align:left">📄 Laporan</button>
        </div>
      </div>
      <footer>ARKEJA FARM v1.0 · Data lokal di perangkat</footer>`;
    container.querySelectorAll('[data-go]').forEach(b=>b.onclick = ()=> Router.go(b.dataset.go));
  },

  /* ============== CULTIVATION ============== */
  async renderCultivation(container, season){
    const lands = await getAll('lands');
    const seasons = await getAll('seasons');
    container.innerHTML = `
      <h2 class="page-title">Budidaya</h2>
      <p class="subtitle">Lahan, musim tanam, monitoring, irigasi, panen, keuangan, inventory.</p>
      <div class="card">
  <div class="section-head"><h3>Lahan</h3><button class="btn small" id="land-add">+ Lahan</button></div>
  ${lands.length ? lands.map(l=>`
    <div class="list-row">
      <div><strong>${esc(l.name)}</strong><small>${fmtNum(l.area)} m² · ${esc(l.soilType||'—')} · pH ${l.ph||'—'}</small></div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn small secondary" data-land-season="${l.id}">Mulai Musim</button>
        <button type="button" class="btn small danger" data-del-land="${l.id}" aria-label="Hapus lahan ${esc(l.name)}" title="Hapus lahan">Hapus</button>
      </div>
    </div>`).join('') : '<div class="empty">Belum ada lahan.</div>'}
</div>
<div class="card">
  <div class="section-head"><h3>Musim Tanam</h3><button class="btn small" id="season-add">+ Musim</button></div>
  ${seasons.length ? seasons.map(s=>`
    <div class="list-row">
      <div><strong>${esc(s.commodityName)}</strong><small>${esc(s.landName)} · Tanam ${fmtDate(s.plantingDate)}</small>
        <div class="tiny muted">Varietas: ${esc(s.varietyName||'—')} · Populasi: ${fmtNum(s.population||0)}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn small ${String(s.id)===String(Prefs.get('activeSeasonId'))?'':'outline'}" data-activate="${s.id}">${String(s.id)===String(Prefs.get('activeSeasonId'))?'Aktif':'Pilih'}</button>
        <button type="button" class="btn small danger" data-del-season="${s.id}" aria-label="Hapus musim ${esc(s.commodityName||s.name||'')}" title="Hapus musim">Hapus</button>
      </div>
    </div>`).join('') : '<div class="empty">Belum ada musim.</div>'}
</div>
      <div class="card">
        <div class="section-head"><h3>Menu Budidaya</h3></div>
        <div class="grid">
          <button class="metric" data-go="monitoring" style="text-align:left">📊 Monitoring</button>
          <button class="metric" data-go="irrigation" style="text-align:left">💧 Irigasi</button>
          <button class="metric" data-go="pest" style="text-align:left">🐛 Hama/Penyakit</button>
          <button class="metric" data-go="harvest" style="text-align:left">🌾 Panen</button>
          <button class="metric" data-go="financial" style="text-align:left">💰 Keuangan</button>
          <button class="metric" data-go="inventory" style="text-align:left">📦 Inventory</button>
          <button class="metric" data-go="reports" style="text-align:left">📄 Laporan</button>
          <button class="metric" data-go="sop" style="text-align:left">📋 SOP</button>
        </div>
      </div>
      ${season ? `<div class="card">
        <h3>Musim Aktif</h3>
        <div class="list-row"><span>Komoditas</span><strong>${esc(season.commodityName)}</strong></div>
        <div class="list-row"><span>Varietas</span><strong>${esc(season.varietyName||'—')}</strong></div>
        <div class="list-row"><span>${CropEngine.ageLabel(season)}</span><strong>${CropEngine.hstOf(season)}</strong></div>
        <div class="list-row"><span>Luas</span><strong>${fmtNum(season.area)} m²</strong></div>
      </div>`:''}
      <footer>Pilih musim aktif untuk modul analisis yang akurat.</footer>`;
    container.querySelectorAll('[data-go]').forEach(b=>b.onclick = ()=> Router.go(b.dataset.go));
    container.querySelectorAll('[data-activate]').forEach(b=>b.onclick = ()=> {
      Prefs.set('activeSeasonId', b.dataset.activate); App.updateHeader(); Router.render(); toast('Musim aktif diganti');
    });

    // Semua tombol pengelolaan lahan dan musim dipasang setelah daftar dirender.
    const addLand = container.querySelector('#land-add');
    if(addLand) addLand.onclick = () => App.landForm(container, true);
    const addSeason = container.querySelector('#season-add');
    if(addSeason) addSeason.onclick = () => App.seasonForm(container);
    container.querySelectorAll('[data-land-season]').forEach(btn => {
      btn.onclick = () => App.seasonForm(container, btn.dataset.landSeason);
    });
    container.querySelectorAll('[data-del-land]').forEach(btn=>{
      btn.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        const id = btn.dataset.delLand;
        if(id !== undefined && id !== '') App.deleteLand(id);
      };
    });
    container.querySelectorAll('[data-del-season]').forEach(btn=>{
      btn.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        const id = btn.dataset.delSeason;
        if(id !== undefined && id !== '') App.deleteSeason(id);
      };
    });
  },

  async deleteLand(landId){
    try{
      const land = (await getAll('lands')).find(row => String(row.id) === String(landId));
      if(!land) throw new Error('Data lahan tidak ditemukan.');
      const linked = (await getAll('seasons')).filter(row => String(row.landId) === String(land.id));
      const seasonNames = linked.map(row => row.name || row.commodityName || 'Tanpa nama').join(', ');
      const detail = linked.length
        ? ` Lahan ini memiliki ${linked.length} musim (${seasonNames}). Seluruh musim dan catatan budidaya yang terkait akan ikut dihapus.`
        : ' Lahan ini belum memiliki musim tanam.';
      confirmDialog(`Hapus lahan "${land.name}"?${detail} Penghapusan permanen dan tidak dapat dibatalkan.`, async ()=>{
        try{
          const result = await deleteLandCascade(land.id);
          const activeId = Prefs.get('activeSeasonId', null);
          const remaining = await getAll('seasons');
          const activeStillExists = activeId !== null && remaining.some(row => String(row.id) === String(activeId));
          if(!activeStillExists) {
            if(remaining.length) Prefs.set('activeSeasonId', remaining[0].id);
            else Prefs.del('activeSeasonId');
          }
          toast(`Lahan dihapus. ${result.deletedSeasons} musim dan seluruh catatan terkait ikut dihapus.`);
          await App.updateHeader();
          await Router.render();
        }catch(err){ console.error(err); toast('Gagal menghapus lahan: '+(err.message||err)); }
      });
    }catch(err){ console.error(err); toast('Gagal memeriksa lahan: '+(err.message||err)); }
  },

  async deleteSeason(seasonId){
    try{
      const season = (await getAll('seasons')).find(row => String(row.id) === String(seasonId));
      if(!season) throw new Error('Data musim tanam tidak ditemukan.');
      confirmDialog(`Hapus musim tanam "${season.name || season.commodityName || 'Tanpa nama'}" beserta seluruh catatan aktivitas, monitoring, OPT, irigasi, panen, biaya, pendapatan, transaksi stok, dan riwayat nutrisi yang terhubung? Penghapusan permanen.`, async ()=>{
        try{
          await deleteSeasonCascade(season.id);
          if(String(Prefs.get('activeSeasonId', null)) === String(season.id)) {
            const remaining = await getAll('seasons');
            if(remaining.length) Prefs.set('activeSeasonId', remaining[0].id);
            else Prefs.del('activeSeasonId');
          }
          toast('Musim tanam dan seluruh catatan terkait berhasil dihapus');
          await App.updateHeader();
          await Router.render();
        }catch(err){ console.error(err); toast('Penghapusan musim gagal: '+(err.message||err)); }
      });
    }catch(err){ console.error(err); toast('Gagal memeriksa musim: '+(err.message||err)); }
  },

  async landForm(container, fromCultivation){
    modal('Tambah Lahan', `
      <div class="field"><label>Nama lahan</label><input id="l-name"></div>
      <div class="field-row">
        <div class="field"><label>Luas (m²)</label><input id="l-area" type="number" value="1000"></div>
        <div class="field"><label>Jenis tanah</label><input id="l-soil" placeholder="Lempung berpasir"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>pH tanah</label><input id="l-ph" type="number" step="0.1" value="6.5"></div>
        <div class="field"><label>EC tanah</label><input id="l-ec" type="number" step="0.01" value="0.8"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Drainase</label><select id="l-drain"><option>Baik</option><option>Cukup</option><option>Buruk</option></select></div>
        <div class="field"><label>Sumber air</label><input id="l-water" placeholder="Sumur"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>TDS air (ppm)</label><input id="l-tds" type="number" value="400"></div>
        <div class="field"><label>Sistem irigasi</label><select id="l-irr"><option>Fertigasi</option><option>Tetes</option><option>Siram manual</option><option>Genangan</option></select></div>
      </div>
      <div class="field"><label>Foto lahan</label><input id="l-photo" type="file" accept="image/*"><img id="l-preview" class="upload-preview"></div>
      <button class="btn" id="l-save">Simpan</button>`, (b,close)=>{
        const saveButton = b.querySelector('#l-save');
        b.querySelector('#l-photo').onchange = async e=>{
          try{
            const u = await imageToDataURL(e.target.files[0], 900);
            if(u){ const preview=b.querySelector('#l-preview'); preview.src=u; preview.style.display='block'; }
          }catch(error){ console.error(error); toast('Foto lahan gagal diproses.'); }
        };
        saveButton.onclick = async ()=>{
          if(saveButton.disabled) return;
          const name = b.querySelector('#l-name').value.trim();
          const area = Number(b.querySelector('#l-area').value);
          if(!name){ toast('Nama lahan wajib diisi.'); b.querySelector('#l-name').focus(); return; }
          if(!Number.isFinite(area) || area <= 0){ toast('Luas lahan harus lebih dari 0 m².'); b.querySelector('#l-area').focus(); return; }
          saveButton.disabled = true;
          try{
            const photo = b.querySelector('#l-preview').style.display==='block' ? b.querySelector('#l-preview').src : '';
            await put('lands', { id:uid('land'), name, area, soilType:b.querySelector('#l-soil').value,
              ph:num(b.querySelector('#l-ph').value), ec:num(b.querySelector('#l-ec').value),
              drainage:b.querySelector('#l-drain').value, waterSource:b.querySelector('#l-water').value,
              waterTds:num(b.querySelector('#l-tds').value), irrigationSystem:b.querySelector('#l-irr').value, photo });
            close(); toast('Lahan berhasil disimpan');
            await App.updateHeader(); await Router.render();
          }catch(error){
            console.error('Simpan lahan gagal:', error);
            toast('Lahan gagal disimpan: '+(error.message||error));
            saveButton.disabled = false;
          }
        };
      });
  },

  async seasonForm(container, landId){
    const lands = await getAll('lands');
    const coms = await getAll('commodities');
    if(!lands.length){
      container.innerHTML = `<div class="notice">Belum ada lahan. Tambahkan lahan terlebih dahulu.</div>
        <button class="btn" id="go-land">+ Tambah Lahan</button>`;
      $('#go-land').onclick = ()=> App.landForm(container, true); return;
    }
    if(!coms.length){
      container.innerHTML = `<div class="notice">Belum ada data komoditas. Tambahkan komoditas terlebih dahulu melalui Setelan.</div>`;
      return;
    }
    modal('Mulai Musim Tanam', `
      <div class="field"><label>Nama musim</label><input id="s-name" value="Musim ${new Date().getMonth()+1}/${new Date().getFullYear()}"></div>
      <div class="field"><label>Lahan</label><select id="s-land">${lands.map(l=>`<option value="${l.id}" ${String(l.id)===String(landId)?'selected':''}>${esc(l.name)} · ${fmtNum(l.area)} m²</option>`).join('')}</select></div>
      <div class="field"><label>Komoditas</label><select id="s-com">${coms.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Varietas</label><select id="s-var"><option value="">— Pilih nanti —</option></select></div>
      <div class="field-row">
        <div class="field"><label>Tanggal semai</label><input id="s-seed" type="date"></div>
        <div class="field"><label>Tanggal tanam</label><input id="s-plant" type="date" value="${todayISO()}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Pindah tanam</label><input id="s-trans" type="date"></div>
        <div class="field"><label>Populasi tanaman</label><input id="s-pop" type="number" min="1" step="1" value="1000"></div>
      </div>
      <div class="field" id="s-cycle-wrap"><label>Tanggal awal siklus / pemangkasan</label><input id="s-cycle-start" type="date"><small class="muted">Isi tanggal awal siklus agar HST mengikuti pemangkasan atau awal produksi.</small></div>
      <p class="tiny muted" id="s-age-help">Dasar HST mengikuti profil komoditas.</p>
      <div class="field-row">
        <div class="field"><label>Jarak tanam</label><input id="s-sp" value="40x40 cm"></div>
        <div class="field"><label>Luas efektif (m²)</label><input id="s-eff" type="number" value="800"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Target panen</label><input id="s-target" value="3.5 kg/tanaman"></div>
        <div class="field"><label>Cuaca</label><select id="s-weather"><option>Kemarau</option><option>Penghujan</option><option>Pancaroba</option></select></div>
      </div>
      <div class="field"><label>Metode budidaya</label><input id="s-method" value="Bedengan + fertigasi"></div>
      <div class="field"><label>SOP (opsional)</label><select id="s-sop"><option value="">— Belum pilih —</option></select></div>
      <button class="btn" id="s-save">Simpan</button>`, async (b,close)=>{
        const allVars = await getAll('varieties');
        const allSops = (await getAll('sops')).filter(s=>s.isTemplate!==true);
        const updateSops = ()=>{
          const comId = b.querySelector('#s-com').value;
          const varId = b.querySelector('#s-var').value;
          const eligible = allSops.filter(s =>
            (!s.commodityId || String(s.commodityId)===String(comId)) &&
            (!s.varietyId || (varId && String(s.varietyId)===String(varId)))
          );
          b.querySelector('#s-sop').innerHTML = '<option value="">— Belum pilih —</option>' +
            eligible.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
        };
        const updateVars = ()=>{
          const comId = b.querySelector('#s-com').value;
          const selectedProfile=coms.find(c=>String(c.id)===String(comId));
          const ageBasis=selectedProfile?.ageBasis||'plantingDate';
          b.querySelector('#s-cycle-wrap').style.display=ageBasis==='cycleStartDate'?'block':'none';
          b.querySelector('#s-age-help').textContent=ageBasis==='cycleStartDate'?'HSP dihitung dari tanggal awal siklus/pemangkasan. Tanggal tersebut wajib diisi.':(ageBasis==='transplantDate'?'HSTP dihitung dari tanggal pindah tanam. Tanggal pindah tanam wajib diisi.':'HST dihitung dari tanggal tanam.');
          b.querySelector('#s-var').innerHTML = '<option value="">— Pilih —</option>' +
            allVars.filter(v=>String(v.commodityId)===String(comId)).map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
          updateSops();
        };
        updateVars();
        b.querySelector('#s-com').onchange = updateVars;
        b.querySelector('#s-var').onchange = updateSops;
        b.querySelector('#s-save').onclick = async ()=>{
          const land = lands.find(l=>String(l.id)===String(b.querySelector('#s-land').value));
          const com = coms.find(c=>String(c.id)===String(b.querySelector('#s-com').value));
          const varId = b.querySelector('#s-var').value;
          const varObj = allVars.find(v=>String(v.id)===String(varId));
          const sopId = b.querySelector('#s-sop').value || null;
          if(!land || !com){ toast('Pilih lahan dan komoditas yang valid.'); return; }
          if(varObj && String(varObj.commodityId)!==String(com.id)){toast('Varietas tidak sesuai dengan komoditas yang dipilih.');return;}
          const plantingDate = b.querySelector('#s-plant').value;
          const seedDate=b.querySelector('#s-seed').value, transplantDate=b.querySelector('#s-trans').value;
          const cycleStartDate=b.querySelector('#s-cycle-start').value;
          const population=Number(b.querySelector('#s-pop').value), effectiveArea=Number(b.querySelector('#s-eff').value);
          const validDate=v=>{if(!v)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const [y,m,d]=v.split('-').map(Number);const dt=new Date(y,m-1,d);return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d;};
          if(!plantingDate || !validDate(plantingDate) || !validDate(seedDate) || !validDate(transplantDate) || !validDate(cycleStartDate)){toast('Tanggal tanam wajib diisi dengan tanggal yang valid.');return;}
          if(seedDate && seedDate>plantingDate){toast('Tanggal semai tidak boleh setelah tanggal tanam.');return;}
          if(transplantDate && transplantDate<plantingDate){toast('Tanggal pindah tanam tidak boleh sebelum tanggal tanam.');return;}
          if(!Number.isInteger(population) || population<1){toast('Populasi harus bilangan bulat minimal 1 tanaman.');return;}
          if(!Number.isFinite(effectiveArea) || effectiveArea<=0 || effectiveArea>Number(land.area)){toast('Luas efektif harus lebih dari 0 dan tidak boleh melebihi luas lahan.');return;}
          if(cycleStartDate && cycleStartDate>todayISO()){toast('Tanggal awal siklus tidak boleh di masa depan.');return;}
          if(cycleStartDate && cycleStartDate<plantingDate){toast('Tanggal awal siklus tidak boleh sebelum tanggal tanam musim ini.');return;}
          if(!Number.isFinite(Number(land.area)) || Number(land.area)<=0){toast('Luas lahan belum valid. Perbaiki data lahan terlebih dahulu.');return;}
          const profile=await getOne('commodities',com.id);
          if((profile?.ageBasis||'plantingDate')==='cycleStartDate' && !cycleStartDate){toast('Profil komoditas menggunakan awal siklus/pemangkasan. Isi tanggal awal siklus.');return;}
          if((profile?.ageBasis||'plantingDate')==='transplantDate' && !transplantDate){toast('Profil komoditas menggunakan tanggal pindah tanam sebagai dasar umur. Isi tanggal pindah tanam.');return;}
          const ageBasis=profile?.ageBasis||'plantingDate';
          const ageStartDate=ageBasis==='cycleStartDate'?(cycleStartDate||plantingDate):(ageBasis==='transplantDate'?(transplantDate||plantingDate):plantingDate);
          const s = {
            id:uid('season'), name:b.querySelector('#s-name').value.trim(),
            landId:land.id, landName:land.name, area:Number(land.area),
            commodityId:com.id, commodityName:com.name,
            varietyId:varObj?.id||null, varietyName:varObj?.name||'',
            plantingDate, seedDate, transplantDate, cycleStartDate, ageStartDate, ageBasis,
            cropProfileSnapshot:{cycleType:profile?.cycleType||'annual',ageBasis,lifespanDays:profile?.lifespanDays||90,yieldUnit:profile?.yieldUnit||'kg',cultivationSystem:profile?.cultivationSystem||'',phases:clone(profile?.phases||CropEngine.defaultPhases(profile?.lifespanDays||90))},
            population, plantSpacing:b.querySelector('#s-sp').value,
            effectiveArea, targetHarvest:b.querySelector('#s-target').value,
            weather:b.querySelector('#s-weather').value, cultivationMethod:b.querySelector('#s-method').value,
            sopId, status:'aktif', createdAt:todayISO()
          };
          const saveButton = b.querySelector('#s-save');
          if(saveButton.disabled) return;
          saveButton.disabled = true;
          try{
            await put('seasons', s);
            Prefs.set('activeSeasonId', s.id);
            let scheduleMessage = '';
            if(sopId){
              try{
                const added = await SopEngine.generateSchedule(s.id, sopId);
                scheduleMessage = ` + ${added.length} jadwal dari SOP`;
              }catch(scheduleError){
                console.error('Musim tersimpan tetapi pembuatan jadwal SOP gagal:', scheduleError);
                scheduleMessage = ' (musim tersimpan, tetapi jadwal SOP gagal dibuat)';
              }
            }
            close(); toast('Musim tanam berhasil disimpan'+scheduleMessage);
            await App.updateHeader(); await Router.render();
          }catch(error){
            console.error('Simpan musim gagal:', error);
            toast('Musim tanam gagal disimpan: '+(error.message||error));
            saveButton.disabled = false;
          }
        };
      });
  },

  /* ============== NUTRITION ============== */
  async renderNutrition(container, season){
    container.innerHTML = `
      <h2 class="page-title">Nutrisi & Pemupukan</h2>
      <p class="subtitle">Kalkulator dosis, PPM, AB Mix, formulator.</p>
      <div class="tabs">
        <button data-tab="dose" class="active">Dosis</button>
        <button data-tab="ppm">PPM</button>
        <button data-tab="abmix">AB Mix</button>
        <button data-tab="formulator">Formulator</button>
        <button data-tab="multi">Multi-Produk</button>
        <button data-tab="abmixpro">AB Mix Pro</button>
        <button data-tab="campuran">Campuran</button>
        <button data-tab="history">Riwayat</button>
      </div>
      <div id="nut-content"></div>`;
    const show = async (tab)=>{
      container.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active', x.dataset.tab===tab));
      const el = $('#nut-content');
      if(tab==='dose') Calculator.render(el, season);
      if(tab==='ppm') App.renderPpm(el, season);
      if(tab==='abmix') App.renderAbMix(el, season);
      if(tab==='formulator') App.renderFormulator(el, season);
      if(tab==='multi') AdvancedNutrition.renderMultiProduct(el, season);
      if(tab==='abmixpro') AdvancedNutrition.renderABMix(el, season);
      if(tab==='campuran') MixedFertilizer.render(el, season);
      if(tab==='history') App.renderNutHistory(el, season);
    };
    container.querySelectorAll('[data-tab]').forEach(b=>b.onclick = ()=> show(b.dataset.tab));
    await show('dose');
  },

  async renderPpm(container, season){
    const ferts = await getAll('fertilizers');
    let rowCounter = 0;
    const productOptions = () => `<option value="">— Pilih produk pupuk —</option>${ferts.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}`;
    const addRow = (values={}) => {
      const id = ++rowCounter;
      const row = document.createElement('div');
      row.className = 'field-row ppm-product-row';
      row.dataset.ppmRow = String(id);
      row.style.cssText = 'align-items:end; gap:8px; margin-bottom:8px';
      row.innerHTML = `
        <div class="field" style="flex:2"><label>Produk pupuk</label><select data-ppm-product>${productOptions()}</select></div>
        <div class="field" style="flex:1"><label>Berat (gram)</label><input data-ppm-grams type="number" min="0.01" step="0.01" value="${values.grams ?? 5}"></div>
        <button type="button" class="btn small danger" data-ppm-remove aria-label="Hapus produk">✕</button>`;
      row.querySelector('[data-ppm-product]').value = values.fertilizerId ? String(values.fertilizerId) : '';
      row.querySelector('[data-ppm-remove]').onclick = () => {
        if(container.querySelectorAll('.ppm-product-row').length <= 1) return toast('Minimal harus ada satu produk pupuk');
        row.remove();
      };
      $('#ppm-products').appendChild(row);
      return row;
    };

    container.innerHTML = `
      <div class="card">
        <h3>Kalkulator PPM Campuran</h3>
        <p class="muted tiny">Pilih satu atau beberapa pupuk dari Master Data. Masukkan berat masing-masing produk; sistem menjumlahkan kontribusi unsur dari seluruh pupuk.</p>
        ${ferts.length ? `
          <div id="ppm-products"></div>
          <button type="button" class="btn secondary" id="ppm-add">+ Tambah Produk</button>
          <div class="field" style="margin-top:12px"><label>Volume air (liter)</label><input id="ppm-l" type="number" min="0.01" step="0.1" value="1"></div>
          <button class="btn" id="ppm-go">Hitung Total PPM</button>
          <div id="ppm-out"></div>
        ` : '<div class="notice">Belum ada produk pupuk di Master Data. Tambahkan produk melalui Master Data → Pupuk.</div>'}
      </div>`;
    if(!ferts.length) return;
    addRow();
    $('#ppm-add').onclick = () => addRow();
    $('#ppm-go').onclick = async ()=>{
      const liters = num($('#ppm-l').value);
      const rows = [...container.querySelectorAll('.ppm-product-row')];
      const items = rows.map(row=>({
        fertilizer:ferts.find(f=>String(f.id)===String(row.querySelector('[data-ppm-product]').value)),
        grams:num(row.querySelector('[data-ppm-grams]').value)
      }));
      if(items.some(x=>!x.fertilizer)) return toast('Pilih produk pupuk pada setiap baris');
      if(items.some(x=>x.grams<=0) || liters<=0) return toast('Berat setiap pupuk dan volume air harus lebih dari 0');
      let result;
      try { result = NutritionEngine.ppmFromMixture(items, liters); }
      catch(err){ return toast(err.message || 'Perhitungan PPM gagal'); }
      const nutrientLabels = ['N','P','K','Ca','Mg','S','Fe','Mn','Zn','Cu','B','Mo'];
      const incompatibilities = NutritionEngine.checkIncompatibility(result.products.map(p=>p.name));
      $('#ppm-out').innerHTML = `
        <div class="green-notice notice">Total ${fmtNum(result.totalGrams,2)} g dalam ${fmtNum(liters,2)} L = ${fmtNum(result.gramsPerLiter,2)} g/L</div>
        <h4>Komposisi campuran</h4>
        ${result.products.map(p=>`<div class="list-row"><span>${esc(p.name)}</span><strong>${fmtNum(p.grams,2)} g</strong></div>`).join('')}
        <h4 style="margin-top:12px">Kontribusi PPM setiap produk (unsur murni)</h4>
        <div class="table-wrap"><table><thead><tr><th>Produk</th><th>N</th><th>P</th><th>K</th><th>Ca</th><th>Mg</th><th>S</th></tr></thead><tbody>${result.products.map(p=>`<tr><td>${esc(p.name)}</td>${['N','P','K','Ca','Mg','S'].map(k=>`<td>${fmtNum(p.ppm[k],2)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <h4 style="margin-top:12px">PPM total larutan</h4>
        <div class="grid">${nutrientLabels.map(k=>`<div class="metric"><span>${k}</span><strong>${fmtNum(result.nutrients[k],2)} ppm</strong></div>`).join('')}</div>
        ${incompatibilities.map(w=>`<div class="notice">⚠ ${esc(w)}</div>`).join('')}
        <p class="tiny muted">Konversi otomatis: P₂O₅ → P × 0,4364; K₂O → K × 0,8301; CaO → Ca × 0,7147; MgO → Mg × 0,6030. S dan unsur mikro dianggap sebagai persentase unsur murni sesuai label. PPM merupakan estimasi teoritis, bukan pengukuran EC.</p>`;
      if(season){
        try { await NutritionEngine.saveHistory(season.id,{type:'ppm-mixture',liters,products:result.products.map(p=>({fertilizerId:p.fertilizerId,name:p.name,grams:p.grams})),result}); }
        catch(err){ console.error(err); toast('Hasil dihitung, tetapi riwayat gagal disimpan'); }
      }
    };
  },

  async renderAbMix(container, season){
    container.innerHTML = `
      <div class="card">
        <h3>Kalkulator AB Mix</h3>
        <p class="muted tiny">Estimasi massa pupuk untuk stok A/B berdasarkan target ppm larutan kerja dan faktor pengenceran.</p>
        <div class="field-row"><div class="field"><label>Volume stok A (L)</label><input id="ab-vol-a" type="number" value="10"></div><div class="field"><label>Volume stok B (L)</label><input id="ab-vol-b" type="number" value="10"></div></div>
        <div class="field"><label>Faktor pengenceran (contoh 100 untuk 1:100)</label><input id="ab-dilution" type="number" min="1" step="1" value="100"></div>
        <div class="field-row">
          <div class="field"><label>Target N (ppm)</label><input id="ab-n" type="number" value="150"></div>
          <div class="field"><label>Target P (ppm)</label><input id="ab-p" type="number" value="50"></div>
          <div class="field"><label>Target K (ppm)</label><input id="ab-k" type="number" value="200"></div>
        </div>
        <p class="tiny muted">Komposisi Formula A (persen label: N, P₂O₅, K₂O)</p>
        <div class="field-row">
          <div class="field"><label>% N-A</label><input id="ab-na" type="number" value="15"></div>
          <div class="field"><label>% P₂O₅-A</label><input id="ab-pa" type="number" value="0"></div>
          <div class="field"><label>% K₂O-A</label><input id="ab-ka" type="number" value="0"></div>
        </div>
        <p class="tiny muted">Komposisi Formula B (persen label: N, P₂O₅, K₂O)</p>
        <div class="field-row">
          <div class="field"><label>% N-B</label><input id="ab-nb" type="number" value="0"></div>
          <div class="field"><label>% P₂O₅-B</label><input id="ab-pb" type="number" value="20"></div>
          <div class="field"><label>% K₂O-B</label><input id="ab-kb" type="number" value="30"></div>
        </div>
        <button class="btn" id="ab-go">Hitung</button>
        <div id="ab-out"></div>
      </div>`;
    $('#ab-go').onclick = async ()=>{
      const volA = num($('#ab-vol-a').value), volB = num($('#ab-vol-b').value), dilution = num($('#ab-dilution').value);
      const tN = num($('#ab-n').value), tP = num($('#ab-p').value), tK = num($('#ab-k').value);
      const nA = num($('#ab-na').value), pA = num($('#ab-pa').value), kA = num($('#ab-ka').value);
      const nB = num($('#ab-nb').value), pB = num($('#ab-pb').value), kB = num($('#ab-kb').value);
      if(volA<=0 || volB<=0 || dilution<=0 || [tN,tP,tK,nA,pA,kA,nB,pB,kB].some(x=>x<0)) return toast('Volume stok dan faktor pengenceran harus > 0; nilai lain tidak boleh negatif');
      try {
        const r = NutritionEngine.abMix({stockVolumeA_L:volA,stockVolumeB_L:volB,dilutionFactor:dilution,targetPpmN:tN,targetPpmP:tP,targetPpmK:tK,
          N_A_pct:nA,P_A_pct:pA,K_A_pct:kA,N_B_pct:nB,P_B_pct:pB,K_B_pct:kB});
        $('#ab-out').innerHTML = `<div class="green-notice notice">Formula A dan B dihitung terpisah. Jangan mencampur stok pekat A dan B secara langsung.</div>
          <div class="grid" style="margin-top:8px">
            <div class="metric"><span>Formula A</span><strong>${r.formulaA_grams===null?'—':r.formulaA_grams.toFixed(2)+' g'}</strong></div>
            <div class="metric"><span>Formula B (total)</span><strong>${r.formulaB_grams.toFixed(2)} g</strong></div>
            <div class="metric"><span>PPM N aktual</span><strong>${r.actual.N.toFixed(1)}</strong></div>
            <div class="metric"><span>PPM P aktual</span><strong>${r.actual.P.toFixed(1)}</strong></div>
            <div class="metric"><span>PPM K aktual</span><strong>${r.actual.K.toFixed(1)}</strong></div>
          </div>
          <p class="tiny muted">Kebutuhan B dihitung dari nilai terbesar antara target P dan K. ${esc(r.note)} Hasil teoretis; validasi EC/pH.</p>
          ${Object.values(r.gap).some(x=>x>0.1)?`<div class="notice">Masih kurang: ${Object.entries(r.gap).filter(([,v])=>v>0.1).map(([k,v])=>`${k} ${v.toFixed(1)} ppm`).join(', ')}</div>`:''}
          ${Object.values(r.excess).some(x=>x>0.1)?`<div class="notice">Berlebih: ${Object.entries(r.excess).filter(([,v])=>v>0.1).map(([k,v])=>`${k} ${v.toFixed(1)} ppm`).join(', ')}</div>`:''}`;
        if(season) NutritionEngine.saveHistory(season.id,{type:'abmix',volA,volB,dilution,targetN:tN,targetP:tP,targetK:tK,result:r}).catch(err=>{console.error(err);toast('Riwayat AB Mix gagal disimpan');});
      } catch(err){ toast(err.message||'Perhitungan AB Mix gagal'); }
    };
  },

  async renderFormulator(container, season){
    const ferts = await getAll('fertilizers');
    container.innerHTML = `
      <div class="card">
        <h3>Formulator Nutrisi (Estimasi 1 Produk)</h3>
        <p class="muted tiny">Menguji satu pupuk dari database terhadap target N-P-K. Untuk kombinasi beberapa pupuk, gunakan Resep Campuran.</p>
        <div class="field-row">
          <div class="field"><label>Target N</label><input id="nf-n" type="number" value="150"></div>
          <div class="field"><label>Target P</label><input id="nf-p" type="number" value="50"></div>
          <div class="field"><label>Target K</label><input id="nf-k" type="number" value="200"></div>
        </div>
        <div class="field"><label>Volume air (L)</label><input id="nf-v" type="number" value="100"></div>
        <button class="btn" id="nf-go">Formulasikan</button>
        <div id="nf-out"></div>
      </div>`;
    $('#nf-go').onclick = async ()=>{
      const target = { N:num($('#nf-n').value), P:num($('#nf-p').value), K:num($('#nf-k').value) };
      const liters = num($('#nf-v').value);
      if(liters<=0 || Object.values(target).some(v=>v<0)) return toast('Volume harus > 0 dan target PPM tidak boleh negatif');
      const res = await NutritionEngine.formulator({ targetPpm:target, liters });
      if(res.error){ $('#nf-out').innerHTML = `<div class="red-notice notice">${esc(res.error)}</div>`; return; }
      const warnings = NutritionEngine.checkIncompatibility(res.products.map(p=>p.name));
      $('#nf-out').innerHTML = `
        <div class="green-notice notice">Hasil kalkulasi untuk ${liters} L air.</div>
        ${res.products.map(p=>`<div class="list-row"><strong>${esc(p.name)}</strong><strong>${p.grams} g</strong></div>`).join('')}
        <h4 style="margin-top:12px">Hasil PPM</h4>
        <div class="grid">
          ${Object.entries(res.nutrients).map(([k,v])=>`<div class="metric"><span>${k}</span><strong>${v} ppm</strong></div>`).join('')}
        </div>
        ${Object.keys(res.gap).length ? `<h4 style="margin-top:10px">Kurang</h4>${Object.entries(res.gap).map(([k,v])=>`<div class="list-row"><span>${k}</span><strong>${v} ppm</strong></div>`).join('')}` : ''}
        ${Object.keys(res.excess).length ? `<h4 style="margin-top:10px">Berlebih</h4>${Object.entries(res.excess).map(([k,v])=>`<div class="list-row"><span>${k}</span><strong>${v} ppm</strong></div>`).join('')}` : ''}
        ${warnings.length ? warnings.map(w=>`<div class="red-notice notice">⚠ ${esc(w)}</div>`).join('') : ''}
        <p class="tiny muted">${esc(res.note)}</p>
        <button class="btn secondary" id="nf-save">Simpan Riwayat</button>`;
      $('#nf-save').onclick = async ()=>{
        if(season){ await NutritionEngine.saveHistory(season.id, { type:'formulator', target, liters, result:res, products:res.products }); toast('Disimpan'); }
      };
    };
  },

  async renderNutHistory(container, season){
    if(!season){ container.innerHTML = '<div class="notice">Pilih musim dulu.</div>'; return; }
    const list = sortBy(await NutritionEngine.history(season.id), 'createdAt', -1);
    container.innerHTML = `<div class="card"><h3>Riwayat Perhitungan Nutrisi</h3>
      ${list.length ? list.map(h=>`<div class="list-row"><div><strong>${esc(h.type)}</strong><small>${new Date(h.createdAt).toLocaleString('id-ID')}</small></div></div>`).join('') : '<div class="empty">Belum ada riwayat.</div>'}
    </div>`;
  },

  /* ============== ACTIVITY ============== */
  async renderActivity(container, season){
    if(!season){ container.innerHTML = '<h2 class="page-title">Aktivitas</h2><div class="notice">Pilih musim dulu di menu Budidaya.</div>'; return; }
    const acts = sortBy(await getByIndex('activities','seasonId', season.id), 'date');
    const sops = (await getAll('sops')).filter(s=>s.isTemplate!==true);
    const fertilizers = await getAll('fertilizers');
    container.innerHTML = `
      <h2 class="page-title">Aktivitas & Jadwal</h2>
      <p class="subtitle">Status kegiatan, realisasi, dan biaya.</p>
      <div class="btn-row">
        <button class="btn" id="act-add">+ Manual</button>
        <button class="btn secondary" id="act-gen" ${sops.length?'':'disabled'}>Generate dari SOP</button>
      </div>
      <div class="tabs">
        <button data-f="all" class="active">Semua</button>
        <button data-f="terjadwal">Terjadwal</button>
        <button data-f="hariini">Hari ini</button>
        <button data-f="terlambat">Terlambat</button>
        <button data-f="selesai">Selesai</button>
      </div>
      <div id="act-list"></div>`;
    const renderList = (f='all')=>{
      const filtered = acts.filter(a=>f==='all' || a.status===f);
      $('#act-list').innerHTML = filtered.length ? filtered.map(a=>`
        <div class="card" style="padding:12px">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
            <div style="flex:1">
              <strong style="display:block;font-size:13px">${esc(a.title)}</strong>
              <small class="muted">${esc(a.type)} · ${fmtDate(a.date)} · ${CropEngine.ageLabel(season)} ${a.hst}</small>
              ${a.productName||a.dose ? `<div class="tiny muted">${esc(a.productName||'')} ${esc(a.dose||'')} ${esc(a.waterVolume||'')}</div>`:''}
              ${a.realization ? `<div class="tiny muted" style="margin-top:4px">Realisasi: ${a.realization.inventoryUsages?.length||0} item stok · Biaya ${rupiah(a.realization.totalCost||0)}${a.realization.materialCost?` · Bahan ${rupiah(a.realization.materialCost)}`:''}</div>`:''}
              <span class="badge ${a.status}">${esc(a.status)}</span>
              ${a.source==='sop'?'<span class="badge terjadwal" style="margin-left:4px">dari SOP</span>':''}
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
              ${a.status!=='selesai'?`<button class="btn small" data-real="${a.id}">Realisasi</button>`:''}
              <button class="btn small danger" data-del="${a.id}">✕</button>
            </div>
          </div>
          ${a.note?`<div class="tiny muted" style="margin-top:4px">${esc(a.note)}</div>`:''}
        </div>`).join('') : '<div class="empty">Tidak ada kegiatan pada filter ini.</div>';
      container.querySelectorAll('[data-real]').forEach(b=>b.onclick = ()=> App.realizeActivity(b.dataset.real, season));
      container.querySelectorAll('[data-del]').forEach(b=>b.onclick = ()=> confirmDialog('Hapus kegiatan? Jika sudah direalisasikan, stok inventory akan dikembalikan dan biaya realisasi terkait ikut dihapus.', async ()=>{
        try{ await deleteActivityCascade(b.dataset.del); toast('Kegiatan dihapus; stok dan biaya realisasi disesuaikan'); Router.render(); }
        catch(error){ console.error(error); toast(error.message||'Gagal menghapus kegiatan'); }
      }));
    };
    renderList();
    container.querySelectorAll('[data-f]').forEach(b=>b.onclick = ()=>{
      container.querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('active', x===b));
      renderList(b.dataset.f);
    });
    $('#act-add').onclick = async ()=>{
  const recipes = await getAll('mixed_recipes');
  
  modal('Tambah Kegiatan', `
    <div class="field"><label>Nama kegiatan</label><input id="a-title" placeholder="Contoh: Pemupukan Susulan"></div>
    <div class="field"><label>Jenis</label><select id="a-type">
      <option>Pemupukan</option><option>Penyemprotan</option><option>Penyiraman</option>
      <option>Pemangkasan</option><option>Penyiangan</option><option>Pengendalian OPT</option>
      <option>Monitoring</option><option>Penyerbukan</option><option>Panen</option><option>Lainnya</option>
    </select></div>
    
    <!-- PANEL RESEP CAMPURAN (Tersembunyi secara default) -->
    <div id="a-recipe-panel" class="field" style="display:none; background:var(--green2); padding:10px; border-radius:10px; border:1px solid #cce5ce;">
      <label style="color:var(--green)">Gunakan Resep Campuran (Opsional)</label>
      <select id="a-recipe" style="margin-bottom:8px;">
        <option value="">— Pilih Resep —</option>
        ${recipes.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}
      </select>
      <div id="a-recipe-phases" style="display:none;">
         <label style="color:var(--green)">Pilih Fase</label>
         <select id="a-phase"></select>
      </div>
    </div>

    <div class="field-row">
      <div class="field"><label>Tanggal</label><input id="a-date" type="date" value="${todayISO()}"></div>
      <div class="field"><label>Jam</label><input id="a-time" type="time" value="07:00"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Produk</label><input id="a-prod"></div>
      <div class="field"><label>Dosis</label><input id="a-dose"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Volume air</label><input id="a-water"></div>
      <div class="field"><label>Biaya (Rp)</label><input id="a-cost" type="number" value="0"></div>
    </div>
    <div class="field"><label>Catatan</label><textarea id="a-note"></textarea></div>
    <button class="btn" id="a-save">Simpan</button>`, (b,close)=>{
      
      // Logika menampilkan/menyembunyikan panel resep
const checkTypeVisibility = () => {
  b.querySelector('#a-recipe-panel').style.display = b.querySelector('#a-type').value === 'Pemupukan' ? 'block' : 'none';
};

b.querySelector('#a-type').onchange = checkTypeVisibility;

// Panggil fungsi saat form pertama kali dibuka
checkTypeVisibility();

      // Snapshot resep dipertahankan sampai aktivitas disimpan.
      let selectedRecipeSnapshot = null;
      b.querySelector('#a-type').onchange = () => {
        checkTypeVisibility();
        if(b.querySelector('#a-type').value !== 'Pemupukan'){
          b.querySelector('#a-recipe').value = '';
          b.querySelector('#a-recipe-phases').style.display = 'none';
          selectedRecipeSnapshot = null;
          ['#a-prod','#a-dose','#a-water'].forEach(sel=>{ b.querySelector(sel).readOnly=false; });
        }
      };
      b.querySelector('#a-recipe').onchange = (e) => {
        const rId = e.target.value;
        const phaseSelect = b.querySelector('#a-phase');
        selectedRecipeSnapshot = null;
        if(!rId) {
          b.querySelector('#a-recipe-phases').style.display = 'none';
          ['#a-prod','#a-dose','#a-water'].forEach(sel=>{ b.querySelector(sel).readOnly=false; });
          return;
        }
        const recipe = recipes.find(r => String(r.id) === String(rId));
        if(recipe) {
          phaseSelect.innerHTML = (Array.isArray(recipe.phases)?recipe.phases:[]).map((p, i) => `<option value="${i}">${esc(p.name)} (${p.hstStart}-${p.hstEnd} HST)</option>`).join('');
          b.querySelector('#a-recipe-phases').style.display = 'block';
          ['#a-prod','#a-dose','#a-water'].forEach(sel=>{ b.querySelector(sel).readOnly=true; });
          const applyPhaseData = () => {
            const phase = recipe.phases[Number(phaseSelect.value)];
            if(!phase) return;
            selectedRecipeSnapshot = MixedFertilizer.phaseSnapshot(recipe, phase, fertilizers, season.population);
            if(!selectedRecipeSnapshot) return;
            const snapshot = selectedRecipeSnapshot;
            b.querySelector('#a-title').value = `Pemupukan: ${recipe.name} (${phase.name})`;
            b.querySelector('#a-prod').value = 'Campuran ' + snapshot.items.map(i => i.name).join(' + ');
            b.querySelector('#a-dose').value = snapshot.items.map(i=>`${i.name}: ${fmtNum(i.gramsPerPlant,3)} g/tanaman (${fmtNum(i.gramsTotal,2)} g total)`).join(' | ');
            b.querySelector('#a-water').value = `${snapshot.waterPerPlant} ml/tanaman (Total: ${fmtNum(snapshot.totalWaterL,2)} L)`;
            b.querySelector('#a-note').value = `Fase: ${phase.name} | Rasio: ${phase.items.map(i => i.ratio).join(':')}`;
          };
          phaseSelect.onchange = applyPhaseData;
          applyPhaseData();
        }
      };

      b.querySelector('#a-save').onclick = async ()=>{
        const date = b.querySelector('#a-date').value;
        if(!date) return toast('Tanggal kegiatan wajib diisi');
        const activity = { id:uid('act'), seasonId:season.id, title:b.querySelector('#a-title').value||'Kegiatan',
          type:b.querySelector('#a-type').value, date, time:b.querySelector('#a-time').value,
          hst: Math.max(0,daysBetween(CropEngine.ageStartDate(season), date)), productName:b.querySelector('#a-prod').value,
          dose:b.querySelector('#a-dose').value, waterVolume:b.querySelector('#a-water').value,
          note:b.querySelector('#a-note').value, cost:num(b.querySelector('#a-cost').value),
          status: date < todayISO() ? 'terlambat' : (date===todayISO()?'hariini':'terjadwal'), source:selectedRecipeSnapshot?'recipe':'manual' };
        if(selectedRecipeSnapshot){
          activity.mixedRecipeSnapshot=clone(selectedRecipeSnapshot);
          activity.mixedRecipes=[clone(selectedRecipeSnapshot)];
          activity.products=selectedRecipeSnapshot.items.map(item=>({name:item.name,category:'Pupuk',fertId:item.fertId,ratio:item.ratio,gramsPerPlant:item.gramsPerPlant,gramsTotal:item.gramsTotal}));
        }
        const saveButton=b.querySelector('#a-save'); if(saveButton.disabled) return; saveButton.disabled=true;
        try{ await put('activities', activity); close(); toast('Tersimpan'); Router.render(); }
        catch(error){ console.error(error); toast('Gagal menyimpan kegiatan: '+(error.message||error)); saveButton.disabled=false; }
      };
    });
    };
    
    $('#act-gen').onclick = ()=> modal('Generate dari SOP', `
      <div class="field"><label>Pilih SOP</label><select id="gen-sop">
        ${sops.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
      </select></div>
      <div class="notice">Jadwal yang sudah ada tidak akan diduplikasi.</div>
      <button class="btn" id="gen-go">Generate</button>`, async (b,close)=>{
        b.querySelector('#gen-go').onclick = async ()=>{
          const sopId = b.querySelector('#gen-sop').value;
          if(!sopId) return toast('Pilih SOP');
          const added = await SopEngine.generateSchedule(season.id, sopId);
          close(); toast(`${added.length} jadwal dibuat`); Router.render();
        };
      });
  },

  async realizeActivity(actId, season){
    const act = await getOne('activities', actId);
    if(!act) return;
    if(act.status==='selesai') return toast('Kegiatan ini sudah direalisasikan');
    const invItems = (await getAll('inventory')).filter(item=>item.active!==false && item.archived!==true);

    // Uraikan produk biasa dan bahan resep campuran menjadi baris pemakaian.
    const planned=[];
    const addRecipeItems=(recipeSnapshot, recipeLabel='Resep campuran')=>{
      (recipeSnapshot?.items||[]).forEach(item=>planned.push({
        name:item.name||'Bahan resep', productName:item.name||recipeLabel,
        fertId:item.fertId??null, productId:item.productId||(item.fertId!==null&&item.fertId!==undefined?ProductMapping.key('fertilizer',item.fertId):''), plannedGrams:num(item.gramsTotal),
        dose:item.gramsPerPlant?`${fmtNum(item.gramsPerPlant,3)} g/tanaman`:''
      }));
    };
    if(Array.isArray(act.products) && act.products.length){
      act.products.forEach(product=>{
        if(product.recipeSnapshot?.items?.length) addRecipeItems(product.recipeSnapshot,product.name);
        else planned.push({name:product.name||'Produk kegiatan',productName:product.name||'',fertId:product.fertId??null,productId:product.productId||'',plannedGrams:num(product.gramsTotal)>0?num(product.gramsTotal):null,dose:product.dose||(num(product.gramsPerPlant)>0?`${fmtNum(product.gramsPerPlant,3)} g/tanaman`: '')});
      });
    }else if(act.mixedRecipeSnapshot?.items?.length){
      addRecipeItems(act.mixedRecipeSnapshot,act.mixedRecipeSnapshot.recipeName||'Resep campuran');
    }else if(act.productName){
      planned.push({name:act.productName,productName:act.productName,plannedGrams:null,dose:act.dose||''});
    }

    const unitForGrams=(grams, unit)=>{
      const u=String(unit||'').trim().toLowerCase();
      try{return UnitConversion.convert(grams,'g',u);}catch(_){return '';}
    };
    const matchInventory=product=>{
      const key=product.productId||(product.fertId!==null&&product.fertId!==undefined?ProductMapping.key('fertilizer',product.fertId):'');
      if(key){const exact=invItems.find(item=>String(item.productId||'')===String(key));if(exact)return exact;}
      if(product.fertId!==null&&product.fertId!==undefined){const legacy=invItems.filter(item=>String(item.fertilizerId||'')===String(product.fertId));if(legacy.length===1)return legacy[0];}
      const name=String(product.name||'').trim().toLocaleLowerCase('id');
      const matches=invItems.filter(item=>String(item.name||'').trim().toLocaleLowerCase('id')===name);
      return matches.length===1?matches[0]:null;
    };
    const rowHTML=(product,index)=>{
      const matched=matchInventory(product);
      const selected=matched?String(matched.id):'';
      const suggested=matched && num(product.plannedGrams)>0 ? unitForGrams(num(product.plannedGrams),matched.unit) : '';
      return `<div class="card" data-real-row style="padding:10px;margin:8px 0;border:1px solid var(--border,#ddd)">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:6px">
          <strong>${esc(product.name||'Pemakaian bahan')}</strong>
          <button type="button" class="btn small danger" data-remove-usage>Hapus</button>
        </div>
        ${product.dose?`<small class="muted">Rencana: ${esc(product.dose)}${num(product.plannedGrams)>0?` · Total resep ${fmtNum(product.plannedGrams,2)} g`:''}</small>`:''}
        ${!matched?'<div class="tiny muted" style="margin:4px 0;color:#a65b00">Belum ada pemetaan ID otomatis. Pilih barang Inventory secara manual.</div>':''}
        <div class="field"><label>Hubungkan dengan barang inventory</label>
          <select data-usage-inv><option value="">— Tidak mengurangi stok —</option>
            ${invItems.map(item=>`<option value="${esc(item.id)}" ${String(item.id)===selected?'selected':''}>${esc(item.name)} · stok ${fmtNum(item.stock,3)} ${esc(item.unit)}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field"><label>Jumlah aktual dipakai</label><input data-usage-qty type="number" min="0" step="0.0001" value="${suggested!==''?esc(suggested):''}" placeholder="0"></div>
          <div class="field"><label>Satuan stok</label><input data-usage-unit value="${matched?esc(matched.unit):''}" readonly placeholder="Pilih inventory"></div>
        </div>
        <small class="muted" data-usage-cost>Estimasi biaya: Rp0</small>
      </div>`;
    };
    let rows=planned.length?planned.map(rowHTML).join(''):rowHTML({name:'Pemakaian bahan tambahan',productName:'',plannedGrams:null},0);
    modal('Realisasi Kegiatan', `
      <h3>${esc(act.title)}</h3>
      <p class="subtitle">Catat pemakaian aktual. Stok, transaksi inventory, dan biaya produksi akan diperbarui bersama dalam satu transaksi.</p>
      <div class="field-row">
        <div class="field"><label>Dosis aktual / catatan dosis</label><input id="r-dose" value="${esc(act.dose||'')}"></div>
        <div class="field"><label>Tanggal realisasi</label><input id="r-date" type="date" value="${todayISO()}"></div>
      </div>
      <div class="section-head"><h4>Pemakaian Produk & Pupuk</h4><button type="button" class="btn small secondary" id="r-add-usage">+ Produk</button></div>
      <div id="r-usage-list">${rows}</div>
      <div class="card" style="padding:10px">
        <div class="list-row"><span>Estimasi biaya bahan inventory</span><strong id="r-material-cost">Rp0</strong></div>
        <div class="field"><label>Biaya tambahan (tenaga kerja, transportasi, dll.) Rp</label><input id="r-extra-cost" type="number" min="0" step="1" value="0"></div>
        <div class="list-row"><strong>Total estimasi biaya produksi</strong><strong id="r-total-cost">Rp0</strong></div>
      </div>
      <div class="field"><label>Catatan realisasi</label><textarea id="r-note">${esc(act.note||'')}</textarea></div>
      <div class="notice">Barang inventory yang dipilih akan dikurangi sesuai jumlah aktual. Pastikan satuan jumlah sama dengan satuan stok. Jika tidak memilih inventory, aplikasi hanya mencatat realisasi tanpa mengurangi stok.</div>
      <button class="btn" id="r-save">Simpan Realisasi</button>`, async (b,close)=>{
        const list=b.querySelector('#r-usage-list');
        const money=value=>'Rp'+Math.round(num(value)).toLocaleString('id-ID');
        const updateCostPreview=()=>{
          let material=0;
          list.querySelectorAll('[data-real-row]').forEach(row=>{
            const id=row.querySelector('[data-usage-inv]').value;
            const qty=num(row.querySelector('[data-usage-qty]').value);
            const item=invItems.find(x=>String(x.id)===String(id));
            const amount=item && qty>0 ? qty*num(item.price) : 0;
            material+=amount;
            row.querySelector('[data-usage-cost]').textContent='Estimasi biaya: '+money(amount);
          });
          b.querySelector('#r-material-cost').textContent=money(material);
          b.querySelector('#r-total-cost').textContent=money(material+num(b.querySelector('#r-extra-cost').value));
        };
        const bindRows=()=>{
          list.querySelectorAll('[data-real-row]').forEach(row=>{
            const select=row.querySelector('[data-usage-inv]');
            const qtyInput=row.querySelector('[data-usage-qty]');
            const unitInput=row.querySelector('[data-usage-unit]');
            select.onchange=()=>{
              const item=invItems.find(x=>String(x.id)===String(select.value));
              unitInput.value=item?.unit||'';
              if(item){
                const label=row.querySelector('strong')?.textContent||'';
                const source=planned.find(x=>x.name===label);
                if(source && num(source.plannedGrams)>0){ const converted=unitForGrams(num(source.plannedGrams),item.unit); if(converted!=='') qtyInput.value=converted; }
              }
              updateCostPreview();
            };
            qtyInput.oninput=updateCostPreview;
            row.querySelector('[data-remove-usage]').onclick=()=>{row.remove();updateCostPreview();};
            if(select.value){const item=invItems.find(x=>String(x.id)===String(select.value));unitInput.value=item?.unit||'';}
          });
          updateCostPreview();
        };
        bindRows();
        b.querySelector('#r-add-usage').onclick=()=>{
          list.insertAdjacentHTML('beforeend',rowHTML({name:'Produk tambahan',productName:'',plannedGrams:null,dose:''},list.children.length));
          bindRows();
        };
        b.querySelector('#r-extra-cost').oninput=updateCostPreview;
        b.querySelector('#r-save').onclick=async()=>{
          const usages=[];
          for(const row of list.querySelectorAll('[data-real-row]')){
            const invId=row.querySelector('[data-usage-inv]').value;
            const qty=num(row.querySelector('[data-usage-qty]').value);
            if(!invId){ if(qty>0) return toast('Pilih barang inventory untuk jumlah pemakaian yang diisi'); continue; }
            if(qty<=0) return toast('Jumlah aktual untuk inventory yang dipilih harus lebih dari nol');
            const item=invItems.find(x=>String(x.id)===String(invId));
            if(!item) return toast('Barang inventory tidak ditemukan');
            usages.push({inventoryId:item.id,productId:item.productId||'',qty,unit:item.unit,name:item.name,productName:row.querySelector('strong')?.textContent||item.name});
          }
          const saveButton=b.querySelector('#r-save'); if(saveButton.disabled) return; saveButton.disabled=true;
          try{
            const result=await completeActivityRealization({activityId:act.id,usages,
              date:b.querySelector('#r-date').value||todayISO(),doseActual:b.querySelector('#r-dose').value,
              extraCost:num(b.querySelector('#r-extra-cost').value),note:b.querySelector('#r-note').value});
            close();
            toast(`Realisasi tersimpan · stok ${result.transactions} item · biaya ${money(result.totalCost)}`);
            Router.render();
          }catch(error){
            console.error('Gagal menyimpan realisasi:',error);
            toast(error.message||'Gagal menyimpan realisasi');
            saveButton.disabled=false;
          }
        };
      });
  },

  /* ============== ANALYTICS ============== */
  async renderAnalytics(container, season){
    container.innerHTML = `
      <h2 class="page-title">Analisis</h2>
      <p class="subtitle">Analisis cerdas & laporan.</p>
      <div class="tabs">
        <button data-tab="smart" class="active">Smart Analytics</button>
        <button data-tab="reports">Laporan & Ekspor</button>
      </div>
      <div id="ana-content"></div>`;
    const show = async tab=>{
      container.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active', x.dataset.tab===tab));
      const el = $('#ana-content');
      if(tab==='smart') Analytics.render(el, season);
      if(tab==='reports') Reports.render(el, season);
    };
    container.querySelectorAll('[data-tab]').forEach(b=>b.onclick = ()=> show(b.dataset.tab));
    await show('smart');
  }
};

/* ============== BOOT ============== */
document.addEventListener('DOMContentLoaded', ()=> App.init());
