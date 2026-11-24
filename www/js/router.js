/* ============ Router ============ */
const Router = {
  routes: {
    home: (c,s)=> App.renderHome(c,s),
    cultivation: (c,s)=> App.renderCultivation(c,s),
    nutrition: (c,s)=> App.renderNutrition(c,s),
    activity: (c,s)=> App.renderActivity(c,s),
    analytics: (c,s)=> App.renderAnalytics(c,s),
    settings: (c)=> Settings.render(c),
    // sub-routes
    'land-form': (c)=> App.landForm(c),
    'season-form': (c)=> App.seasonForm(c),
    'master-commodities': (c)=> Settings.renderCommodities(c),
    'master-varieties': (c)=> Settings.renderVarieties(c),
    'master-fertilizers': (c)=> Settings.renderFertilizers(c),
    'master-pesticides': (c)=> Settings.renderPesticides(c),
    'master-zpts': (c)=> Settings.renderZpts(c),
    'sop': (c)=> Settings.renderSOP(c),
    'sop-detail': (c, season, params) => Settings.renderSOPDetail(c, params.id),
    'monitoring': (c,s)=> Monitoring.render(c, s),
    'irrigation': (c,s)=> Irrigation.render(c, s),
    'pest': (c,s)=> PestDisease.render(c, s),
    'harvest': (c,s)=> Harvest.render(c, s),
    'financial': (c,s)=> Financial.render(c, s),
    'inventory': (c,s)=> Inventory.render(c, s),
    'reports': (c,s)=> Reports.render(c, s)
  },
  current: 'home',
  params: {},
  async go(route, params={}){
    this.current = route; this.params = params;
    await this.render();
    // update nav active
    const navMap = { home:'home', cultivation:'cultivation', nutrition:'nutrition', activity:'activity', analytics:'analytics', settings:'settings' };
    let navKey = route;
    if(['land-form','season-form','monitoring','irrigation','pest','harvest','financial','inventory','reports'].includes(route)) navKey = 'cultivation';
    if(['master-commodities','master-varieties','master-fertilizers','master-pesticides','master-zpts','sop','sop-detail'].includes(route)) navKey = 'settings';
    $$('#main-nav button').forEach(b=>b.classList.toggle('active', b.dataset.page===navKey));
    window.scrollTo(0,0);
  },
  async render(){
  const c = $('#view');
  const activeSeasonId = Prefs.get('activeSeasonId', null);
const season = (activeSeasonId && activeSeasonId !== 'undefined') ? await getOne('seasons', activeSeasonId) : null;
  const fn = this.routes[this.current];
  if(!fn){ c.innerHTML = '<div class="empty">Halaman tidak ditemukan</div>'; return; }
  
  try { 
    // Pastikan this.params (yang berisi id) dikirim ke fungsi rute
    await fn(c, season, this.params); 
  }
  catch(err){ 
    console.error(err); 
    c.innerHTML = `<div class="notice red-notice">Terjadi kesalahan: ${esc(err.message)}</div>`; 
  }
}
};