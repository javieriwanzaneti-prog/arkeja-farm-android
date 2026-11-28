/* ============ ARKEJA FARM — IndexedDB Database ============ */
const DB_NAME = 'arkeja_farm_db';
const DB_VERSION = 3;

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
          const store = db.objectStoreNames.contains(name)
            ? e.target.transaction.objectStore(name)
            : db.createObjectStore(name, { keyPath: cfg.keyPath });
          // Pastikan indeks ikut dibuat pada store lama saat migrasi versi.
          const indexes = Array.isArray(cfg.indexes) ? cfg.indexes : [];
          for(const [idx, keyPath] of indexes){
            if(!store.indexNames.contains(idx)) store.createIndex(idx, keyPath, { unique: false });
          }
        }
      } catch (err) {
        console.error('Error fatal di onupgradeneeded:', err);
        e.target.transaction.abort();
      }
    };

    req.onsuccess = () => { dbHandle = req.result; dbHandle.onversionchange = () => { dbHandle.close(); dbHandle = null; }; resolve(dbHandle); };
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

function databaseError(error, fallback='Operasi database gagal'){
  if(error && (error.name==='QuotaExceededError' || error.code===22 || error.code===1014)){
    const e=new Error('Penyimpanan perangkat penuh. Kosongkan ruang atau ekspor backup, lalu coba lagi. Data lama tidak dihapus otomatis.');
    e.name='QuotaExceededError'; return e;
  }
  return error instanceof Error ? error : new Error(fallback);
}

async function put(store, obj){
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    let requestError=null, settled=false;
    const fail=err=>{ if(settled)return; settled=true; reject(databaseError(err,'Gagal menyimpan data')); };
    let r;
    try { r=t.objectStore(store).put(obj); } catch(error){ try{t.abort();}catch(_){} fail(error); return; }
    r.onerror=()=>{ requestError=r.error; try{t.abort();}catch(_){} };
    t.oncomplete=()=>{ if(settled)return; settled=true; resolve(obj); };
    t.onabort=()=>fail(requestError||t.error||new Error('Transaksi penyimpanan dibatalkan'));
    t.onerror=()=>{ requestError=requestError||t.error; };
  });
}

async function putMany(store, arr){
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    let requestError=null, settled=false;
    const fail=err=>{ if(settled)return; settled=true; reject(databaseError(err,'Gagal menyimpan beberapa data')); };
    const os=t.objectStore(store);
    try { for(const o of arr) os.put(o); } catch(error){ try{t.abort();}catch(_){} fail(error); return; }
    t.oncomplete=()=>{ if(settled)return; settled=true; resolve(arr); };
    t.onerror=()=>{ requestError=t.error; };
    t.onabort=()=>fail(requestError||t.error||new Error('Transaksi penyimpanan dibatalkan'));
  });
}

async function del(store, id){
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    let requestError=null, settled=false;
    const fail=err=>{ if(settled)return; settled=true; reject(databaseError(err,'Gagal menghapus data')); };
    const r=t.objectStore(store).delete(id);
    r.onerror=()=>{ requestError=r.error; try{t.abort();}catch(_){} };
    t.oncomplete=()=>{ if(settled)return; settled=true; resolve(true); };
    t.onerror=()=>{ requestError=requestError||t.error; };
    t.onabort=()=>fail(requestError||t.error||new Error('Transaksi penghapusan dibatalkan'));
  });
}

/* Penghapusan aman master dan data finansial.
 * Semua pemeriksaan relasi dan perubahan dilakukan dalam satu transaksi IDB.
 */
function deletePestIfUnreferenced(id){
  return openDB().then(db=>new Promise((resolve,reject)=>{
    let t, failure=null;
    try{t=db.transaction(['pests','incidences'],'readwrite');}catch(error){reject(error);return;}
    const abort=message=>{failure=new Error(message);try{t.abort();}catch(_){}};
    const master=t.objectStore('pests').get(id);
    master.onerror=()=>abort('Gagal membaca data hama/penyakit.');
    master.onsuccess=()=>{
      if(!master.result){abort('Data hama/penyakit tidak ditemukan.');return;}
      const req=t.objectStore('incidences').getAll();
      req.onerror=()=>abort('Gagal memeriksa riwayat kejadian OPT.');
      req.onsuccess=()=>{
        if((req.result||[]).some(row=>String(row.refId)===String(id))){abort('Data masih digunakan dalam riwayat kejadian. Hapus atau ubah referensi kejadian terlebih dahulu.');return;}
        t.objectStore('pests').delete(id);
      };
    };
    t.oncomplete=()=>resolve(true);
    t.onerror=()=>{failure=failure||t.error;};
    t.onabort=()=>reject(databaseError(failure||t.error||new Error('Penghapusan dibatalkan'),'Penghapusan hama/penyakit gagal'));
  }));
}

