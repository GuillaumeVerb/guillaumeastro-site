/**
 * scripts/test-poster.js
 *
 * Test local du générateur de poster.
 * Lance : npm run generate-poster
 * Produit : poster-test.pdf dans la racine du projet.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// Données de test (exemple de réponse /api/basic/natal-chart)
const MOCK_API_RESPONSE = {
  ascendant: 220.5,
  mc:        130.2,
  planets: [
    { name:'Sun',     longitude: 55.3,  house:10, retrograde:false },
    { name:'Moon',    longitude:118.7,  house:12, retrograde:false },
    { name:'Mercury', longitude: 48.2,  house: 9, retrograde:true  },
    { name:'Venus',   longitude: 30.1,  house: 9, retrograde:false },
    { name:'Mars',    longitude:162.4,  house: 2, retrograde:false },
    { name:'Jupiter', longitude:298.7,  house: 7, retrograde:false },
    { name:'Saturn',  longitude:295.3,  house: 7, retrograde:true  },
    { name:'Uranus',  longitude:288.1,  house: 6, retrograde:false },
    { name:'Neptune', longitude:283.7,  house: 6, retrograde:true  },
    { name:'Pluto',   longitude:222.4,  house: 5, retrograde:false },
  ],
  houses: [220.5,248.2,276.8,310.2,342.1,14.5,40.5,68.2,96.8,130.2,162.1,194.5],
  aspects: [
    { planet1:'Sun',  planet2:'Mercury', type:'conjunction', orb:7.1 },
    { planet1:'Sun',  planet2:'Mars',    type:'trine',       orb:3.1 },
    { planet1:'Moon', planet2:'Jupiter', type:'opposition',  orb:4.5 },
    { planet1:'Venus',planet2:'Uranus',  type:'square',      orb:2.1 },
    { planet1:'Mercury',planet2:'Jupiter',type:'sextile',    orb:5.5 },
  ],
};

const META = {
  name:       'Marie Dupont',
  birthDate:  '15 mai 1992',
  birthTime:  '14h30',
  birthPlace: 'Paris, France',
};

async function main() {
  console.log('Génération du poster test…');
  const { generatePoster } = require('../poster/generate');
  const pdf = await generatePoster(MOCK_API_RESPONSE, META);
  const outPath = path.join(__dirname, '..', 'poster-test.pdf');
  fs.writeFileSync(outPath, pdf);
  console.log(`PDF généré : ${outPath} (${(pdf.length / 1024).toFixed(0)} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
