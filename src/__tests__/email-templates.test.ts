import { describe, it, expect } from 'vitest';
import { renderWeeklyPlanEmail } from '../email/templates';

describe('renderWeeklyPlanEmail', () => {
  const baseInput = {
    weekStart: '2026-05-04',
    recipes: [
      { id: 'r1', title: 'Tom Kha Gai', plannedFor: '2026-05-04', servings: 4, costNok: 87.5 },
      { id: 'r2', title: 'Pad Thai',    plannedFor: '2026-05-05', servings: 4, costNok: 112.0 },
    ],
    totalNok: 199.5,
    trumfEstimateNok: 1.99,
    pantrySavingsNok: 0,
    storeStops: 2,
    storeBreakdown: [
      { dealer: 'KIWI' as const, subtotal: 145.0, trumfEarned: 1.45 },
      { dealer: 'MENY' as const, subtotal: 54.5,  trumfEarned: 0.55 },
    ],
    narration: 'A balanced week of Thai favourites, leaning on Kiwi this week because of their kokosmelk offer.',
    warnings: [] as string[],
  };

  it('subject mentions the week-start date', () => {
    const out = renderWeeklyPlanEmail(baseInput);
    expect(out.subject).toBe('Foodie weekly plan — week of 2026-05-04');
  });

  it('html body lists every recipe by title with cost', () => {
    const out = renderWeeklyPlanEmail(baseInput);
    expect(out.html).toContain('Tom Kha Gai');
    expect(out.html).toContain('Pad Thai');
    expect(out.html).toContain('87.50');
    expect(out.html).toContain('112.00');
  });

  it('html body shows total NOK + Trumf + per-store breakdown', () => {
    const out = renderWeeklyPlanEmail(baseInput);
    expect(out.html).toContain('199.50');
    expect(out.html).toContain('1.99');
    expect(out.html).toContain('KIWI');
    expect(out.html).toContain('MENY');
    expect(out.html).toContain('145.00');
    expect(out.html).toContain('54.50');
  });

  it('html body includes the narration paragraph', () => {
    const out = renderWeeklyPlanEmail(baseInput);
    expect(out.html).toContain('balanced week of Thai favourites');
  });

  it('text fallback contains the same numeric facts', () => {
    const out = renderWeeklyPlanEmail(baseInput);
    expect(out.text).toContain('Tom Kha Gai');
    expect(out.text).toContain('199.50');
    expect(out.text).toContain('KIWI 145.00');
  });

  it('escapes HTML special chars in recipe titles', () => {
    const out = renderWeeklyPlanEmail({
      ...baseInput,
      recipes: [{ id: 'r1', title: '<script>alert(1)</script>', plannedFor: '2026-05-04', servings: 4, costNok: 50 }],
    });
    expect(out.html).not.toContain('<script>alert(1)</script>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('warnings block appears only when warnings is non-empty', () => {
    const withWarnings = renderWeeklyPlanEmail({ ...baseInput, warnings: ['no candidate for "fish sauce"'] });
    expect(withWarnings.html).toContain('Warnings');
    expect(withWarnings.html).toContain('fish sauce');

    const without = renderWeeklyPlanEmail(baseInput);
    expect(without.html).not.toContain('Warnings');
  });
});
