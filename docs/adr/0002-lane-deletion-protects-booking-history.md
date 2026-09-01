---
status: accepted
---

# Usunięcie Osi nie kasuje historii Rezerwacji, i jest blokowane przy przyszłych potwierdzonych rezerwacjach

`bookings.lane_id` jest nullable z `on delete set null` (nie `on delete cascade`), a triger `enforce_lane_deletion` blokuje `DELETE` na `lanes`, dopóki istnieje choć jedna przyszła Rezerwacja ze statusem `confirmed` na tej Osi. Powód: naiwna kaskada (`on delete cascade`) po usunięciu Osi bezpowrotnie kasowała powiązane Rezerwacje razem z danymi osobowymi Gościa (imię, nazwisko, telefon) — ciche, nieodwracalne usunięcie danych bez ostrzeżenia Personelu. Rozważaliśmy prostszy wariant `on delete restrict` blokujący usunięcie Osi, jeśli ma JAKąkolwiek historię rezerwacji (nawet przeszłą/odwołaną) — odrzucony, bo trwale uniemożliwiłby usunięcie każdej używanej Osi. Konsekwencja: Personel nie ma też twardego `DELETE` na `bookings` (tylko `UPDATE status='cancelled'`) — odwołanie rezerwacji jest zawsze soft-delete, nigdy kasowaniem rekordu.
