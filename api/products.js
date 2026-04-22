const NOTION_URL =
  'https://api.notion.com/v1/databases/b73a724455c44c13804fddedce8f5e69/query';

const FALLBACK_PRODUCTS = [
  {
    product_name: 'AstroMatch',
    product_slug: 'astromatch',
    product_level: 'standard',
    price: 29,
    billing_type: 'one_time',
    payment_link_url: 'https://buy.stripe.com/14A28sf7WbdBgU46T6bwk08',
    deployment_url: 'https://astromatch.guillaumeastro.com',
    accent_color: '#9b59b6',
    cta_label: 'AstroMatch - 29€',
    themes: ['compatibilite', 'amour', 'relations'],
    upsell_product_slug: 'mission-de-vie',
    is_free: false,
  },
  {
    product_name: 'Transits Personnalises',
    product_slug: 'transits-personnalises',
    product_level: 'micro',
    price: 9,
    billing_type: 'recurring',
    payment_link_url: 'https://buy.stripe.com/eVq28sgc00yX9rC0uIbwk07',
    deployment_url: 'https://transits.guillaumeastro.com',
    accent_color: '#3498db',
    cta_label: 'Transits - 9€/mois',
    themes: ['transits', 'energie'],
    upsell_product_slug: 'astromatch',
    is_free: false,
  },
  {
    product_name: 'Red Flags Astrologiques',
    product_slug: 'red-flags-astrologiques',
    product_level: 'micro',
    price: 12,
    billing_type: 'one_time',
    payment_link_url: 'https://buy.stripe.com/eVqaEY9NCdlJgU4a5ibwk06',
    deployment_url: 'https://astro-red-flags.guillaumeastro.com',
    accent_color: '#e74c3c',
    cta_label: 'Red Flags - 12€',
    themes: ['amour', 'relations', 'psychologie'],
    upsell_product_slug: 'mission-de-vie',
    is_free: false,
  },
  {
    product_name: 'Newsletter Astro - Gratuite',
    product_slug: 'newsletter-gratuite',
    product_level: 'micro',
    price: 0,
    billing_type: 'recurring',
    payment_link_url: null,
    deployment_url: 'https://guillaumeastro.com/newsletter',
    accent_color: '#27ae60',
    cta_label: 'Rejoindre - Gratuit',
    themes: ['transits', 'energie'],
    upsell_product_slug: 'red-flags-astrologiques',
    is_free: true,
  },
  {
    product_name: 'Poster Thème Natal',
    product_slug: 'poster-theme-natal',
    product_level: 'standard',
    price: 45,
    billing_type: 'one_time',
    payment_link_url: 'https://guillaumeastro.com/poster',
    deployment_url: 'https://guillaumeastro.com/poster',
    accent_color: '#c9a84c',
    cta_label: 'Commander — dès 45€',
    themes: ['poster', 'theme natal', 'physique'],
    upsell_product_slug: 'astromatch',
    is_free: false,
  },
  {
    product_name: 'Mission de Vie',
    product_slug: 'mission-de-vie',
    product_level: 'standard',
    price: 27,
    billing_type: 'one_time',
    payment_link_url: 'https://buy.stripe.com/5kQcN69NCbdB7jua5ibwk0n',
    deployment_url: 'https://guillaumeastro.com/mission-de-vie',
    accent_color: '#7c6af7',
    cta_label: 'Mission de Vie - 27€',
    themes: ['mission', 'vocation', 'psychologie'],
    upsell_product_slug: 'astromatch',
    is_free: false,
  },
  {
    product_name: 'Année Astrologique',
    product_slug: 'annee-astrologique',
    product_level: 'premium',
    price: 47,
    billing_type: 'one_time',
    payment_link_url: 'https://guillaumeastro.com/annee-astrologique',
    deployment_url: 'https://guillaumeastro.com/annee-astrologique',
    accent_color: '#f0a030',
    cta_label: 'Année Astro — 47€',
    themes: ['transits', 'previsions', 'theme natal'],
    upsell_product_slug: 'portrait-astral',
    is_free: false,
  },
  {
    product_name: "L'Enfant des Étoiles",
    product_slug: 'bebe-astral',
    product_level: 'premium',
    price: 47,
    billing_type: 'one_time',
    payment_link_url: 'https://guillaumeastro.com/bebe-astral',
    deployment_url: 'https://guillaumeastro.com/bebe-astral',
    accent_color: '#7ec8e3',
    cta_label: "L'Enfant des Étoiles — 47€",
    themes: ['bebe', 'theme natal', 'famille'],
    upsell_product_slug: 'portrait-astral',
    is_free: false,
  },
  {
    product_name: 'Portrait Astral',
    product_slug: 'portrait-astral',
    product_level: 'premium',
    price: 47,
    billing_type: 'one_time',
    payment_link_url: 'https://guillaumeastro.com/portrait-astral',
    deployment_url: 'https://guillaumeastro.com/portrait-astral',
    accent_color: '#c9a84c',
    cta_label: 'Portrait Astral — 47€',
    themes: ['identite', 'psychologie', 'theme natal'],
    upsell_product_slug: 'poster-theme-natal',
    is_free: false,
  },
];

function normalizeKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function getProperty(properties, aliases, expectedTypes) {
  const entries = Object.entries(properties ?? {});
  const aliasSet = new Set(aliases.map(normalizeKey));
  const typeList = Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes];

  for (const [name, property] of entries) {
    if (!aliasSet.has(normalizeKey(name))) {
      continue;
    }
    if (!typeList.length || typeList.includes(property?.type)) {
      return property;
    }
  }

  for (const [, property] of entries) {
    if (!typeList.length || typeList.includes(property?.type)) {
      return property;
    }
  }

  return null;
}

