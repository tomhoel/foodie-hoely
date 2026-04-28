import { describe, it, expect } from 'vitest';
import { matchTransactionToPlannedMeal, tokenize } from '../reconciler/plan-matcher';

describe('tokenize', () => {
  it('lowercases, strips diacritics, splits non-letter chars, filters short tokens', () => {
    expect(tokenize('Kokosmelk Aroy-D 400ml')).toEqual(['kokosmelk', 'aroy', '400ml']);
    expect(tokenize('Sitrongress fersk')).toEqual(['sitrongress', 'fersk']);
    expect(tokenize('Limefrukt løsvekt')).toEqual(['limefrukt', 'losvekt']);
  });
});

describe('matchTransactionToPlannedMeal', () => {
  const candidates = [
    {
      mealPlanItemId: 'mpi-1',
      recipeId: 'r-1',
      plannedFor: '2026-04-15',
      title: 'Tom Kha Gai',
      ingredientTexts: ['200 g kokosmelk', 'kyllingfilet 500 g', 'sitrongress', '4 lime'],
    },
    {
      mealPlanItemId: 'mpi-2',
      recipeId: 'r-2',
      plannedFor: '2026-04-15',
      title: 'Spaghetti Carbonara',
      ingredientTexts: ['500 g spaghetti', '200 g pancetta', '4 egg', 'parmesan'],
    },
  ];

  it('chooses the recipe with highest overlap when above threshold', () => {
    const lines = [
      'Kokosmelk Aroy-D 400ml',
      'Kyllingfilet 500g',
      'Sitrongress fersk',
      'Limefrukt løsvekt',
    ];
    const out = matchTransactionToPlannedMeal({
      transactionDate: '2026-04-15',
      lineNames: lines,
      candidates,
      windowDays: 2,
      minOverlap: 0.3,
    });
    expect(out).not.toBeNull();
    expect(out!.mealPlanItemId).toBe('mpi-1');
    expect(out!.score).toBeGreaterThan(0.3);
  });

  it('returns null when no candidate clears the threshold', () => {
    const lines = ['Snickers Mini', 'Coca-Cola 1.5L', 'Avispapir Aftenposten'];
    const out = matchTransactionToPlannedMeal({
      transactionDate: '2026-04-15',
      lineNames: lines,
      candidates,
      windowDays: 2,
      minOverlap: 0.3,
    });
    expect(out).toBeNull();
  });

  it('skips candidates outside the date window', () => {
    const lines = ['Kokosmelk Aroy-D 400ml', 'Kyllingfilet 500g', 'Sitrongress fersk', 'Limefrukt'];
    const out = matchTransactionToPlannedMeal({
      transactionDate: '2026-04-25',  // 10 days after planned-for
      lineNames: lines,
      candidates,
      windowDays: 2,
      minOverlap: 0.3,
    });
    expect(out).toBeNull();
  });
});
