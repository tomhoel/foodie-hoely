#!/usr/bin/env node
/**
 * Re-crop all existing Gemini images from stretched 96x96 to proper center-cropped 96x96.
 * Re-generates from Gemini with square aspect ratio prompt, then center-crops properly.
 */
import { writeFile, readFile, readdir } from 'fs/promises';
import { execSync } from 'child_process';

const GEMINI_KEY = 'AIzaSyDx-2SC5BYTSk_0J3INjqLdlEG-uRTjTKQ';
const MODEL = 'gemini-3.1-flash-image-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;
const IMG_DIR = new URL('./img/', import.meta.url).pathname;
const CONCURRENT = 2;
const DELAY_MS = 2000;

// All dishes that need regeneration (the 117 Gemini-generated ones)
const dishes = [
  {name:"Red Curry",cuisine:"Thai"},{name:"Yellow Curry",cuisine:"Thai"},{name:"Gaeng Som",cuisine:"Thai"},
  {name:"Gaeng Hung Lay",cuisine:"Thai"},{name:"Gaeng Pa",cuisine:"Thai"},{name:"Gaeng Tai Pla",cuisine:"Thai"},
  {name:"Gaeng Liang",cuisine:"Thai"},{name:"Chu Chee",cuisine:"Thai"},{name:"Gaeng Jued",cuisine:"Thai"},
  {name:"Panaeng Neua",cuisine:"Thai"},{name:"Tom Yum Gai",cuisine:"Thai"},{name:"Khao Tom",cuisine:"Thai"},
  {name:"Tom Saap",cuisine:"Thai"},{name:"Tom Jued Woon Sen",cuisine:"Thai"},{name:"Pad Woon Sen",cuisine:"Thai"},
  {name:"Guay Tiew",cuisine:"Thai"},{name:"Guay Tiew Reua",cuisine:"Thai"},{name:"Kuay Chap",cuisine:"Thai"},
  {name:"Yen Ta Fo",cuisine:"Thai"},{name:"Bamee",cuisine:"Thai"},{name:"Rad Na",cuisine:"Thai"},
  {name:"Khanom Jeen",cuisine:"Thai"},{name:"Khanom Jeen Nam Ya",cuisine:"Thai"},{name:"Sukiyaki Thai",cuisine:"Thai"},
  {name:"Mee Krob",cuisine:"Thai"},{name:"Pad Prik King",cuisine:"Thai"},{name:"Pad Cashew Chicken",cuisine:"Thai"},
  {name:"Pad Prik Gaeng",cuisine:"Thai"},{name:"Pad Phak Bung",cuisine:"Thai"},{name:"Pad Phak Ruam",cuisine:"Thai"},
  {name:"Kai Pad Prik",cuisine:"Thai"},{name:"Neua Pad Prik",cuisine:"Thai"},{name:"Pla Rad Prik",cuisine:"Thai"},
  {name:"Khao Pad Gai",cuisine:"Thai"},{name:"Khao Pad Goong",cuisine:"Thai"},{name:"Khao Pad Sapparod",cuisine:"Thai"},
  {name:"Khao Man Gai",cuisine:"Thai"},{name:"Khao Moo Daeng",cuisine:"Thai"},{name:"Khao Kha Moo",cuisine:"Thai"},
  {name:"Khao Na Ped",cuisine:"Thai"},{name:"Khao Mok Gai",cuisine:"Thai"},{name:"Khao Kluk Kapi",cuisine:"Thai"},
  {name:"Khao Niao",cuisine:"Thai"},{name:"Som Tam",cuisine:"Thai"},{name:"Som Tam Thai",cuisine:"Thai"},
  {name:"Som Tam Poo Pla Ra",cuisine:"Thai"},{name:"Larb",cuisine:"Thai"},{name:"Larb Moo",cuisine:"Thai"},
  {name:"Larb Gai",cuisine:"Thai"},{name:"Nam Tok",cuisine:"Thai"},{name:"Yam Woon Sen",cuisine:"Thai"},
  {name:"Yam Talay",cuisine:"Thai"},{name:"Yam Neua",cuisine:"Thai"},{name:"Yam Pla Dook Foo",cuisine:"Thai"},
  {name:"Yam Mamuang",cuisine:"Thai"},{name:"Yam Khai Dao",cuisine:"Thai"},{name:"Phla Goong",cuisine:"Thai"},
  {name:"Moo Ping",cuisine:"Thai"},{name:"Satay",cuisine:"Thai"},{name:"Kor Moo Yang",cuisine:"Thai"},
  {name:"Pla Pao",cuisine:"Thai"},{name:"Sai Krok Isaan",cuisine:"Thai"},{name:"Suea Rong Hai",cuisine:"Thai"},
  {name:"Moo Satay",cuisine:"Thai"},{name:"Kai Jeow",cuisine:"Thai"},{name:"Kai Jeow Moo Sap",cuisine:"Thai"},
  {name:"Gai Tod",cuisine:"Thai"},{name:"Gai Tod Hat Yai",cuisine:"Thai"},{name:"Moo Tod Gratiem",cuisine:"Thai"},
  {name:"Poh Pia Tod",cuisine:"Thai"},{name:"Poh Pia Sod",cuisine:"Thai"},{name:"Hoy Tod",cuisine:"Thai"},
  {name:"Look Chin",cuisine:"Thai"},{name:"Khanom Buang",cuisine:"Thai"},{name:"Goong Sarong",cuisine:"Thai"},
  {name:"Thot Man Khao Pod",cuisine:"Thai"},{name:"Nam Prik Ong",cuisine:"Thai"},{name:"Nam Prik Noom",cuisine:"Thai"},
  {name:"Nam Jim Jaew",cuisine:"Thai"},{name:"Nam Prik Goong Siap",cuisine:"Thai"},{name:"Nam Prik Kapi",cuisine:"Thai"},
  {name:"Lon Tao Jiaw",cuisine:"Thai"},{name:"Kai Palo",cuisine:"Thai"},{name:"Moo Hong",cuisine:"Thai"},
  {name:"Pla Nueng Manao",cuisine:"Thai"},{name:"Pla Sam Rod",cuisine:"Thai"},{name:"Neua Toon",cuisine:"Thai"},
  {name:"Ho Mok",cuisine:"Thai"},{name:"Pla Meuk Yang",cuisine:"Thai"},{name:"Kao Niao Mamuang",cuisine:"Thai"},
  {name:"Tub Tim Grob",cuisine:"Thai"},{name:"Bua Loi",cuisine:"Thai"},{name:"Khanom Krok",cuisine:"Thai"},
  {name:"Sangkaya Fak Thong",cuisine:"Thai"},{name:"Lod Chong",cuisine:"Thai"},{name:"Foi Thong",cuisine:"Thai"},
  {name:"Kluay Buat Chi",cuisine:"Thai"},{name:"Khanom Tuay",cuisine:"Thai"},{name:"Itim Kati",cuisine:"Thai"},
  {name:"Khanom Tan",cuisine:"Thai"},{name:"Khao Lam",cuisine:"Thai"},{name:"Roti",cuisine:"Thai"},
  {name:"Bibimbap",cuisine:"Korean"},{name:"Kimchi Jjigae",cuisine:"Korean"},{name:"Bulgogi",cuisine:"Korean"},
  {name:"Japchae",cuisine:"Korean"},{name:"Tteokbokki",cuisine:"Korean"},{name:"Korean Fried Chicken",cuisine:"Korean"},
  {name:"Sundubu Jjigae",cuisine:"Korean"},{name:"Bun Bo Hue",cuisine:"Vietnamese"},
  {name:"Gyoza",cuisine:"Japanese"},{name:"Okonomiyaki",cuisine:"Japanese"},{name:"Yakitori",cuisine:"Japanese"},
  {name:"Dan Dan Noodles",cuisine:"Chinese"},{name:"Char Siu",cuisine:"Chinese"},
  {name:"Butter Chicken",cuisine:"Indian"},{name:"Nasi Goreng",cuisine:"Indonesian"},
];

