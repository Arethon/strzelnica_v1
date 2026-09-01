# Platforma rezerwacji osi strzeleckich

Multi-tenantowa platforma rezerwacji terminów na strzelnicach: osadzalny widget dla gości oraz panel administracyjny dla personelu strzelnicy. Ten kontekst obejmuje cały system (brak podziału na osobne bounded context).

## Language

**Strzelnica (Range)**:
Pojedynczy tenant platformy — fizyczny obiekt sportowy, który wdraża u siebie widget rezerwacyjny. Ma własny `slug`, własne osie, godziny otwarcia i personel.

**Oś strzelecka (Lane)**:
Pojedyncze stanowisko strzeleckie należące do jednej Strzelnicy. Jednostka, na którą rezerwuje się slot.

**Gość (Guest)**:
Osoba dokonująca rezerwacji, bez zakładania konta. Nie jest trwałą encją — każda Rezerwacja niesie własną kopię danych Gościa (imię, nazwisko, telefon, opcjonalny e-mail) i nie jest w żaden sposób powiązana z innymi rezerwacjami tej samej osoby (brak dopasowania po telefonie, brak historii, brak profilu).
_Avoid_: Klient (używane potocznie w PRD §1, ale w systemie nie ma encji "Klient" — celowa decyzja, żeby nikt nie zaimplementował historii/profilu gościa myśląc, że to oczywiste).

**Rezerwacja (Booking)**:
Zarezerwowanie jednej Osi na jeden slot godzinowy przez jednego Gościa. Zawsze dotyczy dokładnie jednej Osi (brak rezerwacji grupowych na wiele osi naraz). Ma dokładnie dwa stany: `confirmed` (domyślny, od razu po utworzeniu — brak stanu pośredniego "oczekująca") i `cancelled`. Odwołanie zwalnia slot (dany termin+Oś) z powrotem do puli dostępnych — nie blokuje ponownej rezerwacji. Potwierdzeniem dla Gościa jest wyłącznie ekran w widgecie; nie ma numeru referencyjnego ani żadnego trwałego dowodu poza tym, że rezerwacja widnieje na liście w panelu Personelu.

**Slot**:
Najmniejsza rezerwowalna jednostka: konkretna Oś + konkretny dzień + konkretna godzina (60 min). Dostępność Slotu wynika z Godzin otwarcia, ewentualnej Blokady, istniejącej Rezerwacji (`confirmed`) i reguły minimalnego wyprzedzenia.

**Personel (Staff)**:
Pracownik/właściciel jednej Strzelnicy, zalogowany do panelu administracyjnego. Model 1 konto = 1 Strzelnica (brak wielu pracowników/ról na razie).

**Operator platformy (Platform operator)**:
Osoba prowadząca całą platformę; onboarduje nowe Strzelnice ręcznie (brak samorejestracji).

**Blokada (Slot block)**:
Ręczne zablokowanie konkretnego slotu (data + godzina + Oś) przez Personel, bez tworzenia Rezerwacji — np. konserwacja, wydarzenie prywatne.

**Godziny otwarcia (Opening hours)**:
Harmonogram dostępności Strzelnicy, ustalany osobno dla każdego dnia tygodnia (z opcją "zamknięte"). Nie obsługuje wyjątków jednorazowych (święta) — te symuluje się Blokadami.
