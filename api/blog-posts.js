const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(process.cwd(), 'blog');
const SITE_ORIGIN = 'https://guillaumeastro.com';

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMatch(content, pattern) {
  const match = content.match(pattern);
  return match ? match[1].trim() : '';
}

function slugToLabel(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slugifyCategory(label) {
  return decodeHtml(label)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseFrenchMonthYear(value) {
  const normalized = decodeHtml(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const match = normalized.match(/^(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})$/);
  if (!match) {
    return '';
  }

  const months = {
    janvier: '01',
    fevrier: '02',
    mars: '03',
    avril: '04',
    mai: '05',
    juin: '06',
    juillet: '07',
    aout: '08',
    septembre: '09',
    octobre: '10',
    novembre: '11',
    decembre: '12',
  };

  return `${match[2]}-${months[match[1]]}-01T00:00:00.000Z`;
}

function parseJsonLdDate(content) {
  const scriptMatch = content.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    return '';
  }

  try {
    const parsed = JSON.parse(scriptMatch[1]);
    return parsed.datePublished || '';
  } catch (error) {
    return '';
  }
}

function parseMeta(content, name, attrName) {
  const attr = attrName || 'name';
  const pattern = new RegExp(
    `<meta[^>]+${attr}=["']${escapeRegExp(name)}["'][^>]+content=(["'])([\\s\\S]*?)\\1`,
    'i'
  );
  const match = content.match(pattern);
  return match ? match[2].trim() : '';
}

function parseArticle(fileName) {
  const filePath = path.join(BLOG_DIR, fileName);
  const stats = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  const canonical = getMatch(content, /<link rel="canonical" href="([^"]+)"/i);
  const title = getMatch(content, /<meta property="og:title" content="([^"]+)"/i) ||
    getMatch(content, /<title>(.*?)\s+—\s+Guillaume Astro<\/title>/i);
  const description = parseMeta(content, 'og:description', 'property') ||
    parseMeta(content, 'description') ||
    '';
  const breadcrumb = stripTags(getMatch(content, /<div class="breadcrumb">([\s\S]*?)<\/div>/i));
  const breadcrumbCategory = breadcrumb.includes('›')
    ? breadcrumb.split('›').pop().trim()
    : '';
  const tagText = stripTags(getMatch(content, /<span class="art-tag">([\s\S]*?)<\/span>/i));
  const categories = (tagText || breadcrumbCategory)
    .split('·')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!categories.length && breadcrumbCategory) {
    categories.push(breadcrumbCategory);
  }

  const artMetaBlock = getMatch(content, /<div class="art-meta">([\s\S]*?)<\/div>/i);
  const metaSpans = [...artMetaBlock.matchAll(/<span>([\s\S]*?)<\/span>/gi)].map((span) => stripTags(span[1]));
  const displayDate = metaSpans[1] || '';
  const readingTime = metaSpans[2] || '';
  const publishedAt = parseJsonLdDate(content) || parseFrenchMonthYear(displayDate) || stats.mtime.toISOString();
  const slug = canonical.replace(`${SITE_ORIGIN}/blog/`, '') || fileName.replace(/\.html$/i, '');

  return {
    slug,
    title: stripTags(title) || slugToLabel(slug),
    description: stripTags(description),
    url: canonical || `${SITE_ORIGIN}/blog/${slug}`,
    path: `/blog/${fileName}`,
    fileName,
    dateLabel: displayDate || new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(publishedAt)),
    publishedAt,
    readingTime,
    categories,
    primaryCategory: categories[0] || 'Articles',
    categorySlugs: categories.map(slugifyCategory).filter(Boolean),
  };
}

function scanSubdir(subdir) {
  const dir = path.join(BLOG_DIR, subdir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.html') && file !== 'index.html')
    .map((file) => `${subdir}/${file}`);
}

module.exports = (req, res) => {
  try {
    const rootFiles = fs.readdirSync(BLOG_DIR)
      .filter((file) => file.endsWith('.html'))
      .filter((file) => file !== 'index.html' && file !== '_template.html');

    const files = [...rootFiles, ...scanSubdir('opinion')];

    const posts = files
      .map(parseArticle)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : null;
    const payload = limit ? posts.slice(0, limit) : posts;

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.status(200).json({
      posts: payload,
      total: posts.length,
      categories: [...new Set(posts.flatMap((post) => post.categories))],
    });
  } catch (error) {
    console.error('Failed to load blog posts', error);
    res.status(500).json({ error: 'Failed to load blog posts' });
  }
};
