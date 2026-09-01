import { useSearchParams } from "react-router-dom";

/**
 * Placeholder widgetu rezerwacyjnego, osadzalnego przez <iframe> jako
 * /book?range=<slug>. Właściwy flow wyboru dnia/osi/slotu i formularz
 * gościa przychodzą z kolejnymi ticketami (PRD §4.1).
 */
export default function BookingWidget() {
  const [searchParams] = useSearchParams();
  const rangeSlug = searchParams.get("range");

  return (
    <main className="min-h-screen bg-white p-6 text-slate-900">
      <h1 className="text-xl font-semibold">Rezerwacja terminu</h1>
      <p className="mt-2 text-sm text-slate-600">
        {rangeSlug ? (
          <>
            Strzelnica: <code className="rounded bg-slate-100 px-1 py-0.5">{rangeSlug}</code>
          </>
        ) : (
          "Brak parametru ?range=<slug> w adresie widgetu."
        )}
      </p>
    </main>
  );
}
