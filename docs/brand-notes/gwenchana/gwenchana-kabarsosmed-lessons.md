# Gwenchana #KabarSosmed — bahasa desain + lessons

Aktif bila `copy.json` memakai `series: "kabarsosmed"`. Angka di bawah diukur dari `brands/gwenchana/brand.json` dan `engine/lib/layouts.mjs` (blok `.ks`). Jangan mengarang token baru.

## Kanvas dan token

- 1080×1350. Margin 80px. Latar semua slide `#1D1D1D`. Tanpa foto, tanpa gradient.
- Accent `#FDDE5A`. Kartu/grafit `#2B2B2B`. Muted `#9A9A9A`. Teks di gelap `#FFFFFF`. Teks di kuning/terang `#1D1D1D`. Tombol CTA `#E9D26F` / `#1D1D1D`.
- `#007BFF` dilarang. Teks kuning hanya di atas gelap. Kontras minimal 4.5:1.
- Montserrat saja. Maks 2 weight per slide. Hook 800 / 96–120, title 700 / 64–80, body 500 / 38–44, caption 400 / 26–30. Maks 35 kata/slide, headline maks 9 kata, sentence case.
- Logo file saja (warna di atas charcoal). Lebar cover/CTA 360px, konten 200px, minimum 160px. Jangan ketik ulang logo.

## Anatomi slide

- Pager: pill outline 2px `#9A9A9A`, radius 999, padding 8px 22px, weight 700, letter-spacing `.06em`, teks putih. Format `0X / 07` pada referensi Lawrence (7 slide). Guideline v1.2 App A menulis 9 slide; jangan ubah jumlah tanpa keputusan Lawrence.
- Eyebrow/kicker: kuning `#FDDE5A`, UPPERCASE, letter-spacing `.14em`, weight 700, 26px, awalan em dash. Jangan abu. Lawrence sudah mengoreksi ini.
- Headline putih, letter-spacing `-.03em`, line-height 1.05. Satu frasa accent kuning (warna, bukan bar highlight). Headline compare memakai line-height 1.22.
- Garis header: `border-bottom: 3px dotted #2B2B2B`.
- Sumber footer: `#9A9A9A`, 26px, `z-index: 1` supaya tidak ketutup ghost numeral. Penerbit + tanggal. URL hanya di `claims[].url`, bukan di baris sumber.
- Ghost numeral outline (520px, stroke `#2B2B2B`) mati di kind `points` dan `compare`. Di kind padat ia menimpa teks.
- Kartu bernomor: wadah `#2B2B2B`, radius 28, padding 12px 40px. Baris `row-reverse`. Nomor `01` di muted. Pemisah 2px `#1D1D1D`.
- Pill konten seri ini: outline 2px accent, teks accent, UPPERCASE, letter-spacing `.12em`. Bukan pill isi kuning bawaan engine.
- Tombol CTA: `#E9D26F`, teks `#1D1D1D`, radius 999, padding 26px 56px.

## Kotak before/after (kind `compare`)

Koreksi Lawrence, 15 Nov 2026: tulisan terlalu mepet. Jangan taruh judul dan kalimat kapital sebaris.

- Tumpuk: judul (`b`) di atas, kalimat (`em`) di bawah. `flex-direction: column`, `align-items: flex-start`, gap 20px.
- Tinggi tetap `240px` pada kedua kotak. Jangan `min-height` + `space-between`: kotak yang isinya pendek terlihat lebih pendek dan teks terdorong ke tepi.
- Padding 40px 48px, radius 28.
- Judul: weight 700, line-height 1.15.
- Isi: weight 700, 26px, letter-spacing `.04em` (maks `.06em`), line-height 1.45, uppercase.
- Kiri `#2B2B2B` teks putih, isi abu `#9A9A9A`. Kanan `#FDDE5A` teks `#1D1D1D`.
- Jarak antar kotak dan jarak headline ke kotak: 32px.
- Visual lint tidak menangkap mepet, timpang, atau teks tertutup. Cek PNG full-size dengan vision, lalu crop area kotak, sebelum lapor bersih.

## Suara dan larangan

- `kami` / `kamu`. Tanpa tanda seru, tanpa ALL CAPS sebagai penekanan, tanpa em dash di copy (em dash CSS kicker bukan copy).
- Larang: `dijamin`, `pasti`, harga, nama klien, janji waktu balas (`satu hari kerja`).
- CTA kabar: komentar `diskusi`, lalu DM WhatsApp. Tanpa janji waktu.

## Lessons operasional

- `lint --stage visual` 0 issue bukan bukti fidelity. Cek tiap slide full-size. Contact sheet tidak andal.
- Edit `copy.json` setelah render, termasuk caption: lint text, render, lint visual, baru `caption_approved`.
- Setiap lint/render: `CAROUSEL_CHROME_MODE=cdp` dan `--chrome` path Chromium. Satu render sekaligus.
- Lawrence tidak bisa buka folder VPS. Kirim copy `.md` dan PNG lewat `hermes -p roroy send ... MEDIA:`.
