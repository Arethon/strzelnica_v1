import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import {
  computeAvailability,
  getSelectableDays,
  weekdayOfDateKey,
  type LaneSlots,
  type OpeningHoursForDay,
  type SlotUnavailableReason,
} from "../lib/slots";

/**
 * Widget rezerwacyjny, osadzalny przez <iframe> jako /book?range=<slug>
 * (PRD §4.1). Ten ticket pokrywa wybór dnia i przeglądanie dostępności
 * slotów per Oś; formularz rezerwacji i jej zapis przychodzą z kolejnym
 * ticketem (#4).
 */
export default function BookingWidget() {
  const [searchParams] = useSearchParams();
  const rangeSlug = searchParams.get("range");

  // Wyliczone raz przy montowaniu — wystarczająco świeże dla widgetu
  // otwartego w jednej sesji przeglądania; `slots.ts` samo w sobie nigdy nie
  // odwołuje się do zegara, `now` zawsze przychodzi stąd jako parametr.
  const [now] = useState(() => new Date());
  const selectableDays = useMemo(() => getSelectableDays(now), [now]);
  const [selectedDay, setSelectedDay] = useState(selectableDays[0]);

  const [rangeId, setRangeId] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [laneSlots, setLaneSlots] = useState<LaneSlots[] | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);

  // Krok 1: zresolwuj slug strzelnicy z URL na jej id.
  useEffect(() => {
    if (!rangeSlug) return;
    let cancelled = false;

    supabase
      .from("ranges")
      .select("id")
      .eq("slug", rangeSlug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setRangeError("Nie znaleziono strzelnicy o podanym adresie.");
          return;
        }
        setRangeId(data.id);
      });

    return () => {
      cancelled = true;
    };
  }, [rangeSlug]);

  // Krok 2: dla wybranego dnia pobierz Osie, godziny otwarcia oraz istniejącą
  // zajętość (potwierdzone rezerwacje + ręczne blokady) i policz dostępność.
  useEffect(() => {
    if (!rangeId) return;
    let cancelled = false;
    setLoadingDay(true);
    setDayError(null);

    const weekday = weekdayOfDateKey(selectedDay);

    Promise.all([
      supabase.from("lanes").select("id, name").eq("range_id", rangeId).order("position"),
      supabase
        .from("opening_hours")
        .select("is_closed, opens_at, closes_at")
        .eq("range_id", rangeId)
        .eq("weekday", weekday)
        .maybeSingle(),
      supabase
        .from("bookings")
        .select("lane_id, start_time")
        .eq("range_id", rangeId)
        .eq("booking_date", selectedDay)
        .eq("status", "confirmed"),
      supabase
        .from("slot_blocks")
        .select("lane_id, start_time")
        .eq("range_id", rangeId)
        .eq("block_date", selectedDay),
    ]).then(([lanesRes, hoursRes, bookingsRes, blocksRes]) => {
      if (cancelled) return;

      const firstError =
        lanesRes.error ?? hoursRes.error ?? bookingsRes.error ?? blocksRes.error ?? null;
      if (firstError) {
        setDayError("Nie udało się wczytać dostępności terminów. Spróbuj ponownie później.");
        setLaneSlots(null);
        setLoadingDay(false);
        return;
      }

      const lanes = (lanesRes.data ?? []).map((lane) => ({ id: lane.id, name: lane.name }));

      // Brak wiersza w opening_hours dla danego dnia tygodnia == dzień zamknięty.
      const openingHours: OpeningHoursForDay = hoursRes.data
        ? {
            isClosed: hoursRes.data.is_closed,
            opensAt: hoursRes.data.opens_at ? hoursRes.data.opens_at.slice(0, 5) : null,
            closesAt: hoursRes.data.closes_at ? hoursRes.data.closes_at.slice(0, 5) : null,
          }
        : { isClosed: true, opensAt: null, closesAt: null };

      const occupiedByLane: Record<string, Set<string>> = {};
      const markOccupied = (rows: { lane_id: string | null; start_time: string }[]) => {
        for (const row of rows) {
          if (!row.lane_id) continue;
          const set = occupiedByLane[row.lane_id] ?? new Set<string>();
          set.add(row.start_time.slice(0, 5));
          occupiedByLane[row.lane_id] = set;
        }
      };
      markOccupied(bookingsRes.data ?? []);
      markOccupied(blocksRes.data ?? []);

      setLaneSlots(
        computeAvailability({
          dateKey: selectedDay,
          now,
          lanes,
          openingHours,
          occupiedByLane,
        }),
      );
      setLoadingDay(false);
    });

    return () => {
      cancelled = true;
    };
  }, [rangeId, selectedDay, now]);

  if (!rangeSlug) {
    return (
      <main className="min-h-screen bg-white p-6 text-slate-900">
        <h1 className="text-xl font-semibold">Rezerwacja terminu</h1>
        <p className="mt-2 text-sm text-slate-600">Brak parametru ?range=&lt;slug&gt; w adresie widgetu.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-6 text-slate-900">
      <h1 className="text-xl font-semibold">Rezerwacja terminu</h1>

      {rangeError && <p className="mt-4 text-sm text-red-600">{rangeError}</p>}

      {!rangeError && !rangeId && <p className="mt-4 text-sm text-slate-600">Wczytywanie strzelnicy…</p>}

      {rangeId && (
        <>
          <DayPicker days={selectableDays} selectedDay={selectedDay} onSelect={setSelectedDay} />

          {dayError && <p className="mt-4 text-sm text-red-600">{dayError}</p>}
          {loadingDay && !dayError && <p className="mt-4 text-sm text-slate-600">Wczytywanie dostępności…</p>}

          {!loadingDay && !dayError && laneSlots && <LaneAvailability laneSlots={laneSlots} />}
        </>
      )}
    </main>
  );
}

function formatDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pl-PL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function DayPicker({
  days,
  selectedDay,
  onSelect,
}: {
  days: string[];
  selectedDay: string;
  onSelect: (day: string) => void;
}) {
  return (
    <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
      {days.map((day) => {
        const isSelected = day === selectedDay;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            aria-pressed={isSelected}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm capitalize ${
              isSelected
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {formatDayLabel(day)}
          </button>
        );
      })}
    </div>
  );
}

const UNAVAILABLE_LABEL: Record<SlotUnavailableReason, string> = {
  closed: "Zamknięte",
  "too-soon": "Za późno",
  occupied: "Zajęte",
};

function LaneAvailability({ laneSlots }: { laneSlots: LaneSlots[] }) {
  if (laneSlots.length === 0) {
    return <p className="mt-4 text-sm text-slate-600">Ta strzelnica nie ma jeszcze skonfigurowanych Osi.</p>;
  }

  const hasAnySlots = laneSlots.some((lane) => lane.slots.length > 0);
  if (!hasAnySlots) {
    return <p className="mt-4 text-sm text-slate-600">Strzelnica jest zamknięta tego dnia.</p>;
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {laneSlots.map((lane) => (
        <div key={lane.laneId}>
          <h2 className="text-sm font-medium text-slate-900">{lane.laneName}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {lane.slots.map((slot) => (
              <div
                key={slot.startTime}
                title={slot.reason ? UNAVAILABLE_LABEL[slot.reason] : undefined}
                className={`rounded-md border px-2 py-1 text-xs ${
                  slot.available
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-100 text-slate-400 line-through"
                }`}
              >
                {slot.startTime}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
