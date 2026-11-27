/* ============ Calculator (Aplikasi dosis langsung) ============ */
const Calculator = {
  async render(container, season){
    const s = season;
    const fertilizers = await getAll('fertilizers');
    const hst = s ? CropEngine.hstOf(s) : 0;
    const ageLabel = s ? CropEngine.ageLabel(s) : 'HST';
    const phase = s ? (await CropEngine.phaseForSeason(s, hst)).name : '—';
    container.innerHTML = `
      <h2 class="page-title">Kalkulator Dosis</h2>
      <p class="subtitle">Hitung kebutuhan produk per liter, per tangki, per tanaman, dan total.</p>
      ${!s ? `<div class="notice">Buat musim tanam dulu di menu Budidaya → Musim.</div>` : `
      <div class="card">
        <div class="tag">KONTEKS</div>
        <h3 style="margin:6px 0">${esc(s.commodityName)} · ${ageLabel} ${hst} · ${esc(phase)}</h3>
        <p class="muted tiny">${esc(s.landName)} · ${fmtNum(s.area)} m²</p>
        <div class="field"><label>Produk pupuk (Master Data)</label>
          <select id="cal-prod" ${fertilizers.length ? '' : 'disabled'}>
            <option value="">— Pilih produk pupuk —</option>
            ${fertilizers.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}
          </select>
          ${fertilizers.length ? '' : '<small class="muted">Belum ada produk pupuk. Tambahkan melalui Master Data → Pupuk.</small>'}
        </div>
        <div class="field-row">
          <div class="field"><label>Dosis per liter</label><input id="cal-dose" type="number" step="0.01" value="1" min="0"></div>
          <div class="field"><label>Satuan</label><select id="cal-unit"><option>ml</option><option>g</option></select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Luas (m²)</label><input id="cal-area" type="number" value="${num(s.area)}" min="1"></div>
          <div class="field"><label>Larutan/1000 m² (L)</label><input id="cal-water" type="number" value="160" min="1"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Ukuran tangki (L)</label><input id="cal-tank" type="number" value="16" min="1"></div>
          <div class="field"><label>Populasi tanaman</label><input id="cal-pop" type="number" value="${num(s.population)||0}" min="0"></div>
        </div>
        <button class="btn" id="cal-go">Hitung</button>
      </div>
      <div id="cal-out"></div>`}`;

    if(!s) return;
    $('#cal-go').onclick = () => {
      const selected = fertilizers.find(f=>String(f.id)===String($('#cal-prod').value));
      const product = selected ? selected.name : '';
      const dose = num($('#cal-dose').value);
      const unit = $('#cal-unit').value;
      const area = num($('#cal-area').value);
      const water = num($('#cal-water').value);
      const tank = num($('#cal-tank').value);
      const pop = num($('#cal-pop').value);
      if(!selected || dose<=0 || area<=0 || water<=0 || tank<=0 || pop<0) return toast('Pilih produk pupuk dari Master Data dan masukkan dosis, luas, air, serta ukuran tangki yang valid');
      let r; try { r = NutritionEngine.dosePerArea({ productDose:dose, doseUnit:unit, areaM2:area, waterPer1000L:water, plantPopulation:pop, tankSizeL:tank }); } catch(err) { return toast(err.message); }
      $('#cal-out').innerHTML = `
        <div class="card">
          <div class="tag">HASIL</div>
          <h3>${esc(product)}</h3>
          <div class="grid">
            <div class="metric"><span>Per liter</span><strong>${fmtNum(dose,2)} ${unit}</strong></div>
            <div class="metric"><span>Per tangki ${tank} L</span><strong>${fmtNum(r.perTank,1)} ${unit}</strong></div>
            <div class="metric"><span>Per tanaman</span><strong>${r.perPlant?fmtNum(r.perPlant,2)+' '+unit:'—'}</strong></div>
            <div class="metric"><span>Per 1000 m²</span><strong>${fmtNum(r.per1000m2,1)} ${unit}</strong></div>
            <div class="metric"><span>Per hektare</span><strong>${fmtNum(r.perHa,1)} ${unit}</strong></div>
            <div class="metric"><span>Jumlah tangki</span><strong>${r.tanks}</strong></div>
          </div>
          <div class="kpi" style="margin-top:12px"><span>Total kebutuhan ${esc(product)}</span><strong>${fmtNum(r.totalProduct,2)} ${unit}</strong><small>Total air: ${fmtNum(r.totalWaterL,0)} L</small></div>
          <div class="btn-row">
            <button class="btn secondary" id="cal-save">Simpan Riwayat</button>
            <button class="btn" id="cal-add">Jadikan Tugas</button>
          </div>
          <div class="notice">Ini kalkulasi aritmatika. Keamanan dosis tetap mengikuti label produk.</div>
        </div>`;
      bindOnce($('#cal-save'), async () => {
        await NutritionEngine.saveHistory(s.id, { type:'dose', product, dose, unit, area, water, tank, pop, result:r });
        toast('Riwayat disimpan');
      });
      bindOnce($('#cal-add'), async () => {
        await put('activities', {
          id:uid('act'), seasonId:s.id, title:'Aplikasi '+product, type:'Penyemprotan',
          date:todayISO(), time:'07:00', hst, productName:product, dose:dose+' '+unit+'/L',
          doseActual:'', waterVolume:r.totalWaterL+' L', note:'', cost:0,
          status:'terjadwal', source:'calc'
        });
        toast('Tugas dibuat'); Router.go('activity');
      });
    };
  }
};