function deleteMasterIfUnreferenced(storeName, id){
  const configs={
    commodities:{stores:['commodities','varieties','seasons','sops'], checks:[
      ['varieties', rows=>rows.some(r=>String(r.commodityId)===String(id)), 'Komoditas masih digunakan oleh varietas.'],
      ['seasons', rows=>rows.some(r=>String(r.commodityId)===String(id)), 'Komoditas masih digunakan oleh musim tanam.'],
      ['sops', rows=>rows.some(r=>String(r.commodityId)===String(id)), 'Komoditas masih digunakan oleh SOP.']
    ]},
    varieties:{stores:['varieties','seasons','sops'], checks:[
      ['seasons', rows=>rows.some(r=>String(r.varietyId)===String(id)), 'Varietas masih digunakan oleh musim tanam.'],
      ['sops', rows=>rows.some(r=>String(r.varietyId)===String(id)), 'Varietas masih digunakan oleh SOP.']
    ]},
    fertilizers:{stores:['fertilizers','mixed_recipes','sop_items','activities','inventory','nutrition_hist'], checks:[
      ['mixed_recipes', rows=>rows.some(recipe=>(recipe.phases||[]).some(phase=>(phase.items||[]).some(item=>String(item.fertId)===String(id)))), 'Pupuk masih digunakan dalam resep campuran.'],
      ['sop_items', rows=>rows.some(row=>(row.products||[]).some(product=>String(product.productId||'')===`fertilizer:${id}` || (product.recipeSnapshot?.items||[]).some(item=>String(item.fertId)===String(id)))), 'Pupuk masih digunakan dalam item SOP.'],
      ['activities', rows=>rows.some(row=>(row.products||[]).some(product=>String(product.productId||'')===`fertilizer:${id}` || (product.recipeSnapshot?.items||[]).some(item=>String(item.fertId)===String(id))) || (row.mixedRecipes||[]).some(recipe=>(recipe.items||[]).some(item=>String(item.fertId)===String(id))) || (row.mixedRecipeSnapshot?.items||[]).some(item=>String(item.fertId)===String(id))), 'Pupuk masih digunakan dalam jadwal atau riwayat aktivitas.'],
      ['inventory', rows=>rows.some(row=>String(row.productId||'')===`fertilizer:${id}` || String(row.fertilizerId||'')===String(id)), 'Pupuk masih terhubung dengan barang Inventory.'],
      ['nutrition_hist', rows=>rows.some(row=>JSON.stringify(row).includes(`fertilizer:${id}`)), 'Pupuk masih tercatat dalam riwayat nutrisi.']
    ]},
    pesticides:{stores:['pesticides','sop_items','activities','inventory'], checks:[
      ['sop_items', rows=>rows.some(row=>(row.products||[]).some(product=>String(product.productId||'')===`pesticide:${id}`)), 'Pestisida masih digunakan dalam item SOP.'],
      ['activities', rows=>rows.some(row=>(row.products||[]).some(product=>String(product.productId||'')===`pesticide:${id}`)), 'Pestisida masih digunakan dalam jadwal atau riwayat aktivitas.'],
      ['inventory', rows=>rows.some(row=>String(row.productId||'')===`pesticide:${id}`), 'Pestisida masih terhubung dengan barang Inventory.']
    ]},
    zpts:{stores:['zpts','sop_items','activities','inventory'], checks:[
      ['sop_items', rows=>rows.some(row=>(row.products||[]).some(product=>String(product.productId||'')===`zpt:${id}`)), 'ZPT masih digunakan dalam item SOP.'],
      ['activities', rows=>rows.some(row=>(row.products||[]).some(product=>String(product.productId||'')===`zpt:${id}`)), 'ZPT masih digunakan dalam jadwal atau riwayat aktivitas.'],
      ['inventory', rows=>rows.some(row=>String(row.productId||'')===`zpt:${id}`), 'ZPT masih terhubung dengan barang Inventory.']
    ]}
  };
  const config=configs[storeName];
  if(!config) return Promise.reject(new Error('Jenis master tidak didukung untuk penghapusan aman.'));
  return openDB().then(db=>new Promise((resolve,reject)=>{
    let t, failure=null, found=false;
    try{t=db.transaction(config.stores,'readwrite');}catch(error){reject(error);return;}
    const abort=message=>{failure=new Error(message);try{t.abort();}catch(_){}};
    const masterReq=t.objectStore(storeName).get(id);
    let pending=config.checks.length;
    masterReq.onerror=()=>abort('Gagal membaca data master.');
    masterReq.onsuccess=()=>{
      found=!!masterReq.result;
      if(!found){abort('Data master tidak ditemukan.');return;}
      if(!pending){t.objectStore(storeName).delete(id);return;}
      for(const [relatedStore, predicate, message] of config.checks){
        const req=t.objectStore(relatedStore).getAll();
        req.onerror=()=>abort('Gagal memeriksa relasi '+relatedStore+'.');
        req.onsuccess=()=>{
          if(predicate(req.result||[])){abort(message);return;}
          pending--;
          if(pending===0)t.objectStore(storeName).delete(id);
        };
      }
    };
    t.oncomplete=()=>resolve(true);
    t.onerror=()=>{failure=failure||t.error;};
    t.onabort=()=>reject(databaseError(failure||t.error||new Error('Penghapusan dibatalkan'),'Penghapusan master gagal'));
  }));
}

function archiveInventoryItem(inventoryId){
  return openDB().then(db=>new Promise((resolve,reject)=>{
    let t, failure=null, item=null, hasHistory=false;
    try{t=db.transaction(['inventory','inv_tx'],'readwrite');}catch(error){reject(error);return;}
    const abort=message=>{failure=new Error(message);try{t.abort();}catch(_){}};
    const req=t.objectStore('inventory').get(inventoryId);
    req.onerror=()=>abort('Gagal membaca barang Inventory.');
    req.onsuccess=()=>{
      item=req.result;
      if(!item){abort('Barang Inventory tidak ditemukan.');return;}
      const txReq=t.objectStore('inv_tx').index('inventoryId').getAll(inventoryId);
      txReq.onerror=()=>abort('Gagal memeriksa riwayat transaksi barang.');
      txReq.onsuccess=()=>{
        hasHistory=(txReq.result||[]).length>0;
        // Selalu arsipkan, bukan hapus permanen, agar referensi riwayat tetap utuh.
        t.objectStore('inventory').put({...item,active:false,archived:true,archivedAt:todayISO()});
      };
    };
    t.oncomplete=()=>resolve({item,hasHistory});
    t.onerror=()=>{failure=failure||t.error;};
    t.onabort=()=>reject(databaseError(failure||t.error||new Error('Pengarsipan dibatalkan'),'Gagal mengarsipkan barang'));
  }));
}

