// Client Resend sense dependències externes. RESEND_API_KEY només es llegeix al servidor.
import { assertApprovedFromAddress, emailDeliveryMode, type EnvReader, requireResendApiKey, runtimeEnv } from "./config.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ResendPayload {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  reply_to?: string;
}

export interface ResendDependencies {
  env?: EnvReader;
  fetcher?: typeof fetch;
}

export async function sendEmail(
  payload: ResendPayload,
  dependencies: ResendDependencies = {},
): Promise<void> {
  const env = dependencies.env ?? runtimeEnv();
  assertApprovedFromAddress(payload.from);
  if (emailDeliveryMode(env) === "mock") return;
  const apiKey = requireResendApiKey(env);

  const response = await (dependencies.fetcher ?? fetch)(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = (await response.text()).slice(0, 1000);
    throw new Error(`Resend ha retornat ${response.status}: ${text}`);
  }
}
