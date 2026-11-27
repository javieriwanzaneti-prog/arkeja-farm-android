/* ============ PRODUCT MAPPING ENGINE — Tahap 9B ============
 * Identitas kanonis lintas master produk, SOP, resep, dan Inventory.
 * Format ID: fertilizer:<id> | pesticide:<id> | zpt:<id>.
 * Nama hanya dipakai sebagai fallback kompatibilitas data lama.
 */
const UnitConversion = {
  normalize(unit){ const u=String(unit||'').trim().toLowerCase().replace(/\s+/g,''); const map={gram:'g',grams:'g',gr:'g',kilogram:'kg',kilograms:'kg',mililiter:'ml',milliliter:'ml',milliliters:'ml',liter:'l',litre:'l',litres:'l'}; return map[u]||u; },
  convert(value,from,to){
    const a=this.normalize(from), b=this.normalize(to), n=Number(value);
    if(!Number.isFinite(n)) throw new Error('Nilai konversi harus berupa angka.');
    const factors={g:{g:1,kg:0.001},kg:{kg:1,g:1000},ml:{ml:1,l:0.001},l:{l:1,ml:1000}};
    if(a===b) return n; if(!factors[a]||!factors[a][b]) throw new Error(`Satuan ${from} tidak dapat dikonversi ke ${to}.`);
    return n*factors[a][b];
  }
};

const ProductMapping = {
  stores:{fertilizer:'fertilizers',pesticide:'pesticides',zpt:'zpts'},
  inventoryType(type){ return type==='fertilizer'?'Pupuk':type==='pesticide'?'Pestisida':type==='zpt'?'ZPT':''; },
  key(type,id){ return type && id!==null && id!==undefined && id!=='' ? `${type}:${String(id)}` : ''; },
  split(key){ const i=String(key||'').indexOf(':'); return i>0?{type:key.slice(0,i),id:key.slice(i+1)}:null; },
  async catalog(type=null){
    const types=type?[type]:Object.keys(this.stores), out=[];
    for(const t of types){ const store=this.stores[t]; if(!store) continue;
      for(const row of await getAll(store)) out.push({productId:this.key(t,row.id),masterId:row.id,masterType:t,name:row.name||'',store});
    }
    return out;
  },
  async get(productId){ const p=this.split(productId); if(!p||!this.stores[p.type]) return null; const row=await getOne(this.stores[p.type],p.id); return row?{...row,productId,masterId:p.id,masterType:p.type}:null; },
  async matchInventory(product,items){
    const rows=items||await getAll('inventory');
    const key=product?.productId || (product?.fertId!==null&&product?.fertId!==undefined?this.key('fertilizer',product.fertId):'');
    if(key){ const exact=rows.find(x=>String(x.productId||'')===String(key)); if(exact) return {item:exact,method:'id'}; }
    const name=String(product?.name||'').trim().toLocaleLowerCase('id');
    if(!name) return {item:null,method:'none'};
    const candidates=rows.filter(x=>String(x.name||'').trim().toLocaleLowerCase('id')===name && x.active!==false && x.archived!==true);
    return candidates.length===1?{item:candidates[0],method:'legacy-name'}:{item:null,method:candidates.length>1?'ambiguous':'none'};
  },
  async assertAvailable(productId,exceptId=null){
    if(!productId) return true;
    const duplicate=(await getAll('inventory')).find(x=>String(x.id)!==String(exceptId)&&String(x.productId||'')===String(productId)&&x.active!==false&&x.archived!==true);
    if(duplicate) throw new Error('Produk master sudah dipetakan ke barang Inventory lain: '+duplicate.name);
    return true;
  },
  async linkInventory(inventoryId,productId){
    const product=await this.get(productId); if(!product) throw new Error('Produk master tidak ditemukan.');
    const item=await getOne('inventory',inventoryId); if(!item) throw new Error('Barang Inventory tidak ditemukan.');
    await this.assertAvailable(productId,item.id);
    await put('inventory',{...item,productType:this.inventoryType(product.masterType)||item.productType,productId,masterProductType:product.masterType,masterProductId:product.masterId,
      ...(product.masterType==='fertilizer'?{fertilizerId:product.masterId}:{}),mappingUpdatedAt:new Date().toISOString()});
    return product;
  },
  async validateUniqueInventoryMappings(){
    const rows=(await getAll('inventory')).filter(x=>x.productId&&x.active!==false&&x.archived!==true), seen=new Set();
    for(const row of rows){ if(seen.has(String(row.productId))) throw new Error('Pemetaan produk ganda: '+row.productId); seen.add(String(row.productId)); }
    return true;
  }
};
