// Plantilles HTML en català per als correus
import { casaInfo } from "./resend.ts";

interface Reserva {
  nom: string;
  cognoms: string;
  email: string;
  telefon?: string | null;
  data_arribada: string;
  data_sortida: string;
  nombre_persones: number;
  habitacio_nom: string;
  preu_total?: number | null;
  comentaris?: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ca-ES", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function peu(): string {
  const c = casaInfo();
  return `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
    <p style="font-size:12px;color:#6b7280;line-height:1.5">
      <strong>${c.nom}</strong><br/>
      ${c.adreca}<br/>
      ${c.telefon} &middot; <a href="${c.web}" style="color:#6b7280">${c.web}</a>
    </p>`;
}

export function emailClientReserva(r: Reserva): { subject: string; html: string } {
  const c = casaInfo();
  const subject = `Confirmació de la teva sol·licitud de reserva a ${c.nom}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#0f766e">Hola ${r.nom},</h2>
      <p>Gràcies per la teva sol·licitud de reserva a <strong>${c.nom}</strong>.
         Hem rebut correctament les teves dades i et confirmarem la disponibilitat
         per correu o telèfon en menys de 24 hores.</p>

      <h3 style="margin-top:24px">Resum de la teva sol·licitud</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280">Habitació</td><td><strong>${r.habitacio_nom}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Arribada</td><td>${formatDate(r.data_arribada)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Sortida</td><td>${formatDate(r.data_sortida)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Persones</td><td>${r.nombre_persones}</td></tr>
        ${r.preu_total ? `<tr><td style="padding:6px 0;color:#6b7280">Preu estimat</td><td>${r.preu_total} €</td></tr>` : ""}
      </table>

      <p style="margin-top:24px">Si tens cap pregunta, respon a aquest correu o truca'ns al
         <strong>${c.telefon}</strong>.</p>
      <p>Fins aviat!<br/><em>L'equip de ${c.nom}</em></p>
      ${peu()}
    </div>`;
  return { subject, html };
}

export function emailPropietariReserva(r: Reserva): { subject: string; html: string } {
  const subject = `Nova sol·licitud de reserva — ${r.nom} ${r.cognoms}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#0f766e">Nova sol·licitud de reserva</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280">Client</td><td><strong>${r.nom} ${r.cognoms}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Email</td><td><a href="mailto:${r.email}">${r.email}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Telèfon</td><td>${r.telefon ?? "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Habitació</td><td>${r.habitacio_nom}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Arribada</td><td>${formatDate(r.data_arribada)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Sortida</td><td>${formatDate(r.data_sortida)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Persones</td><td>${r.nombre_persones}</td></tr>
        ${r.preu_total ? `<tr><td style="padding:6px 0;color:#6b7280">Preu estimat</td><td>${r.preu_total} €</td></tr>` : ""}
      </table>
      ${r.comentaris ? `<h3 style="margin-top:24px">Comentaris</h3><p>${r.comentaris}</p>` : ""}
      ${peu()}
    </div>`;
  return { subject, html };
}

interface Contacte {
  nom: string;
  email: string;
  telefon?: string | null;
  assumpte?: string | null;
  missatge: string;
}

export function emailPropietariContacte(c: Contacte): { subject: string; html: string } {
  const subject = `Nou missatge del formulari — ${c.assumpte ?? c.nom}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#0f766e">Nou missatge de contacte</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280">Nom</td><td><strong>${c.nom}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Email</td><td><a href="mailto:${c.email}">${c.email}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Telèfon</td><td>${c.telefon ?? "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Assumpte</td><td>${c.assumpte ?? "—"}</td></tr>
      </table>
      <h3 style="margin-top:24px">Missatge</h3>
      <p style="white-space:pre-wrap;background:#f9fafb;padding:12px;border-radius:6px">${c.missatge}</p>
      ${peu()}
    </div>`;
  return { subject, html };
}
