import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** לקוח לצד שרת שקורא את הסשן מהעוגיות. */
export async function getServerSupabase() {
  const store = await cookies();
  return createServerClient<Database>(URL, KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // קריאה מתוך Server Component — אין מה לעשות, ה-middleware יטפל
        }
      },
    },
  });
}

/** לקוח אנונימי, בלי סשן. משמש רק לקריאה הציבורית לפי slug. */
export function getAnonSupabase() {
  return createClient<Database>(URL, KEY, { auth: { persistSession: false } });
}
