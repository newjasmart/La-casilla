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
  locale?: string | null;
}

// Only the guest-facing confirmation email (emailClientReserva) is
// translated: the guest picks their language on the public site. Emails to
// Marc (emailPropietariReserva, emailPropietariContacte) stay in Catalan —
// he reads those, not the guest.
const SUPPORTED_CLIENT_LOCALES = ["ca", "es", "en", "nl", "fr"] as const;
type ClientLocale = (typeof SUPPORTED_CLIENT_LOCALES)[number];

function resolveClientLocale(locale?: string | null): ClientLocale {
  const short = (locale ?? "").slice(0, 2).toLowerCase();
  return (SUPPORTED_CLIENT_LOCALES as readonly string[]).includes(short)
    ? (short as ClientLocale)
    : "ca";
}

const INTL_LOCALE_TAGS: Record<ClientLocale, string> = {
  ca: "ca-ES", es: "es-ES", en: "en-GB", nl: "nl-NL", fr: "fr-FR",
};

const CLIENT_EMAIL_STRINGS: Record<ClientLocale, {
  subject: (casa: string) => string;
  greeting: (name: string) => string;
  intro: (casa: string) => string;
  summaryTitle: string;
  reference: string;
  accommodation: string;
  accommodationValue: string;
  arrival: string;
  departure: string;
  adults: string;
  children: string;
  infants: string;
  questions: (phone: string) => string;
  seeYouSoon: string;
  team: (casa: string) => string;
}> = {
  ca: {
    subject: (casa) => `Confirmació de la teva sol·licitud de reserva a ${casa}`,
    greeting: (name) => `Hola ${name},`,
    intro: (casa) => `Gràcies per la teva sol·licitud de reserva a <strong>${casa}</strong>. Hem rebut correctament les teves dades i et confirmarem la disponibilitat per correu o telèfon en menys de 24 hores.`,
    summaryTitle: "Resum de la teva sol·licitud",
    reference: "Referència", accommodation: "Allotjament", accommodationValue: "Casa sencera",
    arrival: "Arribada", departure: "Sortida", adults: "Adults", children: "Infants", infants: "Bebès",
    questions: (phone) => `Si tens cap pregunta, respon a aquest correu o truca'ns al <strong>${phone}</strong>.`,
    seeYouSoon: "Fins aviat!",
    team: (casa) => `L'equip de ${casa}`,
  },
  es: {
    subject: (casa) => `Confirmación de tu solicitud de reserva en ${casa}`,
    greeting: (name) => `Hola ${name},`,
    intro: (casa) => `Gracias por tu solicitud de reserva en <strong>${casa}</strong>. Hemos recibido correctamente tus datos y te confirmaremos la disponibilidad por correo o teléfono en menos de 24 horas.`,
    summaryTitle: "Resumen de tu solicitud",
    reference: "Referencia", accommodation: "Alojamiento", accommodationValue: "Casa entera",
    arrival: "Llegada", departure: "Salida", adults: "Adultos", children: "Niños", infants: "Bebés",
    questions: (phone) => `Si tienes alguna pregunta, responde a este correo o llámanos al <strong>${phone}</strong>.`,
    seeYouSoon: "¡Hasta pronto!",
    team: (casa) => `El equipo de ${casa}`,
  },
  en: {
    subject: (casa) => `Confirmation of your booking request at ${casa}`,
    greeting: (name) => `Hi ${name},`,
    intro: (casa) => `Thank you for your booking request at <strong>${casa}</strong>. We've received your details and will confirm availability by email or phone within 24 hours.`,
    summaryTitle: "Summary of your request",
    reference: "Reference", accommodation: "Accommodation", accommodationValue: "Whole house",
    arrival: "Check-in", departure: "Check-out", adults: "Adults", children: "Children", infants: "Infants",
    questions: (phone) => `If you have any questions, reply to this email or call us at <strong>${phone}</strong>.`,
    seeYouSoon: "See you soon!",
    team: (casa) => `The ${casa} team`,
  },
  nl: {
    subject: (casa) => `Bevestiging van je reserveringsaanvraag bij ${casa}`,
    greeting: (name) => `Hallo ${name},`,
    intro: (casa) => `Bedankt voor je reserveringsaanvraag bij <strong>${casa}</strong>. We hebben je gegevens goed ontvangen en bevestigen de beschikbaarheid binnen 24 uur per e-mail of telefoon.`,
    summaryTitle: "Overzicht van je aanvraag",
    reference: "Referentie", accommodation: "Verblijf", accommodationValue: "Volledig huis",
    arrival: "Aankomst", departure: "Vertrek", adults: "Volwassenen", children: "Kinderen", infants: "Baby's",
    questions: (phone) => `Heb je nog vragen? Antwoord op deze e-mail of bel ons op <strong>${phone}</strong>.`,
    seeYouSoon: "Tot snel!",
    team: (casa) => `Het team van ${casa}`,
  },
  fr: {
    subject: (casa) => `Confirmation de votre demande de réservation à ${casa}`,
    greeting: (name) => `Bonjour ${name},`,
    intro: (casa) => `Merci pour votre demande de réservation à <strong>${casa}</strong>. Nous avons bien reçu vos informations et confirmerons la disponibilité par e-mail ou par téléphone sous 24 heures.`,
    summaryTitle: "Récapitulatif de votre demande",
    reference: "Référence", accommodation: "Hébergement", accommodationValue: "Maison entière",
    arrival: "Arrivée", departure: "Départ", adults: "Adultes", children: "Enfants", infants: "Bébés",
    questions: (phone) => `Pour toute question, répondez à cet e-mail ou appelez-nous au <strong>${phone}</strong>.`,
    seeYouSoon: "À bientôt !",
    team: (casa) => `L'équipe de ${casa}`,
  },
};

