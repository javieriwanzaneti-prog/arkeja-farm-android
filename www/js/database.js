/* ============ ARKEJA FARM — IndexedDB Database ============ */
const DB_NAME = 'arkeja_farm_db';
const DB_VERSION = 2;

// PERBAIKAN: Membungkus array index ke dalam properti { indexes: [...] }
const STORES = {
  // Master
  commodities:  { keyPath:'id', indexes:[['category','category']] },
  varieties:    { keyPath:'id', indexes:[['commodityId','commodityId']] },
  fertilizers:  { keyPath:'id', indexes:[['name','name']] },
  pesticides:   { keyPath:'id', indexes:[['name','name']] },
  zpts:         { keyPath:'id', indexes:[] },
  // Farm
  lands:        { keyPath:'id', indexes:[] },
  seasons:      { keyPath:'id', indexes:[['landId','landId'],['commodityId','commodityId']] },
  // SOP
  sops:         { keyPath:'id', indexes:[['varietyId','varietyId'],['commodityId','commodityId']] },
  sop_items:    { keyPath:'id', indexes:[['sopId','sopId']] },
  // Activities
  activities:   { keyPath:'id', indexes:[['seasonId','seasonId'],['date','date'],['status','status']] },
  // Monitoring
  monitorings:  { keyPath:'id', indexes:[['seasonId','seasonId'],['date','date']] },
  // Pest & Disease
  pests:        { keyPath:'id', indexes:[['type','type']] },
  incidences:   { keyPath:'id', indexes:[['seasonId','seasonId']] },
  // Irrigation
  irrigations:  { keyPath:'id', indexes:[['seasonId','seasonId']] },
  // Harvest
  harvests:     { keyPath:'id', indexes:[['seasonId','seasonId']] },
  // Financial
  costs:        { keyPath:'id', indexes:[['seasonId','seasonId'],['category','category']] },
  revenues:     { keyPath:'id', indexes:[['seasonId','seasonId']] },
  // Inventory
  inventory:    { keyPath:'id', indexes:[['productType','productType']] },
  inv_tx:       { keyPath:'id', indexes:[['inventoryId','inventoryId'],['seasonId','seasonId']] },
  // Nutrition history
  nutrition_hist: { keyPath:'id', indexes:[['seasonId','seasonId']] },
  // Settings
  prefs:        { keyPath:'key', indexes:[] },
  meta:         { keyPath:'key', indexes:[] },
  mixed_recipes: { keyPath:'id', indexes:[] }
};

let dbHandle = null;

