/**
 * Placeholder panelu Personelu (lista rezerwacji, Osie, godziny otwarcia,
 * blokady). Właściwe widoki przychodzą z kolejnymi ticketami (PRD §4.2).
 */
export default function AdminDashboard() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <h1 className="text-xl font-semibold text-slate-900">Panel Personelu</h1>
      <p className="mt-2 text-sm text-slate-600">
        Rezerwacje, Osie, godziny otwarcia i blokady pojawią się tutaj.
      </p>
    </main>
  );
}
