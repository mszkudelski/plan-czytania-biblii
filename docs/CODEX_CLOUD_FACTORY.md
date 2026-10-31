# Pilotaż Software Factory: GitHub + Codex Cloud

## Cel

GitHub Issues jest kolejką zadań; Codex Cloud wykonuje pojedyncze zlecenia w izolowanym środowisku, a GitHub Actions jest niezależnym sprawdzianem jakości. **Merge i wdrożenie na produkcję pozostają pod kontrolą człowieka.** Ten pilotaż nie dodaje klucza OpenAI API i nie uruchamia Codexa z GitHub Actions.

## 1. Połączenie i konfiguracja poza repozytorium

1. W Codex połącz konto GitHub i autoryzuj repozytorium `mszkudelski/plan-czytania-biblii`.
2. W Codex Cloud na web/desktop utwórz środowisko dla repozytorium; wybierz `main` jako źródło i opublikuj po sprawdzeniu instalacji.
3. Sprawdź, czy działa instalacja `npm ci`, `npm test` i `npm run build`. Nie dodawaj do środowiska produkcyjnych tokenów użytkowników ani Netlify.
4. Integracja GitHub z komentarzami `@codex` oraz automatyczne code review mogą nadal korzystać z **Codex Cloud (Legacy)**. Włącz je w ustawieniach Codex dla tego repozytorium; samo opublikowanie nowego środowiska Cloud nie dowodzi, że wzmianki GitHub są aktywne.
5. Włącz automatyczny Code Review w ustawieniach repozytorium Codex i sprawdź, czy działa na pilotażowym PR.

Tych ustawień nie da się uruchomić przez samo dodanie plików do repozytorium.

## 2. Przebieg zadania

1. Utwórz issue z szablonu **Zadanie dla Codex Cloud**, ograniczone do jednego obszaru z `scripts/select-e2e.mjs`.
2. Sprawdź zakres i ryzyko. Nie deleguj zadań, które wymagają modyfikowania produkcyjnych poświadczeń, migracji albo danych rzeczywistych użytkowników.
3. Jako użytkownik uprawniony do repozytorium dodaj komentarz:

   ```
   @codex Zrealizuj to issue w repozytorium mszkudelski/plan-czytania-biblii.
   Przestrzegaj AGENTS.md. Najpierw przeczytaj scripts/select-e2e.mjs.
   Wykonaj npm test oraz npm run build i podaj ich rzeczywisty wynik.
   Dla tego zadania WYRAŹNIE proszę o osobny branch i draft PR do develop.
   Nie merguj, nie wdrażaj, nie modyfikuj sekretów ani prawdziwych danych.
   Jeśli coś jest niejasne lub ryzykowne, skomentuj issue i zatrzymaj się.
   ```

4. Sprawdź, czy Codex zareagował na komentarz, utworzył zadanie i opublikował wynik. Jeśli nie, sprawdź GitHub connector, środowisko Legacy i uprawnienia. Możesz uruchomić zadanie ręcznie w Codex Cloud, przekazując URL issue.
5. Zweryfikuj diff oraz faktyczne wyniki `npm test` i `npm run build`. Bez deklaracji „testy przechodzą”, jeżeli nie były uruchomione.
6. Poczekaj na zielony `Required CI` w GitHub, przejrzyj uwagi Code Review i poproś o poprawki np. komentarzem `@codex fix the CI failures`.
7. Decyzja o merge należy do człowieka. Obowiązują zastane zasady `AGENTS.md`: pełne E2E wykonuje się po pushu na `main`, bez naruszania rzeczywistych grup.

**Uwaga o branchach:** domyślny `AGENTS.md` nakazuje rutynową pracę bezpośrednio na `develop`. Dlatego dla pilotażu **w treści delegowania wyraźnie wymagamy osobnego brancha i draft PR**. Nie zmieniamy zasad innych, rutynowych prac.

## 3. Co jest i nie jest zautomatyzowane

| Etap | Pilotaż bez API |
| --- | --- |
| Issue i kryteria akceptacji | GitHub, ręczne zgłoszenie |
| Start Codexa | Komentarz człowieka `@codex` lub ręczny start z Codex Cloud |
| Implementacja i testy w sandboxie | Codex Cloud |
| PR, review i poprawki | Codex / GitHub, pod nadzorem |
| CI | Istniejące GitHub Actions |
| Merge i produkcja | Zatwierdza człowiek |
| Automatyczny start po etykiecie | **Nie skonfigurowano**; komentarz bota `@codex` nie został zweryfikowany jako obsługiwany trigger |
| Autonomiczne wybieranie i wykonywanie issue 24/7 | **Nie skonfigurowano**; wymaga osobnego, wiarygodnego dispatchera |

Nie używaj automatycznej akcji GitHub, która komentuje każde issue `@codex`, dopóki nie zostanie zweryfikowane uwierzytelnienie autora wzmianki, filtrowanie zaufanych zgłoszeń, limity prób oraz reakcja na komentarz bota.

## 4. Kryteria ukończenia pilotażu

- Jedno uprawnione `@codex` uruchamia rzeczywiste zadanie w chmurze.
- Zadanie ma link do issue i wynik prac.
- Powstaje draft PR (albo zostaje udokumentowana konkretna blokada).
- Testy i `Required CI` zostały zweryfikowane, a nie tylko zadeklarowane.
- Nie zmodyfikowano produkcji ani sekretów; użytkownik decyduje o merge.

