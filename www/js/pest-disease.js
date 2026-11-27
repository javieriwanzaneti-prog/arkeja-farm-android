/* ============ Pest & Disease ============ */
const PestDisease = {
  async render(container, season){
    const s = season;
    const dbOpts = await getAll('pests');
    const incidences = s ? await getByIndex('incidences', 'seasonId', s.id) : [];
    container.innerHTML = `
      <h2 class="page-title">Hama & Penyakit</h2>
      <p class="subtitle">Catat kejadian dan tindakan pengendalian.</p>
      <div class="tabs">
        <button data-tab="inc" class="active">Kejadian</button>
        <button data-tab="db">Database</button>
      </div>
      <div id="pd-content"></div>`;

    const renderInc = () => {
      if(!s){ $('#pd-content').innerHTML = '<div class="notice">Pilih musim tanam dulu.</div>'; return; }
      $('#pd-content').innerHTML = `
        <div class="card">
          <h3>Catat Kejadian</h3>
          <div class="field"><label>Tanggal kejadian</label><input id="pd-date" type="date" value="${todayISO()}"></div>
          <div class="field"><label>Jenis (Hama/Penyakit)</label><select id="pd-type"><option>Hama</option><option>Penyakit</option><option>Lainnya</option></select></div>
          <div class="field"><label>Pilih dari database</label><select id="pd-ref"><option value="">— Tidak dari daftar —</option>
            ${dbOpts.map(o=>`<option value="${o.id}">${esc(o.name)} (${esc(o.type)})</option>`).join('')}
          </select></div>
          <div class="field"><label>Nama Kejadian</label><input id="pd-name" placeholder="Nama hama/penyakit"></div>
          <div class="field-row">
            <div class="field"><label>Tingkat serangan</label><select id="pd-level"><option>Ringan</option><option>Sedang</option><option>Berat</option></select></div>
            <div class="field"><label>% Serangan</label><input id="pd-percent" type="number" min="0" max="100" step="0.1"></div>
          </div>
          <div class="field"><label>Diagnosis</label><select id="pd-diag"><option>Dugaan</option><option>Terkonfirmasi</option></select></div>
          <div class="field"><label>Lokasi (misal: bedengan 2)</label><input id="pd-loc"></div>
          <div class="field"><label>Tindakan</label><textarea id="pd-action" placeholder="Produk, dosis, dll"></textarea></div>
          <div class="field"><label>Hasil pengendalian</label><input id="pd-result" placeholder="misal: membaik 3 hari kemudian"></div>
          <div class="field"><label>Foto gejala</label><input id="pd-photo" type="file" accept="image/*"><img id="pd-preview" class="upload-preview"></div>
          <button class="btn" id="pd-save">Simpan Kejadian</button>
        </div>
        <div class="card">
          <h3>Riwayat Kejadian</h3>
          ${incidences.length ? incidences.map(i=>`
            <div class="list-row">
              <div>
                <strong>${fmtDate(i.date)} · ${esc(i.name)}</strong>
                <small>${esc(i.type)} · ${esc(i.level)} · ${esc(i.diagnosis)} · ${i.percent||0}%</small>
                <div class="tiny muted">${esc(i.action||'')}</div>
              </div>
              <button class="btn small danger" data-del="${i.id}">Hapus</button>
            </div>`).join('') : '<div class="empty">Belum ada kejadian.</div>'}
        </div>`;
      $('#pd-photo').onchange = async e => {
        try { const url = await imageToDataURL(e.target.files[0], 600);
          if(url){ const p=$('#pd-preview'); p.src=url; p.style.display='block'; }
        } catch(error){ console.error(error); toast(error.message||'Foto gagal diproses'); e.target.value=''; }
      };
      $('#pd-ref').onchange = e => {
        const o = dbOpts.find(x=>x.id===e.target.value);
        if(o){ $('#pd-name').value = o.name; $('#pd-type').value = o.type === 'Penyakit' ? 'Penyakit' : 'Hama'; }
      };
      bindOnce($('#pd-save'), async () => {
        const date=$('#pd-date').value, name=$('#pd-name').value.trim(), refId=$('#pd-ref').value;
        const percentRaw=$('#pd-percent').value;
        const percent=percentRaw===''?0:Number(percentRaw);
        if(!date){toast('Tanggal kejadian wajib diisi');return;}
        if(!name){toast('Nama hama/penyakit wajib diisi');return;}
        if(percentRaw!=='' && (!Number.isFinite(percent)||percent<0||percent>100)){toast('Persentase serangan harus 0–100');return;}
        if(refId && !dbOpts.some(o=>String(o.id)===String(refId))){toast('Referensi database tidak valid. Pilih ulang.');return;}
        const photo = $('#pd-preview').style.display==='block' ? $('#pd-preview').src : '';
        await put('incidences', {
          id:uid('inc'), seasonId:s.id, date:$('#pd-date').value,
          type:$('#pd-type').value, refId:$('#pd-ref').value,
          name, level:$('#pd-level').value,
          percent, diagnosis:$('#pd-diag').value,
          location:$('#pd-loc').value, action:$('#pd-action').value,
          result:$('#pd-result').value, photo
        });
        toast('Kejadian tersimpan'); PestDisease.render(container, s);
      });
      container.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmDialog('Hapus kejadian?', async ()=>{
        await del('incidences', b.dataset.del); toast('Terhapus'); PestDisease.render(container, s);
      }));
    };

    const renderDb = async () => {
      const list = await getAll('pests');
      $('#pd-content').innerHTML = `
        <button class="btn" id="pd-add-db" style="margin-bottom:10px">+ Tambah Hama/Penyakit</button>
        <div class="card">
          ${list.length ? list.map(o=>`
            <div class="list-row">
              <div><strong>${esc(o.name)}</strong><small>${esc(o.type)} · ${esc(o.hostPlants||'')}</small>
                <div class="tiny muted">Gejala: ${esc(o.symptoms||'')}</div>
              </div>
              <button class="btn small danger" data-del-db="${o.id}">Hapus</button>
            </div>`).join('') : '<div class="empty">Belum ada data.</div>'}
        </div>`;
      $('#pd-add-db').onclick = () => modal('Tambah Data', `
        <div class="field"><label>Jenis</label><select id="nd-type"><option>Hama</option><option>Penyakit</option></select></div>
        <div class="field"><label>Nama</label><input id="nd-name"></div>
        <div class="field"><label>Gejala</label><textarea id="nd-sym"></textarea></div>
        <div class="field"><label>Penyebab</label><input id="nd-cause"></div>
        <div class="field"><label>Faktor pemicu</label><input id="nd-trig"></div>
        <div class="field"><label>Inang</label><input id="nd-host"></div>
        <div class="field"><label>Pencegahan</label><textarea id="nd-prev"></textarea></div>
        <div class="field"><label>Pengendalian</label><textarea id="nd-ctrl"></textarea></div>
        <button class="btn" id="nd-save">Simpan</button>`, (b,close)=>{
          b.querySelector('#nd-save').onclick = async ()=>{
            await put('pests', {
              id:uid('opt'), type:b.querySelector('#nd-type').value,
              name:b.querySelector('#nd-name').value || 'Tanpa nama',
              symptoms:b.querySelector('#nd-sym').value, cause:b.querySelector('#nd-cause').value,
              triggers:b.querySelector('#nd-trig').value, hostPlants:b.querySelector('#nd-host').value,
              prevention:b.querySelector('#nd-prev').value, control:b.querySelector('#nd-ctrl').value
            });
            close(); toast('Tersimpan'); PestDisease.render(container, s);
          };
        });
      container.querySelectorAll('[data-del-db]').forEach(b=>b.onclick=()=>confirmDialog('Hapus dari database?', async ()=>{
        try{await deletePestIfUnreferenced(b.dataset.delDb);toast('Terhapus');PestDisease.render(container,s);}
        catch(error){console.error(error);toast(error.message||'Data tidak dapat dihapus');}
      }));
    };

    container.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
      container.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active', x===b));
      b.dataset.tab === 'inc' ? renderInc() : renderDb();
    });
    renderInc();
  }
};