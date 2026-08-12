// Petit client Resend (sense dependència externa, només fetch)
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ResendPayload {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  reply_to?: string;
}

export async function sendEmail(payload: ResendPayload): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("Falta la variable d'entorn RESEND_API_KEY");
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ha retornat ${res.status}: ${text}`);
  }
}

export function casaInfo() {
  return {
    nom:     Deno.env.get("CASA_NOM")     ?? "La Casilla",
    telefon: Deno.env.get("CASA_TELEFON") ?? "",
    adreca:  Deno.env.get("CASA_ADRECA")  ?? "",
    web:     Deno.env.get("CASA_WEB")     ?? "",
    from:    Deno.env.get("RESEND_FROM_EMAIL")  ?? "no-reply@lacasilla.cat",
    owner:   Deno.env.get("RESEND_OWNER_EMAIL") ?? "",
  };
}