function restoreInventoryItem(inventoryId){
  return openDB().then(db=>new Promise((resolve,reject)=>{
    let t, failure=null, item=null;
    try{t=db.transaction(['inventory'],'readwrite');}catch(error){reject(error);return;}
    const req=t.objectStore('inventory').get(inventoryId);
    req.onerror=()=>{failure=req.error;try{t.abort();}catch(_){}};
    req.onsuccess=()=>{
      item=req.result;
      if(!item){failure=new Error('Barang Inventory tidak ditemukan.');try{t.abort();}catch(_){}return;}
      t.objectStore('inventory').put({...item,active:true,archived:false,restoredAt:todayISO()});
    };
    t.oncomplete=()=>resolve(item);
    t.onerror=()=>{failure=failure||t.error;};
    t.onabort=()=>reject(databaseError(failure||t.error||new Error('Pemulihan arsip dibatalkan'),'Gagal memulihkan barang'));
  }));
}

function deleteManualCost(costId){
  return openDB().then(db=>new Promise((resolve,reject)=>{
    let t, failure=null, cost=null;
    try{t=db.transaction(['costs'],'readwrite');}catch(error){reject(error);return;}
    const req=t.objectStore('costs').get(costId);
    req.onerror=()=>{failure=req.error;try{t.abort();}catch(_){}};
    req.onsuccess=()=>{
      cost=req.result;
      if(!cost){failure=new Error('Catatan biaya tidak ditemukan.');try{t.abort();}catch(_){}return;}
      if(cost.source==='activity-realization'||cost.activityId){failure=new Error('Biaya ini berasal dari realisasi kegiatan. Hapus melalui pembatalan realisasi kegiatan agar stok, transaksi, dan biaya tetap konsisten.');try{t.abort();}catch(_){}return;}
      t.objectStore('costs').delete(costId);
    };
    t.oncomplete=()=>resolve(true);
    t.onerror=()=>{failure=failure||t.error;};
    t.onabort=()=>reject(databaseError(failure||t.error||new Error('Penghapusan biaya dibatalkan'),'Gagal menghapus biaya'));
  }));
}

// Stok dan riwayat transaksi selalu berubah dalam satu transaksi readwrite.
async function recordInventoryTransaction(payload){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    let t, failure=null, result=null, settled=false;
    const fail=err=>{ if(settled)return; settled=true; reject(databaseError(err,'Transaksi Inventory gagal')); };
    try{ t=db.transaction(['inventory','inv_tx'],'readwrite'); }
    catch(error){ fail(error); return; }
    const inventoryStore=t.objectStore('inventory');
    const itemReq=inventoryStore.get(payload.inventoryId);
    itemReq.onerror=()=>{ failure=itemReq.error; try{t.abort();}catch(_){} };
    itemReq.onsuccess=()=>{
      const item=itemReq.result;
      const qty=Number(payload.qty);
      if(!item){ failure=new Error('Barang Inventory tidak ditemukan'); try{t.abort();}catch(_){} return; }
      if(item.active===false||item.archived===true){failure=new Error('Barang Inventory sudah diarsipkan dan tidak dapat ditransaksikan');try{t.abort();}catch(_){}return;}
      if(!Number.isFinite(qty)||qty<=0){ failure=new Error('Jumlah transaksi harus lebih dari nol'); try{t.abort();}catch(_){} return; }
      const newStock=payload.type==='in' ? Number(item.stock||0)+qty : Number(item.stock||0)-qty;
      if(payload.type!=='in'&&payload.type!=='out'){ failure=new Error('Jenis transaksi tidak valid'); try{t.abort();}catch(_){} return; }
      if(newStock<0){ failure=new Error('Stok tidak cukup. Transaksi dibatalkan.'); try{t.abort();}catch(_){} return; }
      inventoryStore.put({...item,stock:newStock});
      const row={id:uid('tx'),inventoryId:item.id,type:payload.type,qty,date:payload.date||todayISO(),note:payload.note||'',seasonId:payload.seasonId||null,source:'manual'};
      t.objectStore('inv_tx').put(row);
      result={item:{...item,stock:newStock},transaction:row};
    };
    t.oncomplete=()=>{ if(settled)return; settled=true; resolve(result); };
    t.onerror=()=>{ failure=failure||t.error; };
    t.onabort=()=>fail(failure||t.error||new Error('Transaksi Inventory dibatalkan'));
  });
}

/* -------- Realisasi pemupukan atomik: stok + transaksi + aktivitas + biaya --------
 * Semua perubahan disimpan dalam satu transaksi IndexedDB. Jika stok kurang,
 * satuan tidak cocok, atau salah satu penulisan gagal, seluruh transaksi batal.
 */
/* Hapus aktivitas dengan membalik stok realisasi dan menghapus biaya terkait secara atomik. */
function deleteActivityCascade(activityId){
  if(activityId===null||activityId===undefined||activityId==='') return Promise.reject(new Error('ID kegiatan tidak valid'));
  return openDB().then(db=>new Promise((resolve,reject)=>{
    let transaction;
    try{transaction=db.transaction(['activities','inventory','inv_tx','costs'],'readwrite');}
    catch(error){reject(error);return;}
    const activityStore=transaction.objectStore('activities');
    const inventoryStore=transaction.objectStore('inventory');
    const txStore=transaction.objectStore('inv_tx');
    const costStore=transaction.objectStore('costs');
    let failure=null, activity=null;
    const abortWith=message=>{failure=new Error(message);try{transaction.abort();}catch(_){}};
    const activityReq=activityStore.openCursor();
    activityReq.onsuccess=event=>{
      const cursor=event.target.result;
      if(cursor){
        if(cursor.value&&String(cursor.value.id)===String(activityId)){
          activity=cursor.value;
          removeTransactions();
          return;
        }
        cursor.continue();
      }else abortWith('Kegiatan tidak ditemukan');
    };
    activityReq.onerror=()=>abortWith('Gagal membaca kegiatan');
    function removeTransactions(){
      const req=txStore.openCursor();
      req.onsuccess=event=>{
        const cursor=event.target.result;
        if(!cursor){removeCosts();return;}
        const row=cursor.value;
        if(!row||String(row.activityId)!==String(activity.id)||row.source!=='activity-realization'){
          cursor.continue();return;
        }
        const invReq=inventoryStore.openCursor();
        invReq.onsuccess=invEvent=>{
          const invCursor=invEvent.target.result;
          if(!invCursor){abortWith('Barang inventory untuk membalik stok tidak ditemukan');return;}
          const item=invCursor.value;
          if(String(item.id)!==String(row.inventoryId)){invCursor.continue();return;}
          const qty=Number(row.qty)||0;
          const stock=Number(item.stock)||0;
          const restored=row.type==='out'?stock+qty:(row.type==='in'?stock-qty:stock);
          if(restored<0){abortWith('Pembalikan transaksi akan membuat stok negatif');return;}
          invCursor.update({...item,stock:restored,updatedAt:new Date().toISOString()});
          cursor.delete();
          cursor.continue();
        };
        invReq.onerror=()=>abortWith('Gagal membaca inventory untuk pembalikan stok');
      };
      req.onerror=()=>abortWith('Gagal membaca transaksi inventory');
    }
    function removeCosts(){
      const req=costStore.openCursor();
      req.onsuccess=event=>{
        const cursor=event.target.result;
        if(!cursor){activityStore.delete(activity.id);return;}
        const row=cursor.value;
        if(row&&(String(row.activityId)===String(activity.id)||String(row.id)==='realization_'+String(activity.id))) cursor.delete();
        cursor.continue();
      };
      req.onerror=()=>abortWith('Gagal menghapus biaya realisasi');
    }
    transaction.oncomplete=()=>resolve(activity);
    transaction.onerror=()=>reject(failure||transaction.error||new Error('Gagal menghapus kegiatan'));
    transaction.onabort=()=>reject(failure||transaction.error||new Error('Penghapusan kegiatan dibatalkan'));
  }));
}

