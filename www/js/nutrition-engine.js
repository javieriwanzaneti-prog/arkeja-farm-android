/* ============ Nutrition Engine ============ */
const NutritionEngine = {
  P_FROM_P2O5: 0.4364,
  K_FROM_K2O: 0.8301,

  _n(v){
    if(typeof v === 'string') v = v.trim().replace(',', '.');
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  },

  computeNutrients(fertilizer, grams){
    const g = this._n(grams), pct = v => this._n(v)/100;
    if(!fertilizer || g < 0) throw new RangeError('Data pupuk atau berat tidak valid');
    return {
      N:g*pct(fertilizer.N), P:g*pct(fertilizer.P2O5)*this.P_FROM_P2O5,
      K:g*pct(fertilizer.K2O)*this.K_FROM_K2O, Ca:g*pct(fertilizer.Ca),
      Mg:g*pct(fertilizer.Mg), S:g*pct(fertilizer.S), Fe:g*pct(fertilizer.Fe),
      Mn:g*pct(fertilizer.Mn), Zn:g*pct(fertilizer.Zn), Cu:g*pct(fertilizer.Cu),
      B:g*pct(fertilizer.B), Mo:g*pct(fertilizer.Mo)
    };
  },

  dosePerArea({productDose, doseUnit='ml', areaM2, waterPer1000L=160, plantPopulation=0, volumePerPlantL=0, tankSizeL=16}){
    const dose=this._n(productDose), area=this._n(areaM2), water=this._n(waterPer1000L),
      pop=this._n(plantPopulation), tank=this._n(tankSizeL), perPlantWater=this._n(volumePerPlantL);
    if(dose<=0 || area<=0 || water<=0 || tank<=0 || pop<0 || perPlantWater<0)
      throw new RangeError('Dosis, luas, kebutuhan air, dan ukuran tangki harus lebih dari 0; populasi tidak boleh negatif.');
    const totalWater=area/1000*water;
    const tanks=Math.ceil(totalWater/tank);
    return {perLiter:dose, perTank:dose*tank, totalWaterL:totalWater, tanks,
      totalProduct:dose*totalWater, perPlant:pop>0?(dose*totalWater)/pop:(perPlantWater>0?dose*perPlantWater:0),
      per1000m2:dose*water, perHa:dose*water*10, unit:doseUnit};
  },

  ppmFromGrams(grams, liters, percent){
    const g=this._n(grams), l=this._n(liters), p=this._n(percent);
    if(g<0 || p<0) throw new RangeError('Berat pupuk dan persentase unsur tidak boleh negatif');
    if(l<=0) throw new RangeError('Volume air harus lebih dari 0 liter');
    return (g*p/100*1000)/l;
  },

  // Menghitung kontribusi PPM dari beberapa produk pupuk dalam satu larutan.
  // Setiap baris {fertilizer, grams} dihitung sendiri lalu dijumlahkan per unsur.
  ppmFromMixture(items, liters){
    const volume=this._n(liters);
    if(volume<=0) throw new RangeError('Volume air harus lebih dari 0 liter');
    if(!Array.isArray(items) || !items.length) throw new RangeError('Pilih minimal satu produk pupuk');
    const keys=['N','P','K','Ca','Mg','S','Fe','Mn','Zn','Cu','B','Mo'];
    const totals=Object.fromEntries(keys.map(k=>[k,0]));
    const products=[];
    let totalGrams=0;
    for(const item of items){
      const fertilizer=item && item.fertilizer;
      const grams=this._n(item && item.grams);
      if(!fertilizer) throw new RangeError('Ada produk pupuk yang belum dipilih');
      if(grams<=0) throw new RangeError('Berat setiap produk harus lebih dari 0 gram');
      const ppm={
        N:this.ppmFromGrams(grams,volume,fertilizer.N),
        P:this.ppmFromGrams(grams,volume,fertilizer.P2O5)*this.P_FROM_P2O5,
        K:this.ppmFromGrams(grams,volume,fertilizer.K2O)*this.K_FROM_K2O,
        Ca:this.ppmFromGrams(grams,volume,fertilizer.Ca),
        Mg:this.ppmFromGrams(grams,volume,fertilizer.Mg),
        S:this.ppmFromGrams(grams,volume,fertilizer.S),
        Fe:this.ppmFromGrams(grams,volume,fertilizer.Fe),
        Mn:this.ppmFromGrams(grams,volume,fertilizer.Mn),
        Zn:this.ppmFromGrams(grams,volume,fertilizer.Zn),
        Cu:this.ppmFromGrams(grams,volume,fertilizer.Cu),
        B:this.ppmFromGrams(grams,volume,fertilizer.B),
        Mo:this.ppmFromGrams(grams,volume,fertilizer.Mo)
      };
      keys.forEach(k=>totals[k]+=ppm[k]);
      totalGrams+=grams;
      products.push({fertilizerId:fertilizer.id,name:fertilizer.name,grams,ppm});
    }
    return {liters:volume,totalGrams,gramsPerLiter:totalGrams/volume,products,
      nutrients:Object.fromEntries(keys.map(k=>[k,+totals[k].toFixed(4)]))};
  },

  targetPpmToGrams(targetPpm, liters, percentNutrient){
    const target=this._n(targetPpm), l=this._n(liters), pct=this._n(percentNutrient);
    if(target<0 || l<=0) throw new RangeError('Target PPM tidak boleh negatif dan volume harus lebih dari 0');
    if(target===0) return 0;
    if(pct<=0) return null;
    return (target*l)/(pct*10);
  },

  // Formulasi stok AB Mix. Target ppm adalah konsentrasi larutan kerja;
  // faktor pengenceran mengubahnya menjadi konsentrasi stok A/B.
  abMix({stockVolumeL,stockVolumeA_L=stockVolumeL,stockVolumeB_L=stockVolumeL,dilutionFactor=100,
    targetPpmN,targetPpmP,targetPpmK,N_A_pct,P_A_pct=0,K_A_pct=0,N_B_pct=0,P_B_pct=0,K_B_pct=0}){
    const vA=this._n(stockVolumeA_L), vB=this._n(stockVolumeB_L), factor=this._n(dilutionFactor);
    if(vA<=0 || vB<=0 || factor<=0) throw new RangeError('Volume stok A/B dan faktor pengenceran harus lebih dari 0');
    const stockN=this._n(targetPpmN)*factor, stockP=this._n(targetPpmP)*factor, stockK=this._n(targetPpmK)*factor;
    const gA=this.targetPpmToGrams(stockN,vA,N_A_pct);
    const pBElement=this._n(P_B_pct)*this.P_FROM_P2O5;
    const kBElement=this._n(K_B_pct)*this.K_FROM_K2O;
    const gBP=this.targetPpmToGrams(stockP,vB,pBElement);
    const gBK=this.targetPpmToGrams(stockK,vB,kBElement);
    const gB=Math.max(gBP===null?0:gBP,gBK===null?0:gBK);
    const nActual=(this._n(gA)*this._n(N_A_pct)/100*1000/vA + gB*this._n(N_B_pct)/100*1000/vB)/factor;
    const pActual=(this._n(gA)*this._n(P_A_pct)/100*this.P_FROM_P2O5*1000/vA + gB*this._n(P_B_pct)/100*this.P_FROM_P2O5*1000/vB)/factor;
    const kActual=(this._n(gA)*this._n(K_A_pct)/100*this.K_FROM_K2O*1000/vA + gB*this._n(K_B_pct)/100*this.K_FROM_K2O*1000/vB)/factor;
    return {formulaA_grams:gA,formulaB_grams_P:gBP,formulaB_grams_K:gBK,formulaB_grams:gB,
      dilutionFactor:factor,stockVolumeA_L:vA,stockVolumeB_L:vB,
      actual:{N:nActual,P:pActual,K:kActual},
      gap:{N:Math.max(0,this._n(targetPpmN)-nActual),P:Math.max(0,this._n(targetPpmP)-pActual),K:Math.max(0,this._n(targetPpmK)-kActual)},
      excess:{N:Math.max(0,nActual-this._n(targetPpmN)),P:Math.max(0,pActual-this._n(targetPpmP)),K:Math.max(0,kActual-this._n(targetPpmK))},
      note:'Target ppm adalah larutan kerja. Massa pupuk stok dihitung dengan faktor pengenceran. P₂O₅ dan K₂O dikonversi ke unsur P dan K. Formula B memakai dosis terbesar dari kebutuhan P atau K; cek kemungkinan kelebihan unsur.'};
  },

  // Estimator satu produk: bukan solver kombinasi multi-pupuk.
  async formulator({targetPpm,liters,preferFertilizerIds=[]}){
    const v=this._n(liters);
    if(v<=0) return {error:'Volume air harus lebih dari 0 liter'};
    const targets={N:this._n(targetPpm?.N),P:this._n(targetPpm?.P),K:this._n(targetPpm?.K)};
    if(Object.values(targets).some(x=>x<0)) return {error:'Target PPM tidak boleh negatif'};
    const all=await getAll('fertilizers');
    const preferred=preferFertilizerIds.length?all.filter(f=>preferFertilizerIds.some(id=>String(id)===String(f.id))):all;
    if(!preferred.length) return {error:'Belum ada pupuk di database'};
    let best=null;
    for(const f of preferred){
      const pct={N:this._n(f.N),P:this._n(f.P2O5)*this.P_FROM_P2O5,K:this._n(f.K2O)*this.K_FROM_K2O};
      const doses=Object.keys(targets).map(k=>targets[k]===0?0:this.targetPpmToGrams(targets[k],v,pct[k])).filter(x=>x!==null);
      if(!doses.length) continue;
      const grams=Math.max(0,...doses);
      const nutrientMass=this.computeNutrients(f,grams);
      const actual={N:nutrientMass.N/v*1000,P:nutrientMass.P/v*1000,K:nutrientMass.K/v*1000};
      const score=Object.keys(targets).reduce((sum,k)=>sum+Math.pow(actual[k]-targets[k],2),0);
      if(!best || score<best.score) best={f,grams,actual,score};
    }
    if(!best) return {error:'Tidak ada pupuk dengan kandungan N, P₂O₅, atau K₂O yang dapat digunakan untuk target ini'};
    const gap={},excess={};
    Object.keys(targets).forEach(k=>{const d=targets[k]-best.actual[k];if(d>0.1)gap[k]=+d.toFixed(2);else if(d<-.1)excess[k]=+Math.abs(d).toFixed(2);});
    const nutrients=this.computeNutrients(best.f,best.grams);
    return {products:[{name:best.f.name,grams:+best.grams.toFixed(2),id:best.f.id}],
      nutrients:Object.fromEntries(Object.entries(nutrients).map(([k,val])=>[k,+(val/v*1000).toFixed(2)])),
      gap,excess,liters:v,score:best.score,
      note:'Estimasi satu produk berdasarkan target N-P-K. Umumnya satu pupuk tidak dapat memenuhi rasio target secara bersamaan; gunakan resep campuran untuk menyusun beberapa pupuk. Hasil teoretis, validasi dengan EC/pH meter.'};
  },

  nutrientKeys(){ return ['N','P','K','Ca','Mg','S','Fe','Mn','Zn','Cu','B','Mo']; },

  validateFertilizerAnalysis(fertilizer){
    if(!fertilizer || fertilizer.id===undefined) throw new RangeError('Master pupuk tidak valid.');
    const fields=['N','P2O5','K2O','Ca','Mg','S','Fe','Mn','Zn','Cu','B','Mo'];
    for(const key of fields){
      const raw=fertilizer[key];
      if(raw===undefined||raw===null||raw==='') continue;
      const value=Number(String(raw).trim().replace(',','.'));
      if(!Number.isFinite(value)||value<0||value>100) throw new RangeError(`Kadar ${key} pada ${fertilizer.name||'pupuk'} harus antara 0–100%.`);
    }
    return true;
  },

  nutrientPercent(fertilizer){
    return {
      N:this._n(fertilizer?.N), P:this._n(fertilizer?.P2O5)*this.P_FROM_P2O5,
      K:this._n(fertilizer?.K2O)*this.K_FROM_K2O, Ca:this._n(fertilizer?.Ca),
      Mg:this._n(fertilizer?.Mg), S:this._n(fertilizer?.S), Fe:this._n(fertilizer?.Fe),
      Mn:this._n(fertilizer?.Mn), Zn:this._n(fertilizer?.Zn), Cu:this._n(fertilizer?.Cu),
      B:this._n(fertilizer?.B), Mo:this._n(fertilizer?.Mo)
    };
  },

  // Non-negative least-squares coordinate descent. Coefficients are ppm
  // contributed by one gram of each selected product in the final solution.
  _solveCoefficients(rows, targetPpm, coefficients, options={}){
    const keys=this.nutrientKeys();
    if(!Array.isArray(rows)||!rows.length) throw new RangeError('Pilih minimal satu produk pupuk.');
    const targets=Object.fromEntries(keys.map(k=>[k,this._n(targetPpm?.[k])]));
    if(keys.some(k=>targets[k]<0)) throw new RangeError('Target PPM tidak boleh negatif.');
    if(!keys.some(k=>targets[k]>0)) throw new RangeError('Isi minimal satu target unsur lebih dari 0 ppm.');
    const scales=Object.fromEntries(keys.map(k=>[k,Math.max(1,targets[k],Math.max(...keys.map(x=>targets[x]))*0.03)]));
    const A=rows.map((row,i)=>keys.map(k=>(this._n(coefficients[i]?.[k]))/scales[k]));
    const b=keys.map(k=>targets[k]/scales[k]);
    const x=rows.map(()=>0), lambda=options.regularization??1e-10, iterations=Math.min(3000,Math.max(100,options.iterations||1200));
    for(let iter=0;iter<iterations;iter++){
      let maxChange=0;
      for(let j=0;j<rows.length;j++){
        let numerator=0,denominator=lambda;
        for(let k=0;k<keys.length;k++){
          let residual=b[k];
          for(let q=0;q<rows.length;q++) residual-=A[q][k]*x[q];
          numerator+=A[j][k]*residual;
          denominator+=A[j][k]*A[j][k];
        }
        const next=Math.max(0,x[j]+(denominator>0?numerator/denominator:0));
        maxChange=Math.max(maxChange,Math.abs(next-x[j])); x[j]=next;
      }
      if(maxChange<1e-8) break;
    }
    const actual=Object.fromEntries(keys.map((k,ki)=>[k,rows.reduce((sum,row,i)=>sum+x[i]*this._n(coefficients[i]?.[k]),0)]));
    const gap={},excess={};
    keys.forEach(k=>{const delta=actual[k]-targets[k];if(delta<-.1)gap[k]=+(-delta).toFixed(3);else if(delta>.1)excess[k]=+delta.toFixed(3);});
    const score=keys.reduce((sum,k)=>sum+Math.pow((actual[k]-targets[k])/scales[k],2),0);
    return {grams:x,actual,target:targets,gap,excess,score};
  },

  async solveMultiProduct({items,targetPpm,liters=1,iterations=1200}={}){
    const volume=this._n(liters);
    if(volume<=0) throw new RangeError('Volume larutan harus lebih dari 0 liter.');
    if(!Array.isArray(items)||!items.length) throw new RangeError('Pilih minimal satu produk pupuk.');
    const seen=new Set();
    const rows=items.map(item=>{
      const f=item?.fertilizer||item;
      if(!f||f.id===undefined) throw new RangeError('Ada produk pupuk yang belum valid.');
      this.validateFertilizerAnalysis(f);
      if(seen.has(String(f.id))) throw new RangeError('Produk yang sama dipilih lebih dari sekali.');
      seen.add(String(f.id));
      return {fertilizerId:f.id,productId:`fertilizer:${String(f.id)}`,name:f.name||'Pupuk tanpa nama',fertilizer:f};
    });
    const coefficients=rows.map(row=>{
      const pct=this.nutrientPercent(row.fertilizer);
      return Object.fromEntries(this.nutrientKeys().map(k=>[k,pct[k]*10/volume]));
    });
    const solved=this._solveCoefficients(rows,targetPpm,coefficients,{iterations});
    const products=rows.map((row,i)=>({fertilizerId:row.fertilizerId,productId:row.productId,name:row.name,grams:+(solved.grams?.[i]??0).toFixed(6)}));
    // Keep only products with a meaningful positive dose.
    const selected=products.filter(p=>p.grams>=0.000001);
    const actual=Object.fromEntries(this.nutrientKeys().map(k=>[k,+solved.actual[k].toFixed(3)]));
    return {liters:volume,products:selected,totalGrams:+selected.reduce((a,p)=>a+p.grams,0).toFixed(4),target:solved.target,actual,gap:solved.gap,excess:solved.excess,score:solved.score,
      note:'Estimasi matematis non-negatif berdasarkan komposisi pupuk pada Master Data. Hasil teoritis; tidak memperhitungkan kemurnian, bentuk hidrat, kelarutan, air baku, presipitasi, atau efisiensi serapan. Verifikasi label, EC, pH, dan kompatibilitas sebelum aplikasi.'};
  },

  solveStockFormula({items,targetPpm,stockVolumeA_L,stockVolumeB_L,dilutionFactor=100,iterations=1600}={}){
    const vA=this._n(stockVolumeA_L),vB=this._n(stockVolumeB_L),factor=this._n(dilutionFactor);
    if(vA<=0||vB<=0||factor<=0) throw new RangeError('Volume stok A/B dan faktor pengenceran harus lebih dari 0.');
    if(!Array.isArray(items)||!items.length) throw new RangeError('Pilih minimal satu pupuk dan tentukan stok A/B.');
    const seen=new Set();
    const rows=items.map(item=>{
      const f=item?.fertilizer||item, stock=String(item?.stock||'').toUpperCase();
      if(!f||f.id===undefined||!['A','B'].includes(stock)) throw new RangeError('Setiap produk harus memiliki pupuk dan kelompok stok A/B.');
      this.validateFertilizerAnalysis(f);
      if(seen.has(String(f.id))) throw new RangeError('Produk yang sama tidak boleh dipilih dua kali.'); seen.add(String(f.id));
      return {fertilizerId:f.id,productId:`fertilizer:${String(f.id)}`,name:f.name||'Pupuk tanpa nama',stock,fertilizer:f};
    });
    const coefficients=rows.map(row=>{
      const pct=this.nutrientPercent(row.fertilizer),volume=row.stock==='A'?vA:vB;
      return Object.fromEntries(this.nutrientKeys().map(k=>[k,pct[k]*10/(volume*factor)]));
    });
    const solved=this._solveCoefficients(rows,targetPpm,coefficients,{iterations});
    const products=rows.map((row,i)=>{const {fertilizer,...safe}=row;return {...safe,grams:+(solved.grams?.[i]||0).toFixed(6)};}).filter(row=>row.grams>=0.000001);
    const byStock={A:products.filter(p=>p.stock==='A'),B:products.filter(p=>p.stock==='B')};
    const warnings=[...this.checkIncompatibility(byStock.A.map(p=>p.name)).map(w=>'Stok A: '+w),...this.checkIncompatibility(byStock.B.map(p=>p.name)).map(w=>'Stok B: '+w)];
    return {stockVolumeA_L:vA,stockVolumeB_L:vB,dilutionFactor:factor,products:products.map(({fertilizer, ...p})=>p),byStock,
      totalGramsA:+byStock.A.reduce((a,p)=>a+p.grams,0).toFixed(3),totalGramsB:+byStock.B.reduce((a,p)=>a+p.grams,0).toFixed(3),
      target:solved.target,actual:Object.fromEntries(this.nutrientKeys().map(k=>[k,+solved.actual[k].toFixed(3)])),gap:solved.gap,excess:solved.excess,score:solved.score,warnings,
      note:'Massa dihitung untuk masing-masing volume stok dan faktor injeksi/pengenceran yang dimasukkan. Produk A dan B wajib dilarutkan terpisah. Formula matematis bukan jaminan kelarutan atau kestabilan stok.'};
  },

  checkIncompatibility(productNames){
    const names=productNames.map(s=>String(s||'').toLowerCase());
    const hasCa=names.some(s=>/(calcium|kalsium|calnit|ca\s*\(?no3|calcium nitrate)/i.test(s));
    const hasP=names.some(s=>/(fosfat|phosphate|phosph|\bmap\b|\bdap\b|\bmkp\b|sp\s*-?36|\btsp\b)/i.test(s));
    const hasS=names.some(s=>/(sulfat|sulphate|mgso4|znso4|k2so4|ammonium sulfate)/i.test(s));
    const warnings=[];
    if(hasCa&&hasP)warnings.push('Kalsium + Fosfat: berisiko presipitasi; pisahkan larutan stok pekat.');
    if(hasCa&&hasS)warnings.push('Kalsium + Sulfat: berisiko presipitasi; pisahkan larutan stok pekat.');
    return warnings;
  },

  async saveHistory(seasonId,payload){
    const rec={id:uid('nh'),seasonId,createdAt:new Date().toISOString(),...payload};
    await put('nutrition_hist',rec);return rec;
  },
  async history(seasonId){return getByIndex('nutrition_hist','seasonId',seasonId);}
};
