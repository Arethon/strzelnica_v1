-- ============================================================================
-- Strzelnica_widget — schemat bazy danych (Supabase / Postgres)
--
-- Jak zastosować: wklej całą zawartość tego pliku do Supabase Dashboard →
-- SQL Editor → New query → Run. Zrób to RAZ na projekcie DEV i RAZ na
-- projekcie TEST (dwa osobne, identyczne projekty).
--
-- Model multi-tenant: jedna strzelnica ("range") = jeden rekord w `ranges`,
-- powiązany 1:1 z kontem Supabase Auth personelu (owner_user_id). Izolacja
-- danych między strzelnicami jest wymuszana przez Row Level Security (RLS),
-- nie przez logikę aplikacji.
--
-- Konwencja `weekday` w opening_hours: 0 = niedziela … 6 = sobota, zgodnie
-- z JS `Date.prototype.getDay()` — celowo, żeby frontend nie musiał tłumaczyć
-- indeksów.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Tabele
-- ----------------------------------------------------------------------------

create table if not exists public.ranges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.ranges is 'Jedna strzelnica = jedna lokalizacja. owner_user_id to konto personelu (1:1).';
comment on column public.ranges.slug is 'Identyfikator w URL widgetu, np. /book?range=<slug>.';

create table if not exists public.lanes (
  id uuid primary key default gen_random_uuid(),
  range_id uuid not null references public.ranges(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  range_id uuid not null references public.ranges(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  constraint opening_hours_range_weekday_unique unique (range_id, weekday),
  constraint opening_hours_times_present check (
    is_closed = true or (opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);
comment on column public.opening_hours.weekday is '0 = niedziela ... 6 = sobota (JS Date.getDay()).';

create table if not exists public.slot_blocks (
  id uuid primary key default gen_random_uuid(),
  range_id uuid not null references public.ranges(id) on delete cascade,
  lane_id uuid not null references public.lanes(id) on delete cascade,
  block_date date not null,
  start_time time not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint slot_blocks_hour_aligned check (
    extract(minute from start_time) = 0 and extract(second from start_time) = 0
  )
);
create unique index if not exists slot_blocks_lane_slot_unique
  on public.slot_blocks (lane_id, block_date, start_time);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  range_id uuid not null references public.ranges(id) on delete cascade,
  -- Nullable celowo: usunięcie Osi nie może kasować historii rezerwacji
  -- gościa (dane osobowe). Trigger `enforce_lane_deletion` i tak blokuje
  -- usunięcie Osi, dopóki ma przyszłe potwierdzone rezerwacje — więc
  -- `lane_id` trafia na null wyłącznie dla rezerwacji już przeszłych/odwołanych.
  lane_id uuid references public.lanes(id) on delete set null,
  booking_date date not null,
  start_time time not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  guest_name text not null check (length(trim(guest_name)) > 0),
  guest_surname text not null check (length(trim(guest_surname)) > 0),
  guest_phone text not null check (length(trim(guest_phone)) > 0),
  guest_email text,
  party_size integer not null default 1 check (party_size >= 1),
  accepted_terms boolean not null default false check (accepted_terms = true),
  created_at timestamptz not null default now(),
  constraint bookings_hour_aligned check (
    extract(minute from start_time) = 0 and extract(second from start_time) = 0
  )
);
-- Zapobiega podwójnej rezerwacji tej samej osi na ten sam slot; nie liczy
-- odwołanych rezerwacji, więc slot po anulowaniu wraca do puli.
create unique index if not exists bookings_lane_slot_unique
  on public.bookings (lane_id, booking_date, start_time)
  where status = 'confirmed';

create index if not exists bookings_range_date_idx on public.bookings (range_id, booking_date);
create index if not exists slot_blocks_range_date_idx on public.slot_blocks (range_id, block_date);

-- ----------------------------------------------------------------------------
-- Reguła biznesowa: okno rezerwacji (14 dni w przód, min. 1h wyprzedzenia).
-- Wymuszona też na poziomie bazy jako obrona w głąb — frontend i tak nie
-- pokaże niedozwolonych slotów, ale API (anon key) mogłoby zostać użyte
-- bezpośrednio z pominięciem UI.
-- ----------------------------------------------------------------------------

create or replace function public.enforce_booking_window()
returns trigger
language plpgsql
as $$
declare
  now_warsaw timestamp := (now() at time zone 'Europe/Warsaw');
begin
  if new.status = 'confirmed' then
    if new.booking_date > now_warsaw::date + interval '14 days' then
      raise exception 'booking_date is beyond the 14-day booking window';
    end if;
    if (new.booking_date + new.start_time) < now_warsaw + interval '1 hour' then
      raise exception 'booking must be made at least 1 hour in advance';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_enforce_window on public.bookings;
create trigger bookings_enforce_window
  before insert or update on public.bookings
  for each row execute function public.enforce_booking_window();

-- ----------------------------------------------------------------------------
-- Reguła biznesowa: nie wolno usunąć Osi, która ma przyszłe potwierdzone
-- rezerwacje (uniknięcie ciszej utraty danych gościa). Przeszłe/odwołane
-- rezerwacje nie blokują usunięcia — ich lane_id trafia na null (patrz
-- `on delete set null` powyżej), historia gościa zostaje zachowana.
-- ----------------------------------------------------------------------------

create or replace function public.enforce_lane_deletion()
returns trigger
language plpgsql
as $$
declare
  now_warsaw timestamp := (now() at time zone 'Europe/Warsaw');
begin
  if exists (
    select 1 from public.bookings b
    where b.lane_id = old.id
      and b.status = 'confirmed'
      and (b.booking_date + b.start_time) >= now_warsaw
  ) then
    raise exception 'cannot delete lane %: it has upcoming confirmed bookings', old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists lanes_enforce_deletion on public.lanes;
create trigger lanes_enforce_deletion
  before delete on public.lanes
  for each row execute function public.enforce_lane_deletion();

-- ----------------------------------------------------------------------------
-- Helper: czy bieżący zalogowany użytkownik jest właścicielem danej strzelnicy.
-- SECURITY DEFINER + ustalony search_path, zgodnie z zaleceniami Supabase dla
-- funkcji pomocniczych używanych w politykach RLS.
-- ----------------------------------------------------------------------------

create or replace function public.is_range_owner(target_range_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ranges r
    where r.id = target_range_id and r.owner_user_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security — włączamy na wszystkich tabelach i resetujemy domyślne
-- uprawnienia, żeby jawnie kontrolować co widzi `anon` (widget, goście) a co
-- `authenticated` (zalogowany personel strzelnicy).
-- ----------------------------------------------------------------------------

alter table public.ranges enable row level security;
alter table public.lanes enable row level security;
alter table public.opening_hours enable row level security;
alter table public.slot_blocks enable row level security;
alter table public.bookings enable row level security;

revoke all on public.ranges from anon, authenticated;
revoke all on public.lanes from anon, authenticated;
revoke all on public.opening_hours from anon, authenticated;
revoke all on public.slot_blocks from anon, authenticated;
revoke all on public.bookings from anon, authenticated;

-- ranges: publicznie widoczne tylko pola potrzebne do zresolwowania slug → id.
-- owner_user_id nigdy nie trafia do anon.
grant select (id, slug, name) on public.ranges to anon;
grant select on public.ranges to authenticated;
grant update (name) on public.ranges to authenticated;

drop policy if exists "public can read ranges" on public.ranges;
create policy "public can read ranges"
  on public.ranges for select
  to anon
  using (true);

drop policy if exists "owner can read own range" on public.ranges;
create policy "owner can read own range"
  on public.ranges for select
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "owner can update own range" on public.ranges;
create policy "owner can update own range"
  on public.ranges for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Zakładanie kont/strzelnic robimy ręcznie z poziomu SQL Editora (rola
-- postgres omija RLS), więc celowo brak polityki INSERT dla anon/authenticated.

-- lanes: publiczny odczyt (widget musi wiedzieć jakie osie istnieją),
-- pełne zarządzanie tylko przez właściciela danej strzelnicy.
grant select on public.lanes to anon, authenticated;
grant insert, update, delete on public.lanes to authenticated;

drop policy if exists "public can read lanes" on public.lanes;
create policy "public can read lanes"
  on public.lanes for select
  to anon, authenticated
  using (true);

drop policy if exists "owner can manage own lanes" on public.lanes;
create policy "owner can manage own lanes"
  on public.lanes for all
  to authenticated
  using (public.is_range_owner(range_id))
  with check (public.is_range_owner(range_id));

-- opening_hours: analogicznie jak lanes.
grant select on public.opening_hours to anon, authenticated;
grant insert, update, delete on public.opening_hours to authenticated;

drop policy if exists "public can read opening hours" on public.opening_hours;
create policy "public can read opening hours"
  on public.opening_hours for select
  to anon, authenticated
  using (true);

drop policy if exists "owner can manage own opening hours" on public.opening_hours;
create policy "owner can manage own opening hours"
  on public.opening_hours for all
  to authenticated
  using (public.is_range_owner(range_id))
  with check (public.is_range_owner(range_id));

-- slot_blocks: publiczny odczyt bez kolumny `reason` (wewnętrzna notatka
-- admina), pełne zarządzanie tylko przez właściciela.
grant select (id, range_id, lane_id, block_date, start_time) on public.slot_blocks to anon;
grant select on public.slot_blocks to authenticated;
grant insert, update, delete on public.slot_blocks to authenticated;

drop policy if exists "public can read slot blocks" on public.slot_blocks;
create policy "public can read slot blocks"
  on public.slot_blocks for select
  to anon, authenticated
  using (true);

drop policy if exists "owner can manage own slot blocks" on public.slot_blocks;
create policy "owner can manage own slot blocks"
  on public.slot_blocks for all
  to authenticated
  using (public.is_range_owner(range_id))
  with check (public.is_range_owner(range_id));

-- bookings: najbardziej wrażliwa tabela (dane osobowe gościa). `anon` widzi
-- WYŁĄCZNIE kolumny potrzebne do wyliczenia zajętości slotu (nigdy imienia,
-- telefonu, e-maila) i tylko rezerwacje potwierdzone; może tworzyć nowe
-- rezerwacje, ale nie może ich odczytać z powrotem (brak GRANT SELECT na
-- pełne kolumny), ani zmieniać/kasować. Personel widzi i zarządza pełnymi
-- danymi, ale tylko dla swojej własnej strzelnicy.
grant select (id, range_id, lane_id, booking_date, start_time, status) on public.bookings to anon;
grant insert (range_id, lane_id, booking_date, start_time, status, guest_name, guest_surname, guest_phone, guest_email, party_size, accepted_terms)
  on public.bookings to anon;
-- Celowo brak DELETE dla authenticated: "odwołanie" rezerwacji przez
-- Personel to zawsze UPDATE status -> 'cancelled' (soft-delete), nigdy
-- twarde skasowanie rekordu z danymi gościa.
grant select, insert, update on public.bookings to authenticated;

drop policy if exists "public can see slot occupancy" on public.bookings;
create policy "public can see slot occupancy"
  on public.bookings for select
  to anon
  using (status = 'confirmed');

drop policy if exists "guests can create bookings" on public.bookings;
create policy "guests can create bookings"
  on public.bookings for insert
  to anon
  with check (status = 'confirmed');

drop policy if exists "owner can read own bookings" on public.bookings;
create policy "owner can read own bookings"
  on public.bookings for select
  to authenticated
  using (public.is_range_owner(range_id));

drop policy if exists "owner can create own bookings" on public.bookings;
create policy "owner can create own bookings"
  on public.bookings for insert
  to authenticated
  with check (public.is_range_owner(range_id));

drop policy if exists "owner can update own bookings" on public.bookings;
create policy "owner can update own bookings"
  on public.bookings for update
  to authenticated
  using (public.is_range_owner(range_id))
  with check (public.is_range_owner(range_id));

-- Brak polityki/GRANT DELETE dla bookings: patrz komentarz przy GRANT powyżej.
