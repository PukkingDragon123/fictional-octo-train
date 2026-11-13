// The Plunge's inhabitants (round 17, src/world/gen/z_plunge.ts): the Gulper, its tadpoles,
// the frog piranhas and the balloon puffers. Field codex entries (src/creatures/lore.ts
// spreads them into INHABITANTS). Data only.
import type { InhabitantLore } from './lore';

export const POOL_INHABITANTS: InhabitantLore[] = [
  {
    id: 'gulper', name: 'Gulper', rank: 'wrath', class: 'Fauna', danger: 7,
    summary: 'A giant salamander four metres long and white as wet plaster, with a flush of pink: loose wrinkled skin hanging in folds down its flanks, stubby splayed legs, a long paddle of a tail, tiny pink eyes, and a flat broad head that is nearly all mouth.',
    biology: 'A cryptobranchid, the family of the giant salamanders, leucistic and grown far past anything recorded. It breathes through its skin: the loose folds along its flanks are a gill it wears on the outside, and it lies still in deep water for hours on the oxygen in them. The skull is flat and hinged so that the jaws open almost flat back on themselves; both are rimmed with rows of tiny backward teeth. It does not chew. It sucks in and gulps, and what goes in whole stays whole for a while: you can see it from outside, a bulge that moves. The eyes are almost useless. It feels the water move.',
    behaviour: 'It lies on the bottom of the deep end with only its nostrils and its eyes at the surface, two little bumps on still water. A unit at the edge of deep water, or in it, and it comes up out of the pool in one heave with the mouth wide and gulps them whole, holds them, and sinks back. Hit it hard enough, from inside or out, and it spits them out. It hardly ever leaves the water and it is slow on land.',
    habitat: 'The deep water of the Plunge: the wave pool\'s deep end, the diving pit, the balance tank.',
    lore: 'Lifeguard\'s log, the Plunge, the last page: "Deep end closed. Deep end closed. Do not stand at the edge of the deep end to look for it. That is how it looks for you." Calder: "Its tadpoles are all over the shallows. Somewhere there is a second one, or there was." Rank WRATH: it will kill you, but only at the water.',
    harvest: [
      { item: 'gulper_hide', how: 'Skin it: a soft white leather that sheds water.' },
      { item: 'gulper_meat', how: 'Butcher it: pale and sweet, braised.' },
      { item: 'gulper_tooth', how: 'Cut a row of its tiny teeth from the jaw rim.' },
    ],
  },
  {
    id: 'gulper_tadpole', name: 'Gulper Tadpole', rank: 'gluttony', class: 'Fauna', danger: 1,
    summary: 'Pale, big-headed tadpoles as long as a hand, every one with a little copy of the Gulper\'s mouth.',
    biology: 'The larvae of the Gulper, all head and mouth and a fluttering fin of a tail, the organs pink through the skin. Their mouths already have teeth. They grow quickly in warm shallow water, and a tadpole left alone long enough is a great deal bigger than one that is not.',
    behaviour: 'They swarm the shallows in little shoals and nibble any legs that come into the water: harmless one at a time, worrying in a crowd. They never leave the water. Step out of it and they lose interest.',
    habitat: 'The Plunge\'s shallows (the wave pool\'s beach, the toddler pool); a few have got into the Poolrooms.',
    lore: 'Painted on the toddler pool\'s rim, under NO PETS: NO FEEDING THE TADPOLES. Somebody fed them.',
    harvest: [{ item: 'tadpole_meat', how: 'Scoop one up. Fry it.' }],
  },
  {
    id: 'frog_piranha', name: 'Frog Piranha', rank: 'gluttony', class: 'Fauna', danger: 3,
    summary: 'A piranha with a jutting underbite of triangular teeth and a pair of long, muscular frog hind legs folded under its tail.',
    biology: 'A serrasalmid, deep-bodied and silver with a red throat, that has grown the hind legs of a frog where its pelvic fins should be: thigh, shin and a long webbed foot. It swims by kicking them, and it can leap from the water in an arc as long as a car and hop across wet tile. It cannot breathe out of water for long.',
    behaviour: 'It leaps out of the water at anything near the edge, hops after it across the tile, bites once or twice and then must go back in. A few metres from any water and it cannot follow you for long.',
    habitat: 'Any water in the Plunge; the Poolrooms.',
    lore: 'Lifeguard\'s log: "They come out of the water at you like a sprung trap. One went down the flume. I heard it hopping the whole way down."',
    harvest: [
      { item: 'frog_leg', how: 'Butcher it: two good legs, grilled.' },
      { item: 'piranha_jaw', how: 'Cut out the underbite with its teeth.' },
    ],
  },
  {
    id: 'balloon_puffer', name: 'Balloon Puffer', rank: 'sloth', class: 'Remnant', danger: 1,
    summary: 'A pufferfish made of a party balloon, latex shining, the knot at its tail and its string trailing, drifting at head height over the pools, with two real human eyeballs in it that will not keep still.',
    biology: 'A balloon, as far as anyone can tell: latex, a knotted neck, a curl of ribbon, filled with something warmer and lighter than air. The eyes are human, wet and veined, set in the latex with no socket behind them and nothing to connect to, and they work. Puffed up, it stands its latex spines on end. It weighs almost nothing.',
    behaviour: 'It drifts over the water, harmless and watching. Run at it or make a loud noise near it and it puffs up with a rubber squeak. If you are still right beside it then, or if you hit it, it pops with a bang that carries through the whole place and brings everything in the water. Back away and it lets its air out with a long squeal and darts off instead. Walk past slowly.',
    habitat: 'The air over the Plunge and the Poolrooms.',
    lore: 'Party bags from the Plunge\'s birthday room (closed) list PUFFER BALLOON x1 per guest. Calder: "I have asked the lab not to ask whose eyes they are."',
    harvest: [
      { item: 'puffer_latex', how: 'Collect the latex after it pops.' },
      { item: 'puffer_eye', how: 'Pick up the eyes. Try not to think about it.' },
      { item: 'balloon_string', how: 'Wind up the string.' },
    ],
  },
];
