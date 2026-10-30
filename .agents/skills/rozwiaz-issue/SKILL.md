---
name: rozwiaz-issue
description: Realizuj zgłoszenie GitHub w projekcie planu czytania Biblii, zweryfikuj zmianę na develop i dostarcz zrzuty ekranu jako dowód.
---

# Rozwiązywanie issue

Użyj tego skilla, gdy użytkownik zleca realizację zgłoszenia GitHub w tym repozytorium. Dla kilku zgłoszeń prowadź osobną sesję dla każdego, jeśli użytkownik o to prosi i narzędzia na to pozwalają. Przy tworzeniu sesji wybierz model Sol 6.1 z poziomem rozumowania High, jeśli jest dostępny i użytkownik nie wskazał inaczej. Instrukcja w prompcie nie zmienia modelu działającej sesji: jeśli nie można utworzyć sesji lub ustawić modelu, zgłoś to bez twierdzenia, że zostało to zrobione.

1. Przeczytaj wskazane issue, komentarze i aktualne instrukcje repozytorium, w szczególności `AGENTS.md`, `scripts/select-e2e.mjs` i `e2e/README.md`. Ustal kryteria akceptacji, zależności i najmniejszy spójny zakres. Sprawdź istniejący kod i stan gałęzi przed zmianami. W razie nieustalonej decyzji produktowej wymaganej do implementacji poproś o decyzję; wykonuj niezależne prace, które nie przesądzają jej wyniku.
2. Pracuj na `develop`, chyba że użytkownik wyraźnie wskazał inną gałąź. Stosuj zasady podziału zakresu z `AGENTS.md`. Nie nadpisuj cudzych zmian. Zrealizuj kryteria issue, uwzględniając dostępność, stany błędów i istniejące zachowanie tam, gdzie mają znaczenie.
3. Dodaj lub zaktualizuj adekwatne testy regresji zgodnie z `AGENTS.md`. Dla zmian zachowania uruchom `npm test` i `npm run build`. Dodatkowe E2E uruchamiaj tylko na wyraźne żądanie użytkownika, zgodnie z polityką repozytorium: rzeczywiste API, izolowane dane testowe i sprzątanie przez runner. Nie wykonuj zapisujących testów na produkcji, jeśli użytkownik tego zabronił. Nie obchodź nieudanych testów ani nie przedstawiaj przeglądu kodu jako wykonanego E2E.
4. Wdróż zmianę na `develop` zgodnie z procesem repozytorium i zakresem upoważnienia użytkownika. Sprawdź wynik `Required CI` oraz stan branch deployu Netlify; zweryfikuj, że wdrożenie zawiera właściwy commit, zanim uznasz zmianę za wdrożoną. Jeśli brak dostępu, wdrożenie lub kontrola zakończyły się błędem, podaj konkretną przeszkodę i nie deklaruj sukcesu.
5. Sprawdź finalne zachowanie na wdrożeniu `develop`. Wykonaj czytelne zrzuty ekranu pokazujące realizację kryteriów, w odpowiednich stanach i rozmiarach ekranu; podaj dostępne użytkownikowi linki lub ścieżki do artefaktów. Używaj danych testowych, nie ujawniaj tokenów, kodów dostępu ani danych osobowych. Jeśli nie można wykonać zrzutów lub dany efekt nie jest widoczny na ekranie, wyjaśnij ograniczenie i podaj inne rzeczywiste dowody weryfikacji.
6. Na koniec podaj numer issue, opis zmiany, wynik testów i CI, commit oraz adres i stan wdrożenia, linki do zrzutów i wszelkie nierozwiązane ograniczenia. Rozróżnij działania wykonane od zaplanowanych. Nie zamykaj issue ani nie publikuj na produkcji bez odpowiedniego polecenia.
