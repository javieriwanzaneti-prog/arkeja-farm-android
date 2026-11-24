/* ============ Inventory ============ */
const Inventory = {
  async render(container, season){
    const items = await getAll('inventory');
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
              <small>${esc(i.productType)} · ${esc(i.unit)} · Stok: ${fmtNum(i.stock)} ${esc(i.unit)} (min ${fmtNum(i.minStock)})</small>
              ${i.stock <= i.minStock ? '<div class="tag red" style="margin-top:4px">Stok Menipis</div>' : ''}
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn small secondary" data-tx="${i.id}">Transaksi</button>
              <button class="btn small danger" data-del="${i.id}">✕</button>
            </div>
          </div>`).join('') : '<div class="empty">Belum ada item.</div>'}
      </div>
      <div class="card">
        <h3>Riwayat Transaksi</h3>
        <div id="inv-tx-list"></div>
      </div>`;
    $('#inv-add').onclick = () => modal('Tambah Barang', `
      <div class="field"><label>Nama</label><input id="iv-name"></div>
      <div class="field"><label>Jenis</label><select id="iv-type">
        <option>Pupuk</option><option>Pestisida</option><option>ZPT</option><option>Benih</option><option>Peralatan</option><option>Bahan pendukung</option></select></div>
      <div class="field-row">
        <div class="field"><label>Stok awal</label><input id="iv-stock" type="number" step="0.01" value="0"></div>
        <div class="field"><label>Satuan</label><input id="iv-unit" value="kg"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Harga/unit</label><input id="iv-price" type="number" value="0"></div>
        <div class="field"><label>Stok min</label><input id="iv-min" type="number" value="0"></div>
      </div>
      <button class="btn" id="iv-save">Simpan</button>`, (b,close)=>{
        b.querySelector('#iv-save').onclick = async ()=>{
          await put('inventory', { id:uid('inv'), name:b.querySelector('#iv-name').value||'Item',
            productType:b.querySelector('#iv-type').value, stock:num(b.querySelector('#iv-stock').value),
            unit:b.querySelector('#iv-unit').value||'kg', price:num(b.querySelector('#iv-price').value),
            minStock:num(b.querySelector('#iv-min').value), createdAt:todayISO() });
          close(); toast('Tersimpan'); Inventory.render(container, season);
        };
      });
    container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus item?', async ()=>{
      await del('inventory', b.dataset.del); toast('Terhapus'); Inventory.render(container, season);
    }));
    container.querySelectorAll('[data-tx]').forEach(b=>b.onclick = async ()=>{
      const item = await getOne('inventory', b.dataset.tx);
      if(!item) return;
      modal('Transaksi: '+item.name, `
        <div class="field"><label>Jenis Transaksi</label><select id="tx-type"><option value="in">Stok Masuk</option><option value="out">Stok Keluar</option></select></div>
        <div class="field"><label>Jumlah (${esc(item.unit)})</label><input id="tx-qty" type="number" min="0" step="0.01"></div>
        <div class="field"><label>Tanggal</label><input id="tx-date" type="date" value="${todayISO()}"></div>
        <div class="field"><label>Catatan</label><input id="tx-note"></div>
        <button class="btn" id="tx-save">Proses</button>`, (bb,close)=>{
          bb.querySelector('#tx-save').onclick = async ()=>{
            const t = bb.querySelector('#tx-type').value;
            const qty = num(bb.querySelector('#tx-qty').value);
            if(qty<=0) return toast('Jumlah tidak valid');
            const newStock = t === 'in' ? item.stock + qty : item.stock - qty;
            if(newStock < 0) return toast('Stok tidak cukup');
            await put('inventory', { ...item, stock:newStock });
            await put('inv_tx', { id:uid('tx'), inventoryId:item.id, type:t, qty, date:bb.querySelector('#tx-date').value, note:bb.querySelector('#tx-note').value, seasonId: season?season.id:null });
            close(); toast('Transaksi tersimpan'); Inventory.render(container, season);
          };
        });
    });
    const allTx = await getAll('inv_tx');
    const invAll = items;
    $('#inv-tx-list').innerHTML = allTx.length ? sortBy(allTx, 'date', -1).slice(0,30).map(t=>{
      const it = invAll.find(x=>x.id===t.inventoryId);
      return `<div class="list-row"><div><strong>${esc(it?it.name:'—')}</strong><small>${t.type==='in'?'Masuk':'Keluar'} ${fmtNum(t.qty,2)} · ${fmtDate(t.date)}</small></div><div class="tag ${t.type==='in'?'green':'orange'}">${t.type==='in'?'+':'-'}</div></div>`;
    }).join('') : '<div class="empty">Belum ada transaksi.</div>';
  }
};