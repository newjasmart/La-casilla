// Edge Function: send-contact
// 1. Valida el missatge.
// 2. L'insereix a la taula `contacts`.
// 3. Envia un correu al propietari.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendEmail, casaInfo } from "../_shared/resend.ts";
import { emailPropietariContacte } from "../_shared/templates.ts";

interface ContacteInput {
  nom: string;
  email: string;
  telefon?: string;
  assumpte?: string;
  missatge: string;
}

function validar(b: Partial<ContacteInput>): string | null {
  if (!b.nom || b.nom.trim().length < 2) return "El nom és obligatori";
  if (!b.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return "Email no vàlid";
  if (!b.missatge || b.missatge.trim().length < 5) return "El missatge és massa curt";
  if (b.missatge.length > 5000) return "El missatge és massa llarg";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Mètode no permès" }, 405);

  let body: ContacteInput;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cos JSON no vàlid" }, 400);
  }

  const errorValidacio = validar(body);
  if (errorValidacio) return jsonResponse({ error: errorValidacio }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: contacte, error } = await supabase
    .from("contacts")
    .insert({
      nom:      body.nom.trim(),
      email:    body.email.trim().toLowerCase(),
      telefon:  body.telefon?.trim() ?? null,
      assumpte: body.assumpte?.trim() ?? null,
      missatge: body.missatge.trim(),
    })
    .select()
    .single();

  if (error || !contacte) {
    return jsonResponse({ error: "No s'ha pogut desar el missatge" }, 500);
  }

  const c = casaInfo();
  if (c.owner) {
    try {
      const { subject, html } = emailPropietariContacte({
        nom: body.nom, email: body.email, telefon: body.telefon,
        assumpte: body.assumpte, missatge: body.missatge,
      });
      await sendEmail({
        from: c.from, to: c.owner, subject, html, reply_to: body.email,
      });
    } catch (e) {
      console.error("Error enviant correu:", e);
      return jsonResponse({
        ok: true,
        contact: contacte,
        warning: "Missatge desat però l'enviament del correu ha fallat",
      });
    }
  }

  return jsonResponse({ ok: true, contact: contacte });
});
