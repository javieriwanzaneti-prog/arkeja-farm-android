/* ============ Harvest ============ */
const Harvest = {
  async render(container, season){
    const s = season;
    const list = s ? sortBy(await getByIndex('harvests','seasonId', s.id),'date') : [];
    const totalKg = list.reduce((a,h)=>a+num(h.weightKg),0);
    const totalRev = list.reduce((a,h)=>a+num(h.revenue||h.weightKg*h.pricePerKg),0);
    const totalA = list.reduce((a,h)=>a+num(h.gradeA),0);
    const totalB = list.reduce((a,h)=>a+num(h.gradeB),0);
    const totalC = list.reduce((a,h)=>a+num(h.gradeC),0);
    const totalAf = list.reduce((a,h)=>a+num(h.afkir),0);
    container.innerHTML = `
      <h2 class="page-title">Panen</h2>
      <p class="subtitle">Catat transaksi panen & analisis produktivitas.</p>
      ${!s ? '<div class="notice">Pilih musim dulu.</div>' : `
      <div class="grid">
        <div class="metric green"><span>Total panen</span><strong>${fmtNum(totalKg,1)} kg</strong></div>
        <div class="metric"><span>Pendapatan</span><strong>${rupiah(totalRev)}</strong></div>
      </div>
      ${list.length ? `<div class="card"><h3>Distribusi Grade</h3>
        <div class="grid-3">
          <div class="metric">A: ${fmtNum(totalA,1)}</div>
          <div class="metric">B: ${fmtNum(totalB,1)}</div>
          <div class="metric">C: ${fmtNum(totalC,1)}</div>
        </div>
        <div class="grid"><div class="metric">Afkir: ${fmtNum(totalAf,1)}</div>
          <div class="metric">Produktivitas: ${fmtNum(s.area?totalKg/s.area:0,2)} kg/m²</div>
        </div>
        <div class="metric" style="margin-top:8px">Produktivitas per tanaman: ${fmtNum(s.population?totalKg/s.population:0,2)} kg</div>
      </div>` : ''}
      <button class="btn" id="harv-add" style="margin-bottom:10px">+ Transaksi Panen</button>
      <div class="card">
        <h3>Riwayat Panen</h3>
        ${list.length ? list.map(h=>`
          <div class="list-row">
            <div><strong>${fmtDate(h.date)}</strong>
              <small>${fmtNum(h.weightKg,1)} kg @ ${rupiah(h.pricePerKg)}/kg</small>
              <div class="tiny muted">A:${h.gradeA||0} B:${h.gradeB||0} C:${h.gradeC||0} Afkir:${h.afkir||0}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px"><strong>${rupiah(h.revenue||h.weightKg*h.pricePerKg)}</strong><button class="btn small danger" data-del="${h.id}">✕</button></div>
          </div>`).join('') : '<div class="empty">Belum ada transaksi.</div>'}
      </div>`}`;
    if(!s) return;
    $('#harv-add').onclick = () => modal('Transaksi Panen', `
      <div class="field"><label>Tanggal</label><input id="hv-date" type="date" value="${todayISO()}"></div>
      <div class="field-row">
        <div class="field"><label>Jumlah buah</label><input id="hv-count" type="number" min="0"></div>
        <div class="field"><label>Berat total (kg)</label><input id="hv-kg" type="number" min="0" step="0.1"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Grade A</label><input id="hv-a" type="number" min="0" step="0.1"></div>
        <div class="field"><label>Grade B</label><input id="hv-b" type="number" min="0" step="0.1"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Grade C</label><input id="hv-c" type="number" min="0" step="0.1"></div>
        <div class="field"><label>Afkir</label><input id="hv-af" type="number" min="0" step="0.1"></div>
      </div>
      <div class="field"><label>Harga/ kg</label><input id="hv-price" type="number" min="0"></div>
      <div class="field"><label>Catatan</label><textarea id="hv-note"></textarea></div>
      <button class="btn" id="hv-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#hv-save').onclick = async ()=>{
          const kg = num(b.querySelector('#hv-kg').value);
          const pr = num(b.querySelector('#hv-price').value);
          await put('harvests', { id:uid('h'), seasonId:s.id, date:b.querySelector('#hv-date').value,
            fruitCount:num(b.querySelector('#hv-count').value), weightKg:kg,
            gradeA:num(b.querySelector('#hv-a').value), gradeB:num(b.querySelector('#hv-b').value),
            gradeC:num(b.querySelector('#hv-c').value), afkir:num(b.querySelector('#hv-af').value),
            pricePerKg:pr, revenue:kg*pr, note:b.querySelector('#hv-note').value });
          close(); toast('Tersimpan'); Harvest.render(container, s);
        };
      });
    container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus transaksi?', async ()=>{
      await del('harvests', b.dataset.del); toast('Terhapus'); Harvest.render(container, s);
    }));
  }
};