function completeActivityRealization(payload){
  const data = payload || {};
  const activityId = data.activityId;
  const usages = Array.isArray(data.usages) ? data.usages : [];
  if(activityId === null || activityId === undefined || activityId === '')
    return Promise.reject(new Error('ID kegiatan tidak valid'));
  for(const u of usages){
    if(!u || u.inventoryId === null || u.inventoryId === undefined || u.inventoryId === '')
      return Promise.reject(new Error('Pilih item inventory untuk setiap pemakaian yang diisi'));
    if(!(Number(u.qty)>0)) return Promise.reject(new Error('Jumlah pemakaian harus lebih dari nol'));
  }
  return openDB().then(db=>new Promise((resolve,reject)=>{
    let transaction;
    try{
      transaction=db.transaction(['activities','inventory','inv_tx','costs'],'readwrite');
    }catch(error){ reject(error); return; }
    const activityStore=transaction.objectStore('activities');
    const inventoryStore=transaction.objectStore('inventory');
    const txStore=transaction.objectStore('inv_tx');
    const costStore=transaction.objectStore('costs');
    let activity=null, updatedActivity=null, materialCost=0, totalCost=0, transactionCount=0, failure=null;
    const resolvedUsages=[];
    const abortWith=message=>{ failure=new Error(message); try{transaction.abort();}catch(_){} };
    const normUnit=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,'');

    const activityReq=activityStore.openCursor();
    activityReq.onsuccess=event=>{
      const cursor=event.target.result;
      if(cursor){
        if(cursor.value && String(cursor.value.id)===String(activityId)){
          activity=cursor.value;
          if(activity.status==='selesai'){abortWith('Kegiatan ini sudah direalisasikan sebelumnya');return;}
          processUsage(0);
          return;
        }
        cursor.continue();
      }else abortWith('Kegiatan tidak ditemukan');
    };
    activityReq.onerror=()=>abortWith('Gagal membaca kegiatan');

    function processUsage(index){
      if(index>=usages.length){ finalize(); return; }
      const usage=usages[index];
      const requestedId=usage.inventoryId;
      const requestedQty=Number(usage.qty);
      if(!Number.isFinite(requestedQty)||requestedQty<=0){abortWith('Jumlah pemakaian tidak valid');return;}
      const findReq=inventoryStore.openCursor();
      findReq.onsuccess=event=>{
        const cursor=event.target.result;
        if(!cursor){abortWith('Item inventory tidak ditemukan: '+(usage.name||requestedId));return;}
        const item=cursor.value;
        if(!item || String(item.id)!==String(requestedId)){cursor.continue();return;}
        if(item.active===false||item.archived===true){abortWith('Barang '+(item.name||requestedId)+' sudah diarsipkan dan tidak dapat digunakan untuk realisasi');return;}
        const itemUnit=normUnit(item.unit);
        const usageUnit=normUnit(usage.unit||item.unit);
        if(itemUnit!==usageUnit){abortWith('Satuan pemakaian '+(usage.name||item.name)+' ('+(usage.unit||'')+') tidak sama dengan satuan stok ('+(item.unit||'')+')');return;}
        const currentStock=Number(item.stock)||0;
        if(currentStock+1e-9<requestedQty){abortWith('Stok '+item.name+' tidak cukup. Tersedia '+currentStock+' '+item.unit);return;}
        const updatedItem={...item,stock:currentStock-requestedQty,updatedAt:new Date().toISOString()};
        cursor.update(updatedItem);
        const lineCost=requestedQty*(Number(item.price)||0);
        materialCost+=lineCost;
        transactionCount++;
        const txRow={
          id:uid('tx'), inventoryId:item.id, type:'out', qty:requestedQty,
          unit:item.unit, date:data.date||todayISO(),
          note:'Realisasi: '+(activity.title||'Kegiatan'), seasonId:activity.seasonId,
          source:'activity-realization', activityId:activity.id, productId:item.productId||usage.productId||'',
          unitPrice:Number(item.price)||0, amount:lineCost
        };
        txStore.put(txRow);
        resolvedUsages.push({inventoryId:item.id,productId:item.productId||usage.productId||'',name:item.name,qty:requestedQty,unit:item.unit,unitPrice:Number(item.price)||0,amount:lineCost,productName:usage.productName||usage.name||item.name});
        processUsage(index+1);
      };
      findReq.onerror=()=>abortWith('Gagal membaca stok inventory');
    }

    function finalize(){
      const extraCost=Math.max(0,Number(data.extraCost)||0);
      totalCost=materialCost+extraCost;
      const realizedAt=new Date().toISOString();
      updatedActivity={...activity,status:'selesai',doseActual:String(data.doseActual||activity.dose||''),
        note:String(data.note??activity.note??''),cost:totalCost,realizedAt,
        realization:{date:data.date||todayISO(),inventoryUsages:resolvedUsages,materialCost,extraCost,totalCost,transactionCount}};
      activityStore.put(updatedActivity);
      if(totalCost>0){
        const category=activity.type==='Pemupukan'?'Pupuk':(activity.type==='Penyemprotan'?'Pestisida':(activity.type==='ZPT'?'ZPT':'Lainnya'));
        costStore.put({id:'realization_'+String(activity.id),seasonId:activity.seasonId,
          name:'Realisasi: '+(activity.title||'Kegiatan'),category,amount:totalCost,
          date:data.date||todayISO(),note:`Biaya bahan dari inventory ${materialCost}; biaya tambahan ${extraCost}.`,
          source:'activity-realization',activityId:activity.id,inventoryBreakdown:resolvedUsages});
      }
    }

    transaction.oncomplete=()=>resolve({activity:updatedActivity,materialCost,totalCost,transactions:transactionCount,usages:resolvedUsages});
    transaction.onerror=()=>reject(failure||transaction.error||new Error('Gagal menyimpan realisasi kegiatan'));
    transaction.onabort=()=>reject(failure||transaction.error||new Error('Realisasi dibatalkan; stok dan biaya tidak diubah'));
  }));
}

