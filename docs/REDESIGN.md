# BLACKNET OS 2.0 — audyt i plan migracji

## Punkt odniesienia
- Gałąź robocza: `feat/blacknet-os-redesign` (od `master` @ `44d3c26`).
- Tag lokalny `v1.1-pre-os-redesign` (wypchnięcie tagów blokuje proxy sesji;
  commit `44d3c26` na zdalnym `master` jest niezmieniany).
- `master` jest wdrażany automatycznie na produkcję Vercel — redesign **nie**
  jest scalany bez zgody właściciela.

## Granica UI ↔ silnik (stan wyjściowy)
UI nie importuje parsera, VFS ani sieci bezpośrednio. Wszystko przechodzi przez:

| Kanał | Użycie w UI |
|---|---|
| `useGame` (Zustand) | `run`, `mutate`, `complete`, `applySettings`, `saveNow`, kopie, eksport/import, `boot` |
| `GameEngine` (odczyt) | `player.*`, `world.hosts/organizations`, `currentHost()`, `prompt()` |
| `GameEngine` FS | `fsList`, `fsRead`, `fsWrite` (z uprawnieniami sesji) |
| `terminalBridge` | wstrzykiwanie klawiszy do xterm (pasek mobilny, skróty) |

Wniosek: redesign wymienia warstwę prezentacji; silnik, format zapisu i
system autozapisu pozostają bez zmian. Dozwolone są wyłącznie **nowe metody
tylko do odczytu** w `GameEngine` (metadane plików, wyniki skanów gracza).

## Zasady migracji
1. Nowa powłoka (`src/os/`) obok starej; stare komponenty usuwane dopiero,
   gdy ich funkcja jest w pełni przeniesiona.
2. `Terminal` (xterm) montowany **raz** — okna/aplikacje go nie odtwarzają.
3. Preferencje UI (okna, przezroczystość, skala, kontrast, animacja startu)
   w `localStorage` (`blacknet:ui`), **poza** zapisem gry.
4. Ustawienia zapisane w grze (`theme`, `crt`, `fontSize`, `reducedMotion`)
   zachowują nazwy i znaczenie.
5. Akcje w UI zawsze wywołują istniejące komendy/akcje store — bez
   równoległej logiki gry.
6. Mapa sieci pokazuje wyłącznie to, co gracz odkrył; usługi tylko z hostów,
   które sam skanował (`nmap`/`nc` w historii terminala).

## Etapy
A audyt · B design system · C powłoka OS (desktop/mobile) · D aplikacje ·
E polish/a11y/wydajność · F testy (6 rozdzielczości, regresja wizualna,
regresja mechaniki).

---

# Raport końcowy — BLACKNET OS 2.0

## 1. Co zmieniono
Wymieniono całą **warstwę prezentacji i interakcji**. Mechanika (parser, VFS,
DNS, sieć, ekonomia, alarmy, misje, autozapis, Supabase/RLS) jest **nietknięta**
— UI rozmawia z nią przez te same kanały co wcześniej (`useGame`, read-only
`GameEngine`, `fs*`). Dodano wyłącznie nowe metody **tylko do odczytu**
(`fsListDetailed`, `observedServices`) i pola UI w store (historia powiadomień,
kolejka nagród, kod wyjścia).

Stary interfejs (jedna strona z zakładkami) zastąpiono systemem operacyjnym
BLACKNET OS: pulpit z menedżerem okien na desktopie i pełnoekranowe aplikacje z
dolnym dokiem na telefonie.

## 2. Nowe komponenty (`src/os/`)
- **Design system** (`ui/`): OSButton, OSIconButton, OSPanel, OSModal, OSDialog,
  OSBottomSheet, OSContextMenu, OSTooltip, OSTabs, OSInput, OSStatusIndicator,
  OSBadge, OSEmptyState, OSLoadingState + pułapka fokusu i long-press.
- **Powłoka**: OSWindow (menedżer okien), DesktopShell, MobileShell, OSRoot,
  TopBar, Dock, CommandPalette (⌘K), NotificationCenter + toasty, BootScreen,
  RewardOverlay, StatusWidgets, Logo.
- **Aplikacje** (`apps/`): TerminalApp, MissionsApp, NetworkApp, FilesApp,
  BrowserApp, WalletApp, SettingsApp.
- **Stan/infra**: wm (okna), osStore (magistrala), prefs (preferencje UI poza
  zapisem), viewport (visualViewport/iOS), ThemeSync, session.

