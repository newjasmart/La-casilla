// Edge Function: send-reservation
// 1. Valida les dades del formulari.
// 2. Comprova la disponibilitat de l'habitació.
// 3. Insereix la reserva (service role -> sobrepassa RLS).
// 4. Envia correu al client i al propietari via Resend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendEmail, casaInfo } from "../_shared/resend.ts";
import { emailClientReserva, emailPropietariReserva } from "../_shared/templates.ts";

interface ReservaInput {
  room_id: string;
  nom: string;
  cognoms: string;
  email: string;
  telefon?: string;
  data_arribada: string;
  data_sortida: string;
  nombre_persones: number;
  comentaris?: string;
}

function validar(body: Partial<ReservaInput>): string | null {
  const requerits: (keyof ReservaInput)[] = [
    "room_id","nom","cognoms","email","data_arribada","data_sortida","nombre_persones",
  ];
  for (const k of requerits) {
    if (!body[k]) return `Falta el camp obligatori: ${k}`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email!)) return "Email no vàlid";
  if (new Date(body.data_sortida!) <= new Date(body.data_arribada!)) {
    return "La data de sortida ha de ser posterior a la d'arribada";
  }
  if ((body.nombre_persones ?? 0) < 1) return "Nombre de persones no vàlid";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Mètode no permès" }, 405);

  let body: ReservaInput;
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

  // Habitació
  const { data: habitacio, error: errHab } = await supabase
    .from("rooms")
    .select("id, nom, preu, capacitat, actiu")
    .eq("id", body.room_id)
    .single();

  if (errHab || !habitacio) return jsonResponse({ error: "Habitació no trobada" }, 404);
  if (!habitacio.actiu)     return jsonResponse({ error: "Habitació no disponible" }, 400);
  if (body.nombre_persones > habitacio.capacitat) {
    return jsonResponse({ error: `Capacitat màxima: ${habitacio.capacitat} persones` }, 400);
  }

  // Disponibilitat
  const { data: disp, error: errDisp } = await supabase.rpc("habitacio_disponible", {
    p_room_id:       body.room_id,
    p_data_arribada: body.data_arribada,
    p_data_sortida:  body.data_sortida,
  });
  if (errDisp) return jsonResponse({ error: "Error comprovant disponibilitat" }, 500);
  if (!disp)   return jsonResponse({ error: "L'habitació no està lliure en aquestes dates" }, 409);

  // Preu estimat
  const nits = Math.round(
    (new Date(body.data_sortida).getTime() - new Date(body.data_arribada).getTime())
    / (1000 * 60 * 60 * 24),
  );
  const preuTotal = Number(habitacio.preu) * nits;

  // Insert
  const { data: reserva, error: errIns } = await supabase
    .from("reservations")
    .insert({
      room_id:         body.room_id,
      nom:             body.nom,
      cognoms:         body.cognoms,
      email:           body.email,
      telefon:         body.telefon ?? null,
      data_arribada:   body.data_arribada,
      data_sortida:    body.data_sortida,
      nombre_persones: body.nombre_persones,
      preu_total:      preuTotal,
      comentaris:      body.comentaris ?? null,
    })
    .select()
    .single();

  if (errIns || !reserva) {
    return jsonResponse({ error: "No s'ha pogut crear la reserva" }, 500);
  }

  // Correus
  const dades = {
    nom: body.nom, cognoms: body.cognoms, email: body.email,
    telefon: body.telefon, data_arribada: body.data_arribada,
    data_sortida: body.data_sortida, nombre_persones: body.nombre_persones,
    habitacio_nom: habitacio.nom, preu_total: preuTotal,
    comentaris: body.comentaris,
  };
  const c = casaInfo();

  try {
    const client = emailClientReserva(dades);
    const owner  = emailPropietariReserva(dades);
    await Promise.all([
      sendEmail({ from: c.from, to: body.email, subject: client.subject, html: client.html }),
      c.owner
        ? sendEmail({ from: c.from, to: c.owner, subject: owner.subject, html: owner.html, reply_to: body.email })
        : Promise.resolve(),
    ]);
  } catch (e) {
    console.error("Error enviant correu:", e);
    // La reserva ja està feta: no la perdem, només informem.
    return jsonResponse({
      ok: true,
      reservation: reserva,
      warning: "Reserva creada però l'enviament del correu ha fallat",
    });
  }

  return jsonResponse({ ok: true, reservation: reserva });
});
