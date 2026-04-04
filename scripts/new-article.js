#!/usr/bin/env node
/**
 * Générateur d'article — Guillaume Astro
 * Usage : node scripts/new-article.js
 *
 * Crée le fichier HTML depuis le template et ajoute l'URL au sitemap.
 */

const fs   = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT     = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'blog/_template.html');
const SITEMAP  = path.join(ROOT, 'sitemap.xml');
const BLOG_DIR = path.join(ROOT, 'blog');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isoNow() {
  return new Date().toISOString().split('T')[0];
}

function frDate(isoDate) {
  const months = ['janvier','février','mars','avril','mai','juin',
                  'juillet','août','septembre','octobre','novembre','décembre'];
  const [y, m] = isoDate.split('-');
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function addToSitemap(slug, subpath) {
  const url = subpath
    ? `https://guillaumeastro.com/${subpath}/${slug}`
    : `https://guillaumeastro.com/blog/${slug}`;

  const sitemap = fs.readFileSync(SITEMAP, 'utf8');
  if (sitemap.includes(url)) {
    console.log(`  ↳ Déjà dans le sitemap : ${url}`);
    return;
  }

  const entry = `
  <url>
    <loc>${url}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;

  // Insère avant </urlset>
  const updated = sitemap.replace('</urlset>', entry + '\n</urlset>');
  fs.writeFileSync(SITEMAP, updated, 'utf8');
  console.log(`  ↳ Ajouté au sitemap : ${url}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n✦ Générateur d\'article — Guillaume Astro\n');

  const title       = await ask(rl, 'Titre de l\'article (texte brut) : ');
  const slugDefault = toSlug(title);
  const slugInput   = await ask(rl, `Slug URL [${slugDefault}] : `);
  const slug        = slugInput.trim() || slugDefault;

  const description = await ask(rl, 'Meta description (150 chars max) : ');
  const keywords    = await ask(rl, 'Mots-clés (séparés par virgules) : ');
  const category    = await ask(rl, 'Catégorie (ex: Amour & relations) : ');
  const subcategory = await ask(rl, 'Sous-catégorie (ex: Planètes) : ');
  const readTime    = await ask(rl, 'Temps de lecture en minutes (ex: 8) : ');
  const dateInput   = await ask(rl, `Date de publication ISO [${isoNow()}] : `);
  const date        = dateInput.trim() || isoNow();

  console.log('\nCTA dans la nav et inline :');
  const ctaUrl   = await ask(rl, 'URL du produit CTA : ');
  const ctaLabel = await ask(rl, 'Label du bouton nav CTA (ex: Mission de Vie — 27€) : ');

  rl.close();

  // ── Génération du fichier ──────────────────────────────────────────────────

  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const titleHtml = title.replace(/:/g, ':<em>').replace(/,/, '</em>,'); // heuristique simple

  const replacements = {
    '{{ARTICLE_SLUG}}':             slug,
    '{{ARTICLE_TITLE}}':            title,
    '{{ARTICLE_TITLE_HTML}}':       title,
    '{{ARTICLE_META_DESCRIPTION}}': description,
    '{{ARTICLE_KEYWORDS}}':         keywords,
    '{{ARTICLE_CATEGORY}}':         category,
    '{{ARTICLE_SUBCATEGORY}}':      subcategory,
    '{{ARTICLE_DATE_ISO}}':         date,
    '{{ARTICLE_DATE_FR}}':          frDate(date),
    '{{ARTICLE_READ_TIME}}':        readTime,
    '{{ARTICLE_BODY_HTML}}':        '<!-- CONTENU ARTICLE ICI -->',
    '{{ARTICLE_BODY_HTML_END}}':    '<!-- SUITE CONTENU ICI -->',
    '{{CTA_PRODUCT_URL}}':          ctaUrl,
    '{{CTA_PRODUCT_LABEL}}':        ctaLabel,
    '{{CTA_INLINE_TITLE}}':         '<!-- TITRE CTA INLINE -->',
    '{{CTA_INLINE_TEXT}}':          '<!-- TEXTE CTA INLINE -->',
    '{{CTA_INLINE_BTN}}':           '<!-- BOUTON CTA -->',
    '{{RELATED_ARTICLES_HTML}}':    '<!-- ARTICLES LIÉS -->',
  };

  let html = template;
  for (const [key, val] of Object.entries(replacements)) {
    html = html.replaceAll(key, val);
  }

  const outPath = path.join(BLOG_DIR, `${slug}.html`);

  if (fs.existsSync(outPath)) {
    console.error(`\n⚠️  Le fichier existe déjà : blog/${slug}.html`);
    console.error('   Renomme le slug ou supprime le fichier existant.');
    process.exit(1);
  }

  fs.writeFileSync(outPath, html, 'utf8');

  // ── Sitemap ────────────────────────────────────────────────────────────────

  addToSitemap(slug, 'blog');

  // ── Résumé ────────────────────────────────────────────────────────────────

  console.log(`
✓ Fichier créé : blog/${slug}.html
✓ Sitemap mis à jour

Prochaines étapes :
  1. Ouvre blog/${slug}.html dans ton éditeur
  2. Remplace les blocs <!-- CONTENU --> par le vrai contenu
  3. Ajoute un bloc FAQPage JSON-LD si l'article a des questions récurrentes
  4. Lance : git add blog/${slug}.html sitemap.xml && git commit -m "Add article: ${title}"
`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
