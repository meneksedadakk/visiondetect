# VisionGuard

VisionGuard, fotoğraf ve canli kamera goruntulerinde nesne algilayan YOLO tabanli
bir analiz uygulamasidir. Gercek YOLO inference yapan FastAPI backend ile
sonuclari Canvas uzerinde gosteren Next.js arayuzunden olusur.

## Mimari

```text
HTTP istegi
  -> FastAPI (MIME, boyut, confidence dogrulamasi)
  -> OpenCV (goruntuyu BGR matrisine decode etme)
  -> UltralyticsModelService (model yukleme + YOLO inference)
  -> Pydantic response (JSON detection koordinatlari)
  -> Next.js (sonuc ve durum yonetimi)
  -> HTML Canvas (olceklenmis bounding box cizimi)
```

Canli kamera akisinda frontend JPEG frame uretir, WebSocket uzerinden backend'e
gonderir ve detection JSON'unu bekler. Cevap gelmeden yeni frame gonderilmez;
bu nedenle model yavaslasa bile istemci tarafinda gereksiz frame kuyrugu birikmez.

Model servisi HTTP katmanindan ayridir. Bu sayede unit/integration testleri gercek
modeli her seferinde yuklemez; testler ayni arayuze sahip hafif bir sahte servis
kullanir. Gercek servis modeli ilk `/api/classes` veya inference isteginde tembel
olarak yukler. Cihaz secimi CUDA, Apple MPS, sonra CPU sirasindadir. GPU/MPS
inference'i hata verirse ayni istek CPU'da bir kez daha denenir.

## Dizin yapisi

```text
.
├── backend/
│   └── app/
│       ├── main.py                 # FastAPI uygulamasi ve endpointler
│       ├── config.py               # VISIONGUARD_* ortam ayarlari
│       ├── image_utils.py          # OpenCV decode ve piksel limiti
│       ├── schemas.py              # Pydantic API semalari
│       └── services/
│           └── model_service.py    # YOLO, cihaz secimi ve sonuc donusumu
├── tests/                          # Model mock'lu API ve decode testleri
├── frontend/
│   ├── src/app/                    # Next.js sayfa, metadata ve genel stiller
│   ├── src/components/             # Fotoğraf/camera paneli ve detection canvas
│   ├── src/lib/                    # API, canvas geometrisi ve frame akisi
│   └── src/types/                  # Backend JSON tipleri
├── main.py                         # uvicorn main:app giris noktasi
├── requirements.txt
└── requirements-dev.txt
```

Projenin nihai kapsami fotoğraf ve canli kamera analizidir. Kontrol bolgesi,
olay gecmisi, dashboard, veritabani ve kullanici takibi bulunmaz.

## Kurulum

Python 3.9 veya daha yeni bir surum gerekir.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
cp .env.example .env

cd frontend
npm install
cp .env.example .env.local
cd ..
```

Varsayilan model `yolo11n.pt`'dir. Ultralytics agirlik dosyasini ilk kullanimda
indirir. Baska bir pretrained model adi veya yerel model kullanmak icin `.env`
icindeki `VISIONGUARD_MODEL_NAME` ya da `VISIONGUARD_MODEL_PATH` degerini
degistirin. Uretim/lisanslama oncesinde Ultralytics'in guncel lisans kosullarini
ayrica degerlendirin.

## Calistirma

Backend icin birinci terminal:

```bash
source .venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Swagger arayuzu: <http://127.0.0.1:8000/docs>

Frontend icin ikinci terminal:

```bash
cd frontend
npm run dev -- --hostname 127.0.0.1
```

Analiz arayuzu: <http://127.0.0.1:3000>

Kamera erisimi tarayicida yalnizca guvenli baglamlarda calisir. Yerel gelistirmede
`http://127.0.0.1:3000` ve `http://localhost:3000` guvenli kabul edilir.

## API ornekleri

```bash
curl http://127.0.0.1:8000/api/health

curl http://127.0.0.1:8000/api/model

curl http://127.0.0.1:8000/api/classes

curl -X POST http://127.0.0.1:8000/api/detections/image \
  -F 'file=@/absolute/path/to/photo.jpg;type=image/jpeg' \
  -F 'confidence=0.35' \
  -F 'classes=person,car'
```

`classes` alani verilmezse modelin tum siniflari kullanilir. Kabul edilen dosya
tipleri JPEG ve PNG, confidence araligi `0.01–1.0`, varsayilan dosya boyutu siniri
10 MiB ve cozulmus goruntu siniri 25 milyon pikseldir.

## Testler

Backend testleri model servisini mock eder:

```bash
pytest
```

Frontend unit testleri, lint ve production build:

```bash
cd frontend
npm test
npm run lint
npm run build
```

Canvas testleri, backend'in orijinal goruntu koordinatlarinin ekrandaki
`object-fit: contain` alanina dogru olceklenmesini kontrol eder.

Manuel gercek model testi (sunucu calisirken) icin yukaridaki fotoğraf `curl`
komutunu gercek bir JPEG ile calistirin. Ilk istek model indirmesi nedeniyle daha
uzun surebilir. Model durumunu sonra tekrar kontrol edebilirsiniz:

```bash
curl http://127.0.0.1:8000/api/model
```

## Kullanilabilir ozellikler

- `GET /api/health`: Uygulama ayakta mi? Modeli yuklemez.
- `GET /api/model`: Model adi, secilen cihaz ve yuklenme durumu.
- `GET /api/classes`: Modelin destekledigi siniflar. Ilk cagri modeli yukleyebilir.
- `POST /api/detections/image`: JPEG/PNG uzerinde gercek YOLO inference.
- `WS /api/detections/stream`: Binary JPEG frame alip detection JSON'u dondurur.
- Fotoğraf secme veya surukleyip birakma.
- Confidence slider ve aranabilir COCO sinif filtreleri.
- Loading, bos durum, baglanti ve API hata durumlari.
- Responsive Canvas uzerinde sinif, guven orani ve bounding box gosterimi.
- Toplam nesne, inference suresi ve sinif bazli sonuc sayimi.
- Tarayici `getUserMedia` API'siyle kamera acma ve kapatma.
- 1/3/5 hedef FPS secimi ve gercek sonuc FPS gostergesi.
- Tek frame bekleme kapisi, 15 saniye cevap timeout'u ve kopma hata durumu.
- Canli video uzerinde responsive Canvas bounding box katmani.

Canli kamera manuel testi:

1. Backend ve frontend'i iki terminalde calistirin.
2. Analiz ekraninda **Canli kamera** sekmesine gecin.
3. **Kamerayi ac** dugmesine basin ve tarayici iznini verin.
4. Confidence/sinif/FPS secimini yapip **Izlemeyi baslat** dugmesine basin.
5. FPS, inference suresi, nesne sayisi ve kutularin guncellendigini kontrol edin.

## Kapsam disi

Bu surum tamamlanmis analiz araci olarak korunacaktir. Kontrol bolgesi, olay
kaydi/gecmisi, dashboard, PostgreSQL ve kimlik/yuz tanima ozellikleri planlanan
kapsamdan cikarilmistir.
