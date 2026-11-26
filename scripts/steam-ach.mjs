// steam/achievements.csv from src/platform/achievementDefs.ts (the one list the game and Steamworks share).
//   node scripts/steam-ach.mjs
// Columns follow the Steamworks achievement page: API name, display name, description, hidden (0/1).
// Each achievement also needs a 64x64 achieved icon and an unachieved (greyed) icon, uploaded in Steamworks.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = readFileSync(join(root, 'src/platform/achievementDefs.ts'), 'utf8');
const list = [];
const re = /\{\s*api:\s*'([A-Z0-9_]+)',\s*name:\s*'((?:[^'\\]|\\.)*)',\s*desc:\s*'((?:[^'\\]|\\.)*)'(?:,\s*hidden:\s*(true|false))?\s*\}/g;
for (let m; (m = re.exec(src));) list.push({ api: m[1], name: m[2].replace(/\\'/g, "'"), desc: m[3].replace(/\\'/g, "'"), hidden: m[4] === 'true' });
if (list.length < 20) throw new Error(`only ${list.length} achievements parsed`);
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const rows = ['api_name,display_name,description,hidden,icon,icon_gray', ...list.map((a) => [a.api, q(a.name), q(a.desc), a.hidden ? 1 : 0, `${a.api.toLowerCase()}.jpg`, `${a.api.toLowerCase()}_gray.jpg`].join(','))];
mkdirSync(join(root, 'steam'), { recursive: true });
writeFileSync(join(root, 'steam/achievements.csv'), rows.join('\n') + '\n');
console.log(`steam/achievements.csv: ${list.length} achievements`);
