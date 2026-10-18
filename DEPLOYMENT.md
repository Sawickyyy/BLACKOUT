# Wdrożenie BLACKNET

BLACKNET działa w dwóch trybach:

1. **Tryb lokalny (zero konfiguracji)** — bez backendu. Zapis w `localStorage`
   przeglądarki. Idealny do testów i gry jednostanowiskowej.
2. **Tryb chmurowy** — konta Supabase (e-mail/hasło, weryfikacja, reset) i
   synchronizacja zapisów między urządzeniami z izolacją RLS.

---

## 1. Uruchomienie lokalne (bez backendu)

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Na ekranie startowym kliknij **„Rozpocznij grę"** (lub „Graj lokalnie"). Postęp
zapisuje się w przeglądarce i wznawia po przeładowaniu.

---

## 2. Konfiguracja Supabase (tryb chmurowy)

### 2.1. Utwórz projekt
1. Załóż projekt na <https://supabase.com>.
2. Zanotuj z **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2.2. Zastosuj schemat bazy
W panelu Supabase otwórz **SQL Editor** i wykonaj zawartość pliku:

```
supabase/migrations/0001_init.sql
```

Tworzy on tabele `profiles`, `saves`, `game_events`, wyzwalacze (auto-profil,
`updated_at`), funkcję RPC `save_game` (atomowy zapis z kontrolą rewizji) oraz
**polityki Row Level Security** izolujące dane każdego gracza.

Alternatywnie, z Supabase CLI:

```bash
supabase link --project-ref <REF>
supabase db push          # zastosuje migracje z supabase/migrations
```

### 2.3. Ustawienia Auth
W **Authentication → Providers → Email** włącz logowanie e-mail/hasło.
W **Authentication → URL Configuration** ustaw:
- **Site URL**: adres produkcyjny (np. `https://blacknet.twojadomena.pl`),
- **Redirect URLs**: ten sam adres (używany przy weryfikacji e-mail i resecie
  hasła — w kodzie `emailRedirectTo`/`redirectTo` = `window.location.origin`).

Weryfikację e-mail możesz włączyć lub wyłączyć w **Authentication → Providers →
Email → Confirm email**. Gdy włączona, po rejestracji gracz dostaje maila i musi
potwierdzić konto przed zalogowaniem (gra to komunikuje).

### 2.4. Zmienne środowiskowe
Skopiuj `.env.example` do `.env.local` i uzupełnij:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

---

## 3. Wdrożenie na Vercel

1. Zaimportuj repozytorium w Vercel (framework wykryje się jako Next.js).
2. W **Settings → Environment Variables** dodaj obie zmienne `NEXT_PUBLIC_…`.
3. Deploy. Po wdrożeniu zaktualizuj **Site URL / Redirect URLs** w Supabase na
   adres produkcyjny.

Build lokalny do weryfikacji:

```bash
pnpm build && pnpm start
```

---

## 4. PWA / instalacja

Aplikacja dostarcza `public/manifest.webmanifest`, ikonę i service worker
(`public/sw.js`, rejestrowany po załadowaniu). Na iPhone: Safari → Udostępnij →
„Dodaj do ekranu początkowego". Shell aplikacji jest cache'owany do działania
offline; synchronizacja z chmurą wymaga połączenia.

---

## 5. Testy przed wdrożeniem

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # next lint
pnpm test           # Vitest (jednostkowe + pełne przejście misji)
pnpm test:e2e       # Playwright (wymaga przeglądarki; patrz niżej)
```

W środowisku CI z preinstalowanym Chromium wskaż binarkę headless:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/ścieżka/do/headless_shell pnpm test:e2e
```

---

## 6. Usuwanie konta

Przycisk **„Usuń konto / dane"** w Ustawieniach:
- w trybie lokalnym — kasuje wszystkie sloty zapisu z przeglądarki,
- w trybie chmurowym — kasuje wiersze gracza (RLS) i wylogowuje.

> Pełne usunięcie wpisu z `auth.users` wymaga uprawnień serwisowych. Dodaj w tym
> celu funkcję brzegową Supabase (Edge Function) z kluczem `service_role`
> wywołującą `auth.admin.deleteUser(uid)` — nie umieszczaj klucza `service_role`
> po stronie klienta.

---

## 7. Dalsze utwardzanie (opcjonalne)

Silnik gry jest izomorficzny (czysty TypeScript). Aby uczynić wykonywanie komend
w pełni autorytatywnym po stronie serwera:

1. Utwórz trasę API (`src/app/api/command/route.ts`) lub funkcję brzegową, która
   ładuje zapis gracza (po `auth.uid()`), tworzy `new GameEngine(save)`, wykonuje
   `engine.run(line)` i zapisuje wynik przez `save_game`.
2. Przełącz `store.run` na wywołanie tej trasy zamiast lokalnego silnika.
3. Dodaj ograniczanie zapytań (rate limiting) na poziomie trasy/Edge.

Dzięki rozdzieleniu logiki od UI nie wymaga to zmian w samym silniku.
