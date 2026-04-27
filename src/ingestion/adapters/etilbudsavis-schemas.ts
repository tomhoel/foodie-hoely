/**
 * Zod schemas for the Tjek squid v2 API responses (etilbudsavis backend).
 * Schemas match real responses verified during research (April 2026).
 */

import { z } from 'zod';

export const TjekDealerSchema = z.object({
  id: z.string(),
  name: z.string(),
  website: z.string().optional(),
  logo: z.string().optional(),
  color: z.string().optional(),
});

export const TjekDealersResponseSchema = z.array(TjekDealerSchema);

export const TjekCatalogSchema = z.object({
  id: z.string(),
  ern: z.string().optional(),
  label: z.string().optional(),
  page_count: z.number().optional(),
  offer_count: z.number().optional(),
  publish: z.string().optional(),
  run_from: z.string().optional(),
  run_till: z.string().optional(),
  dealer_id: z.string(),
  dealer: z.object({ id: z.string(), name: z.string() }).optional(),
});

export const TjekCatalogsResponseSchema = z.array(TjekCatalogSchema);

export const TjekOfferPricingSchema = z.object({
  price: z.number(),
  pre_price: z.number().nullable().optional(),
  currency: z.string(),
});

export const TjekOfferQuantitySchema = z.object({
  unit: z.object({ symbol: z.string(), si: z.object({ symbol: z.string(), factor: z.number() }).optional() }).optional(),
  size: z.object({ from: z.number(), to: z.number() }).optional(),
  pieces: z.object({ from: z.number(), to: z.number() }).optional(),
}).optional();

export const TjekOfferImagesSchema = z.object({
  thumb: z.string().optional(),
  view: z.string().optional(),
  zoom: z.string().optional(),
}).optional();

export const TjekOfferSchema = z.object({
  id: z.string(),
  ern: z.string().optional(),
  heading: z.string(),
  description: z.string().optional(),
  catalog_page: z.number().optional(),
  pricing: TjekOfferPricingSchema,
  quantity: TjekOfferQuantitySchema,
  images: TjekOfferImagesSchema,
  run_from: z.string().optional(),
  run_till: z.string().optional(),
  dealer: z.object({ id: z.string(), name: z.string() }).optional(),
  dealer_id: z.string(),
  store_id: z.string().optional(),
  catalog_id: z.string(),
  category_ids: z.array(z.string()).optional(),
});

export const TjekOffersResponseSchema = z.array(TjekOfferSchema);

export type TjekDealer = z.infer<typeof TjekDealerSchema>;
export type TjekCatalog = z.infer<typeof TjekCatalogSchema>;
export type TjekOffer = z.infer<typeof TjekOfferSchema>;
