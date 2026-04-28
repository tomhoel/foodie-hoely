import { z } from 'zod';

export const ConfidenceLevel = z.enum(['high', 'med', 'low']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevel>;

export const PortionBucket = z.enum(['small', 'med', 'large']);
export type PortionBucket = z.infer<typeof PortionBucket>;

export const PORTION_TO_GRAMS: Record<PortionBucket, number> = {
  small: 80,
  med: 150,
  large: 250,
};

export const CONFIDENCE_TO_NUMERIC: Record<ConfidenceLevel, number> = {
  high: 0.9,
  med: 0.6,
  low: 0.3,
};

export const VisionIngredient = z.object({
  name: z.string().min(1),
  confidence: ConfidenceLevel,
  portion: PortionBucket.optional(),
  reasoning: z.string().optional(),
});
export type VisionIngredient = z.infer<typeof VisionIngredient>;

/**
 * Stage 1 output — pure visual extraction, no priors.
 */
export const Stage1Result = z.object({
  dishGuess: z.string().optional(),
  ingredients: z.array(VisionIngredient),
  reasoning: z.string(),
});
export type Stage1Result = z.infer<typeof Stage1Result>;

/**
 * Stage 2 output — same shape as Stage 1, plus pantry-EAN match suggestions.
 */
export const Stage2Ingredient = VisionIngredient.extend({
  matchedPantryEan: z.string().nullable().optional(),
});
export type Stage2Ingredient = z.infer<typeof Stage2Ingredient>;

export const Stage2Result = z.object({
  dishGuess: z.string().optional(),
  ingredients: z.array(Stage2Ingredient),
  reasoning: z.string(),
});
export type Stage2Result = z.infer<typeof Stage2Result>;
