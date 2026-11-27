/* ============ ADVANCED NUTRITION ENGINE UI — Tahap 10A ============
 * Multi-produk non-negative nutrient solver and product-based AB stock solver.
 * All calculations are theoretical and derived from fertilizer master analysis.
 */
const AdvancedNutrition = {
  keys:['N','P','K','Ca','Mg','S','Fe','Mn','Zn','Cu','B','Mo'],
  labels:{N:'N',P:'P (unsur)',K:'K (unsur)',Ca:'Ca',Mg:'Mg',S:'S',Fe:'Fe',Mn:'Mn',Zn:'Zn',Cu:'Cu',B:'B',Mo:'Mo'},
  targetFields(prefix, defaults={}){
    return `<div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">${this.keys.map(k=>`<div class="field"><label>${this.labels[k]} (ppm)</label><input type="number" min="0" step="0.1" id="${prefix}-${k}" value="${defaults[k]??0}"></div>`).join('')}</div>`;
  },
  readTargets(prefix, root=document){
    const out={};
    this.keys.forEach(k=>{const el=root.querySelector(`#${prefix}-${k}`);out[k]=el?Number(el.value):0;});
    return out;
  },
  fertilizerRows(ferts, mode='mix'){
    return `<div id="${mode}-product-list"></div><button type="button" class="btn small secondary" id="${mode}-add-product">+ Tambah Produk</button>`;
  },
  bindProductRows(root, ferts, mode='mix'){
    const list=root.querySelector(`#${mode}-product-list`), add=root.querySelector(`#${mode}-add-product`);
    let counter=0;
    const append=(value='',stock='A')=>{
      const row=document.createElement('div'); row.className=`${mode}-product-row field-row`; row.style.cssText='align-items:end;gap:6px;margin:8px 0';
      row.innerHTML=`<div class="field" style="flex:3"><label>Produk pupuk</label><select data-fert><option value="">— Pilih pupuk —</option>${ferts.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select></div>${mode==='ab'?`<div class="field" style="flex:1"><label>Stok</label><select data-stock><option value="A">A</option><option value="B">B</option></select></div>`:''}<button type="button" class="btn small danger" data-remove>✕</button>`;
      row.querySelector('[data-fert]').value=value?String(value):'';
      if(row.querySelector('[data-stock]')) row.querySelector('[data-stock]').value=stock;
      row.querySelector('[data-remove]').onclick=()=>{if(list.children.length<=1)return toast('Minimal satu produk harus dipilih');row.remove();};
      list.appendChild(row); counter++;
    };
    append(ferts[0]?.id||'', 'A');
    add.onclick=()=>append('', 'A');
    return ()=>[...list.querySelectorAll(`.${mode}-product-row`)].map(row=>({fertilizer:ferts.find(f=>String(f.id)===String(row.querySelector('[data-fert]').value)),stock:row.querySelector('[data-stock]')?.value||'A'}));
  },
  nutrientTable(target,actual){
    return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>Unsur</th><th>Target</th><th>Hasil</th><th>Selisih</th></tr></thead><tbody>${this.keys.map(k=>{const t=Number(target[k]||0),a=Number(actual[k]||0),d=a-t;return `<tr><td>${k}</td><td>${fmtNum(t,2)}</td><td>${fmtNum(a,2)}</td><td style="color:${Math.abs(d)<=.1?'var(--green)':d>0?'#b36b00':'var(--red)'}">${d>0?'+':''}${fmtNum(d,2)}</td></tr>`;}).join('')}</tbody></table></div>`;
  },
  async renderMultiProduct(container, season){
    const ferts=await getAll('fertilizers');
    container.innerHTML=`<div class="card"><h3>Formulator Nutrisi Multi-Produk</h3><p class="muted tiny">Pilih beberapa pupuk dan target unsur dalam ppm larutan akhir. Mesin mencari kombinasi dosis non-negatif yang paling mendekati target berdasarkan komposisi Master Data.</p>
      ${!ferts.length?'<div class="notice">Master Data pupuk masih kosong.</div>':`${this.fertilizerRows(ferts,'mix')}<div class="field"><label>Volume larutan akhir (liter)</label><input id="mix-liters" type="number" min="0.01" step="0.1" value="100"></div><h4>Target unsur (ppm)</h4>${this.targetFields('mix-target',{N:150,P:40,K:180})}<button type="button" class="btn" id="mix-solve">Hitung Formulasi</button><div id="mix-result"></div>`}</div>`;
    if(!ferts.length)return;
    const readRows=this.bindProductRows(container,ferts,'mix');
    container.querySelector('#mix-solve').onclick=async()=>{
      const rows=readRows(), liters=Number(container.querySelector('#mix-liters').value), target=this.readTargets('mix-target',container);
      if(rows.some(r=>!r.fertilizer))return toast('Pilih produk pupuk pada setiap baris.');
      let result;try{result=await NutritionEngine.solveMultiProduct({items:rows,targetPpm:target,liters});}catch(e){return toast(e.message||'Formulasi gagal.');}
      if(!result.products.length)return toast('Tidak ditemukan dosis positif. Periksa target dan komposisi pupuk.');
      const warnings=NutritionEngine.checkIncompatibility(result.products.map(p=>p.name));
      const output=container.querySelector('#mix-result');
      output.innerHTML=`<div class="notice green-notice" style="margin-top:12px">Total bahan: <strong>${fmtNum(result.totalGrams,3)} g</strong> untuk ${fmtNum(liters,2)} L larutan (${fmtNum(result.totalGrams/liters,4)} g/L).</div>
        <h4>Dosis hasil optimasi</h4>${result.products.map(p=>`<div class="list-row"><span>${esc(p.name)}<small>${fmtNum(p.grams/liters,4)} g/L · ${fmtNum(p.grams/liters*16,3)} g/16 L</small></span><strong>${fmtNum(p.grams,4)} g</strong></div>`).join('')}
        <h4>Target vs hasil (ppm)</h4>${this.nutrientTable(result.target,result.actual)}
        ${warnings.map(w=>`<div class="notice">⚠ ${esc(w)}</div>`).join('')}
        <p class="tiny muted">${esc(result.note)}</p>
        <div class="field"><label>Nama kegiatan (opsional untuk dijadwalkan)</label><input id="mix-activity-title" value="Pemupukan formulasi nutrisi"></div>
        <div class="field"><label>Tanggal kegiatan</label><input id="mix-activity-date" type="date" value="${todayISO()}"></div>
        ${season?`<div class="card" style="padding:10px;margin-top:10px"><h4>Simpan sebagai resep SOP</h4><p class="tiny muted">Konversi hasil formulasi total menjadi dosis per tanaman. Pastikan volume larutan dan populasi menggambarkan satu kali aplikasi.</p><div class="field"><label>Nama resep</label><input id="mix-recipe-name" value="Formulasi ${esc(season.commodityName||'Tanaman')}"></div><div class="field-row"><div class="field"><label>${CropEngine.ageLabel(season)} awal</label><input id="mix-recipe-start" type="number" min="0" step="1" value="${CropEngine.hstOf(season)}"></div><div class="field"><label>${CropEngine.ageLabel(season)} akhir</label><input id="mix-recipe-end" type="number" min="0" step="1" value="${CropEngine.hstOf(season)}"></div></div><div class="field"><label>Populasi tanaman</label><input id="mix-recipe-pop" type="number" min="1" step="1" value="${num(season.population)||1}"></div><button class="btn secondary" id="mix-save-recipe">Simpan sebagai Resep SOP</button></div>`:''}
        <div class="btn-row"><button class="btn secondary" id="mix-save-history">Simpan Riwayat</button>${season?'<button class="btn" id="mix-create-activity">Jadikan Kegiatan</button>':''}</div>`;
      const payload={type:'multi-product-formula',liters,target:result.target,products:result.products.map(p=>({fertilizerId:p.fertilizerId,productId:p.productId,name:p.name,grams:p.grams,unit:'g'})),result};
      output.querySelector('#mix-save-history').onclick=async()=>{if(!season)return toast('Pilih musim aktif untuk menyimpan riwayat.');try{await NutritionEngine.saveHistory(season.id,payload);toast('Riwayat formulasi disimpan.');}catch(e){toast('Gagal menyimpan riwayat: '+e.message);}};
      if(season)output.querySelector('#mix-save-recipe').onclick=async()=>{
        const name=output.querySelector('#mix-recipe-name').value.trim(),start=Number(output.querySelector('#mix-recipe-start').value),end=Number(output.querySelector('#mix-recipe-end').value),population=Number(output.querySelector('#mix-recipe-pop').value);
        if(!name||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||!Number.isInteger(population)||population<1)return toast('Nama resep, rentang umur, dan populasi harus valid.');
        const recipe={id:uid('mix'),name,note:`Dibuat dari Advanced Nutrition Formulator. Formula asal ${fmtNum(liters,2)} L. Target: ${JSON.stringify(result.target)}; hasil: ${JSON.stringify(result.actual)}.`,createdAt:new Date().toISOString(),source:'advanced-nutrition',phases:[{id:uid('mfp'),name:'Fase Formulasi',hstStart:start,hstEnd:end,dosePerPlant:result.totalGrams/population,waterPerPlant:liters*1000/population,population,items:result.products.map(p=>({fertId:p.fertilizerId,ratio:Math.max(1,Math.round(p.grams*1000)),productId:p.productId,name:p.name}))}]};
        try{await put('mixed_recipes',recipe);toast('Resep tersimpan. Sekarang dapat dipilih saat menyusun SOP.');}catch(e){toast('Gagal menyimpan resep: '+(e.message||e));}
      };
      if(season)output.querySelector('#mix-create-activity').onclick=async()=>{
        const date=output.querySelector('#mix-activity-date').value;
        if(!date)return toast('Tanggal kegiatan wajib diisi.');
        const products=result.products.map(p=>({name:p.name,productName:p.name,category:'Pupuk',fertId:p.fertilizerId,productId:p.productId,gramsTotal:p.grams,plannedGrams:p.grams,dose:`${fmtNum(p.grams,3)} g untuk ${fmtNum(liters,2)} L`}));
        const activity={id:uid('act'),seasonId:season.id,title:output.querySelector('#mix-activity-title').value.trim()||'Pemupukan formulasi nutrisi',type:'Pemupukan',date,time:'07:00',hst:Math.max(0,daysBetween(CropEngine.ageStartDate(season),date)),productName:products.map(p=>p.name).join(' + '),dose:products.map(p=>`${p.name}: ${fmtNum(p.grams,3)} g`).join(' | '),waterVolume:`${liters} L`,note:`Formulasi multi-produk. Target ppm: ${JSON.stringify(result.target)}. Hasil ppm: ${JSON.stringify(result.actual)}. ${result.note}`,products,status:date<todayISO()?'terlambat':date===todayISO()?'hariini':'terjadwal',source:'nutrition-formulator',nutritionSnapshot:clone(result)};
        try{await put('activities',activity);await NutritionEngine.saveHistory(season.id,payload);toast('Kegiatan dibuat dan riwayat formulasi disimpan.');Router.go('activity');}catch(e){toast('Gagal membuat kegiatan: '+(e.message||e));}
      };
    };
  },
  async renderABMix(container, season){
    const ferts=await getAll('fertilizers');
    container.innerHTML=`<div class="card"><h3>AB Mix Pro — Formulasi dari Master Pupuk</h3><p class="muted tiny">Pilih pupuk yang akan dimasukkan ke stok A atau B. Mesin menghitung gram per volume stok berdasarkan target ppm larutan kerja dan faktor pengenceran. Produk di stok A dan B tetap terpisah.</p>
      ${!ferts.length?'<div class="notice">Master Data pupuk masih kosong.</div>':`${this.fertilizerRows(ferts,'ab')}<div class="field-row"><div class="field"><label>Volume stok A (L)</label><input id="abp-vol-a" type="number" min="0.01" value="10"></div><div class="field"><label>Volume stok B (L)</label><input id="abp-vol-b" type="number" min="0.01" value="10"></div></div><div class="field"><label>Faktor pengenceran / injeksi</label><input id="abp-dilution" type="number" min="1" value="100"></div><h4>Target larutan kerja (ppm)</h4>${this.targetFields('abp-target',{N:150,P:40,K:180,Ca:150,Mg:40,S:50})}<button type="button" class="btn" id="abp-solve">Hitung Stok A/B</button><div id="abp-result"></div>`}</div>`;
    if(!ferts.length)return;
    const readRows=this.bindProductRows(container,ferts,'ab');
    container.querySelector('#abp-solve').onclick=async()=>{
      const rows=readRows(),target=this.readTargets('abp-target',container);
      if(rows.some(r=>!r.fertilizer))return toast('Pilih pupuk pada setiap baris.');
      let result;try{result=NutritionEngine.solveStockFormula({items:rows,targetPpm:target,stockVolumeA_L:Number(container.querySelector('#abp-vol-a').value),stockVolumeB_L:Number(container.querySelector('#abp-vol-b').value),dilutionFactor:Number(container.querySelector('#abp-dilution').value)});}catch(e){return toast(e.message||'Formulasi AB Mix gagal.');}
      const output=container.querySelector('#abp-result');
      output.innerHTML=`<div class="notice green-notice" style="margin-top:12px">Formula A: <strong>${fmtNum(result.totalGramsA,3)} g</strong> · Formula B: <strong>${fmtNum(result.totalGramsB,3)} g</strong></div>
        <h4>Komposisi stok A</h4>${result.byStock.A.length?result.byStock.A.map(p=>`<div class="list-row"><span>${esc(p.name)}</span><strong>${fmtNum(p.grams,3)} g</strong></div>`).join(''):'<p class="muted tiny">Tidak ada pupuk terpilih untuk stok A.</p>'}
        <h4>Komposisi stok B</h4>${result.byStock.B.length?result.byStock.B.map(p=>`<div class="list-row"><span>${esc(p.name)}</span><strong>${fmtNum(p.grams,3)} g</strong></div>`).join(''):'<p class="muted tiny">Tidak ada pupuk terpilih untuk stok B.</p>'}
        <h4>Target vs hasil larutan kerja (ppm)</h4>${this.nutrientTable(result.target,result.actual)}
        ${result.warnings.map(w=>`<div class="notice">⚠ ${esc(w)}</div>`).join('')}
        <div class="notice">Jangan mencampur stok pekat A dan B. Larutkan masing-masing secara terpisah dan pastikan semua bahan benar-benar larut.</div>
        <p class="tiny muted">${esc(result.note)}</p><button class="btn secondary" id="abp-save">Simpan Riwayat AB Mix</button>`;
      output.querySelector('#abp-save').onclick=async()=>{if(!season)return toast('Pilih musim aktif untuk menyimpan riwayat.');try{await NutritionEngine.saveHistory(season.id,{type:'abmix-multi-product',target:result.target,products:result.products.map(p=>({fertilizerId:p.fertilizerId,productId:p.productId,name:p.name,stock:p.stock,grams:p.grams,unit:'g'})),stockVolumeA_L:result.stockVolumeA_L,stockVolumeB_L:result.stockVolumeB_L,dilutionFactor:result.dilutionFactor,result});toast('Riwayat AB Mix disimpan.');}catch(e){toast('Gagal menyimpan riwayat: '+e.message);}};
    };
  }
};
