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
- osobiste powiadomienia push o dzisiejszym czytaniu z wyborem godziny.

## Przypomnienia o czytaniu

W **Ustawienia → Powiadomienia o czytaniu** wybierz godzinę i naciśnij
**Włącz przypomnienia**, a następnie zezwól przeglądarce na powiadomienia.
Godzina jest liczona w zapisanej strefie czasowej urządzenia, z uwzględnieniem
czasu letniego/zimowego. Na drugim urządzeniu włącz przypomnienia osobno.
Możesz zmienić godzinę, wysłać test albo wyłączyć przypomnienia.

Na iOS/iPadOS 16.4+ dodaj aplikację do ekranu początkowego i otwórz z ikony.
Powiadomienia wymagają HTTPS, obsługi Web Push i zgody przeglądarki.
System urządzenia może opóźnić lub wyciszyć powiadomienie.

Funkcja `reading-reminders` sprawdza przypomnienia co minutę. Wysyła wyłącznie
nieukończone fragmenty przypisane do dzisiejszej daty w oryginalnym planie;
lokalne części rozdziałów z trybu nadrabiania nie są synchronizowane z serwerem.
Dni wolne i ukończone dzisiejsze czytanie są pomijane. Jedno urządzenie otrzymuje
najwyżej jedno automatyczne przypomnienie dziennie. Wysyłka ma 15-minutowe okno
ponowienia, a wygasłe subskrypcje są usuwane. Wylogowanie wyłącza przypomnienie
na bieżącym urządzeniu, jeśli serwer jest dostępny.

Netlify uruchamia cron wyłącznie na opublikowanym deployu produkcyjnym.
Na `develop` i preview można sprawdzać zapis ustawień i ręczny test push;
subskrypcje z tych środowisk są wyłączone z produkcyjnego harmonogramu.

Konfiguracja Netlify (scope **Functions**, poza repozytorium):

- `READING_PUSH_VAPID_PUBLIC_KEY` — publiczny klucz VAPID;
- `READING_PUSH_VAPID_PRIVATE_KEY` — tajny klucz VAPID z tej samej pary.

Parę wygeneruj jednorazowo przez `web-push.generateVAPIDKeys()` i zachowaj
między wdrożeniami. Jej zmiana wymaga ponownego włączenia subskrypcji.
Subskrypcje i osobiste ustawienia są przechowywane w prywatnym Netlify Blobs,
osobno od publicznych danych grupy.

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

### Przenoszenie sesji na inne urządzenie

Nowe instalacje mogą odzyskać sesję z bezpiecznego cookie ustawianego po
utworzeniu planu lub dołączeniu do niego. Aby przenieść sesję:

1. Otwórz działający plan na pierwszym urządzeniu.
2. Przejdź do **Ustawienia → Przeniesienie sesji**.
3. Utwórz jednorazowy kod ważny przez 10 minut.
4. Na drugim urządzeniu wybierz **Przenieś sesję z innego urządzenia** i
   zeskanuj kod QR.

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
4. Uruchom deploy. Podstawowy plan nie wymaga zmiennych środowiskowych ani
   ręcznego tworzenia bazy. Dla powiadomień ustaw klucze VAPID opisane powyżej.

Netlify automatycznie udostępnia funkcjom poświadczenia do Blobs. Dane planu są
przechowywane między wdrożeniami w store `plan-czytania-biblii-groups`.

### Workflow produkcja/testy

- `main` jest branchem produkcyjnym i publikuje się pod adresem głównym.
- `develop` służy do testów i publikuje się jako branch deploy przed
  promowaniem zmian na `main`.
- Przed scaleniem zmian uruchom lokalnie `npm test` oraz `npm run build`, a
  następnie sprawdź wdrożenie `develop`.

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

## Plan podstawowy

Przycisk „Użyj planu podstawowego · 365 dni” wybiera plan Roberta Murraya
M’Cheyne’a (Daily Bread, 1842): 4 fragmenty dziennie, Stary Testament raz,
Nowy Testament i Psalmy dwa razy. Wybór ustawia codzienną częstotliwość.
365 dni czytania jest liczonych od wybranej daty startu. Istniejące grupy
nie są migrowane ani nadpisywane.

Źródło harmonogramu: https://github.com/khornberg/readingplans/blob/master/mcheyne.json
Opis planu: https://www.mcheyne.app/
Nazwy ksiąg dostosowano do polskich skrótów. Plik do pobrania: `/plan-podstawowy.csv`.
Stary adres `/plan-przykladowy.csv` pozostaje zgodny i udostępnia ten sam roczny plan.
