/* ============ Analytics ============ */
const Analytics = {
  async render(container, season){
    const s = season;
    if(!s){ container.innerHTML = '<h2 class="page-title">Analisis</h2><div class="notice">Pilih musim tanam dulu.</div>'; return; }
    const fin = await Financial.summary(s.id);
    const acts = await getByIndex('activities', 'seasonId', s.id);
    const totalAct = acts.length;
    const doneAct = acts.filter(a=>a.status==='selesai').length;
    const lateAct = acts.filter(a=>a.status==='terlambat').length;
    const todayAct = acts.filter(a=>a.status==='hariini').length;
    const mons = await getByIndex('monitorings','seasonId', s.id);
    const inc = await getByIndex('incidences','seasonId', s.id);
    const alerts = [];
    if(lateAct>0) alerts.push({level:'red', msg:`${lateAct} kegiatan terlambat — segera realisasikan.`});
    if(fin.totalCost>0 && fin.totalRevenue===0) alerts.push({level:'orange', msg:'Belum ada pendapatan tercatat. Catat panen jika sudah panen.'});
    if(inc.length>0) alerts.push({level:'orange', msg:`Ada ${inc.length} kejadian hama/penyakit tercatat.`});
    if(fin.profit<0 && fin.totalRevenue>0) alerts.push({level:'red', msg:'Usaha tani masih rugi berdasarkan data aktual.'});
    if(!mons.length) alerts.push({level:'blue', msg:'Belum ada monitoring — catat pertumbuhan tanaman.'});
    container.innerHTML = `
      <h2 class="page-title">Analisis Cerdas</h2>
      <p class="subtitle">Berdasarkan data aktual yang tersimpan.</p>
      ${alerts.length ? alerts.map(a=>`<div class="notice ${a.level==='red'?'red-notice':a.level==='orange'?'':'green-notice'}">${esc(a.msg)}</div>`).join('') : '<div class="green-notice notice">Semua indikator dalam kondisi baik.</div>'}
      <div class="grid">
        <div class="metric"><span>Kegiatan</span><strong>${doneAct}/${totalAct}</strong></div>
        <div class="metric"><span>Terlambat</span><strong>${lateAct}</strong></div>
        <div class="metric"><span>Monitoring</span><strong>${mons.length}</strong></div>
        <div class="metric"><span>Kejadian OPT</span><strong>${inc.length}</strong></div>
      </div>
      <div class="card">
        <h3>Kinerja Keuangan</h3>
        <div class="list-row"><span>Total biaya</span><strong>${rupiah(fin.totalCost)}</strong></div>
        <div class="list-row"><span>Total pendapatan</span><strong>${rupiah(fin.totalRevenue)}</strong></div>
        <div class="list-row"><span>Laba/Rugi</span><strong>${rupiah(fin.profit)}</strong></div>
        <div class="list-row"><span>HPP per kg</span><strong>${rupiah(fin.hpp)}</strong></div>
        <div class="list-row"><span>ROI</span><strong>${fin.roi.toFixed(1)}%</strong></div>
        <div class="list-row"><span>Margin keuntungan</span><strong>${fin.margin.toFixed(1)}%</strong></div>
      </div>
      <div class="card">
        <h3>Tren Monitoring</h3>
        ${mons.length ? sortBy(mons, 'date').slice(-6).map(m=>`
          <div style="margin:8px 0"><div class="list-row" style="padding:0;border:0"><span>HST ${m.hst} · ${fmtDate(m.date)}</span><strong>${m.height||0} cm</strong></div>
          <div class="chartbar"><div style="width:${mons.reduce((a,x)=>Math.max(a,num(x.height)),1)?m.height/Math.max(...mons.map(x=>num(x.height)),1)*100:0}%"></div></div></div>`).join('') : '<div class="empty">Belum ada data monitoring.</div>'}
      </div>
      <div class="card">
        <h3>Rekomendasi Berbasis Aturan</h3>
        <ul style="margin:0;padding-left:18px;line-height:1.8;font-size:13px">
          ${lateAct>0 ? '<li>Realisasikan kegiatan terlambat sebelum efek pertumbuhan menurun.</li>' : ''}
          ${totalAct===0 ? '<li>Generate jadwal dari SOP di menu Aktivitas agar tidak ada kegiatan terlewat.</li>' : ''}
          ${mons.length<2 ? '<li>Tambahkan minimal 2 titik monitoring untuk analisis tren.</li>' : ''}
          ${fin.totalRevenue===0 ? '<li>Catat panen agar HPP & laba dapat dihitung.</li>' : ''}
          ${inc.length>0 ? '<li>Review tindakan pengendalian dan hasilnya.</li>' : ''}
          ${totalAct>0 && doneAct===totalAct && fin.profit>0 ? '<li>Musim ini efektif — pertimbangkan replikasi jadwal untuk musim berikutnya.</li>' : ''}
        </ul>
        <p class="tiny muted">Rekomendasi bersifat umum berbasis data aktual, bukan diagnosis hama/penyakit.</p>
      </div>`;
  }
};