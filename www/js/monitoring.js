/* ============ Monitoring ============ */
const Monitoring = {
  async render(container, season){
    const s = season;
    const records = s ? sortBy(await getByIndex('monitorings','seasonId', s.id), 'date', -1) : [];
    container.innerHTML = `
      <h2 class="page-title">Field Monitoring</h2>
      <p class="subtitle">Catat pertumbuhan tanaman & bandingkan antar periode.</p>
      ${!s ? '<div class="notice">Pilih musim tanam dulu.</div>' : `
      <div class="card">
        <div class="section-head"><h3>Input Pengamatan</h3><span class="tag">${esc(s.commodityName)}</span></div>
        <div class="field-row">
          <div class="field"><label>Tanggal</label><input id="mon-date" type="date" value="${todayISO()}"></div>
          <div class="field"><label>Jumlah sampel</label><input id="mon-n" type="number" value="10" min="1"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Tinggi rata² (cm)</label><input id="mon-height" type="number" step="0.1"></div>
          <div class="field"><label>Diameter batang (mm)</label><input id="mon-stem" type="number" step="0.1"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Jumlah daun</label><input id="mon-leaf" type="number"></div>
          <div class="field"><label>Panjang ruas (cm)</label><input id="mon-internode" type="number" step="0.1"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Jumlah bunga</label><input id="mon-flower" type="number"></div>
          <div class="field"><label>Jumlah buah</label><input id="mon-fruit" type="number"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Berat buah rata² (g)</label><input id="mon-fruitW" type="number" step="0.1"></div>
          <div class="field"><label>Kondisi daun</label><select id="mon-leafCond"><option>Sehat</option><option>Ada bercak</option><option>Menguning</option><option>Kering</option></select></div>
        </div>
        <div class="field"><label>Kondisi akar (opsional)</label><input id="mon-root"></div>
        <div class="field"><label>Catatan lapangan</label><textarea id="mon-note"></textarea></div>
        <div class="field"><label>Foto (opsional)</label><input id="mon-photo" type="file" accept="image/*"><img id="mon-preview" class="upload-preview"></div>
        <button class="btn" id="mon-save">Simpan Pengamatan</button>
      </div>
      <div class="card">
        <div class="section-head"><h3>Riwayat</h3><span class="muted tiny">${records.length} catatan</span></div>
        ${records.length ? records.map(r=>`
          <div class="list-row">
            <div>
              <strong>${fmtDate(r.date)} · HST ${r.hst}</strong>
              <small>Tinggi ${r.height||'—'} cm · Daun ${r.leafCount||'—'} · Buah ${r.fruitCount||'—'}</small>
              ${r.note ? `<div class="tiny muted" style="margin-top:2px">${esc(r.note)}</div>`:''}
            </div>
            <button class="btn small danger" data-del="${r.id}">Hapus</button>
          </div>`).join('') : '<div class="empty">Belum ada pengamatan.</div>'}
      </div>`}`;
    if(!s) return;
    $('#mon-photo').onchange = async e => {
      const url = await imageToDataURL(e.target.files[0]);
      if(url){ const p=$('#mon-preview'); p.src=url; p.style.display='block'; }
    };
    $('#mon-save').onclick = async () => {
      const photo = $('#mon-preview').src && $('#mon-preview').style.display==='block' ? $('#mon-preview').src : '';
      const rec = {
        id:uid('mon'), seasonId:s.id, date:$('#mon-date').value, samples:num($('#mon-n').value),
        height:num($('#mon-height').value), stemDia:num($('#mon-stem').value),
        leafCount:num($('#mon-leaf').value), internode:num($('#mon-internode').value),
        flowerCount:num($('#mon-flower').value), fruitCount:num($('#mon-fruit').value),
        fruitWeight:num($('#mon-fruitW').value), leafCondition:$('#mon-leafCond').value,
        rootCondition:$('#mon-root').value, note:$('#mon-note').value, photo,
        hst: CropEngine.hstOf(s)
      };
      await put('monitorings', rec); toast('Pengamatan tersimpan'); Monitoring.render(container, s);
    };
    container.querySelectorAll('[data-del]').forEach(b=>b.onclick = () => confirmDialog('Hapus catatan ini?', async ()=>{
      await del('monitorings', b.dataset.del); toast('Terhapus'); Monitoring.render(container, s);
    }));
  }
};