// Thin Deno/Supabase adapter; handler.ts is runtime-independent and unit tested.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadDatabaseConfig, loadFunctionConfig, runtimeEnv } from "../_shared/config.ts";
import { createWebhookStore } from "../_shared/db.ts";
import { sendEmail } from "../_shared/resend.ts";
import { loadStripeConfig, verifyStripeSignature } from "../_shared/stripe.ts";
import { createStripeWebhookHandler } from "./handler.ts";

const env = runtimeEnv();
const config = loadFunctionConfig(env);
const stripeConfig = loadStripeConfig(env);
const database = loadDatabaseConfig(env);
const client = createClient(database.url, database.serviceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(createStripeWebhookHandler({
  casa: config.casa,
  stripeConfig,
  store: createWebhookStore(client),
  sendEmail,
  verifySignature: verifyStripeSignature,
  logError: (message, error) => console.error(message, error),
}));
