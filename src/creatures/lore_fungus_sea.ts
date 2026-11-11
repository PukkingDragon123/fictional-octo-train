// The damp levels' inhabitants (round 15): the Fungus Mind and its network, the
// Spore Rats it hatches, the Bacteria Mass, the Land Jellyfish, the Whale
// Corpse and the Sea Worms that live in it and around it. Field codex entries
// (src/creatures/lore.ts spreads them into INHABITANTS). Data only.
import type { InhabitantLore } from './lore';

export const FUNGUS_SEA_INHABITANTS: InhabitantLore[] = [
  {
    id: 'fungus_mind', name: 'Fungus Mind', rank: 'greed', class: 'Sovereign', danger: 7,
    summary: 'A fungal fruiting body the size of a small car, rooted in the floor of a damp room: black, glistening, folded like a brain, and beating. Pale cords run out from it across the floors and up the walls of the rooms around it.',
    biology: 'What you see is the smallest part of it. The Mind is the fruiting heart of a mycelium that fills the concrete for tens of metres around: thumb-thick cords (rhizomorphs) carry water and signals; white felt mats spread where they branch; and at every junction there is a node, a cluster of ink caps and bracket shelves round a pitted puffball sac. The cortex-like folds of the Mind are gills turned outward. The beat is real: it pumps fluid through the cords, and you can feel it through the soles of your boots. The violet light in its veins is a bioluminescence that rises when it is roused. Under the rind, the tissue is grey and wet and smells of cellars and yeast.',
    behaviour: 'It never moves. It grows, a few metres a day, a new node at a time, mostly outward from its tips. The nodes feel footsteps on the felt: a unit walking over the network fires a node, a pulse of light runs back along the cords to the Mind, and the Mind answers. It throbs, it breathes a cloud of spores out of the node that fired, it wakes everything that lives nearby (they come to look), and it hatches Spore Rats out of its nodes to run the intruder down. A unit that crouches and walks slowly barely registers. Standing beside the Mind, you will be lashed with the two rhizomorphs that lie coiled in front of it. Cut the network and it weakens: a dead node kills every node grown beyond it, and with most of its network gone the Mind\'s rind splits along the fissure and it can be hurt.',
    habitat: 'Damp, dark rooms in the wet levels: the Undercroft, the chambers off the service tunnels, the pump plant in the Poolrooms.',
    lore: 'The tunnel crews called the first one "the Bishop" and left it alone for two years; the floor of Boiler Room 3 was felted white for thirty metres and nobody went in. Dr. Calder\'s survey unit cut one cord and filmed the light run back along it to the Mind, a slow violet pulse, like a nerve. "It is not thinking," Calder wrote. "But it is paying attention, and it is never not paying attention." Rank GREED: it claims ground, and it keeps it.',
    harvest: [
      { item: 'mind_tissue', how: 'Cut grey tissue from under the rind of a dead Mind.' },
      { item: 'spore_sac', how: 'Take the puffball sacs off it, or off its nodes, before they burst.' },
      { item: 'mycelium_felt', how: 'Peel felt off the floor round a node.' },
    ],
  },
  {
    id: 'fungus_node', name: 'Mind Node', rank: 'sloth', class: 'Sovereign', danger: 2,
    summary: 'A knot of a Fungus Mind\'s network: a cluster of ink caps and bracket fungi round a grey, pitted puffball, on a mat of white felt, on the floor or shelved up a wall.',
    biology: 'Each node is a junction of the cords. The puffball is a pressure organ: it swells on the Mind\'s beat and empties when the Mind tells it to, as spores. The caps are not for show: they feel vibration through their stems, and that is how the network hears you walking. Nodes grown on walls hang from their bracket shelves with their stems curling up toward the light.',
    behaviour: 'It cannot hurt you, except with spores. It feels footsteps on its felt and signals the Mind, and the Mind answers through it. Killed, it cuts the network: every node the Mind grew beyond it withers over the next few seconds, hop by hop, and the Mind is weaker for it.',
    habitat: 'Wherever a Fungus Mind has spread: floors and walls of the rooms around it.',
    lore: 'Field note, Dr. Calder: "The network is a tree. Cut near the root and the whole branch dies. Go for the nodes nearest the Mind first." The units call cutting a network "pruning", and they hate it, because every node you cut breathes spores at you.',
    harvest: [
      { item: 'ink_cap', how: 'Pick the caps: edible young, ink if you wait.' },
      { item: 'spore_sac', how: 'Twist the puffball off whole.' },
      { item: 'mycelium_felt', how: 'Peel the felt it sits on.' },
    ],
  },
  {
    id: 'spore_rat', name: 'Spore Rat', rank: 'wrath', class: 'Parasite', danger: 4,
    summary: 'A big sewer rat grown through with mycelium: felt bursting through its fur in patches, a cap where its left eye was, and a crest of mushrooms standing up out of its back.',
    biology: 'The fungus enters young rats through the eye and grows along the spine, and from then on the rat is the fungus\'s legs. It still eats and breeds like a rat; it also feeds the network, carrying spores in its fur from node to node. The crest caps are packed with spores under pressure. When the rat dies the caps split and the spores go up in a cloud that irritates the lungs and the mind alike: units in a spore cloud cough, lose their breath and feel the edges of things go soft.',
    behaviour: 'They live on a Fungus Mind\'s network and hatch from its nodes when the network feels a unit. A pack spreads round its prey, each rat taking its own line, and darts in to bite ankles, then darts out again and circles. They scavenge the dead when there is nothing to hunt. Fire turns a pack. Kill them at arm\'s length, or step out of the cloud after.',
    habitat: 'Around a Fungus Mind\'s network; strays in the damp levels (the Undercroft, the service tunnels, the Poolrooms).',
    lore: 'A tunnel worker\'s note, pinned to a pump: "DO NOT STAMP ON THEM. We stamped on them. Marcus coughed for three days and kept saying the walls were breathing." The Institute had the note framed.',
    harvest: [
      { item: 'rat_cap', how: 'Cut the crest caps off a dead one (carefully: they are full of spores).' },
      { item: 'meat_raw', how: 'Butcher it. Cook it well.' },
    ],
  },
  {
    id: 'bacteria_mass', name: 'Bacteria Mass', rank: 'gluttony', class: 'Swarm', danger: 6,
    summary: 'A crawling heap of glistening yellow-grey slime the size of an armchair, crusted with rings of colour, blistered, and full of people: one with its face pressed up under the surface, one curled up inside like a sleeper.',
    biology: 'It is a colony: billions of bacteria in a slime they make together, with crusts of other colonies growing on its skin in rings of yellow, green and pink. It has no organs; it digests from the outside in, and what it takes in comes apart slowly enough to watch. The bodies in it are units and debtors who died in its range. Their legs and fingers go first. One arm of the one near the surface still grasps at the floor, which is reflex, says the Institute, and nothing else.',
    behaviour: 'It eats the dead: it crawls to corpses and remains, flows over them and takes them in, and grows. Grown big enough, it pinches itself in two. It leaves the living alone unless you stand in it, hurt it, or lie bleeding on the floor in front of it, which is the same as dead to it; then it comes for you, slowly, and what it touches burns and sticks. It recoils from fire. Heavy blows knock lumps off it and it shrinks.',
    habitat: 'Where the dead lie: the Undercroft, the service tunnels, the hospital\'s lower floors, the car parks.',
    lore: 'Dr. Calder asked for a sample of the Mass to be cultured in the lab. The culture was destroyed the next morning, by order, after a technician reported that the dish had "made a face". Calder\'s note on the file: "It does not make faces. It keeps them."',
    harvest: [
      { item: 'culture_jelly', how: 'Scoop the colony slime into a jar from a dead Mass.' },
      { item: 'bone', how: 'Search what is left of the bodies in it.' },
    ],
  },
  {
    id: 'land_jelly', name: 'Land Jellyfish', rank: 'lust', class: 'Fauna', danger: 5,
    summary: 'A clear jellyfish bell held up off the floor on eight long tentacles it walks on like legs, and climbs on: up walls, along ceilings. Under the bell four frilled mouth-arms hang round a mouth that sucks.',
    biology: 'A jellyfish that left the Poolrooms\' water and kept going. The tentacles have thickened into walking limbs, still armed with stinging cells along their rings, and grip any surface by suction, which is how it hangs from a ceiling. The bell no longer swims, but it still pumps, slowly, out of habit; it pumps hard when it feeds. It feeds on blood, which it draws through the skin of the face by suction and enzymes. The stomach shows through the bell: clear when it is hungry, red when it is not. Eight sense-knobs round the rim glow faintly blue in the dark.',
    behaviour: 'It climbs to the ceiling over the places people walk and waits, upside down. Whoever passes under it, it drops on: the bell over the face, the tentacles round the skull, and it drinks until it is full or until it is torn off. On the floor it rears its tentacles if you come close, stings if you touch it, and, hungry, leaps for your face. Knocked off, or hit while it is up high, it falls and crawls for the nearest wall. In tall rooms with no ceiling to walk on, it waits high on the wall instead.',
    habitat: 'The Poolrooms\' halls and changing rooms, the wet service tunnels, the Undercroft; anywhere damp with a ceiling.',
    lore: 'Lifeguards\' log, Poolrooms Station 2: "Found another one on the ceiling over the showers. Knocked it down with the pole. It went for the wall like a spider. Remember: LOOK UP before you go in. If it gets you, do not pull straight. Peel it from the edge." The log ends a week later.',
    harvest: [
      { item: 'jelly_bell', how: 'Take the bell off a dead one. Edible, cooked.' },
      { item: 'stinger_thread', how: 'Cut the tentacles. Gloves.' },
    ],
  },
  {
    id: 'whale_corpse', name: 'Whale Corpse', rank: 'sloth', class: 'Carrion', danger: 3,
    summary: 'A rorqual whale, fourteen metres long, dead on dry tile where there has never been a sea: rolled half on its side, a flipper raised in the air, the lower jaw dropped open on the baleen, the flank opened to the ribs. Giant Sea Worms live coiled in its ribs.',
    biology: 'It has been dead a long time, and it is still rotting: there is enough of it to rot for years. The throat pleats are blown up with gas; the skin comes off in grey sheets; the blubber under it is a hand thick and good for lamp oil. The flank was opened from the outside, cleanly, by something nobody has seen. Inside, in the dark red cavity, the Sea Worms that came with it have grown to two and a half metres. They breed in the warm rot and keep the carcass as a nest.',
    behaviour: 'The carcass does nothing. The worms in it do. Come up to the open ribs, run alongside it, hit it, or cut at it, and the carcass heaves (that is them, all moving at once) and the worms come out of the hole together and hunt whoever disturbed them for a while before they go back in. Walk softly round it, crouched, and they stay coiled.',
    habitat: 'The Poolrooms\' drained Dry End; the flooded floor of the Undercroft, where the tide line runs round the pillars at the height of a whale.',
    lore: 'Nobody knows how it got here. Dr. Calder: "The tide line in the Undercroft is two metres up the pillars. Something brought a sea down here once, and took it away again, and left this." The Institute logs two whales; the debtors\' tallies on the Undercroft pillars count three. Rank SLOTH: it will not come to you. What lives in it will.',
    harvest: [
      { item: 'whale_blubber', how: 'Cut it from the flank. Render it for oil, or eat it.' },
      { item: 'whale_meat', how: 'Cut the dark meat from under the blubber.' },
      { item: 'whale_rib', how: 'Saw out a rib (it takes a long time, and it is loud).' },
      { item: 'baleen_plate', how: 'Pull plates of baleen from the upper jaw.' },
      { item: 'ambergris', how: 'Search the gut. Rarely, there is ambergris. It is worth a great deal.' },
    ],
  },
  {
    id: 'sea_worm', name: 'Sea Worm', rank: 'gluttony', class: 'Fauna', danger: 3,
    summary: 'A bristle worm a metre long that runs on twelve pairs of fringed paddle-legs, with an oil-sheen on its ringed back and a proboscis it turns inside out to bite with two black hooked jaws. Giants, two and a half metres long, nest in the Whale Corpse.',
    biology: 'A polychaete, like the ragworms on any beach, made large. Its paddle-legs (parapodia) row in waves down each side, which lets it run faster than a unit on a straight floor. It breathes through the legs; it dries out slowly and seeks wet places. The jaws are chitin, hooked and black, and the proboscis that carries them turns out of the head in a fraction of a second. The giants are the same animal, older and better fed.',
    behaviour: 'Free sea worms are scavengers: they find remains by smell, strip them and move on. A lone worm runs from a unit; a few at a meal will nip at your ankles to drive you off it, and they will come for a unit bleeding on the floor. The giants guard the whale and hunt together when it is disturbed, then return to the ribs.',
    habitat: 'The Poolrooms (the Dry End above all), the Undercroft, the wet service tunnels; the Whale Corpse.',
    lore: 'Lifeguards\' log, Poolrooms: "They came in with the whale. Before the whale we had no worms. Now we have worms." Dr. Calder has asked twice for a giant to be brought back alive, and twice been told no.',
    harvest: [
      { item: 'worm_meat', how: 'Butcher it: pale, rubbery, edible cooked.' },
      { item: 'worm_jaw', how: 'Pull the two black jaws from the proboscis.' },
      { item: 'bristle_tuft', how: 'Cut the bristle fans from the legs.' },
    ],
  },
];
