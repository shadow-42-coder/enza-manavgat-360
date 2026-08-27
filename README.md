# enza HOME Manavgat — Şirket Sitesi + 360° Sanal Mağaza Turu

enza HOME Manavgat'ın çok sayfalı şirket sitesi. `docs/` klasöründe barındırılan, build adımı
olmayan statik bir web sitesidir.

- **Canlı site:** `https://shadow-42-coder.github.io/enza-manavgat-360/`
- **Sayfalar:**
  - `index.html` — Ana Sayfa (giriş noktası)
  - `tur.html` — [Marzipano](https://www.marzipano.net) ile oluşturulmuş 360° sanal tur (20 sahne)
  - `portfolyo.html` — müşteri evlerine hazırlanan render/tasarım galerisi
  - `blog.html` — mobilya/dekorasyon yazıları (liste + `?slug=...` ile tekil yazı)
  - `kampanyalar.html` — güncel kampanya/duyurular
  - `hakkimizda.html` — hakkımızda + iletişim bilgileri + harita + WhatsApp'a giden iletişim formu
  - `sss.html` — sıkça sorulan sorular
  - `gizlilik.html` — gizlilik politikası
  - `404.html` — bulunamayan sayfalar için
- **Admin panel:** `tur.html?pos=1` üzerinden giriş yapılır, tur içeriğinin yanı sıra Blog,
  Portfolyo, Kampanyalar ve Yorumlar (testimonials) da buradan yönetilir; Ana Sayfa/Hakkımızda
  metinleri ve iletişim bilgileri "Ayarlar" altındaki Site İçeriği bölümünden düzenlenir —
  "Şimdi Yayınla" ile GitHub'a doğrudan commit edilir (bkz. `docs/publish.js`).

## GitHub Pages ile yayınlama (GitHub Desktop)

1. Bu klasörü GitHub Desktop'a ekleyin: **File → Add local repository**.
2. **Publish repository** ile `shadow-42-coder` hesabınıza gönderin (repo adı örn. `enza-manavgat-360`).
3. GitHub üzerinde reponun **Settings → Pages** sayfasına gidin.
4. **Build and deployment → Source: Deploy from a branch** seçin, branch olarak `main`,
   klasör olarak `/docs` seçip kaydedin.
5. Birkaç dakika içinde site `https://<kullanıcı-adınız>.github.io/<repo-adı>/` adresinde
   yayında olacaktır. Bu linki Instagram bio'ya ekleyebilirsiniz.

Kendi domaininizi bağlamak isterseniz aynı Pages ayarlarından bir "Custom domain" tanımlayıp
domain sağlayıcınızda bir `CNAME` kaydı oluşturmanız yeterli.

## Yerelde önizleme

Tarayıcılar `file://` üzerinden Marzipano'yu düzgün çalıştırmadığı için basit bir sunucu
gerekir:

```
cd docs
python -m http.server 8080
```

sonra `http://localhost:8080` adresini açın.

## Önbellek

Her sayfa `style.css`, `data.js`, `index.js`, `publish.js`, `site-pages.js` dosyalarını
`?v=N` gibi bir sürüm numarasıyla yüklüyor. Bu dosyalardan birini değiştirdiğinizde (siz veya
Claude), tarayıcı önbelleğinin ziyaretçilere eski içerik göstermemesi için **o dosyayı
kullanan her sayfadaki** sürüm numarasını bir artırın (hepsi aynı numarada olmak zorunda
değil, ama tutarlı tutmak takip kolaylığı sağlar).

## Düzenleme

- `docs/data.js` — sahne isimleri, sahneler arası geçiş (hotspot) tanımları, ve Blog/Portfolyo/
  Kampanyalar içerikleri (`blogPosts`/`portfolioItems`/`campaigns` dizileri — admin panelden
  "Şimdi Yayınla" ile buraya yazılır, elle düzenlemeye gerek yok). Sahne hotspot
  `yaw`/`pitch`/`rotation`/`target` değerleri gerçek fotoğraflara göre kalibre edilmiştir,
  değiştirmeyin.
- `docs/publish.js` — admin panelin "Şimdi Yayınla" butonunun kullandığı GitHub Contents API
  entegrasyonu. `HTML_PATH` sabiti `docs/tur.html`'i gösterir (Ana Sayfa değil) — turun kendi
  iletişim bilgisi/sahne sırası gibi değişiklikleri hep oraya yazılır.
- `docs/index.js` — tur motoru + admin panelin tamamı (~7000 satır).
- `docs/site-pages.js` — Ana Sayfa/Blog/Portfolyo/Kampanyalar/Hakkımızda sayfalarının
  `data.js`'ten okuyup ekrana bastığı, `index.js`'ten bağımsız küçük script.
- `docs/style.css` — hem tur/admin panelin hem de yeni sayfaların ortak marka renkleri
  (`--brand-*`/`--admin-*` CSS değişkenleri) ve stilleri.
- `docs/img/logo.svg` — enza HOME logosu (gerçek mağaza tabelasından örneklenen renklerle).

### `seed-` önekli örnek içerikler

`data.js`'teki `blogPosts`/`portfolioItems`/`campaigns` içinde `id`'si `seed-` ile başlayan
kayıtlar, admin panel ilk açıldığında boş görünmesin diye eklenmiş örnek içeriklerdir
(gerçek görsel yerine geçici olarak `img/og-image.jpg` kullanılıyor). İsterseniz admin
panelden düzenleyip gerçek içerikle değiştirin, isterseniz silin.

## Google Street View

Aynı 360 fotoğrafların Google Maps'te Street View benzeri şekilde yayınlanması için
`street-view-kit/` klasörüne (bu repo dışında, `C:\Users\USER\Desktop\360-streetview-ready`)
bakın — orada Google'ın tanıması için hazırlanmış fotoğraflar ve adım adım yayınlama rehberi
bulunur.

## Lisans

Marzipano ve kullandığı yardımcı kütüphaneler Apache License 2.0 ile lisanslıdır, bkz.
`LICENSE.txt`.
