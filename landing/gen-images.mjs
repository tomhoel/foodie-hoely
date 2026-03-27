#!/usr/bin/env node
/**
 * Bulk-generate dish images via Gemini 3.1 Flash Image Preview.
 * Saves 96x96 JPEG thumbnails to ./img/{slug}.jpg
 * Run: node gen-images.mjs
 */
import { writeFile, readFile } from 'fs/promises';
import { execSync } from 'child_process';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error('Error: GEMINI_API_KEY env var is required'); process.exit(1); }
const MODEL = 'gemini-3.1-flash-image-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;
const IMG_DIR = new URL('./img/', import.meta.url).pathname;
const CONCURRENT = 2;
const DELAY_MS = 2000; // delay between batches to respect rate limits

// All dishes without hardcoded images
const dishes = [
  // Thai — Curries
  { name: "Red Curry", cuisine: "Thai" },
  { name: "Yellow Curry", cuisine: "Thai" },
  { name: "Gaeng Som", cuisine: "Thai" },
  { name: "Gaeng Hung Lay", cuisine: "Thai" },
  { name: "Gaeng Pa", cuisine: "Thai" },
  { name: "Gaeng Tai Pla", cuisine: "Thai" },
  { name: "Gaeng Liang", cuisine: "Thai" },
  { name: "Chu Chee", cuisine: "Thai" },
  { name: "Gaeng Jued", cuisine: "Thai" },
  { name: "Panaeng Neua", cuisine: "Thai" },
  // Thai — Soups
  { name: "Tom Yum Gai", cuisine: "Thai" },
  { name: "Khao Tom", cuisine: "Thai" },
  { name: "Tom Saap", cuisine: "Thai" },
  { name: "Tom Jued Woon Sen", cuisine: "Thai" },
  // Thai — Noodles
  { name: "Pad Woon Sen", cuisine: "Thai" },
  { name: "Guay Tiew", cuisine: "Thai" },
  { name: "Guay Tiew Reua", cuisine: "Thai" },
  { name: "Kuay Chap", cuisine: "Thai" },
  { name: "Yen Ta Fo", cuisine: "Thai" },
  { name: "Bamee", cuisine: "Thai" },
  { name: "Rad Na", cuisine: "Thai" },
  { name: "Khanom Jeen", cuisine: "Thai" },
  { name: "Khanom Jeen Nam Ya", cuisine: "Thai" },
  { name: "Sukiyaki Thai", cuisine: "Thai" },
  { name: "Mee Krob", cuisine: "Thai" },
  // Thai — Stir-fries
  { name: "Pad Prik King", cuisine: "Thai" },
  { name: "Pad Cashew Chicken", cuisine: "Thai" },
  { name: "Pad Prik Gaeng", cuisine: "Thai" },
  { name: "Pad Phak Bung", cuisine: "Thai" },
  { name: "Pad Phak Ruam", cuisine: "Thai" },
  { name: "Kai Pad Prik", cuisine: "Thai" },
  { name: "Neua Pad Prik", cuisine: "Thai" },
  { name: "Pla Rad Prik", cuisine: "Thai" },
  // Thai — Rice
  { name: "Khao Pad Gai", cuisine: "Thai" },
  { name: "Khao Pad Goong", cuisine: "Thai" },
  { name: "Khao Pad Sapparod", cuisine: "Thai" },
  { name: "Khao Man Gai", cuisine: "Thai" },
  { name: "Khao Moo Daeng", cuisine: "Thai" },
  { name: "Khao Kha Moo", cuisine: "Thai" },
  { name: "Khao Na Ped", cuisine: "Thai" },
  { name: "Khao Mok Gai", cuisine: "Thai" },
  { name: "Khao Kluk Kapi", cuisine: "Thai" },
  { name: "Khao Niao", cuisine: "Thai" },
  // Thai — Salads
  { name: "Som Tam", cuisine: "Thai" },
  { name: "Som Tam Thai", cuisine: "Thai" },
  { name: "Som Tam Poo Pla Ra", cuisine: "Thai" },
  { name: "Larb", cuisine: "Thai" },
  { name: "Larb Moo", cuisine: "Thai" },
  { name: "Larb Gai", cuisine: "Thai" },
  { name: "Nam Tok", cuisine: "Thai" },
  { name: "Yam Woon Sen", cuisine: "Thai" },
  { name: "Yam Talay", cuisine: "Thai" },
  { name: "Yam Neua", cuisine: "Thai" },
  { name: "Yam Pla Dook Foo", cuisine: "Thai" },
  { name: "Yam Mamuang", cuisine: "Thai" },
  { name: "Yam Khai Dao", cuisine: "Thai" },
  { name: "Phla Goong", cuisine: "Thai" },
  // Thai — Grilled
  { name: "Moo Ping", cuisine: "Thai" },
  { name: "Satay", cuisine: "Thai" },
  { name: "Kor Moo Yang", cuisine: "Thai" },
  { name: "Pla Pao", cuisine: "Thai" },
  { name: "Sai Krok Isaan", cuisine: "Thai" },
  { name: "Suea Rong Hai", cuisine: "Thai" },
  { name: "Moo Satay", cuisine: "Thai" },
  // Thai — Fried & Street Food
  { name: "Kai Jeow", cuisine: "Thai" },
  { name: "Kai Jeow Moo Sap", cuisine: "Thai" },
  { name: "Gai Tod", cuisine: "Thai" },
  { name: "Gai Tod Hat Yai", cuisine: "Thai" },
  { name: "Moo Tod Gratiem", cuisine: "Thai" },
  { name: "Poh Pia Tod", cuisine: "Thai" },
  { name: "Poh Pia Sod", cuisine: "Thai" },
  { name: "Hoy Tod", cuisine: "Thai" },
  { name: "Look Chin", cuisine: "Thai" },
  { name: "Khanom Buang", cuisine: "Thai" },
  { name: "Goong Sarong", cuisine: "Thai" },
  { name: "Thot Man Khao Pod", cuisine: "Thai" },
  // Thai — Dips
  { name: "Nam Prik Ong", cuisine: "Thai" },
  { name: "Nam Prik Noom", cuisine: "Thai" },
  { name: "Nam Jim Jaew", cuisine: "Thai" },
  { name: "Nam Prik Goong Siap", cuisine: "Thai" },
  { name: "Nam Prik Kapi", cuisine: "Thai" },
  { name: "Lon Tao Jiaw", cuisine: "Thai" },
  // Thai — Other mains
  { name: "Kai Palo", cuisine: "Thai" },
  { name: "Moo Hong", cuisine: "Thai" },
  { name: "Pla Nueng Manao", cuisine: "Thai" },
  { name: "Pla Sam Rod", cuisine: "Thai" },
  { name: "Neua Toon", cuisine: "Thai" },
  { name: "Ho Mok", cuisine: "Thai" },
  { name: "Pla Meuk Yang", cuisine: "Thai" },
  // Thai — Desserts
  { name: "Kao Niao Mamuang", cuisine: "Thai" },
  { name: "Tub Tim Grob", cuisine: "Thai" },
  { name: "Bua Loi", cuisine: "Thai" },
  { name: "Khanom Krok", cuisine: "Thai" },
  { name: "Sangkaya Fak Thong", cuisine: "Thai" },
  { name: "Lod Chong", cuisine: "Thai" },
  { name: "Foi Thong", cuisine: "Thai" },
  { name: "Kluay Buat Chi", cuisine: "Thai" },
  { name: "Khanom Tuay", cuisine: "Thai" },
  { name: "Itim Kati", cuisine: "Thai" },
  { name: "Khanom Tan", cuisine: "Thai" },
  { name: "Khao Lam", cuisine: "Thai" },
  { name: "Roti", cuisine: "Thai" },
  // Korean
  { name: "Bibimbap", cuisine: "Korean" },
  { name: "Kimchi Jjigae", cuisine: "Korean" },
  { name: "Bulgogi", cuisine: "Korean" },
  { name: "Japchae", cuisine: "Korean" },
  { name: "Tteokbokki", cuisine: "Korean" },
  { name: "Korean Fried Chicken", cuisine: "Korean" },
  { name: "Sundubu Jjigae", cuisine: "Korean" },
  // Vietnamese
  { name: "Bun Bo Hue", cuisine: "Vietnamese" },
  // Japanese
  { name: "Gyoza", cuisine: "Japanese" },
  { name: "Okonomiyaki", cuisine: "Japanese" },
  { name: "Yakitori", cuisine: "Japanese" },
  // Chinese
  { name: "Dan Dan Noodles", cuisine: "Chinese" },
  { name: "Char Siu", cuisine: "Chinese" },
  // Indian
  { name: "Butter Chicken", cuisine: "Indian" },
  // Indonesian
  { name: "Nasi Goreng", cuisine: "Indonesian" },
];