function openDB(){
  return new Promise((resolve, reject) => {
    if (dbHandle) return resolve(dbHandle);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      try {
        for(const [name, cfg] of Object.entries(STORES)){
          if(!db.objectStoreNames.contains(name)){
            const store = db.createObjectStore(name, { keyPath: cfg.keyPath });
            
            // PERBAIKAN: Pastikan cfg.indexes ada dan berbentuk array
            const indexes = Array.isArray(cfg.indexes) ? cfg.indexes : [];
            for(const [idx, keyPath] of indexes){
              try { 
                store.createIndex(idx, keyPath, { unique: false }); 
              } catch(err) {
                console.warn(`Gagal membuat index ${idx}:`, err);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error fatal di onupgradeneeded:', err);
        e.target.transaction.abort();
      }
    };

    req.onsuccess = () => { dbHandle = req.result; resolve(dbHandle); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('DB blocked');
  });
}

async function tx(storeNames, mode='readonly'){
  const db = await openDB();
  return db.transaction(storeNames, mode);
}

async function getOne(store, id){
    if(id === null || id === undefined || id === '') {
    return null;
  }
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction([store], 'readonly');
    const req = t.objectStore(store).get(id);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
    // Jangan tutup transaksi manual, biarkan browser yang menutupnya
  });
}

async function getAll(store){
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction([store], 'readonly');
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

async function put(store, obj){
  const t = await tx([store], 'readwrite');
  return new Promise((res, rej) => {
    const r = t.objectStore(store).put(obj);
    r.onsuccess = () => res(obj);
    r.onerror = () => rej(r.error);
  });
}

async function putMany(store, arr){
  const t = await tx([store], 'readwrite');
  const os = t.objectStore(store);
  return new Promise((res, rej) => {
    for(const o of arr) os.put(o);
    t.oncomplete = () => res(arr);
    t.onerror = () => rej(t.error);
  });
}

async function del(store, id){
  const t = await tx([store], 'readwrite');
  return new Promise((res, rej) => {
    const r = t.objectStore(store).delete(id);
    r.onsuccess = () => res(true);
    r.onerror = () => rej(r.error);
  });
}

async function getByIndex(store, index, value){
  const t = await tx([store]);
  return new Promise((res, rej) => {
    const r = t.objectStore(store).index(index).getAll(value);
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

async function countStore(store){
  const t = await tx([store]);
  return new Promise((res, rej) => {
    const r = t.objectStore(store).count();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/* -------- Prefs (LocalStorage) -------- */
const Prefs = {
  get(k, d=null){ try{ const v = localStorage.getItem('af_pref_'+k); return v===null ? d : JSON.parse(v); }catch(_){ return d; } },
  set(k, v){ try{ localStorage.setItem('af_pref_'+k, JSON.stringify(v)); }catch(_){} },
  del(k){ try{ localStorage.removeItem('af_pref_'+k); }catch(_){} }
};

/* -------- Seed Contoh Data (ditandai [CONTOH]) -------- */
async function seedIfEmpty(){
  const seeded = Prefs.get('seeded_v1', false);
  if(seeded) return;
  const existing = await countStore('commodities');
  if(existing > 0){ Prefs.set('seeded_v1', true); return; }

  const melon = {
    id: uid('com'), name:'Melon [CONTOH]', category:'Buah', scientific:'Cucumis melo L.',
    lifespanDays: 75, cultivationSystem:'Greenhouse / bedengan', yieldUnit:'kg',
    phases:[
      {name:'Persemaian', startDay:0, endDay:7},
      {name:'Vegetatif awal', startDay:8, endDay:20},
      {name:'Vegetatif', startDay:21, endDay:35},
      {name:'Pembungaan', startDay:36, endDay:45},
      {name:'Pembuahan', startDay:46, endDay:58},
      {name:'Pematangan', startDay:59, endDay:70},
      {name:'Panen', startDay:71, endDay:75}
    ]
  };
  const cabai = {
    id: uid('com'), name:'Cabai Rawit [CONTOH]', category:'Sayur', scientific:'Capsicum frutescens L.',
    lifespanDays: 120, cultivationSystem:'Bedengan mulsa', yieldUnit:'kg',
    phases:[
      {name:'Persemaian', startDay:0, endDay:21},
      {name:'Vegetatif awal', startDay:22, endDay:40},
      {name:'Vegetatif', startDay:41, endDay:60},
      {name:'Pembungaan', startDay:61, endDay:75},
      {name:'Pembuahan', startDay:76, endDay:105},
      {name:'Panen', startDay:106, endDay:120}
    ]
  };
  await putMany('commodities', [melon, cabai]);

  const varAmanda = {
    id: uid('var'), commodityId: melon.id, name:'Amanda Tavi F1 [CONTOH]',
    producer:'Contoh Produsen', characteristics:'Buah bulat, net tebal, daging oranye, manis 14-16 brix',
    harvestAgeDays: 72, targetProductionKg: 3.5
  };
  await put('varieties', varAmanda);

  // SOP contoh untuk Amanda
  const sopId = uid('sop');
  await put('sops', {
    id: sopId, name:'SOP Melon Amanda [CONTOH]', commodityId: melon.id, varietyId: varAmanda.id,
    description:'Template SOP contoh — dapat diedit/dihapus', isTemplate:true
  });
  await putMany('sop_items', [
    { id:uid('si'), sopId, name:'Pemupukan dasar', hstStart:3, hstEnd:3, phase:'Vegetatif awal', appType:'Kocor', productName:'NPK 16-16-16', dose:'5 g/L', frequency:'1x', waterVolume:'250 ml/tanaman', note:'Dasar' },
    { id:uid('si'), sopId, name:'Pemupukan susulan 1', hstStart:14, hstEnd:14, phase:'Vegetatif awal', appType:'Kocor', productName:'NPK 16-16-16', dose:'8 g/L', frequency:'1x', waterVolume:'300 ml/tanaman', note:'' },
    { id:uid('si'), sopId, name:'Pemupukan susulan 2', hstStart:24, hstEnd:24, phase:'Vegetatif', appType:'Kocor', productName:'NPK 12-12-17', dose:'8 g/L', frequency:'1x', waterVolume:'300 ml/tanaman', note:'' },
    { id:uid('si'), sopId, name:'Pemupukan generatif', hstStart:36, hstEnd:36, phase:'Pembungaan', appType:'Kocor', productName:'NPK 12-12-17 + KNO3', dose:'10 g/L', frequency:'1x', waterVolume:'350 ml/tanaman', note:'' },
    { id:uid('si'), sopId, name:'Penyemprotan hama', hstStart:10, hstEnd:10, phase:'Vegetatif awal', appType:'Semprot', productName:'Abamektin [CONTOH]', dose:'0.5 ml/L', frequency:'7 hari', waterVolume:'250 L/ha', note:'Cek dosis label' }
  ]);

  // Lahan contoh
  const landId = uid('land');
  await put('lands', { id: landId, name:'Lahan Demo [CONTOH]', area: 1000, soilType:'Lempung berpasir', ph:6.5, ec:0.8, drainage:'Baik', waterSource:'Sumur', waterTds:420, irrigationSystem:'Fertigasi', photo:'' });

  // Pupuk contoh
  await putMany('fertilizers', [
    { id:uid('fer'), name:'NPK 16-16-16 [CONTOH]', producer:'Contoh Pabrik', N:16, P2O5:16, K2O:16, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, price:18000, packageWeightKg:1 },
    { id:uid('fer'), name:'NPK 12-12-17 [CONTOH]', producer:'Contoh Pabrik', N:12, P2O5:12, K2O:17, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, price:18500, packageWeightKg:1 },
    { id:uid('fer'), name:'KNO3 [CONTOH]', producer:'Contoh Pabrik', N:13, P2O5:0, K2O:46, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, price:25000, packageWeightKg:1 },
    { id:uid('fer'), name:'Ca(NO3)2 [CONTOH]', producer:'Contoh Pabrik', N:15.5, P2O5:0, K2O:0, Ca:19, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, price:22000, packageWeightKg:1 }
  ]);

  // Pestisida contoh
  await putMany('pesticides', [
    { id:uid('pes'), name:'Abamektin 18 g/L [CONTOH]', activeIngredient:'Abamektin', concentration:'18 g/L', formulation:'EC', target:'Thrips, Tungau', labelDose:'0.5-1 ml/L', intervalDays:7, phiDays:3, safety:'Gunakan APD, hindari siang terik' }
  ]);

  // ZPT contoh
  await putMany('zpts', [
    { id:uid('zpt'), name:'Atonik [CONTOH]', activeIngredient:'Natrium ortho nitrofenol', concentration:'0.5%', function:'Perangsang pertumbuhan akar dan buah', referenceDose:'1 ml/L' }
  ]);

  // Hama/Penyakit contoh
  await putMany('pests', [
    { id:uid('opt'), type:'Hama', name:'Thrips [CONTOH]', symptoms:'Daun keriting, mengkilap perak, adanya bercak', cause:'Serangan thrips', triggers:'Cuaca kering, suhu tinggi', hostPlants:'Cabai, melon, bawang', prevention:'Mulsa, sanitasi, perangkap kuning', control:'Insektisida sesuai label' },
    { id:uid('opt'), type:'Penyakit', name:'Antraknosa [CONTOH]', symptoms:'Bercak cokelat pada buah, batang, daun', cause:'Jamur Colletotrichum sp.', triggers:'Kelembapan tinggi, hujan terus-menerus', hostPlants:'Cabai, melon, tomat', prevention:'Rotasi tanam, benih sehat, drainase baik', control:'Fungisida sesuai label' }
  ]);

  // Musim contoh
  const seasonId = uid('season');
  await put('seasons', {
    id: seasonId, name:'Musim Contoh [CONTOH]', landId, landName:'Lahan Demo [CONTOH]',
    commodityId: melon.id, commodityName:'Melon [CONTOH]',
    varietyId: varAmanda.id, varietyName:'Amanda Tavi F1 [CONTOH]',
    area: 1000, plantingDate: todayISO(), transplantDate: addDays(todayISO(), 7),
    population: 1000, plantSpacing:'40x40 cm', effectiveArea: 800,
    targetHarvest:'3.5 kg/tanaman', weather:'Kemarau', cultivationMethod:'Bedengan + fertigasi',
    sopId: sopId, status:'aktif', createdAt: todayISO()
  });
  await put('prefs', { key:'activeSeasonId', value: seasonId });

  Prefs.set('seeded_v1', true);
  console.log('[Seed] Data contoh dimuat');
}

/* -------- Migrasi LocalStorage lama -------- */
async function migrateLegacyLocalStorage(){
  const done = Prefs.get('migrated_legacy', false);
  if(done) return;
  const raw = localStorage.getItem('atk_demo_db');
  if(!raw){ Prefs.set('migrated_legacy', true); return; }
  try {
    const old = JSON.parse(raw);
    // Migrasi lands
    if(Array.isArray(old.lands)){
      for(const l of old.lands){
        const landId = l.id || uid('land');
        if(!(await getOne('lands', landId))){
          await put('lands', { id: landId, name: l.name || 'Lahan lama', area: num(l.area), soilType: l.type || '', ph:null, ec:null, drainage:'', waterSource:'', waterTds:null, irrigationSystem:'', photo:'' });
        }
      }
    }
    if(Array.isArray(old.seasons)){
      for(const s of old.seasons){
        const seasonId = s.id || uid('season');
        if(!(await getOne('seasons', seasonId))){
          await put('seasons', {
            id: seasonId, name: s.crop || 'Musim lama', landId: s.landId, landName: s.landName || '',
            commodityId:null, commodityName: s.crop || '', varietyId:null, varietyName:'',
            area: num(s.area), plantingDate: s.plantDate || todayISO(),
            transplantDate:'', population:null, plantSpacing:'', effectiveArea:null,
            targetHarvest:'', weather: s.weather || '', cultivationMethod: s.soil || '',
            sopId:null, status:'aktif', createdAt: todayISO()
          });
        }
      }
    }
    if(Array.isArray(old.costs)){
      for(const c of old.costs){
        const cid = c.id || uid('cost');
        if(!(await getOne('costs', cid))){
          await put('costs', { id: cid, seasonId: c.seasonId, name:c.name, category:c.category||'Lainnya', amount:num(c.amount), date:c.date||todayISO(), note:'' });
        }
      }
    }
    if(Array.isArray(old.harvests)){
      for(const h of old.harvests){
        const hid = h.id || uid('h');
        if(!(await getOne('harvests', hid))){
          await put('harvests', { id: hid, seasonId:h.seasonId, date: h.date||todayISO(), fruitCount:0, weightKg:num(h.kg), gradeA:0, gradeB:0, gradeC:0, afkir:0, pricePerKg:num(h.price), revenue:num(h.kg)*num(h.price), note:h.note||'' });
        }
      }
    }
    if(Array.isArray(old.tasks)){
      for(const t of old.tasks){
        const tid = t.id || uid('act');
        if(!(await getOne('activities', tid))){
          await put('activities', {
            id: tid, seasonId:t.seasonId, title:t.title, type:'Lainnya',
            date: t.date || todayISO(), time: t.time || '07:00', hst: num(t.hst),
            dose: t.dose || '', productId:null, productName:'', doseActual:'',
            note:'', cost:0, status: t.done ? 'selesai' : 'terjadwal', source:'manual'
          });
        }
      }
    }
    console.log('[Migrasi] Data LocalStorage lama dipindahkan');
    // JANGAN hapus localStorage lama sampai user memverifikasi
    Prefs.set('migrated_legacy', true);
  } catch(e){
    console.error('Migrasi gagal:', e);
  }
}

async function backupAll(){
  const data = {};
  for(const store of Object.keys(STORES)){
    data[store] = await getAll(store);
  }
  return { version: DB_VERSION, exportedAt: new Date().toISOString(), data };
}

async function restoreAll(payload){
  if(!payload || !payload.data) throw new Error('Format backup tidak valid');
  for(const [store, rows] of Object.entries(payload.data)){
    if(!STORES[store]) continue;
    // Hapus dulu isi store agar bersih
    const t = await tx([store], 'readwrite');
    await new Promise((res,rej)=>{ const r=t.objectStore(store).clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
    if(rows.length) await putMany(store, rows);
  }
                          }
