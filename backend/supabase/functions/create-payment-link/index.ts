// Thin Deno/Supabase adapter; handler.ts is runtime-independent and unit tested.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadDatabaseConfig, loadFunctionConfig, runtimeEnv } from "../_shared/config.ts";
import { createPaymentStore } from "../_shared/db.ts";
import { sendEmail } from "../_shared/resend.ts";
import { createCheckoutSession, loadStripeConfig, retrieveCheckoutSession } from "../_shared/stripe.ts";
import { createPaymentLinkHandler } from "./handler.ts";

const env = runtimeEnv();
const config = loadFunctionConfig(env);
const stripeConfig = loadStripeConfig(env);
const database = loadDatabaseConfig(env);
const anonKey = env.get("SUPABASE_ANON_KEY")?.trim();
if (!anonKey) throw new Error("Falta la variable d'entorn SUPABASE_ANON_KEY");

// service_role client: used for every write (payment_intents has no INSERT
// policy for authenticated users — only service_role can write it).
const serviceClient = createClient(database.url, database.serviceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve((request: Request) => {
  // A fresh client per request, carrying the CALLER's own session token —
  // this is what makes fetchReservationAsCaller() subject to RLS as that
  // specific staff member (see the comment on PaymentStore in db.ts).
  const callerClient = createClient(database.url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
  });
  const handler = createPaymentLinkHandler({
    config,
    stripeConfig,
    store: createPaymentStore(callerClient, serviceClient),
    sendEmail,
    createCheckoutSession,
    retrieveCheckoutSession,
    logError: (message, error) => console.error(message, error),
  });
  return handler(request);
});
