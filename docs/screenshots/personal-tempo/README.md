# Osobiste dni czytania (#28)

Rzeczywista aplikacja uruchomiona lokalnie w Chromium: desktop 1440×1000,
mobile 390×844, pl-PL, Europe/Warsaw. Syntetyczny plan z trzema pulami po 12
rozdziałów, profil demonstracyjny. Stan „pending” to jawnie zasiany lokalny
fixture oczekującego ustawienia od 16 listopada; nie jest dowodem zapisu backendu.
Nie wykonano writable E2E ani zapisów produkcyjnych. Lokalna karta powiadomień
pokazuje niedostępność backendu; nie ukrywano tego stanu na screenshotach.

Zrzuty „before” wykonano z kodu bazowego #26, SHA
97f23b6b1c1356424b8d677ae79c115ab0cd0366. Pozostałe odpowiadają kodowi tego commita.
Daty przykładów są syntetyczne; aplikacja i endpoint wyliczają je dynamicznie.

| Stan | Desktop | Mobile |
|---|---|---|
| Ustawienia przed | ![before desktop](before-desktop.jpg) | ![before mobile](before-mobile.jpg) |
| Ustawienia po | ![settings desktop](settings-desktop.jpg) | ![settings mobile](settings-mobile.jpg) |
| Edytor — podgląd zwinięty | ![editor desktop](editor-collapsed-desktop.jpg) | ![editor mobile](editor-collapsed-mobile.jpg) |
| Podgląd 3 dni | ![preview desktop](preview-desktop.jpg) | ![preview mobile](preview-mobile.jpg) |
| Brak wybranych dni | ![zero desktop](zero-days-desktop.jpg) | ![zero mobile](zero-days-mobile.jpg) |
| Oczekująca zmiana | ![pending desktop](pending-desktop.jpg) | ![pending mobile](pending-mobile.jpg) |
| Kontrola Czytaj | ![today desktop](today-desktop.jpg) | ![today mobile](today-mobile.jpg) |
| Kontrola pełnego Planu | ![plan desktop](plan-desktop.jpg) | ![plan mobile](plan-mobile.jpg) |
| Kontrola Grupy | ![group desktop](group-desktop.jpg) | ![group mobile](group-mobile.jpg) |

Reprodukcja: npm run dev na porcie 5173 (istniejący tryb lokalny), wyłącznie
syntetyczny plan w local-store, następnie Ustawienia → Moje dni czytania.
Rozwiń Podgląd czytań; wybierz 1 dzień i odznacz sobotę, aby obejrzeć błąd zera dni.
W backendzie zapis sprawdzają lokalne testy handlera ze sztucznym magazynem.
Przygotowano E2E realnego API, dwóch urządzeń, stale-write i anulowania;
wykona je wyłącznie istniejący pipeline po main. Nie deklarujemy ich zaliczenia.

Lokalna weryfikacja: 21 testów Node + 404 Vitest w 47 plikach oraz build — success.
