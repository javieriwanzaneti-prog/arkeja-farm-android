/* ============ SOP Engine ============ */
const SopEngine = {
  async listForVariety(varietyId){
    if(!varietyId) return [];
    return getByIndex('sops', 'varietyId', varietyId);
  },
  async items(sopId){
    if(!sopId) return [];
    const arr = await getByIndex('sop_items', 'sopId', sopId);
    return sortBy(arr, 'hstStart');
  },
  async generateSchedule(seasonId, sopId, options={}){
    const season = await getOne('seasons', seasonId);
    if(!season) throw new Error('Musim tidak ditemukan');
    const items = await this.items(sopId);
    if(!items.length) return [];
    const existing = await getByIndex('activities', 'seasonId', seasonId);
    const existingKeys = new Set(existing.map(a => a.sopItemId + '|' + a.hst));
    const out = [];
    for(const it of items){
      const freq = this._frequencyDays(it.frequency);
      const cycle = freq > 0 ? Math.max(1, Math.floor((it.hstEnd - it.hstStart)/freq) + 1) : 1;
      for(let i=0;i<cycle;i++){
        const hst = it.hstStart + i * (freq || 0);
        if(hst > (it.hstEnd || it.hstStart)) break;
        const key = it.id + '|' + hst;
        if(existingKeys.has(key)) continue;
        const date = addDays(season.plantingDate, hst);
        out.push({
          id: uid('act'), seasonId, sopId, sopItemId: it.id, source:'sop',
          title: it.name, type: this._typeFromAppType(it.appType),
          date, time:'07:00', hst,
          productName: it.productName || '', dose: it.dose || '', doseActual:'',
          waterVolume: it.waterVolume || '', note: it.note || '',
          phase: it.phase || '', status: date < todayISO() ? 'terlambat' : (date === todayISO() ? 'hariini' : 'terjadwal'),
          cost: 0, photo:''
        });
      }
    }
    if(out.length) await putMany('activities', out);
    return out;
  },
  _frequencyDays(freq){
    if(!freq) return 0;
    const s = String(freq).toLowerCase();
    const m = s.match(/(\d+)/);
    const n = m ? parseInt(m[1]) : 0;
    if(s.includes('minggu')) return n*7;
    if(s.includes('hari')) return n;
    return 0;
  },
  _typeFromAppType(t){
    const map = { 'Semprot':'Penyemprotan', 'Kocor':'Pemupukan', 'Tabur':'Pemupukan',
      'Fertigasi':'Pemupukan', 'Hidroponik':'Pemupukan' };
    return map[t] || 'Lainnya';
  }
};