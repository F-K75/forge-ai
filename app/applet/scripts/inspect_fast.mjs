import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

const PAGES = [
  ['/', 'Root / Landing'],
  ['/initiatives', 'Initiatives List'],
  ['/initiatives/init-fintech-ledger', 'Initiatives Overview'],
  ['/initiatives/init-fintech-ledger/board', 'Initiative Board'],
  ['/initiatives/init-fintech-ledger/sprints', 'Initiative Sprints'],
  ['/initiatives/init-fintech-ledger/roadmap', 'Initiative Roadmap'],
  ['/initiatives/init-fintech-ledger/graph', 'Initiative Graph'],
  ['/initiatives/init-fintech-ledger/releases', 'Initiative Releases'],
  ['/initiatives/init-fintech-ledger/activity', 'Initiative Activity'],
  ['/initiatives/init-fintech-ledger/integrations', 'Initiative Integrations'],
  ['/initiatives/init-fintech-ledger/analytics', 'Initiative Analytics'],
  ['/projects', 'Projects'],
  ['/flow', 'Flow'],
  ['/reviews', 'Reviews'],
  ['/settings', 'Settings'],
];

async function inspect() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  for (const [path, name] of PAGES) {
    console.log(`\n--- ${name} (${path}) ---`);
    try {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
      await page.waitForTimeout(600);

      const res = await page.evaluate(() => {
        const text = document.body.innerText;
        const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
        
        // Find visible headings
        const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => `${h.tagName}: ${h.innerText.trim()}`);
        
        // Find suspicious or clutter text
        const clutter = lines.filter(l => 
          l.includes('DEMO') || 
          l.includes('TODO') || 
          l.includes('MOCK') || 
          l.includes('WIP') || 
          l.includes('Placeholder') ||
          l.includes('Coming soon') ||
          l.includes('Lorem') ||
          l.includes('Unimplemented')
        );

        return {
          headings: headings.slice(0, 8),
          firstLines: lines.slice(0, 10),
          clutter: Array.from(new Set(clutter))
        };
      });

      console.log('Headings:', res.headings);
      console.log('Clutter / Mock strings detected:', res.clutter);
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }

  await browser.close();
}

inspect().catch(console.error);
