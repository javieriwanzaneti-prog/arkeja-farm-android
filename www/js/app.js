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
      picker.innerHTML = `<select id="sp-select">${seasons.map(s=>`<option value="${s.id}" ${s.id===activeId?'selected':''}>${esc(s.commodityName||s.name)}</option>`).join('')}</select>`;
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
    const phase = s ? (await CropEngine.phaseForHST(s.commodityId, hst)).name : '—';
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
        <div class="hstdot"><small>HST</small>${hst}</div>
        <h3>${esc(s.commodityName)}</h3>
        <p>${esc(s.landName)} · ${esc(phase)}</p>
        <div class="pill">${esc(s.weather||'—')}</div>
        <div class="pill">${fmtNum(s.area)} m²</div>
        <div class="progress"><div style="width:${Math.min(100, hst / Math.max(1, s.commodityId ? 100 : 100) * 100)}%"></div></div>
        <small style="font-size:11px">Tanam ${fmtDate(s.plantingDate)} · Target: ${esc(s.targetHarvest||'—')}</small>
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
            <div class="task-main"><strong>${esc(a.title)}</strong><small>${esc(a.type)} · HST ${a.hst} · ${esc(a.dose||'')}</small></div>
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
            <button class="btn small secondary" data-land-season="${l.id}">Mulai Musim</button>
          </div>`).join('') : '<div class="empty">Belum ada lahan.</div>'}
      </div>
      <div class="card">
        <div class="section-head"><h3>Musim Tanam</h3><button class="btn small" id="season-add">+ Musim</button></div>
        ${seasons.length ? seasons.map(s=>`
          <div class="list-row">
            <div><strong>${esc(s.commodityName)}</strong><small>${esc(s.landName)} · Tanam ${fmtDate(s.plantingDate)}</small>
              <div class="tiny muted">Varietas: ${esc(s.varietyName||'—')} · Populasi: ${fmtNum(s.population||0)}</div>
            </div>
            <button class="btn small ${s.id===Prefs.get('activeSeasonId')?'':'outline'}" data-activate="${s.id}">${s.id===Prefs.get('activeSeasonId')?'Aktif':'Pilih'}</button>
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
        <div class="list-row"><span>HST</span><strong>${CropEngine.hstOf(season)}</strong></div>
        <div class="list-row"><span>Luas</span><strong>${fmtNum(season.area)} m²</strong></div>
      </div>`:''}
      <footer>Pilih musim aktif untuk modul analisis yang akurat.</footer>`;
    container.querySelectorAll('[data-go]').forEach(b=>b.onclick = ()=> Router.go(b.dataset.go));
    container.querySelectorAll('[data-activate]').forEach(b=>b.onclick = ()=> {
      Prefs.set('activeSeasonId', b.dataset.activate); App.updateHeader(); Router.render(); toast('Musim aktif diganti');
    });
    container.querySelectorAll('[data-land-season]').forEach(b=>b.onclick = ()=> App.seasonForm(container, b.dataset.landSeason));
    $('#land-add').onclick = ()=> App.landForm(container);
    $('#season-add').onclick = ()=> App.seasonForm(container);
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
        b.querySelector('#l-photo').onchange = async e=>{
          const u = await imageToDataURL(e.target.files[0], 900);
          if(u){ const p=b.querySelector('#l-preview'); p.src=u; p.style.display='block'; }
        };
        b.querySelector('#l-save').onclick = async ()=>{
          const photo = b.querySelector('#l-preview').style.display==='block' ? b.querySelector('#l-preview').src : '';
          await put('lands', { id:uid('land'), name:b.querySelector('#l-name').value||'Lahan',
            area:num(b.querySelector('#l-area').value), soilType:b.querySelector('#l-soil').value,
            ph:num(b.querySelector('#l-ph').value), ec:num(b.querySelector('#l-ec').value),
            drainage:b.querySelector('#l-drain').value, waterSource:b.querySelector('#l-water').value,
            waterTds:num(b.querySelector('#l-tds').value), irrigationSystem:b.querySelector('#l-irr').value, photo });
          close(); toast('Lahan tersimpan'); Router.render();
        };
      });
  },

  async seasonForm(container, landId){
    const lands = await getAll('lands');
    const coms = await getAll('commodities');
    if(!lands.length){
      container.innerHTML = `<div class="notice">Belum ada lahan. Tambahkan lahan terlebih dahulu.</div>
        <button class="btn" id="go-land">+ Tambah Lahan</button>`;
      $('#go-land').onclick = ()=> App.landForm(container); return;
    }
    modal('Mulai Musim Tanam', `
      <div class="field"><label>Nama musim</label><input id="s-name" value="Musim ${new Date().getMonth()+1}/${new Date().getFullYear()}"></div>
      <div class="field"><label>Lahan</label><select id="s-land">${lands.map(l=>`<option value="${l.id}" ${l.id===landId?'selected':''}>${esc(l.name)} · ${fmtNum(l.area)} m²</option>`).join('')}</select></div>
      <div class="field"><label>Komoditas</label><select id="s-com">${coms.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Varietas</label><select id="s-var"><option value="">— Pilih nanti —</option></select></div>
      <div class="field-row">
        <div class="field"><label>Tanggal semai</label><input id="s-seed" type="date" value="${todayISO()}"></div>
        <div class="field"><label>Tanggal tanam</label><input id="s-plant" type="date" value="${todayISO()}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Pindah tanam</label><input id="s-trans" type="date"></div>
        <div class="field"><label>Populasi tanaman</label><input id="s-pop" type="number" value="1000"></div>
      </div>
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
        const allSops = await getAll('sops');
        const updateVars = ()=>{
          const comId = b.querySelector('#s-com').value;
          b.querySelector('#s-var').innerHTML = '<option value="">— Pilih —</option>' +
            allVars.filter(v=>v.commodityId===comId).map(v=>`<option value="${v.id}">${esc(v.name)}</option>`).join('');
          b.querySelector('#s-sop').innerHTML = '<option value="">— Belum pilih —</option>' +
            allSops.filter(s=>s.commodityId===comId || !s.commodityId).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
        };
        updateVars();
        b.querySelector('#s-com').onchange = updateVars;
        b.querySelector('#s-save').onclick = async ()=>{
          const land = lands.find(l=>l.id===b.querySelector('#s-land').value);
          const com = coms.find(c=>c.id===b.querySelector('#s-com').value);
          const varId = b.querySelector('#s-var').value;
          const varObj = allVars.find(v=>v.id===varId);
          const sopId = b.querySelector('#s-sop').value || null;
          const s = {
            id:uid('season'), name:b.querySelector('#s-name').value,
            landId:land.id, landName:land.name, area:land.area,
            commodityId:com.id, commodityName:com.name,
            varietyId:varObj?.id||null, varietyName:varObj?.name||'',
            plantingDate:b.querySelector('#s-plant').value, seedDate:b.querySelector('#s-seed').value,
            transplantDate:b.querySelector('#s-trans').value,
            population:num(b.querySelector('#s-pop').value), plantSpacing:b.querySelector('#s-sp').value,
            effectiveArea:num(b.querySelector('#s-eff').value), targetHarvest:b.querySelector('#s-target').value,
            weather:b.querySelector('#s-weather').value, cultivationMethod:b.querySelector('#s-method').value,
            sopId, status:'aktif', createdAt:todayISO()
          };
          await put('seasons', s);
          Prefs.set('activeSeasonId', s.id);
          if(sopId){
            const added = await SopEngine.generateSchedule(s.id, sopId);
            toast(`Musim dibuat + ${added.length} jadwal dari SOP`);
          } else toast('Musim dibuat');
          close(); App.updateHeader(); Router.render();
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
      if(tab==='history') App.renderNutHistory(el, season);
    };
    container.querySelectorAll('[data-tab]').forEach(b=>b.onclick = ()=> show(b.dataset.tab));
    await show('dose');
  },

  async renderPpm(container, season){
    const ferts = await getAll('fertilizers');
    container.innerHTML = `
      <div class="card">
        <h3>Kalkulator PPM</h3>
        <p class="muted tiny">Hitung ppm aktual dari gram pupuk terlarut.</p>
        <div class="field"><label>Pilih pupuk</label><select id="ppm-fer">${ferts.map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select></div>
        <div class="field-row">
          <div class="field"><label>Gram pupuk</label><input id="ppm-g" type="number" step="0.1" value="5"></div>
          <div class="field"><label>Liter air</label><input id="ppm-l" type="number" step="0.1" value="1"></div>
        </div>
        <button class="btn" id="ppm-go">Hitung</button>
        <div id="ppm-out"></div>
      </div>`;
    $('#ppm-go').onclick = ()=>{
      const f = ferts.find(x=>x.id===$('#ppm-fer').value);
      if(!f) return;
      const g = num($('#ppm-g').value), l = num($('#ppm-l').value);
      if(l<=0) return toast('Volume air harus > 0');
      const els = ['N','P2O5','K2O','Ca','Mg','S','Fe','Mn','Zn','Cu','B','Mo'];
      const ppmCalc = {
        N: NutritionEngine.ppmFromGrams(g, l, f.N),
        P: NutritionEngine.ppmFromGrams(g, l, f.P2O5) * NutritionEngine.P_FROM_P2O5,
        K: NutritionEngine.ppmFromGrams(g, l, f.K2O) * NutritionEngine.K_FROM_K2O,
        Ca: NutritionEngine.ppmFromGrams(g, l, f.Ca),
        Mg: NutritionEngine.ppmFromGrams(g, l, f.Mg),
        S: NutritionEngine.ppmFromGrams(g, l, f.S),
        Fe: NutritionEngine.ppmFromGrams(g, l, f.Fe),
        Mn: NutritionEngine.ppmFromGrams(g, l, f.Mn),
        Zn: NutritionEngine.ppmFromGrams(g, l, f.Zn),
        Cu: NutritionEngine.ppmFromGrams(g, l, f.Cu),
        B: NutritionEngine.ppmFromGrams(g, l, f.B),
        Mo: NutritionEngine.ppmFromGrams(g, l, f.Mo)
      };
      $('#ppm-out').innerHTML = `<div class="green-notice notice">Total ${fmtNum(g,1)} g dalam ${fmtNum(l,2)} L = ${fmtNum(g/l,1)} g/L</div>
        <div class="grid" style="margin-top:8px">
          ${Object.entries(ppmCalc).map(([k,v])=>`<div class="metric"><span>${k}</span><strong>${v.toFixed(1)} ppm</strong></div>`).join('')}
        </div>
        <p class="tiny muted">P dari P2O5 × 0.4364; K dari K2O × 0.8301. Hasil teoretis.</p>`;
      if(season) NutritionEngine.saveHistory(season.id, { type:'ppm', fertilizerId:f.id, grams:g, liters:l, result:ppmCalc });
    };
  },

  async renderAbMix(container, season){
    container.innerHTML = `
      <div class="card">
        <h3>Kalkulator AB Mix</h3>
        <p class="muted tiny">Perhitungan sederhana berdasarkan % unsur di label.</p>
        <div class="field"><label>Volume stok A (L)</label><input id="ab-vol" type="number" value="10"></div>
        <div class="field-row">
          <div class="field"><label>Target N (ppm)</label><input id="ab-n" type="number" value="150"></div>
          <div class="field"><label>Target P (ppm)</label><input id="ab-p" type="number" value="50"></div>
          <div class="field"><label>Target K (ppm)</label><input id="ab-k" type="number" value="200"></div>
        </div>
        <p class="tiny muted">% Unsur Formula A (sumber N)</p>
        <div class="field-row">
          <div class="field"><label>% N-A</label><input id="ab-na" type="number" value="15"></div>
          <div class="field"><label>% P-A</label><input id="ab-pa" type="number" value="0"></div>
          <div class="field"><label>% K-A</label><input id="ab-ka" type="number" value="0"></div>
        </div>
        <p class="tiny muted">% Unsur Formula B (sumber P & K)</p>
        <div class="field-row">
          <div class="field"><label>% N-B</label><input id="ab-nb" type="number" value="0"></div>
          <div class="field"><label>% P-B</label><input id="ab-pb" type="number" value="20"></div>
          <div class="field"><label>% K-B</label><input id="ab-kb" type="number" value="30"></div>
        </div>
        <button class="btn" id="ab-go">Hitung</button>
        <div id="ab-out"></div>
      </div>`;
    $('#ab-go').onclick = async ()=>{
      const vol = num($('#ab-vol').value);
      const tN = num($('#ab-n').value), tP = num($('#ab-p').value), tK = num($('#ab-k').value);
      const nA = num($('#ab-na').value), pA = num($('#ab-pa').value), kA = num($('#ab-ka').value);
      const nB = num($('#ab-nb').value), pB = num($('#ab-pb').value), kB = num($('#ab-kb').value);
      const gA = NutritionEngine.targetPpmToGrams(tN, vol, nA);
      const gBP = NutritionEngine.targetPpmToGrams(tP, vol, pB);
      const gBK = NutritionEngine.targetPpmToGrams(tK, vol, kB);
      $('#ab-out').innerHTML = `<div class="green-notice notice">Asumsi: A & B dicampur terpisah (jangan dicampur pekat).</div>
        <div class="grid" style="margin-top:8px">
          <div class="metric"><span>Gram Formula A</span><strong>${gA?gA.toFixed(2):'—'} g</strong></div>
          <div class="metric"><span>Gram Formula B (P)</span><strong>${gBP?gBP.toFixed(2):'—'} g</strong></div>
          <div class="metric"><span>Gram Formula B (K)</span><strong>${gBK?gBK.toFixed(2):'—'} g</strong></div>
        </div>
        <p class="tiny muted">Hasil perkiraan. Validasi dengan EC/pH meter saat pengenceran.</p>`;
      if(season) NutritionEngine.saveHistory(season.id, { type:'abmix', vol, targetN:tN, targetP:tP, targetK:tK, result:{gA,gBP,gBK} });
    };
  },

  async renderFormulator(container, season){
    const ferts = await getAll('fertilizers');
    container.innerHTML = `
      <div class="card">
        <h3>Nutrition Formulator</h3>
        <p class="muted tiny">Pilih target ppm, hitung kombinasi pupuk sederhana dari database.</p>
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
    const sops = await getAll('sops');
    container.innerHTML = `
      <h2 class="page-title">Aktivitas & Jadwal</h2>
      <p class="subtitle">Status kegiatan, realisasi, dan biaya.</p>
      <div class="btn-row">
        <button class="btn" id="act-add">+ Manual</button>
        <button class="btn secondary" id="act-gen">Generate dari SOP</button>
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
              <small class="muted">${esc(a.type)} · ${fmtDate(a.date)} · HST ${a.hst}</small>
              ${a.productName||a.dose ? `<div class="tiny muted">${esc(a.productName||'')} ${esc(a.dose||'')} ${esc(a.waterVolume||'')}</div>`:''}
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
      container.querySelectorAll('[data-del]').forEach(b=>b.onclick = ()=> confirmDialog('Hapus kegiatan?', async ()=>{
        await del('activities', b.dataset.del); toast('Terhapus'); Router.render();
      }));
    };
    renderList();
    container.querySelectorAll('[data-f]').forEach(b=>b.onclick = ()=>{
      container.querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('active', x===b));
      renderList(b.dataset.f);
    });
    $('#act-add').onclick = ()=>{
      modal('Tambah Kegiatan', `
        <div class="field"><label>Nama kegiatan</label><input id="a-title"></div>
        <div class="field"><label>Jenis</label><select id="a-type">
          <option>Pemupukan</option><option>Penyemprotan</option><option>Penyiraman</option>
          <option>Pemangkasan</option><option>Penyiangan</option><option>Pengendalian OPT</option>
          <option>Monitoring</option><option>Penyerbukan</option><option>Panen</option><option>Lainnya</option>
        </select></div>
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
          b.querySelector('#a-save').onclick = async ()=>{
            const date = b.querySelector('#a-date').value;
            await put('activities', { id:uid('act'), seasonId:season.id, title:b.querySelector('#a-title').value||'Kegiatan',
              type:b.querySelector('#a-type').value, date, time:b.querySelector('#a-time').value,
              hst: daysBetween(season.plantingDate, date), productName:b.querySelector('#a-prod').value,
              dose:b.querySelector('#a-dose').value, waterVolume:b.querySelector('#a-water').value,
              note:b.querySelector('#a-note').value, cost:num(b.querySelector('#a-cost').value),
              status: date < todayISO() ? 'terlambat' : (date===todayISO()?'hariini':'terjadwal'), source:'manual' });
            close(); toast('Tersimpan'); Router.render();
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
    const invItems = await getAll('inventory');
    modal('Realisasi Kegiatan', `
      <h3>${esc(act.title)}</h3>
      <div class="field-row">
        <div class="field"><label>Dosis aktual</label><input id="r-dose" value="${esc(act.dose||'')}"></div>
        <div class="field"><label>Biaya (Rp)</label><input id="r-cost" type="number" value="${act.cost||0}"></div>
      </div>
      <div class="field"><label>Produk dari inventory (opsional)</label>
        <select id="r-inv"><option value="">— Tidak pakai inventory —</option>
          ${invItems.map(i=>`<option value="${i.id}">${esc(i.name)} (stok ${fmtNum(i.stock)} ${esc(i.unit)})</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field"><label>Jumlah pakai</label><input id="r-qty" type="number" step="0.01" value="0"></div>
        <div class="field"><label>Satuan</label><input id="r-unit" value="kg"></div>
      </div>
      <div class="field"><label>Catatan</label><textarea id="r-note">${esc(act.note||'')}</textarea></div>
      <button class="btn" id="r-save">Simpan Realisasi</button>`, async (b,close)=>{
        b.querySelector('#r-save').onclick = async ()=>{
          const invId = b.querySelector('#r-inv').value;
          const qty = num(b.querySelector('#r-qty').value);
          if(invId && qty > 0){
            const item = await getOne('inventory', invId);
            if(!item){ return toast('Item inventory tidak ditemukan'); }
            if(item.stock < qty){ return toast('Stok tidak cukup'); }
            await put('inventory', { ...item, stock: item.stock - qty });
            await put('inv_tx', { id:uid('tx'), inventoryId:item.id, type:'out', qty, date:todayISO(), note:'Realisasi: '+act.title, seasonId:season.id });
          }
          await put('activities', { ...act, status:'selesai', doseActual:b.querySelector('#r-dose').value,
            cost:num(b.querySelector('#r-cost').value), note:b.querySelector('#r-note').value, realizedAt: new Date().toISOString() });
          if(num(b.querySelector('#r-cost').value) > 0){
            await put('costs', { id:uid('cost'), seasonId:season.id, name:'Realisasi: '+act.title,
              category: act.type==='Pemupukan'?'Pupuk':act.type==='Penyemprotan'?'Pestisida':'Lainnya',
              amount:num(b.querySelector('#r-cost').value), date:todayISO(), note:'Otomatis dari realisasi' });
          }
          close(); toast('Realisasi tersimpan'); Router.render();
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
