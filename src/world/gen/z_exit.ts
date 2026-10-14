// Exit — almost nothing. A soft white floor that fades into white, one
// doorway full of light and a note taped to its frame. The player arrives far
// from it, with a door behind them that no longer goes anywhere.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, valueNoise2 } from '../../core/rng';
import { anchor, decalAt, room } from './meridian_kit';

function generateExit(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const W = z.W, H = z.H;
  const cx = 24, door = { x: 24, y: 9 }, arrive = { x: 24, y: 39 };

  // a soft, slightly irregular disc of white tile: its edge just stops
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const dx = (x + 0.5 - cx) / 21, dy = (y + 0.5 - 24) / 22;
    const n = valueNoise2(x * 0.18, y * 0.18, seed & 0xffff) * 0.22;
    if (dx * dx + dy * dy < 1 - n) b.fillFloor(x, y, x, y, 'tile_white');
  }
  // the walk from the arrival to the doorway is always there
  b.fillFloor(cx - 1, door.y - 1, cx + 1, arrive.y + 2, 'tile_white');
  room(b, 'Exit', 'exit', 1, 1, W - 2, H - 2, { wall: null, temp: 22 });
  b.flag(0, 0, W - 1, H - 1, TF.NOSPAWN | TF.SAFE);

  // ---- the doorway
  b.obj('exit_doorway', door.x, door.y, 0, { portal: 'p_exit_final' });
  b.portal({ id: 'p_exit_final', x: door.x, y: door.y, kind: 'door', to: '__ending__', tx: door.x, ty: door.y, label: 'Step through', locked: 'stage:3' });
  f.floorItem('note', door.x + 1, door.y + 1, { lore: 'exit_note' });

  // ---- arrival: the door you came through stands alone behind you and leads nowhere now
  anchor(z, 'p_core_exit', arrive.x, arrive.y, 'n');
  b.obj('door_freestanding', arrive.x, arrive.y + 2, 2, {});

  // footprints: somebody walked this way before you, and did not come back
  for (let y = arrive.y - 1; y > door.y + 1; y -= 2) {
    const sx = (y & 2) ? -0.12 : 0.12;
    decalAt(z, 'decal_footprints', cx + 0.5 + sx, y + 0.5, 0.7, 0.9, Math.PI / 2 + rng.float(-0.15, 0.15), 0xb8b4ac, 0.35);
  }
  // a folding chair off to one side, facing the light, as if someone sat and decided
  b.obj('chair_folding', cx - 9, door.y + 7, 2, {});

  // soft white light, mostly from the doorway; a faint wash over the floor
  b.light(cx + 0.5, door.y + 2.5, 'lamp', { color: 0xffffff, intensity: 1.1, radius: 12, y: 2.2 });
  for (const [x, y] of [[cx, 20], [cx, 31], [cx - 10, 24], [cx + 10, 24], [cx, 40]]) b.light(x + 0.5, y + 0.5, 'lamp', { color: 0xf4f6ff, intensity: 0.45, radius: 10, y: 3.2 });

  z.env = {
    ...z.env,
    ambient: 0xeef0f2, ambientI: 1.05, fog: 0xf7f7f5, fogNear: 6, fogFar: 26, void: 0xf4f4f2, temp: 22,
    sky: false, grade: 'exit', reverb: 'dream', ambience: 'exit', music: 'choir',
  };
  z.spawnTable = [];
  z.creatureCap = 0;
}

defZone({
  key: 'exit', name: 'Exit', W: 48, H: 48, depth: 6, gen: (z, s) => generateExit(z, s),
  blurb: 'White. Quiet. A doorway, and nothing else that needs you.',
});
