-- BLACKNET — schemat bazy danych (PostgreSQL / Supabase)
-- Wszystkie dane gracza są izolowane przez Row Level Security: gracz widzi
-- i zmienia wyłącznie własne wiersze ((select auth.uid()) = user_id). Hasła są
-- obsługiwane przez Supabase Auth (bcrypt) — nigdy nie trzymamy ich tutaj.

-- ──────────────────────────────────────────────────────────────────────────
-- Profile graczy (1:1 z auth.users)
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null
                check (char_length(username) between 3 and 24
                       and username ~ '^[a-zA-Z0-9_]+$'),
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- migawka postępu dla rankingów (nie jest źródłem prawdy):
  level       int not null default 1,
  reputation  int not null default 0
);

comment on table public.profiles is 'Publiczny profil gracza, powiązany 1:1 z kontem auth.';

-- ──────────────────────────────────────────────────────────────────────────
-- Zapisy gry (sloty). Pełny stan świata+gracza w kolumnie JSONB `data`.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.saves (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  slot        int  not null default 0 check (slot between 0 and 9),
  name        text not null default 'Autozapis',
  version     int  not null default 1,
  -- wersja do wykrywania konfliktów zapisu (optimistic locking):
  revision    bigint not null default 1,
  data        jsonb not null,
  -- suma kontrolna do ochrony przed uszkodzeniem zapisu:
  checksum    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, slot)
);

create index if not exists saves_updated_idx on public.saves(user_id, updated_at desc);

comment on table public.saves is 'Sloty zapisu; pełny SaveGame w data (JSONB). revision = optimistic lock.';

-- ──────────────────────────────────────────────────────────────────────────
-- Dziennik zdarzeń gry (audyt/anty-cheat, serwerowo-autorytatywny)
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.game_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists game_events_user_idx on public.game_events(user_id, created_at desc);

-- ──────────────────────────────────────────────────────────────────────────
-- Trigger: utrzymywanie updated_at
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before update on public.saves
  for each row execute function public.touch_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- Trigger: auto-utworzenie profilu po rejestracji
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      'operator_' || substr(new.id::text, 1, 8)
    )
  )
  on conflict (id) do nothing;
  return new;
end; $$;
-- Wywoływana tylko przez wyzwalacz — nie wystawiamy jej przez API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ──────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ──────────────────────────────────────────────────────────────────────────
alter table public.profiles   enable row level security;
alter table public.saves      enable row level security;
alter table public.game_events enable row level security;

-- Profile: każdy zalogowany może czytać profile (ranking), ale pisać tylko swój.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check ((select auth.uid()) = id);

-- Zapisy: pełna izolacja — tylko właściciel.
drop policy if exists saves_all_own on public.saves;
create policy saves_all_own on public.saves
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Zdarzenia: właściciel może czytać i dopisywać.
drop policy if exists events_select_own on public.game_events;
create policy events_select_own on public.game_events
  for select using ((select auth.uid()) = user_id);

drop policy if exists events_insert_own on public.game_events;
create policy events_insert_own on public.game_events
  for insert with check ((select auth.uid()) = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: atomowy zapis slotu z kontrolą rewizji (ochrona przed nadpisaniem)
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.save_game(
  p_slot int,
  p_name text,
  p_data jsonb,
  p_checksum text,
  p_expected_revision bigint default null
)
returns public.saves
language plpgsql security invoker set search_path = public as $$
declare
  v_row public.saves;
begin
  insert into public.saves (user_id, slot, name, data, checksum, revision)
  values (auth.uid(), p_slot, p_name, p_data, p_checksum, 1)
  on conflict (user_id, slot) do update
    set data = excluded.data,
        name = excluded.name,
        checksum = excluded.checksum,
        revision = public.saves.revision + 1
    where p_expected_revision is null
       or public.saves.revision = p_expected_revision
  returning * into v_row;

  if v_row.id is null then
    raise exception 'save_conflict' using errcode = '40001';
  end if;
  return v_row;
end; $$;

-- Zapis tylko dla zalogowanych; anon nie może wywołać RPC.
revoke execute on function public.save_game(int, text, jsonb, text, bigint) from public, anon;
grant execute on function public.save_game(int, text, jsonb, text, bigint) to authenticated;
