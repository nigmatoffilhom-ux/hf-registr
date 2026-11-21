# Shaxsiy HyperFrames registri

Bu registr HTML bloklarni HyperFrames `hyperframes add` formatida tarqatadi. `gen.py` manbadagi `BLOKLAR` ta'riflarini o'qib, kerakli runtime fayllarni `blocks/<nom>/` ichiga nusxalaydi. Asl `_effektlar/` fayllari tahrir qilinmaydi.

## Ulash (HyperFrames loyihasida)

Loyiha ildizidagi `hyperframes.json` da `registry` ni shu repoga yo'naltiring (HyperFrames faqat HTTPS registr qabul qiladi):

```json
{
  "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
  "registry": "https://raw.githubusercontent.com/nigmatoffilhom-ux/hf-registr/main",
  "paths": { "blocks": "compositions", "components": "compositions/components", "assets": "assets" }
}
```

Keyin:

```bash
npx hyperframes catalog
npx hyperframes add lower-third
```

CLI bergan snippet'ni `index.html` ga qo'ying. `data-composition-id` manifest nomi emas, blok ichidagi haqiqiy `fx-*` ID bo'ladi.

## Qayta yaratish (`gen.py`)

`gen.py` muallifning lokal `_effektlar/ulash.py` (blok ta'riflari) va manba papkalariga tayanadi; ular bu repoda yo'q, shu sabab `gen.py` faqat muallif mashinasida ishlaydi. Boshqalar uchun u namuna sifatida qoldirilgan. `--homepage` bilan registr homepage qiymati almashtiriladi.

## Kiritilgan bloklar

`ulash.py --royxat` dagi 23 ta HTML blokning hozir manbasi topildi va registrga kiritildi:

`subtitr-3d`, `subtitr-kinetik`, `sarlavha-3d`, `sarlavha-kinetik`, `lower-third`, `ai-belgi`, `ikonka`, `3d-mini`, `wire-neon`, `zarra-morf`, `exploded-view`, `kamera-yol`, `halftone-reveal`, `ui-mockup`, `uslub-sahna`, `formula`, `hud-panel`, `bob-shablon`, `cta-kalit`, `pop-subtitr`, `geo`, `maska-blok`, `shader`.

`otishlar`, `animatsiya`, `kadrlash`, `fx-qatlam`, `olchagich`, `rang-tungi`, `maska`, `shader-lib` va `harakat-blur` — `ulash.py` dagi yordamchi kutubxona yoki root atributlari; ular mustaqil HTML blok emasligi sabab alohida `add` elementi qilinmadi. Bloklarning o'ziga kerak bo'lgan runtime fayllar esa manifest fayllar ro'yxatiga kiritilgan.

## Uchinchi tomon kodi va litsenziyalar

- three.js r160 (+ GLTFLoader, RoundedBoxGeometry, RoomEnvironment), `vendor/m3-three.js` — MIT, `LICENSE-three.txt` blok bilan birga.
- KaTeX (JS, CSS, shriftlar `KaTeX_*.woff2`) — MIT, `KATEX-LICENSE.txt` blok bilan birga.
- Ikonkalar: Lucide (ISC) va Tabler Icons (MIT) — `ikonkalar/LICENSE.md`. Brend ikonkalari (Telegram, YouTube, Instagram) tovar belgisi egalariga tegishli.
- `shader/lut/*.cube` LUT fayllari — o'zimiz yasagan, CC0.
- `uslub-sahna` namunasi GSAP 3.14.2 ni jsDelivr CDN'dan yuklaydi (kodi repoda yo'q).
- `3d-mini` namuna fayllari (`namuna-konus.glb`, `namuna-ekran.mp4`) — oddiy konus modeli va test-naqsh videosi.
- Qolgan blok kodi — shu repo muallifiniki.

## Rasmiy sxema namunasi

- [Rasmiy registry.json](https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/registry.json)
- [Registry sxemasi](https://raw.githubusercontent.com/heygen-com/hyperframes/main/docs/schema/registry.json)
- [Item manifest sxemasi](https://raw.githubusercontent.com/heygen-com/hyperframes/main/docs/schema/registry-item.json)
