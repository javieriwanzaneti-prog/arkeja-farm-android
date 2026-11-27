/* ============ Universal Crop Profile Engine ============ */
const CropEngine = {
  async getProfile(commodityId){
    const commodity=await getOne('commodities',commodityId);
    if(!commodity) return null;
    const lifespan=Math.max(1,Math.floor(Number(commodity.lifespanDays)||90));
    const phases=Array.isArray(commodity.phases)?commodity.phases:[];
    return {
      ...commodity,
      cycleType:['annual','perennial','production'].includes(commodity.cycleType)?commodity.cycleType:'annual',
      ageBasis:['plantingDate','transplantDate','cycleStartDate'].includes(commodity.ageBasis)?commodity.ageBasis:'plantingDate',
      lifespanDays:lifespan,
      yieldUnit:commodity.yieldUnit||'kg',
      phases:phases.length?phases:this.defaultPhases(lifespan)
    };
  },
  defaultPhases(lifespan=90){
    const end=Math.max(1,Math.floor(Number(lifespan)||90));
    const bounds=[0,Math.floor(end*.10),Math.floor(end*.25),Math.floor(end*.45),Math.floor(end*.65),Math.floor(end*.85),end];
    const names=['Persemaian','Vegetatif awal','Vegetatif','Pembungaan','Pembuahan','Panen'];
    return names.map((name,i)=>({name,startDay:i===0?0:bounds[i]+1,endDay:bounds[i+1]})).filter(p=>p.startDay<=p.endDay);
  },
  async getSeasonProfile(season){
    if(!season) return null;
    const current=await this.getProfile(season.commodityId);
    const snapshot=season.cropProfileSnapshot;
    if(snapshot && typeof snapshot==='object'){
      const merged={...(current||{}),...snapshot};
      merged.cycleType=['annual','perennial','production'].includes(merged.cycleType)?merged.cycleType:'annual';
      merged.ageBasis=['plantingDate','transplantDate','cycleStartDate'].includes(merged.ageBasis)?merged.ageBasis:'plantingDate';
      merged.lifespanDays=Math.max(1,Math.floor(Number(merged.lifespanDays)||90));
      merged.yieldUnit=merged.yieldUnit||'kg';
      merged.phases=Array.isArray(snapshot.phases)&&snapshot.phases.length?snapshot.phases:(current?.phases||this.defaultPhases(merged.lifespanDays));
      return merged;
    }
    return current;
  },
  async getPhases(commodityId){
    const profile=await this.getProfile(commodityId);
    return profile?.phases || this.defaultPhases(90);
  },
  async phaseForHST(commodityId,hst){
    const phases=await this.getPhases(commodityId);
    return this._phaseAt(phases,hst);
  },
  _phaseAt(phases,day){
    const ordered=(Array.isArray(phases)?phases:[]).slice().sort((a,b)=>Number(a.startDay)-Number(b.startDay));
    const value=Math.max(0,Number(day)||0);
    const found=ordered.find(p=>value>=Number(p.startDay)&&value<=Number(p.endDay));
    if(found) return found;
    if(value<Number(ordered[0]?.startDay||0)) return ordered[0]||{name:'Belum dimulai',startDay:0,endDay:0};
    return ordered[ordered.length-1]||{name:'Belum ditentukan',startDay:0,endDay:0};
  },
  async phaseForSeason(season,hst){
    const profile=await this.getSeasonProfile(season);
    return this._phaseAt(profile?.phases||this.defaultPhases(90),hst);
  },
  ageStartDate(season){
    if(!season) return '';
    // Kompatibilitas record lama: season.ageStartDate||season.cycleStartDate||season.plantingDate.
    const basis=season.ageBasis||season.cropProfileSnapshot?.ageBasis||'plantingDate';
    if(basis==='cycleStartDate') return season.cycleStartDate||season.ageStartDate||season.plantingDate||'';
    if(basis==='transplantDate') return season.transplantDate||season.ageStartDate||season.plantingDate||'';
    return season.plantingDate||season.ageStartDate||'';
  },
  ageLabel(season){
    const basis=season?.ageBasis||season?.cropProfileSnapshot?.ageBasis||'plantingDate';
    return basis==='cycleStartDate'?'HSP':(basis==='transplantDate'?'HSTP':'HST');
  },
  ageLabelLong(season){
    const basis=season?.ageBasis||season?.cropProfileSnapshot?.ageBasis||'plantingDate';
    return basis==='cycleStartDate'?'Hari Setelah Pemangkasan / Awal Siklus':(basis==='transplantDate'?'Hari Setelah Pindah Tanam':'Hari Setelah Tanam');
  },
  hstOf(season,asOf=todayISO()){
    const start=this.ageStartDate(season);
    if(!start) return 0;
    const parse=v=>{
      const raw=String(v||'').slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
      const [y,m,d]=raw.split('-').map(Number);
      const date=new Date(y,m-1,d);
      return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:null;
    };
    const startDate=parse(start), endDate=parse(asOf);
    if(!startDate||!endDate) return 0;
    return Math.max(0,Math.floor((endDate-startDate)/86400000));
  },
  ageOf(season,asOf=todayISO()){return this.hstOf(season,asOf);},
  async progressOf(season,asOf=todayISO()){
    const profile=await this.getSeasonProfile(season);
    const age=this.ageOf(season,asOf);
    const target=Math.max(1,Number(profile?.lifespanDays)||90);
    return {age,target,percent:Math.min(100,Math.max(0,age/target*100)),beyondTarget:age>target,remainingDays:Math.max(0,target-age)};
  },
  async overview(season){
    if(!season) return null;
    const age=this.ageOf(season);
    const profile=await this.getSeasonProfile(season);
    const phase=await this.phaseForSeason(season,age);
    const progress=await this.progressOf(season);
    return {
      hst:age,age,ageLabel:this.ageLabel(season),ageLabelLong:this.ageLabelLong(season),
      phase,commodity:season.commodityName||'—',cycleType:profile?.cycleType||'annual',
      ageBasis:season.ageBasis||profile?.ageBasis||'plantingDate',
      lifespanDays:profile?.lifespanDays||90,progressPercent:progress.percent,
      beyondTarget:progress.beyondTarget,remainingDays:progress.remainingDays,
      yieldUnit:profile?.yieldUnit||'kg'
    };
  }
};