function slug(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function centerCrop(inputPath, outputPath, size) {
  // Get dimensions
  const wOut = execSync(`sips -g pixelWidth "${inputPath}" 2>/dev/null`).toString();
  const hOut = execSync(`sips -g pixelHeight "${inputPath}" 2>/dev/null`).toString();
  const w = parseInt(wOut.match(/pixelWidth:\s*(\d+)/)?.[1] || '0');
  const h = parseInt(hOut.match(/pixelHeight:\s*(\d+)/)?.[1] || '0');

  if (w === 0 || h === 0) return false;

  // Crop to center square
  const sq = Math.min(w, h);
  const x = Math.floor((w - sq) / 2);
  const y = Math.floor((h - sq) / 2);

  // Use sips: crop to square, then resize
  execSync(`sips -c ${sq} ${sq} "${inputPath}" -o "${inputPath}" 2>/dev/null`);
  execSync(`sips -z ${size} ${size} "${inputPath}" --setProperty format jpeg --setProperty formatOptions 80 -o "${outputPath}" 2>/dev/null`);
  return true;
}

async function generateImage(dish) {
  const fn = `${IMG_DIR}${slug(dish.name)}.jpg`;
  const tmpFile = fn.replace('.jpg', '-raw.jpg');

  try {
    const prompt = `Generate a realistic, appetizing square food photography image of "${dish.name}" (${dish.cuisine} cuisine). Shot from above, plated beautifully on a round plate, natural lighting, clean background. No text or labels.`;
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
      return { dish: dish.name, status: 'api-error', error: `${res.status}` };
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p => p.inlineData);

    if (!imgPart) return { dish: dish.name, status: 'no-image' };

    const buf = Buffer.from(imgPart.inlineData.data, 'base64');
    await writeFile(tmpFile, buf);

    // Center-crop to square, then resize to 96x96
    centerCrop(tmpFile, fn, 96);
    try { execSync(`rm -f "${tmpFile}"`); } catch {}

    return { dish: dish.name, status: 'ok' };
  } catch (e) {
    return { dish: dish.name, status: 'error', error: e.message };
  }
}

async function main() {
  console.log(`Regenerating ${dishes.length} images with proper square crop...\n`);
  let ok = 0, errors = 0;

  for (let i = 0; i < dishes.length; i += CONCURRENT) {
    const batch = dishes.slice(i, i + CONCURRENT);
    const results = await Promise.allSettled(batch.map(d => generateImage(d)));

    for (const r of results) {
      const v = r.status === 'fulfilled' ? r.value : { dish: '?', status: 'failed', error: r.reason?.message };
      if (v.status === 'ok') { ok++; console.log(`  ✓ ${v.dish}`); }
      else { errors++; console.log(`  ✗ ${v.dish}: ${v.status} ${v.error || ''}`); }
    }

    console.log(`  [${Math.min(i + CONCURRENT, dishes.length)}/${dishes.length}] ok=${ok} errors=${errors}\n`);
    if (i + CONCURRENT < dishes.length) await sleep(DELAY_MS);
  }

  console.log(`\nDone! OK: ${ok}, Errors: ${errors}`);
}

main().catch(console.error);
