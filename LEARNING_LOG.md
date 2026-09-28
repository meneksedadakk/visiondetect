# Learning Log

Bu dosya yalnizca gelistirme sirasinda gercekten karsilasilan sorunlari kaydeder.

## 2026-09-27 — Workspace disinda dosya arama izni

- **Deneme:** Ust dizinden `AGENTS.md` aramak icin `find ..` calistirildi.
- **Hata:** macOS, kullanici kutuphanelerindeki bazi dizinler icin `Operation not permitted` dondurdu.
- **Neden:** Arama proje kapsamindan daha genisti ve korumali macOS klasorlerine girdi.
- **Cozum:** Proje calismasi `/Users/mehmet.eker/yolo` ile sinirlandi. Bu hata proje dosyalarini etkilemedi.

## 2026-09-27 — Gelistirme bagimliliklari kurulu degildi

- **Tespit:** Sistem Python 3.9.6 ortaminda FastAPI, Ultralytics, OpenCV ve pytest bulunamadi; Docker CLI da kurulu degildi.
- **Cozum:** Tekrarlanabilir kurulum icin `requirements.txt` ve `requirements-dev.txt` eklendi. Docker, Milestone 6 konusu oldugu icin bu milestone'da kurulmaya calisilmadi.

## 2026-09-27 — Python bytecode onbellegi yazma izni

- **Deneme:** Sistem Python'u ile `compileall` kullanilarak ilk sozdizimi kontrolu yapildi.
- **Hata:** Python, bytecode onbellegini macOS'un korumali `~/Library/Caches` dizinine yazmak istedi ve `PermissionError` aldi.
- **Cozum:** Kontrol komutunda `PYTHONPYCACHEPREFIX` proje icindeki `.pycache` dizinine yonlendirildi. Bu bir kod sozdizimi hatasi degildi.

## 2026-09-27 — Sandbox icinden PyPI erisimi

- **Deneme:** Sanal ortam olusturulduktan sonra gelistirme bagimliliklari normal sandbox ag erisimiyle kurulmak istendi.
- **Hata:** `pip`, PyPI alan adini cozemedi ve uygun FastAPI surumu bulamadigini bildirdi.
- **Neden:** Komutun ag erisimi sandbox tarafindan sinirliydi; paket surumu gercekte eksik degildi.
- **Cozum:** Kullanici onayli ag erisimiyle komut yeniden calistirildi ve bagimliliklar basariyla kuruldu. `pip check` bozuk bagimlilik bildirmedi.

## 2026-09-27 — Eski HTTP 413 sabiti uyarisi

- **Tespit:** Ilk test kosusunda 11 test gecti ancak Starlette, `HTTP_413_REQUEST_ENTITY_TOO_LARGE` adinin kullanimi icin deprecation uyarisi verdi.
- **Cozum:** Ayni durum kodunun guncel adi olan `HTTP_413_CONTENT_TOO_LARGE` kullanildi ve testler yeniden calistirildi.

## 2026-09-27 — Ilk gercek model smoke testinde 503

- **Deneme:** Mock kullanmayan API istegiyle `yolo11n.pt` uzerinde ilk gercek inference calistirildi.
- **Hata:** Sandbox model agirligini indiremedi; Ultralytics ve Matplotlib de varsayilan kullanici cache dizinlerine yazamadi. Endpoint beklenen hata yonetimiyle `503` dondurdu.
- **Cozum:** Cache dizinleri yazilabilir `/tmp` altina yonlendirildi ve kullanici onayli ag erisimi kullanildi. Model indirildi; ayni endpoint MPS cihazinda `200` ve gecerli JSON sozlesmesi dondurdu.

## 2026-09-27 — Confidence yuvarlama testi

- **Hata:** Model sonuc donusumu icin eklenen unit test `0.912345` degerinin kesin olarak `0.91235` olmasini bekledi; Python sonucu `0.91234` verdi.
- **Neden:** Ondalik sayilar ikili kayan nokta olarak tam temsil edilemez ve `round` esitlik durumlarinda en yakin cift rakama yuvarlama davranisi kullanir.
- **Cozum:** Uretim kodundaki gecerli bes ondalik hassasiyet korunarak test toleransli `pytest.approx` karsilastirmasina cevrildi.

