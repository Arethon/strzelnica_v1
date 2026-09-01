-- ============================================================================
-- Szablon "onboardingu" nowej strzelnicy — uruchamiany RĘCZNIE przez Ciebie
-- w Supabase SQL Editor za każdym razem, gdy podpinasz nowego klienta
-- (zgodnie z ustaleniem: brak publicznej rejestracji, konta zakłada dev).
--
-- Kroki:
--   1) Dashboard -> Authentication -> Users -> Add user -> wpisz e-mail
--      i hasło personelu tej strzelnicy. Skopiuj wygenerowane User UID.
--   2) Podmień placeholdery poniżej (OWNER_USER_ID, nazwy, godziny) i
--      uruchom cały blok w SQL Editor.
-- ============================================================================

-- 1) Sama strzelnica -----------------------------------------------------
insert into public.ranges (slug, name, owner_user_id)
values ('demo-strzelnica', 'Demo Strzelnica', 'a427e5c0-c8d7-4c75-b0d0-1f9814021f4c')
returning id;
-- ⤷ zapisz zwrócone `id` — potrzebne w kolejnych insertach jako RANGE_ID.

-- 2) Osie strzeleckie -----------------------------------------------------
insert into public.lanes (range_id, name, position) values
  ('RANGE_ID_TUTAJ', 'Oś 1', 1),
  ('RANGE_ID_TUTAJ', 'Oś 2', 2),
  ('RANGE_ID_TUTAJ', 'Oś 3', 3);

-- 3) Godziny otwarcia — 0 = niedziela ... 6 = sobota (JS Date.getDay()) ---
insert into public.opening_hours (range_id, weekday, is_closed, opens_at, closes_at) values
  ('RANGE_ID_TUTAJ', 0, false, '10:00', '18:00'), -- niedziela
  ('RANGE_ID_TUTAJ', 1, false, '09:00', '21:00'), -- poniedziałek
  ('RANGE_ID_TUTAJ', 2, false, '09:00', '21:00'), -- wtorek
  ('RANGE_ID_TUTAJ', 3, false, '09:00', '21:00'), -- środa
  ('RANGE_ID_TUTAJ', 4, false, '09:00', '21:00'), -- czwartek
  ('RANGE_ID_TUTAJ', 5, false, '09:00', '22:00'), -- piątek
  ('RANGE_ID_TUTAJ', 6, false, '09:00', '22:00'); -- sobota

-- Link do widgetu tej strzelnicy: /book?range=demo-strzelnica
-- Link do panelu admina: /admin (logowanie e-mailem/hasłem ustawionym w kroku 1)
