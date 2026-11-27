/* ============ PDF Export — Tahap 11B ============
 * Membuat PDF lokal tanpa server. Hanya membaca data musim; tidak menulis ke IndexedDB.
 */
const PDFExport = {
  _ascii(value) {
    return String(value ?? '')
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-').replace(/\u2022/g, '-')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '?');
  },
  _escape(value) {
    return this._ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  },
  _wrap(value, max=92) {
    const text = this._ascii(value).replace(/\s+/g, ' ').trim();
    if (!text) return [''];
    const words = text.split(' '), lines=[];
    let line='';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > max && line) { lines.push(line); line=word; }
      else line=next;
    }
    if (line) lines.push(line);
    return lines;
  },
  _date(value) { try { return value ? fmtDate(value) : '-'; } catch (_) { return value || '-'; } },
  _money(value) { try { return rupiah(Number(value)||0); } catch (_) { return `Rp ${Number(value)||0}`; } },
  _number(value, digits=2) { return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-'; },
  _buildPages(g) {
    const s=g.season||{}, f=g.financial||{};
    const lines=[];
    const add=(text='',kind='body')=>this._wrap(text,kind==='title'?66:kind==='section'?78:92).forEach(line=>lines.push({text:line,kind}));
    const section=(title)=>{ lines.push({text:'',kind:'gap'}); add(title,'section'); add('-'.repeat(Math.min(84,title.length+8)),'rule'); };
    add('ARKEJA FARM - LAPORAN MUSIM','title');
    add(s.name||s.commodityName||'Musim Budidaya','subtitle');
    add(`Komoditas: ${s.commodityName||'-'} | Varietas: ${s.varietyName||s.variety||'-'}`);
    add(`Lahan: ${s.landName||'-'} | Luas: ${this._number(s.area,2)} m2 | Luas efektif: ${this._number(s.effectiveArea??s.area,2)} m2`);
    add(`Populasi: ${s.population??'-'} | Tanggal tanam: ${this._date(s.plantingDate)} | Umur: ${typeof CropEngine!=='undefined'?`${CropEngine.ageLabel(s)} ${CropEngine.hstOf(s)}`:'-'}`);
    add(`Dibuat: ${new Date().toLocaleString('id-ID')}`);

    section('RINGKASAN KEUANGAN');
    add(`Total biaya: ${this._money(f.totalCost)} | Total pendapatan: ${this._money(f.totalRevenue)}`);
    add(`${Number(f.profit)>=0?'Laba':'Rugi'}: ${this._money(f.profit)} | ROI: ${this._number(f.roi,1)}% | Margin: ${this._number(f.margin,1)}%`);
    add(`HPP / BEP harga per kg: ${this._money(f.hpp)} | Harga jual rata-rata panen: ${this._money(f.averageHarvestPrice)}`);
    add(`BEP volume: ${f.breakEvenKg==null?'-':`${this._number(f.breakEvenKg,2)} kg`} | Total panen: ${this._number(f.totalKg,2)} kg`);
    add(`Biaya per tanaman: ${f.costPerPlant==null?'-':this._money(f.costPerPlant)} | Laba per tanaman: ${f.profitPerPlant==null?'-':this._money(f.profitPerPlant)}`);
    add(`Biaya per m2: ${f.costPerM2==null?'-':this._money(f.costPerM2)} | Laba per m2: ${f.profitPerM2==null?'-':this._money(f.profitPerM2)}`);

    section('BIAYA MENURUT KATEGORI');
    const categories=Object.entries(f.byCategory||{}).sort((a,b)=>b[1]-a[1]);
    if(categories.length) categories.forEach(([k,v])=>add(`${k}: ${this._money(v)} (${f.totalCost?this._number(v/f.totalCost*100,1):'0.0'}%)`));
    else add('Belum ada biaya tercatat.');
    section('RINCIAN BIAYA');
    if(g.costs?.length) g.costs.forEach((c,i)=>add(`${i+1}. ${this._date(c.date)} | ${c.name||'Biaya'} | ${c.category||'Lainnya'} | ${this._money(c.amount)}${c.note?` | ${c.note}`:''}`));
    else add('Belum ada transaksi biaya.');

    section('TRANSAKSI PANEN DAN PENDAPATAN');
    if(g.harvests?.length) g.harvests.forEach((h,i)=>add(`${i+1}. ${this._date(h.date)} | ${this._number(h.weightKg,2)} kg | A:${h.gradeA??0} B:${h.gradeB??0} C:${h.gradeC??0} Afkir:${h.afkir??0} | Harga/kg ${this._money(h.pricePerKg)} | Pendapatan ${this._money(h.revenue||Number(h.weightKg||0)*Number(h.pricePerKg||0))}`));
    else add('Belum ada transaksi panen.');
    if(f.legacyRevenues?.length) f.legacyRevenues.forEach((r,i)=>add(`Pendapatan lama ${i+1}. ${this._date(r.date)} | ${r.name||r.description||'Pendapatan lama'} | ${this._money(r.amount??r.revenue??r.total??r.income??r.value)}`));

    section('ARUS KAS PER BULAN');
    if(f.monthlyCashflow?.length) f.monthlyCashflow.forEach(m=>add(`${m.month}: Biaya ${this._money(m.cost)} | Pendapatan ${this._money(m.revenue)} | Selisih ${this._money(m.net)}`));
    else add('Belum ada tanggal transaksi yang dapat dikelompokkan.');

    section(`RIWAYAT NUTRISI (${g.nutritionHistory?.length||0})`);
    if(g.nutritionHistory?.length) g.nutritionHistory.forEach((n,i)=>{
      const products=(n.products||[]).map(p=>`${p.name||p.product||'Produk'} ${p.grams??p.dose??''}${p.unit||'g'}`).join(', ')||n.product||'-';
      add(`${i+1}. ${this._date(n.createdAt||n.date)} | ${n.type||'Nutrisi'} | ${products} | ${n.liters??'-'} L${n.note?` | ${n.note}`:''}`);
    }); else add('Belum ada riwayat nutrisi.');

    section(`KEGIATAN (${g.activities?.length||0})`);
    if(g.activities?.length) g.activities.forEach((a,i)=>add(`${i+1}. ${this._date(a.date)} | ${a.title||a.name||'Kegiatan'} | Status: ${a.status||'-'}${a.dose?` | Dosis: ${a.dose}`:''}`));
    else add('Belum ada kegiatan tercatat.');

    section(`MONITORING (${g.monitorings?.length||0})`);
    if(g.monitorings?.length) g.monitorings.forEach((m,i)=>add(`${i+1}. ${this._date(m.date)} | Umur ${m.hst??'-'} | Tinggi ${m.height??'-'} cm | Diameter ${m.stemDia??'-'} | Daun ${m.leafCount??'-'} | Bunga ${m.flowerCount??'-'} | Buah ${m.fruitCount??'-'} | Kondisi: ${m.leafCondition||'-'}`));
    else add('Belum ada catatan monitoring.');

    section(`HAMA DAN PENYAKIT (${g.incidences?.length||0})`);
    if(g.incidences?.length) g.incidences.forEach((r,i)=>add(`${i+1}. ${this._date(r.date)} | ${r.name||'OPT'} | ${r.type||'-'} | Tingkat: ${r.level||'-'} | Tindakan: ${r.action||'-'}`));
    else add('Belum ada kejadian OPT tercatat.');

    section(`IRIGASI (${g.irrigations?.length||0})`);
    if(g.irrigations?.length) g.irrigations.forEach((r,i)=>add(`${i+1}. ${this._date(r.date)} | Volume: ${r.volume??r.liters??'-'} L | Metode: ${r.method||'-'}${r.note?` | ${r.note}`:''}`));
    else add('Belum ada catatan irigasi.');
    add(''); add('Laporan ini dibuat dari data yang tercatat pada ARKEJA FARM.');
    return lines;
  },
  create(g) {
    const all=this._buildPages(g), pages=[];
    let page=[], y=786;
    const pushPage=()=>{ pages.push(page); page=[]; y=786; };
    for(const line of all){
      const size=line.kind==='title'?16:line.kind==='subtitle'?12:line.kind==='section'?11:line.kind==='rule'?7:9;
      const leading=line.kind==='gap'?7:(line.kind==='section'?17:line.kind==='title'?23:line.kind==='subtitle'?19:13);
      if(y-leading<48) pushPage();
      page.push({text:line.text,y,size,bold:['title','subtitle','section'].includes(line.kind)});
      y-=leading;
    }
    if(page.length||!pages.length) pushPage();
    const enc=new TextEncoder(), objects=[];
    const pageIds=pages.map((_,i)=>5+i*2);
    objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
    objects[2]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    pages.forEach((rows,i)=>{
      const content=[];
      content.push('0.16 0.42 0.23 rg');
      content.push(`BT /F1 8 Tf 42 814 Td (ARKEJA FARM - Laporan Musim) Tj ET`);
      content.push('0 0 0 rg');
      rows.forEach(r=>{
        const font=r.bold?'/F2':'/F1';
        const text=this._escape(r.text);
        content.push(`BT ${font} ${r.size} Tf 42 ${r.y} Td (${text}) Tj ET`);
      });
      content.push(`BT /F1 8 Tf 42 28 Td (Halaman ${i+1} dari ${pages.length}) Tj ET`);
      const stream=content.join('\n');
      const pageId=5+i*2, contentId=pageId+1;
      objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId]=`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`;
    });
    let pdf='%PDF-1.4\n%ARKEJA\n', offsets=[0];
    for(let i=1;i<objects.length;i++){
      offsets[i]=enc.encode(pdf).length;
      pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xref=enc.encode(pdf).length;
    pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for(let i=1;i<objects.length;i++) pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
    pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return enc.encode(pdf);
  }
};
