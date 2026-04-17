/**
 * poster/generate.js
 *
 * Prend un objet DATA (positions planétaires, maisons, etc.) et retourne
 * un Buffer PDF A3 prêt pour l'impression (via Puppeteer + Chromium).
 *
 * Usage:
 *   const { generatePoster } = require('./poster/generate');
 *   const pdfBuffer = await generatePoster(data);
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, 'template.html');

// ─────────────────────────────────────────────────────────────────────────────
// Mapping API → DATA template
// ─────────────────────────────────────────────────────────────────────────────

const PLANET_FR = {
  Sun: 'Soleil', Moon: 'Lune', Mercury: 'Mercure', Venus: 'Vénus',
  Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturne', Uranus: 'Uranus',
  Neptune: 'Neptune', Pluto: 'Pluton',
};
const PLANET_SYMBOL = {
  Sun:'☉', Moon:'☽', Mercury:'☿', Venus:'♀', Mars:'♂',
  Jupiter:'♃', Saturn:'♄', Uranus:'♅', Neptune:'♆', Pluto:'♇',
};
const PLANET_COLOR = {
  Sun:'#f4c842', Moon:'#c5cae9', Mercury:'#90a4ae', Venus:'#80cfa0',
  Mars:'#ff7070', Jupiter:'#64b5f6', Saturn:'#bcaaa4', Uranus:'#4dd0e1',
  Neptune:'#b39ddb', Pluto:'#9e9e9e',
};
const ASPECT_TYPE_FR = {
  conjunction:'Conjonction', sextile:'Sextile', square:'Carré',
  trine:'Trigone', opposition:'Opposition',
};
const ASPECT_COLOR = {
  Conjonction:'#f4c842', Sextile:'#80cfa0', Carré:'#ff9060',
  Trigone:'#64b5f6', Opposition:'#ff7070',
};
const ASPECT_DASH = { Conjonction:null, Sextile:null, Trigone:null, Carré:'3,3', Opposition:'5,3' };
const PLANET_ORDER = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];

/**
 * Transforme la réponse brute de /api/basic/natal-chart en objet DATA
 * attendu par le template SVG.
 */
function mapApiResponseToData(apiResponse, meta) {
  const { name, birthDate, birthTime, birthPlace } = meta;

  // ── Planètes ──────────────────────────────────────────────────────────────
  const planetsRaw = apiResponse.planets || apiResponse.celestial_bodies || [];
  const planetsMap = {};
  for (const p of planetsRaw) {
    const key = p.name || p.id;
    planetsMap[key] = p;
  }

  const planets = PLANET_ORDER
    .filter(k => planetsMap[k])
    .map((k, i) => {
      const p = planetsMap[k];
      return {
        name:   PLANET_FR[k] || k,
        symbol: PLANET_SYMBOL[k] || '?',
        lon:    p.longitude ?? p.lon ?? 0,
        house:  p.house ?? p.house_number ?? 1,
        color:  PLANET_COLOR[k] || '#ffffff',
        retro:  !!(p.retrograde || p.is_retrograde),
      };
    });

  // Index pour les aspects (position dans le tableau planets)
  const planetIndex = {};
  PLANET_ORDER.filter(k => planetsMap[k]).forEach((k, i) => { planetIndex[k] = i; });

  // ── Maisons ───────────────────────────────────────────────────────────────
  const housesRaw = apiResponse.houses || apiResponse.house_cusps || {};
  let houses;
  if (Array.isArray(housesRaw)) {
    houses = housesRaw.map(h => h.longitude ?? h.lon ?? h);
  } else {
    // { cusps: [...] } or { 1: lon, 2: lon, ... }
    const cusps = housesRaw.cusps || housesRaw;
    if (Array.isArray(cusps)) {
      houses = cusps.map(h => typeof h === 'object' ? (h.longitude ?? h.lon) : h);
    } else {
      houses = Array.from({ length: 12 }, (_, i) => cusps[i + 1] ?? cusps[String(i + 1)] ?? 0);
    }
  }

  // ── Aspects ───────────────────────────────────────────────────────────────
  const aspectsRaw = apiResponse.aspects || [];
  const opacityByOrb = orb => Math.max(0.25, Math.min(0.8, 0.8 - (Math.abs(orb || 0) / 10)));

  const aspects = aspectsRaw
    .map(asp => {
      const typeEn = (asp.type || asp.aspect || '').toLowerCase().replace(/[\s-]/g, '');
      const typeFr = ASPECT_TYPE_FR[typeEn] || ASPECT_TYPE_FR[asp.type] || asp.type;
      const aIdx = planetIndex[asp.planet1 || asp.body1];
      const bIdx = planetIndex[asp.planet2 || asp.body2];
      if (aIdx == null || bIdx == null || !typeFr) return null;
      return {
        a:       aIdx,
        b:       bIdx,
        type:    typeFr,
        color:   ASPECT_COLOR[typeFr] || '#ffffff',
        opacity: opacityByOrb(asp.orb),
        dash:    ASPECT_DASH[typeFr] ?? null,
      };
    })
    .filter(Boolean);

  // ── Ascendant & MC ────────────────────────────────────────────────────────
  const ascendant = apiResponse.ascendant ?? apiResponse.asc ?? houses[0] ?? 0;
  const mc = apiResponse.mc ?? apiResponse.midheaven ?? houses[9] ?? 0;

  return { name, birthDate, birthTime, birthPlace, ascendant, mc, planets, houses, aspects };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lancement Puppeteer
// ─────────────────────────────────────────────────────────────────────────────

// Chemins Chrome sur macOS (par ordre de priorité)
const MAC_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
];

function findLocalChrome() {
  const fs = require('fs');
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const p of MAC_CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome introuvable. Définis CHROME_PATH ou installe Google Chrome.');
}

async function launchBrowser() {
  const puppeteer = require('puppeteer-core');

  // En local (POSTER_LOCAL=1) : utilise Chrome système
  if (process.env.POSTER_LOCAL === '1' || process.env.NODE_ENV !== 'production') {
    return puppeteer.launch({
      executablePath: findLocalChrome(),
      headless:       'new',
      args:           ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  // En production (Vercel) : @sparticuz/chromium + puppeteer-core
  const chromium = require('@sparticuz/chromium');
  return puppeteer.launch({
    args:            chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath:  await chromium.executablePath(),
    headless:        chromium.headless,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Générateur principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} data   Objet DATA prêt pour le template (déjà mappé)
 * @returns {Promise<Buffer>}  PDF buffer A3
 */
async function generatePosterFromData(data) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // Injecte window.__POSTER_DATA__ avant </head>
  const injection = `<script>window.__POSTER_DATA__ = ${JSON.stringify(data)};</script>`;
  const html = template.replace('</head>', injection + '\n</head>');

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15_000 });

    // Attente supplémentaire pour le rendu SVG JS
    await page.waitForFunction(() => {
      const svg = document.getElementById('poster');
      return svg && svg.children.length > 5;
    }, { timeout: 10_000 });

    const pdf = await page.pdf({
      width:           '297mm',
      height:          '420mm',
      printBackground: true,
      margin:          { top: 0, bottom: 0, left: 0, right: 0 },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/**
 * Entrée publique : reçoit la réponse brute de l'API astro + métadonnées
 * client, retourne le Buffer PDF.
 */
async function generatePoster(apiResponse, meta) {
  const data = mapApiResponseToData(apiResponse, meta);
  return generatePosterFromData(data);
}

module.exports = { generatePoster, generatePosterFromData, mapApiResponseToData };
