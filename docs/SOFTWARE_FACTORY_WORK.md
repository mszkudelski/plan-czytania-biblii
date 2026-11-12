# Software Factory — proces sterowany etykietami issue

Właściciel zarządza zadaniami i zgodą wyłącznie na issues. PR-y, review, gałęzie wydaniowe i merge obsługuje automat. Ta dyspozycja z 10 listopada 2026 zastępuje proces GitHub Projects V2. Bramka blocked_projects_access nie obowiązuje w trybie etykiet; nie wymaga to dostępu do Projects ani rozszerzania uprawnień.

## Jedno źródło prawdy
Etykiety factory:* na issue (nie na PR). Brak factory:ready oznacza backlog. Otwarcie/zamknięcie issue jest stanem administracyjnym.

| Etykieta | Kto ustawia | Znaczenie |
|---|---|---|
| factory:ready | Właściciel mszkudelski | Zgoda na implementację zakresu issue, jeszcze bez zgody na publikację wyniku. |
| factory:working | Automat | Implementacja, testy i naprawy. |
| factory:review | Automat | Konkretna propozycja czeka na ocenę właściciela. |
| factory:deploy-approved | Wyłącznie właściciel mszkudelski | Zgoda na merge i deployment aktualnej propozycji; bez osobnej akceptacji PR. |
| factory:releasing | Automat | CI, Codex Review PR, merge, deployment i kontrole produkcji. |
| factory:done | Automat | Deployment, wymagane testy i cleanup zweryfikowane; zamknij issue. |
| factory:blocked | Automat | Potrzebna konkretna decyzja, zależność lub dostęp. Naprawialne błędy kodu/testów napraw sam. |

Automat utrzymuje jeden bieżący etap spośród working/review/releasing/done/blocked, nie usuwa innych etykiet repozytorium. factory:ready i factory:deploy-approved są dowodami zgody, a nie etapami; zachowuj ich audyt. Gotowe zadania podejmuj kolejno według priorytetu i wieku, bez limitu jednego issue. Przed działaniem sprawdź brak duplikatu, zależności i aktualny stan repozytorium. Jeden zapis/merge naraz; po każdej mutacji odśwież SHA, CI, review i etykiety. Oczekiwanie na niezależną kontrolę nie blokuje innych bezpiecznych prac.

## Propozycja i dowód akceptacji
Przed factory:review opublikuj na issue komentarz z markerem `<!-- factory-proposal -->`: jednoznaczny identyfikator/wersja, cel, kryteria, rzeczywiste zmiany dla użytkownika, commit bazowy i implementacji, pliki, wyniki CI/lokalnych testów, screenshoty i ograniczenia.

Przed implementacją zweryfikuj w timeline/events issue nadanie factory:ready przez mszkudelski (albo jego utworzenie issue z tą etykietą). Przed wydaniem wymagaj świeżego odczytu etykiet oraz zdarzenia labeled dla factory:deploy-approved przez mszkudelski po aktualnej propozycji. Zdarzenie musi dotyczyć właściwego issue i istniejącej, nieodwołanej zgody. Sam aktualny zestaw etykiet, autor issue czy komentarz agenta nie dowodzą akceptacji. Automat nigdy sam nie nadaje etykiet zgody. Nie traktuj starych factory:merge-approved na PR jako zgody w nowym procesie.

Poprawki właściciela wracają do factory:working. Istotna zmiana wyniku po akceptacji wymaga nowej propozycji factory:review i ponownego nadania factory:deploy-approved przez właściciela; starą zgodę traktuj jako nieaktualną. Drobne techniczne naprawy CI/review w zaakceptowanym zakresie nie wymagają ponownej zgody na to samo zachowanie, ale muszą mieć udokumentowane pochodzenie i granice. Brak wiarygodnego audytu oznacza factory:blocked, bez zgadywania zgody.

## Implementacja
- Zwykłe zmiany bezpośrednio na develop. Przed zapisem odczytaj HEAD, po każdym zapisie odśwież repozytorium, CI, statusy i zależności; nie nadpisuj cudzych zmian.
- Commituj rozdzielne zadania oddzielnie i zapisuj ich zależności, aby dało się wydać zaakceptowany podzbiór.
- Feature branch / PR do develop tylko przy rzeczywistym konflikcie równoległych zmian. Tymczasowa gałąź wydaniowa jest osobnym, jawnie dopuszczonym przypadkiem opisanym poniżej.
- Przeczytaj AGENTS.md, workflow CI, właściwe pliki/testy i scripts/select-e2e.mjs. Dla zmian zachowania dodaj regresje jednostkowe i E2E, wykonaj npm test i npm run build. Testów niewykonanych nie przedstawiaj jako zaliczonych.

## Wydanie zaakceptowanego podzbioru
Jeśli pełne main...develop odpowiada wyłącznie zaakceptowanemu zakresowi, użyj PR develop → main. Jeśli develop zawiera też inne zadania, agent **może bez dodatkowego pytania utworzyć tymczasowy release branch od aktualnego main**, przenieść/rekomponować wyłącznie zaakceptowane zmiany i utworzyć PR do main. Nie jest do tego potrzebny konflikt dwóch zmian.

