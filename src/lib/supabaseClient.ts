import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Rzucamy głośno zamiast pozwolić klientowi Supabase failować później w
  // dziwny sposób — brakująca konfiguracja env to błąd środowiska, nie
  // przypadek do obsłużenia w UI.
  throw new Error(
    "Brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Skopiuj .env.example do .env i uzupełnij wartości z projektu Supabase.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
