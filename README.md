# Admin Portal — Gudep 03-003/03-004 MAN 1 Padang Pariaman

Dokumentasi lengkap untuk menjalankan dan menguji project ini secara lokal.

## Ringkasan
Static single-file admin UI: `admin-gudep-man1padangpariaman.html`.
Backend demo menggunakan `json-server` dengan seed `db.json`.
Client memanggil root endpoints (mis. `/users`, `/pengurus`, dsb.).

## Prasyarat
- Node.js & npm
- json-server (global atau npx)
- Python 3 (atau server statis lain)

## Instalasi (Windows PowerShell)
1. Buka PowerShell dan pindah ke folder proyek:
   ```powershell
   cd 'C:\Users\acer\Downloads\webb'
   ```
2. (Jika json-server belum terpasang) pasang secara global:
   ```powershell
   npm install -g json-server
   ```

## Menjalankan (development)
1. Jalankan json-server (membaca `db.json`):
   ```powershell
   json-server --watch db.json --port 3000
   ```
   Endpoint utama:
   - http://localhost:3000/
   - http://localhost:3000/users
   - http://localhost:3000/pengurus
   - http://localhost:3000/periode
   - http://localhost:3000/jabatan
   - http://localhost:3000/dokumen_surat
   - http://localhost:3000/kegiatan_agenda
   - http://localhost:3000/anggota

2. Jalankan static server (serve file HTML):
   ```powershell
   python -m http.server 8000
   ```
3. Buka UI:
   http://localhost:8000/admin-gudep-man1padangpariaman.html

## Akun login untuk testing
- Demo (rekomendasi): gunakan dropdown "Demo Peran" lalu pilih:
  - SUPER_ADMIN
  - PEMBINA
  - KERANI
  Tekan "Masuk" untuk langsung masuk sebagai peran tersebut.

- Login email + password (test accounts ditambahkan ke `db.json`):
  - Super Admin: `admin@gudep.local` / `admin`
  - Pembina: `pembina@gudep.local` / `pembina`
  - Kerani: `kerani@gudep.local` / `kerani`

> Catatan: password disimpan plaintext di `db.json` HANYA untuk pengujian lokal. Jangan gunakan di produksi.

## Alur CRUD & contoh API
- GET semua pengguna: `GET http://localhost:3000/users`
- GET pengurus tertentu: `GET http://localhost:3000/pengurus/1`
- POST create (curl):
  ```bash
  curl -X POST http://localhost:3000/pengurus -H "Content-Type: application/json" -d '{"nama_lengkap":"Nama Baru"}'
  ```
- PUT update (curl):
  ```bash
  curl -X PUT http://localhost:3000/pengurus/1 -H "Content-Type: application/json" -d '{"nama_lengkap":"Nama Diubah"}'
  ```
- DELETE:
  ```bash
  curl -X DELETE http://localhost:3000/pengurus/1
  ```

## Perbaikan yang sudah dilakukan
- Memperbaiki fungsi `doLogin()` (demo-role bypass dan autentikasi berbasis password jika ada).
- Mengubah client agar memanggil root json-server endpoints (tanpa `/api/`).
- Memperbaiki beberapa SVG rusak.
- Menambahkan favicon inline untuk menghilangkan 404.
- Menyediakan `db.json` sebagai seed data.

## Known issues & rekomendasi produksi
- Tailwind saat ini via CDN — tidak cocok untuk produksi. Integrasikan Tailwind CLI / PostCSS.
- Auth: demo sudah berpindah ke Express + SQLite; gunakan managed DB (Postgres) for production and enable email verification.
- Use Redis for sessions in production: set REDIS_HOST and run a Redis server. See below for local testing.
- Ganti `json-server` with backend production (Express/Django/Laravel, dsb.).
- Bundling/minify aset (Vite/webpack/rollup) and setup CI/CD.

## Redis for sessions (local testing)
- To start Redis quickly (recommended):
  - Docker Desktop: docker run -d --name redis -p 6379:6379 redis:7-alpine
  - WSL2 (Ubuntu): sudo apt update && sudo apt install redis-server && sudo service redis-server start
  - Chocolatey: choco install redis-64 (follow package instructions)
- After Redis is running, set env and restart server:
  - Windows PowerShell (example; adapt as needed):
    $env:REDIS_HOST = '127.0.0.1'
    $env:SESSION_SECRET = 'replace-with-a-secure-random-value'
    node server.js
  Note: In production, set SESSION_SECRET securely (do not use the 'dev-secret'). The server will refuse to start if NODE_ENV=production and SESSION_SECRET is not set.
- Verify connectivity with: node backend/scripts/check-redis.js


## Opsional: skrip npm (buat `package.json` dan install `concurrently`)
```json
{
  "scripts": {
    "serve:api": "json-server --watch db.json --port 3000",
    "serve:static": "python -m http.server 8000",
    "start": "concurrently \"npm run serve:api\" \"npm run serve:static\""
  }
}
```

## Troubleshooting singkat
- `json-server` tidak ditemukan → `npm i -g json-server`
- Halaman kosong atau JS error → buka DevTools Console dan laporkan error
- Port conflict → gunakan `--port <angka>`

## Kontak & tindak lanjut
Butuh bantuan untuk:
- Menyusun backend (API + auth) yang aman
- Mengintegrasikan Tailwind build dan bundler
- Menyiapkan deployment (server/VPS atau platform seperti Vercel/Netlify + API)

Silakan beri tahu langkah selanjutnya yang diinginkan.