## 3. Desktop
Pulpit z tapetą i animowaną siatką, górny pasek glass (menu systemu, nazwa
aktywnej aplikacji, szukaj, alarm, saldo, stan zapisu, powiadomienia, zegar,
konto), **pływające okna** (przesuwanie, zmiana rozmiaru 8 krawędzi,
min/max/zamknij, warstwy z-order, podwójny klik = maksymalizacja, trzymanie w
obszarze roboczym) oraz **dok** z wskaźnikami uruchomienia. Terminal jest
domyślną aplikacją i montuje się raz. Geometria okien zapamiętana w
`localStorage` (poza zapisem gry).

## 4. iPhone
Osobny układ: jedna aplikacja pełnoekranowo, dolny dok (Terminal, Zlecenia,
Sieć, WWW, Więcej → launcher), bottom sheets, menu kontekstowe przez
long-press. Obsłużone: Dynamic Island / safe-area, `100dvh`, śledzenie
**visualViewport** (terminal nie chowa się pod klawiaturą — pasek klawiszy
Tab/Ctrl-C/strzałki/`|`/`/` zostaje nad nią), brak poziomego scrolla,
orientacje, PWA.

## 5. Animacje
Otwieranie/zamykanie/min/max okien, przełączanie aplikacji, rozwijanie kart
misji (grid-rows), toasty, palety, bottom sheets, nagroda za misję (pop),
pasek startu, ambient. Wszystko na `transform`/`opacity` (GPU), spójne krzywe
easing, pełne wsparcie `prefers-reduced-motion` (+ przełącznik w grze). Terminal
bez sztucznych opóźnień — komendy wykonują się natychmiast.

## 6. Dostępność
Semantyczny HTML, role ARIA (dialog/menu/tablist/tab/progressbar/meter/switch/
radiogroup), pułapka fokusu w modalach i powrót fokusu, widoczny `:focus-visible`,
etykiety wszystkich przycisków ikonowych, `aria-live` dla powiadomień, kolor
nigdy jako jedyny sygnał (status zawsze z tekstem), tryb wysokiego kontrastu i
skala UI 90–120%. Paleta przeliczona pod WCAG AA (muted podniesiony do #7B8F97).

## 7. Wydajność
Aplikacje code-split (`next/dynamic`), terminal `memo` i montowany raz (nie
przebudowywany przy zmianach UI, motywu ani czcionki — te stosowane na żywo),
okno = zewnętrzny box na geometrię + wewnętrzny na animację, autozapis bez
zmian. First Load JS: **198 kB** (było 173 kB; +25 kB to ikony, fonty i powłoka
OS, aplikacje poza initial).

## 8. Testy
- **Jednostkowe (Vitest): 87/87** — parser, VFS, sieć, misje (pełne przejście
  20 misji), ekonomia, autozapis. Mechanika bez regresji.
- **E2E (Playwright): 11/11** — logowanie, boot, terminal, ukończenie misji +
  kopia zapasowa, odkrycie hosta na mapie sieci, przetrwanie `pagehide`,
  przejęcie przez drugą kartę, paleta poleceń, oraz **responsywność na 6
  rozdzielczościach** (375/393/430/768/1366/1920) z asercją braku poziomego
  scrolla i poprawnej powłoki.
- **TypeScript**: czysto. **ESLint**: czysto. **Build produkcyjny**: OK.

## 9. Build
`next build` przechodzi; strona `/` prerenderowana statycznie; CSP/nagłówki
bezpieczeństwa zachowane; fonty self-hosted (działają offline/PWA, deterministyczne).

## 10. Kompatybilność zapisów
**Pełna.** Format zapisu niezmieniony; dziennik czyta starsze wpisy (v1). Nowe
preferencje UI trzymane osobno w `blacknet:ui`, poza `SaveGame`. Żadnej migracji.

## 11. Uruchomienie lokalne
`pnpm install && pnpm dev` → http://localhost:3000.
`pnpm test` (jednostkowe), `pnpm test:e2e` (E2E; w CI wskaż binarkę przez
`PLAYWRIGHT_CHROMIUM_PATH`), `pnpm build && pnpm start` (produkcja).

## 12. Git
Gałąź **`feat/blacknet-os-redesign`** (od `master` @ `44d3c26`). Tag lokalny
`v1.1-pre-os-redesign` jako punkt odniesienia. **Nie scalono do `master`**
(zgodnie z zakazem wdrażania na produkcję bez zgody — `master` auto-deployuje na
Vercel).

## Znane ograniczenia
- Testy na iPhonie to **emulacja Chromium**, nie realne Safari iOS — mimo
  obsługi visualViewport/safe-area warto sprawdzić na fizycznym urządzeniu.
- Regresja wizualna: zestaw robi kontrolowane zrzuty i sprawdza strukturę/brak
  scrolla; pełny pixel-diff (`toHaveScreenshot`) jest opcjonalny i wymagałby
  zacommitowania baseline'ów.
- Mapa sieci: układ promienisty wokół „ty"; przy wielu hostach warto docelowo
  dodać layout siłowy.
