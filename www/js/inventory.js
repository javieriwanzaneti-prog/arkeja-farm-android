/* ============ Inventory ============ */
const Inventory = {
  async render(container, season){
    const allItems = await getAll('inventory');
    const items = allItems.filter(i=>i.active!==false && i.archived!==true);
    const archivedItems = allItems.filter(i=>i.active===false || i.archived===true);
    container.innerHTML = `
      <h2 class="page-title">Inventory</h2>
      <p class="subtitle">Stok pupuk, pestisida, ZPT, benih.</p>
      <button class="btn" id="inv-add" style="margin-bottom:10px">+ Tambah Barang</button>
      <div class="card">
        <h3>Daftar Stok</h3>
        ${items.length ? items.map(i=>`
          <div class="list-row">
            <div>
              <strong>${esc(i.name)}</strong>
              <small>${esc(i.productType)}${i.productId?' · Terhubung Master':''} · ${esc(i.unit)} · Stok: ${fmtNum(i.stock)} ${esc(i.unit)} (min ${fmtNum(i.minStock)})</small>
              ${i.stock <= i.minStock ? '<div class="tag red" style="margin-top:4px">Stok Menipis</div>' : ''}
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn small secondary" data-map="${i.id}">Pemetaan</button>
              <button class="btn small secondary" data-tx="${i.id}">Transaksi</button>
              <button class="btn small danger" data-archive="${i.id}">Arsipkan</button>
            </div>
          </div>`).join('') : '<div class="empty">Belum ada item.</div>'}
      </div>
      ${archivedItems.length ? `<div class="card"><h3>Barang Diarsipkan</h3>${archivedItems.map(i=>`<div class="list-row"><div><strong>${esc(i.name)}</strong><small>${esc(i.productType)} · ${esc(i.unit)} · Stok tersisa ${fmtNum(i.stock)} ${esc(i.unit)}</small></div><div style="display:flex;align-items:center;gap:6px"><span class="tag">Arsip</span><button class="btn small secondary" data-unarchive="${i.id}">Pulihkan</button></div></div>`).join('')}</div>` : ''}
      <div class="card">
        <h3>Riwayat Transaksi</h3>
        <div id="inv-tx-list"></div>
      </div>`;
    $('#inv-add').onclick = async () => {
      const catalog=await ProductMapping.catalog();
      modal('Tambah Barang', `
      <div class="field"><label>Nama</label><input id="iv-name"></div>
      <div class="field"><label>Jenis</label><select id="iv-type">
        <option>Pupuk</option><option>Pestisida</option><option>ZPT</option><option>Benih</option><option>Peralatan</option><option>Bahan pendukung</option></select></div>
      <div class="field"><label>Hubungkan ke Master Produk (opsional)</label><select id="iv-product"><option value="">— Belum dipetakan —</option>${catalog.map(p=>`<option value="${esc(p.productId)}" data-type="${ProductMapping.inventoryType(p.masterType)}">${esc(p.name)} · ${p.masterType==='fertilizer'?'Pupuk':p.masterType==='pesticide'?'Pestisida':'ZPT'}</option>`).join('')}</select><small class="muted">Pemetaan berdasarkan ID lebih aman daripada kesamaan nama.</small></div>
      <div class="field-row">
        <div class="field"><label>Stok awal</label><input id="iv-stock" type="number" step="0.01" value="0"></div>
        <div class="field"><label>Satuan</label><input id="iv-unit" value="kg"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Harga/unit</label><input id="iv-price" type="number" value="0"></div>
        <div class="field"><label>Stok min</label><input id="iv-min" type="number" value="0"></div>
      </div>
      <button class="btn" id="iv-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#iv-product').onchange=()=>{const opt=b.querySelector('#iv-product').selectedOptions[0];if(opt?.dataset.type)b.querySelector('#iv-type').value=opt.dataset.type;};
        bindOnce(b.querySelector('#iv-save'), async ()=>{
          const save=b.querySelector('#iv-save');
          try { const productId=b.querySelector('#iv-product').value||''; await ProductMapping.assertAvailable(productId); await put('inventory', { id:uid('inv'), name:b.querySelector('#iv-name').value||'Item',
            productType:b.querySelector('#iv-type').value, productId, ...(productId?{masterProductType:ProductMapping.split(productId)?.type,masterProductId:ProductMapping.split(productId)?.id}:{}), stock:num(b.querySelector('#iv-stock').value),
            unit:b.querySelector('#iv-unit').value||'kg', price:num(b.querySelector('#iv-price').value),
            minStock:num(b.querySelector('#iv-min').value), createdAt:todayISO() });
            close(); toast('Tersimpan'); Inventory.render(container, season);
          } catch(error){ console.error(error); toast(error.message||'Gagal menyimpan'); throw error; }
        });
      });
    };
    container.querySelectorAll('[data-archive]').forEach(b=>b.onclick=()=>confirmDialog('Arsipkan barang? Riwayat transaksi dan stok akan tetap dipertahankan.', async ()=>{
      try { const result=await archiveInventoryItem(b.dataset.archive); toast(result.hasHistory?'Barang diarsipkan. Riwayat transaksi tetap tersimpan.':'Barang diarsipkan.'); await Inventory.render(container, season); }
      catch(error){ console.error(error); toast(error.message||'Gagal mengarsipkan barang'); }
    }));
    container.querySelectorAll('[data-unarchive]').forEach(b=>b.onclick=()=>confirmDialog('Pulihkan barang dari arsip?', async ()=>{
      try{await restoreInventoryItem(b.dataset.unarchive);toast('Barang dipulihkan');await Inventory.render(container,season);}
      catch(error){console.error(error);toast(error.message||'Gagal memulihkan barang');}
    }));
    container.querySelectorAll('[data-map]').forEach(b=>b.onclick=async()=>{
      const item=await getOne('inventory',b.dataset.map); if(!item) return;
      const catalog=await ProductMapping.catalog();
      modal('Pemetaan Produk: '+item.name, `
        <p class="subtitle">Hubungkan barang Inventory dengan satu identitas Master Produk. Satu produk master hanya boleh dipetakan ke satu barang aktif.</p>
        <div class="field"><label>Master Produk</label><select id="iv-map-product"><option value="">— Hapus pemetaan —</option>${catalog.map(p=>`<option value="${esc(p.productId)}" data-type="${ProductMapping.inventoryType(p.masterType)}" ${String(item.productId||'')===p.productId?'selected':''}>${esc(p.name)} · ${p.masterType==='fertilizer'?'Pupuk':p.masterType==='pesticide'?'Pestisida':'ZPT'}</option>`).join('')}</select></div>
        <button class="btn" id="iv-map-save">Simpan Pemetaan</button>`,(box,close)=>{
          box.querySelector('#iv-map-product').onchange=()=>{const opt=box.querySelector('#iv-map-product').selectedOptions[0];if(opt?.dataset.type)item.productType=opt.dataset.type;};
          box.querySelector('#iv-map-save').onclick=async()=>{
            const productId=box.querySelector('#iv-map-product').value;
            try{
              if(productId) await ProductMapping.linkInventory(item.id,productId);
              else await put('inventory',{...item,productId:'',masterProductType:'',masterProductId:'',fertilizerId:null,mappingUpdatedAt:new Date().toISOString()});
              close();toast('Pemetaan produk tersimpan');await Inventory.render(container,season);
            }catch(error){toast(error.message||'Pemetaan gagal');}
          };
        });
    });
    container.querySelectorAll('[data-tx]').forEach(b=>b.onclick = async ()=>{
      const item = await getOne('inventory', b.dataset.tx);
      if(!item) return;
      modal('Transaksi: '+item.name, `
        <div class="field"><label>Jenis Transaksi</label><select id="tx-type"><option value="in">Stok Masuk</option><option value="out">Stok Keluar</option></select></div>
        <div class="field"><label>Jumlah (${esc(item.unit)})</label><input id="tx-qty" type="number" min="0" step="0.01"></div>
        <div class="field"><label>Tanggal</label><input id="tx-date" type="date" value="${todayISO()}"></div>
        <div class="field"><label>Catatan</label><input id="tx-note"></div>
        <button class="btn" id="tx-save">Proses</button>`, (bb,close)=>{
          bindOnce(bb.querySelector('#tx-save'), async ()=>{
            const t = bb.querySelector('#tx-type').value;
            const qty = num(bb.querySelector('#tx-qty').value);
            if(qty<=0) return toast('Jumlah tidak valid');
            const save=bb.querySelector('#tx-save');
            try { await recordInventoryTransaction({inventoryId:item.id,type:t,qty,date:bb.querySelector('#tx-date').value,note:bb.querySelector('#tx-note').value,seasonId:season?season.id:null});
              close(); toast('Transaksi tersimpan'); Inventory.render(container, season);
            } catch(error){ console.error(error); toast(error.message||'Transaksi gagal'); throw error; }
          });
        });
    });
    const allTx = await getAll('inv_tx');
    const invAll = allItems;
    $('#inv-tx-list').innerHTML = allTx.length ? sortBy(allTx, 'date', -1).slice(0,30).map(t=>{
      const it = invAll.find(x=>x.id===t.inventoryId);
      return `<div class="list-row"><div><strong>${esc(it?it.name:'—')}</strong><small>${t.type==='in'?'Masuk':'Keluar'} ${fmtNum(t.qty,2)} · ${fmtDate(t.date)}</small></div><div class="tag ${t.type==='in'?'green':'orange'}">${t.type==='in'?'+':'-'}</div></div>`;
    }).join('') : '<div class="empty">Belum ada transaksi.</div>';
  }
};