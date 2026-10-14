// Launch handoff: the title screen writes a launch config to sessionStorage
// and reloads; on boot the config is consumed and the right session starts
// (new world, loaded save, co-op host or co-op client).
import { startSession } from './session';
import { readSave } from './save';
import { Net } from '../net/net';
import { Appearance, randomAppearance } from '../entities/humanRig';

interface Char { name: string; app: Appearance; occupation: string; traits: string[] }
export type LaunchConfig =
  | ({ mode: 'new'; sandbox: Record<string, number>; seed: number; directives: boolean } & Char)
  | { mode: 'load'; id: string }
  | ({ mode: 'host'; server: string; roomName: string; public: boolean; pass: string; saveId?: string; sandbox: Record<string, number>; seed: number; directives: boolean } & Char)
  | ({ mode: 'join'; server: string; room: string; pass: string } & Char);

const KEY = 'noclip.launch';
export function setLaunch(cfg: LaunchConfig) {
  try { sessionStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
  location.reload();
}
export function takeLaunch(): LaunchConfig | null {
  try {
    const s = sessionStorage.getItem(KEY);
    if (!s) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(s);
  } catch { return null; }
}

function bootText(html: string, back = false) {
  const b = document.getElementById('boot');
  if (!b) return;
  b.classList.remove('gone');
  b.innerHTML = `<div class="boot-msg">${html}${back ? '<br><button class="k-end-btn" style="opacity:1;animation:none;margin-top:18px" onclick="location.reload()">Back to the title</button>' : ''}</div>`;
}

export async function launch(cfg: LaunchConfig) {
  try {
    switch (cfg.mode) {
      case 'new':
        startSession({ mode: 'solo', name: cfg.name, app: cfg.app, occupation: cfg.occupation, traits: cfg.traits, seed: cfg.seed, sandbox: cfg.sandbox, directives: cfg.directives });
        break;
      case 'load': {
        bootText('READING TAPE…');
        const s = await readSave(cfg.id);
        if (!s) { bootText('That save could not be read.', true); return; }
        startSession({ mode: 'solo', name: s.player.name, save: s, directives: s.missions?.enabled ?? true });
        break;
      }
      case 'host': {
        bootText('OPENING A ROOM…');
        const net = await Net.host(cfg.server, cfg.roomName || cfg.name, { public: cfg.public, pass: cfg.pass });
        const s = cfg.saveId ? await readSave(cfg.saveId) : null;
        if (s) startSession({ mode: 'host', name: s.player.name, save: s, net, directives: s.missions?.enabled ?? true });
        else startSession({ mode: 'host', net, name: cfg.name, app: cfg.app, occupation: cfg.occupation, traits: cfg.traits, seed: cfg.seed, sandbox: cfg.sandbox, directives: cfg.directives });
        setTimeout(() => (window as any).__game?.ui?.toast?.('ROOM ' + net.room, 'friends join with this code · Esc → Co-op for details', 8), 1500);
        break;
      }
      case 'join': {
        bootText(`NOCLIPPING INTO ROOM ${cfg.room.toUpperCase()}…`);
        const hello = { name: cfg.name, app: cfg.app ?? randomAppearance(Math.random), occupation: cfg.occupation, traits: cfg.traits };
        const { net, welcome } = await Net.join(cfg.server, cfg.room, hello, cfg.pass);
        startSession({ mode: 'client', net, welcome, name: cfg.name, app: hello.app, occupation: cfg.occupation, traits: cfg.traits, directives: welcome.missions?.enabled ?? true });
        break;
      }
    }
  } catch (e: any) {
    console.error(e);
    bootText(`SIGNAL LOST<br><span style="font-size:18px;color:#a89a72">${String(e?.message || e).replace(/</g, '&lt;')}</span>`, true);
  }
}
