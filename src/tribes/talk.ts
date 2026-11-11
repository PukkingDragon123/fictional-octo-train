// TALKING TO PEOPLE (round 15). E on a person goes into the unit's own eyes (a full
// first-person cut, the person filling the picture, cinema bars). What they say runs in
// the subtitle strip with their name; what the unit says back is picked from up to four
// square, chamfered replies sitting in the bottom bar (keys 1-4, click or tap; Esc backs
// out, then leaves). No bubbles, no panels: a name plate, the replies, the faces.
// The conversation branches on what this person remembers (mind.ts) and on the tribe's
// standing: greetings change for someone you helped, robbed, lied to or hit; asking
// (who they are, what is out there, help, work), trading (the barter cloth, tradeUI.ts:
// credit on their chalked tab), recruiting (paid in credit, a share, or trust),
// orders for a follower, threats, lies (believed now, maybe found out later),
// apologies and amends, confronting a thief, gifts.
// Two conversations start on their own: a MUGGING (someone walks up and wants the pack)
// and being CAUGHT with a hand in someone's pocket (theft.ts).
// Credit is SCRIP: the tribe's tab first (what they owe you for goods), then the crew's surplus
// scrip on the ledger.
import './talk.css';
import { G } from '../game/G';
import { bus } from '../core/events';
import { op } from '../game/ops';
import { uid } from '../core/rng';
import { fpGroup, fpClaim, fpRelease, fpOwner } from '../fp/fp';
import { itemDef, type Item } from '../items/item';
import { Container } from '../items/container';
import { itemValue } from '../game/debt/values';
import { questDefs } from '../game/quests';
import { openLoot } from '../interact/verbs';
import type { Creature } from '../creatures/creature';
import type { Player } from '../entities/player';
import { TRIBES, TRIBE_KEYS, type TribeKey } from './defs';
import { memberName, sayAs, tribeOfCreature } from './npc';
import { traitsOf, roleOf, ROLE_NAME, attitude, memOf, remember, moodWord, loyaltyOf, shiftLoyalty, grievance, RECRUIT_COST, MAX_FOLLOWERS } from './mind';
import { SAY, line, dirWord } from './speech';
import { pocketsOf, returnLoot, stealables } from './theft';
import { alarm, campOf } from './brain';
import type { TribeSystem } from './tribes';

export type TalkMode = 'talk' | 'mug' | 'caught';
interface Reply { text: string; say?: string; why?: string; go: () => void }
const HOSTILE_T = new Set(['hostile', 'stalker', 'ambush', 'territorial']);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** the conversation's pacing runs on the wall clock (a slow frame rate must not hold the replies back) */
const now = () => performance.now() / 1000;
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

// ---------------------------------------------------------------- credit
// SCRIP is the run's one money (src/game/economy): a tribe's tab is scrip they owe you; past the
// tab, the crew's surplus scrip on the ledger (G.debt.surplus, spent with G.debt.spend) pays.
function wallet(): any {
  const g: any = G;
  if (g.wallet?.balance) return g.wallet;
  const d = g.debt;
  if (d?.s?.on) return { balance: () => d.surplus ?? 0, spend: (_k: string, n: number, what: string) => d.spend(n, what) };
  return null;
}
function walletScrip(): number { try { return Math.max(0, Math.floor(Number(wallet()?.balance?.('scrip')) || 0)); } catch { return 0; } }
export function creditFor(S: TribeSystem, t: string) { return S.tab(t) + walletScrip(); }
/** pay a tribe: their tab first, then scrip from the wallet */
export function payCredit(S: TribeSystem, t: string, n: number): boolean {
  if (creditFor(S, t) < n) return false;
  const fromTab = Math.min(S.tab(t), n), rest = n - fromTab;
  if (rest > 0) { try { if (wallet()?.spend?.('scrip', rest, 'tribe:' + t) === false) return false; } catch { return false; } }
  if (fromTab) S.addTab(t, -fromTab);
  return true;
}

const armed = (p: Player) => { const it = p.handR as Item | null; if (!it) return false; const d = itemDef(it.key); return d.cat === 'weapon' || !!d.tags?.includes('weapon') || /knife|pipe|bat|axe|machete|crowbar|baton|wrench|hammer/.test(it.key); };
const foodOf = (items: Item[]) => items.filter((it) => { const d = itemDef(it.key); return d.cat === 'food' || d.cat === 'drink'; });

export class Talk {
  c: Creature | null = null;
  mode: TalkMode = 'talk';
  private el: HTMLDivElement;
  private who: HTMLDivElement;
  private opts: HTMLDivElement;
  private replies: Reply[] = [];
  private escReply: Reply | null = null;
  private token = 0;
  private showAt = 0;
  private pending = false;
  private suspended = false;
  private node = '';

