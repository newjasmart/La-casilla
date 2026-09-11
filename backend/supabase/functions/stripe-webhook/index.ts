// Thin Deno/Supabase adapter; handler.ts is runtime-independent and unit tested.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadDatabaseConfig, runtimeEnv } from "../_shared/config.ts";
import { createWebhookStore } from "../_shared/db.ts";
import { loadStripeConfig, verifyStripeSignature } from "../_shared/stripe.ts";
import { createStripeWebhookHandler } from "./handler.ts";

const env = runtimeEnv();
const stripeConfig = loadStripeConfig(env);
const database = loadDatabaseConfig(env);
const client = createClient(database.url, database.serviceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(createStripeWebhookHandler({
  stripeConfig,
  store: createWebhookStore(client),
  verifySignature: verifyStripeSignature,
  logError: (message, error) => console.error(message, error),
}));
