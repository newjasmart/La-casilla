// Thin Deno/Supabase adapter; handler.ts is runtime-independent and unit tested.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadDatabaseConfig, loadFunctionConfig, runtimeEnv } from "../_shared/config.ts";
import { createFormStore } from "../_shared/db.ts";
import { sendEmail } from "../_shared/resend.ts";
import { createReservationHandler } from "./handler.ts";

const env = runtimeEnv();
const config = loadFunctionConfig(env);
const database = loadDatabaseConfig(env);
const client = createClient(database.url, database.serviceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(createReservationHandler({
  config,
  store: createFormStore(client),
  sendEmail,
  logError: (message, error) => console.error(message, error),
}));