## 2026-09-28 — Next.js gelistirme sunucusu port izni

- **Deneme:** Milestone 2 ilk onizlemesi normal sandbox icinde `npm run dev` ile baslatildi.
- **Hata:** Sunucu `0.0.0.0:3000` adresini dinlerken `listen EPERM` hatasi aldi.
- **Cozum:** Gelistirme sunucusu kullanici onayli calistirma ile yalnizca `127.0.0.1:3000` adresine baglandi ve ana sayfa `200` dondurdu.

## 2026-09-28 — Vitest ve Node tipleri peer dependency uyusmazligi

- **Deneme:** Guncel Vitest, Next.js iskeletinin varsayilan `@types/node@20` paketiyle kurulmak istendi.
- **Hata:** Vitest 5, `@types/node` icin Node 22 veya daha yeni surum istedigi icin npm `ERESOLVE` dondurdu.
- **Cozum:** `--force` kullanilmadi. Makinedeki Node 26 ile uyumlu `@types/node@26` kuruldu; Vitest kurulumu daha sonra basariyla tamamlandi.

## 2026-09-28 — Turbopack production build port hatasi

- **Deneme:** Next.js 16 varsayilan Turbopack derleyicisiyle `npm run build` hem sandbox icinde hem de izinli calistirmada denendi.
- **Hata:** CSS isleme alt sureci yerel bir porta baglanmaya calisirken iki denemede de `Operation not permitted` hatasi verdi ve Turbopack panic raporu olusturdu.
- **Cozum:** Next.js'in destekledigi Webpack build modu `next build --webpack` kullanildi. Gelistirme sunucusundaki hizli Turbopack akisi degistirilmedi.

## 2026-09-28 — Backend portu zaten kullanimdaydi

- **Deneme:** Frontend-backend entegrasyonu icin yeni bir Uvicorn sureci `127.0.0.1:8000` adresinde baslatildi.
- **Hata:** Portta zaten calisan bir FastAPI sureci oldugu icin `address already in use` hatasi alindi.
- **Cozum:** Mevcut surece dokunulmadi. Health, model, 80 COCO sinifi, CORS preflight ve gercek fotoğraf inference kontrolleri bu calisan surec uzerinden basariyla tamamlandi.

## 2026-09-28 — Frontend scaffold otomatik commit olusturdu

- **Tespit:** `create-next-app`, `frontend/` icinde otomatik olarak ayri bir Git deposu baslatip ilk scaffold commit'ini olusturmustu.
- **Neden:** Bu aracın varsayilan davranisidir ancak proje talebi kullanici onayi olmadan commit atilmamasini istiyor.
- **Cozum:** Kaynak dosyalara dokunulmadan sadece otomatik olusturulan `frontend/.git` metadata'si geri alinabilir olarak `/tmp/visionguard-frontend-git-20260928` konumuna tasindi. Milestone degisiklikleri commit edilmedi.

## 2026-09-28 — Ilk WebSocket smoke testinde baglanti reddi

- **Deneme:** Milestone 3 WebSocket endpoint'ine gercek `bus.jpg` frame'i gonderildi.
- **Hata:** Daha once 8000 portunda calisan backend sureci kapanmis oldugu icin `ConnectionRefusedError` alindi.
- **Cozum:** Guncel FastAPI uygulamasi yeniden baslatildi. Ayni test izinli frontend origin'iyle tekrarlandi; 810×1080 frame icin `bus` ve `person` siniflarinda 5 detection donduruldu.

## 2026-09-28 — Hizli WebSocket yeniden baslatma yaris kosulu

- **Tespit:** Son kod incelemesinde, kullanici izlemeyi durdurup hemen yeniden baslatirsa eski socket'in gec gelen `open`, `message` veya `close` olayi yeni socket'in ortak durumunu degistirebilirdi.
- **Cozum:** Tum socket callback'leri olayi ureten socket'in hala aktif socket oldugunu denetleyecek sekilde korundu. Gec tamamlanan kamera izni ve JPEG donusumu icin de component/socket yasam dongusu kontrolleri eklendi.
