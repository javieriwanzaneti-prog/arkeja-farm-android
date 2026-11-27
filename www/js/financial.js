/* ============ Financial ============ */
const Financial = {
  async summary(seasonId){
    const costs = await getByIndex('costs', 'seasonId', seasonId);
    const harvests = await getByIndex('harvests', 'seasonId', seasonId);
    const legacyRows = await getByIndex('revenues', 'seasonId', seasonId);
    const legacyRevenues = legacyRows.filter(r=>{
      const amount=num(r.amount??r.revenue??r.total??r.income??r.value);
      if(!(amount>0)) return false;
      // Hindari menghitung ulang pendapatan lama yang sama dengan transaksi panen.
      return !harvests.some(h=>String(h.date||'')===String(r.date||'') && Math.abs(num(h.revenue||num(h.weightKg)*num(h.pricePerKg))-amount)<0.01);
    });
    const totalCost = costs.reduce((a,c)=>a+num(c.amount),0);
    const harvestRevenue = harvests.reduce((a,h)=>a+num(h.revenue||h.weightKg*h.pricePerKg),0);
    const legacyRevenue = legacyRevenues.reduce((a,r)=>a+num(r.amount??r.revenue??r.total??r.income??r.value),0);
    const totalRevenue = harvestRevenue + legacyRevenue;
    const totalKg = harvests.reduce((a,h)=>a+num(h.weightKg),0);
    const profit = totalRevenue - totalCost;
    const hpp = totalKg>0 ? totalCost/totalKg : 0;
    const bepPrice = totalKg>0 ? totalCost/totalKg : 0;
    const roi = totalCost>0 ? (profit/totalCost*100) : 0;
    const margin = totalRevenue>0 ? (profit/totalRevenue*100) : 0;
    const byCategory = {};
    costs.forEach(c=>{ byCategory[c.category||'Lainnya'] = (byCategory[c.category||'Lainnya']||0) + num(c.amount); });
    const season = await getOne('seasons', seasonId).catch(()=>null);
    const effectiveArea = num(season?.effectiveArea ?? season?.area);
    const population = num(season?.population);
    const averageHarvestPrice = totalKg>0 ? harvestRevenue/totalKg : 0;
    const breakEvenKg = averageHarvestPrice>0 ? totalCost/averageHarvestPrice : null;
    const costPerPlant = population>0 ? totalCost/population : null;
    const revenuePerPlant = population>0 ? totalRevenue/population : null;
    const profitPerPlant = population>0 ? profit/population : null;
    const costPerM2 = effectiveArea>0 ? totalCost/effectiveArea : null;
    const revenuePerM2 = effectiveArea>0 ? totalRevenue/effectiveArea : null;
    const profitPerM2 = effectiveArea>0 ? profit/effectiveArea : null;
    const monthly = {};
    const addMonth = (date, key, amount) => {
      const month=String(date||'').slice(0,7);
      if(!/^\d{4}-\d{2}$/.test(month)) return;
      if(!monthly[month]) monthly[month]={month,cost:0,revenue:0,net:0};
      monthly[month][key]+=num(amount);
    };
    costs.forEach(c=>addMonth(c.date,'cost',c.amount));
    harvests.forEach(h=>addMonth(h.date,'revenue',h.revenue||num(h.weightKg)*num(h.pricePerKg)));
    legacyRevenues.forEach(r=>addMonth(r.date,'revenue',r.amount??r.revenue??r.total??r.income??r.value));
    const monthlyCashflow=Object.values(monthly).sort((a,b)=>a.month.localeCompare(b.month)).map(m=>({...m,net:m.revenue-m.cost}));
    return { totalCost, totalRevenue, harvestRevenue, legacyRevenue, legacyRevenues, totalKg, profit, hpp, bepPrice, roi, margin, byCategory, costs, harvests,
      effectiveArea, population, averageHarvestPrice, breakEvenKg, costPerPlant, revenuePerPlant, profitPerPlant, costPerM2, revenuePerM2, profitPerM2, monthlyCashflow };
  },

  async render(container, season){
    const s = season;
    if(!s){ container.innerHTML = '<h2 class="page-title">Keuangan</h2><div class="notice">Pilih musim dulu.</div>'; return; }
    const sum = await this.summary(s.id);
    container.innerHTML = `
      <h2 class="page-title">Keuangan Usaha Tani</h2>
      <p class="subtitle">Biaya, pendapatan, HPP, dan analisis laba.</p>
      <div class="grid">
        <div class="metric orange"><span>Total biaya</span><strong>${rupiah(sum.totalCost)}</strong></div>
        <div class="metric green"><span>Total pendapatan</span><strong>${rupiah(sum.totalRevenue)}</strong></div>
      </div>
      <div class="kpi" style="margin-top:10px"><span>${sum.profit>=0?'Laba':'Rugi'}</span><strong>${rupiah(sum.profit)}</strong>
        <small>ROI ${sum.roi.toFixed(1)}% · Margin ${sum.margin.toFixed(1)}% · HPP ${rupiah(sum.hpp)}/kg</small>
      </div>
      <div class="card">
        <h3>Analisis Keuangan Lanjutan</h3>
        <div class="grid">
          <div class="metric"><span>Harga jual rata-rata panen</span><strong>${sum.totalKg>0?rupiah(sum.averageHarvestPrice)+'/kg':'—'}</strong></div>
          <div class="metric"><span>BEP volume</span><strong>${sum.breakEvenKg===null?'—':fmtNum(sum.breakEvenKg,2)+' kg'}</strong></div>
          <div class="metric"><span>Biaya per tanaman</span><strong>${sum.costPerPlant===null?'—':rupiah(sum.costPerPlant)}</strong></div>
          <div class="metric"><span>Laba per m²</span><strong>${sum.profitPerM2===null?'—':rupiah(sum.profitPerM2)}</strong></div>
        </div>
        <p class="tiny muted">BEP volume dihitung dari total biaya dibagi harga jual rata-rata transaksi panen. Jika belum ada panen atau harga valid, BEP volume tidak ditampilkan. Biaya per tanaman dan per m² hanya dihitung jika populasi dan luas efektif tersedia.</p>
        <h4>Arus kas bulanan</h4>
        ${sum.monthlyCashflow.length?sum.monthlyCashflow.map(m=>`<div class="list-row"><div><strong>${esc(m.month)}</strong><small>Biaya ${rupiah(m.cost)} · Pendapatan ${rupiah(m.revenue)}</small></div><strong style="color:${m.net>=0?'var(--green)':'#b45309'}">${rupiah(m.net)}</strong></div>`).join(''):'<div class="empty">Belum ada transaksi bertanggal.</div>'}
      </div>
      <div class="card">
        <div class="section-head"><h3>Biaya</h3><button class="btn small" id="fin-add-cost">+ Biaya</button></div>
        ${sum.costs.length ? sum.costs.map(c=>`
          <div class="list-row">
            <div><strong>${esc(c.name)}</strong><small>${esc(c.category||'Lainnya')} · ${fmtDate(c.date)}${c.note?` · ${esc(c.note)}`:''}</small></div>
            <div style="display:flex;align-items:center;gap:6px"><strong>${rupiah(c.amount)}</strong>${(c.source==='activity-realization'||c.activityId)?'<span class="tag">Dari realisasi</span>':`<button class="btn small danger" data-del-cost="${c.id}">✕</button>`}</div>
          </div>`).join('') : '<div class="empty">Belum ada biaya.</div>'}
      </div>
      <div class="card">
        <h3>Distribusi Biaya</h3>
        ${Object.keys(sum.byCategory).length ? Object.entries(sum.byCategory).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
          <div style="margin:10px 0"><div class="list-row" style="padding:0;border:0"><span>${esc(k)}</span><strong>${rupiah(v)}</strong></div>
          <div class="chartbar"><div style="width:${sum.totalCost?Math.min(100,v/sum.totalCost*100):0}%"></div></div></div>`).join('') : '<div class="empty">Belum ada data.</div>'}
      </div>
      <div class="card">
        <div class="section-head"><h3>Pendapatan Panen</h3></div>
        <p class="tiny muted">Transaksi panen dicatat melalui menu Panen. Data di sini hanya ringkasan agar pendapatan tidak tercatat dua kali.</p>
        ${sum.harvests.length ? sum.harvests.map(h=>`
          <div class="list-row">
            <div><strong>${fmtDate(h.date)} · ${fmtNum(h.weightKg,1)} kg</strong><small>@ ${rupiah(h.pricePerKg)}/kg · Grade A ${h.gradeA||0} B ${h.gradeB||0} C ${h.gradeC||0}</small></div>
            <div style="display:flex;align-items:center;gap:6px"><strong>${rupiah(h.revenue||h.weightKg*h.pricePerKg)}</strong></div>
          </div>`).join('') : ''}
        ${sum.legacyRevenues.length ? `<h4>Pendapatan lama (kompatibilitas)</h4>${sum.legacyRevenues.map(r=>`<div class="list-row"><div><strong>${esc(r.name||r.description||'Pendapatan lama')}</strong><small>${fmtDate(r.date)} · Data warisan</small></div><strong>${rupiah(r.amount??r.revenue??r.total??r.income??r.value)}</strong></div>`).join('')}` : ''}
        ${sum.harvests.length||sum.legacyRevenues.length?'':'<div class="empty">Belum ada pendapatan.</div>'}
      </div>`;
    $('#fin-add-cost').onclick = () => modal('Tambah Biaya', `
      <div class="field"><label>Nama</label><input id="fc-name"></div>
      <div class="field"><label>Kategori</label><select id="fc-cat">
        <option>Bibit</option><option>Pupuk</option><option>Pestisida</option><option>ZPT</option>
        <option>Tenaga kerja</option><option>Irigasi</option><option>Transportasi</option>
        <option>Pengemasan</option><option>Modal lain</option></select></div>
      <div class="field"><label>Jumlah (Rp)</label><input id="fc-amt" type="number" min="0"></div>
      <div class="field"><label>Tanggal</label><input id="fc-date" type="date" value="${todayISO()}"></div>
      <button class="btn" id="fc-save">Simpan</button>`, (b,close)=>{
        bindOnce(b.querySelector('#fc-save'), async ()=>{
          await put('costs', { id:uid('cost'), seasonId:s.id, name:b.querySelector('#fc-name').value||'Biaya',
            category:b.querySelector('#fc-cat').value, amount:num(b.querySelector('#fc-amt').value),
            date:b.querySelector('#fc-date').value, note:'' });
          close(); toast('Tersimpan'); Financial.render(container, s);
        });
      });
    container.querySelectorAll('[data-del-cost]').forEach(b=>b.onclick=()=>confirmDialog('Hapus biaya manual?', async ()=>{
      try { await deleteManualCost(b.dataset.delCost); toast('Biaya dihapus'); await Financial.render(container, s); }
      catch(error){ console.error(error); toast(error.message||'Biaya gagal dihapus'); }
    }));
  }
};