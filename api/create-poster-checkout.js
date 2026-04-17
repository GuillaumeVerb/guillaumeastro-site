/**
 * api/create-poster-checkout.js
 *
 * POST /api/create-poster-checkout
 * Body: { name, birthDate, birthDateISO, birthTime, birthTimeISO, birthPlace, email, withFrame }
 * Response: { url } → redirige vers Stripe Checkout
 */

'use strict';

const Stripe = require('stripe');

const PRODUCTS = {
  poster: {
    label:       'Poster Thème Natal A2 — sans cadre',
    description: 'Impression matte A2 (42×59,4 cm)',
    price:       4500, // centimes
  },
  poster_framed: {
    label:       'Poster Thème Natal A2 — cadre noir',
    description: 'Impression matte A2 (42×59,4 cm) + cadre aluminium noir',
    price:       6500,
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, birthDate, birthDateISO, birthTime, birthTimeISO, birthPlace, email, withFrame } = req.body || {};

  const missing = ['name', 'birthDate', 'birthTime', 'birthPlace', 'email'].filter(
    k => !req.body?.[k]?.trim()
  );
  if (missing.length) {
    return res.status(400).json({ error: `Champs manquants : ${missing.join(', ')}` });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY non configurée' });
  }

  const productKey = withFrame ? 'poster_framed' : 'poster';
  const product    = PRODUCTS[productKey];
  const stripe     = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode:                 'payment',
      payment_method_types: ['card'],
      customer_email:       email,
      line_items: [
        {
          price_data: {
            currency:     'eur',
            unit_amount:  product.price,
            product_data: {
              name:        `${product.label} – Guillaume Astro`,
              description: `${product.description} · Personnalisé pour ${name}`,
              images:      ['https://guillaumeastro.com/assets/poster-preview.jpg'],
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        name,
        birthDate,
        birthDateISO: birthDateISO || birthDate,
        birthTime,
        birthTimeISO: birthTimeISO || birthTime,
        birthPlace,
        email,
        withFrame: withFrame ? '1' : '0',
      },
      success_url: `${process.env.SITE_URL || 'https://guillaumeastro.com'}/poster/merci?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.SITE_URL  || 'https://guillaumeastro.com'}/poster`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout creation failed', err);
    return res.status(500).json({ error: err.message });
  }
};
