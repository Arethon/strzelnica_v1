# PRD: Platforma rezerwacji osi strzeleckich

**Status:** v1 zaimplementowane i zweryfikowane end-to-end (patrz [Arethon/Strzelnica_widget#1](https://github.com/Arethon/Strzelnica_widget/issues/1))
**Ostatnia aktualizacja:** 2026-09-01

## 1. Kontekst i problem

Strzelnice sportowe zarządzają dostępnością swoich osi strzeleckich ręcznie (telefon, notatnik, arkusz kalkulacyjny). Prowadzi to do:

- podwójnych rezerwacji tego samego terminu,
- straconego czasu personelu na obsługę telefonów,
- braku samoobsługowego kanału rezerwacji dla klientów, którzy chcą po prostu zobaczyć wolne terminy i się zapisać.

Różne strzelnice mają różne strony internetowe (albo żadnych), więc rozwiązanie musi dać się osadzić na dowolnej istniejącej stronie bez jej przebudowy.

## 2. Cel produktu

Dostarczyć **osadzalny widget rezerwacyjny** plus **panel administracyjny**, które strzelnica może wdrożyć u siebie w kilka minut (jeden `<iframe>`), bez utrzymywania własnej infrastruktury — cały backend jest współdzielony, multi-tenantowy, hostowany w Supabase.

### Cele produktowe

- Zero tarcia dla gościa: rezerwacja bez zakładania konta, w mniej niż minutę.
- Zero infrastruktury dla strzelnicy: jeden link/iframe, konto zakładane przez operatora platformy.
- Dane w pełni odizolowane między strzelnicami (multi-tenant przez RLS, nie przez logikę aplikacji).
- Reguły biznesowe wymuszone podwójnie (UI + baza), żeby nie dało się ich ominąć wywołując API bezpośrednio.

### Poza celami (patrz też §6 Out of Scope)

- Nie jest to system zarządzania całą strzelnicą (magazyn broni, ewidencja klientów, kasa fiskalna) — wyłącznie rezerwacja terminów.
- Nie jest to marketplace z samorejestracją i płatnościami platformowymi (prowizje) — na razie B2B, onboarding ręczny.

## 3. Użytkownicy

| Rola | Kim jest | Co robi w systemie |
|---|---|---|
| **Gość** | Klient strzelnicy, odwiedza stronę strzelnicy | Wybiera dzień, oś, slot; rezerwuje bez logowania |
| **Personel strzelnicy** | Pracownik/właściciel jednej strzelnicy | Loguje się do panelu; zarządza osiami, godzinami, rezerwacjami, blokadami |
| **Operator platformy** | Osoba prowadząca całą platformę (deweloper/właściciel produktu) | Onboarduje nowe strzelnice ręcznie przez SQL Editor; utrzymuje kod i infrastrukturę |

## 4. Zakres funkcjonalny (v1 — zaimplementowane)

### 4.1 Widget rezerwacyjny (`/book?range=<slug>`)

- Osadzany przez `<iframe>` na dowolnej stronie strzelnicy; strzelnica identyfikowana przez `slug` w URL.
- Wybór dnia z najbliższych **14 dni**.
- Widok dostępności osobno dla każdej osi strzeleckiej danego dnia, sloty godzinowe (60 min).
- Sloty niedostępne, jeśli: strzelnica zamknięta o tej porze, slot już zarezerwowany, slot ręcznie zablokowany przez admina, albo slot narusza **minimalne wyprzedzenie 1h**.
- Rezerwacja bez konta: imię, nazwisko, telefon (wymagany), email (opcjonalny), liczba osób, checkbox akceptacji regulaminu/pełnoletności (wymagany).
- Rezerwacja **od razu potwierdzona** (auto-confirm) — bez akceptacji admina.
- Ochrona przed podwójną rezerwacją: unikalny indeks w bazie; jeśli ktoś zajmie slot w międzyczasie, gość dostaje czytelny komunikat i wraca do wyboru terminu.
- Ekran potwierdzenia z podsumowaniem terminu i danych gościa, z opcją zarezerwowania kolejnego terminu bez przeładowania.
- Brak: płatności online, e-maili z potwierdzeniem, samoobsługowego odwoływania rezerwacji.

### 4.2 Panel administracyjny (`/admin`, `/admin/dashboard`)

- Logowanie e-mail/hasło (Supabase Auth), model **1 konto = 1 strzelnica**.
- **Rezerwacje**: lista na wybrany dzień, dane gościa, status, możliwość odwołania.
- **Osie**: CRUD (dodaj, zmień nazwę, usuń).
- **Godziny otwarcia**: osobne dla każdego dnia tygodnia, z opcją "zamknięte"; zapis zbiorczy (upsert 7 wierszy naraz).
- **Blokady**: ręczne blokowanie slotu (data, godzina, oś, opcjonalny powód) bez tworzenia fikcyjnej rezerwacji — np. konserwacja, wydarzenie prywatne.
- Widoczny link do widgetu tej strzelnicy, do skopiowania i wklejenia na własną stronę.
- Brak: samorejestracji, wielu pracowników/ról, wielu lokalizacji per konto.

### 4.3 Backend / dane

- Jeden multi-tenant projekt Supabase (Postgres + Auth), izolacja przez Row Level Security — nie przez logikę aplikacji.
- Tabele: `ranges`, `lanes`, `opening_hours` (per dzień tygodnia), `slot_blocks`, `bookings`.
- Reguły biznesowe (okno 14 dni, wyprzedzenie 1h, unikalność slot+oś) wymuszone **zarówno w UI, jak i triggerem/indeksem w bazie** — obrona w głąb, niezależna od tego, czy ktoś ominie widget i uderzy w API bezpośrednio.
- Dane osobowe gościa (imię, nazwisko, telefon, email) nigdy nie są czytelne dla anonimowego klienta widgetu ani innej strzelnicy — widoczne wyłącznie dla właściciela danej strzelnicy po zalogowaniu (wymuszone na poziomie kolumn i wierszy w Postgresie).

## 5. Wymagania niefunkcjonalne

- **Bez Dockera** — środowiska dev/test to dwa osobne, darmowe projekty Supabase w chmurze; brak lokalnego stacku Supabase CLI (który wymagałby Dockera pod maską).
- **Testowalność**: cała logika dostępności slotów w jednym czystym, bezstanowym module (`src/lib/slots.ts`), pokryta testami jednostkowymi (Vitest, 24 testy). Pełny flow rezerwacji pokryty testem e2e (Playwright) przeciw prawdziwemu, odizolowanemu projektowi Supabase TEST.
- **Osadzalność**: widget musi działać w `<iframe>` bez konfliktów CSS z hostującą stroną.
- **Jedna strefa czasowa** (Europa/Warszawa) — świadome uproszczenie v1, bez obsługi wielu stref.
- Frontend: React + Vite + TypeScript + Tailwind CSS; build produkcyjny to statyczny `dist/` gotowy na dowolny static hosting (Vercel/Netlify/Cloudflare Pages).

## 6. Poza zakresem (v1)

- Płatności online za rezerwację (Stripe czy inny procesor) — płatność na miejscu.
- E-maile lub SMS-y z potwierdzeniem rezerwacji.
- Samoobsługowe odwoływanie/zmiana rezerwacji przez gościa (np. tokenizowany link).
- Rezerwacja wielu osi naraz w jednym bookingu (grupa) — jedna rezerwacja = jedna oś + liczba osób.
- Wiele lokalizacji fizycznych pod jednym kontem strzelnicy.
- Wielu pracowników z rolami per strzelnica (obecnie 1 konto = 1 strzelnica).
- Publiczny formularz samorejestracji nowej strzelnicy — onboarding ręczny przez operatora.
- Obsługa wyjątków od standardowych godzin otwarcia (święta, jednorazowe zamknięcia) — da się zasymulować ręcznymi blokadami slotów.
- Wdrożenie produkcyjne (hosting, domena, CI/CD).
- Testy automatyczne panelu admina (obecnie weryfikowany manualnie).

## 7. Otwarte kierunki rozwoju (nie zaplanowane, do rozważenia)

W kolejności malejącego prawdopodobieństwa realizacji jako następny krok:

1. Wdrożenie produkcyjne + CI (deploy + GitHub Actions odpalający testy na push).
2. E-maile z potwierdzeniem rezerwacji.
3. Samoobsługowe odwoływanie rezerwacji przez gościa.
4. Płatności online (zaliczka lub pełna kwota) przy rezerwacji.
5. Samorejestracja nowej strzelnicy zamiast ręcznego onboardingu.
6. Wielu pracowników z rolami per strzelnica.

## 8. Metryki sukcesu (proponowane, nie instrumentowane jeszcze)

- Liczba strzelnic korzystających z widgetu.
- Liczba rezerwacji zrealizowanych przez widget vs. odwołanych/nie-doszłych do skutku.
- Odsetek prób rezerwacji zakończonych błędem "slot zajęty" (proxy na konflikty przy dużym ruchu).
- Czas od otwarcia widgetu do potwierdzonej rezerwacji (proxy na tarcie w UX).

## 9. Odniesienia

- Pełna specyfikacja techniczna (user stories, decyzje implementacyjne, decyzje testowe): [Arethon/Strzelnica_widget#1](https://github.com/Arethon/Strzelnica_widget/issues/1)
- Schemat bazy danych: `supabase/schema.sql`
- Szablon onboardingu nowej strzelnicy: `supabase/seed.example.sql`
- Konfiguracja skilli agentowych (tracker, etykiety, domain docs): `docs/agents/`
