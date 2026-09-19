# Space Swarm — ROJ

3D space game built with Three.js. Swarm of ships eats planets, suns, comets, meteoroids for points; avoid black holes.

Play: https://michalstankiewicz4-cell.github.io/Space/

## Struktura projektu

Zwykła statyczna strona — bez kroku budowania, bez npm. `index.html` to
cienki szkielet (DOM + CSS), cała logika jest w natywnych modułach ES pod
`js/`, ładowanych przez `<script type="module" src="js/main.js">`:

```
css/style.css        style gry (HUD, drzewko ulepszeń, banner startowy)
js/
  config.js          stałe dostrajające rozgrywkę (drzewko ulepszeń, promienie, interwały sieciowe)
  i18n.js            teksty UI (domyślnie EN, przełącznik na PL — patrz banner startowy)
  env.js             adres i klucz Supabase (anon key — bezpieczny do commitowania, patrz niżej)
  supabaseClient.js  singleton klienta Supabase
  core/              współdzielony stan gry (scena/kolekcje bytów, punkty gracza) + drobne narzędzia
  scene/             kamera, renderer, sterowanie myszką/zaznaczanie
  world/             logika ciał niebieskich (mesh/tekstury/animacja) — dane per-typ w js/bodies/
  bodies/            7 typów ciał, każdy w osobnym pliku (sun.js, icePlanet.js, neutralPlanet.js,
                     volcanicPlanet.js, comet.js, meteoroid.js, blackhole.js) — patrz "Edytor obiektów" niżej
  content.js         zbiera pliki z js/bodies/ w jedno miejsce, z którego czyta gra i edytor
  fx/                cząsteczki, odłamki, fala uderzeniowa, pył — efekty rozpadu planety
  ships/             rój statków gracza (ruch, zjadanie, promień-piorun)
  ui/                HUD (telemetria, licznik graczy) i dok z drzewkiem ulepszeń
  net/               multiplayer: tożsamość, wybór "stewarda", synchronizacja świata, transmisja statków
  main.js            punkt wejścia — spina moduły i uruchamia pętlę gry
supabase/schema.sql  schemat bazy (tabele, RLS, funkcje RPC) do wklejenia w Supabase SQL Editor
```

Dodanie nowej mechaniki (np. kolejny typ ulepszenia, nowy rodzaj ciała
niebieskiego) zwykle oznacza edycję jednego pliku w odpowiednim folderze,
bez dotykania reszty.

## Edytor obiektów

[`editor.html`](editor.html) to osobne narzędzie deweloperskie (nie link z
poziomu gry) do dostrajania wyglądu proceduralnie generowanych ciał —
osobna zakładka i suwak na każdy parametr dla każdego z 7 typów w
[`js/bodies/`](js/bodies), z podglądem 3D na żywo. Podgląd korzysta z tych
samych funkcji co gra, więc to co widać w edytorze wygląda identycznie w
rozgrywce.

Ponieważ strona nie ma backendu, przycisk "Download" ściąga plik tekstowy
z gotowymi do wklejenia blokami `export const ... = {...}` — po jednym na
każdy plik w `js/bodies/`, które trzeba ręcznie podmienić w repo.

## Multiplayer / Supabase setup

Świat (planety, komety, słońca, meteoryty, czarne dziury) i statki innych
graczy są współdzielone na żywo przez [Supabase](https://supabase.com), bez
żadnego logowania (niewidoczna sesja anonimowa). Punkty i poziomy ulepszeń
zostają lokalne w przeglądarce (`localStorage`), jak wcześniej.

Żeby uruchomić własną instancję:

1. Załóż darmowy projekt na [supabase.com](https://supabase.com).
2. W **SQL Editor** wklej i uruchom zawartość [`supabase/schema.sql`](supabase/schema.sql).
3. **Authentication → Sign In / Providers** → włącz **Anonymous Sign-ins**.
4. **Database → Replication** → włącz Realtime dla tabeli `bodies`
   (insert / update / delete).
5. **Project Settings → API** → skopiuj **Project URL** i **anon public key**
   i wklej je w [`js/env.js`](js/env.js) w stałych `SUPABASE_URL` / `SUPABASE_ANON_KEY`
   (albo ustaw `window.ROJ_ENV = {SUPABASE_URL, SUPABASE_ANON_KEY}` przed
   załadowaniem gry, żeby wskazać na inny projekt bez edytowania pliku).

Anon key jest z założenia publiczny (bezpieczeństwo zapewniają reguły RLS
zdefiniowane w `schema.sql`), więc można go bezpiecznie trzymać w kodzie
statycznej strony na GitHub Pages.
