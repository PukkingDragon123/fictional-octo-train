// Recipes — CAMP PARTS (round 16). Intermediate parts gated by workbench tier
// (needs 'workbench' = any bench, 'bench2' = the powered bench, 'bench3' = the
// machinist's bench), and "strip for parts" recipes for the gadgets the levels
// are full of. Schematics marked learned are taught by research
// (Recovered Schematics), or found by doing: scan the thing named in discover,
// or take one apart (src/craft/stores.ts).
import { defRecipe, type Recipe } from '../../items/recipes';

const R = (r: Recipe) => defRecipe(r);

// ---------------------------------------------------------------- tier 1: any workbench
R({ key: 'zh_hinge', name: 'Bend a Strap Hinge', category: 'carpentry', time: 8, needs: ['workbench'], anim: 'hammer', xp: ['mechanics', 2],
  inputs: [{ item: 'scrap_metal' }, { item: 'nails', uses: 0.04 }, { item: '#hammer', keep: true }], outputs: [{ item: 'hinge', count: 2 }],
  desc: 'Two straps beaten round a nail in the vice.' });
R({ key: 'zh_harness', name: 'Bind a Wiring Harness', category: 'electrical', time: 10, needs: ['workbench'], anim: 'craft', xp: ['electrical', 2],
  inputs: [{ item: 'wire', count: 3 }, { item: 'duct_tape', uses: 0.1 }], outputs: [{ item: 'wiring_harness' }],
  desc: 'Three wires laid out on the bench, taped into a loom.' });
R({ key: 'zh_harness_zip', name: 'Bind a Wiring Harness (Zip Ties)', category: 'electrical', time: 10, needs: ['workbench'], anim: 'craft', xp: ['electrical', 2],
  inputs: [{ item: 'wire', count: 3 }, { item: 'zip_ties' }], outputs: [{ item: 'wiring_harness' }] });
R({ key: 'zh_nails', name: 'Cut Nails from Scrap', category: 'carpentry', time: 12, needs: ['workbench'], anim: 'hammer', xp: ['mechanics', 1],
  inputs: [{ item: 'scrap_metal', count: 2 }, { item: '#hammer', keep: true }], outputs: [{ item: 'nails' }],
  desc: 'Snip, point, head. Fifty crooked nails from two pieces of scrap.' });
R({ key: 'zh_planks', name: 'Split Firewood into Planks', category: 'carpentry', time: 14, needs: ['workbench'], anim: 'saw', xp: ['carpentry', 2],
  inputs: [{ item: 'firewood', count: 2 }, { item: '#saw', keep: true }], outputs: [{ item: 'plank' }] });

// ---------------------------------------------------------------- tier 2: the powered bench
R({ key: 'zh_gear', name: 'Cut a Gear', category: 'misc', time: 14, needs: ['bench2'], anim: 'saw', xp: ['mechanics', 4], learned: true,
  discover: ['alarm_clock', 'wristwatch', 'timer', 'bld_compactor', 'bld_gen_rig'],
  inputs: [{ item: 'scrap_metal', count: 2 }, { item: '#hammer', keep: true }], outputs: [{ item: 'gear' }],
  desc: 'Scribe a wheel off a clock gear, cut it on the grinder, file the teeth.' });
R({ key: 'zh_plate', name: 'Rivet a Steel Plate', category: 'misc', time: 16, needs: ['bench2'], anim: 'hammer', xp: ['mechanics', 4], learned: true,
  discover: ['bld_locker', 'bld_scrap_plate', 'bld_hatch', 'sheet_metal'],
  inputs: [{ item: 'sheet_metal', count: 2 }, { item: 'screws', uses: 0.1 }, { item: '#hammer', keep: true }], outputs: [{ item: 'steel_plate' }],
  desc: 'Two sheets drilled together on the press and riveted back to back.' });
R({ key: 'zh_relay', name: 'Solder a Relay Board', category: 'electrical', time: 18, needs: ['bench2'], anim: 'craft', xp: ['electrical', 5], learned: true,
  discover: ['radio_portable', 'walkie_talkie', 'calculator', 'laptop', 'tv_remote', 'phone_dead'],
  inputs: [{ item: 'electronics_scrap', count: 2 }, { item: 'wire' }, { item: '#screwdriver', keep: true }], outputs: [{ item: 'relay_board' }],
  desc: 'Pull the relays and the crystal off two dead boards, re-seat them on one.' });

// ---------------------------------------------------------------- tier 3: the machinist's bench
R({ key: 'zh_motor', name: 'Rebuild a Motor', category: 'electrical', time: 24, needs: ['bench3'], anim: 'craft', xp: ['electrical', 6], learned: true,
  discover: ['motor', 'bld_gen_rig', 'generator'],
  inputs: [{ item: 'gear', count: 2 }, { item: 'wiring_harness' }, { item: 'scrap_metal', count: 2 }, { item: '#screwdriver', keep: true }], outputs: [{ item: 'motor' }],
  desc: 'Wind a stator round a turned core, two gears for the reduction. It hums.' });
R({ key: 'zh_frame', name: 'Weld a Steel Frame', category: 'misc', time: 20, needs: ['bench3'], anim: 'hammer', xp: ['mechanics', 5],
  inputs: [{ item: 'pipe', count: 2 }, { item: 'scrap_metal', count: 2 }, { item: '#hammer', keep: true }], outputs: [{ item: 'steel_frame' }],
  desc: 'Cut the pipe square in the lathe and join it in the jig. A frame that is not bent.' });

// ---------------------------------------------------------------- strip for parts (anywhere, a screwdriver)
const STRIP: [string, string, [string, number][]][] = [
  ['radio_portable', 'Portable Radio', [['electronics_scrap', 2], ['wire', 1], ['spring', 1]]],
  ['walkie_talkie', 'Walkie-Talkie', [['electronics_scrap', 1], ['wire', 1]]],
  ['alarm_clock', 'Alarm Clock', [['spring', 1], ['scrap_metal', 1], ['electronics_scrap', 1]]],
  ['calculator', 'Calculator', [['electronics_scrap', 1]]],
  ['laptop', 'Laptop', [['electronics_scrap', 3], ['wire', 1], ['scrap_metal', 1]]],
  ['tv_remote', 'TV Remote', [['electronics_scrap', 1], ['spring', 1]]],
  ['phone_dead', 'Dead Phone', [['electronics_scrap', 1], ['glass_shard', 1]]],
  ['mp3_player', 'MP3 Player', [['electronics_scrap', 1]]],
  ['handheld_game', 'Handheld Game', [['electronics_scrap', 1], ['wire', 1]]],
  ['cassette_player', 'Cassette Player', [['electronics_scrap', 1], ['spring', 1], ['wire', 1]]],
  ['timer', 'Kitchen Timer', [['spring', 1], ['scrap_metal', 1]]],
  ['wristwatch', 'Wristwatch', [['spring', 1]]],
];
for (const [k, name, out] of STRIP) {
  R({ key: 'strip_' + k, name: `Strip ${name} for Parts`, category: 'electrical', time: 6 + out.length * 2, anim: 'craft', xp: ['electrical', 1],
    inputs: [{ item: k }, { item: '#screwdriver', keep: true }], outputs: out.map(([item, count]) => ({ item, count })),
    desc: 'Screws out, case off, everything useful into a pile. Taking one apart can teach you how its parts are made.' });
}