Przygotuj manifest wydania: issue i wersje propozycji, dowody akceptacji etykietą na issue, commity źródłowe, zależności, bazowy main SHA, docelowy head SHA. Sprawdź rzeczywisty wynikowy diff. Nie przenoś niezaakceptowanych zależności; jeśli izolacja pozostawia niekompletną funkcję, zgłoś konkretną zależność i kontynuuj inne niezależne zadania.

Na **dokładnym SHA wydaniowym** wymagaj PR CI / Required CI success i ukończonego Codex Review bez findings oraz otwartych blokujących wątków. Nie wystarcza CI pierwotnego develop. @codex review tylko raz na SHA; poprawki do trzech rund. Dla izolowanego release popraw/rekomponuj zakres na develop i gałęzi wydaniowej, nie dopisuj zmian nieobjętych akceptacją.

Po odświeżeniu HEAD, statusów i zgód wykonaj merge z expected_head_sha. Bez bezpośrednich commitów na main. Po wydaniu uzgodnij historię z develop bez cofania istniejących tam prac i bez ponownego wprowadzania wydanych zmian. Tymczasową gałąź usuwaj dopiero po potwierdzeniu integracji i braku dalszych zależności; nie force-pushuj gałęzi współdzielonych.

## CI/E2E i naprawy
Nie kończ na zapisaniu problemu. Gdy wymaganie się zmieniło, dostosuj nieaktualne testy z zachowaniem pokrycia; gdy test ujawnia regresję, popraw aplikację. Nie osłabiaj asercji, nie ukrywaj nakładek tylko podczas testów i nie używaj force-click jako obejścia.

Czerwone produkcyjne E2E wstrzymuje niezwiązane wydania, ale nie kontrolowaną naprawę fix-forward jego przyczyny. Naprawy pozostają w autoryzowanym zakresie z CI i review. Zapisujące E2E tylko w istniejącym pipeline po main, na dokładnym immutable deploy SHA, z izolowanymi syntetycznymi planami i cleanup. Nie zmieniaj rzeczywistych danych ani nie wykonuj automatycznego rollbacku.

Zakończone dopiero po zweryfikowaniu Netlify/produkcji, testów, Required CI i cleanup. Przy pending zapisz wprost w toku; przy awarii wróć do naprawy, a nie do cyklicznego raportowania tej samej blokady.

## Changelog i screenshoty
Każdy release PR i pierwsza/finalna informacja o wydaniu zawiera **Co zmieniło się w release**: rzeczywiste zmiany dla użytkownika oddzielone od technicznych/dokumentacyjnych, na podstawie poprzedniego produkcyjnego main SHA → nowego SHA, z linkami issue/PR, dokładnym SHA, CI, deploymentem i E2E. Dokumentacja/config only: **Bez zmian funkcjonalnych w aplikacji**.

Zmiany wizualne wymagają prawdziwych screenshotów uruchomionej aplikacji desktop i mobile, istotnych stanów interaktywnych i przed/po, gdy wiarygodne przed jest dostępne. Nie generuj makiet jako dowodu. Dodaj obrazy/linki do aktualnej propozycji na issue i do release PR. Wyjaśnij lokalną reprodukcję/syntetyczne dane i ograniczenia; nie twierdź, że sprawdzono backend, gdy go nie sprawdzono. Istotna zmiana UI po capture wymaga nowych screenów.

## Migracja i istniejące zadania
- Powrót do etykiet autoryzowany przez właściciela 10 listopada 2026. Projects V2 nie steruje fabryką i jego niedostępność nie blokuje pracy. Nie zmieniaj tablicy ani uprawnień.
- #26 zachowuje zweryfikowaną zgodę właściciela na implementację przez factory:ready; publikacja wymaga factory:deploy-approved po aktualnej propozycji.
- #8 pozostaje zamknięte jako wycofane — nie wznawiaj.
- #10 i #24 pozostają zakończone: wdrożenie #25, main 67e29a070f7657fef08b4d57d24b99738672d92f, 143/143 E2E i cleanup success. Nie wydawaj ich ponownie.
- Nie aktywuj historycznych pilotów ani nie przenoś dawnych zgód na PR-ach na nowy wynik. PR #21 opisuje poprzedni proces.
- Nie usuwaj masowo istniejących etykiet. Weryfikuj pochodzenie zgody na każdym issue; sama etykieta automatu nie dowodzi zgody właściciela.

## Granice i komunikacja
Bez Copilota, osobnego OpenAI API, nieoficjalnych endpointów lub obchodzenia uwierzytelnienia. Bez zmian sekretów, uprawnień, ochrony gałęzi, AGENTS.md, workflows, zależności i konfiguracji produkcji bez odrębnej zgody. Korzystaj z autoryzowanych narzędzi/CLI; brak dostępu nie oznacza zgody na obejście.

Nie wyłączaj sam harmonogramu (00:00, 16:00 Europe/Warsaw). Każdy przebieg MUSI zakończyć się jawną, krótką odpowiedzią — także bez zmian i przy powtarzającej się blokadzie. Jeśli nie wykonano zmian, napisz wprost „Nie wprowadziłem zmian”, podaj powód oraz co faktycznie sprawdzono. Rozróżniaj wykonanie kontroli od modyfikacji kodu, statusów lub wdrożenia. Nie wysyłaj pustej odpowiedzi i nie przemilczaj wyniku. Przy wykonanych zmianach podaj konkretne działania i wyniki; dla wydań nadal obowiązuje changelog.
