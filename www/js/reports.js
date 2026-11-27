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
        <div class="btn-row"><button class="btn" id="rep-save-pdf">⬇ Simpan PDF</button><button class="btn secondary" id="rep-print">Cetak Laporan</button></div>
        <div class="btn-row"><button class="btn secondary" id="rep-csv">Ekspor CSV</button><button class="btn secondary" id="rep-json">Ekspor JSON</button></div>
      </div>
      <div class="card">
        <h3>Backup & Restore</h3>
        <div class="btn-row"><button class="btn" id="rep-backup">Backup Database</button><button class="btn secondary" id="rep-restore">Restore</button></div>
        <input type="file" id="rep-restore-file" accept="application/json" style="margin-top:8px;display:none">
        <p class="tiny muted">Backup berisi seluruh data dengan verifikasi SHA-256. Pada APK disimpan ke Documents/ARKEJA FARM; restore menampilkan ringkasan sebelum mengganti data lokal. Backup format lama tetap didukung.</p>
      </div>
      <div class="card">
        <h3>Laporan Lengkap</h3>
        <button class="btn outline" id="rep-full">Lihat Laporan Lengkap</button>
      </div>`}`;
    if(s){
      $('#rep-save-pdf').onclick = () => Reports.savePDF(s);
      $('#rep-print').onclick = () => Reports.printFull(s);
      $('#rep-csv').onclick = () => Reports.exportCSV(s);
      $('#rep-json').onclick = () => Reports.exportJSON(s);
      $('#rep-full').onclick = () => Reports.printFull(s);
    }
    $('#rep-backup').onclick = async () => {
      try { const data=await backupAll(); const saved=await saveBackupFile(data,`arkeja-backup-${todayISO()}.json`);
        toast(`Backup berhasil disimpan di ${saved.location||'Download'}`); }
      catch(err){console.error(err);toast('Backup gagal: '+(err.message||'kesalahan'));}
    };
    $('#rep-restore').onclick = () => $('#rep-restore-file').click();
    $('#rep-restore-file').onchange = async e => {
      const f = e.target.files[0]; if(!f) return;
      try {
        const data = JSON.parse(await f.text());
        validateBackupPayload(data);
        const verification=await verifyBackupIntegrity(data);
        const summary=verification.summary;
        const detail=`${summary.totalRecords} baris data dari ${summary.storeCount} kelompok penyimpanan. `+
          (verification.legacy?'Backup format lama (tanpa checksum SHA-256). ':'Checksum SHA-256 valid. ')+
          'Restore akan mengganti seluruh data lokal. Lanjutkan?';
        confirmDialog(detail, async ()=>{
          try { const safety=await backupAll(); const saved=await saveBackupFile(safety,`arkeja-pre-restore-${todayISO()}.json`);
            await restoreAll(data); toast(`Data dipulihkan. Backup pengaman: ${saved.location||'Download'}.`); location.reload(); }
          catch(err) { console.error(err); toast('Restore gagal: ' + (err.message || 'kesalahan data')); }
        });
      } catch(err){ console.error(err); toast('Backup ditolak: '+(err.message||'file JSON tidak valid')); }
      e.target.value = '';
    };
  },

  async gather(s){
    return {
      season: s,
      costs: await getByIndex('costs','seasonId', s.id),
      harvests: await getByIndex('harvests','seasonId', s.id),
      activities: await getByIndex('activities','seasonId', s.id),
      nutritionHistory: await getByIndex('nutrition_hist','seasonId', s.id),
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
    csv += '\n\n=== RIWAYAT NUTRISI ===\n';
    const nutritionRows=g.nutritionHistory.map(n=>({
      tanggal:String(n.createdAt||n.date||'').slice(0,10),jenis:n.type||'',volume_liter:n.liters??'',
      produk:(n.products||[]).map(p=>p.name||p.product||'').join(' | ')||n.product||'',
      dosis:(n.products||[]).map(p=>`${p.grams??p.dose??''} ${p.unit||'g'}`).join(' | ')||[n.dose,n.unit].filter(Boolean).join(' '),
      target_ppm:n.target||n.result?.target?JSON.stringify(n.target||n.result?.target):'',
      aktual_ppm:n.result?.actual?JSON.stringify(n.result.actual):'',
      kekurangan_ppm:n.result?.gap?JSON.stringify(n.result.gap):'',
      kelebihan_ppm:n.result?.excess?JSON.stringify(n.result.excess):'',
      catatan:n.note||n.result?.note||''
    }));
    csv += toCSV(nutritionRows);
    const withoutPhoto=rows=>rows.map(({photo,...row})=>row);
    csv += '\n\n=== MONITORING ===\n'; csv += toCSV(withoutPhoto(g.monitorings));
    csv += '\n\n=== OPT ===\n'; csv += toCSV(withoutPhoto(g.incidences));
    csv += '\n\n=== IRIGASI ===\n'; csv += toCSV(g.irrigations);
    downloadBlob(new Blob([csv], {type:'text/csv'}), `laporan-${s.id}.csv`);
  },

  exportJSON: async (s)=>{
    const g = await Reports.gather(s);
    downloadBlob(new Blob([JSON.stringify(g,null,2)],{type:'application/json'}), `laporan-${s.id}.json`);
  },

  savePDF: async (s)=>{
    try {
      if(typeof PDFExport==='undefined') throw new Error('Modul pembuat PDF belum tersedia. Muat ulang aplikasi.');
      const g=await Reports.gather(s);
      const bytes=PDFExport.create(g);
      const safeName=String(s.name||s.commodityName||'musim').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'musim';
      const filename=`arkeja-laporan-${safeName}-${todayISO()}.pdf`;
      const blob=new Blob([bytes],{type:'application/pdf'});
      if(window.ArkejaFileSaver && typeof window.ArkejaFileSaver.savePDF==='function'){
        try {
          const saved=await window.ArkejaFileSaver.savePDF(bytes,filename);
          toast(`PDF tersimpan di ${saved.location||'Documents/ARKEJA FARM'}`);
          return saved;
        } catch(nativeError) {
          console.warn('[Reports.savePDF] Penyimpanan Documents gagal, memakai unduhan browser.',nativeError);
          downloadBlob(blob,filename);
          toast('Folder Documents tidak dapat diakses. PDF diunduh; periksa folder Download.');
          return {filename,download:true,nativeError:nativeError.message};
        }
      }
      downloadBlob(blob,filename);
      toast('PDF dibuat. Periksa folder Download pada ponsel.');
      return {filename,download:true};
    } catch(error) {
      console.error('[Reports.savePDF]',error);
      toast(error?.message||'Gagal membuat PDF.');
      return null;
    }
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
      Tanam: ${fmtDate(s.plantingDate)} · ${CropEngine.ageLabel(s)}: ${CropEngine.hstOf(s)} · Dasar umur: ${esc(CropEngine.ageLabelLong(s))}</p>
      <h2>Keuangan</h2>
      <div class="kpi">${f.profit>=0?'Laba':'Rugi'}: <strong>${rupiah(f.profit)}</strong><br>
      Biaya: ${rupiah(f.totalCost)} · Pendapatan: ${rupiah(f.totalRevenue)}<br>
      HPP/kg: ${rupiah(f.hpp)} · ROI: ${f.roi.toFixed(1)}% · Margin: ${f.margin.toFixed(1)}%</div>
      <h2>Biaya (${g.costs.length} item)</h2>
      <table><tr><th>Tanggal</th><th>Nama</th><th>Kategori</th><th>Jumlah</th></tr>
        ${g.costs.map(c=>`<tr><td>${fmtDate(c.date)}</td><td>${esc(c.name)}</td><td>${esc(c.category)}</td><td>${rupiah(c.amount)}</td></tr>`).join('')}</table>
      <h2>Panen (${g.harvests.length} transaksi)</h2>
      <table><tr><th>Tanggal</th><th>Total kg</th><th>A</th><th>B</th><th>C</th><th>Afkir</th><th>Harga/kg</th><th>Pendapatan</th></tr>
        ${g.harvests.map(h=>`<tr><td>${fmtDate(h.date)}</td><td>${fmtNum(h.weightKg,1)}</td><td>${fmtNum(h.gradeA||0,1)}</td><td>${fmtNum(h.gradeB||0,1)}</td><td>${fmtNum(h.gradeC||0,1)}</td><td>${fmtNum(h.afkir||0,1)}</td><td>${rupiah(h.pricePerKg)}</td><td>${rupiah(h.revenue||h.weightKg*h.pricePerKg)}</td></tr>`).join('')}</table>
      <h2>Riwayat Nutrisi (${g.nutritionHistory.length} catatan)</h2>
      <table><tr><th>Tanggal</th><th>Jenis</th><th>Produk</th><th>Dosis/Volume</th><th>Target ppm</th><th>Aktual ppm</th><th>Catatan</th></tr>
        ${g.nutritionHistory.map(n=>`<tr><td>${fmtDate(String(n.createdAt||n.date||'').slice(0,10))}</td><td>${esc(n.type||'')}</td><td>${esc((n.products||[]).map(p=>p.name||p.product||'').join(', ')||n.product||'')}</td><td>${esc((n.products||[]).map(p=>(p.grams??p.dose??'')+' '+(p.unit||'g')).join(', ')||[n.dose,n.unit,n.liters?'· '+n.liters+' L':''].filter(Boolean).join(' ')||'')}</td><td>${esc(JSON.stringify(n.target||n.result?.target||''))}</td><td>${esc(JSON.stringify(n.result?.actual||''))}</td><td>${esc(n.note||n.result?.note||'')}</td></tr>`).join('')}</table>
      <h2>Kegiatan (${g.activities.length} total)</h2>
      <table><tr><th>Tanggal</th><th>Kegiatan</th><th>Status</th><th>Dosis</th></tr>
        ${g.activities.slice(0,50).map(a=>`<tr><td>${fmtDate(a.date)}</td><td>${esc(a.title)}</td><td>${esc(a.status)}</td><td>${esc(a.dose||'')}</td></tr>`).join('')}</table>
      <h2>Monitoring (${g.monitorings.length} catatan)</h2>
      <table><tr><th>Tanggal</th><th>${CropEngine.ageLabel(s)}</th><th>Tinggi</th><th>Daun</th><th>Buah</th></tr>
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