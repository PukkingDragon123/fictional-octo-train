// The credits roll and the legal notes (the title's About, and CREDITS.md / docs/EULA.md / docs/PRIVACY.md
// in the repository). Everything third-party in the game is listed here with its licence.
import { AUDIO_CREDITS } from '../../audio/credits';
import { h, esc } from './common';

export const PROP_CREDITS = ['Steel Frame Shelves 02', 'Chemistry Set', 'Vintage Microscope', 'Bunsen Burner', 'Metal Stools', 'Tool Cart', 'Industrial Storage Cart', 'Hand Truck',
  'Barrel 03', 'Small LPG Tank', 'and the rest of the lab props'];
export const FONT_CREDITS: [string, string, string][] = [
  ['Alagard', 'Hewett Tsoi', 'free font licence'],
  ['Alfa Slab One', 'JM Solé', 'SIL OFL 1.1'], ['Big Shoulders Stencil', 'Patric King (XO Type)', 'SIL OFL 1.1'], ['Caveat', 'Impallari Type', 'SIL OFL 1.1'],
  ['Courier Prime', 'Alan Dague-Greene', 'SIL OFL 1.1'], ['EB Garamond', 'Georg Duffner, Octavio Pardo', 'SIL OFL 1.1'], ['Handjet', 'Rosetta Type', 'SIL OFL 1.1'],
  ['IBM Plex Mono', 'IBM', 'SIL OFL 1.1'], ['Micro 5', 'The Soft Type Project Authors', 'SIL OFL 1.1'], ['Nixie One', 'Jovanny Lemonad', 'SIL OFL 1.1'], ['Oswald', 'The Oswald Project Authors', 'SIL OFL 1.1'],
  ['Share Tech Mono', 'Carrois Apostrophe', 'SIL OFL 1.1'], ['Silkscreen', 'Jason Kottke', 'SIL OFL 1.1'], ['Special Elite', 'Astigmatic', 'Apache 2.0'], ['Tiny5', 'Gissio', 'SIL OFL 1.1'],
  ['VT323', 'Peter Hull', 'SIL OFL 1.1'], ['Workbench', 'Jens Kutilek', 'SIL OFL 1.1'],
];
export const LIB_CREDITS: [string, string][] = [
  ['three.js', 'MIT'], ['Vite', 'MIT'], ['TypeScript', 'Apache 2.0'], ['ws', 'MIT'], ['Electron', 'MIT'], ['Chromium', 'BSD and others'], ['steamworks.js', 'MIT'], ['Steamworks SDK', 'Valve redistributable'],
  ['Kokoro-82M (Dr. Calder\'s voice, "af_heart")', 'Apache 2.0'],
];

/** the About page: what this is, who made what, the licences, and the short legal notes */
export function creditsPanel(): HTMLElement {
  const box = h('div', 'tt3-about cr');
  box.append(h('p', '', 'A survival sandbox. You are an operator at the Meridian Institute of Liminality. In the chair beside the link rig sits a unit: a debtor whose body you take over, with a shock, and walk through a wall that turns to liquid, into rooms that never end. Dr. Iris Calder talks you through the job.'));
  box.append(h('p', 'ct-dim', 'All names, places, inhabitants and story are original. Inspired by systemic survival games, the 2019 "noclip" creepypasta, liminal-space photography and VHS-era found footage.'));
  const sec = (t: string) => box.append(h('div', 't-ctl-h', esc(t)));
  sec('SOUND · CC0 1.0');
  const authors = [...new Set(AUDIO_CREDITS.map((a) => a.author.replace(/@.*/, '')))].sort((a, b) => a.localeCompare(b));
  box.append(h('p', '', `Every sound effect, ambience and music track is a recording from OpenGameArt.org, dedicated to the public domain (CC0). With thanks to ${authors.map(esc).join(', ')}.`));
  sec('VOICE');
  box.append(h('p', '', 'Dr. Iris Calder\'s lines are synthesised speech (Kokoro-82M text-to-speech, Apache 2.0).'));
  sec('3D PROPS · CC0 1.0');
  box.append(h('p', '', `Lab props from Poly Haven (polyhaven.com): ${PROP_CREDITS.map(esc).join(', ')}. Every other model, texture and inhabitant is built in code.`));
  sec('TYPE');
  for (const [n, by, lic] of FONT_CREDITS) box.append(h('div', 't-ctl', `<kbd>${esc(n)}</kbd><span>${esc(by)} · ${esc(lic)}</span>`));
  sec('SOFTWARE');
  for (const [n, lic] of LIB_CREDITS) box.append(h('div', 't-ctl', `<kbd>${esc(n)}</kbd><span>${esc(lic)}</span>`));
  sec('PRIVACY');
  box.append(h('p', '', 'Limbo Phobia collects no data. There are no accounts, analytics, ads or telemetry. Saves, settings and the error log stay on this computer (and in Steam Cloud, if you use it). Co-op connects only to a relay address you type in.'));
  sec('LICENCE');
  box.append(h('p', 'ct-dim', 'Licensed, not sold, for personal play. Do not resell or redistribute the game. Provided as is, without warranty. Full text: EULA.txt beside the game.'));
  return box;
}
