---
status: accepted
---

# Naiwny czas lokalny dla daty/godziny slotu, timestamptz tylko dla metadanych

Aplikacja obsługuje wyłącznie jedną strefę czasową (Europe/Warsaw, świadome uproszczenie v1). `booking_date` i `start_time` (slot, godziny otwarcia, blokady) są przechowywane jako naiwna data/godzina lokalna, bez informacji o strefie — reguła minimalnego wyprzedzenia (1h) porównuje je wprost względem `now()` skonwertowanego do `Europe/Warsaw`. Pola czysto techniczne (`created_at` i inne znaczniki czasu zdarzeń) używają `timestamptz`/UTC. Alternatywą było trzymanie wszystkiego w `timestamptz` z konwersją przy każdym porównaniu i wyświetlaniu — odrzucone, bo przy jednej, ustalonej strefie dodaje tylko ryzyko błędów (podwójna konwersja, DST) bez żadnej korzyści, skoro system i tak nie wspiera wielu stref. Zmiana tego podejścia później wymaga migracji danych (dopisania strefy do istniejących rekordów), stąd zapisane jako decyzja, nie przypadek.
