/**
 * Zod schemas for kassal.app v1 API responses.
 * Schemas match real responses verified during research (April 2026).
 */

import { z } from 'zod';

export const KassalappStoreSchema = z.object({
  name: z.string(),
  code: z.string(),
  url: z.string().optional(),
  logo: z.string().optional(),
});

export const KassalappPriceHistoryEntrySchema = z.object({
  price: z.number(),
  date: z.string(),
});

export const KassalappAllergenSchema = z.object({
  code: z.string(),
  display_name: z.string(),
  contains: z.enum(['YES', 'NO', 'MAY_CONTAIN']),
});

export const KassalappNutritionSchema = z.object({
  code: z.string().optional(),
  display_name: z.string().optional(),
  amount: z.number().optional(),
  unit: z.string().optional(),
});

export const KassalappLabelSchema = z.object({
  name: z.string(),
  display_name: z.string().optional(),
  icon: z.string().optional(),
});

export const KassalappCategoryNodeSchema = z.object({
  id: z.number(),
  name: z.string(),
  depth: z.number().optional(),
});

export const KassalappProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  brand: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  ean: z.string().nullable().optional(),
  url: z.string().optional(),
  image: z.string().nullable().optional(),
  category: z.array(KassalappCategoryNodeSchema).optional(),
  description: z.string().nullable().optional(),
  ingredients: z.string().nullable().optional(),
  current_price: z.number().nullable().optional(),
  current_unit_price: z.number().nullable().optional(),
  weight: z.number().nullable().optional(),
  weight_unit: z.string().nullable().optional(),
  store: KassalappStoreSchema,
  price_history: z.array(KassalappPriceHistoryEntrySchema).optional(),
  allergens: z.array(KassalappAllergenSchema).optional(),
  nutrition: z.array(KassalappNutritionSchema).optional(),
  labels: z.array(KassalappLabelSchema).optional(),
  updated_at: z.string().optional(),
});

export const KassalappPaginationMetaSchema = z.object({
  current_page: z.number().optional(),
  last_page: z.number().nullable().optional(),
  per_page: z.number().optional(),
  total: z.number().nullable().optional(),
});

export const KassalappPaginationLinksSchema = z.object({
  first: z.string().nullable().optional(),
  last: z.string().nullable().optional(),
  prev: z.string().nullable().optional(),
  next: z.string().nullable().optional(),
});

export const KassalappProductsResponseSchema = z.object({
  data: z.array(KassalappProductSchema),
  links: KassalappPaginationLinksSchema.optional(),
  meta: KassalappPaginationMetaSchema.optional(),
});

export const KassalappEanLookupResponseSchema = z.object({
  data: z.object({
    ean: z.string(),
    products: z.array(KassalappProductSchema),
    allergens: z.array(KassalappAllergenSchema).optional(),
    nutrition: z.array(KassalappNutritionSchema).optional(),
    labels: z.array(KassalappLabelSchema).optional(),
  }),
});

export type KassalappProduct = z.infer<typeof KassalappProductSchema>;
export type KassalappProductsResponse = z.infer<typeof KassalappProductsResponseSchema>;
