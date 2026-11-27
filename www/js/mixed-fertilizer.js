/* ============ MODUL PEMUPUKAN CAMPURAN ============ */
const MixedFertilizer = {
  // Fungsi untuk merender UI utama di tab Nutrisi
  async render(container, season) {
    const recipes = await getAll('mixed_recipes');
    
    container.innerHTML = `
      <div class="card">
        <div class="section-head">
          <h3>Daftar Resep Campuran</h3>
          <button class="btn small" id="mf-add-recipe">+ Resep Baru</button>
        </div>
        ${recipes.length ? recipes.map(r => `
          <div class="list-row">
            <div>
              <strong>${esc(r.name)}</strong>
              <small class="muted">${(Array.isArray(r.phases)?r.phases.length:0)} Fase · ${esc(r.note || 'Tanpa catatan')}</small>
            </div>
            <div style="display:flex; gap:4px;">
              <button class="btn small" data-sch-recipe="${esc(r.id)}">Jadwalkan</button>
              <button class="btn small secondary" data-edit-recipe="${esc(r.id)}">Buka</button>
              <button class="btn small danger" data-del-recipe="${esc(r.id)}">✕</button>
            </div>
          </div>
        `).join('') : '<div class="empty">Belum ada resep. Klik tombol di atas untuk memulai.</div>'}
      </div>
    `;

    $('#mf-add-recipe').onclick = () => this.openRecipeForm(null, container, season);
    
    container.querySelectorAll('[data-sch-recipe]').forEach(b => {
      b.onclick = async () => {
        const recipe = await getOne('mixed_recipes', b.dataset.schRecipe);
        if(recipe) this.scheduleRecipe(recipe, container, season);
      };
    });
    
    container.querySelectorAll('[data-edit-recipe]').forEach(b => {
      b.onclick = async () => {
        const recipe = await getOne('mixed_recipes', b.dataset.editRecipe);
        if(recipe) this.openRecipeForm(recipe, container, season);
      };
    });

    container.querySelectorAll('[data-del-recipe]').forEach(b => {
      b.onclick = () => confirmDialog('Hapus resep ini secara permanen?', async () => {
        await del('mixed_recipes', b.dataset.delRecipe);
        toast('Resep dihapus');
        this.render(container, season);
      });
    });
  },

  // Fungsi untuk membuka form edit/tambah resep
  async openRecipeForm(recipe, mainContainer, season) {
    const isEdit = !!recipe;
    // Clone objek agar tidak langsung mengubah data asli sebelum disimpan
    const currentRecipe = recipe ? JSON.parse(JSON.stringify(recipe)) : {
      id: uid('mfr'),
      name: '',
      note: '',
      phases: [
        { id: uid('mfp'), name: 'Fase 1', hstStart: 0, hstEnd: 0, dosePerPlant: 0, waterPerPlant: 0, population: season ? num(season.population) : 0, items: [] }
      ]
    };

    const fertilizers = await getAll('fertilizers');

    const renderForm = () => {
      const formHTML = `
        <div class="field">
          <label>Nama Resep</label>
          <input id="mf-name" value="${esc(currentRecipe.name)}" placeholder="Contoh: Pemupukan Generatif Melon">
        </div>
        <div class="field">
          <label>Catatan (Opsional)</label>
          <input id="mf-note" value="${esc(currentRecipe.note)}" placeholder="Contoh: Aplikasi kocor sore hari">
        </div>
        
        <div class="section-head" style="margin-top:20px">
          <h4>Fase & Komposisi</h4>
          <button class="btn small outline" id="mf-add-phase">+ Fase</button>
        </div>
        
        <div id="mf-phase-list">
          ${currentRecipe.phases.map((phase, pIdx) => `
            <div class="card" style="background:#f9f9f9; border:1px solid #ddd; padding:12px; margin-bottom:12px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <strong>Fase ${pIdx + 1}</strong>
                <button class="btn small danger" data-del-phase="${pIdx}">Hapus Fase</button>
              </div>
              <div class="field-row">
                <div class="field"><label>Nama Fase</label><input value="${esc(phase.name)}" data-p-input="name" data-p-idx="${pIdx}"></div>
                <div class="field"><label>HST (Awal - Akhir)</label>
                  <div style="display:flex; gap:4px">
                    <input type="number" value="${phase.hstStart}" data-p-input="hstStart" data-p-idx="${pIdx}">
                    <input type="number" value="${phase.hstEnd}" data-p-input="hstEnd" data-p-idx="${pIdx}">
                  </div>
                </div>
              </div>
              
              <div class="field-row" style="margin-top:8px">
                <div class="field"><label>Dosis Campuran (g/tanaman)</label><input type="number" step="0.01" value="${phase.dosePerPlant}" data-p-input="dosePerPlant" data-p-idx="${pIdx}"></div>
                <div class="field"><label>Volume Larutan (ml/tanaman)</label><input type="number" step="0.01" value="${phase.waterPerPlant}" data-p-input="waterPerPlant" data-p-idx="${pIdx}"></div>
              </div>
              <div class="field">
                <label>Populasi Tanaman</label>
                <input type="number" value="${phase.population}" data-p-input="population" data-p-idx="${pIdx}" placeholder="${season ? season.population : '0'}">
              </div>

              <div style="margin-top:12px; background:#fff; padding:10px; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <span class="tiny" style="font-weight:bold">Komposisi Pupuk</span>
                  <button class="btn small secondary" data-add-item="${pIdx}">+ Pupuk</button>
                </div>
                
                ${phase.items.map((item, iIdx) => `
                  <div style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
                    <select data-i-input="fertId" data-p-idx="${pIdx}" data-i-idx="${iIdx}" style="flex:2; padding:6px; font-size:12px;">
                      <option value="">— Pilih Pupuk —</option>
                      ${fertilizers.map(f => `<option value="${esc(f.id)}" ${String(item.fertId) === String(f.id) ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
                    </select>
                    <input type="number" placeholder="Rasio" value="${item.ratio}" data-i-input="ratio" data-p-idx="${pIdx}" data-i-idx="${iIdx}" style="flex:1; padding:6px; font-size:12px;" min="1">
                    <button class="btn small danger" data-del-item="${pIdx}-${iIdx}" style="padding:6px;">✕</button>
                  </div>
                `).join('')}
                
                <div id="mf-calc-res-${pIdx}" style="margin-top:10px; font-size:12px; border-top:1px dashed #ccc; padding-top:10px;"></div>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="btn" id="mf-save" style="margin-top:20px">Simpan Resep</button>
      `;

      modal(isEdit ? 'Edit Resep Campuran' : 'Buat Resep Campuran', formHTML, (b, close) => {
        
        // Fungsi untuk menghitung dan me-render hasil kalkulasi secara live
        const updateCalculations = () => {
          currentRecipe.phases.forEach((phase, pIdx) => {
            const el = b.querySelector(`#mf-calc-res-${pIdx}`);
            if (!el) return;
            
            const totalRatio = phase.items.reduce((a, c) => a + num(c.ratio), 0);
            const totalMix = num(phase.dosePerPlant) * num(phase.population);
            const totalWater = (num(phase.waterPerPlant) * num(phase.population)) / 1000;

            if (totalMix <= 0) {
              el.innerHTML = '<span class="muted">Masukkan dosis & populasi untuk melihat kalkulasi.</span>';
              return;
            }

            let html = `<div style="margin-bottom:6px; font-weight:bold; color:var(--green)">Total Campuran: ${fmtNum(totalMix, 2)} g | Total Air: ${fmtNum(totalWater, 2)} L</div>`;
            html += `<table style="width:100%; font-size:11px; border-collapse:collapse;">`;
            phase.items.forEach(item => {
              const fert = fertilizers.find(f => String(f.id) === String(item.fertId));
              if (fert && totalRatio > 0) {
                const reqGram = (num(item.ratio) / totalRatio) * totalMix;
                html += `<tr><td>${esc(fert.name)}</td><td style="text-align:right; font-weight:bold;">${fmtNum(reqGram, 2)} g</td></tr>`;
              }
            });
            html += `</table>`;
            
            // Peringatan ketidakcocokan
            const warnings = NutritionEngine.checkIncompatibility(phase.items.map(i => fertilizers.find(f => String(f.id) === String(i.fertId))?.name).filter(Boolean));
            if (warnings.length) {
              html += `<div style="color:var(--red); font-size:10px; margin-top:6px;">⚠ ${warnings.join('<br>⚠ ')}</div>`;
            }

            el.innerHTML = html;
          });
        };

        // Event listener untuk perubahan input secara langsung (tanpa perlu submit)
        const bindLiveEvents = () => {
          b.querySelectorAll('[data-p-input]').forEach(input => {
            input.oninput = (e) => {
              const pIdx = parseInt(e.target.dataset.pIdx);
              const key = e.target.dataset.pInput;
              currentRecipe.phases[pIdx][key] = e.target.value;
              updateCalculations();
            };
          });

          b.querySelectorAll('[data-i-input]').forEach(input => {
            input.onchange = (e) => {
              const pIdx = parseInt(e.target.dataset.pIdx);
              const iIdx = parseInt(e.target.dataset.iIdx);
              const key = e.target.dataset.iInput;
              currentRecipe.phases[pIdx].items[iIdx][key] = e.target.value;
              updateCalculations();
            };
          });

          b.querySelectorAll('[data-add-item]').forEach(btn => {
            btn.onclick = (e) => {
              const pIdx = parseInt(e.target.dataset.addItem);
              currentRecipe.phases[pIdx].items.push({ fertId: '', ratio: 1 });
              renderForm(); // Re-render form
            };
          });

          b.querySelectorAll('[data-del-item]').forEach(btn => {
            btn.onclick = (e) => {
              const [pIdx, iIdx] = e.target.dataset.delItem.split('-').map(Number);
              currentRecipe.phases[pIdx].items.splice(iIdx, 1);
              renderForm();
            };
          });

          b.querySelectorAll('[data-del-phase]').forEach(btn => {
            btn.onclick = (e) => {
              const pIdx = parseInt(e.target.dataset.delPhase);
              currentRecipe.phases.splice(pIdx, 1);
              renderForm();
            };
          });
        };

        // --- Simpan Data ---
        b.querySelector('#mf-name').oninput = (e) => currentRecipe.name = e.target.value;
        b.querySelector('#mf-note').oninput = (e) => currentRecipe.note = e.target.value;

        b.querySelector('#mf-add-phase').onclick = () => {
          currentRecipe.phases.push({ id: uid('mfp'), name: 'Fase Baru', hstStart: 0, hstEnd: 0, dosePerPlant: 0, waterPerPlant: 0, population: season ? season.population : 0, items: [] });
          renderForm();
        };

        b.querySelector('#mf-save').onclick = async () => {
          if (!currentRecipe.name || !currentRecipe.name.trim()) return toast('Nama resep wajib diisi');
          if (!Array.isArray(currentRecipe.phases) || !currentRecipe.phases.length) return toast('Resep minimal memiliki satu fase');
          for (const phase of currentRecipe.phases) {
            const hs=Number(phase.hstStart), he=Number(phase.hstEnd);
            if (!phase.name || !Number.isInteger(hs) || !Number.isInteger(he) || hs<0 || he<hs || num(phase.dosePerPlant)<=0 || num(phase.waterPerPlant)<=0 || num(phase.population)<=0) return toast('Setiap fase harus memiliki HST valid, dosis/tanaman, volume air/tanaman, dan populasi lebih dari 0');
            if (!Array.isArray(phase.items) || !phase.items.length || phase.items.some(i=>!i.fertId || num(i.ratio)<=0)) return toast('Setiap fase harus memiliki pupuk dan rasio lebih dari 0');
          }
          try {
            await put('mixed_recipes', currentRecipe);
            close();
            toast('Resep berhasil disimpan');
            MixedFertilizer.render(mainContainer, season);
          } catch(error) { console.error(error); toast('Resep gagal disimpan: '+(error.message||error)); }
        };

        bindLiveEvents();
        updateCalculations();
      });
    };

    renderForm();
  },

  // Snapshot komposisi fase untuk dipakai jadwal dan Item SOP.
  phaseSnapshot(recipe, phase, fertilizers=[], populationOverride=null) {
    if(!recipe || !phase) return null;
    const items=Array.isArray(phase.items)?phase.items:[];
    const totalRatio=items.reduce((sum,item)=>sum+num(item.ratio),0);
    const dosePerPlant=num(phase.dosePerPlant);
    const configuredPopulation=num(phase.population);
    const requestedPopulation=num(populationOverride);
    // Populasi musim aktif mengalahkan populasi template resep. Ini mencegah
    // total kebutuhan bahan/air memakai populasi dari musim saat resep dibuat.
    const population=requestedPopulation>0?requestedPopulation:configuredPopulation;
    const waterPerPlant=num(phase.waterPerPlant);
    return {
      recipeId:recipe.id, recipeName:recipe.name, phaseId:phase.id||'', phaseName:phase.name||'',
      hstStart:num(phase.hstStart), hstEnd:num(phase.hstEnd), dosePerPlant,
      sourcePopulation:configuredPopulation||null, population, waterPerPlant,
      totalMixGrams:dosePerPlant*population, totalWaterL:waterPerPlant*population/1000,
      items:items.map(item=>{
        const fert=fertilizers.find(f=>String(f.id)===String(item.fertId));
        const ratio=num(item.ratio), share=totalRatio>0?ratio/totalRatio:0;
        return {fertId:item.fertId, productId:fert?('fertilizer:'+String(fert.id)):'', name:fert?.name||item.name||'Pupuk tidak ditemukan', ratio,
          gramsPerPlant:share*dosePerPlant, gramsTotal:share*dosePerPlant*population};
      })
    };
  },

  // Fungsi untuk membuat jadwal pemupukan dari sebuah resep
  async scheduleRecipe(recipe, mainContainer, season) {
    if (!season) return toast('Pilih musim tanam terlebih dahulu');

    const formHTML = `
      <p>Buat jadwal dari resep: <strong>${esc(recipe.name)}</strong></p>
      <div class="field">
        <label>Pilih Fase</label>
        <select id="sch-phase">${recipe.phases.map((p, i) => `<option value="${i}">${esc(p.name)} (${p.hstStart}-${p.hstEnd} HST)</option>`).join('')}</select>
      </div>
      <div class="field">
        <label>Tanggal Eksekusi</label>
        <input type="date" id="sch-date" value="${todayISO()}">
      </div>
      <div class="notice green-notice tiny">
        Sistem akan menyimpan *snapshot* perhitungan kebutuhan pupuk dan air ke dalam jadwal. Perubahan resep di masa depan tidak akan mengubah jadwal ini.
      </div>
      <button class="btn" id="sch-save">Buat Jadwal</button>
    `;

    modal('Jadwalkan Pemupukan', formHTML, async (b, close) => {
      b.querySelector('#sch-save').onclick = async () => {
        const phaseIdx = parseInt(b.querySelector('#sch-phase').value);
        const date = b.querySelector('#sch-date').value;
        if(!date) return toast('Tanggal eksekusi wajib diisi');
        const phase = recipe.phases[phaseIdx];
        if(!phase) return toast('Fase resep tidak ditemukan');
        const fertilizers = await getAll('fertilizers');
        const snapshot = this.phaseSnapshot(recipe, phase, fertilizers, season.population);
        if(!snapshot || !snapshot.items.length || snapshot.items.some(x=>x.name==='Pupuk tidak ditemukan')) return toast('Komposisi resep tidak valid atau produk pupuk sudah tidak tersedia');
        if(snapshot.items.some(x=>x.ratio<=0) || snapshot.items.reduce((sum,x)=>sum+x.ratio,0)<=0) return toast('Rasio pupuk harus lebih dari 0');
        const productList = snapshot.items.map(x=>`${x.name}: ${fmtNum(x.gramsTotal,2)} g (${fmtNum(x.gramsPerPlant,3)} g/tanaman)`);
        const doseString = productList.join(' | ');
        const noteStr = `Total Air: ${fmtNum(snapshot.totalWaterL,2)} L (${fmtNum(snapshot.waterPerPlant,0)} ml/tanaman @ ${fmtNum(snapshot.population,0)} tanaman)`;
        try { await put('activities', {
          id:uid('act'), seasonId:season.id, title:`Pemupukan Campuran: ${recipe.name}`,
          type:'Pemupukan', date, time:'07:00', hst:daysBetween(season.plantingDate,date),
          productName:snapshot.items.map(x=>x.name).join(', '), dose:doseString, products:snapshot.items,
          mixedRecipeSnapshot:snapshot, doseActual:'', waterVolume:noteStr,
          note:`Resep: ${recipe.name} | Fase: ${phase.name}`, cost:0,
          status:date<todayISO()?'terlambat':(date===todayISO()?'hariini':'terjadwal'), source:'recipe'
        }); } catch(error) { console.error(error); return toast('Jadwal gagal disimpan: '+(error.message||error)); }

        close();
        toast('Jadwal pemupukan berhasil dibuat');
        Router.go('activity');
      };
    });
  }
};