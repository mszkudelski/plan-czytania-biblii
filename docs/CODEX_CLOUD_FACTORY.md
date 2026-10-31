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
