/**
 * Placeholder logowania Personelu (Supabase Auth, e-mail/hasło). Właściwy
 * formularz i integracja z auth.signInWithPassword przychodzą z kolejnym
 * ticketem (PRD §4.2).
 */
export default function AdminLogin() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-slate-900">Panel Personelu — logowanie</h1>
        <p className="mt-2 text-sm text-slate-600">Formularz logowania pojawi się tutaj.</p>
      </div>
    </main>
  );
}