Dokumentacja:
- https://learn.chatgpt.com/docs/environments/cloud-environments
- https://learn.chatgpt.com/docs/third-party/github
- https://learn.chatgpt.com/docs/changelog

## 5. Wynik pierwszego testu (31 października 2026)

W issue [#17](https://github.com/mszkudelski/plan-czytania-biblii/issues/17) dodano komentarz użytkownika z `@codex`, bez żadnego zlecenia modyfikacji kodu. `chatgpt-codex-connector[bot]` odpowiedział:

> To use Codex here, create an environment for this repo.

Wniosek: integracja otrzymała wzmiankę na GitHub, ale repozytorium **nie ma jeszcze środowiska wymaganego do uruchomienia zadania z tego issue**. Następny wymagany krok: utworzyć i opublikować środowisko w https://chatgpt.com/codex/cloud/settings/environments, a następnie ponowić test na issue #17. Do tego czasu nie należy twierdzić, że automatyczne kodowanie z issue działa.

## 6. Test po opublikowaniu nowego środowiska (31 października 2026)

Po potwierdzeniu przez właściciela utworzenia środowiska ponowiono komentarz `@codex` w [issue #17](https://github.com/mszkudelski/plan-czytania-biblii/issues/17). Bot **ponownie zwrócił** `To use Codex here, create an environment for this repo` ([odpowiedź](https://github.com/mszkudelski/plan-czytania-biblii/issues/17#issuecomment-6547713126)).

**Diagnoza:** aktualne środowiska Codex Cloud i dotychczasowe GitHub/Linear integracje są obsługiwane przez różne wersje usług. Dokumentacja OpenAI wskazuje, że GitHub integration nadal korzysta z **Codex Cloud (Legacy)**. Dlatego samo opublikowanie środowiska nowego Codex Cloud nie dowodzi zgodności z wyzwalaniem `@codex` na issue. Nie ponawiaj wzmianki jako testu, dopóki nie jest znana obsługiwana metoda powiązania środowiska z integracją.

**Ścieżka pilotażu bez dodatkowego API:** ręcznie uruchom zadanie z poziomu Codex Cloud z wybranym opublikowanym środowiskiem i URL do issue. Test musi udowodnić dostęp do repozytorium i raport z odczytu `AGENTS.md` / `.github/workflows/ci.yml` bez modyfikacji. Następnie, dla osobnego małego zadania, przetestuj branch i draft PR. Nie twierdź, że sam komentarz na GitHub uruchamia zadanie do czasu uzyskania pozytywnego wyniku takiej integracji.

Oficjalne źródło: https://learn.chatgpt.com/docs/environments/cloud-environments

## 7. Wynik testu Codex Cloud oraz następny pilot

Właściciel uruchomił ręcznie zadanie w nowym Codex Cloud, wybrał repo `plan-czytania-biblii`, a agent przeczytał `AGENTS.md` i `.github/workflows/ci.yml`. Zrzut z sesji potwierdza analizę uruchamiania CI, testów produkcyjnych i zasad E2E. **Dostęp nowego Codex Cloud do repo jest potwierdzony.** Nie dowodzi to jednak działania wyzwalacza `@codex` na GitHub (zob. sekcję 6), ani możliwości wystawiania PR.

Następny, bezpieczny pilot: [issue #18](https://github.com/mszkudelski/plan-czytania-biblii/issues/18) — osobny branch i draft PR zawierający wyłącznie nową dokumentację lokalnej walidacji. Uruchomienie ręczne w Codex Cloud, po publikacji PR weryfikacja `Required CI`. Bez automatycznego merge lub wdrożenia.

## 8. Wynik testu pierwszego PR — 31 października 2026

Codex Cloud uruchomiony ręcznie z opublikowanego środowiska zrealizował [issue #18](https://github.com/mszkudelski/plan-czytania-biblii/issues/18) i wystawił [draft PR #19](https://github.com/mszkudelski/plan-czytania-biblii/pull/19) do `develop`.

- Branch: `docs/18-development-validation`; PR w stanie otwartym/draft.
- Zakres: wyłącznie `docs/DEVELOPMENT_VALIDATION.md` (+84 linii).
- Codex zaraportował wykonanie `npm ci`, `npm test` (21 testów Node.js, 331 Vitest), `npm run build` i `git diff --check` bez błędów.
- GitHub Actions: [workflow CI run #41232056246](https://github.com/mszkudelski/plan-czytania-biblii/actions/runs/41232056246) zakończył się `success`; zadania `Select E2E tests`, `Unit tests and build` i `Required CI` zakończyły się powodzeniem. Kontrole produkcyjne i E2E pominięto zgodnie z istniejącymi zasadami PR.
- Netlify deploy-preview ma status `success`, ale nie jest to deployment na produkcję.
- Nie wykonano merge ani wdrożenia produkcyjnego.

**Wniosek:** potwierdzono ręczny pipeline `Codex Cloud → branch → draft PR → CI` bez klucza OpenAI API. Nadal **nie** potwierdzono automatycznego uruchamiania Codex Cloud po zdarzeniu GitHub issue ani samodzielnego wyboru issue przez agenta.
