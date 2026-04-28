import type { AuditItem } from './priority';

export interface RenderedAuditEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RenderAuditEmailInput {
  auditId: string;
  body: string;          // Haiku-drafted prose
  items: AuditItem[];
}

export function renderAuditEmail(input: RenderAuditEmailInput): RenderedAuditEmail {
  const subject = `Foodie pantry check — ${input.items.length} items`;

  const itemRowsHtml = input.items
    .map(
      (it) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(it.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${it.currentGrams.toFixed(0)}g</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#888;">${(it.currentConfidence * 100).toFixed(0)}%</td>
        </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#222;line-height:1.4;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="margin:0 0 8px 0;font-size:22px;">Pantry check ✓</h1>
  <p style="white-space:pre-wrap;">${esc(input.body)}</p>

  <h2 style="font-size:16px;margin:24px 0 8px 0;">Items the system is uncertain about</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
    <thead><tr style="background:#f7f7f7;">
      <th style="padding:8px 12px;text-align:left;">Item</th>
      <th style="padding:8px 12px;text-align:right;">On file</th>
      <th style="padding:8px 12px;text-align:right;">Confidence</th>
    </tr></thead>
    <tbody>${itemRowsHtml}</tbody>
  </table>

  <p style="font-family:Menlo,Consolas,monospace;background:#f3f3f3;padding:12px;border-radius:6px;font-size:13px;">
    npm run audit-reply
  </p>
  <p style="color:#888;font-size:12px;">Audit id: ${esc(input.auditId)}</p>
</body></html>`;

  const text = [
    `Foodie pantry check — ${input.items.length} items`,
    '',
    input.body,
    '',
    'Items the system is uncertain about:',
    ...input.items.map((it) => `  - ${it.name}: ${it.currentGrams.toFixed(0)}g on file (confidence ${(it.currentConfidence * 100).toFixed(0)}%)`),
    '',
    'Reply by running:',
    '  npm run audit-reply',
    '',
    `Audit id: ${input.auditId}`,
  ].join('\n');

  return { subject, html, text };
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
