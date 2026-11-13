// pull Calder's static lines out of the sources she speaks from
import fs from 'node:fs';
const root = '/home/user/fictional-octo-train/';
const files = ['src/game/tutorial/tutorial.ts', 'src/game/handler.ts', 'src/game/debt/voice.ts', 'src/world/anomalies/ledge.ts', 'src/social/dims.ts'];
const out = new Map();
const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\\n$]|\\.)*)`/g;
for (const f of files) {
  const src = fs.readFileSync(root + f, 'utf8');
  for (const line of src.split('\n')) {
    if (/console\.|import |classList|querySelector|style\.|innerHTML|G\.audio|\.flat\(|ui\?\.\(/.test(line) && !/say\(|interject|nags|pick\(\[/.test(line)) continue;
    if (/style: 'bailiff'|bailiff\(|this\.ask\(/.test(line)) continue;
    if (/ledge\.ts|dims\.ts/.test(f) && !/DR\. CALDER/.test(line)) continue;
    let m; re.lastIndex = 0;
    while ((m = re.exec(line))) {
      let s = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"');
      if (s.length < 6 || !/\s/.test(s) || !/[a-z]/.test(s)) continue;
      if (!/[.!?]$/.test(s.trim())) continue;
      if (/[;{}<>=]|px|var\(|\bfunction\b/.test(s.replace(/\{n\}/g, ''))) continue;
      if (s === s.toUpperCase()) continue;
      if (/^[A-Z ]+$/.test(s)) continue;
      out.set(s, f);
    }
  }
}
const list = [...out].map(([text, file]) => ({ text, file }));
fs.writeFileSync(process.argv[2], JSON.stringify(list, null, 1));
console.log(list.length);
