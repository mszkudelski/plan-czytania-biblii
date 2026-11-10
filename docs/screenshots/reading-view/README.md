# Podział czytania — przegląd widoków

Rzeczywiste zrzuty lokalnej aplikacji w Chromium: desktop 1280×1000 i mobile
390×844. Dane są syntetyczne, utworzone wyłącznie w lokalnym magazynie aplikacji.
Nie jest to weryfikacja produkcyjnego API ani zapisujące E2E.

Sprawdzono domyślny widok całych fragmentów, wybrany widok osobnych rozdziałów
oraz automatyczny podział w nadrabianiu. W każdym rozmiarze brak poziomego
przewijania. Zakres wersetów `J 3,16–18` pozostaje jednym polem. Na mobilnym
zrzucie zwykłego czytania widoczna jest rzeczywista sugestia nadrabiania;
nie ukrywano nakładek na potrzeby zdjęć.

Po integracji z develop: 21 testów skryptów Node i 381 testów Vitest
w 44 plikach zakończyło się powodzeniem. `npm run build` również przeszedł.
Regresje E2E są przygotowane do istniejącego pipeline po publikacji na main;
nie uruchamiano ich lokalnie ani na develop.

| Widok | Desktop | Mobile |
|---|---|---|
| Całe fragmenty | [zrzut](./fragments-desktop.jpg) | [zrzut](./fragments-mobile.jpg) |
| Osobne rozdziały | [zrzut](./chapters-desktop.jpg) | [zrzut](./chapters-mobile.jpg) |
| Nadrabianie | [zrzut](./recovery-desktop.jpg) | [zrzut](./recovery-mobile.jpg) |
