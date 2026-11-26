// The Halcyon's job on Dr. Calder's board (src/world/gen/z_hotel.ts): the third
// floor is furnished in brass and silver, and the press in its linen room takes
// all of it. Find the press, feed it the hotel, and scan the thing that keeps the
// corridor (src/creatures/species/unclaimed.ts). Pays research points; every
// credit pressed goes off the unit's debt the usual way (src/game/debt).
import { bus } from '../core/events';
import { G } from '../game/G';
import { op } from '../game/ops';
import { defQuest } from '../game/quests';
import type { QuestX, QuestRuntime, QWhere } from './questRuntime';
import { has, count } from './missions';
import type { Zone } from '../world/zone';

const Q = () => G.missions?.quests as QuestRuntime | undefined;
const T = (c: string) => Q()?.tally(c) ?? 0;
const B = (k: string, c: string) => Q()?.base(k, c) ?? 0;
const GOAL = 600;

// the press is host business: count what is pressed on this floor (credits) and the brass and silver
bus.on('deposited', (e: { by?: string; value?: number; keys?: string[] }) => {
  if (G.role === 'client' || !e) return;
  const p = e.by ? G.players.get(e.by) : null;
  if (!p || p.zoneKey !== 'hotel') return;
  if (e.value) op('qtally', { c: 'ht_dep', d: Math.round(e.value) });
  const furn = (e.keys || []).filter((k) => k.startsWith('ht_') || k === 'furniture').length;
  if (furn) op('qtally', { c: 'ht_furn', d: furn });
});

/** the press in the linen room */
const linenPress = (): QWhere | null => {
  const z = G.zones.get('hotel'); if (!z) return null;
  for (const o of z.objects.values()) if (o.key === 'hopper') return { zone: 'hotel', x: o.x + 1, z: o.y + 1, label: 'PRESS' };
  return null;
};

// ================================================================ the clearance: the Institute has to let the unit in
// A long way in: the first installment on the ledger, five inhabitants on file, three data records read.
// Then the Clearance Office issues the card, and the card has to be swiped at the reader beside the door
// (stairwell landing 3, or the lift in the car park). Readers show the state with their lamp and padlock.
const clearance: QuestX = {
  key: 'ht_clearance', title: 'Clearance: Halcyon 3', giver: 'MERIDIAN CLEARANCE OFFICE', category: 'side', voice: 'radio',
  requires: ['first_haul'],
  desc: 'The third floor of the Halcyon is Institute property. Units go up there on the Institute\'s say-so only: a paid installment, a field record, data on file. Earn it and the Clearance Office issues the card; the readers do the rest.',
  objectives: [
    { id: 'pay', text: 'Put the first installment on the ledger', check: has('contract:installment:1') },
    { id: 'scan', text: 'Five inhabitants on file (scanner)', check: (m) => count('scan:', 5)(m) },
    { id: 'data', text: 'Three data records read', check: (m) => count('read:', 3)(m) },
  ],
  reward: { rp: 2, items: [['ht_auth_card', 1]] },
  outro: 'CLEARANCE ISSUED. HALCYON 3. SWIPE AT THE READER.',
};
defQuest(clearance);

/** the readers' lamps follow the clearance (host): red and shut until the card is swiped, then green and open */
const syncReaders = (z: Zone | undefined) => {
  if (!z || G.role === 'client' || !G.missions?.flags?.has('unlock:ht_authorized')) return;
  for (const o of z.objects.values()) if (o.key === 'ht_reader' && !o.state.ok) op('objState', { z: z.key, uid: o.uid, patch: { ok: 1 } });
};
bus.on('flag', (k: string, on: boolean) => { if (k === 'unlock:ht_authorized' && on) for (const zk of ['stairwell', 'parking']) syncReaders(G.zones.get(zk)); });
bus.on('enterZone', (z: Zone) => { if (z && (z.key === 'stairwell' || z.key === 'parking')) syncReaders(z); });

const quest: QuestX = {
  key: 'ht_checkout', title: 'Late Checkout', giver: 'DR. CALDER', category: 'contract', voice: 'handler',
  requires: ['flag:visit:hotel', 'ht_clearance'],
  desc: 'The Halcyon\'s third floor is furnished in brass and silver, and there is a press in the linen room that takes all of it. Trolleys, luggage carts, the chandelier if you can get it down. Feed it the hotel. And scan whatever is ringing that bell: R&D wants it on file before it adds you to its luggage.',
  intro: 'There is a press in the linen room on that floor. Use it. And when you hear a bell, get off the carpet.',
  begin: () => ({ dep: T('ht_dep'), furn: T('ht_furn') }),
  objectives: [
    { id: 'linen', text: 'Find the press in the linen room', check: (m) => m.flags.has('room:hotel:linen') },
    { id: 'press', text: `Press ${GOAL} credits of the Halcyon`, check: () => (T('ht_dep') - B('ht_checkout', 'dep')) / GOAL },
    { id: 'piece', text: 'Press a trolley or a luggage cart whole', check: () => T('ht_furn') - B('ht_checkout', 'furn') >= 1 },
    { id: 'scan', text: 'Scan the Unclaimed', check: (m) => m.flags.has('scan:unclaimed') },
  ],
  where: linenPress,
  reward: { rp: 6 },
  outro: 'The bell stopped for a moment while the press was running. Then it started again, one corner further on.',
};
defQuest(quest);
