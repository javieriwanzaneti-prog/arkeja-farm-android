# Arkeja Farm — Paket Build APK

Cara membuat APK tanpa Android Studio:

1. Buat repo baru di github.com (boleh private), lalu unggah **seluruh isi folder ini**
   (termasuk folder `.github`, `www`, `assets`).
   Jika folder `.github` tidak ikut terunggah lewat web, gunakan GitHub Desktop atau `git push`.
2. Buka tab **Actions** → workflow **Build APK** → akan jalan otomatis (atau klik **Run workflow**).
3. Tunggu ±5–8 menit sampai hijau, buka run tersebut, unduh artifact **ArkejaFarm-apk** (zip berisi `ArkejaFarm.apk`).
4. Ekstrak, kirim ke HP, lalu pasang. Aktifkan "Pasang dari sumber tidak dikenal" jika diminta.

Catatan:
- APK yang dihasilkan adalah build *debug* (sudah bertanda tangan, bisa dipasang langsung). Untuk Play Store diperlukan build release dengan keystore sendiri.
- Isi aplikasi ada di folder `www/`. Ubah file di sana, push ulang, APK baru otomatis dibuat.
- Data tersimpan di IndexedDB di dalam aplikasi; menghapus aplikasi akan menghapus datanya. Gunakan fitur ekspor/cadangan sebelum uninstall.
- ID aplikasi: `id.arkeja.farm` (ubah di `capacitor.config.json` bila perlu, sebelum rilis pertama).
