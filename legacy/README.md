# Legacy / tidak dipakai

File-file di folder ini **tidak terhubung** ke aplikasi yang di-deploy dan
disimpan hanya sebagai arsip/referensi:

- `backend/` — percobaan backend kedua (Express + Redis + BullMQ + SQLite +
  MinIO). Tidak punya endpoint pengurus/anggota/jabatan sama sekali, jadi
  tidak relevan dengan fitur Gudep. Butuh banyak service eksternal yang
  tidak tersedia di Railway free tier.
- `api.php` — sisa percobaan hosting PHP + MySQL, tidak pernah dipakai oleh
  deployment Node.js saat ini.
- `db.json` — data lama format json-server. Sudah digabung sepenuhnya ke
  `data/seed.json` di root project (lihat riwayat commit).
- `routes.json` — konfigurasi rewrite json-server, tidak dipakai oleh
  `server.js` (Express custom, bukan json-server).
- `docker-compose.yml.bak` — compose file untuk stack `backend/` di atas.

Aplikasi yang aktif hanya terdiri dari: `server.js`, `services/store.js`,
`public/`, `data/seed.json`, `Dockerfile`, dan `railway.json` di root.