function formatDate(iso: string, locale: ClientLocale = "ca"): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return escapeHtml(date.toLocaleDateString(INTL_LOCALE_TAGS[locale], {
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
  const locale = resolveClientLocale(r.locale);
  const s = CLIENT_EMAIL_STRINGS[locale];
  const casaName = escapeHtml(casa.nom);
  const subject = s.subject(safeHeaderText(casa.nom));
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#0f766e">${s.greeting(escapeHtml(r.nom))}</h2>
      <p>${s.intro(casaName)}</p>

      <h3 style="margin-top:24px">${s.summaryTitle}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280">${s.reference}</td><td><strong>${escapeHtml(r.reference)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">${s.accommodation}</td><td>${s.accommodationValue}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">${s.arrival}</td><td>${formatDate(r.data_arribada, locale)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">${s.departure}</td><td>${formatDate(r.data_sortida, locale)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">${s.adults}</td><td>${escapeHtml(r.adults)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">${s.children}</td><td>${escapeHtml(r.infants)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">${s.infants}</td><td>${escapeHtml(r.bebes)}</td></tr>
      </table>

      <p style="margin-top:24px">${s.questions(escapeHtml(casa.telefon))}</p>
      <p>${s.seeYouSoon}<br/><em>${s.team(casaName)}</em></p>
      ${peu(casa)}
    </div>`;
  return { subject, html };
}

const PAYMENT_LINK_STRINGS: Record<ClientLocale, {
  subject: (casa: string) => string;
  greeting: (name: string) => string;
  intro: (casa: string) => string;
  amount: string;
  reference: string;
  cta: string;
  expiry: string;
  questions: (phone: string) => string;
  team: (casa: string) => string;
}> = {
  ca: {
    subject: (casa) => `Enllaç de pagament de la teva reserva a ${casa}`,
    greeting: (name) => `Hola ${name},`,
    intro: (casa) => `Bones notícies: la teva estada a <strong>${casa}</strong> ja té les dates confirmades. Per acabar de reservar-la, fes el pagament amb l'enllaç d'aquí sota.`,
    amount: "Import a pagar", reference: "Referència",
    cta: "Paga la reserva",
    expiry: "Aquest enllaç de pagament és personal i només s'ha d'utilitzar un cop.",
    questions: (phone) => `Si tens cap pregunta, respon a aquest correu o truca'ns al <strong>${phone}</strong>.`,
    team: (casa) => `L'equip de ${casa}`,
  },
  es: {
    subject: (casa) => `Enlace de pago de tu reserva en ${casa}`,
    greeting: (name) => `Hola ${name},`,
    intro: (casa) => `Buenas noticias: tu estancia en <strong>${casa}</strong> ya tiene las fechas confirmadas. Para terminar de reservarla, realiza el pago con el enlace de abajo.`,
    amount: "Importe a pagar", reference: "Referencia",
    cta: "Paga la reserva",
    expiry: "Este enlace de pago es personal y solo debe usarse una vez.",
    questions: (phone) => `Si tienes alguna pregunta, responde a este correo o llámanos al <strong>${phone}</strong>.`,
    team: (casa) => `El equipo de ${casa}`,
  },
  en: {
    subject: (casa) => `Payment link for your booking at ${casa}`,
    greeting: (name) => `Hi ${name},`,
    intro: (casa) => `Good news: your stay at <strong>${casa}</strong> now has confirmed dates. To finish booking it, complete the payment using the link below.`,
    amount: "Amount due", reference: "Reference",
    cta: "Pay for your booking",
    expiry: "This payment link is personal and should only be used once.",
    questions: (phone) => `If you have any questions, reply to this email or call us at <strong>${phone}</strong>.`,
    team: (casa) => `The ${casa} team`,
  },
  nl: {
    subject: (casa) => `Betaallink voor je reservering bij ${casa}`,
    greeting: (name) => `Hallo ${name},`,
    intro: (casa) => `Goed nieuws: je verblijf bij <strong>${casa}</strong> heeft nu bevestigde data. Rond je reservering af door te betalen via onderstaande link.`,
    amount: "Te betalen bedrag", reference: "Referentie",
    cta: "Betaal je reservering",
    expiry: "Deze betaallink is persoonlijk en mag maar één keer gebruikt worden.",
    questions: (phone) => `Heb je nog vragen? Antwoord op deze e-mail of bel ons op <strong>${phone}</strong>.`,
    team: (casa) => `Het team van ${casa}`,
  },
  fr: {
    subject: (casa) => `Lien de paiement pour votre réservation à ${casa}`,
    greeting: (name) => `Bonjour ${name},`,
    intro: (casa) => `Bonne nouvelle : votre séjour à <strong>${casa}</strong> a désormais des dates confirmées. Pour finaliser votre réservation, réglez le paiement via le lien ci-dessous.`,
    amount: "Montant à payer", reference: "Référence",
    cta: "Payer la réservation",
    expiry: "Ce lien de paiement est personnel et ne doit être utilisé qu'une seule fois.",
    questions: (phone) => `Pour toute question, répondez à cet e-mail ou appelez-nous au <strong>${phone}</strong>.`,
    team: (casa) => `L'équipe de ${casa}`,
  },
};

interface PaymentLink {
  firstName: string;
  email: string;
  reference: string;
  amount: number;
  currency: string;
  checkoutUrl: string;
  locale?: string | null;
}

export function emailClientPaymentLink(p: PaymentLink, casa: CasaConfig): { subject: string; html: string } {
  const locale = resolveClientLocale(p.locale);
  const s = PAYMENT_LINK_STRINGS[locale];
  const casaName = escapeHtml(casa.nom);
  const subject = s.subject(safeHeaderText(casa.nom));
  const formattedAmount = escapeHtml(
    new Intl.NumberFormat(INTL_LOCALE_TAGS[locale], { style: "currency", currency: p.currency }).format(p.amount),
  );
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#0f766e">${s.greeting(escapeHtml(p.firstName))}</h2>
      <p>${s.intro(casaName)}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
        <tr><td style="padding:6px 0;color:#6b7280">${s.reference}</td><td><strong>${escapeHtml(p.reference)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">${s.amount}</td><td><strong>${formattedAmount}</strong></td></tr>
      </table>

      <p style="margin:28px 0;text-align:center">
        <a href="${escapeHtmlAttribute(p.checkoutUrl)}" style="background:#0f766e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${s.cta}</a>
      </p>
      <p style="font-size:12px;color:#6b7280">${s.expiry}</p>

      <p style="margin-top:24px">${s.questions(escapeHtml(casa.telefon))}</p>
      <p><em>${s.team(casaName)}</em></p>
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
  locale?: string | null;
}

const CONTACT_CLIENT_STRINGS: Record<ClientLocale, {
  subject: string;
  greeting: (name: string) => string;
  intro: (casa: string) => string;
  yourMessage: string;
  replyHint: (phone: string) => string;
  team: (casa: string) => string;
}> = {
  ca: {
    subject: "Hem rebut el teu missatge",
    greeting: (name) => `Hola ${name},`,
    intro: (casa) => `Gràcies per escriure a <strong>${casa}</strong>. Hem rebut el teu missatge correctament i et respondrem directament a aquest correu el més aviat possible.`,
    yourMessage: "El teu missatge",
    replyHint: (phone) => `Si és urgent, també ens pots trucar al <strong>${phone}</strong>.`,
    team: (casa) => `L'equip de ${casa}`,
  },
  es: {
    subject: "Hemos recibido tu mensaje",
    greeting: (name) => `Hola ${name},`,
    intro: (casa) => `Gracias por escribir a <strong>${casa}</strong>. Hemos recibido tu mensaje correctamente y te responderemos directamente a este correo lo antes posible.`,
    yourMessage: "Tu mensaje",
    replyHint: (phone) => `Si es urgente, también puedes llamarnos al <strong>${phone}</strong>.`,
    team: (casa) => `El equipo de ${casa}`,
  },
  en: {
    subject: "We've received your message",
    greeting: (name) => `Hi ${name},`,
    intro: (casa) => `Thank you for writing to <strong>${casa}</strong>. We've received your message and will reply directly to this email as soon as possible.`,
    yourMessage: "Your message",
    replyHint: (phone) => `If it's urgent, you can also call us at <strong>${phone}</strong>.`,
    team: (casa) => `The ${casa} team`,
  },
  nl: {
    subject: "We hebben je bericht ontvangen",
    greeting: (name) => `Hallo ${name},`,
    intro: (casa) => `Bedankt voor je bericht aan <strong>${casa}</strong>. We hebben het goed ontvangen en antwoorden zo snel mogelijk rechtstreeks op deze e-mail.`,
    yourMessage: "Je bericht",
    replyHint: (phone) => `Is het dringend? Dan kun je ons ook bellen op <strong>${phone}</strong>.`,
    team: (casa) => `Het team van ${casa}`,
  },
  fr: {
    subject: "Nous avons bien reçu votre message",
    greeting: (name) => `Bonjour ${name},`,
    intro: (casa) => `Merci d'avoir écrit à <strong>${casa}</strong>. Nous avons bien reçu votre message et vous répondrons directement à cet e-mail dès que possible.`,
    yourMessage: "Votre message",
    replyHint: (phone) => `Si c'est urgent, vous pouvez aussi nous appeler au <strong>${phone}</strong>.`,
    team: (casa) => `L'équipe de ${casa}`,
  },
};

export function emailClientContacte(contact: Contacte, casa: CasaConfig): { subject: string; html: string } {
  const locale = resolveClientLocale(contact.locale);
  const s = CONTACT_CLIENT_STRINGS[locale];
  const casaName = escapeHtml(casa.nom);
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#0f766e">${s.greeting(escapeHtml(contact.nom))}</h2>
      <p>${s.intro(casaName)}</p>
      <h3 style="margin-top:24px">${s.yourMessage}</h3>
      <p style="white-space:pre-wrap;background:#f9fafb;padding:12px;border-radius:6px">${escapeHtml(contact.missatge)}</p>
      <p style="margin-top:24px">${s.replyHint(escapeHtml(casa.telefon))}</p>
      <p><em>${s.team(casaName)}</em></p>
      ${peu(casa)}
    </div>`;
  return { subject: s.subject, html };
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

interface PaymentConfirmedNotice {
  reference: string;
  firstName: string;
  lastName: string;
  arrival: string;
  departure: string;
  amount: number;
  currency: string;
}

export function emailPropietariPagamentConfirmat(
  n: PaymentConfirmedNotice,
  casa: CasaConfig,
): { subject: string; html: string } {
  const subject = `Reserva pagada i confirmada — ${safeHeaderText(n.firstName)} ${safeHeaderText(n.lastName)}`;
  const amount = escapeHtml(new Intl.NumberFormat("ca-ES", { style: "currency", currency: n.currency }).format(n.amount));
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#0f766e">✅ Reserva pagada i confirmada</h2>
      <p>El client ha completat el pagament en línia; la reserva ja està confirmada automàticament, no cal fer res més.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
        <tr><td style="padding:6px 0;color:#6b7280">Client</td><td><strong>${escapeHtml(n.firstName)} ${escapeHtml(n.lastName)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Referència</td><td><strong>${escapeHtml(n.reference)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Arribada</td><td>${formatDate(n.arrival)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Sortida</td><td>${formatDate(n.departure)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Import cobrat</td><td><strong>${amount}</strong></td></tr>
      </table>
      ${peu(casa)}
    </div>`;
  return { subject, html };
}
