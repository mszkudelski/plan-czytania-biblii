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

W **Ustawienia → Powiadomienia o czytaniu** widzisz tylko aktualny krok.
Na iPhonie i iPadzie przed instalacją zobaczysz prośbę o dodanie aplikacji do
ekranu głównego i rozwijaną instrukcję. Godzina i zgoda pojawią się dopiero
po otwarciu aplikacji z ikony. Przy zablokowanej zgodzie widzisz tylko pomoc
w jej przywróceniu i przycisk ponownego sprawdzenia. Na komputerze możesz
od razu wybrać godzinę, bez instalacji aplikacji.
Godzina jest liczona w zapisanej strefie czasowej urządzenia, z uwzględnieniem
czasu letniego/zimowego. Na drugim urządzeniu włącz przypomnienia osobno.
Po włączeniu możesz rozwinąć zmianę godziny albo wyłączyć przypomnienia.
Narzędzia testowe są schowane w rozwijanej sekcji tylko poza produkcją;
produkcyjny build i konfiguracja produkcyjna wykluczają przycisk testu.

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

### Profil i odzyskiwanie dostępu

Imię jest nazwą wyświetlaną w grupie. Każde dołączenie przez zaproszenie
tworzy nowy profil (`memberId`) z własnym postępem, nawet przy takim samym
imieniu jak istniejąca osoba lub administrator. Nie przywraca wcześniejszego
profilu ani jego uprawnień. Istniejące profile, tokeny i postęp pozostają ważne.

Po utracie dostępu poproś administratora swojej grupy o pomoc. W **Grupa →
Zarządzaj** przy Twoim profilu wybiera **Przywróć dostęp → Utwórz link dostępu**.
Przekazuje Ci link lub QR ważny przez 10 minut. Link otwiera ekran potwierdzenia;
po wybraniu **Przywróć mój dostęp** wracasz do tego samego profilu, roli i postępu.
Możesz też wkleić link lub krótki kod na stronie startowej w **Odzyskaj dostęp
do mojego planu → Mam link lub kod od administratora**. Nie musisz wcześniej
zapisywać żadnego kodu ani podawać e-maila. Kod jest jednorazowy, a serwer
przechowuje tylko jego hash. Nie działa po usunięciu osoby lub odebraniu
uprawnień administratorowi, który go wystawił. Dostęp innych urządzeń zostaje.

Administrator może nadać tę rolę zaufanej osobie w **Grupa → Zarządzaj → Nadaj
rolę administratora**. Zmiana wymaga potwierdzenia i nie zmienia profilu ani
postępu. Drugi administrator może przywrócić dostęp również twórcy grupy.
Nie można odebrać roli ostatniemu administratorowi; administratora można usunąć
dopiero po odebraniu mu roli. Administratorzy mogą zapraszać osoby, zarządzać
rolami i przywracać profile — nadawaj tę rolę osobom, którym ufasz. Samotny
administrator powinien wyznaczyć drugą osobę lub połączyć inne urządzenie.

Zmiany członków, ról i tokenów są zapisywane jako kolejne, niezmienne wersje
metadanych grupy w Netlify Blobs. Równoczesne żądania zajmują osobne wersje
i ponownie sprawdzają uprawnienia, zamiast nadpisywać całą grupę. Istniejący
zapis jest punktem wyjścia, więc profile i postęp nie wymagają migracji.
Jednorazowe kody mają osobny, niezmienny znacznik użycia.

Osobiste kody awaryjne są na razie ukryte w interfejsie. Ustawienia i ekran
odzyskiwania prowadzą do pomocy administratora grupy lub połączenia urządzeń.
Istniejące dane kodów oraz API pozostają dostępne dla zgodności ze starszymi
wersjami aplikacji; ukrycie opcji nie unieważnia kodów ani tokenów urządzeń.
Serwer nadal przechowuje wyłącznie SHA-256 kodu w osobnym, prywatnym store
`plan-czytania-biblii-recovery`. Usuniętej osoby nie można odzyskać kodem.

Sesja może też wrócić z bezpiecznego cookie po utracie samego lokalnego zapisu.
Wylogowanie usuwa lokalny dostęp i cookie na tym urządzeniu. Samo imię lub
zaproszenie nie przywraca profilu; w aplikacji potrzebny jest link od administratora
albo dostęp na innym urządzeniu. Bez żadnej z tych
możliwości odzyskanie profilu nie jest możliwe.

### Łączenie urządzeń

Gdy masz dostęp na pierwszym urządzeniu:

1. Otwórz działający plan na pierwszym urządzeniu.
2. Przejdź do **Ustawienia → Połącz inne urządzenie**.
3. Utwórz jednorazowy kod ważny przez 10 minut.
4. Na drugim urządzeniu wybierz **Mam już plan na innym urządzeniu → połącz
   urządzenie** i zeskanuj kod QR lub wpisz kod połączenia.

Oba urządzenia mają dostęp do tego samego profilu. Kod połączenia jest
jednorazowy i krótkotrwały. Łączenie urządzeń oraz link od administratora
nie wymagają wcześniejszego zapisywania osobistego kodu.

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
- token urządzenia jest przypisany do `memberId`, a nie imienia; jest zapisany
  w przeglądarce i bezpiecznym cookie sesji;
- token zaproszenia znajduje się w części `#join=` linku, więc przeglądarka
  nie wysyła go jako część adresu w żądaniu HTTP;
- link zaproszenia daje możliwość utworzenia własnego profilu;
- token urządzenia lub kod odzyskiwania daje dostęp wyłącznie do przypisanego
  profilu, wraz z jego rolą; kod odzyskiwania ma 160 bitów losowości;
- administrator może tworzyć kolejne zaproszenia, nadawać role i wystawiać
  jednorazowy dostęp do konkretnego istniejącego profilu.

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