  constructor(private S: TribeSystem) {
    fpGroup('talk');
    const el = this.el = document.createElement('div');
    el.className = 'hm-talk';
    el.innerHTML = '<div class="hm-who"></div><div class="hm-opts" role="menu"></div>';
    this.who = el.querySelector('.hm-who') as HTMLDivElement;
    this.opts = el.querySelector('.hm-opts') as HTMLDivElement;
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest('.hm-opt') as HTMLElement | null;
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const i = b.dataset.i === 'esc' ? -1 : Number(b.dataset.i);
      this.choose(i);
    });
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    bus.on('fpLost', (name: string) => { if (name === 'talk' && this.c && !this.suspended) this.close(false); });
    (G as any).talk = this;
  }

  get active() { return !!this.c; }

  private onKey(e: KeyboardEvent) {
    if (!this.c || this.suspended) return;
    const k = e.code;
    let i = -2;
    if (/^(Digit|Numpad)[1-4]$/.test(k)) i = Number(k.slice(-1)) - 1;
    else if (k === 'Escape') i = -1;
    else if ((k === 'KeyE' || k === 'Space' || k === 'Enter') && this.pending) { this.showAt = 0; }
    else if (/^(Digit|Numpad)\d$/.test(k) || k === 'KeyE' || k === 'Space' || k === 'Enter') { /* swallow */ }
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat || i === -2) return;
    this.choose(i);
  }

  // ---------------------------------------------------------------- open / close
  /** start a conversation (returns false if it cannot happen now) */
  open(c: Creature, mode: TalkMode = 'talk'): boolean {
    const p = G.local, S = this.S;
    const t = tribeOfCreature(c);
    if (!p || !t || c.dead || p.body.dead || this.c) return false;
    if (fpOwner() && fpOwner() !== 'talk') return false;
    if (mode === 'talk' && S.hostile(t) && !c.tamedBy) { sayAs(c, pick(TRIBES[t].lines.hostile)); return false; }
    if (!fpClaim('talk', 2, { cinematic: 'full', eyePitch: 3 })) return false;
    p.actions?.clear?.();
    this.c = c; this.mode = mode; this.suspended = false;
    c.mem.talkTo = p.id;
    c.mem.net = { ...(c.mem.net || {}), sit: 0, lie: 0, kneel: 0, sneak: 0, act: '' };
    this.face(1);
    S.meet(t);
    remember(c, 'talk');
    document.body.classList.add('hm-talking');
    this.plate();
    this.el.classList.add('on');
    G.audio?.ui?.('bagOpen', 0.2);
    if (mode === 'mug') this.mugNode();
    else if (mode === 'caught') this.caughtNode();
    else this.root(true);
    return true;
  }

  close(bye = true) {
    const c = this.c; if (!c) return;
    this.c = null; this.token++;
    this.pending = false; this.suspended = false;
    c.mem.talkTo = null;
    this.el.classList.remove('on');
    this.opts.innerHTML = '';
    document.body.classList.remove('hm-talking');
    fpRelease('talk');
    if (bye && !c.dead && this.mode === 'talk') sayAs(c, pick(TRIBES[tribeOfCreature(c)!].lines.bye));
  }

  /** both turn to each other */
  private face(snap = 0) {
    const p = G.local, c = this.c; if (!p || !c) return;
    const a = Math.atan2(c.z - p.z, c.x - p.x);
    p.targetFacing = a; if (snap) p.facing = a;
    c.targetFacing = a + Math.PI;
  }

  update(dt: number) {
    const c = this.c, p = G.local;
    if (!c) return;
    if (!p || c.dead || p.body.dead || c.zoneKey !== p.zoneKey || Math.hypot(c.x - p.x, c.z - p.z) > 4.2) { this.close(false); return; }
    if (this.suspended) return;
    if (this.mode === 'talk' && !c.tamedBy && this.S.hostile(c.mem.tribe)) { this.close(false); return; }
    this.face();
    if (this.pending && now() >= this.showAt) { this.pending = false; this.render(); }
    void dt;
  }

  // ---------------------------------------------------------------- lines and replies
  /** they say a line, then the replies come up */
  private say(text: string, replies: Reply[], escReply: Reply | null, gesture = '') {
    const c = this.c; if (!c) return;
    this.replies = replies.slice(0, 4); this.escReply = escReply;
    this.opts.innerHTML = ''; this.opts.classList.remove('vis');
    if (text) sayAs(c, text);
    if (gesture) c.mem.gesture = { a: gesture, until: G.time + 1.8 };
    this.pending = true;
    this.showAt = now() + (text ? Math.min(2.2, 0.55 + text.length * 0.022) : 0.15);
    this.plate();
  }

  private render() {
    const keys = ['1', '2', '3', '4'];
    const html = this.replies.map((r, i) => `<button class="hm-opt${r.why ? ' no' : ''}" data-i="${i}" style="--d:${i * 50}ms"><span class="hm-in"><i class="hm-k">${keys[i]}</i><span class="hm-t">${esc(r.text)}${r.why ? `<em>${esc(r.why)}</em>` : ''}</span></span></button>`).join('');
    const e = this.escReply ? `<button class="hm-opt hm-esc" data-i="esc" style="--d:${this.replies.length * 50}ms"><span class="hm-in"><i class="hm-k">Esc</i><span class="hm-t">${esc(this.escReply.text)}</span></span></button>` : '';
    this.opts.innerHTML = html + e;
    void this.opts.offsetWidth;
    this.opts.classList.add('vis');
  }

  private choose(i: number) {
    if (!this.c || this.suspended) return;
    if (this.pending) { this.showAt = 0; return; }
    const r = i === -1 ? this.escReply : this.replies[i];
    if (!r) return;
    const p = G.local!;
    if (r.why) { bus.emit('think', p, r.why.charAt(0).toUpperCase() + r.why.slice(1) + '.'); return; }
    G.audio?.ui?.('click', 0.3);
    this.opts.classList.remove('vis');
    const spoken = r.say ?? (/(…|\.\.\.)$/.test(r.text) || r.text.startsWith('[') ? '' : r.text.replace(/\s*\([^)]*\)\s*$/, ''));
    const tok = ++this.token;
    if (spoken) bus.emit('subtitle', { pid: p.id, text: spoken });
    this.pending = false;
    this.opts.innerHTML = '';
    setTimeout(() => { if (tok === this.token && this.c) r.go(); }, spoken ? Math.min(1500, 450 + spoken.length * 18) : 60);
  }

  private plate() {
    const c = this.c; if (!c) return;
    const t = tribeOfCreature(c)!, a = attitude(c), role = roleOf(c);
    const loy = c.tamedBy ? ` <b class="hm-loy" style="--l:${loyaltyOf(c)}%"></b>` : '';
    this.who.innerHTML = `<span class="hm-name">${esc(memberName(c))}</span><span class="hm-role">${esc(TRIBES[t].member)} · ${esc(c.tamedBy ? 'Follower' : ROLE_NAME[role])}</span><span class="hm-mood m-${moodWord(a)}"><i></i>${moodWord(a)}</span>${loy}`;
    this.who.style.setProperty('--tc', TRIBES[t].css);
  }

  // ---------------------------------------------------------------- shared bits
  private get t(): TribeKey { return tribeOfCreature(this.c!)!; }
  private get p(): Player { return G.local!; }
  private back(): Reply { return { text: 'Back', go: () => this.root() }; }
  private leave(): Reply { return { text: 'Leave', go: () => this.close(true) }; }
  /** give them a moment, then walk away (the talk closes) */
  private end(text: string, gesture = '') {
    const c = this.c; if (!c) return;
    if (text) sayAs(c, text);
    if (gesture) c.mem.gesture = { a: gesture, until: G.time + 1.8 };
    const tok = ++this.token;
    this.opts.innerHTML = '';
    setTimeout(() => { if (tok === this.token) this.close(false); }, Math.min(2600, 900 + text.length * 30));
  }
  /** they turn on the unit (the talk ends in a fight) */
  private turn(text: string, call = false) {
    const c = this.c!, p = this.p;
    sayAs(c, text);
    c.mem.gesture = { a: 'aim_melee', until: G.time + 1 };
    if (call) alarm(c, p.id, 'attack');
    else c.mem.alarm = { pid: p.id, until: G.time + 45 };
    this.close(false);
  }
  private friendsNear(): number {
    const c = this.c!; let n = 0;
    for (const o of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) if (o !== c && !o.dead && o.mem.tribe === c.mem.tribe && !o.tamedBy && o.zoneKey === c.zoneKey && Math.hypot(o.x - c.x, o.z - c.z) < 11 && !o.mem.net?.lie) n++;
    return n;
  }

  // ---------------------------------------------------------------- the root
  private root(first = false) {
    const c = this.c!, S = this.S, t = this.t, m = memOf(c), tr = traitsOf(c), a = attitude(c), p = this.p;
    let text = '';
    if (first) {
      // a lie comes out
      if (m.told > 0 && Math.random() < 0.45) {
        remember(c, 'lie', m.told); remember(c, 'told', -m.told);
        S.bumpRep(t, -6, 'your lie came out');
        text = line(SAY.foundOut);
      } else if (c.tamedBy === p.id) text = loyaltyOf(c) < 25 ? line(SAY.followWarn) : pick(TRIBES[t].lines.follow);
      else if (m.lie > 0 && grievance(m) > 1) text = line(SAY.greetLiar);
      else if ((m.caught > 0 || m.rob > 0) && grievance(m) > 1) text = line(SAY.greetThief);
      else if (m.hit > 0 && grievance(m) > 1) text = line(SAY.greetHit);
      else if (m.fear > 0 && tr.bravery < 0.5 && grievance(m) > 0.5) text = line(SAY.greetScared);
      else if (m.owe > 0 && a > 0) text = line(SAY.greetOwed);
      else if (a >= 45 && m.talk > 1) text = line(SAY.greetFriend);
      else if (m.talk <= 1) text = Math.random() < 0.6 ? pick(TRIBES[t].lines.greet) : line(SAY.greetNew);
      else if (a < -15) text = line(SAY.greetCold);
      else text = pick([...TRIBES[t].lines.greet, ...TRIBES[t].lines.idle]);
    } else text = pick(a < -15 ? ['What else.', 'And?', 'Get on with it.'] : ['What else?', 'Go on.', 'Anything else?', 'Mm?']);
    const mine = c.tamedBy === p.id;
    const replies: Reply[] = [
      { text: 'Ask about…', go: () => this.ask() },
      { text: "Let's trade.", why: a < -35 ? 'they will not trade with you' : undefined, go: () => this.trade() },
      mine ? { text: 'About the road…', go: () => this.orders() } : { text: 'Walk with me.', go: () => this.recruit() },
      { text: 'Something else…', go: () => this.more() },
    ];
    this.say(text, replies, this.leave(), first && a > 10 ? 'emote:wave' : '');
  }

  // ---------------------------------------------------------------- asking
  private ask() {
    const p = this.p, c = this.c!;
    const bleed = (() => { try { return p.body.bleedRate(); } catch { return 0; } })();
    const hungry = (p.body as any).hunger > 40;
    const help: Reply = bleed > 0.05 ? { text: "I'm hurt. Can you patch me up?", go: () => this.heal() }
      : hungry ? { text: 'Can you spare some food?', go: () => this.food() }
      : { text: 'How do you stay alive here?', go: () => this.advice() };
    this.say(pick(['Ask, then.', 'Go on.', 'What do you want to know?']), [
      { text: 'Who are you?', go: () => this.whoAreYou() },
      { text: "What's out there?", go: () => this.rumours() },
      help,
      { text: 'Is there work?', go: () => this.work() },
    ], this.back(), traitsOf(c).chatty > 0.6 ? 'emote:shrug' : '');
  }

  private whoAreYou() {
    const c = this.c!, t = this.t, role = roleOf(c);
    const R: Record<string, string[]> = {
      trader: ['I keep the cloth. Fair count, fair price.', 'Trader. Anything you need, I can find. For a price.'],
      guard: ["I keep watch. Nobody walks in here I don't see.", 'Guard. I stand where the trouble comes from.'],
      cook: ['I keep the pot hot and everyone fed.', 'Cook. You eat what I make or you go hungry.'],
      scavenger: ['I go out. I come back. Usually with tins.', 'Scavenger. I know every room for a mile. They move, I learn them again.'],
      hunter: ['I clear the rooms around us. Things that bite, I bite back.', 'Hunter. What comes near the fire does not leave.'],
      thief: ['I find things. Things find me.', 'Nobody important. Just... good with my hands.'],
      drifter: ['Nobody. Just walking.', 'I had a camp once.'],
      raider: ['Your problem.'],
    };
    const lore = TRIBES[t].lore.notes;
    this.say(`${memberName(c)}. ${pick(R[role] || R.drifter)} ${pick(lore)}`, [
      { text: `Tell me about ${TRIBES[t].name}.`, go: () => this.say(pick(lore.filter((n) => n)), [this.back()], null) },
      { text: 'Ask something else…', go: () => this.ask() },
    ], this.back());
  }

  private rumours() {
    const c = this.c!, t = this.t, p = this.p;
    const z = G.zones.get(c.zoneKey);
    const bits: string[] = [];
    // the nearest thing with teeth
    let best: Creature | null = null, bd = 90;
    for (const o of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) {
      if (o.dead || o.zoneKey !== c.zoneKey || o.mem.tribe || o.tamedBy || !HOSTILE_T.has(o.sp.temperament)) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) bits.push(`${best.displayName?.() || best.sp.name}, ${dirWord(c.x, c.z, best.x, best.z)} of here. ${bd < 20 ? 'Close. Too close.' : `Maybe ${Math.max(2, Math.round(bd / 6))} rooms.`} Stay off its ground.`);
    else bits.push("Quiet, for once. Nothing with teeth close by. That's when you worry.");
    // the other camps on this level
    for (const k of (z?.meta.tribeCamps || []) as any[]) if (k.t !== t) { bits.push(`${TRIBES[k.t as TribeKey].name} have a fire ${dirWord(c.x, c.z, k.x, k.y)} of here.`); break; }
    const rv = TRIBES[TRIBES[t].rival];
    bits.push(pick([`And if you meet ${rv.name}, count your fingers after.`, `${rv.name}? Don't turn your back on them.`, `Stay clear of ${rv.name}. They'd sell your teeth.`]));
    void p;
    this.say(bits.join(' '), [{ text: 'Ask something else…', go: () => this.ask() }], this.back(), best ? 'emote:point' : '');
  }

  private advice() {
    this.say(pick([
      'Water first. Then a door you can close. Then food. In that order.',
      "Don't run. Running is a noise. Walk like you belong.",
      'If the lights change colour, stop. Wait. Let it pass.',
      'Count your exits. Rooms lie. Count them again.',
      "Feed the press what you can't carry. The Institute pays, after a fashion.",
    ]), [{ text: 'Ask something else…', go: () => this.ask() }], this.back());
  }

  private heal() {
    const c = this.c!, p = this.p, tr = traitsOf(c), a = attitude(c);
    if ((c.mem.helpT ?? 0) > G.time) { this.say('I already wrapped you once. Bandages do not grow here.', [this.back()], null); return; }
    if (tr.kindness * 0.7 + a / 120 + memOf(c).help * 0.1 < 0.3) { this.say(line(SAY.healNo), [this.back()], null, 'emote:shrug'); return; }
    let worst: any = null;
    for (const inj of p.body.allInjuries()) if (!inj.bandage && p.body.injuryBleed(inj) > (worst ? p.body.injuryBleed(worst) : 0)) worst = inj;
    if (worst) { worst.bandage = { clean: true, soak: 0, sterile: false }; bus.emit('think', p, `${memberName(c)} wraps the wound. Firm hands.`); }
    c.mem.helpT = G.time + 900;
    c.mem.gesture = { a: 'bandage', until: G.time + 2.2 };
    remember(c, 'owe');
    this.say(line(SAY.helpDone), [{ text: 'Thank you.', go: () => this.root() }, { text: "I'll pay you back.", go: () => this.root() }], this.back(), 'bandage');
  }

  private food() {
    const c = this.c!, p = this.p, tr = traitsOf(c), a = attitude(c);
    const f = foodOf(pocketsOf(c));
    if (!f.length || tr.kindness * 0.6 + a / 110 < 0.32) { this.say(line(SAY.foodNo), [this.back()], null, 'emote:shrug'); return; }
    const it = f[0];
    pocketsOf(c).splice(pocketsOf(c).indexOf(it), 1);
    p.addItem(it); bus.emit('inventoryChanged', p);
    remember(c, 'owe');
    this.say(line(SAY.foodYes), [{ text: 'I owe you.', go: () => this.root() }], this.back());
  }

  private work() {
    const t = this.t;
    const status = (k: string) => G.missions?.quests?.questStatus?.(k) ?? '';
    const qs = questDefs().filter((q) => q.category === 'tribe' && q.giver === TRIBES[t].name.toUpperCase());
    const active = qs.find((q) => status(q.key) === 'active' || status(q.key) === 'ready');
    if (active) { this.say(`You already have our ${active.title}. ${status(active.key) === 'ready' ? 'Looks done. Hand it in on the board.' : 'Finish it.'}`, [this.back()], null); return; }
    const open = qs.find((q) => !['done', 'active', 'ready'].includes(status(q.key)) && !(q.requires || []).some((r) => (r.startsWith('flag:') ? !G.missions?.flags?.has?.(r.slice(5)) : status(r) !== 'done')));
    if (!open) { this.say(pick(['Nothing now. Come back when the lights change.', 'No work. Not for you, not today.']), [this.back()], null); return; }
    this.say(`${open.title}. ${open.desc}`, [
      { text: "I'll do it.", go: () => { const ok = G.missions?.quests?.acceptQuest?.(open.key); bus.emit('questOffer', { key: open.key, giver: TRIBES[t].name.toUpperCase(), accepted: ok !== false }); this.say(pick(["Good. Don't make me regret it.", "We'll be counting.", 'Then go.']), [this.back()], null); } },
      { text: 'Not now.', go: () => this.root() },
    ], this.back());
  }

  // ---------------------------------------------------------------- trade (the barter cloth)
  private trade() {
    const c = this.c!;
    this.suspended = true;
    this.opts.innerHTML = '';
    const ui = this.S.ui;
    ui.afterClose = () => {
      // back from the cloth to the face
      if (!this.c || this.c !== c) return;
      this.suspended = false;
      if (!fpClaim('talk', 4, { cinematic: 'full', eyePitch: 3 })) { this.close(false); return; }
      this.root();
    };
    ui.open(c);
    if (!ui.isOpen) { ui.afterClose = null; this.suspended = false; this.root(); }
  }

  // ---------------------------------------------------------------- recruiting and followers
  private recruit() {
    const c = this.c!, S = this.S, t = this.t, p = this.p, a = attitude(c), tr = traitsOf(c);
    if (S.recruits(p.id).length >= MAX_FOLLOWERS) { this.say("You've got enough mouths to feed already.", [this.back()], null); return; }
    if (roleOf(c) === 'trader' || roleOf(c) === 'cook') { this.say(`And who keeps the ${roleOf(c) === 'trader' ? 'cloth' : 'pot'}? No. Ask one of the others.`, [this.back()], null); return; }
    if (a < 5 || S.rep(t) < -10) { this.say(line(SAY.recruitNo), [this.back()], null, 'emote:shrug'); return; }
    const cost = Math.max(40, Math.round(RECRUIT_COST * (1.25 - a / 120) * (0.7 + tr.greed * 0.6)));
    const have = creditFor(S, t);
    const replies: Reply[] = [
      { text: `${cost} scrip, up front.`, why: have < cost ? `I only have ${have} scrip to offer` : undefined, go: () => { if (payCredit(S, t, cost)) { remember(c, 'paid'); this.join(a); } } },
      { text: 'A fair share of what we find.', go: () => { if (Math.random() < 0.15 + a / 110 + (1 - tr.greed) * 0.35) this.join(a); else this.say(pick(['A share of nothing is nothing.', 'Shares. Right. Come back with scrip.']), [this.back()], null, 'emote:shrug'); } },
    ];
    if (a >= 50) replies.unshift({ text: 'Because you trust me.', go: () => this.join(a) });
    this.say(pick(["And what's in it for me?", 'Walk with you. Into that. Why?', 'Maybe. What are you offering?']), replies, this.back());
  }
  private join(a: number) {
    const c = this.c!, p = this.p;
    op('tribeRecruit', { id: c.id, by: p.id });
    op('tribe', { k: 'loyal', id: c.id, n: Math.round(a / 3) - 10 });
    c.mem.fedH = G.clock.hours;
    this.end(line(SAY.recruitYes), 'emote:salute');
    bus.emit('think', p, `${memberName(c)} falls in behind me.`);
  }

  private pack(c: Creature): Container {
    let pk = c.mem.pack as Container | undefined;
    if (!pk) { pk = new Container(uid(), `${memberName(c)}'s pack`, 'bag', 14); c.mem.pack = pk; }
    return pk;
  }

  private orders() {
    const c = this.c!, p = this.p, loy = loyaltyOf(c);
    const food = foodOf(stealables(p));
    const text = loy > 70 ? pick(['Boss.', 'Say the word.']) : loy > 40 ? pick(['What do you need?', 'Yes?']) : loy > 20 ? pick(['What now.', 'Mm.']) : line(SAY.followWarn);
    this.say(text, [
      c.mem.stay ? { text: 'Follow me.', go: () => { c.mem.stay = false; this.end(line(SAY.followYes)); } }
        : { text: 'Wait here.', go: () => { c.mem.stay = true; c.mem.stayAt = [c.x, c.z]; this.end(line(SAY.followWait)); } },
      { text: 'Carry some things for me.', go: () => { const pk = this.pack(c); this.close(false); openLoot(p, pk, c); } },
      { text: 'Eat something.', why: food.length ? undefined : 'I have nothing to give them', go: () => {
        const it = food.sort((x, y) => itemValue(x) - itemValue(y))[0];
        p.removeItem(it); bus.emit('inventoryChanged', p);
        c.mem.fedH = G.clock.hours; shiftLoyalty(c, 15); remember(c, 'gift');
        this.say(line(SAY.followFed), [this.back()], null, 'eat');
      } },
      { text: "You're free to go.", go: () => {
        const pk = c.mem.pack as Container | undefined;
        if (pk?.items.length) { for (const it of [...pk.items]) { pk.remove(it); p.addItem(it); } bus.emit('inventoryChanged', p); bus.emit('think', p, 'They hand back what they carried for me.'); }
        op('tribeRecruit', { id: c.id, by: '' });
        this.S.bumpRep(this.t, 2, 'you sent one of theirs home whole');
        this.end(line(SAY.dismiss), 'emote:wave');
      } },
    ], this.back());
  }

  // ---------------------------------------------------------------- something else: threats, lies, apologies
  private more() {
    const c = this.c!, p = this.p, m = memOf(c);
    const out: Reply[] = [];
    if ((c.mem.loot as Item[] | undefined)?.length) out.push({ text: 'Give back what you took.', go: () => this.confront() });
    if (grievance(m) > 0) out.push({ text: "About before. I'm sorry.", go: () => this.apologise() });
    out.push({ text: 'Hand over what you have. Now.', go: () => this.threaten() });
    out.push(this.lieReply());
    const held = p.handR as Item | null;
    if (held && out.length < 4) out.push({ text: `Take this. A gift. (${held.name || itemDef(held.key).name})`, say: 'Here. Take this. A gift.', go: () => this.gift(held) });
    this.say('', out, this.back());
  }

  private lieReply(): Reply {
    const t = this.t, rv = TRIBES[TRIBES[t].rival].name;
    return Math.random() < 0.5
      ? { text: 'Your people said to put it on your tab. They owe me.', go: () => this.lie('tab') }
      : { text: `${rv} are gathering two rooms over. Thought you should know.`, go: () => this.lie('rival') };
  }
  private lie(kind: 'tab' | 'rival') {
    const c = this.c!, S = this.S, t = this.t, m = memOf(c), tr = traitsOf(c), a = attitude(c);
    const k = 0.5 - m.lie * 0.2 - m.told * 0.08 + (a < 0 ? -0.15 : 0.05) + (tr.kindness - 0.5) * 0.25 - (tr.temper - 0.5) * 0.15;
    if (Math.random() < Math.max(0.08, Math.min(0.8, k))) {
      remember(c, 'told');
      if (kind === 'tab') { const n = 20 + Math.round(Math.random() * 25); S.addTab(t, n); this.say(`${line(SAY.believe)} ${n} on the tab. If I find out otherwise...`, [this.back()], null); }
      else { S.bumpRep(t, 3, 'a warning they believed'); this.say(`${line(SAY.believe)} We'll double the watch.`, [this.back()], null); }
      return;
    }
    remember(c, 'lie');
    S.bumpRep(t, -5, 'a lie they saw through');
    if (tr.temper > 0.7 && a < 0) { this.turn(line(SAY.disbelieve)); return; }
    this.say(line(SAY.disbelieve), [this.back()], null, 'emote:facepalm');
  }

  private threaten() {
    const c = this.c!, S = this.S, t = this.t, p = this.p, tr = traitsOf(c);
    const friends = this.friendsNear();
    const k = 0.22 + (armed(p) ? 0.28 : 0) + (1 - tr.bravery) * 0.38 - friends * 0.12 + (c.hp < c.sp.hp * 0.5 ? 0.15 : 0) - (roleOf(c) === 'guard' ? 0.15 : 0);
    remember(c, 'fear');
    S.bumpRep(t, -6, 'you threatened one of theirs');
    if (Math.random() < Math.max(0.05, Math.min(0.85, k))) {
      const pk = pocketsOf(c);
      const it = pk.sort((x, y) => itemValue(y) - itemValue(x))[0];
      if (it) { pk.splice(pk.indexOf(it), 1); p.addItem(it); bus.emit('inventoryChanged', p); bus.emit('think', p, `They hand over ${it.name || itemDef(it.key).name}. Their hands are shaking.`); }
      remember(c, 'rob');
      c.mem.fleeTo = null;
      this.end(line(SAY.threatYield), 'flinch');
      return;
    }
    if (tr.temper > 0.45 || friends > 1) { this.turn(line(SAY.threatRefuse), friends > 0); return; }
    this.say(line(SAY.threatRefuse), [this.back()], null, 'aim_melee');
  }

  private apologise() {
    const c = this.c!, S = this.S, t = this.t, m = memOf(c), tr = traitsOf(c), a = attitude(c);
    const g = grievance(m), amends = Math.round(20 + g * 15);
    const have = creditFor(S, t);
    this.say(pick(['Sorry for what, exactly?', 'Sorry. Go on.', 'You have a nerve. Go on.']), [
      { text: 'I mean it. I was wrong.', go: () => {
        if (Math.random() < tr.kindness * 0.6 + a / 150 + 0.15 - g * 0.05) { remember(c, 'sorry'); S.bumpRep(t, 2, 'an apology'); this.say(line(SAY.sorryYes), [this.back()], null); }
        else this.say(line(SAY.sorryNo), [this.back()], null, 'emote:shrug');
      } },
      { text: `Let me make it right. (${amends} scrip)`, why: have < amends ? `I only have ${have} scrip to offer` : undefined, go: () => {
        if (!payCredit(S, t, amends)) return;
        remember(c, 'sorry', Math.ceil(g / 1.5)); remember(c, 'paid');
        S.bumpRep(t, 4, 'you made amends');
        this.say(line(SAY.amendsYes), [this.back()], null);
      } },
    ], this.back());
  }

  private confront() {
    const c = this.c!, p = this.p, tr = traitsOf(c);
    const k = 0.3 + (1 - tr.bravery) * 0.4 + (armed(p) ? 0.15 : 0) + (c.mem.spotted ? 0.2 : 0) - (roleOf(c) === 'thief' ? 0.1 : 0);
    if (Math.random() < k) { const n = returnLoot(c, p); bus.emit('think', p, n > 1 ? 'All of it. Back where it belongs.' : 'Back where it belongs.'); this.say(line(SAY.returnYes), [this.back()], null, 'emote:shrug'); return; }
    this.say(line(SAY.returnNo), [
      { text: 'Then I take it.', go: () => this.turn('Try it, then.') },
      this.back(),
    ], null, 'emote:shrug');
  }

  private gift(it: Item) {
    const c = this.c!, p = this.p, S = this.S, t = this.t;
    if (p.handR === it) p.equip(null, 'R');
    p.removeItem(it); bus.emit('inventoryChanged', p);
    pocketsOf(c).push(it);
    remember(c, 'gift');
    const v = itemValue(it);
    S.bumpRep(t, Math.max(1, Math.min(6, Math.round(v / 25))), 'a gift');
    if (c.tamedBy === p.id) shiftLoyalty(c, 8);
    this.say(line(SAY.giftThanks), [this.back()], null, 'emote:bow');
  }

  // ---------------------------------------------------------------- muggings and being caught
  private mugNode() {
    const c = this.c!, p = this.p, tr = traitsOf(c);
    const loot = stealables(p).sort((a, b) => itemValue(b) - itemValue(a));
    const top = loot[0];
    this.say(line(SAY.mug), [
      { text: top ? `Take it. Just take it. (${top.name || itemDef(top.key).name})` : 'Take it. Just take it.', say: 'Take it. Just take it.', go: () => {
        const give = loot.slice(0, 1 + (tr.greed > 0.8 ? 1 : 0));
        for (const it of give) { p.removeItem(it); (c.mem.loot ||= []).push(it); }
        bus.emit('inventoryChanged', p);
        if (give.length) bus.emit('think', p, `${memberName(c)} takes my ${give.map((it) => it.name || itemDef(it.key).name).join(' and ')}.`);
        const camp = campOf(c, G.getZone(c.zoneKey));
        if (camp) c.mem.getaway = { x: camp.x, z: camp.y, until: G.time + 40 };
        this.end(pick(['Smart.', 'Pleasure doing business.', 'See? Nobody bled.']), 'emote:salute');
      } },
      { text: "I've got nothing worth taking.", go: () => {
        if (Math.random() < 0.3 + (1 - tr.greed) * 0.3 - (loot.length > 6 ? 0.15 : 0)) this.end(pick(['Huh. Pathetic. Go on, then.', 'Not worth the knife. Move.']), 'emote:shrug');
        else this.turn(line(SAY.disbelieve));
      } },
      { text: 'Walk away while you still can.', go: () => {
        if (Math.random() < 0.18 + (armed(p) ? 0.3 : 0) + (1 - tr.bravery) * 0.4) { remember(c, 'fear'); this.end(pick(['...Not worth it.', 'Fine. Another day.', 'You got lucky.']), 'emote:shrug'); }
        else this.turn(line(SAY.threatRefuse));
      } },
      { text: '[Fight]', go: () => this.turn(pick(['Your choice.', 'Wrong answer.', 'Have it your way.'])) },
    ], { text: 'Run', go: () => this.turn('Run, then!') }, 'aim_melee');
  }

  private caughtNode() {
    const c = this.c!, S = this.S, t = this.t, p = this.p, tr = traitsOf(c), a = attitude(c), m = memOf(c);
    const fee = 25 + m.caught * 15, have = creditFor(S, t);
    this.say(pick(['Explain. Fast.', 'Well?', 'Talk. Before I shout.']), [
      { text: "I'm sorry. I'm desperate.", go: () => {
        if (Math.random() < tr.kindness * 0.6 + a / 150 + 0.1) { remember(c, 'sorry'); this.end(pick(['Get out of my sight.', 'Once. You get that once.']), 'emote:facepalm'); }
        else { this.turn(line(SAY.sorryNo), tr.temper > 0.5); }
      } },
      { text: 'I tripped. I was steadying myself.', go: () => {
        if (Math.random() < 0.35 - m.caught * 0.1 + (1 - tr.temper) * 0.15) { remember(c, 'caught', -1); remember(c, 'told'); S.bumpRep(t, 6, 'it was a misunderstanding'); this.end(pick(['...Watch your feet, then.', 'Mm. Clumsy.']), 'emote:shrug'); }
        else { remember(c, 'lie'); this.turn(line(SAY.disbelieve), true); }
      } },
      { text: `For your trouble. (${fee} scrip)`, why: have < fee ? `I only have ${have} scrip to offer` : undefined, go: () => {
        if (!payCredit(S, t, fee)) return;
        remember(c, 'paid'); remember(c, 'sorry');
        this.end(pick(["...Fine. We never spoke.", 'Bought and paid. Go.']), '');
      } },
      { text: 'Back off.', go: () => {
        if (Math.random() < 0.15 + (armed(p) ? 0.3 : 0) + (1 - tr.bravery) * 0.3) { remember(c, 'fear'); this.end(pick(['...Fine. Fine.', 'Just go.']), 'flinch'); }
        else this.turn(line(SAY.callThief), true);
      } },
    ], { text: 'Run', go: () => this.turn(line(SAY.callThief), true) }, 'aim_melee');
  }
}

// people the unit can talk to, for the world prompt ([E] Talk: Name · [G] Pickpocket)
export function talkTarget(p: Player): Creature | null {
  let best: Creature | null = null, bd = 2.5;
  for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) {
    if (c.dead || c.zoneKey !== p.zoneKey || !tribeOfCreature(c) || G.dominion?.isDowned?.(c)) continue;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
void TRIBE_KEYS;
