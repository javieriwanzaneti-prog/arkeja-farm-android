/* ============ Reports ============ */
const Reports = {
  async render(container, season){
    const s = season;
    container.innerHTML = `
      <h2 class="page-title">Laporan & Ekspor</h2>
      <p class="subtitle">Cetak, ekspor, dan backup data.</p>
      ${!s ? '<div class="notice">Pilih musim tanam untuk laporan per musim.</div>' : `
      <div class="card">
        <h3>Laporan Musim: ${esc(s.name||s.commodityName)}</h3>
        <div class="btn-row"><button class="btn" id="rep-print">Cetak / PDF</button></div>
        <div class="btn-row"><button class="btn secondary" id="rep-csv">Ekspor CSV</button><button class="btn secondary" id="rep-json">Ekspor JSON</button></div>
      </div>
      <div class="card">
        <h3>Backup & Restore</h3>
        <div class="btn-row"><button class="btn" id="rep-backup">Backup Database</button><button class="btn secondary" id="rep-restore">Restore</button></div>
        <input type="file" id="rep-restore-file" accept="application/json" style="margin-top:8px;display:none">
        <p class="tiny muted">Backup berisi seluruh data. Restore akan menimpa data saat ini.</p>
      </div>
      <div class="card">
        <h3>Laporan Lengkap</h3>
        <button class="btn outline" id="rep-full">Lihat Laporan Lengkap</button>
      </div>`}`;
    if(s){
      $('#rep-print').onclick = () => Reports.printFull(s);
      $('#rep-csv').onclick = () => Reports.exportCSV(s);
      $('#rep-json').onclick = () => Reports.exportJSON(s);
      $('#rep-full').onclick = () => Reports.printFull(s);
    }
    $('#rep-backup').onclick = async () => {
      const data = await backupAll();
      downloadBlob(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}), `arkeja-backup-${todayISO()}.json`);
      toast('Backup diunduh');
    };
    $('#rep-restore').onclick = () => $('#rep-restore-file').click();
    $('#rep-restore-file').onchange = async e => {
      const f = e.target.files[0]; if(!f) return;
      const text = await f.text();
      try {
        const data = JSON.parse(text);
        confirmDialog('Restore akan menimpa seluruh data saat ini. Lanjutkan?', async ()=>{
          await restoreAll(data); toast('Data berhasil dipulihkan'); location.reload();
        });
      } catch(err){ toast('File tidak valid'); }
    };
  },

  async gather(s){
    return {
      season: s,
      costs: await getByIndex('costs','seasonId', s.id),
      harvests: await getByIndex('harvests','seasonId', s.id),
      activities: await getByIndex('activities','seasonId', s.id),
      monitorings: await getByIndex('monitorings','seasonId', s.id),
      incidences: await getByIndex('incidences','seasonId', s.id),
      irrigations: await getByIndex('irrigations','seasonId', s.id),
      financial: await Financial.summary(s.id)
    };
  },

  exportCSV: async (s)=>{
    const g = await Reports.gather(s);
    let csv = '';
    csv += '=== MUSIM ===\n';
    csv += toCSV([g.season]);
    csv += '\n\n=== BIAYA ===\n'; csv += toCSV(g.costs);
    csv += '\n\n=== PANEN ===\n'; csv += toCSV(g.harvests);
    csv += '\n\n=== KEGIATAN ===\n'; csv += toCSV(g.activities);
    csv += '\n\n=== MONITORING ===\n'; csv += toCSV(g.monitorings);
    csv += '\n\n=== OPT ===\n'; csv += toCSV(g.incidences);
    csv += '\n\n=== IRIGASI ===\n'; csv += toCSV(g.irrigations);
    downloadBlob(new Blob([csv], {type:'text/csv'}), `laporan-${s.id}.csv`);
  },

  exportJSON: async (s)=>{
    const g = await Reports.gather(s);
    downloadBlob(new Blob([JSON.stringify(g,null,2)],{type:'application/json'}), `laporan-${s.id}.json`);
  },

  printFull: async (s)=>{
    const g = await Reports.gather(s);
    const f = g.financial;
    const html = `<html><head><title>Laporan ${esc(s.commodityName)}</title>
      <style>body{font-family:system-ui;padding:24px;color:#20251f;max-width:800px;margin:auto}h1{color:#287a3c}h2{margin-top:22px;border-bottom:2px solid #287a3c;padding-bottom:4px;font-size:16px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0}th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#e7f4e8}
      .kpi{background:#fff0df;padding:14px;border-radius:10px;margin:10px 0}.kpi strong{font-size:22px}
      @media print{body{padding:0}}</style></head><body>
      <h1>ARKEJA FARM — Laporan Budidaya</h1>
      <p><strong>${esc(s.name||s.commodityName)}</strong><br>Lahan: ${esc(s.landName)} · ${fmtNum(s.area)} m²<br>
      Tanam: ${fmtDate(s.plantingDate)} · HST: ${CropEngine.hstOf(s)}</p>
      <h2>Keuangan</h2>
      <div class="kpi">${f.profit>=0?'Laba':'Rugi'}: <strong>${rupiah(f.profit)}</strong><br>
      Biaya: ${rupiah(f.totalCost)} · Pendapatan: ${rupiah(f.totalRevenue)}<br>
      HPP/kg: ${rupiah(f.hpp)} · ROI: ${f.roi.toFixed(1)}% · Margin: ${f.margin.toFixed(1)}%</div>
      <h2>Biaya (${g.costs.length} item)</h2>
      <table><tr><th>Tanggal</th><th>Nama</th><th>Kategori</th><th>Jumlah</th></tr>
        ${g.costs.map(c=>`<tr><td>${fmtDate(c.date)}</td><td>${esc(c.name)}</td><td>${esc(c.category)}</td><td>${rupiah(c.amount)}</td></tr>`).join('')}</table>
      <h2>Panen (${g.harvests.length} transaksi)</h2>
      <table><tr><th>Tanggal</th><th>Berat (kg)</th><th>Harga</th><th>Pendapatan</th></tr>
        ${g.harvests.map(h=>`<tr><td>${fmtDate(h.date)}</td><td>${h.weightKg}</td><td>${rupiah(h.pricePerKg)}</td><td>${rupiah(h.revenue||h.weightKg*h.pricePerKg)}</td></tr>`).join('')}</table>
      <h2>Kegiatan (${g.activities.length} total)</h2>
      <table><tr><th>Tanggal</th><th>Kegiatan</th><th>Status</th><th>Dosis</th></tr>
        ${g.activities.slice(0,50).map(a=>`<tr><td>${fmtDate(a.date)}</td><td>${esc(a.title)}</td><td>${esc(a.status)}</td><td>${esc(a.dose||'')}</td></tr>`).join('')}</table>
      <h2>Monitoring (${g.monitorings.length} catatan)</h2>
      <table><tr><th>Tanggal</th><th>HST</th><th>Tinggi</th><th>Daun</th><th>Buah</th></tr>
        ${g.monitorings.map(m=>`<tr><td>${fmtDate(m.date)}</td><td>${m.hst}</td><td>${m.height||'—'}</td><td>${m.leafCount||'—'}</td><td>${m.fruitCount||'—'}</td></tr>`).join('')}</table>
      <h2>Hama & Penyakit (${g.incidences.length} kejadian)</h2>
      <table><tr><th>Tanggal</th><th>Nama</th><th>Jenis</th><th>Tingkat</th><th>Tindakan</th></tr>
        ${g.incidences.map(i=>`<tr><td>${fmtDate(i.date)}</td><td>${esc(i.name)}</td><td>${esc(i.type)}</td><td>${esc(i.level)}</td><td>${esc(i.action||'')}</td></tr>`).join('')}</table>
      <p style="margin-top:30px;font-size:11px;color:#666">Dicetak: ${new Date().toLocaleString('id-ID')} · ARKEJA FARM</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if(w){ w.document.write(html); w.document.close(); setTimeout(()=>w.print(), 300); }
    else toast('Popup diblokir — izinkan popup untuk mencetak.');
  }
};