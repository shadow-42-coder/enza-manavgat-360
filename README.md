# enza HOME Manavgat — 360° Sanal Mağaza Turu

enza HOME Manavgat mağazasının 360° sanal turu. [Marzipano](https://www.marzipano.net) ile
oluşturulmuş, `docs/` klasöründe barındırılan statik bir web uygulamasıdır.

- **Canlı site:** GitHub Pages üzerinden yayınlandıktan sonra
  `https://shadow-42-coder.github.io/enza-manavgat-360/` adresinde olacak.
- **İçerik:** 20 sahne, mağazanın zemin katındaki oturma grubu / yatak odası / yemek odası
  vitrinleri, Cafenza kafe köşesi, enza HOME danışma alanı ve dış cephe.

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

`index.html` içinde `style.css`, `data.js`, `index.js` dosyaları `?v=3` gibi bir sürüm
numarasıyla yükleniyor. Bu dosyalardan birini değiştirdiğinizde (siz veya Claude), tarayıcı
önbelleğinin ziyaretçilere eski içerik göstermemesi için `index.html`'deki üçünün de sürüm
numarasını bir artırın.

## Düzenleme

- `docs/data.js` — sahne isimleri ve sahneler arası geçiş (hotspot) tanımları. Hotspot
  `yaw`/`pitch`/`rotation`/`target` değerleri gerçek fotoğraflara göre kalibre edilmiştir,
  değiştirmeyin.
- `docs/index.html`, `docs/style.css` — marka/görsel düzen, iletişim linkleri (Instagram,
  telefon, Google Haritalar).
- `docs/img/logo.svg` — enza HOME logosu (gerçek mağaza tabelasından örneklenen renklerle).

## Google Street View

Aynı 360 fotoğrafların Google Maps'te Street View benzeri şekilde yayınlanması için
`street-view-kit/` klasörüne (bu repo dışında, `C:\Users\USER\Desktop\360-streetview-ready`)
bakın — orada Google'ın tanıması için hazırlanmış fotoğraflar ve adım adım yayınlama rehberi
bulunur.

## Lisans

Marzipano ve kullandığı yardımcı kütüphaneler Apache License 2.0 ile lisanslıdır, bkz.
`LICENSE.txt`.
