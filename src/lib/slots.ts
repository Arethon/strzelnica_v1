/**
 * Logika liczenia dostępności slotów (PRD §4.1, §5). Moduł jest celowo
 * czysty i bezstanowy: brak I/O (fetch/Supabase), brak `Date.now()` /
 * `new Date()` w środku — `now` jest zawsze parametrem wstrzykiwanym przez
 * wywołującego (widget, testy). Dzięki temu cała logika jest deterministyczna
 * i testowalna bez mockowania zegara.
 *
 * Zgodnie z ADR 0001 (naiwny czas lokalny dla slotów): daty/godziny slotów
 * są traktowane jako naiwny czas lokalny Europe/Warsaw, bez konwersji stref
 * — `now` to zwykły `Date`, którego lokalne gettery (`getFullYear` itd.) są
 * odczytywane wprost, tak jak w schemacie bazy (`now() at time zone
 * 'Europe/Warsaw'`).
 */

/** 0 = niedziela … 6 = sobota, zgodnie z `Date.prototype.getDay()` (patrz schema.sql). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Godziny otwarcia Strzelnicy dla jednego dnia tygodnia. */
export interface OpeningHoursForDay {
  isClosed: boolean;
  /** "HH:MM", wymagane gdy `isClosed` jest `false`. */
  opensAt: string | null;
  /** "HH:MM", wymagane gdy `isClosed` jest `false`. */
  closesAt: string | null;
}

export type SlotUnavailableReason = "closed" | "too-soon" | "occupied";

export interface SlotAvailability {
  /** "HH:00" — początek slotu godzinowego. */
  startTime: string;
  available: boolean;
  /** `null` gdy `available` jest `true`. */
  reason: SlotUnavailableReason | null;
}

export interface LaneInput {
  id: string;
  name: string;
}

export interface LaneSlots {
  laneId: string;
  laneName: string;
  slots: SlotAvailability[];
}

/** Minimalne wyprzedzenie rezerwacji (PRD §4.1, schema.sql `enforce_booking_window`). */
export const MIN_LEAD_TIME_MS = 60 * 60 * 1000;

/** Okno rezerwacji w dniach naprzód (schema.sql `enforce_booking_window`). */
export const BOOKING_WINDOW_DAYS = 14;

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** "YYYY-MM-DD" z lokalnych składowych daty (bez konwersji strefy). */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

/** Weekday (0=niedziela…6=sobota) dnia opisanego przez `dateKey`. */
export function weekdayOfDateKey(dateKey: string): Weekday {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(year, month - 1, day).getDay() as Weekday;
}

/** Łączy `dateKey` ("YYYY-MM-DD") z godziną "HH:MM" w lokalny `Date`. */
function toLocalDateTime(dateKey: string, time: string): Date {
  const { year, month, day } = parseDateKey(dateKey);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

/** Liczba pełnych dni kalendarzowych między `now` (dzień dzisiejszy) a `dateKey`. Może być ujemna. */
function daysFromToday(dateKey: string, now: Date): number {
  const today = toLocalDateTime(toDateKey(now), "00:00");
  const target = toLocalDateTime(dateKey, "00:00");
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

/**
 * Czy `dateKey` mieści się w oknie rezerwacji: od dziś do `now` + `windowDays`
 * dni włącznie — zgodnie z `enforce_booking_window` w schema.sql, który
 * odrzuca wyłącznie `booking_date > dziś + 14 dni` (dzień "+14" jest jeszcze
 * dozwolony).
 */
export function isWithinBookingWindow(
  dateKey: string,
  now: Date,
  windowDays: number = BOOKING_WINDOW_DAYS,
): boolean {
  const offset = daysFromToday(dateKey, now);
  return offset >= 0 && offset <= windowDays;
}

/**
 * Lista wybieralnych dni (najbliższe `windowDays` + dziś), jako "YYYY-MM-DD",
 * do wypełnienia selektora dnia w widgecie.
 */
export function getSelectableDays(now: Date, windowDays: number = BOOKING_WINDOW_DAYS): string[] {
  const days: string[] = [];
  for (let offset = 0; offset <= windowDays; offset += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    days.push(toDateKey(d));
  }
  return days;
}

/** Generuje kolejne godziny "HH:00" pomiędzy `opensAt` (włącznie) a `closesAt` (wyłącznie). */
function hourlyStartTimes(opensAt: string, closesAt: string): string[] {
  const [openHour] = opensAt.split(":").map(Number);
  const [closeHour, closeMinute] = closesAt.split(":").map(Number);
  const lastHour = closeMinute > 0 ? closeHour : closeHour - 1;
  const starts: string[] = [];
  for (let hour = openHour; hour <= lastHour; hour += 1) {
    starts.push(`${pad2(hour)}:00`);
  }
  return starts;
}

/**
 * Sloty godzinowe jednej Osi, dla jednego dnia, z uwzględnieniem godzin
 * otwarcia, wyprzedzenia 1h i (opcjonalnie) zajętości (rezerwacja lub
 * blokada — te są rzeczą wywołującego, moduł nie wie skąd pochodzą).
 */
export function computeSlotsForDay(params: {
  dateKey: string;
  now: Date;
  openingHours: OpeningHoursForDay;
  /** Zbiór "HH:00" już zajętych (rezerwacja `confirmed` lub Blokada) tego dnia dla tej Osi. */
  occupiedStartTimes?: ReadonlySet<string>;
}): SlotAvailability[] {
  const { dateKey, now, openingHours, occupiedStartTimes } = params;

  if (openingHours.isClosed || !openingHours.opensAt || !openingHours.closesAt) {
    return [];
  }

  return hourlyStartTimes(openingHours.opensAt, openingHours.closesAt).map((startTime) => {
    const slotStart = toLocalDateTime(dateKey, startTime);
    const tooSoon = slotStart.getTime() - now.getTime() < MIN_LEAD_TIME_MS;
    const occupied = occupiedStartTimes?.has(startTime) ?? false;

    let reason: SlotUnavailableReason | null = null;
    if (tooSoon) {
      reason = "too-soon";
    } else if (occupied) {
      reason = "occupied";
    }

    return { startTime, available: reason === null, reason };
  });
}

/**
 * Sloty godzinowe wszystkich Osi dla jednego dnia. Jeśli dzień jest poza
 * oknem rezerwacji (patrz {@link isWithinBookingWindow}) albo Strzelnica jest
 * zamknięta tego dnia, każda Oś dostaje pustą listę slotów (nic do pokazania
 * — widget wyświetla dzień jako niewybieralny/zamknięty, patrz UI).
 */
export function computeAvailability(params: {
  dateKey: string;
  now: Date;
  lanes: LaneInput[];
  openingHours: OpeningHoursForDay;
  /** Zajęte "HH:00" per Oś (klucz = `laneId`). */
  occupiedByLane?: Record<string, ReadonlySet<string>>;
  windowDays?: number;
}): LaneSlots[] {
  const { dateKey, now, lanes, openingHours, occupiedByLane, windowDays } = params;

  if (!isWithinBookingWindow(dateKey, now, windowDays)) {
    return lanes.map((lane) => ({ laneId: lane.id, laneName: lane.name, slots: [] }));
  }

  return lanes.map((lane) => ({
    laneId: lane.id,
    laneName: lane.name,
    slots: computeSlotsForDay({
      dateKey,
      now,
      openingHours,
      occupiedStartTimes: occupiedByLane?.[lane.id],
    }),
  }));
}
