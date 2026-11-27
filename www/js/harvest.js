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
        bindOnce(b.querySelector('#hv-save'), async ()=>{
          const date=b.querySelector('#hv-date').value;
          const kgRaw=b.querySelector('#hv-kg').value, priceRaw=b.querySelector('#hv-price').value, countRaw=b.querySelector('#hv-count').value;
          const kg=Number(kgRaw), pr=priceRaw===''?0:Number(priceRaw), count=countRaw===''?0:Number(countRaw);
          const grades=['#hv-a','#hv-b','#hv-c','#hv-af'].map(sel=>{const v=b.querySelector(sel).value;return v===''?0:Number(v);});
          if(!date){toast('Tanggal panen wajib diisi');return;}
          if(kgRaw===''||!Number.isFinite(kg)||kg<=0){toast('Berat total harus lebih dari 0 kg');return;}
          if(!Number.isFinite(pr)||pr<0||!Number.isFinite(count)||count<0||!Number.isInteger(count)){toast('Harga harus ≥ 0 dan jumlah buah harus bilangan bulat ≥ 0');return;}
          if(grades.some(v=>!Number.isFinite(v)||v<0)){toast('Berat setiap grade harus berupa angka ≥ 0');return;}
          const gradeSum=grades.reduce((a,v)=>a+v,0), hasGrade=grades.some(v=>v>0), tolerance=0.1;
          if(hasGrade&&Math.abs(gradeSum-kg)>tolerance){toast(`Total grade ${gradeSum.toFixed(2)} kg tidak sesuai berat total ${kg.toFixed(2)} kg (toleransi 0,1 kg)`);return;}
          await put('harvests', { id:uid('h'), seasonId:s.id, date,
            fruitCount:count, weightKg:kg,
            gradeA:grades[0], gradeB:grades[1], gradeC:grades[2], afkir:grades[3],
            pricePerKg:pr, revenue:kg*pr, note:b.querySelector('#hv-note').value });
          close(); toast('Tersimpan'); Harvest.render(container, s);
        });
      });
    container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus transaksi?', async ()=>{
      await del('harvests', b.dataset.del); toast('Terhapus'); Harvest.render(container, s);
    }));
  }
};