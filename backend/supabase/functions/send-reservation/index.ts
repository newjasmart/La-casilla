// Thin Deno/Supabase adapter; handler.ts is runtime-independent and unit tested.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadDatabaseConfig, loadFunctionConfig, runtimeEnv } from "../_shared/config.ts";
import { createFormStore, createPaymentStore } from "../_shared/db.ts";
import { sendEmail } from "../_shared/resend.ts";
import { createCheckoutSession, loadStripeConfig, retrieveCheckoutSession, type StripeConfig } from "../_shared/stripe.ts";
import { createReservationHandler } from "./handler.ts";

const env = runtimeEnv();
const config = loadFunctionConfig(env);
const database = loadDatabaseConfig(env);
const client = createClient(database.url, database.serviceRoleKey, {
  auth: { persistSession: false },
});

// This function must keep taking reservations even before Stripe is set
// up (e.g. Marc hasn't created his account yet) — reservations are the
// critical path, automatic payment is an enhancement on top of it. So,
// unlike create-payment-link/stripe-webhook (which are pointless without
// Stripe and are allowed to fail to boot), a missing/invalid Stripe config
// here degrades to "no automatic payment" instead of taking the whole
// function down.
let stripeConfig: StripeConfig | undefined;
try {
  stripeConfig = loadStripeConfig(env);
} catch (error) {
  console.warn("Stripe no configurat — les reserves es crearan sense pagament automàtic:", error);
}

Deno.serve(createReservationHandler({
  config,
  store: createFormStore(client),
  // The automatic payment path is a trusted, server-to-server call right
  // after this same service_role client just created the reservation — no
  // separate "caller" identity to gate against, unlike the admin-triggered
  // create-payment-link. Passing `client` for both roles reflects that.
  paymentStore: stripeConfig ? createPaymentStore(client, client) : undefined,
  stripeConfig,
  createCheckoutSession,
  retrieveCheckoutSession,
  sendEmail,
  logError: (message, error) => console.error(message, error),
}));
