# Plan czytania Biblii

Grupowy, długoterminowy plan czytania Biblii. Każda osoba śledzi własny
postęp, zaznacza fragmenty oddzielnie i widzi zaległość lub wyprzedzenie.

## Funkcje

- import własnego planu z CSV;
- harmonogram codzienny, od poniedziałku do piątku albo we własne dni;
- osobne checkboxy dla każdego fragmentu danego dnia;
- procent całego planu oraz zaległość lub wyprzedzenie w dniach;
- przełączanie dni strzałkami i paskiem dat;
- data startu i automatycznie wyliczana data końca planu;
- prosty wykres postępu oraz porównanie postępu osób w grupie;
- jasny i ciemny motyw zapamiętywany w przeglądarce;
- prywatne linki zaproszeń dla kolejnych osób;
- trwały zapis danych w Netlify Blobs;
- lokalny tryb demonstracyjny oparty o `localStorage`.
- instalowalna aplikacja PWA z cache’owaną powłoką interfejsu i obsługą offline.

## Format CSV

Najprostszy wariant:

```csv
Dzień;Stary Testament;Nowy Testament;Psalm
Początek;Rdz 1–3;Mt 1;Ps 1
Obietnica;Rdz 4–6;Mt 2;Ps 2
```

Obsługiwane są separatory `;`, `,` oraz tabulator. Kolumny `Data/Date` i
`Tytuł/Dzień/Title` są rozpoznawane automatycznie. Każda pozostała niepusta
kolumna staje się osobnym fragmentem. Jeśli plan zawiera kolumnę
`Fragmenty/Readings`, wiele fragmentów można rozdzielić znakiem `|`.

Jeżeli każdy wiersz ma datę w formacie `YYYY-MM-DD` lub `DD.MM.YYYY`, aplikacja
użyje dat z pliku. W przeciwnym razie wyliczy daty od wybranego startu i według
wybranej częstotliwości.

## Uruchomienie

```bash
npm install
npm run dev
```

Po wdrożeniu aplikację można zainstalować z menu przeglądarki. Service worker
jest rejestrowany tylko w buildzie produkcyjnym; w trybie deweloperskim pozostaje
wyłączony, żeby nie zakłócać HMR.

Sam Vite używa lokalnego zapisu w przeglądarce. Aby testować dokładnie ten sam
backend co na Netlify:

```bash
npx netlify dev
```

## Testy i build

```bash
npm test
npm run build
```

## Deploy na Netlify

1. Umieść projekt w repozytorium Git.
2. W Netlify wybierz **Add new project → Import an existing project**.
3. Netlify wykryje `netlify.toml`:
   - build: `npm run build`
   - katalog publikacji: `dist`
   - funkcje: `netlify/functions`
4. Uruchom deploy. Nie są wymagane żadne zmienne środowiskowe ani ręczne
   tworzenie bazy.

Netlify automatycznie udostępnia funkcjom poświadczenia do Blobs. Dane planu są
przechowywane między wdrożeniami w store `plan-czytania-biblii-groups`.

## Model dostępu

To pragmatyczny model dla zaufanej, prywatnej grupy:

- identyfikator grupy jest losowym UUID;
- każda osoba ma oddzielny, długi token zapisany wyłącznie jako hash po stronie
  serwera;
- token znajduje się w części `#invite=` linku, więc przeglądarka nie wysyła go
  jako część adresu w żądaniu HTTP;
- osoba z linkiem może zmieniać wyłącznie własny postęp;
- administrator może tworzyć kolejne zaproszenia.

Nazwy osób i zbiorczy postęp są widoczne dla każdego, kto zna niezgadywalny
identyfikator grupy. Dla publicznej aplikacji o większej skali kolejnym krokiem
powinno być logowanie e-mail/OAuth i relacyjna baza danych.
