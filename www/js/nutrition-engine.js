/* ============ Nutrition Engine ============ */
const NutritionEngine = {
  // Konversi dasar
  P_FROM_P2O5: 0.4364,
  K_FROM_K2O: 0.8301,

  // Hitung unsur murni dari pupuk (%)
  computeNutrients(fertilizer, grams){
    const g = num(grams);
    const pct = v => num(v)/100;
    return {
      N:  g * pct(fertilizer.N),
      P:  g * pct(fertilizer.P2O5) * this.P_FROM_P2O5,
      K:  g * pct(fertilizer.K2O) * this.K_FROM_K2O,
      Ca: g * pct(fertilizer.Ca),
      Mg: g * pct(fertilizer.Mg),
      S:  g * pct(fertilizer.S),
      Fe: g * pct(fertilizer.Fe),
      Mn: g * pct(fertilizer.Mn),
      Zn: g * pct(fertilizer.Zn),
      Cu: g * pct(fertilizer.Cu),
      B:  g * pct(fertilizer.B),
      Mo: g * pct(fertilizer.Mo)
    };
  },

  // Dosis multi-metode
  dosePerArea({ productDose, doseUnit='ml', areaM2, waterPer1000L=160, plantPopulation=0, volumePerPlantL=0, tankSizeL=16 }){
    const area = num(areaM2), water = num(waterPer1000L), pop = num(plantPopulation);
    const dose = num(productDose);
    const totalWater = area/1000 * water;
    const tanks = tankSizeL > 0 ? Math.ceil(totalWater / tankSizeL) : 0;
    return {
      perLiter: dose,
      perTank: dose * tankSizeL,
      totalWaterL: totalWater,
      tanks,
      totalProduct: dose * totalWater,
      perPlant: pop>0 ? (dose * totalWater) / pop : (volumePerPlantL>0 ? dose*num(volumePerPlantL) : 0),
      per1000m2: dose * water,
      perHa: dose * water * 10,
      unit: doseUnit
    };
  },

  // Konversi ppm
  ppmFromGrams(grams, liters, percent){
    if(liters<=0) return 0;
    return (num(grams) * num(percent)/100 * 1000) / num(liters);
  },

  // Target PPM → kebutuhan pupuk (1 produk sederhana)
  targetPpmToGrams(targetPpm, liters, percentNutrient){
    if(num(percentNutrient)<=0) return null;
    return (num(targetPpm) * num(liters)) / (num(percentNutrient)*10);
  },

  // Hitung AB Mix sederhana: dua larutan stok
  abMix({ stockVolumeL, targetPpmN, targetPpmP, targetPpmK, N_A_pct, P_A_pct, K_A_pct, N_B_pct, P_B_pct, K_B_pct }){
    // Asumsi: A menyumbang N dan Ca, B menyumbang P,K
    const gramsA = this.targetPpmToGrams(targetPpmN, stockVolumeL, N_A_pct);
    const gramsB_P = this.targetPpmToGrams(targetPpmP, stockVolumeL, P_B_pct);
    const gramsB_K = this.targetPpmToGrams(targetPpmK, stockVolumeL, K_B_pct);
    return {
      formulaA_grams: gramsA,
      formulaB_grams_P: gramsB_P,
      formulaB_grams_K: gramsB_K,
      note: 'Perkiraan berbasis % unsur pada label. Sesuaikan dengan EC meter.'
    };
  },

  // Nutrition Formulator: pilih kombinasi pupuk untuk target ppm
  async formulator({ targetPpm, liters, preferFertilizerIds=[] }){
    const allFerts = await getAll('fertilizers');
    const pool = preferFertilizerIds.length ? allFerts.filter(f=>preferFertilizerIds.includes(f.id)) : allFerts;
    if(!pool.length) return { error:'Belum ada pupuk di database' };
    // Sederhana: iterasi kombinasi hingga 3 pupuk, prioritaskan yang menyumbang unsur target
    // Untuk akurasi praktis, hitung kebutuhan NPK dasar lalu cek gap
    const needs = {
      N: this.targetPpmToGrams(targetPpm.N, liters, 16),
      P: this.targetPpmToGrams(targetPpm.P, liters, 16*this.P_FROM_P2O5*100/16*0.16), // aproksimasi
      K: this.targetPpmToGrams(targetPpm.K, liters, 16)
    };
    // Strategi: gunakan NPK seimbang sebagai basis, lalu gap
    const npk = pool.find(f=>num(f.N)>10 && num(f.P2O5)>10 && num(f.K2O)>10) || pool[0];
    const baseGrams = Math.max(
      this.targetPpmToGrams(targetPpm.N, liters, npk.N),
      this.targetPpmToGrams(targetPpm.P, liters, num(npk.P2O5)*this.P_FROM_P2O5),
      this.targetPpmToGrams(targetPpm.K, liters, num(npk.K2O)*this.K_FROM_K2O)
    );
    const nutrients = this.computeNutrients(npk, baseGrams);
    const gap = {};
    const excess = {};
    for(const el of ['N','P','K','Ca','Mg','S']){
      const diff = num(targetPpm[el]) - (nutrients[el]/liters*1000);
      if(diff > 0.1) gap[el] = +diff.toFixed(2);
      else if(diff < -0.1) excess[el] = +Math.abs(diff).toFixed(2);
    }
    return {
      products: [{ name: npk.name, grams: +baseGrams.toFixed(2), id: npk.id }],
      nutrients: Object.fromEntries(Object.entries(nutrients).map(([k,v])=>[k, +(v/liters*1000).toFixed(2)])),
      gap, excess, liters,
      note:'Asumsi: serapan 100%, tidak memperhitungkan interaksi antarion. Untuk presisi gunakan EC/pH meter.'
    };
  },

  // Peringatan ketidakcocokan (presipitasi)
  checkIncompatibility(productNames){
    const lc = productNames.map(s=>String(s).toLowerCase());
    const hasCa = lc.some(s=>/ca|kalsium|calc|ca\(no3\)/.test(s));
    const hasP  = lc.some(s=>/p|fosfat|map|dap|sp-36|tsp/.test(s) && !/npk/.test(s));
    const hasS  = lc.some(s=>/s|sulfat|znso4|mgso4|k2so4/.test(s));
    const warnings = [];
    if(hasCa && hasP) warnings.push('Kalsium + Fosfat: berisiko presipitasi Ca3(PO4)2 — pisahkan larutan stok.');
    if(hasCa && hasS) warnings.push('Kalsium + Sulfat: berisiko presipitasi CaSO4 — pisahkan larutan stok.');
    return warnings;
  },

  async saveHistory(seasonId, payload){
    const rec = { id:uid('nh'), seasonId, createdAt:new Date().toISOString(), ...payload };
    await put('nutrition_hist', rec);
    return rec;
  },
  async history(seasonId){
    return getByIndex('nutrition_hist', 'seasonId', seasonId);
  }
};