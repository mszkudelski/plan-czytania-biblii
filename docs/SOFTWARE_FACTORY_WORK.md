# Software Factory — proces sterowany statusem issue

Właściciel zarządza pracą wyłącznie na issues w GitHub Projects. PR-y, review, gałęzie wydaniowe i merge obsługuje automat.

## Stan wdrożenia integracji
Nowy proces został przyjęty przez właściciela 5 listopada 2026. Schemat i polityka są zapisane w `docs/software-factory-project.json`. **Tablica i jej pole Status nie zostały jeszcze skonfigurowane przez agenta:** obecna integracja GitHub nie udostępnia narzędzi Projects V2, a próba standardowego odczytu GraphQL przez gh zakończyła się 403 Forbidden. Właściciel wskazał projekt [mszkudelski / 2](https://github.com/users/mszkudelski/projects/2). Adres jest zapisany; nadal brakuje odczytu projektu i zweryfikowanych identyfikatorów jego pól/opcji. Nie wybieraj ani nie twórz innej tablicy. Nie jest to potwierdzenie działania integracji.

Automatyzacja pozostaje włączona zgodnie z dotychczasowym harmonogramem. Do czasu potwierdzenia odczytu/zapisu rzeczywistego pola nie rozpoczyna nowych zadań ani publikacji na podstawie dawnych labelek. Nie udaje zmiany statusu komentarzem, labelką ani lokalnym plikiem. Potrzebne: autoryzowany dostęp do wskazanego projektu, jego odczytu/zapisu oraz wiarygodna historia zmian statusu zatwierdzenia.

## Jedno źródło prawdy
Pole single-select **Status** w jednym wskazanym projekcie. Otwarcie/zamknięcie issue jest stanem administracyjnym, a nie substytutem etapów. Nie utrzymujemy równoległego workflow labelkami.

| Status | Kto ustawia | Znaczenie |
|---|---|---|
| Backlog | Właściciel / początkowy import | Nie rozpoczynaj pracy. |
| Gotowe do realizacji | Właściciel | Zgoda na implementację opisanego zadania. Nie jest jeszcze zgodą na publikację nieobejrzanego rezultatu. |
| W realizacji | Automat | Implementacja, testy i naprawy na develop. |
| Do akceptacji | Automat | Na issue jest konkretna propozycja: opis zmian, screenshoty, testy, SHA i zakres. Właściciel ocenia wynik. |
| Zaakceptowane do wydania | Wyłącznie właściciel mszkudelski | Zgoda na merge i deployment przedstawionego zakresu; bez osobnej akceptacji PR i bez labelki zgody. |
| W wydaniu | Automat | Izolowanie zakresu, CI i Codex Review PR, merge, deployment, kontrole produkcji, E2E i cleanup. |
| Zakończone | Automat | Zweryfikowano deployment i wymagane testy produkcyjne, zamknięto issue. |
| Wymaga decyzji | Automat | Potrzebna konkretna decyzja, zależność lub dostęp. Naprawialne błędy kodu/testów automat naprawia sam. |

Poprawki z oceny właściciela wracają do W realizacji. Istotna zmiana rezultatu po akceptacji wraca do Do akceptacji. Drobna techniczna naprawa review/CI w zaakceptowanym zakresie nie wymaga ponownej akceptacji tego samego zachowania; jej pochodzenie i granice muszą być udokumentowane.

## Propozycja i dowód akceptacji
Przed Do akceptacji agent zapisuje komentarz z markerem `<!-- factory-proposal -->`: issue, cel, kryteria, rzeczywiste zmiany dla użytkownika, commit bazowy i commity implementacji, pliki, wyniki CI/lokalnych testów, screenshoty i ograniczenia. Propozycja ma jednoznaczny identyfikator/wersję.

Agent nigdy sam nie ustawia Zaakceptowane do wydania. Przed merge odczytuje świeży status i wiarygodny dowód, że właściciel zmienił właściwe pole właściwego elementu projektu na ten status po opublikowaniu aktualnej propozycji. Sam aktualny tekst pola, autor issue, jego creator lub dowolne zdarzenie projektu nie dowodzą akceptacji. Nie wolno przypisywać autorstwa na podstawie domysłu. Gdy dostępna historia/audyt zdarzenia nie pozwala jednoznacznie połączyć projektu, issue, pola, wartości, autora i czasu, publikacja wymaga uzupełnienia integracji; nie zastępuj jej dawną labelką PR.

## Implementacja
- Zwykłe zmiany bezpośrednio na develop. Przed zapisem odczytaj HEAD, po każdym zapisie odśwież repozytorium, CI, statusy i zależności; nie nadpisuj cudzych zmian.
- Commituj rozdzielne zadania oddzielnie i zapisuj ich zależności, aby dało się wydać zaakceptowany podzbiór.
- Feature branch / PR do develop tylko przy rzeczywistym konflikcie równoległych zmian. Tymczasowa gałąź wydaniowa jest osobnym, jawnie dopuszczonym przypadkiem opisanym poniżej.
- Przeczytaj AGENTS.md, workflow CI, właściwe pliki/testy i scripts/select-e2e.mjs. Dla zmian zachowania dodaj regresje jednostkowe i E2E, wykonaj npm test i npm run build. Testów niewykonanych nie przedstawiaj jako zaliczonych.

## Wydanie zaakceptowanego podzbioru
Jeśli pełne main...develop odpowiada wyłącznie zaakceptowanemu zakresowi, użyj PR develop → main. Jeśli develop zawiera też inne zadania, agent **może bez dodatkowego pytania utworzyć tymczasowy release branch od aktualnego main**, przenieść/rekomponować wyłącznie zaakceptowane zmiany i utworzyć PR do main. Nie jest do tego potrzebny konflikt dwóch zmian.

Przygotuj manifest wydania: issue i wersje propozycji, dowody statusowej akceptacji, commity źródłowe, zależności, bazowy main SHA, docelowy head SHA. Sprawdź rzeczywisty wynikowy diff. Nie przenoś niezaakceptowanych zależności; jeśli izolacja pozostawia niekompletną funkcję, zgłoś konkretną zależność i kontynuuj inne niezależne zadania.

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
- Dawne factory:* pozostają historią, nie sterują nowymi decyzjami. Nie usuwaj ich masowo przed potwierdzeniem migracji elementów do projektu.
- #26 ma dotychczasową zgodę właściciela na implementację (factory:ready). Po podłączeniu projektu przenieś je do Gotowe do realizacji jako migrację tej zgody, z audytem; publikacja wyniku wymaga nowego statusu Zaakceptowane do wydania.
- #8 pozostaje zamknięte jako wycofane — nie wznawiaj.
- #10 i #24 mają zweryfikowane wdrożenie #25, main 67e29a070f7657fef08b4d57d24b99738672d92f, 143/143 E2E oraz cleanup success; po migracji oznacz je Zakończone bez ponownego wydania.
- Inne backlog/piloty nie otrzymują automatycznej zgody na implementację lub wdrożenie na podstawie historycznych PR/labelek.
- Historyczny otwarty PR #21 opisuje poprzedni proces i nie jest źródłem nowych zasad.

## Granice i komunikacja
Bez Copilota, osobnego OpenAI API, nieoficjalnych endpointów lub obchodzenia uwierzytelnienia. Bez zmian sekretów, uprawnień, ochrony gałęzi, AGENTS.md, workflows, zależności i konfiguracji produkcji bez odrębnej zgody. Korzystaj z autoryzowanych narzędzi/CLI; brak dostępu nie oznacza zgody na obejście.

Nie wyłączaj sam harmonogramu (00:00, 08:00, 16:00 Europe/Warsaw). Każdy przebieg MUSI zakończyć się jawną, krótką odpowiedzią — także bez zmian i przy powtarzającej się blokadzie. Jeśli nie wykonano zmian, napisz wprost „Nie wprowadziłem zmian”, podaj powód oraz co faktycznie sprawdzono. Rozróżniaj wykonanie kontroli od modyfikacji kodu, statusów lub wdrożenia. Nie wysyłaj pustej odpowiedzi i nie przemilczaj wyniku. Przy wykonanych zmianach podaj konkretne działania i wyniki; dla wydań nadal obowiązuje changelog.
