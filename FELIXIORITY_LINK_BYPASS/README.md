# FELIXIORITY LINK BYPASS

Website resolver URL pendek dengan tampilan premium, responsif, berbahasa Indonesia, tanpa login, dan tanpa dependensi npm. Backend memakai Node.js native; kompatibel VPS dan Vercel.

## Kemampuan yang benar-benar tersedia

- Mengikuti `HTTP 301/302/303/307/308` sampai 9 hop.
- Membaca `meta refresh`, redirect JavaScript sederhana yang tertulis sebagai URL literal, serta parameter URL redirect yang eksplisit.
- Menampilkan URL akhir dan jejak pengalihan, tombol salin, buka link, history khusus sesi tab.
- Proteksi SSRF dasar: domain internal dan alamat IPv4 privat diblokir, DNS dipin ke alamat IPv4 publik, hanya HTTP(S) dan port 80/443.
- Khusus domain **sfl.gl / safelinku.com / linku.to / lokerwfh.net**, tersedia adapter opsional via Zapi (butuh API key tersendiri). Tanpa kunci, resolver tetap mencoba redirect publik; alur verifikasi khusus bisa gagal.

**Tidak menjanjikan bypass universal.** Tool tidak memecahkan CAPTCHA, memalsukan token, atau membuka konten yang memerlukan login. Jangan menganggap URL yang ditemukan pasti aman. Periksa domain sebelum mengklik.

## Pemasangan di VPS Ubuntu (Node.js 20+)

1. Upload dan ekstrak ZIP ke folder VPS, misal `/root/FELIXIORITY_LINK_BYPASS`.
2. Jalankan:

```bash
cd /root/FELIXIORITY_LINK_BYPASS && npm start
```

3. Buka `http://IP-VPS:3000` jika firewall mengizinkan port tersebut. Disarankan memakai HTTPS melalui Nginx reverse proxy di domain sendiri.

Jalankan di background dengan PM2 (opsional):

```bash
npm install -g pm2
cd /root/FELIXIORITY_LINK_BYPASS
pm2 start server.mjs --name felixiority-link-bypass
pm2 save
```

### Mengatur port

```bash
PORT=4000 node server.mjs
```

### Opsional: integrasi SFL yang lebih lengkap

Menurut dokumentasi publik Zapi, scraper `bypass-tools:safelinku/resolve` menerima URL SFL dan membutuhkan `x-api-key`. Buat API key di https://zapi.ink/ lalu masukkan hanya pada environment backend:

```bash
ZAPI_API_KEY='KUNCI_ANDA' npm start
```

Untuk PM2, isi environment proses lewat sistem deployment atau ecosystem config dan jalankan ulang. **Jangan** menaruh API key pada file `/public/app.js` atau HTML.

Tanpa API key, tool berjalan dengan resolver native. Zapi adalah pihak ketiga: harga, cakupan, dan keberhasilan mengikuti kebijakan/layanan mereka, tidak dijamin.

## Deploy lewat Vercel

1. Impor folder proyek ini sebagai repo Git ke Vercel.
2. Framework Preset: `Other` (tanpa build command).
3. Root Directory: root proyek.
4. Deploy. `public/index.html` dan `api/resolve.mjs` otomatis dilayani.
5. Untuk mode SFL khusus, buka **Project Settings → Environment Variables**, tambah `ZAPI_API_KEY`, lalu redeploy. Bila tidak ingin adapter SFL, env itu boleh kosong.

## Struktur proyek

```text
FELIXIORITY_LINK_BYPASS/
├── public/
│   ├── index.html        # UI
│   ├── styles.css        # Responsive editorial-tech design
│   ├── app.js            # Semua tombol dan interaksi frontend
│   └── favicon.svg
├── api/
│   └── resolve.mjs       # Vercel serverless API
├── lib/
│   └── resolve.mjs       # Resolver + opsi Safelinku adapter
├── tests/
│   └── resolver.test.mjs # Automated tests
├── server.mjs            # Web server VPS
├── vercel.json
├── package.json
└── .env.example
```

## Tes

```bash
npm test
```

## Batasan

- Dibatasi pada URL yang dapat diakses lewat HTTP(S) dan IPv4 publik.
- DNS recheck dan pemblokiran IP privat diterapkan per pengalihan, namun aplikasi publik sebaiknya juga dilindungi dengan rate limit/WAF pada reverse proxy atau Vercel.
- Halaman yang bergantung pada JavaScript dinamis/CAPTCHA/Cloudflare challenge mungkin tak dapat dipecahkan.
- Server akan meminta URL pihak ketiga, jadi alamat IP server terlihat oleh situs tujuan.
- History hanya `sessionStorage` browser (tidak ada database, tidak ada akun).

Created for FELIXIORITY. No purple gradients, no mock success responses.