/* -------- Penghapusan berantai lahan dan musim (atomik + rekonsiliasi stok) --------
 * Riwayat inv_tx dibalik sebelum dihapus. Jika barang hilang, jumlah tidak valid,
 * atau pembalikan membuat stok negatif, seluruh penghapusan dibatalkan.
 */
const SEASON_CHILD_STORES = [
  'activities', 'monitorings', 'incidences', 'irrigations', 'harvests',
  'costs', 'revenues', 'inv_tx', 'nutrition_hist'
];

function abortDelete(transaction, state, message){
  if(state.error) return;
  state.error = new Error(message);
  try { transaction.abort(); } catch(_) {}
}

/*
 * Hapus seluruh data turunan satu atau beberapa musim dalam satu transaksi.
 * Semua pembacaan getAll dijadwalkan di awal transaksi agar tidak ada jeda
 * asynchronous non-IndexedDB yang dapat membuat transaksi menjadi inactive.
 * Stok dikembalikan secara agregat sebelum baris riwayat dihapus.
 */
function deleteSeasonChildrenAtomic(transaction, seasonIds, state, done){
  const seasonSet = new Set((Array.isArray(seasonIds) ? seasonIds : [seasonIds]).map(String));
  const names = [...SEASON_CHILD_STORES];
  const rowsByStore = Object.create(null);
  let pending = names.length + 1;
  let finished = false;
  const completeRead = () => {
    pending--;
    if(pending !== 0 || finished || state.error) return;
    finished = true;
    try {
      const matchedByStore = Object.create(null);
      const inventoryRows = (rowsByStore.inventory || []);
      const txRows = (rowsByStore.inv_tx || []).filter(row => row && row.seasonId !== undefined && seasonSet.has(String(row.seasonId)));
      const deltas = new Map();
      for(const row of txRows){
        if(row.inventoryId === undefined || row.inventoryId === null || row.inventoryId === ''){
          abortDelete(transaction, state, 'Transaksi inventory tidak memiliki inventoryId; penghapusan dibatalkan'); return;
        }
        const qty = Number(row.qty);
        if(!Number.isFinite(qty) || qty < 0 || !['in','out'].includes(row.type)){
          abortDelete(transaction, state, 'Data transaksi inventory tidak valid; penghapusan dibatalkan'); return;
        }
        const key = String(row.inventoryId);
        const delta = row.type === 'in' ? -qty : qty;
        deltas.set(key, (deltas.get(key) || 0) + delta);
      }
      const matchedInventory = new Set();
      for(const item of inventoryRows){
        const key = String(item.id);
        if(!deltas.has(key)) continue;
        const currentStock = Number(item.stock);
        if(!Number.isFinite(currentStock) || currentStock < 0){
          abortDelete(transaction, state, 'Stok inventory tidak valid; penghapusan dibatalkan'); return;
        }
        const reversedStock = currentStock + deltas.get(key);
        if(reversedStock < -1e-9){
          abortDelete(transaction, state, 'Pembalikan riwayat ' + (item.name || item.id) + ' akan membuat stok negatif; penghapusan dibatalkan'); return;
        }
        transaction.objectStore('inventory').put({...item, stock:Math.max(0,reversedStock), updatedAt:new Date().toISOString()});
        matchedInventory.add(key);
      }
      for(const key of deltas.keys()){
        if(!matchedInventory.has(key)){
          abortDelete(transaction, state, 'Barang inventory untuk transaksi ' + key + ' tidak ditemukan; penghapusan dibatalkan'); return;
        }
      }
      for(const storeName of names){
        const store = transaction.objectStore(storeName);
        const rows = rowsByStore[storeName] || [];
        const matches = rows.filter(row => row && row.seasonId !== undefined && seasonSet.has(String(row.seasonId)));
        matchedByStore[storeName] = matches.length;
        for(const row of matches){
          if(row.id === undefined || row.id === null){
            abortDelete(transaction, state, 'Data ' + storeName + ' tidak memiliki ID; penghapusan dibatalkan'); return;
          }
          store.delete(row.id);
        }
      }
      done();
    } catch(error){ abortDelete(transaction, state, error.message || 'Gagal menghapus data musim'); }
  };

  for(const storeName of names){
    const request = transaction.objectStore(storeName).getAll();
    request.onerror = () => abortDelete(transaction, state, 'Gagal membaca data ' + storeName);
    request.onsuccess = () => { rowsByStore[storeName] = request.result || []; completeRead(); };
  }
  const inventoryRequest = transaction.objectStore('inventory').getAll();
  inventoryRequest.onerror = () => abortDelete(transaction, state, 'Gagal membaca barang inventory');
  inventoryRequest.onsuccess = () => { rowsByStore.inventory = inventoryRequest.result || []; completeRead(); };
}

