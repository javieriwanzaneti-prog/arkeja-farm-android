/* ============ SOP Engine ============ */
const SopEngine = {
  // SOP template adalah sumber rekomendasi; SOP non-template adalah milik pengguna.
  async listOwned(){ return (await getAll('sops')).filter(s=>s.isTemplate!==true); },
  async listRecommendations(){ return (await getAll('sops')).filter(s=>s.isTemplate===true); },
  async evaluateForSeason(seasonId){
    const season=await getOne('seasons',seasonId);
    if(!season) throw new Error('Musim tanam tidak ditemukan');
    const [profile,all]=await Promise.all([CropEngine.getSeasonProfile(season),getAll('sops')]);
    const age=CropEngine.ageOf(season);
    const phase=await CropEngine.phaseForSeason(season,age);
    const candidates=all.filter(s=>s.isTemplate!==true);
    const recommendations=all.filter(s=>s.isTemplate===true);
    const evaluate=s=>{
      const items=(allItems||[]).filter(i=>String(i.sopId)===String(s.id));
      const reasons=[];
      const compatible=(!s.commodityId||String(s.commodityId)===String(season.commodityId))&&(!s.varietyId||String(s.varietyId)===String(season.varietyId));
      if(!compatible) reasons.push('Komoditas atau varietas tidak cocok dengan musim aktif.');
      const current=items.filter(i=>age>=Number(i.hstStart)&&age<=Number(i.hstEnd));
      const phaseItems=items.filter(i=>String(i.phase||'').toLowerCase()===String(phase?.name||'').toLowerCase());
      const missingDose=items.filter(i=>!(i.dose||i.products?.some(p=>p.dose)));
      if(!items.length) reasons.push('SOP belum memiliki item kegiatan.');
      if(missingDose.length) reasons.push(`${missingDose.length} item belum mencantumkan dosis.`);
      if(!phaseItems.length) reasons.push(`Belum ada item yang ditandai untuk fase ${phase?.name||'saat ini'}.`);
      return {sop:s,items,compatible,currentCount:current.length,phaseCount:phaseItems.length,missingDoseCount:missingDose.length,reasons,score:(compatible?50:0)+(items.length?20:0)+(phaseItems.length?20:0)+(missingDose.length===0&&items.length?10:0)};
    };
    const allItems=await getAll('sop_items');
    return {season,profile,age,phase,population:Number(season.population)||0,area:Number(season.effectiveArea)||Number(season.area)||0,owned:candidates.map(evaluate).sort((a,b)=>b.score-a.score),recommendations:recommendations.map(evaluate).sort((a,b)=>b.score-a.score)};
  },
  async adoptRecommendation(sopId){
    const source=(await getAll('sops')).find(s=>String(s.id)===String(sopId));
    if(!source||source.isTemplate!==true) throw new Error('Sumber rekomendasi tidak valid.');
    const sourceItems=await this.items(sopId);
    if(!sourceItems.length) throw new Error('Rekomendasi belum memiliki item kegiatan.');
    const copyId=uid('sop');
    const copy={...clone(source),id:copyId,name:`${source.name} (Salinan)`,isTemplate:false,origin:'recommendation',sourceSopId:source.id,createdAt:todayISO(),updatedAt:todayISO()};
    const copiedItems=sourceItems.map(item=>({...clone(item),id:uid('si'),sopId:copyId}));
    await put('sops',copy);
    try{ await putMany('sop_items',copiedItems); }
    catch(error){
      // Roll back only the newly created copy; never touch the source template.
      try{ await deleteSOPCascade(copyId); }catch(rollbackError){ console.error('Rollback salinan SOP gagal:',rollbackError); }
      throw error;
    }
    return copy;
  },
  async listForVariety(varietyId, commodityId=null){
    const all = await getAll('sops');
    return all.filter(s => {
      const varietyMatch = !s.varietyId || (varietyId && String(s.varietyId) === String(varietyId));
      const commodityMatch = !s.commodityId || (commodityId && String(s.commodityId) === String(commodityId));
      return varietyMatch && commodityMatch;
    });
  },
  async items(sopId){
    if(!sopId) return [];
    const all = typeof getByIndex==='function'
      ? await getByIndex('sop_items','sopId',sopId)
      : (await getAll('sop_items')).filter(x=>String(x.sopId)===String(sopId));
    return sortBy(all, 'hstStart');
  },
  _snapshotForSeason(snapshot, season){
    const result=clone(snapshot||{});
    const sourcePopulation=num(result.population);
    const seasonPopulation=num(season?.population);
    const population=seasonPopulation>0?seasonPopulation:sourcePopulation;
    const items=Array.isArray(result.items)?result.items:[];
    if(!items.length) throw new Error('Resep campuran pada SOP tidak memiliki komposisi pupuk');
    if(items.some(item=>num(item.ratio)<=0)) throw new Error('Rasio salah satu pupuk pada resep campuran tidak valid');
    const totalRatio=items.reduce((sum,item)=>sum+num(item.ratio),0);
    let dosePerPlant=num(result.dosePerPlant);
    if(dosePerPlant<=0) dosePerPlant=items.reduce((sum,item)=>sum+num(item.gramsPerPlant),0);
    if(dosePerPlant<=0) throw new Error('Dosis campuran per tanaman pada resep SOP tidak valid');
    const waterPerPlant=num(result.waterPerPlant);
    result.sourcePopulation=result.sourcePopulation||sourcePopulation||null;
    result.population=population;
    result.dosePerPlant=dosePerPlant;
    result.waterPerPlant=waterPerPlant;
    result.totalMixGrams=dosePerPlant*population;
    result.totalWaterL=waterPerPlant*population/1000;
    result.items=items.map(item=>{
      const ratio=num(item.ratio);
      const gramsPerPlant=totalRatio>0 && dosePerPlant>0
        ? (ratio/totalRatio)*dosePerPlant
        : num(item.gramsPerPlant);
      return {...item, gramsPerPlant, gramsTotal:gramsPerPlant*population};
    });
    return result;
  },
  async generateSchedule(seasonId, sopId, options={}){
    const season = (await getAll('seasons')).find(row=>String(row.id)===String(seasonId));
    if(!season) throw new Error('Musim tidak ditemukan');
    const sop = (await getAll('sops')).find(row=>String(row.id)===String(sopId));
    if(!sop) throw new Error('SOP tidak ditemukan');
    if(sop.isTemplate===true) throw new Error('Template rekomendasi harus disalin ke SOP Saya sebelum dibuat menjadi jadwal.');
    if(sop.commodityId && String(sop.commodityId) !== String(season.commodityId))
      throw new Error('SOP tidak sesuai dengan komoditas musim tanam ini');
    if(sop.varietyId && String(sop.varietyId) !== String(season.varietyId))
      throw new Error('SOP tidak sesuai dengan varietas musim tanam ini');
    const ageStartDate=typeof CropEngine!=='undefined'?CropEngine.ageStartDate(season):(season.ageStartDate||season.cycleStartDate||season.plantingDate);
    const ageLabel=typeof CropEngine!=='undefined'?CropEngine.ageLabel(season):(season.ageBasis==='cycleStartDate'?'HSP':(season.ageBasis==='transplantDate'?'HSTP':'HST'));
    if(!ageStartDate) throw new Error('Tanggal dasar umur musim belum tersedia');
    const items = await this.items(sopId);
    if(!items.length) return [];
    const existing = typeof getByIndex==='function'
      ? await getByIndex('activities','seasonId',seasonId)
      : (await getAll('activities')).filter(a=>String(a.seasonId)===String(seasonId));
    const existingKeys = new Set(existing.filter(a => a.sopItemId !== null && a.sopItemId !== undefined)
      .map(a => String(a.sopItemId) + '|' + Number(a.hst)));
    const out = [];
    for(const it of items){
      const start = Number(it.hstStart), end = Number(it.hstEnd);
      if(!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start)
        throw new Error('Rentang '+ageLabel+' tidak valid pada item SOP: ' + (it.name || it.id));
      const freq = this._frequencyDays(it.frequency);
      const cycle = freq > 0 ? Math.floor((end-start)/freq)+1 : 1;
      for(let i=0;i<cycle;i++){
        const hst = start + i * (freq || 0);
        const key = String(it.id) + '|' + hst;
        if(existingKeys.has(key)) continue;
        const date = addDays(ageStartDate, hst);
        const rawProductSnapshots=Array.isArray(it.products)?it.products:[];
        const productSnapshots=rawProductSnapshots.map(p=>{
          if(p.recipeId && !p.recipeSnapshot) throw new Error(`Snapshot resep campuran pada item SOP "${it.name}" tidak tersedia. Buka dan simpan ulang item SOP tersebut.`);
          return p.recipeSnapshot ? {...p, recipeSnapshot:this._snapshotForSeason(p.recipeSnapshot,season)} : clone(p);
        });
        const mixedRecipes=productSnapshots.filter(p=>p.recipeId&&p.recipeSnapshot).map(p=>clone(p.recipeSnapshot));
        const productDoseDetails=productSnapshots.map(p=>{
          if(p.recipeSnapshot && Array.isArray(p.recipeSnapshot.items)){
            const ingredients=p.recipeSnapshot.items.map(x=>`${x.name}: ${fmtNum(x.gramsPerPlant,3)} g/tanaman (${fmtNum(x.gramsTotal,2)} g total)`).join(', ');
            return `${p.name}: ${ingredients}; total campuran ${fmtNum(p.recipeSnapshot.totalMixGrams,2)} g`;
          }
          return p.dose ? `${p.name}: ${p.dose}` : p.name;
        });
        const recipeWater=mixedRecipes.map(r=>`${fmtNum(r.waterPerPlant,0)} ml/tanaman (${fmtNum(r.totalWaterL,2)} L total @ ${fmtNum(r.population,0)} tanaman)`).join('; ');
        out.push({
          id:uid('act'), seasonId:season.id, sopId:sop.id, sopItemId:it.id, source:'sop',
          title:it.name, type:this._typeFromAppType(it.appType), date, time:'07:00', hst, ageBasis:season.ageBasis||'plantingDate', ageLabel,
          products:productSnapshots.length ? productSnapshots.map(p=>({name:p.name,category:p.category||'',dose:p.dose||'', ...(p.productId?{productId:p.productId}:{}), ...(p.recipeId?{recipeId:p.recipeId,recipePhaseId:p.recipePhaseId||'',recipeSnapshot:clone(p.recipeSnapshot)}:{})})) :
            (it.productName ? [{name:it.productName,category:'',dose:it.dose||''}] : []),
          mixedRecipes,
          productName:productSnapshots.length ? productSnapshots.map(p=>p.name).join(', ') : (it.productName || ''),
          dose:productDoseDetails.length ? productDoseDetails.join('; ') : (it.dose || ''), doseActual:'',
          waterVolume:it.waterVolume || recipeWater, note:it.note || '', phase:it.phase || '',
          frequency:it.frequency || '', appType:it.appType || '',
          status:date < todayISO() ? 'terlambat' : (date === todayISO() ? 'hariini' : 'terjadwal'),
          cost:0, photo:''
        });
        existingKeys.add(key);
      }
    }
    if(out.length) await putMany('activities', out);
    return out;
  },
  _frequencyDays(freq){
    if(!freq) return 0;
    const s = String(freq).toLowerCase().trim();
    // Frekuensi berulang harus menyebut interval, mis. "7 hari",
    // "setiap 7 hari", atau "1x, 2 minggu". Angka "1x" bukan interval.
    const interval = s.match(/(\d+(?:[.,]\d+)?)\s*(hari|minggu)\b/);
    if(interval){
      const n = Number(interval[1].replace(',','.'));
      if(!Number.isFinite(n) || n <= 0) return 0;
      return Math.max(1, Math.round(interval[2]==='minggu' ? n*7 : n));
    }
    // Bentuk frekuensi per minggu/per hari, mis. "3x/minggu".
    const rate = s.match(/(\d+)\s*x\s*(?:per|\/)\s*(minggu|hari)/);
    if(rate){
      const count = Number(rate[1]);
      return count>0 ? Math.max(1, Math.round((rate[2]==='minggu'?7:1)/count)) : 0;
    }
    return 0; // "1x" / sekali: satu kali pada HST awal.
  },
  _typeFromAppType(t){
    const map = {'Semprot':'Penyemprotan','Kocor':'Pemupukan','Tabur':'Pemupukan','Fertigasi':'Pemupukan','Hidroponik':'Pemupukan'};
    return map[t] || 'Lainnya';
  }
};
