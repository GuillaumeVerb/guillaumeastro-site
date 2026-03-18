const NOTION_URL =
  'https://api.notion.com/v1/databases/b73a724455c44c13804fddedce8f5e69/query';

function mapProduct(page) {
  const properties = page?.properties ?? {};

  return {
    product_name: properties.product_name?.title?.[0]?.plain_text ?? '',
    product_slug: properties.product_slug?.rich_text?.[0]?.plain_text ?? '',
    product_level: properties.product_level?.select?.name ?? 'micro',
    price: properties.price?.number ?? 0,
    billing_type: properties.billing_type?.select?.name ?? 'one_time',
    payment_link_url: properties.payment_link_url?.url ?? null,
    deployment_url: properties.deployment_url?.url ?? null,
    accent_color:
      properties.accent_color?.rich_text?.[0]?.plain_text ?? '#7c6af7',
    cta_label: properties.cta_label?.rich_text?.[0]?.plain_text ?? '',
    themes: properties.themes?.multi_select?.map((theme) => theme.name) ?? [],
    upsell_product_slug:
      properties.upsell_product_slug?.rich_text?.[0]?.plain_text ?? null,
    is_free: (properties.price?.number ?? 1) === 0,
  };
}

module.exports = async function handler(_req, res) {
  try {
    const response = await fetch(NOTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
      }),
    });

    if (!response.ok) {
      throw new Error(`Notion request failed with status ${response.status}`);
    }

    const data = await response.json();
    const products = Array.isArray(data?.results)
      ? data.results.map(mapProduct)
      : [];

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(products);
  } catch (error) {
    console.error('Failed to fetch products', error);
    return res.status(500).json({ error: 'Failed to fetch products' });
  }
};
