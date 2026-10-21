// Cooking and butchery: G.cook.
//   G.cook.useObject(p, o)   E on a stove / fire / grill / drum stove opens the cooking view (true = handled)
//   G.cook.useCorpse(p, c)   E on a corpse with a blade starts butchering (false = loot it as usual)
//   G.cook.captures()        true while cooking or butchering owns the mouse and keys
//   G.cook.view / G.cook.butchery
import { G } from '../game/G';
import { bus } from '../core/events';
import { itemDef } from '../items/item';
import { defQuest } from '../game/quests';
import { CookView } from './cooking';
import { Butchery } from './butchery';
import { countIn, marked, mark } from '../build/progress';
import type { Game, GameSystem } from '../game/game';
import type { Player } from '../entities/player';
import type { TileObject } from '../world/zone';
import type { MenuOption } from '../ui/ui';
import { objDef } from '../world/objects';
import { queueAt } from '../actions/basic';
import { InstantAction } from '../actions/action';
import '../build/sounds';

export class CookSystem implements GameSystem {
  name = 'cook';
  view = new CookView();
  butchery = new Butchery();

  constructor() {
    this.hooks();
    // a plated dish's quality lifts the mood when it is eaten (the stomach gets the food itself)
    bus.on('consumed', (p: Player, key: string) => {
      if (!key?.startsWith('dish_') || !p?.isLocal) return;
      const q = this.view.lastQ.get(key) ?? 0.75;
      p.body.unhappy = Math.max(0, p.body.unhappy - 8 * q);
      if (itemDef(key).food?.ingredient === 'weird' || key === 'dish_wax_candy' || key === 'dish_glow_broth') mark('cook:ate_weird');
    });
  }

  /** verbs: 'Cook…' first on stations, 'Butcher' on corpses (first when a blade is in hand) */
  private hooks() {
    bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => {
      if (!this.view.stationKind(o)) return;
      for (let i = out.length - 1; i >= 0; i--) if (out[i].label === 'Cook' && out[i].sub) out.splice(i, 1);
      out.unshift({ label: 'Cook at the ' + (objDef(o.key)?.name ?? 'stove').toLowerCase(), action: () => queueAt(p, o.x + 0.5, o.y + 0.5, new InstantAction(p, () => this.useObject(p, o), 'Step up'), 1.6) });
    });
    bus.on('worldMenu', (p: Player, t: any, opts: MenuOption[]) => {
      if (t?.kind !== 'creature' || !t.c?.dead || !this.butchery.canButcher(t.c)) return;
      const tool = this.butchery.toolOf(p);
      const v: MenuOption = { label: 'Butcher', disabled: tool ? false : 'needs a blade, an axe or a saw', action: () => { queueAt(p, t.c.x, t.c.z, new InstantAction(p, () => this.useCorpse(p, t.c), 'Kneel'), 1.3, false); } };
      const i = opts.findIndex((o) => o.label === 'Butcher');
      if (i >= 0) opts.splice(i, 1);
      const inHand = !!(p.handR && this.butchery.toolOf(p)?.it === p.handR);
      if (inHand) opts.unshift(v); else { const s = opts.findIndex((o) => o.label === 'Search'); opts.splice(s >= 0 ? s + 1 : opts.length, 0, v); }
    });
  }

  get active() { return this.view.open || !!this.butchery.active; }
  captures() { return this.active; }

  useObject(p: Player, o: TileObject): boolean {
    if (!p.isLocal || !this.view.stationKind(o)) return false;
    return this.view.openAt(p, o);
  }
  useCorpse(p: Player, c: any): boolean {
    if (!p.isLocal) return false;
    return this.butchery.start(p, c);
  }

  update(dt: number) {
    this.view.update(dt);
    this.butchery.update();
  }
}

// ---------------------------------------------------------------- quests
defQuest({
  key: 'q_cook_hot', title: 'Hot Plate', giver: 'VOSS', category: 'cook',
  desc: '"Raw meat is how debtors die of something stupid." Cook a proper dish at a stove or a fire. Not burnt. Not raw.',
  objectives: [{ id: 'dish', text: 'Plate a good dish', check: (m) => countIn(m, 'cook_dish') >= 1 }],
  reward: { rp: 2 },
});
defQuest({
  key: 'q_cook_test', title: 'Test Kitchen', giver: 'MERIDIAN R&D', category: 'cook', requires: ['q_cook_hot'],
  desc: 'R&D wants recipes. Put things together nobody has tried and see what they become.',
  objectives: [{ id: 'disc', text: 'Discover 3 recipes', check: (m) => Math.min(1, countIn(m, 'cook_discover') / 3) }],
  reward: { rp: 4, unlock: ['rc_stew'] },
});
defQuest({
  key: 'q_cook_chef', title: 'Chef of the Infinite Kitchen', giver: 'VOSS', category: 'cook', requires: ['q_cook_hot'],
  desc: 'Golden on both sides, nothing catching in the pot. Three perfect dishes.',
  objectives: [{ id: 'perfect', text: 'Plate 3 perfect dishes', check: (m) => Math.min(1, countIn(m, 'cook_perfect') / 3) }],
  reward: { rp: 5, unlock: ['rc_glow'] },
});
defQuest({
  key: 'q_butcher_first', title: 'Field Dressing', giver: 'VOSS', category: 'cook',
  desc: 'Something died. Do not waste it. Kneel down with a knife and take it apart: limbs, gut, hide.',
  objectives: [{ id: 'full', text: 'Butcher a corpse completely', check: (m) => marked(m, 'butcher:any') }],
  reward: { rp: 3 },
});
defQuest({
  key: 'q_butcher_weird', title: 'Strange Meat', giver: 'MERIDIAN R&D', category: 'cook', requires: ['q_butcher_first'],
  desc: 'Every kind of thing in here keeps something only it has. R&D pays for samples. Cut out three.',
  objectives: [{ id: 'parts', text: 'Harvest 3 creature parts', check: (m) => Math.min(1, countIn(m, 'butcher_part') / 3) }],
  reward: { rp: 5, unlock: ['rc_wax'] },
});
defQuest({
  key: 'q_cook_weird', title: 'Acquired Taste', giver: 'MERIDIAN R&D', category: 'cook', requires: ['q_butcher_weird'],
  desc: 'Cook a dish with a creature part in it. Then eat it. For science.',
  objectives: [
    { id: 'cook', text: 'Cook with a creature part', check: (m) => marked(m, 'cook:weird') },
    { id: 'eat', text: 'Eat it', check: (m) => marked(m, 'cook:ate_weird') },
  ],
  reward: { rp: 6 },
});

export function installCook(g: Game): CookSystem {
  const c = new CookSystem();
  g.cook = c;
  g.addSystem(c);
  void G;
  return c;
}
