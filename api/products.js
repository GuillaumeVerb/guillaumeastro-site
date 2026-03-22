const NOTION_URL =
  'https://api.notion.com/v1/databases/b73a724455c44c13804fddedce8f5e69/query';

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
      throw new Error('Missing NOTION_TOKEN');
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
      ? data.results.filter(isLiveProduct).map(mapProduct).filter(isRenderableProduct)
      : [];

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(products);
  } catch (error) {
    console.error('Failed to fetch products', error);
    return res.status(500).json({ error: 'Failed to fetch products' });
  }
};
