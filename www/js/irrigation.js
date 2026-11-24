/* ============ Irrigation ============ */
const Irrigation = {
  async render(container, season){
    const s = season;
    const recs = s ? sortBy(await getByIndex('irrigations','seasonId', s.id), 'date', -1) : [];
    container.innerHTML = `
      <h2 class="page-title">Air & Irigasi</h2>
      <p class="subtitle">Catat kebutuhan dan jadwal penyiraman.</p>
      ${!s ? '<div class="notice">Pilih musim tanam dulu.</div>' : `
      <div class="card">
        <h3>Input Penyiraman</h3>
        <div class="field-row">
          <div class="field"><label>Tanggal</label><input id="irr-date" type="date" value="${todayISO()}"></div>
          <div class="field"><label>Volume total (L)</label><input id="irr-vol" type="number" min="0" step="0.1"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Durasi (menit)</label><input id="irr-dur" type="number" min="0"></div>
          <div class="field"><label>pH air</label><input id="irr-ph" type="number" step="0.1"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>EC air (mS/cm)</label><input id="irr-ec" type="number" step="0.01"></div>
          <div class="field"><label>TDS air (ppm)</label><input id="irr-tds" type="number" step="1"></div>
        </div>
        <div class="field"><label>Curah hujan (mm)</label><input id="irr-rain" type="number" step="0.1"></div>
        <div class="field"><label>Catatan</label><textarea id="irr-note"></textarea></div>
        <button class="btn" id="irr-save">Simpan</button>
      </div>
      <div class="card">
        <h3>Riwayat Penggunaan Air</h3>
        ${recs.length ? `<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Volume</th><th>Durasi</th><th>pH/EC/TDS</th><th>Hujan</th></tr></thead><tbody>
          ${recs.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${fmtNum(r.volume)} L</td><td>${r.duration||'—'} mnt</td><td>${r.ph||'—'} / ${r.ec||'—'} / ${r.tds||'—'}</td><td>${r.rain||'—'} mm</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">Belum ada riwayat.</div>'}
      </div>`}`;
    if(!s) return;
    $('#irr-save').onclick = async () => {
      await put('irrigations', {
        id:uid('irr'), seasonId:s.id, date:$('#irr-date').value, volume:num($('#irr-vol').value),
        duration:num($('#irr-dur').value), ph:num($('#irr-ph').value), ec:num($('#irr-ec').value),
        tds:num($('#irr-tds').value), rain:num($('#irr-rain').value), note:$('#irr-note').value
      });
      toast('Tersimpan'); Irrigation.render(container, s);
    };
  }
};