function readPlainText(property) {
  if (!property) {
    return '';
  }

  if (property.type === 'title') {
    return (property.title ?? []).map((item) => item.plain_text).join('').trim();
  }

  if (property.type === 'rich_text') {
    return (property.rich_text ?? [])
      .map((item) => item.plain_text)
      .join('')
      .trim();
  }

  if (property.type === 'select') {
    return property.select?.name ?? '';
  }

  if (property.type === 'status') {
    return property.status?.name ?? '';
  }

  if (property.type === 'url') {
    return property.url ?? '';
  }

  return '';
}

function readNumber(property, fallback) {
  return property?.type === 'number' && typeof property.number === 'number'
    ? property.number
    : fallback;
}

function readUrl(property) {
  return property?.type === 'url' ? property.url ?? null : null;
}

function readMultiSelect(property) {
  return property?.type === 'multi_select'
    ? property.multi_select.map((item) => item.name)
    : [];
}

function mapProduct(page) {
  const properties = page?.properties ?? {};
  const priceProperty = getProperty(properties, ['price', 'prix', 'amount'], 'number');
  const productName =
    readPlainText(getProperty(properties, ['product_name', 'name', 'nom', 'title'], 'title')) ||
    readPlainText(getProperty(properties, ['product_name', 'name', 'nom', 'title'], 'rich_text'));
  const deploymentUrl = readUrl(
    getProperty(
      properties,
      ['deployment_url', 'deployment', 'product_url', 'url', 'landing_page_url'],
      'url'
    )
  );
  const paymentLinkUrl = readUrl(
    getProperty(
      properties,
      ['payment_link_url', 'payment_url', 'checkout_url', 'stripe_url', 'buy_url'],
      'url'
    )
  );
  const product = {
    product_name: productName,
    product_slug: readPlainText(
      getProperty(properties, ['product_slug', 'slug', 'handle'], ['rich_text', 'title'])
    ),
    product_level:
      readPlainText(
        getProperty(properties, ['product_level', 'level', 'tier'], ['select', 'status'])
      ) || 'micro',
    price: readNumber(priceProperty, 0),
    billing_type:
      readPlainText(
        getProperty(properties, ['billing_type', 'billing', 'pricing_type'], ['select', 'status'])
      ) || 'one_time',
    payment_link_url: paymentLinkUrl,
    deployment_url: deploymentUrl,
    accent_color:
      readPlainText(
        getProperty(properties, ['accent_color', 'color', 'couleur'], ['rich_text', 'title'])
      ) || '#7c6af7',
    cta_label: readPlainText(
      getProperty(properties, ['cta_label', 'cta', 'button_label'], ['rich_text', 'title'])
    ),
    themes: readMultiSelect(getProperty(properties, ['themes', 'tags', 'angles'], 'multi_select')),
    upsell_product_slug: readPlainText(
      getProperty(
        properties,
        ['upsell_product_slug', 'upsell_slug', 'upsell'],
        ['rich_text', 'title']
      )
    ) || null,
  };

  product.is_free = product.price === 0;
  return product;
}

function isLiveProduct(page) {
  const properties = page?.properties ?? {};
  const statusValue = readPlainText(
    getProperty(properties, ['status', 'statut', 'state'], ['status', 'select'])
  );

  return !statusValue || ['live', 'published', 'active', 'en ligne'].includes(normalizeKey(statusValue));
}

function isRenderableProduct(product) {
  return Boolean(product.product_name) && Boolean(product.deployment_url || product.payment_link_url);
}

function normalizeProduct(product) {
  const slug = normalizeKey(product?.product_slug);
  const normalized = { ...product };

  if (slug === 'newslettergratuite') {
    normalized.deployment_url = 'https://guillaumeastro.com/newsletter';
    normalized.payment_link_url = null;
  }

  return normalized;
}

function shouldPublishProduct(_product) {
  return true;
}

async function queryNotion(body) {
  const response = await fetch(NOTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Notion request failed with status ${response.status}: ${details}`);
  }

  return response.json();
}

module.exports = async function handler(_req, res) {
  try {
    if (!process.env.NOTION_TOKEN) {
      console.warn('Missing NOTION_TOKEN, serving fallback products');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
      res.setHeader('X-Products-Source', 'fallback');
      return res.status(200).json(FALLBACK_PRODUCTS);
    }

    let data;
    try {
      data = await queryNotion({
        filter: {
          property: 'status',
          select: { equals: 'live' },
        },
        sorts: [
          {
            property: 'created_at',
            direction: 'ascending',
          },
        ],
      });
    } catch (error) {
      console.warn('Primary Notion query failed, retrying without schema-dependent filters', error);
      data = await queryNotion({});
    }

    const products = Array.isArray(data?.results)
      ? data.results
          .filter(isLiveProduct)
          .map(mapProduct)
          .map(normalizeProduct)
          .filter(isRenderableProduct)
          .filter(shouldPublishProduct)
      : [];

    if (!products.length) {
      console.warn('No renderable products returned by Notion, serving fallback products');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
      res.setHeader('X-Products-Source', 'fallback');
      return res.status(200).json(FALLBACK_PRODUCTS);
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.setHeader('X-Products-Source', 'notion');
    return res.status(200).json(products);
  } catch (error) {
    console.error('Failed to fetch products', error);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.setHeader('X-Products-Source', 'fallback');
    return res.status(200).json(FALLBACK_PRODUCTS);
  }
};
