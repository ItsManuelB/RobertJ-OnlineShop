// No imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias or sibling value imports.

/** The shop's brand colours (`src/app/globals.css`), written out because an email cannot read CSS variables. */
export const EMAIL_COLORS = {
  page: "#f8faf9", // rj-white
  card: "#ffffff",
  ink: "#09120f", // rj-black
  body: "#1e3a30", // rj-gray-800
  muted: "#4a5c52", // rj-gray-600
  line: "#ccdcdc", // rj-gray-200
  tint: "#f3f9f6", // rj-gray-50
  tintLine: "#e2f0eb", // rj-gray-100
  brand: "#135e4a", // rj-red: the emerald brand accent
  logoBand: "#002016", // the logo image's own background, so the header looks seamless
} as const;

export type EmailTone = "brand" | "success" | "info" | "warning" | "danger";

/** Badge and callout colours: `bg` is the tint, `fg` the text on it, `bar` the accent stripe. All pass 4.5:1 for text. */
const TONES: Record<EmailTone, { bg: string; fg: string; bar: string }> = {
  brand: { bg: "#e2f0eb", fg: "#0b3a2e", bar: "#135e4a" },
  success: { bg: "#dcfce7", fg: "#166534", bar: "#166534" },
  info: { bg: "#e0f2fe", fg: "#075985", bar: "#0284c7" },
  warning: { bg: "#fef3c7", fg: "#92400e", bar: "#b45309" },
  danger: { bg: "#fde8ea", fg: "#a30e19", bar: "#c8111e" },
};

const SANS = "'DM Sans',Arial,Helvetica,sans-serif";
const SERIF = "'DM Serif Display',Georgia,'Times New Roman',serif";
const BRAND_NAME = "RobertJ Shop";

/** Everything one email says. The layout decides how it looks; a message only supplies words and data. */
export interface EmailMessage {
  /** Keep it to 60 characters or fewer: phones cut longer subjects. */
  subject: string;
  /** The grey line some clients show after the subject. */
  preheader: string;
  badge: { label: string; tone: EmailTone };
  headline: string;
  paragraphs: string[];
  /** Label and value pairs in a tinted box. */
  rows?: { label: string; value: string }[];
  /** Order lines. `amount` is already formatted. */
  items?: { name: string; detail?: string; quantity?: number; amount?: string }[];
  /** Lines under the items (shipping, total). */
  totals?: { label: string; value: string; strong?: boolean }[];
  /** A highlighted box for the one date or fact the reader must not miss. */
  callout?: { label: string; text: string };
  steps?: string[];
  /** Headed lists. A row with no label is a plain line ("and 4 more"). */
  sections?: { heading: string; rows: { label: string; text: string; pill?: string }[] }[];
  cta: { label: string; url: string };
  /** Why this person got the email. */
  reason: string;
}

