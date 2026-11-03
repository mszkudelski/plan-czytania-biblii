# Checklista weryfikacji Pull Request

Stosuj przed zaakceptowaniem zmian w aplikacji **Plan czytania Biblii**. Źródła zasad: [AGENTS.md](../AGENTS.md), [CI](../.github/workflows/ci.yml) oraz [README.md](../README.md). W razie rozbieżności sprawdź aktualne pliki źródłowe i konfigurację GitHub — ta lista nie zastępuje reguł ochrony gałęzi.

## 1. Zakres i bezpieczeństwo

- [ ] PR wskazuje issue lub cel, kryteria akceptacji, bazową gałąź i zakres zmian; nie zawiera niezwiązanych refaktoryzacji.
- [ ] Sprawdzono diff pod kątem zmian w uprawnieniach, dostępie do grup, sesjach, zapisie postępu, API, zależnościach i konfiguracji wdrożenia. Ryzyka oraz migracje są opisane.
- [ ] Nie dodano sekretów, tokenów, prywatnych linków dostępu, danych rzeczywistych uczestników, zrzutów z danymi grup ani śladów żądań zawierających poświadczenia.
- [ ] Nie zmieniono ani nie osłabiono wymaganych testów, polityki E2E, reguł CI ani mapowania pokrycia tylko po to, aby uzyskać zielony wynik.

## 2. Testy regresyjne i build

- [ ] Dla zmian zachowania UI, logiki postępu/odzyskiwania, sesji lub tras backendu dodano/zaktualizowano adekwatne testy jednostkowe i E2E, w tym regresję dla naprawianego błędu.
- [ ] Przy zmianie modułów lub ich konsumentów zweryfikowano [mapowanie zakresów E2E](../scripts/select-e2e.mjs), zależności między funkcjami oraz testy selektora; nie zawężono pokrycia dla wygody.
- [ ] Wykonano `npm test` i `npm run build` w odpowiednim środowisku **albo** wyraźnie zapisano, że nie zostały uruchomione lokalnie. Nie oznaczaj niewykonanych testów jako zaliczonych.
- [ ] Testy regresyjne handlerów API są w `netlify/tests/`, a nie jako `*.test.ts` bezpośrednio w głównym katalogu `netlify/functions/` (pliki na tym poziomie są traktowane jako funkcje podczas deployu). Testy w pomocniczych podkatalogach, np. `netlify/functions/_shared/`, są dozwolone.

## 3. GitHub CI — wymagany warunek przed merge

- [ ] Otwórz workflow **CI** dla dokładnego commita PR; sprawdź wynik `Select E2E tests` oraz `Unit tests and build` (Node.js 24, `npm ci`, `npm test`, `npm run build`).
- [ ] Stabilny check **`Required CI` ma status `success`** dla aktualnego commita. Jeśli jest `pending`, `failed` lub nie istnieje, **nie merguj**.
- [ ] Na PR i pushach do `develop` zadania `Production read-only checks` i `E2E with real backend` są **pomijane zgodnie z polityką**. Nie interpretuj tego jako przeprowadzonego E2E ani jako błędu.
- [ ] Dla produkcyjnego pusha do `main` workflow uruchamia pełne E2E oraz produkcyjne kontrole tylko do odczytu na wdrożeniu odpowiadającym dokładnie temu SHA. Wyniki pojawiają się **po pushu**, nie są wcześniejszą bramką merge; nieudane E2E wymagają poprawki w kolejnym commicie (fix forward).

## 4. E2E i dane testowe

- [ ] Nie uruchamiaj rutynowo zapisywalnych E2E na `develop`, PR ani deploy preview. Dodatkowe E2E tylko na wyraźne zlecenie, zgodnie z [zasadami E2E](../e2e/README.md).
- [ ] Produkcyjne E2E korzystają z rzeczywistego wdrożonego API i Netlify Blobs, a nie z pomyślnych mocków API lub lokalnego `localStorage`.
- [ ] Testy zapisujące dane tworzą **wyłącznie własne syntetyczne plany**, oznaczone podczas tworzenia; runner sprząta je według unikalnych identyfikatorów/uprawnień danego przebiegu w `finally` oraz w kroku cleanup CI, również po zwykłej porażce testów. Nagła utrata runnera może uniemożliwić cleanup — nie zakładaj wówczas, że dane zostały usunięte; wymagane jest sprawdzenie i ewentualne ponowienie sprzątania z uprawnieniami danego przebiegu. Nigdy nie modyfikuj istniejących planów użytkowników ani nie usuwaj danych wyłącznie na podstawie prefiksu nazwy.
- [ ] Nie zapisuj w repozytorium tokenów dostępu, uprawnień do cleanup, `storageState` ani request traces; syntetyczne subskrypcje push są wyłączone z produkcyjnych powiadomień.

## 5. Review i decyzja

- [ ] Autor opisał zmienione pliki, testy rzeczywiście wykonane, link do CI, ryzyka i ograniczenia; reviewer sprawdził diff oraz zgodność z kryteriami akceptacji.
- [ ] Uwagi review (w tym Codex Review, jeśli został uruchomiony) są rozpatrzone; brak uwag od automatu nie zastępuje oceny człowieka ani zielonego `Required CI`.
- [ ] **Merge wykonuje się dopiero po świadomej akceptacji właściciela** i sprawdzeniu statusu CI na bieżącym SHA. Żaden draft PR ani automatyzacja Software Factory nie oznacza zgody na merge lub deployment.
- [ ] Po publikacji na `main` sprawdź wyniki produkcyjnych kontroli i E2E; awarię obsłuż przez fix forward, bez pomijania testów.
