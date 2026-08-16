// Plantilles HTML en català per als correus.
import type { CasaConfig } from "./config.ts";
import { escapeHtml, escapeHtmlAttribute, safeHeaderText } from "./security.ts";

interface Reserva {
  nom: string;
  cognoms: string;
  email: string;
  telefon?: string | null;
  data_arribada: string;
  data_sortida: string;
  adults: number;
  infants: number;
  bebes: number;
  reference: string;
  comentaris?: string | null;
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return escapeHtml(date.toLocaleDateString("ca-ES", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  }));
}

function peu(casa: CasaConfig): string {
  return `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
    <p style="font-size:12px;color:#6b7280;line-height:1.5">
      <strong>${escapeHtml(casa.nom)}</strong><br/>
      ${escapeHtml(casa.adreca)}<br/>
      ${escapeHtml(casa.telefon)} &middot;
      <a href="${escapeHtmlAttribute(casa.web)}" style="color:#6b7280">${escapeHtml(casa.web)}</a>
    </p>`;
}

export function emailClientReserva(r: Reserva, casa: CasaConfig): { subject: string; html: string } {
  const subject = `Confirmació de la teva sol·licitud de reserva a ${safeHeaderText(casa.nom)}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#0f766e">Hola ${escapeHtml(r.nom)},</h2>
      <p>Gràcies per la teva sol·licitud de reserva a <strong>${escapeHtml(casa.nom)}</strong>.
         Hem rebut correctament les teves dades i et confirmarem la disponibilitat
         per correu o telèfon en menys de 24 hores.</p>

      <h3 style="margin-top:24px">Resum de la teva sol·licitud</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280">Referència</td><td><strong>${escapeHtml(r.reference)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Allotjament</td><td>Casa sencera</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Arribada</td><td>${formatDate(r.data_arribada)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Sortida</td><td>${formatDate(r.data_sortida)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Adults</td><td>${escapeHtml(r.adults)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Infants</td><td>${escapeHtml(r.infants)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Bebès</td><td>${escapeHtml(r.bebes)}</td></tr>
      </table>

      <p style="margin-top:24px">Si tens cap pregunta, respon a aquest correu o truca'ns al
         <strong>${escapeHtml(casa.telefon)}</strong>.</p>
      <p>Fins aviat!<br/><em>L'equip de ${escapeHtml(casa.nom)}</em></p>
      ${peu(casa)}
    </div>`;
  return { subject, html };
}

export function emailPropietariReserva(r: Reserva, casa: CasaConfig): { subject: string; html: string } {
  const subject = `Nova sol·licitud de reserva — ${safeHeaderText(r.nom)} ${safeHeaderText(r.cognoms)}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#0f766e">Nova sol·licitud de reserva</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280">Client</td><td><strong>${escapeHtml(r.nom)} ${escapeHtml(r.cognoms)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Email</td><td><a href="mailto:${escapeHtmlAttribute(r.email)}">${escapeHtml(r.email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Telèfon</td><td>${escapeHtml(r.telefon ?? "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Referència</td><td><strong>${escapeHtml(r.reference)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Allotjament</td><td>Casa sencera</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Arribada</td><td>${formatDate(r.data_arribada)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Sortida</td><td>${formatDate(r.data_sortida)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Adults</td><td>${escapeHtml(r.adults)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Infants</td><td>${escapeHtml(r.infants)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Bebès</td><td>${escapeHtml(r.bebes)}</td></tr>
      </table>
      ${r.comentaris ? `<h3 style="margin-top:24px">Comentaris</h3><p style="white-space:pre-wrap">${escapeHtml(r.comentaris)}</p>` : ""}
      ${peu(casa)}
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

export function emailPropietariContacte(contact: Contacte, casa: CasaConfig): { subject: string; html: string } {
  const subject = `Nou missatge del formulari — ${safeHeaderText(contact.assumpte ?? contact.nom)}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#0f766e">Nou missatge de contacte</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280">Nom</td><td><strong>${escapeHtml(contact.nom)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Email</td><td><a href="mailto:${escapeHtmlAttribute(contact.email)}">${escapeHtml(contact.email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Telèfon</td><td>${escapeHtml(contact.telefon ?? "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Assumpte</td><td>${escapeHtml(contact.assumpte ?? "—")}</td></tr>
      </table>
      <h3 style="margin-top:24px">Missatge</h3>
      <p style="white-space:pre-wrap;background:#f9fafb;padding:12px;border-radius:6px">${escapeHtml(contact.missatge)}</p>
      ${peu(casa)}
    </div>`;
  return { subject, html };
}