function slug(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function generateImage(dish) {
  const fn = `${IMG_DIR}${slug(dish.name)}.jpg`;
  // Check if already generated
  try { await readFile(fn); return { dish: dish.name, status: 'cached' }; } catch {}

  const prompt = `Generate a realistic, appetizing top-down food photography image of "${dish.name}" (${dish.cuisine} cuisine). Plated beautifully, natural lighting, clean background. No text or labels.`;
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { imageSize: '512' } }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    return { dish: dish.name, status: 'api-error', error: `${res.status}: ${err.slice(0, 200)}` };
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData);

  if (!imgPart) {
    return { dish: dish.name, status: 'no-image', parts: parts.map(p => Object.keys(p)) };
  }

  // Decode base64 and save
  const buf = Buffer.from(imgPart.inlineData.data, 'base64');
  const tmpFile = fn.replace('.jpg', '-full.jpg');
  await writeFile(tmpFile, buf);

  // Resize to 96x96 using macOS sips
  try {
    execSync(`sips -z 96 96 "${tmpFile}" --setProperty format jpeg --setProperty formatOptions 80 -o "${fn}" 2>/dev/null`);
    execSync(`rm -f "${tmpFile}"`);
  } catch {
    // If sips fails, just use the full-size image
    execSync(`mv "${tmpFile}" "${fn}"`);
  }

  return { dish: dish.name, status: 'generated' };
}