/** What surrounds every email: where the logo is hosted and which links the footer carries. */
export interface EmailChrome {
  /** Absolute address of the logo image. */
  logoUrl: string;
  /** The shop's address, shown in the footer. */
  siteUrl: string;
  /** Where the reader can turn this kind of email off. Null when there is no such page. */
  settingsUrl: string | null;
  /** True when replies reach a real inbox (`EMAIL_REPLY_TO` is set). */
  canReply: boolean;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const e = escapeHtml;

/** One full-width row of the outer card. */
function block(inner: string, padding: string): string {
  return `<tr><td class="px" style="padding:${padding}">${inner}</td></tr>`;
}

function renderText(message: EmailMessage, chrome: EmailChrome): string {
  const lines: string[] = [`${BRAND_NAME.toUpperCase()}`, message.badge.label.toUpperCase(), "", message.headline, ""];
  for (const paragraph of message.paragraphs) lines.push(paragraph, "");
  if (message.callout) lines.push(`${message.callout.label}: ${message.callout.text}`, "");
  if (message.steps) {
    message.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
    lines.push("");
  }
  if (message.rows) {
    for (const row of message.rows) lines.push(`${row.label}: ${row.value}`);
    lines.push("");
  }
  if (message.items) {
    for (const item of message.items) {
      const quantity = item.quantity === undefined ? "" : ` x ${item.quantity}`;
      const detail = item.detail ? ` (${item.detail})` : "";
      const amount = item.amount ? `  ${item.amount}` : "";
      lines.push(`- ${item.name}${detail}${quantity}${amount}`);
    }
    for (const total of message.totals ?? []) lines.push(`${total.label}: ${total.value}`);
    lines.push("");
  }
  for (const section of message.sections ?? []) {
    lines.push(section.heading);
    for (const row of section.rows) {
      const head = row.label ? `${row.label}: ` : "";
      const pill = row.pill ? ` (${row.pill})` : "";
      lines.push(`- ${head}${row.text}${pill}`);
    }
    lines.push("");
  }
  lines.push(`${message.cta.label}: ${message.cta.url}`, "", message.reason);
  if (chrome.settingsUrl) lines.push(`Manage email settings: ${chrome.settingsUrl}`);
  if (chrome.canReply) lines.push("Questions? Reply to this email and we will read it.");
  return `${lines.join("\n")}\n`;
}

function renderRows(rows: NonNullable<EmailMessage["rows"]>): string {
  const body = rows
    .map((row, index) => {
      const top = index === 0 ? "" : `border-top:1px solid ${EMAIL_COLORS.tintLine};`;
      return (
        `<tr><td valign="top" style="padding:10px 14px;${top}font-family:${SANS};font-size:13px;line-height:1.4;color:${EMAIL_COLORS.muted}">${e(row.label)}</td>` +
        `<td valign="top" align="right" style="padding:10px 14px;${top}font-family:${SANS};font-size:14px;line-height:1.4;font-weight:700;color:${EMAIL_COLORS.ink};word-break:break-word">${e(row.value)}</td></tr>`
      );
    })
    .join("");
  return (
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${EMAIL_COLORS.tint};border:1px solid ${EMAIL_COLORS.line};border-radius:8px">` +
    `${body}</table>`
  );
}

function renderItems(items: NonNullable<EmailMessage["items"]>, totals: NonNullable<EmailMessage["totals"]>): string {
  const line = `border-bottom:1px solid ${EMAIL_COLORS.tintLine};`;
  const itemRows = items
    .map((item) => {
      const quantity = item.quantity === undefined ? "" : ` <span style="color:${EMAIL_COLORS.muted}">&times; ${item.quantity}</span>`;
      const detail = item.detail ? `<br><span style="font-size:12px;color:${EMAIL_COLORS.muted}">${e(item.detail)}</span>` : "";
      return (
        `<tr><td valign="top" style="padding:10px 0;${line}font-family:${SANS};font-size:14px;line-height:1.4;color:${EMAIL_COLORS.ink}">${e(item.name)}${quantity}${detail}</td>` +
        `<td valign="top" align="right" style="padding:10px 0 10px 12px;${line}font-family:${SANS};font-size:14px;line-height:1.4;color:${EMAIL_COLORS.ink};white-space:nowrap">${item.amount ? e(item.amount) : ""}</td></tr>`
      );
    })
    .join("");
  const totalRows = totals
    .map((total) => {
      const weight = total.strong ? "font-weight:700;font-size:16px;" : "font-size:14px;";
      const color = total.strong ? EMAIL_COLORS.ink : EMAIL_COLORS.muted;
      const border = total.strong ? "" : line;
      const labelPadding = total.strong ? "12px 0 0 0" : "10px 0";
      const valuePadding = total.strong ? "12px 0 0 12px" : "10px 0 10px 12px";
      return (
        `<tr><td style="padding:${labelPadding};${border}font-family:${SANS};${weight}color:${color}">${e(total.label)}</td>` +
        `<td align="right" style="padding:${valuePadding};${border}font-family:${SANS};${weight}color:${EMAIL_COLORS.ink};white-space:nowrap">${e(total.value)}</td></tr>`
      );
    })
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${itemRows}${totalRows}</table>`;
}

function renderSection(section: NonNullable<EmailMessage["sections"]>[number]): string {
  const rows = section.rows
    .map((row) => {
      const label = row.label ? `<strong style="color:${EMAIL_COLORS.ink}">${e(row.label)}</strong><br>` : "";
      const pill = row.pill
        ? `<td valign="top" align="right" style="padding:10px 0 10px 10px;border-bottom:1px solid ${EMAIL_COLORS.tintLine}"><span style="display:inline-block;background:${TONES.warning.bg};color:${TONES.warning.fg};font-family:${SANS};font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap">${e(row.pill)}</span></td>`
        : "";
      return (
        `<tr><td valign="top" style="padding:10px 0;border-bottom:1px solid ${EMAIL_COLORS.tintLine};font-family:${SANS};font-size:14px;line-height:1.4;color:${EMAIL_COLORS.body}">${label}${e(row.text)}</td>${pill}</tr>`
      );
    })
    .join("");
  return (
    `<div style="font-family:${SANS};font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${EMAIL_COLORS.brand};padding-bottom:6px;border-bottom:2px solid ${EMAIL_COLORS.brand}">${e(section.heading)}</div>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows}</table>`
  );
}

function renderHtml(message: EmailMessage, chrome: EmailChrome): string {
  const tone = TONES[message.badge.tone];
  const parts: string[] = [];

  parts.push(
    `<tr><td align="center" style="background:${EMAIL_COLORS.logoBand};padding:18px 28px;font-family:${SANS};font-size:18px;font-weight:700;color:#ffffff">` +
      `<img src="${e(chrome.logoUrl)}" width="112" alt="${BRAND_NAME}" style="display:block;margin:0 auto;width:112px;max-width:112px;height:auto;border:0">` +
      `</td></tr>`,
    `<tr><td style="height:4px;line-height:4px;font-size:0;background:${EMAIL_COLORS.brand}">&nbsp;</td></tr>`,
    block(
      `<span style="display:inline-block;background:${tone.bg};color:${tone.fg};font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:5px 11px;border-radius:999px">${e(message.badge.label)}</span>`,
      "26px 28px 12px",
    ),
    block(
      `<div class="h1" style="font-family:${SERIF};font-size:28px;line-height:1.2;font-weight:400;color:${EMAIL_COLORS.ink}">${e(message.headline)}</div>`,
      "0 28px 14px",
    ),
  );

  for (const paragraph of message.paragraphs) {
    parts.push(
      block(
        `<div style="font-family:${SANS};font-size:16px;line-height:1.55;color:${EMAIL_COLORS.body}">${e(paragraph)}</div>`,
        "0 28px 14px",
      ),
    );
  }

  if (message.callout) {
    parts.push(
      block(
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${tone.bg};border-left:4px solid ${tone.bar};border-radius:6px">` +
          `<tr><td style="padding:12px 16px;font-family:${SANS}"><div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${tone.fg}">${e(message.callout.label)}</div>` +
          `<div style="font-size:16px;line-height:1.4;font-weight:700;color:${EMAIL_COLORS.ink};margin-top:2px">${e(message.callout.text)}</div></td></tr></table>`,
        "2px 28px 16px",
      ),
    );
  }

  if (message.steps) {
    const steps = message.steps
      .map(
        (step, index) =>
          `<tr><td valign="top" style="padding:0 12px 10px 0"><div style="width:24px;height:24px;border-radius:12px;background:${EMAIL_COLORS.brand};color:#ffffff;font-family:${SANS};font-size:13px;font-weight:700;line-height:24px;text-align:center">${index + 1}</div></td>` +
          `<td valign="top" style="padding-bottom:10px;font-family:${SANS};font-size:15px;line-height:1.5;color:${EMAIL_COLORS.body}">${e(step)}</td></tr>`,
      )
      .join("");
    parts.push(block(`<table role="presentation" cellspacing="0" cellpadding="0" border="0">${steps}</table>`, "2px 28px 8px"));
  }

  if (message.rows) parts.push(block(renderRows(message.rows), "2px 28px 16px"));
  if (message.items) parts.push(block(renderItems(message.items, message.totals ?? []), "0 28px 18px"));
  for (const section of message.sections ?? []) parts.push(block(renderSection(section), "4px 28px 14px"));

  // The button is a table cell, not a padded link: Outlook ignores padding on a link. It fills the width on a phone.
  parts.push(
    `<tr><td class="px" align="center" style="padding:6px 28px 10px">` +
      `<table role="presentation" class="btn" align="center" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto">` +
      `<tr><td align="center" bgcolor="${EMAIL_COLORS.brand}" style="background:${EMAIL_COLORS.brand};border-radius:8px;padding:14px 28px">` +
      `<a href="${e(message.cta.url)}" style="display:block;font-family:${SANS};font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none">${e(message.cta.label)}</a>` +
      `</td></tr></table></td></tr>`,
    `<tr><td class="px" align="center" style="padding:0 28px 24px;font-family:${SANS};font-size:12px;line-height:1.5;color:${EMAIL_COLORS.muted};text-align:center">` +
      `Button not working? Copy this link into your browser:<br>` +
      `<a href="${e(message.cta.url)}" style="color:${EMAIL_COLORS.brand};word-break:break-all">${e(message.cta.url)}</a></td></tr>`,
  );

  const links: string[] = [];
  if (chrome.settingsUrl) links.push(`<a href="${e(chrome.settingsUrl)}" style="color:${EMAIL_COLORS.brand}">Manage email settings</a>`);
  const reply = chrome.canReply ? `<br>Questions? Reply to this email and we will read it.` : "";
  let host = chrome.siteUrl;
  try {
    host = new URL(chrome.siteUrl).host;
  } catch {
    // A site address that does not parse is shown as it is.
  }
  parts.push(
    `<tr><td class="px" style="background:${EMAIL_COLORS.tint};border-top:1px solid ${EMAIL_COLORS.line};padding:18px 28px;font-family:${SANS};font-size:12px;line-height:1.6;color:${EMAIL_COLORS.muted}">` +
      `${e(message.reason)}${links.length > 0 ? ` ${links.join(" ")}` : ""}${reply}<br>` +
      `<span style="color:#5e7268">${BRAND_NAME} &middot; ${e(host)}</span></td></tr>`,
  );

  // Hidden text that fills the preview line, with padding so the body text does not leak into it.
  const preheader =
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${EMAIL_COLORS.page}">` +
    `${e(message.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`;

  return (
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<meta name="x-apple-disable-message-reformatting">\n` +
    `<meta name="color-scheme" content="light">\n<meta name="supported-color-schemes" content="light">\n` +
    `<title>${e(message.subject)}</title>\n` +
    `<style>\n` +
    `body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}\n` +
    `table{border-collapse:collapse}\n` +
    `img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}\n` +
    `@media only screen and (max-width:480px){\n` +
    `.px{padding-left:20px!important;padding-right:20px!important}\n` +
    `.h1{font-size:24px!important;line-height:1.25!important}\n` +
    `.btn{width:100%!important}\n` +
    `}\n</style>\n</head>\n` +
    `<body style="margin:0;padding:0;background:${EMAIL_COLORS.page}">\n${preheader}\n` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${EMAIL_COLORS.page}"><tr><td align="center" style="padding:24px 12px">\n` +
    `<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:${EMAIL_COLORS.card};border:1px solid ${EMAIL_COLORS.line};border-radius:12px;overflow:hidden">\n` +
    `${parts.join("\n")}\n</table>\n</td></tr></table>\n</body>\n</html>`
  );
}

/** Subject, plain text and HTML for one email. Pure: the caller supplies the message and the surrounding links. */
export function renderEmail(message: EmailMessage, chrome: EmailChrome): RenderedEmail {
  return { subject: message.subject, text: renderText(message, chrome), html: renderHtml(message, chrome) };
}
