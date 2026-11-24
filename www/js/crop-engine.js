/* ============ Crop Engine ============ */
const CropEngine = {
  async getPhases(commodityId){
    const c = await getOne('commodities', commodityId);
    if(c && Array.isArray(c.phases) && c.phases.length) return c.phases;
    return [
      {name:'Persemaian', startDay:0, endDay:14},
      {name:'Vegetatif awal', startDay:15, endDay:30},
      {name:'Vegetatif', startDay:31, endDay:45},
      {name:'Pembungaan', startDay:46, endDay:60},
      {name:'Pembuahan', startDay:61, endDay:80},
      {name:'Panen', startDay:81, endDay:100}
    ];
  },
  async phaseForHST(commodityId, hst){
    const phases = await this.getPhases(commodityId);
    for(const p of phases){ if(hst >= p.startDay && hst <= p.endDay) return p; }
    // fallback: fase terdekat
    return phases[phases.length-1];
  },
  hstOf(season){
    if(!season || !season.plantingDate) return 0;
    return Math.max(0, daysBetween(season.plantingDate, todayISO()));
  },
  async overview(season){
    if(!season) return null;
    const hst = this.hstOf(season);
    const phase = await this.phaseForHST(season.commodityId, hst);
    return { hst, phase, commodity: season.commodityName || '—' };
  }
};