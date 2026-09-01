import { describe, expect, it } from "vitest";
import {
  BOOKING_WINDOW_DAYS,
  computeAvailability,
  computeSlotsForDay,
  getSelectableDays,
  isWithinBookingWindow,
  toDateKey,
  type OpeningHoursForDay,
} from "./slots";

const OPEN_9_17: OpeningHoursForDay = { isClosed: false, opensAt: "09:00", closesAt: "17:00" };
const CLOSED: OpeningHoursForDay = { isClosed: true, opensAt: null, closesAt: null };

describe("granica 1h wyprzedzenia", () => {
  it("slot dokładnie 1h od now jest dostępny", () => {
    const now = new Date(2026, 8, 1, 15, 0, 0); // 2026-09-01 15:00
    const slots = computeSlotsForDay({
      dateKey: toDateKey(now),
      now,
      openingHours: OPEN_9_17,
    });
    const slot16 = slots.find((s) => s.startTime === "16:00");
    expect(slot16).toEqual({ startTime: "16:00", available: true, reason: null });
  });

  it("slot minutę poniżej 1h od now jest niedostępny (too-soon)", () => {
    const now = new Date(2026, 8, 1, 15, 1, 0); // 15:01 -> 16:00 slot is 59min away
    const slots = computeSlotsForDay({
      dateKey: toDateKey(now),
      now,
      openingHours: OPEN_9_17,
    });
    const slot16 = slots.find((s) => s.startTime === "16:00");
    expect(slot16).toEqual({ startTime: "16:00", available: false, reason: "too-soon" });
  });

  it("slot w przeszłości jest niedostępny (too-soon)", () => {
    const now = new Date(2026, 8, 1, 12, 0, 0);
    const slots = computeSlotsForDay({
      dateKey: toDateKey(now),
      now,
      openingHours: OPEN_9_17,
    });
    const slot9 = slots.find((s) => s.startTime === "09:00");
    expect(slot9?.available).toBe(false);
    expect(slot9?.reason).toBe("too-soon");
  });
});

describe("granica 14 dni okna rezerwacji", () => {
  const now = new Date(2026, 8, 1, 10, 0, 0); // 2026-09-01

  it("dzień dokładnie +14 dni jest w oknie", () => {
    const dateKey = toDateKey(new Date(2026, 8, 15, 0, 0, 0));
    expect(isWithinBookingWindow(dateKey, now)).toBe(true);
  });

  it("dzień +15 dni jest poza oknem", () => {
    const dateKey = toDateKey(new Date(2026, 8, 16, 0, 0, 0));
    expect(isWithinBookingWindow(dateKey, now)).toBe(false);
  });

  it("dzień wczorajszy jest poza oknem", () => {
    const dateKey = toDateKey(new Date(2026, 7, 31, 0, 0, 0));
    expect(isWithinBookingWindow(dateKey, now)).toBe(false);
  });

  it("getSelectableDays zwraca dziś i kolejne 14 dni (15 wpisów), bez dnia +15", () => {
    const days = getSelectableDays(now);
    expect(days).toHaveLength(BOOKING_WINDOW_DAYS + 1);
    expect(days[0]).toBe(toDateKey(now));
    expect(days[days.length - 1]).toBe(toDateKey(new Date(2026, 8, 15)));
    expect(days).not.toContain(toDateKey(new Date(2026, 8, 16)));
  });

  it("computeAvailability zwraca puste sloty dla każdej Osi, gdy dzień jest poza oknem", () => {
    const dateKey = toDateKey(new Date(2026, 8, 20, 0, 0, 0));
    const result = computeAvailability({
      dateKey,
      now,
      lanes: [{ id: "lane-1", name: "Oś 1" }],
      openingHours: OPEN_9_17,
    });
    expect(result).toEqual([{ laneId: "lane-1", laneName: "Oś 1", slots: [] }]);
  });
});

describe("dzień całkowicie zamknięty", () => {
  it("computeSlotsForDay zwraca pustą listę slotów", () => {
    const now = new Date(2026, 8, 1, 8, 0, 0);
    const slots = computeSlotsForDay({
      dateKey: toDateKey(now),
      now,
      openingHours: CLOSED,
    });
    expect(slots).toEqual([]);
  });

  it("computeAvailability zwraca pustą listę slotów dla każdej Osi", () => {
    const now = new Date(2026, 8, 1, 8, 0, 0);
    const result = computeAvailability({
      dateKey: toDateKey(now),
      now,
      lanes: [
        { id: "lane-1", name: "Oś 1" },
        { id: "lane-2", name: "Oś 2" },
      ],
      openingHours: CLOSED,
    });
    expect(result).toEqual([
      { laneId: "lane-1", laneName: "Oś 1", slots: [] },
      { laneId: "lane-2", laneName: "Oś 2", slots: [] },
    ]);
  });
});

describe("slot na granicy godzin otwarcia", () => {
  const now = new Date(2026, 8, 1, 0, 0, 0); // daleko przed otwarciem, żadny slot nie jest too-soon

  it("slot zaczynający się dokładnie o godzinie otwarcia istnieje", () => {
    const slots = computeSlotsForDay({ dateKey: toDateKey(now), now, openingHours: OPEN_9_17 });
    expect(slots[0].startTime).toBe("09:00");
  });

  it("slot zaczynający się dokładnie o godzinie zamknięcia nie istnieje", () => {
    const slots = computeSlotsForDay({ dateKey: toDateKey(now), now, openingHours: OPEN_9_17 });
    expect(slots.find((s) => s.startTime === "17:00")).toBeUndefined();
    expect(slots[slots.length - 1].startTime).toBe("16:00");
  });

  it("zamknięcie w połowie godziny (np. 17:30) dopuszcza slot 17:00 jako ostatni", () => {
    const openingHours: OpeningHoursForDay = { isClosed: false, opensAt: "09:00", closesAt: "17:30" };
    const slots = computeSlotsForDay({ dateKey: toDateKey(now), now, openingHours });
    expect(slots[slots.length - 1].startTime).toBe("17:00");
  });
});

describe("zajętość (rezerwacja/blokada)", () => {
  it("slot oznaczony jako occupiedStartTimes jest niedostępny z powodem 'occupied'", () => {
    const now = new Date(2026, 8, 1, 0, 0, 0);
    const slots = computeSlotsForDay({
      dateKey: toDateKey(now),
      now,
      openingHours: OPEN_9_17,
      occupiedStartTimes: new Set(["10:00"]),
    });
    const slot10 = slots.find((s) => s.startTime === "10:00");
    expect(slot10).toEqual({ startTime: "10:00", available: false, reason: "occupied" });
  });

  it("computeAvailability przekazuje zajętość osobno per Oś", () => {
    const now = new Date(2026, 8, 1, 0, 0, 0);
    const result = computeAvailability({
      dateKey: toDateKey(now),
      now,
      lanes: [
        { id: "lane-1", name: "Oś 1" },
        { id: "lane-2", name: "Oś 2" },
      ],
      openingHours: OPEN_9_17,
      occupiedByLane: { "lane-1": new Set(["09:00"]) },
    });
    const lane1Slot9 = result[0].slots.find((s) => s.startTime === "09:00");
    const lane2Slot9 = result[1].slots.find((s) => s.startTime === "09:00");
    expect(lane1Slot9?.available).toBe(false);
    expect(lane2Slot9?.available).toBe(true);
  });
});
