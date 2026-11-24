/* ============ Financial ============ */
const Financial = {
  async summary(seasonId){
    const costs = await getByIndex('costs', 'seasonId', seasonId);
    const harvests = await getByIndex('harvests', 'seasonId', seasonId);
    const totalCost = costs.reduce((a,c)=>a+num(c.amount),0);
    const totalRevenue = harvests.reduce((a,h)=>a+num(h.revenue||h.weightKg*h.pricePerKg),0);
    const totalKg = harvests.reduce((a,h)=>a+num(h.weightKg),0);
    const profit = totalRevenue - totalCost;
    const hpp = totalKg>0 ? totalCost/totalKg : 0;
    const bepPrice = totalKg>0 ? totalCost/totalKg : 0;
    const roi = totalCost>0 ? (profit/totalCost*100) : 0;
    const margin = totalRevenue>0 ? (profit/totalRevenue*100) : 0;
    const byCategory = {};
    costs.forEach(c=>{ byCategory[c.category||'Lainnya'] = (byCategory[c.category||'Lainnya']||0) + num(c.amount); });
    return { totalCost, totalRevenue, totalKg, profit, hpp, bepPrice, roi, margin, byCategory, costs, harvests };
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
        <div class="section-head"><h3>Biaya</h3><button class="btn small" id="fin-add-cost">+ Biaya</button></div>
        ${sum.costs.length ? sum.costs.map(c=>`
          <div class="list-row">
            <div><strong>${esc(c.name)}</strong><small>${esc(c.category||'Lainnya')} · ${fmtDate(c.date)}</small></div>
            <div style="display:flex;align-items:center;gap:6px"><strong>${rupiah(c.amount)}</strong><button class="btn small danger" data-del-cost="${c.id}">✕</button></div>
          </div>`).join('') : '<div class="empty">Belum ada biaya.</div>'}
      </div>
      <div class="card">
        <h3>Distribusi Biaya</h3>
        ${Object.keys(sum.byCategory).length ? Object.entries(sum.byCategory).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
          <div style="margin:10px 0"><div class="list-row" style="padding:0;border:0"><span>${esc(k)}</span><strong>${rupiah(v)}</strong></div>
          <div class="chartbar"><div style="width:${sum.totalCost?Math.min(100,v/sum.totalCost*100):0}%"></div></div></div>`).join('') : '<div class="empty">Belum ada data.</div>'}
      </div>
      <div class="card">
        <div class="section-head"><h3>Pendapatan Panen</h3><button class="btn small" id="fin-add-rev">+ Pendapatan</button></div>
        ${sum.harvests.length ? sum.harvests.map(h=>`
          <div class="list-row">
            <div><strong>${fmtDate(h.date)} · ${fmtNum(h.weightKg,1)} kg</strong><small>@ ${rupiah(h.pricePerKg)}/kg · Grade A ${h.gradeA||0} B ${h.gradeB||0} C ${h.gradeC||0}</small></div>
            <div style="display:flex;align-items:center;gap:6px"><strong>${rupiah(h.revenue||h.weightKg*h.pricePerKg)}</strong><button class="btn small danger" data-del-rev="${h.id}">✕</button></div>
          </div>`).join('') : '<div class="empty">Belum ada pendapatan.</div>'}
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
        b.querySelector('#fc-save').onclick = async ()=>{
          await put('costs', { id:uid('cost'), seasonId:s.id, name:b.querySelector('#fc-name').value||'Biaya',
            category:b.querySelector('#fc-cat').value, amount:num(b.querySelector('#fc-amt').value),
            date:b.querySelector('#fc-date').value, note:'' });
          close(); toast('Tersimpan'); Financial.render(container, s);
        };
      });
    $('#fin-add-rev').onclick = () => modal('Tambah Pendapatan', `
      <div class="field"><label>Tanggal</label><input id="fr-date" type="date" value="${todayISO()}"></div>
      <div class="field"><label>Berat panen (kg)</label><input id="fr-kg" type="number" min="0" step="0.1"></div>
      <div class="field"><label>Harga per kg</label><input id="fr-price" type="number" min="0"></div>
      <div class="field"><label>Grade A/B/C/Afkir (opsional, kg)</label>
        <div class="field-row"><input id="fr-a" placeholder="A" type="number"><input id="fr-b" placeholder="B" type="number"></div>
        <div class="field-row" style="margin-top:6px"><input id="fr-c" placeholder="C" type="number"><input id="fr-af" placeholder="Afkir" type="number"></div>
      </div>
      <button class="btn" id="fr-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#fr-save').onclick = async ()=>{
          const kg = num(b.querySelector('#fr-kg').value);
          const pr = num(b.querySelector('#fr-price').value);
          await put('harvests', { id:uid('h'), seasonId:s.id, date:b.querySelector('#fr-date').value,
            fruitCount:0, weightKg:kg, gradeA:num(b.querySelector('#fr-a').value),
            gradeB:num(b.querySelector('#fr-b').value), gradeC:num(b.querySelector('#fr-c').value),
            afkir:num(b.querySelector('#fr-af').value), pricePerKg:pr, revenue:kg*pr, note:'' });
          close(); toast('Tersimpan'); Financial.render(container, s);
        };
      });
    container.querySelectorAll('[data-del-cost]').forEach(b=>b.onclick=()=>confirmDialog('Hapus biaya?', async ()=>{
      await del('costs', b.dataset.delCost); toast('Terhapus'); Financial.render(container, s);
    }));
    container.querySelectorAll('[data-del-rev]').forEach(b=>b.onclick=()=>confirmDialog('Hapus pendapatan?', async ()=>{
      await del('harvests', b.dataset.delRev); toast('Terhapus'); Financial.render(container, s);
    }));
  }
};