async function deleteSeasonCascade(seasonId){
  if(seasonId === null || seasonId === undefined || seasonId === '')
    throw new Error('ID musim tanam tidak valid');
  const db = await openDB();
  const stores = [...SEASON_CHILD_STORES, 'seasons', 'inventory'];
  return new Promise((resolve, reject) => {
    let transaction;
    try { transaction = db.transaction(stores, 'readwrite'); }
    catch(error){ reject(error); return; }
    const state = {error:null};
    const seasonsStore = transaction.objectStore('seasons');
    const request = seasonsStore.openCursor();
    request.onerror = () => abortDelete(transaction, state, 'Gagal membaca musim tanam');
    request.onsuccess = event => {
      const cursor = event.target.result;
      if(!cursor){ abortDelete(transaction, state, 'Musim tanam tidak ditemukan'); return; }
      if(!cursor.value || String(cursor.value.id) !== String(seasonId)){
        cursor.continue(); return;
      }
      const season = cursor.value;
      deleteSeasonChildrenAtomic(transaction, [season.id], state, () => seasonsStore.delete(season.id));
    };
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(state.error || transaction.error || new Error('Penghapusan musim gagal'));
    transaction.onabort = () => reject(state.error || transaction.error || new Error('Penghapusan musim dibatalkan'));
  });
}

async function deleteLandCascade(landId){
  if(landId === null || landId === undefined || landId === '')
    throw new Error('ID lahan tidak valid');
  const db = await openDB();
  const stores = [...SEASON_CHILD_STORES, 'seasons', 'lands', 'inventory'];
  return new Promise((resolve, reject) => {
    let transaction;
    try { transaction = db.transaction(stores, 'readwrite'); }
    catch(error){ reject(error); return; }
    const state = {error:null};
    const landsStore = transaction.objectStore('lands');
    const seasonsStore = transaction.objectStore('seasons');
    let land = null, deletedSeasons = 0;
    const landRequest = landsStore.openCursor();
    landRequest.onerror = () => abortDelete(transaction, state, 'Gagal membaca lahan');
    landRequest.onsuccess = event => {
      const cursor = event.target.result;
      if(cursor){
        if(cursor.value && String(cursor.value.id) === String(landId)) land = cursor.value;
        else { cursor.continue(); return; }
      }
      if(!land){ abortDelete(transaction, state, 'Lahan tidak ditemukan'); return; }
      const seasonRequest = seasonsStore.getAll();
      seasonRequest.onerror = () => abortDelete(transaction, state, 'Gagal membaca musim pada lahan');
      seasonRequest.onsuccess = () => {
        const linkedSeasons = (seasonRequest.result || []).filter(row => row && String(row.landId) === String(land.id));
        deletedSeasons = linkedSeasons.length;
        const seasonIds = linkedSeasons.map(row => row.id);
        deleteSeasonChildrenAtomic(transaction, seasonIds, state, () => {
          for(const season of linkedSeasons) seasonsStore.delete(season.id);
          landsStore.delete(land.id);
        });
      };
    };
    transaction.oncomplete = () => resolve({land, deletedSeasons});
    transaction.onerror = () => reject(state.error || transaction.error || new Error('Penghapusan lahan gagal'));
    transaction.onabort = () => reject(state.error || transaction.error || new Error('Penghapusan lahan dibatalkan'));
  });
}

/* -------- Penghapusan SOP aman: jadwal hasil generate dipertahankan --------
 * Jadwal yang sudah dibuat adalah catatan kegiatan mandiri. Saat SOP/item
 * dihapus, referensi sumber dilepas dan snapshot jadwal tetap disimpan.
 */
function deleteSOPItemCascade(itemId){
  if(itemId === null || itemId === undefined || itemId === '')
    return Promise.reject(new Error('ID item SOP tidak valid'));
  return getAll('sop_items').then(rows=>{
    const target = rows.find(row=>String(row.id)===String(itemId));
    if(!target) throw new Error('Item SOP tidak ditemukan');
    return openDB().then(db => new Promise((resolve,reject)=>{
    let transaction;
    try {
      transaction = db.transaction(['sop_items','activities'],'readwrite');
      const itemStore = transaction.objectStore('sop_items');
      const activityStore = transaction.objectStore('activities');
      const item = target;
      itemStore.delete(item.id);
        const cursorReq = activityStore.openCursor();
        cursorReq.onsuccess = event => {
          const cursor = event.target.result;
          if(!cursor) return;
          const row = cursor.value;
          if(row && row.sopItemId !== undefined && String(row.sopItemId) === String(item.id)) {
            row.sopItemId = null;
            row.source = 'sop-archived';
            cursor.update(row);
          }
          cursor.continue();
        };
        cursorReq.onerror = () => { try{transaction.abort();}catch(_){}; };
    } catch(error){ try{transaction?.abort();}catch(_){}; reject(error); return; }
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error('Gagal menghapus item SOP'));
    transaction.onabort = () => reject(transaction.error || new Error('Penghapusan item SOP dibatalkan'));
  }));
  });
}

