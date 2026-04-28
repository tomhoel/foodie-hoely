export interface WeeklyPlanEmailInput {
  weekStart: string;
  recipes: Array<{
    id: string;
    title: string;
    plannedFor: string;
    servings: number;
    costNok: number;
  }>;
  totalNok: number;
  trumfEstimateNok: number;
  pantrySavingsNok: number;
  storeStops: number;
  storeBreakdown: Array<{
    dealer: string;
    subtotal: number;
    trumfEarned: number;
  }>;
  narration: string;
  warnings: string[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderWeeklyPlanEmail(input: WeeklyPlanEmailInput): RenderedEmail {
  const subject = `Foodie weekly plan — week of ${input.weekStart}`;

  const recipeRowsHtml = input.recipes
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(formatDay(r.plannedFor))}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(r.title)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${formatNok(r.costNok)}</td>
        </tr>`
    )
    .join('');

  const storeRowsHtml = input.storeBreakdown
    .map(
      (s) =>
        `<tr>
          <td style="padding:6px 12px;">${esc(s.dealer)}</td>
          <td style="padding:6px 12px;text-align:right;">${formatNok(s.subtotal)}</td>
          <td style="padding:6px 12px;text-align:right;color:#888;">+${formatNok(s.trumfEarned)} Trumf</td>
        </tr>`
    )
    .join('');

  const warningsHtml = input.warnings.length
    ? `<h3 style="margin-top:24px;color:#a00;">Warnings</h3>
       <ul>${input.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`
    : '';

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#222;line-height:1.4;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="margin:0 0 8px 0;font-size:22px;">Your week, planned 🍳</h1>
  <p style="color:#666;margin:0 0 24px 0;">Week of ${esc(input.weekStart)}</p>

  <h2 style="font-size:16px;margin:0 0 8px 0;">Meals</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
    <thead><tr style="background:#f7f7f7;">
      <th style="padding:8px 12px;text-align:left;">Day</th>
      <th style="padding:8px 12px;text-align:left;">Recipe</th>
      <th style="padding:8px 12px;text-align:right;">Cost</th>
    </tr></thead>
    <tbody>${recipeRowsHtml}</tbody>
    <tfoot><tr>
      <td colspan="2" style="padding:8px 12px;font-weight:600;border-top:2px solid #222;">Total</td>
      <td style="padding:8px 12px;font-weight:600;text-align:right;border-top:2px solid #222;">${formatNok(input.totalNok)}</td>
    </tr></tfoot>
  </table>

  <h2 style="font-size:16px;margin:0 0 8px 0;">Where to shop</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
    <tbody>${storeRowsHtml}</tbody>
  </table>
  <p style="color:#666;font-size:13px;margin:0 0 24px 0;">${input.storeStops} ${input.storeStops === 1 ? 'stop' : 'stops'} · estimated Trumf bonus ${formatNok(input.trumfEstimateNok)} NOK${input.pantrySavingsNok > 0 ? ` · pantry savings ${formatNok(input.pantrySavingsNok)} NOK` : ''}</p>

  <h2 style="font-size:16px;margin:0 0 8px 0;">Why this plan</h2>
  <p style="white-space:pre-wrap;">${esc(input.narration)}</p>

  ${warningsHtml}
</body></html>`;

  const text = [
    `Foodie weekly plan — week of ${input.weekStart}`,
    '',
    'Meals:',
    ...input.recipes.map((r) => `  ${formatDay(r.plannedFor)} — ${r.title} (${formatNok(r.costNok)} NOK)`),
    '',
    `Total: ${formatNok(input.totalNok)} NOK`,
    `Trumf bonus: ${formatNok(input.trumfEstimateNok)} NOK`,
    input.pantrySavingsNok > 0 ? `Pantry savings: ${formatNok(input.pantrySavingsNok)} NOK` : '',
    `Stops: ${input.storeStops}`,
    '',
    'Per store:',
    ...input.storeBreakdown.map((s) => `  ${s.dealer} ${formatNok(s.subtotal)} NOK (+${formatNok(s.trumfEarned)} Trumf)`),
    '',
    'Why this plan:',
    input.narration,
    '',
    ...(input.warnings.length ? ['Warnings:', ...input.warnings.map((w) => `  - ${w}`)] : []),
  ]
    .filter((line) => line !== '')
    .join('\n');

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

function formatNok(n: number): string {
  return n.toFixed(2);
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