async function main() {
  console.log(`Generating images for ${dishes.length} dishes (${CONCURRENT} concurrent)...\n`);
  let done = 0, errors = 0, cached = 0;

  for (let i = 0; i < dishes.length; i += CONCURRENT) {
    const batch = dishes.slice(i, i + CONCURRENT);
    const results = await Promise.allSettled(batch.map(d => generateImage(d)));

    for (const r of results) {
      const v = r.status === 'fulfilled' ? r.value : { dish: '?', status: 'failed', error: r.reason?.message };
      if (v.status === 'generated') { done++; console.log(`  ✓ ${v.dish}`); }
      else if (v.status === 'cached') { cached++; console.log(`  ● ${v.dish} (cached)`); }
      else { errors++; console.log(`  ✗ ${v.dish}: ${v.status} ${v.error || ''}`); }
    }

    const progress = Math.min(i + CONCURRENT, dishes.length);
    console.log(`  [${progress}/${dishes.length}] done=${done} cached=${cached} errors=${errors}\n`);

    // Rate limit delay between batches
    if (i + CONCURRENT < dishes.length) await sleep(DELAY_MS);
  }

  console.log(`\nDone! Generated: ${done}, Cached: ${cached}, Errors: ${errors}`);
  console.log(`Images saved to: ${IMG_DIR}`);
}

main().catch(console.error);