function deleteSOPCascade(sopId){
  if(sopId === null || sopId === undefined || sopId === '')
    return Promise.reject(new Error('ID SOP tidak valid'));
  return getAll('sops').then(rows=>{
    const target = rows.find(row=>String(row.id)===String(sopId));
    if(!target) throw new Error('SOP tidak ditemukan');
    return openDB().then(db => new Promise((resolve,reject)=>{
    let transaction;
    try {
      transaction = db.transaction(['sops','sop_items','activities'],'readwrite');
      const sopStore = transaction.objectStore('sops');
      const itemStore = transaction.objectStore('sop_items');
      const activityStore = transaction.objectStore('activities');
      const sop = target;
      sopStore.delete(sop.id);
        const deletedItemIds = new Set();
        const itemCursor = itemStore.openCursor();
        itemCursor.onsuccess = event => {
          const cursor = event.target.result;
          if(cursor){
            if(cursor.value && String(cursor.value.sopId) === String(sop.id)){
              deletedItemIds.add(String(cursor.value.id));
              cursor.delete();
            }
            cursor.continue();
            return;
          }
          // Setelah daftar item diketahui, lepaskan semua referensi aktivitas
          // berdasarkan sopId maupun sopItemId (termasuk data versi lama).
          const activityCursor = activityStore.openCursor();
          activityCursor.onsuccess = activityEvent => {
            const activity = activityEvent.target.result;
            if(!activity) return;
            const row = activity.value;
            const linkedBySop = row && row.sopId !== undefined && String(row.sopId) === String(sop.id);
            const linkedByItem = row && row.sopItemId !== undefined && deletedItemIds.has(String(row.sopItemId));
            if(linkedBySop || linkedByItem){
              row.sopId = null;
              row.sopItemId = null;
              row.source = 'sop-archived';
              activity.update(row);
            }
            activity.continue();
          };
          activityCursor.onerror = () => { try{transaction.abort();}catch(_){}; };
        };
        itemCursor.onerror = () => { try{transaction.abort();}catch(_){}; };
    } catch(error){ try{transaction?.abort();}catch(_){}; reject(error); return; }
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error('Gagal menghapus SOP'));
    transaction.onabort = () => reject(transaction.error || new Error('Penghapusan SOP dibatalkan'));
  }));
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

// Membaca maksimal `limit` baris melalui cursor agar layar daftar tidak memuat
// seluruh object store ke memori. Gunakan indeks untuk filter per musim.
async function getPage(store, {limit=100, direction='next', index=null, value=undefined}={}){
  const db=await openDB();
  const safeLimit=Math.max(1,Math.min(1000,Number(limit)||100));
  return new Promise((resolve,reject)=>{
    const t=db.transaction([store],'readonly');
    const source=index?t.objectStore(store).index(index):t.objectStore(store);
    const rows=[];
    const range=value===undefined?null:IDBKeyRange.only(value);
    let requestError=null;
    const req=source.openCursor(range,direction);
    req.onsuccess=event=>{
      const cursor=event.target.result;
      if(!cursor||rows.length>=safeLimit) return;
      rows.push(cursor.value);
      cursor.continue();
    };
    req.onerror=()=>{requestError=req.error;try{t.abort();}catch(_){}};
    t.oncomplete=()=>resolve(rows);
    t.onerror=()=>{requestError=requestError||t.error;};
    t.onabort=()=>reject(requestError||t.error||new Error('Pembacaan data dibatalkan'));
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
    { id:uid('fer'), name:'NPK 16-16-16 [CONTOH]', producer:'Contoh Pabrik', N:16, P2O5:16, K2O:16, CaO:0, MgO:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, price:18000, packageWeightKg:1 },
    { id:uid('fer'), name:'NPK 12-12-17 [CONTOH]', producer:'Contoh Pabrik', N:12, P2O5:12, K2O:17, CaO:0, MgO:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, price:18500, packageWeightKg:1 },
    { id:uid('fer'), name:'KNO3 [CONTOH]', producer:'Contoh Pabrik', N:13, P2O5:0, K2O:46, CaO:0, MgO:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, price:25000, packageWeightKg:1 },
    { id:uid('fer'), name:'Ca(NO3)2 [CONTOH]', producer:'Contoh Pabrik', N:15.5, P2O5:0, K2O:0, CaO:26.59, MgO:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, price:22000, packageWeightKg:1 }
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
    if(Array.isArray(old.revenues)){
      for(const r of old.revenues){
        const rid=r.id||uid('rev');
        if(await getOne('revenues',rid)) continue;
        const amount=num(r.amount??r.revenue??r.total??r.income??r.value);
        if(!(amount>0)) continue;
        const date=r.date||r.createdAt?.slice?.(0,10)||todayISO();
        const seasonId=r.seasonId||null;
        // Cegah migrasi pendapatan yang sebenarnya sudah tercakup dalam transaksi panen.
        const linkedHarvests=seasonId?await getByIndex('harvests','seasonId',seasonId):[];
        const duplicate=linkedHarvests.some(h=>String(h.date||'')===String(date) && Math.abs(num(h.revenue||num(h.weightKg)*num(h.pricePerKg))-amount)<0.01);
        if(!duplicate) await put('revenues',{id:rid,seasonId,date,amount,name:r.name||r.description||'Pendapatan lama',category:r.category||'Pendapatan lain',note:r.note||'',source:'legacy-migration',legacy:true});
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


async function clearAllData(){
  const db=await openDB();
  const names=Object.keys(STORES);
  await new Promise((resolve,reject)=>{
    let transaction;
    try{transaction=db.transaction(names,'readwrite');}
    catch(error){reject(error);return;}
    for(const name of names) transaction.objectStore(name).clear();
    transaction.oncomplete=()=>resolve();
    transaction.onerror=()=>reject(transaction.error||new Error('Reset data gagal'));
    transaction.onabort=()=>reject(transaction.error||new Error('Reset data dibatalkan'));
  });
  // Hapus hanya preferensi milik ARKEJA FARM, bukan seluruh LocalStorage aplikasi lain.
  for(let i=localStorage.length-1;i>=0;i--){
    const key=localStorage.key(i);
    if(key && key.startsWith('af_pref_')) localStorage.removeItem(key);
  }
  localStorage.removeItem('atk_demo_db');
  // Penanda internal mencegah seed data contoh muncul kembali setelah reset kosong.
  Prefs.set('seeded_v1',true);
  Prefs.set('migrated_legacy',true);
  return true;
}

function backupDigestInput(payload){
  return JSON.stringify({app:payload.app,formatVersion:payload.formatVersion,version:payload.version,exportedAt:payload.exportedAt,data:payload.data});
}

async function sha256Hex(value){
  if(!globalThis.crypto?.subtle || typeof TextEncoder==='undefined')
    throw new Error('Perangkat tidak mendukung verifikasi SHA-256. Gunakan browser/WebView terbaru untuk backup aman.');
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

async function backupAll(){
  const db = await openDB();
  const names = Object.keys(STORES);
  const snapshot=await new Promise((resolve, reject) => {
    let transaction;
    try { transaction = db.transaction(names, 'readonly'); }
    catch(error){ reject(error); return; }
    const data = {};
    for(const name of names){
      const request = transaction.objectStore(name).getAll();
      request.onsuccess = () => { data[name] = request.result || []; };
      request.onerror = () => { try { transaction.abort(); } catch(_){} };
    }
    transaction.oncomplete = () => resolve(data);
    transaction.onerror = () => reject(transaction.error || new Error('Backup gagal'));
    transaction.onabort = () => reject(transaction.error || new Error('Backup dibatalkan'));
  });
  const payload={app:'ARKEJA_FARM',formatVersion:2,version:DB_VERSION,exportedAt:new Date().toISOString(),data:snapshot};
  const counts={}; let totalRecords=0;
  for(const name of names){counts[name]=snapshot[name].length;totalRecords+=counts[name];}
  payload.manifest={storeCount:names.length,totalRecords,counts};
  payload.integrity={algorithm:'SHA-256',digest:await sha256Hex(backupDigestInput(payload))};
  return payload;
}

function backupSummary(payload){
  const counts={};let totalRecords=0;
  for(const name of Object.keys(STORES)){const n=Array.isArray(payload?.data?.[name])?payload.data[name].length:0;counts[name]=n;totalRecords+=n;}
  return {exportedAt:payload?.exportedAt||null,storeCount:Object.keys(STORES).length,totalRecords,counts,formatVersion:payload?.formatVersion||1};
}

async function verifyBackupIntegrity(payload){
  if(!payload || payload.formatVersion!==2) return {verified:false,legacy:true,summary:backupSummary(payload)};
  if(!payload.manifest || !payload.integrity || payload.integrity.algorithm!=='SHA-256' || typeof payload.integrity.digest!=='string')
    throw new Error('Manifest atau checksum backup tidak lengkap. File mungkin rusak.');
  const summary=backupSummary(payload);
  if(payload.manifest.storeCount!==summary.storeCount || payload.manifest.totalRecords!==summary.totalRecords)
    throw new Error('Jumlah data pada manifest tidak cocok. Backup mungkin berubah atau rusak.');
  for(const name of Object.keys(STORES)) if(payload.manifest.counts?.[name]!==summary.counts[name])
    throw new Error('Jumlah data store '+name+' tidak cocok dengan manifest.');
  const actual=await sha256Hex(backupDigestInput(payload));
  if(actual!==payload.integrity.digest) throw new Error('Checksum SHA-256 tidak cocok. Backup rusak atau telah diubah.');
  return {verified:true,legacy:false,summary};
}

function validateBackupPayload(payload){
  if(!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data))
    throw new Error('Format backup tidak valid');
  if(payload.app !== undefined && payload.app !== 'ARKEJA_FARM')
    throw new Error('Backup bukan berasal dari ARKEJA FARM');
  if(payload.formatVersion !== undefined && ![1,2].includes(payload.formatVersion))
    throw new Error('Versi format backup tidak didukung');
  const schemaVersion = payload.schemaVersion ?? payload.version;
  if(schemaVersion !== DB_VERSION)
    throw new Error('Versi database backup tidak cocok. Diperlukan versi ' + DB_VERSION + ', ditemukan ' + String(schemaVersion));

  const expected = Object.keys(STORES).sort();
  const actual = Object.keys(payload.data).sort();
  const missing = expected.filter(name => !Object.prototype.hasOwnProperty.call(payload.data, name));
  const unknown = actual.filter(name => !Object.prototype.hasOwnProperty.call(STORES, name));
  if(missing.length) throw new Error('Backup tidak lengkap. Store yang hilang: ' + missing.join(', '));
  if(unknown.length) throw new Error('Backup memiliki store yang tidak dikenal: ' + unknown.join(', '));
  for(const name of expected){
    const rows = payload.data[name];
    if(!Array.isArray(rows)) throw new Error('Data ' + name + ' harus berupa array');
    const keyPath = STORES[name].keyPath;
    const seen = new Set();
    for(let index=0; index<rows.length; index++){
      const row = rows[index];
      if(!row || typeof row !== 'object' || Array.isArray(row) || row[keyPath] === undefined || row[keyPath] === null || row[keyPath] === '')
        throw new Error('Baris ' + (index+1) + ' pada ' + name + ' tidak memiliki kunci ' + keyPath);
      const key = row[keyPath];
      if(!['string','number'].includes(typeof key) || (typeof key === 'number' && !Number.isFinite(key)))
        throw new Error('Kunci ' + keyPath + ' pada ' + name + ' harus berupa teks atau angka valid');
      const signature = typeof key + ':' + String(key);
      if(seen.has(signature)) throw new Error('ID/kunci ganda ditemukan pada store ' + name + ': ' + String(key));
      seen.add(signature);
    }
  }
  return true;
}

async function restoreAll(payload){
  // Validasi struktur dan checksum penuh dilakukan sebelum transaksi database dimulai.
  validateBackupPayload(payload);
  await verifyBackupIntegrity(payload);
  const db = await openDB();
  const names = Object.keys(STORES);
  await new Promise((resolve, reject) => {
    let transaction;
    try { transaction = db.transaction(names, 'readwrite'); }
    catch(error){ reject(error); return; }
    try {
      for(const name of names){
        const store = transaction.objectStore(name);
        store.clear();
        for(const row of payload.data[name]) store.put(row);
      }
    } catch(error){
      try { transaction.abort(); } catch(_){}
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {};
    transaction.onabort = () => reject(databaseError(transaction.error || new Error('Restore dibatalkan'), 'Restore gagal')); 
  });
}
