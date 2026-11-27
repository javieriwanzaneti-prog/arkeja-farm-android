/* ============ Advanced Analytics — Tahap 11A ============
 * Read-only analysis of existing season records. No writes or schema changes.
 */
const Analytics = {
  _dateValue(value){
    const raw=String(value||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const [y,m,d]=raw.split('-').map(Number);
    const date=new Date(Date.UTC(y,m-1,d));
    return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?date.getTime():null;
  },
  _average(rows,key){
    const values=rows.map(r=>Number(r?.[key])).filter(v=>Number.isFinite(v)&&v>0);
    return values.length?values.reduce((a,v)=>a+v,0)/values.length:null;
  },
  _delta(rows,key){
    const points=rows.map(r=>({date:this._dateValue(r.date),value:Number(r[key])}))
      .filter(p=>p.date!==null&&Number.isFinite(p.value)&&p.value>0)
      .sort((a,b)=>a.date-b.date);
    if(points.length<2) return {available:false,count:points.length,first:null,last:null,change:null,perDay:null};
    const first=points[0],last=points[points.length-1],days=Math.max(0,(last.date-first.date)/86400000);
    return {available:true,count:points.length,first:first.value,last:last.value,
      change:last.value-first.value,perDay:days>0?(last.value-first.value)/days:null};
  },
  calculate(season,data,today=todayISO()){
    const activities=Array.isArray(data.activities)?data.activities:[];
    const monitorings=(Array.isArray(data.monitorings)?data.monitorings:[]).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    const incidences=Array.isArray(data.incidences)?data.incidences:[];
    const harvests=(Array.isArray(data.harvests)?data.harvests:[]).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    const nutrition=Array.isArray(data.nutrition)?data.nutrition:[];
    const irrigations=Array.isArray(data.irrigations)?data.irrigations:[];
    const done=activities.filter(a=>a.status==='selesai');
    const overdue=activities.filter(a=>a.status==='terlambat'||(a.date&&a.date<today&&a.status!=='selesai'));
    const todayActivities=activities.filter(a=>a.status==='hariini'||a.date===today);
    const totalKg=harvests.reduce((sum,h)=>sum+Math.max(0,Number(h.weightKg)||0),0);
    const gradeA=harvests.reduce((sum,h)=>sum+Math.max(0,Number(h.gradeA)||0),0);
    const gradeB=harvests.reduce((sum,h)=>sum+Math.max(0,Number(h.gradeB)||0),0);
    const gradeC=harvests.reduce((sum,h)=>sum+Math.max(0,Number(h.gradeC)||0),0);
    const afkir=harvests.reduce((sum,h)=>sum+Math.max(0,Number(h.afkir)||0),0);
    const totalGrade=gradeA+gradeB+gradeC+afkir;
    const totalRevenue=harvests.reduce((sum,h)=>sum+Math.max(0,Number(h.revenue)||((Number(h.weightKg)||0)*(Number(h.pricePerKg)||0))),0);
    const effectiveArea=Number(season.effectiveArea)>0?Number(season.effectiveArea):(Number(season.area)>0?Number(season.area):0);
    const area=effectiveArea;
    const population=Number(season.population)>0?Number(season.population):0;
    const severity=incidences.map(i=>Number(i.percent)).filter(v=>Number.isFinite(v)&&v>0);
    const heavy=incidences.filter(i=>String(i.level||'').toLowerCase()==='berat').length;
    const confirmed=incidences.filter(i=>String(i.diagnosis||'').toLowerCase()==='terkonfirmasi').length;
    const growth={
      height:this._delta(monitorings,'height'),
      stemDia:this._delta(monitorings,'stemDia'),
      internode:this._delta(monitorings,'internode'),
      leafCount:this._delta(monitorings,'leafCount'),
      flowerCount:this._delta(monitorings,'flowerCount'),
      fruitCount:this._delta(monitorings,'fruitCount'),
      fruitWeight:this._delta(monitorings,'fruitWeight')
    };
    const monthly={};
    harvests.forEach(h=>{
      const key=String(h.date||'').slice(0,7);
      if(!/^\d{4}-\d{2}$/.test(key)) return;
      monthly[key]=(monthly[key]||0)+Math.max(0,Number(h.weightKg)||0);
    });
    const monthSeries=Object.entries(monthly).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6);
    return {
      seasonId:season.id, age:CropEngine.hstOf(season,today), ageLabel:CropEngine.ageLabel(season),
      phase:null,
      activities:{total:activities.length,done:done.length,overdue:overdue.length,today:todayActivities.length,
        completionRate:activities.length?done.length/activities.length*100:null},
      monitoring:{count:monitorings.length,samples:monitorings.reduce((sum,m)=>sum+Math.max(0,Number(m.samples)||0),0),
        lastDate:monitorings.length?monitorings[monitorings.length-1].date:'',
        avgHeight:this._average(monitorings,'height'),avgStemDia:this._average(monitorings,'stemDia'),
        avgLeafCount:this._average(monitorings,'leafCount'),growth},
      harvest:{transactions:harvests.length,totalKg,productivityArea:area?totalKg/area:null,
        productivityPlant:population?totalKg/population:null,totalRevenue,
        gradeA,gradeB,gradeC,afkir,totalGrade,
        gradeAPercent:totalGrade?gradeA/totalGrade*100:null,
        gradeBPercent:totalGrade?gradeB/totalGrade*100:null,
        gradeCPercent:totalGrade?gradeC/totalGrade*100:null,
        afkirPercent:totalGrade?afkir/totalGrade*100:null,monthSeries},
      opt:{count:incidences.length,heavy,confirmed,avgPercent:severity.length?severity.reduce((a,v)=>a+v,0)/severity.length:null,
        lastDate:incidences.map(i=>i.date).filter(Boolean).sort().slice(-1)[0]||''},
      inputs:{nutritionCount:nutrition.length,irrigationCount:irrigations.length,
        irrigationVolume:irrigations.reduce((sum,r)=>sum+Math.max(0,Number(r.volume)||0),0)},
      dataQuality:{hasArea:area>0,hasPopulation:population>0,hasMonitoring:monitorings.length>0,
        hasHarvest:harvests.length>0}
    };
  },
  async load(season){
    const [activities,monitorings,incidences,harvests,nutrition,irrigations,financial]=await Promise.all([
      getByIndex('activities','seasonId',season.id),getByIndex('monitorings','seasonId',season.id),
      getByIndex('incidences','seasonId',season.id),getByIndex('harvests','seasonId',season.id),
      getByIndex('nutrition_hist','seasonId',season.id),getByIndex('irrigations','seasonId',season.id),
      Financial.summary(season.id)
    ]);
    const data={activities,monitorings,incidences,harvests,nutrition,irrigations};
    const result=this.calculate(season,data);
    result.phase=await CropEngine.phaseForSeason(season,result.age);
    return {data,result,financial};
  },
  _metric(label,value,sub=''){
    return `<div class="metric"><span>${esc(label)}</span><strong>${value}</strong>${sub?`<small class="muted">${esc(sub)}</small>`:''}</div>`;
  },
  _bar(label,value,max,unit='kg'){
    const pct=max>0?Math.max(0,Math.min(100,value/max*100)):0;
    return `<div class="ana-bar-row"><div class="list-row" style="padding:0;border:0"><span>${esc(label)}</span><strong>${fmtNum(value,1)} ${esc(unit)}</strong></div><div class="chartbar"><div style="width:${pct.toFixed(1)}%"></div></div></div>`;
  },
  _growthLine(label,delta,unit){
    if(!delta.available) return `<div class="list-row"><span>${esc(label)}</span><strong class="muted">Data belum cukup</strong></div>`;
    const sign=delta.change>0?'+':'';
    return `<div class="list-row"><span>${esc(label)}</span><strong>${fmtNum(delta.first,1)} → ${fmtNum(delta.last,1)} ${esc(unit)} (${sign}${fmtNum(delta.change,1)})</strong></div>`;
  },
  async render(container,season){
    if(!season){container.innerHTML='<h2 class="page-title">Analisis Cerdas</h2><div class="notice">Pilih musim tanam terlebih dahulu.</div>';return;}
    container.innerHTML='<h2 class="page-title">Analisis Lanjutan</h2><p class="subtitle">Mengolah catatan aktual tanpa mengubah data budidaya.</p><div class="notice">Memuat analisis…</div>';
    let loaded;
    try{loaded=await this.load(season);}catch(error){console.error('Analytics load failed:',error);container.innerHTML='<h2 class="page-title">Analisis Lanjutan</h2><div class="notice red-notice">Data analisis gagal dimuat. Periksa penyimpanan, lalu coba buka kembali.</div>';return;}
    const {data,result:r,financial:fin}=loaded;
    const alerts=[];
    if(r.activities.overdue) alerts.push({level:'red',text:`${r.activities.overdue} kegiatan sudah melewati tanggal dan belum selesai.`});
    if(!r.monitoring.count) alerts.push({level:'blue',text:'Belum ada monitoring. Catatan berkala diperlukan untuk membaca tren pertumbuhan.'});
    else if(r.monitoring.count===1) alerts.push({level:'blue',text:'Baru ada satu catatan monitoring. Tambahkan pengamatan berikutnya untuk melihat perubahan.'});
    if(!r.harvest.transactions) alerts.push({level:'blue',text:'Belum ada transaksi panen; produktivitas belum dapat dihitung.'});
    if(r.opt.heavy) alerts.push({level:'orange',text:`Terdapat ${r.opt.heavy} kejadian OPT dengan tingkat serangan tercatat berat. Tinjau catatan lapangan.`});
    if(!r.dataQuality.hasArea) alerts.push({level:'orange',text:'Luas efektif belum tersedia/valid; produktivitas per m² tidak dihitung.'});
    if(!r.dataQuality.hasPopulation) alerts.push({level:'orange',text:'Populasi tanaman belum tersedia/valid; produktivitas per tanaman tidak dihitung.'});
    container.innerHTML=`
      <h2 class="page-title">Analisis Lanjutan</h2>
      <p class="subtitle">${esc(season.name||season.commodityName||'Musim tanam')} · ${esc(r.ageLabel)} ${r.age} · Fase ${esc(r.phase?.name||'—')}</p>
      ${alerts.length?alerts.map(a=>`<div class="notice ${a.level==='red'?'red-notice':a.level==='orange'?'':'green-notice'}">${esc(a.text)}</div>`).join(''):'<div class="green-notice notice">Belum ada peringatan berdasarkan indikator yang tersedia.</div>'}
      <div class="tabs ana-tabs">
        <button data-ana-tab="overview" class="active">Ringkasan</button>
        <button data-ana-tab="growth">Pertumbuhan</button>
        <button data-ana-tab="yield">Produktivitas</button>
        <button data-ana-tab="operations">Operasional</button>
      </div>
      <div id="ana-advanced-content"></div>`;
    const panel=container.querySelector('#ana-advanced-content');
    const show=tab=>{
      container.querySelectorAll('[data-ana-tab]').forEach(b=>b.classList.toggle('active',b.dataset.anaTab===tab));
      if(tab==='overview') panel.innerHTML=`
        <div class="grid">
          ${this._metric('Kegiatan selesai',`${r.activities.done}/${r.activities.total}`,r.activities.completionRate===null?'Belum ada jadwal':`Penyelesaian ${fmtNum(r.activities.completionRate,1)}%`)}
          ${this._metric('Total panen',`${fmtNum(r.harvest.totalKg,1)} kg`,`${r.harvest.transactions} transaksi`)}
          ${this._metric('Monitoring',r.monitoring.count,`${r.monitoring.samples} total sampel`)}
          ${this._metric('Kejadian OPT',r.opt.count,`${r.opt.heavy} tingkat berat`)}
        </div>
        <div class="card"><h3>Indikator pertumbuhan terakhir</h3>
          ${this._growthLine('Tinggi tanaman',r.monitoring.growth.height,'cm')}
          ${this._growthLine('Diameter batang',r.monitoring.growth.stemDia,'mm')}
          ${this._growthLine('Jumlah daun',r.monitoring.growth.leafCount,'helai')}
          ${this._growthLine('Jumlah buah',r.monitoring.growth.fruitCount,'buah')}
          <p class="tiny muted">Perubahan dihitung dari catatan pertama hingga terakhir yang memiliki nilai valid; bukan target pertumbuhan baku.</p>
        </div>
        <div class="card"><h3>Ringkasan keuangan aktual</h3>
          <div class="list-row"><span>Biaya</span><strong>${rupiah(fin.totalCost)}</strong></div>
          <div class="list-row"><span>Pendapatan</span><strong>${rupiah(fin.totalRevenue)}</strong></div>
          <div class="list-row"><span>Laba/Rugi</span><strong>${rupiah(fin.profit)}</strong></div>
          <p class="tiny muted">Ringkasan ini menggunakan modul Keuangan; analisis laporan keuangan lanjutan disiapkan pada Tahap 11B.</p>
        </div>`;
      if(tab==='growth'){
        const rows=[['Tinggi tanaman','height','cm'],['Diameter batang','stemDia','mm'],['Jumlah daun','leafCount','helai'],['Panjang ruas','internode','cm'],['Jumlah bunga','flowerCount','bunga'],['Jumlah buah','fruitCount','buah'],['Berat buah rata-rata','fruitWeight','g']];
        const maxHeight=Math.max(1,...data.monitorings.map(m=>Number(m.height)||0));
        panel.innerHTML=`<div class="card"><h3>Perkembangan tinggi tanaman</h3>
          ${data.monitorings.length?data.monitorings.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).slice(-8).map(m=>`<div class="ana-bar-row"><div class="list-row" style="padding:0;border:0"><span>${fmtDate(m.date)} · ${esc(r.ageLabel)} ${m.hst??'—'}</span><strong>${fmtNum(m.height,1)} cm</strong></div><div class="chartbar"><div style="width:${Math.max(0,Math.min(100,(Number(m.height)||0)/maxHeight*100)).toFixed(1)}%"></div></div></div>`).join(''):'<div class="empty">Belum ada catatan monitoring.</div>'}
        </div><div class="card"><h3>Perubahan antar catatan</h3>${rows.map(([label,key,unit])=>this._growthLine(label,r.monitoring.growth[key],unit)).join('')}
          <p class="tiny muted">Angka perubahan hanya ditampilkan jika tersedia minimal dua catatan bertanggal dan bernilai positif.</p>
        </div><div class="card"><h3>Kondisi daun tercatat</h3>${this._leafConditions(data.monitorings)}</div>`;
      }
      if(tab==='yield'){
        const gradeMax=Math.max(1,r.harvest.gradeA,r.harvest.gradeB,r.harvest.gradeC,r.harvest.afkir);
        panel.innerHTML=`<div class="grid">
          ${this._metric('Produktivitas per luas',r.harvest.productivityArea===null?'—':`${fmtNum(r.harvest.productivityArea,2)} kg/m²`)}
          ${this._metric('Produktivitas per tanaman',r.harvest.productivityPlant===null?'—':`${fmtNum(r.harvest.productivityPlant,2)} kg/tanaman`)}
          ${this._metric('Rata-rata per transaksi',r.harvest.transactions?`${fmtNum(r.harvest.totalKg/r.harvest.transactions,2)} kg`:'—')}
          ${this._metric('Pendapatan panen',rupiah(r.harvest.totalRevenue))}
        </div><div class="card"><h3>Komposisi hasil panen</h3>
          ${r.harvest.totalGrade?`${this._bar('Grade A',r.harvest.gradeA,gradeMax)}${this._bar('Grade B',r.harvest.gradeB,gradeMax)}${this._bar('Grade C',r.harvest.gradeC,gradeMax)}${this._bar('Afkir',r.harvest.afkir,gradeMax)}`:'<div class="empty">Data berat grade belum tersedia.</div>'}
          <p class="tiny muted">Persentase grade memakai total berat grade yang dicatat. Jika grade belum diisi, komposisi tidak dapat dihitung.</p>
        </div><div class="card"><h3>Tren panen per bulan</h3>
          ${r.harvest.monthSeries.length?r.harvest.monthSeries.map(([month,kg])=>this._bar(month,kg,Math.max(1,...r.harvest.monthSeries.map(x=>x[1])))).join(''):'<div class="empty">Belum ada tanggal panen valid.</div>'}
        </div>`;
      }
      if(tab==='operations'){
        const nutritionCount=r.inputs.nutritionCount, irrigationCount=r.inputs.irrigationCount;
        panel.innerHTML=`<div class="grid">
          ${this._metric('Kegiatan terlambat',r.activities.overdue)}
          ${this._metric('Kegiatan hari ini',r.activities.today)}
          ${this._metric('Riwayat nutrisi',nutritionCount)}
          ${this._metric('Catatan irigasi',irrigationCount,`${fmtNum(r.inputs.irrigationVolume,1)} L tercatat`)}
        </div><div class="card"><h3>Kepatuhan jadwal</h3>
          <div class="list-row"><span>Selesai</span><strong>${r.activities.done}</strong></div>
          <div class="list-row"><span>Terlambat / lewat tanggal</span><strong>${r.activities.overdue}</strong></div>
          <div class="list-row"><span>Belum selesai lainnya</span><strong>${Math.max(0,r.activities.total-r.activities.done-r.activities.overdue)}</strong></div>
          <div class="progress"><div style="width:${r.activities.completionRate===null?0:Math.max(0,Math.min(100,r.activities.completionRate)).toFixed(1)}%"></div></div>
          <p class="tiny muted">Tingkat penyelesaian = kegiatan berstatus selesai ÷ seluruh kegiatan pada musim ini.</p>
        </div><div class="card"><h3>Pemantauan OPT</h3>
          <div class="list-row"><span>Kejadian tercatat</span><strong>${r.opt.count}</strong></div>
          <div class="list-row"><span>Diagnosis terkonfirmasi</span><strong>${r.opt.confirmed}</strong></div>
          <div class="list-row"><span>Tingkat berat</span><strong>${r.opt.heavy}</strong></div>
          <div class="list-row"><span>Rata-rata persentase serangan tercatat</span><strong>${r.opt.avgPercent===null?'—':`${fmtNum(r.opt.avgPercent,1)}%`}</strong></div>
          <p class="tiny muted">Indikator ini merangkum catatan pengguna, bukan diagnosis otomatis atau penilaian tingkat risiko biologis.</p>
        </div>`;
      }
    };
    container.querySelectorAll('[data-ana-tab]').forEach(b=>b.onclick=()=>show(b.dataset.anaTab));
    show('overview');
  },
  _leafConditions(rows){
    const counts={};rows.forEach(r=>{const key=String(r.leafCondition||'').trim();if(key)counts[key]=(counts[key]||0)+1;});
    const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    return entries.length?entries.map(([name,count])=>`<div class="list-row"><span>${esc(name)}</span><strong>${count}</strong></div>`).join(''):'<div class="empty">Belum ada kondisi daun yang dicatat.</div>';
  }
};
