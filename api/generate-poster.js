/**
 * api/generate-poster.js
 *
 * Webhook Stripe → génère le PDF du poster natal → commande d'impression
 * (Printful) → email de confirmation (Resend).
 *
 * Stripe envoie checkout.session.completed avec en metadata :
 *   name, birthDate, birthTime, birthPlace, email
 *
 * Variables d'environnement requises :
 *   STRIPE_SECRET_KEY         — clé secrète Stripe
 *   STRIPE_WEBHOOK_SECRET     — secret du webhook (whsec_...)
 *   NATAL_CHART_API_URL       — base URL Railway (ex: https://web-production-37fb.up.railway.app)
 *   NATAL_CHART_API_KEY       — Bearer token Railway (si nécessaire)
 *   PRINTFUL_API_KEY          — clé API Printful
 *   RESEND_API_KEY            — clé API Resend
 *   RESEND_FROM               — ex: "Guillaume Astro <contact@guillaumeastro.com>"
 *   VERCEL_BLOB_READ_WRITE_TOKEN — pour stocker le PDF (Vercel Blob)
 *   SITE_URL                  — https://guillaumeastro.com
 */

'use strict';

const Stripe = require('stripe');
const { generatePoster } = require('../poster/generate');

// Vercel : augmenter le timeout max (nécessite Vercel Pro pour >60s)
module.exports.config = {
  api:    { bodyParser: false },
  maxDuration: 300,
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilitaires
// ─────────────────────────────────────────────────────────────────────────────

/** Lit le body brut (nécessaire pour la validation Stripe). */
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Géocode une ville en lat/lng via Nominatim (gratuit, sans clé API). */
async function geocode(placeName) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=1`;
  const res  = await fetch(url, { headers: { 'User-Agent': 'guillaumeastro-poster/1.0' } });
  const json = await res.json();
  if (!json.length) throw new Error(`Lieu introuvable : "${placeName}"`);
  return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
}

/** Appelle POST /api/basic/natal-chart sur Railway. */
async function fetchNatalChart({ name, birthDate, birthTime, lat, lng }) {
  const baseUrl = process.env.NATAL_CHART_API_URL || 'https://web-production-37fb.up.railway.app';
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.NATAL_CHART_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.NATAL_CHART_API_KEY}`;
  }

  const res = await fetch(`${baseUrl}/api/basic/natal-chart`, {
    method:  'POST',
    headers,
    body: JSON.stringify({
      name,
      birth_date: birthDate, // ex: "1992-05-15"
      birth_time: birthTime, // ex: "14:30"
      latitude:   lat,
      longitude:  lng,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API astro ${res.status}: ${txt}`);
  }
  return res.json();
}

/** Upload le PDF dans Vercel Blob et retourne l'URL publique. */
async function uploadPdf(pdfBuffer, filename) {
  const { put } = require('@vercel/blob');
  const blob = await put(`posters/${filename}`, pdfBuffer, {
    access:      'public',
    contentType: 'application/pdf',
  });
  return blob.url;
}

// Printful variant IDs (Enhanced Matte Paper, A2, produit 268 / 304)
const PRINTFUL_VARIANTS = {
  poster:        19516, // A2 42×59.4 cm sans cadre
  poster_framed: 19643, // A2 42×59.4 cm cadre noir
};

/** Crée une commande d'impression sur Printful. */
async function createPrintfulOrder({ pdfUrl, recipientName, recipientEmail, address1, address2, city, zip, country, sessionId, withFrame }) {
  const variantId = withFrame ? PRINTFUL_VARIANTS.poster_framed : PRINTFUL_VARIANTS.poster;

  const body = {
    recipient: {
      name:         recipientName,
      email:        recipientEmail,
      address1,
      address2:     address2 || undefined,
      city,
      zip,
      country_code: country || 'FR',
    },
    items: [
      {
        variant_id: variantId,
        quantity:   1,
        files: [
          {
            type: 'default',
            url:  pdfUrl,
          },
        ],
      },
    ],
    retail_costs: { shipping: '0.00' },
    // confirm: true  // décommente pour confirmer/payer directement
  };

  const res = await fetch('https://api.printful.com/orders', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${process.env.PRINTFUL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Printful ${res.status}: ${txt}`);
  }
  return res.json();
}

/** Envoie un email de confirmation via Resend. */
async function sendConfirmationEmail({ email, name, sessionId }) {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    process.env.RESEND_FROM || 'Guillaume Astro <contact@guillaumeastro.com>',
      to:      [email],
      subject: `Ton poster thème natal est en cours d'impression ✨`,
      html: `
        <p>Bonjour ${name},</p>
        <p>Ton <strong>Poster Thème Natal</strong> a bien été reçu et est en cours de préparation pour l'impression.</p>
        <p>Tu recevras un autre email avec le suivi de ta commande dès qu'il sera expédié.</p>
        <p>Merci pour ta confiance,<br>Guillaume</p>
        <hr>
        <p style="font-size:12px;color:#888;">Référence commande : ${sessionId}</p>
      `,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('Resend error:', txt);
    // On ne throw pas — l'email est non-critique
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Validation de la signature Stripe ──────────────────────────────────
  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET manquantes');
    return res.status(500).end();
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature invalide:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // On répond 200 immédiatement pour éviter le timeout Stripe (5s)
  res.status(200).json({ received: true });

  // ── 2. Traitement asynchrone ───────────────────────────────────────────────
  if (event.type !== 'checkout.session.completed') return;

  const session  = event.data.object;
  const meta     = session.metadata || {};
  const { name, birthDate, birthDateISO, birthTime, birthTimeISO, birthPlace, email, withFrame,
          shippingName, address1, address2, city, zip, country } = meta;
  const isFramed = withFrame === '1';

  if (!name || !birthDate || !birthTime || !birthPlace) {
    console.error('Metadata incomplète dans la session Stripe', meta);
    return;
  }

  const sessionId = session.id;

  try {
    console.log(`[poster] Démarrage génération pour ${name} (${sessionId})`);

    // 3. Géocodage
    const { lat, lng } = await geocode(birthPlace);
    console.log(`[poster] Géocodage "${birthPlace}" → lat=${lat} lng=${lng}`);

    // 4. API thème natal (utilise les formats ISO pour l'API)
    const apiResponse = await fetchNatalChart({
      name,
      birthDate: birthDateISO || birthDate,
      birthTime: birthTimeISO || birthTime,
      lat,
      lng,
    });
    console.log(`[poster] API natal chart OK`);

    // 5. Génération PDF
    const pdfBuffer = await generatePoster(apiResponse, { name, birthDate, birthTime, birthPlace });
    console.log(`[poster] PDF généré (${pdfBuffer.length} bytes)`);

    // 6. Upload PDF
    const safeFilename = `${sessionId}-${Date.now()}.pdf`;
    const pdfUrl       = await uploadPdf(pdfBuffer, safeFilename);
    console.log(`[poster] PDF uploadé → ${pdfUrl}`);

    // 7. Commande Printful
    const printfulOrder = await createPrintfulOrder({
      pdfUrl,
      recipientName:  shippingName || name,
      recipientEmail: email,
      address1,
      address2,
      city,
      zip,
      country:        country || 'FR',
      sessionId,
      withFrame:      isFramed,
    });
    console.log(`[poster] Commande Printful créée : ${printfulOrder?.result?.id}`);

    // 8. Email de confirmation
    await sendConfirmationEmail({ email, name, sessionId });
    console.log(`[poster] Email envoyé à ${email}`);

  } catch (err) {
    console.error(`[poster] Erreur pipeline (session ${sessionId}):`, err);
    // TODO: alerter via Slack/email interne + mettre en file d'attente pour retry
  }
};
