# Lokalna walidacja i CI

Opis opiera się na [package.json](../package.json),
[workflow CI](../.github/workflows/ci.yml) i [AGENTS.md](../AGENTS.md).

## Instalacja i komendy lokalne

Uruchamiaj komendy w katalogu głównym repozytorium. Używaj Node.js **24**,
tak jak wszystkie zadania CI. `package.json` nie deklaruje pola `engines`;
wersję używaną do walidacji określa workflow. CI korzysta z npm i pliku
`package-lock.json`, ale nie przypina osobnej wersji npm.

```sh
npm ci
npm test
npm run build
```

- `npm ci` instaluje zależności zgodnie z plikiem blokady.
- `npm test` uruchamia kolejno testy skryptów przez
  `node --test scripts/*.node-test.mjs` i testy przez `vitest run`.
- `npm run build` automatycznie wykonuje najpierw `prebuild`:
  `node scripts/check-netlify-functions.mjs && node scripts/build-info.mjs`.
  Następnie uruchamia `tsc -b && vite build`. Jest to lokalny build, bez wdrożenia.

Testy regresji handlerów API umieszczaj w `netlify/tests/`, poza katalogiem
funkcji. Plik `*.test.ts` bezpośrednio w `netlify/functions/` zostałby potraktowany
jako funkcja, a nazwa z kropką powoduje błąd wdrożenia. Build sprawdza nazwy
punktów wejścia funkcji przed kompilacją.

## Co uruchamia GitHub CI

Workflow działa dla PR-ów do `develop` i `main`, pushów na te gałęzie oraz
uruchomień ręcznych (`workflow_dispatch`).

| Zdarzenie | Testy i build | Kontrole produkcji bez zapisu | E2E z prawdziwym backendem |
| --- | --- | --- | --- |
| PR do `develop` lub `main` | Tak | Nie | Nie |
| Push na `develop` | Tak | Nie | Nie |
| Uruchomienie ręczne | Tak | Nie | Nie |
| Push na `main` | Tak | Tak | Pełny zestaw |

Zadanie `Select E2E tests` weryfikuje regresje selektora poleceniem
`node --test scripts/*.node-test.mjs` i uruchamia `node scripts/select-e2e.mjs`.
Zadanie `Unit tests and build` wykonuje `npm ci`, `npm test` i `npm run build`.

Po pushu na `main` zadanie `Production read-only checks` sprawdza commit,
zasoby i API produkcji przez `node scripts/check-production.mjs`. E2E czeka
na powodzenie tego zadania, selektora oraz testów i buildu. Instaluje osobne
zależności przez `npm ci --prefix e2e` i Chromium przez Playwright, a następnie
czeka na niezmienny deployment produkcyjny dokładnie tego SHA. Testy uruchamia
`node scripts/run-selected-e2e.mjs` z adresem tego deploymentu.

Zbiorczy check `Required CI` zawsze ocenia wyniki. Dla PR-ów, pushów na
`develop` i uruchomień ręcznych wymaga udanych testów selektora i testów z buildem,
trybu E2E `none` oraz pominiętych zadań produkcyjnych. Dla pushu na `main`
wymaga dodatkowo trybu `all` oraz powodzenia kontroli produkcji i E2E.
Zgodnie z AGENTS.md ochrona `develop` i `main` powinna wymagać `Required CI`;
nie należy mergować przy nieudanym checku. Produkcyjne E2E działa dopiero po
pushu na `main`, więc nie blokuje poprzedzającego go merge'a. Jego awarię trzeba
naprawić kolejną zmianą.

## Bezpieczne E2E i wiarygodne wyniki

Nie uruchamiaj rutynowo E2E zapisującego dane na `develop` ani na preview.
Dodatkowe uruchomienie E2E wymaga wyraźnego zlecenia. Testy korzystają z prawdziwego
wdrożonego API i Netlify Blobs, więc zapisy na istniejących planach mogłyby zmienić
dane użytkowników. Nie wolno zastępować API udanymi mockami ani używać lokalnego
fallbacku localStorage jako dowodu poprawności backendu.

Produkcyjny runner tworzy własne syntetyczne plany z nazwami zaczynającymi się
od `E2E`, oznacza je przy tworzeniu i używa losowego uprawnienia do sprzątania
danego uruchomienia. Sprzątanie musi działać w `finally` i w kroku CI z
`if: always()` (`node scripts/cleanup-e2e.mjs`), także po błędzie testów.
Nie wolno modyfikować istniejących grup ani usuwać planów wyłącznie według
prefiksu nazwy. Testowe subskrypcje push muszą być wyłączone z zaplanowanych
wysyłek. Nie commituj tokenów, uprawnień do sprzątania, `storageState` ani śladów
żądań. CI zachowuje raporty i wyniki E2E przez 7 dni.

Nie pomijaj, nie osłabiaj ani nie usuwaj nieudanego scenariusza tylko dla zielonego
CI. Przy zmianach zachowania aktualizuj regresje do końcowego zachowania i dodawaj
regresję dla każdego naprawionego błędu. Błąd testu należy wyjaśnić i naprawić,
zachowując wymagane pokrycie. Szczegóły konfiguracji i pokrycia opisuje
[dokumentacja E2E](../e2e/README.md).
