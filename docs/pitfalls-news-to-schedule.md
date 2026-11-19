# Pitfalls: berita -> karusel -> jadwal Repliz

- Lint visual 0 isu bukan bukti layout benar. Linter tidak lihat teks teroklusi, teks terpotong kotak, warna eyebrow salah. Selalu vision_analyze contact-sheet sebelum kirim ke Lawrence.
- Referensi visual dari Lawrence: ekstrak daftar elemen (warna tiap elemen kecil juga) SEBELUM patch engine. Eyebrow/kicker = kuning, bukan abu.
- Edit copy.json/caption membatalkan lint-text dan membuat slide 'older than copy.json': render + lint visual + lint text ulang sebelum meta caption_approved. Cek kata terlarang (pasti, dijamin) di caption sebelum minta persetujuan.
- lint visual dan render: selalu --chrome <path> dan CAROUSEL_CHROME_MODE=cdp.
- publish-payload butuh uploads.json (array URL https, jumlah = jumlah PNG). Buat dulu: Repliz Storage POST /public/storage/file/init -> PUT upload (tanpa Authorization) -> POST /public/storage/file/{id}/complete (204). Konversi ke JPEG q95 (TikTok tolak PNG). Init balas 201.
- publish-payload --at format `YYYY-MM-DD HH:mm` (zona brand), bukan ISO. meta --schedule-at ISO UTC `...Z`.
- Output publish-payload = body POST /public/schedule; additionalInfo.isDraft true kecuali --live. Setelah POST (201 {scheduleId}) jalankan meta --status scheduled.
- Jangan `source ~/.hermes/.env` (baris tak valid); baca REPLIZ_BASIC_AUTH dengan grep. Header Content-Type: application/json wajib.
- Tujuan akhir alur = terjadwal untuk terbit. Setelah Lawrence `setuju <kode>`, pakai `publish-payload --live` dari awal. Jangan default draft lalu lapor 'scheduled'; draft (`isDraft:true`) tidak terbit. Laporkan status sebenarnya dari GET /public/schedule/:id (`additionalInfo.isDraft` harus false).
- API Repliz tidak punya PATCH /public/schedule/:id (404). Koreksi = DELETE (204) lalu POST ulang. Hanya hapus jadwal buatan sendiri.
- publish-payload menolak status selain caption_approved. Setelah delete, set status meta.json kembali ke caption_approved (hapus scheduleId/scheduleAt) lalu ulang.
- Ajukan DRAFT <kode> ke Lawrence hanya setelah jalur publish terbukti (uploads.json ada, payload jadi).
- Setelah schedule: GET /public/schedule dan filter accountId di sisi klien. GET /public/schedule/:id tidak mengembalikan templateId. Untuk automation, cek objek automation (reply aktif + keyword, message aktif + URL tombol), bukan field templateId.
- Langkah jadwal satu perintah: `REPLIZ_BASIC_AUTH=$(grep '^REPLIZ_BASIC_AUTH=' ~/.hermes/.env | cut -d= -f2- | tr -d "\"'") python3 /home/ubuntu/work/carousel-plugin/scripts/schedule.py <project> <brands> <ACCOUNT_ID> "YYYY-MM-DD HH:mm"` (upload JPEG, payload live, POST, meta, verifikasi GET). `--draft` hanya bila diminta. Branch repo: feat/kabarsosmed-series.
- Kunci akun (2026-11-14): schedule.py menolak ACCOUNT_ID yang bukan akun brand proyek (gwenchana 6a60cba762caae1e04e96bee @gwenchana.agency, truemission 6ad72260fc43f81b7825d5fa @truemission.id). Akun lain (mis. @lawrencephilemon_) hanya dengan --akun-lain, dan hanya kalau Lawrence sendiri menyebut akun itu di sesi ini.
