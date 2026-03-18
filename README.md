# guillaumeastro-site

Site statique deploye sur Vercel avec une fonction serverless pour exposer les produits Notion.

## Developpement local

1. `npm install`
2. Ajouter `.env.local` avec :

```bash
NOTION_TOKEN=your_notion_integration_token
```

3. Lancer `npm run dev`

Note: `vercel dev` peut demander une authentification Vercel locale si la CLI n'est pas deja connectee.

## Vercel

Ajouter la variable d'environnement suivante dans le projet Vercel :

```bash
NOTION_TOKEN=your_notion_integration_token
```
