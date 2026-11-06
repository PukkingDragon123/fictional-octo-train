// The studyable world anomalies: what the codex (src/game/codex.ts ANOMALIES, the
// research lab's benches) and the archive (src/ui/menus/rooms/archiveData.ts) list,
// and what the anomaly system (src/world/anomalies/index.ts) runs in the world.
// Pure data: no imports, safe for node tools (scripts/zonecheck.mjs).
//
// Each one has a presence in a level (`zone`, the fixture `obj` it is built
// around), a way to study it (scan the fixture with the watch; take a sample of
// kind `sample` from it at the fixture's menu), codex notes (opened by research),
// a readable field note (`lore`, src/content/lore/zl_anomaly_lore.ts) left near it,
// and its own behaviour (src/world/anomalies/behave.ts).
export type AnomSample = 'tissue' | 'fluid' | 'spores' | 'residue';
export type AnomTool = 'dart' | 'pinger' | 'lure' | 'foam' | 'filter' | 'inhaler' | 'kit2';

export interface WorldAnomaly {
  /** codex key is 'anom:' + key */
  key: string;
  name: string;
  code: string;
  cls: string;
  threat: number;
  /** the research tool completing the entry issues */
  tool: AnomTool;
  /** codex notes, opened in order by research */
  notes: string[];
  /** where it is ('ledge' is a whole level) */
  zone: string;
  /** the level's display name, for the archive */
  where: string;
  /** the fixture it is built around (an object key: the archive can project it with buildObjGeometry) */
  obj: string;
  /** what the sample kit takes from it */
  sample: AnomSample;
  /** the verb on the fixture's menu */
  sampleVerb: string;
  /** samples one fixture gives before it is spent */
  samples: number;
  /** the field note left near it (defLore id) */
  lore: string;
  /** one line on how to study it (archive / watch) */
  study: string;
  /** what it does, in a sentence (archive "Behaviour" page) */
  behaviour: string;
}

export const WORLD_ANOMALIES: WorldAnomaly[] = [
  {
    key: 'ledge', name: 'Thermoplastic Drift', code: 'AN-07 // THE LEDGE', cls: 'Regional phase anomaly', threat: 3, tool: 'filter',
    zone: 'ledge', where: 'The Ledge', obj: 'lg_wax_heap', sample: 'residue', sampleVerb: 'Scrape a sample of the melt', samples: 3, lore: 'lg_survey_log',
    notes: [
      'A far shelf of the backrooms where the architecture is warm all the way through. Walls bow, ceiling tiles drip, furniture slumps into puddles of itself.',
      'Anything left lying there softens within minutes and melts in a few more. Melted goods keep their weight and lose their worth.',
      'Exposure raises core temperature and wears down lucidity. Taped seams, a respirator, a filter and survey foil all slow it. Nothing stops it.',
      'It is not heat. Thermometers read 31 degrees. It is the place forgetting how hard things were supposed to be.',
    ],
    study: 'Scan any slumping fixture. Scrape the melt heaps, or bring a lump of Ledge wax home.',
    behaviour: 'Melts what is left in it. Overheats and unmoors the unit the longer it stays.',
  },
  {
    key: 'updrip', name: 'Upward Rain', code: 'AN-08 // INVERSION', cls: 'Localised gravity inversion', threat: 1, tool: 'kit2',
    zone: 'pools', where: 'The Poolrooms', obj: 'an_updrip', sample: 'fluid', sampleVerb: 'Draw a sample of the rising water', samples: 2, lore: 'an_updrip_note',
    notes: [
      'A drain in the Poolrooms where the water falls up. It leaves the grate in beads and gathers on the ceiling tiles above it.',
      'Small objects left on the grate rise with it and are held overhead for under a minute. Then they are let go.',
      'What comes back down is restored: dents out, rust gone, Ledge melt undone. It always comes back wet.',
      'The water is ordinary chlorinated pool water, about six seconds older than it should be.',
    ],
    study: 'Scan the grate. Draw a sample from the column of rising beads.',
    behaviour: 'Lifts what is dropped on it to the ceiling and gives it back repaired.',
  },
  {
    key: 'noon_lamp', name: 'The Noon Lamp', code: 'AN-09 // DAYLIGHT', cls: 'Luminous fixture', threat: 0, tool: 'inhaler',
    zone: 'house', where: '14 Alder Lane', obj: 'an_noon_lamp', sample: 'residue', sampleVerb: 'Swab the bulb', samples: 2, lore: 'an_noon_note',
    notes: [
      'A brass floor lamp in a bedroom of 14 Alder Lane. The bulb gives off daylight: noon, a clear sky, at every hour.',
      'Inhabitants will not stand in its light. They back out of it like people leaving a room they were not invited into.',
      'Units under it calm down. Heart rate drops, panic stops climbing. Two of them fell asleep standing up.',
      'The bulb is cold to the touch. The filament is shaped like a child\'s drawing of the sun.',
    ],
    study: 'Scan the lamp. Swab the residue off the bulb glass.',
    behaviour: 'Its light keeps inhabitants out and lets the unit breathe.',
  },
  {
    key: 'echo_phone', name: 'The Callback', code: 'AN-10 // RETURN CALL', cls: 'Acoustic recurrence', threat: 1, tool: 'pinger',
    zone: 'parking', where: 'Parking Level P∞', obj: 'an_payphone', sample: 'residue', sampleVerb: 'Swab the handset', samples: 2, lore: 'an_callback_note',
    notes: [
      'A payphone on a concrete island in Parking Level P∞. It rings once someone has been on the level a while.',
      'The caller is you: your own voice from a few minutes back, saying what you said then.',
      'Stay on to the end of the call. The voice knows which way you came in, and it is usually right.',
      'The handset is warm and smells of breath. The coin box is full of coins nobody here ever spent.',
    ],
    study: 'Scan the phone. Swab the handset after a call, while it is still warm.',
    behaviour: 'Rings, plays the unit back to itself, and points the way it came in.',
  },
  {
    key: 'snow_globe', name: 'The Small Level', code: 'AN-11 // MINIATURE', cls: 'Scale-folded enclosure', threat: 2, tool: 'foam',
    zone: 'mall', where: 'Westgate Mall', obj: 'an_snow_globe', sample: 'fluid', sampleVerb: 'Draw a drop from the seam', samples: 1, lore: 'an_globe_note',
    notes: [
      'A snow globe as tall as a unit in Westgate Mall. Inside it: a small yellow room, carpet and all, and a small figure.',
      'The figure walks when you walk and stops when you stop. It has your number on its back.',
      'Shaking the globe shakes the level. Inhabitants nearby lose their footing for a few seconds. So does the unit, in the head.',
      'The fluid inside is Level 0 air, pressed into a liquid. The snow is ceiling-tile flakes.',
    ],
    study: 'Scan the globe. It weeps one drop at the seam of its base: draw it.',
    behaviour: 'Copies the unit in miniature. Shaken, it knocks every inhabitant nearby off its feet.',
  },
  {
    key: 'hungry_carpet', name: 'The Swallowing Patch', code: 'AN-12 // APPETITE', cls: 'Carnivorous floor covering', threat: 1, tool: 'lure',
    zone: 'lobby', where: 'Level 0', obj: 'an_carpet_mouth', sample: 'tissue', sampleVerb: 'Cut a sample of the fibre', samples: 2, lore: 'an_carpet_note',
    notes: [
      'A whorl of yellow carpet in Level 0, raised like a lip around a damp middle. It is warm, and it breathes.',
      'Anything dropped on it sinks in over a few seconds. A while later it spits something else back out.',
      'It trades, and roughly fairly. It has never given back the thing it took.',
      'The fibre is living tissue: keratin, a slow pulse, carpet glue where the blood should be.',
    ],
    study: 'Scan the whorl. Cut a little of the lip: it flinches.',
    behaviour: 'Swallows what is dropped on it and spits up something else.',
  },
  {
    key: 'patient_chair', name: 'The Patient Chair', code: 'AN-13 // ATTENTION', cls: 'Attentive furniture', threat: 2, tool: 'dart',
    zone: 'office', where: 'Level 4 — Meridian Offices', obj: 'an_patient_chair', sample: 'residue', sampleVerb: 'Scrape the upholstery', samples: 2, lore: 'an_chair_note',
    notes: [
      'An office chair on Level 4. Wherever you stand, it turns to face you, and it creaks while it does.',
      'Sit in it and lose two hours. You come to standing up somewhere else on the floor, rested and not quite yourself.',
      'It has been reupholstered eleven times. The foam underneath has a shape, and the shape is sitting.',
      'It turns faster for people it has held before.',
    ],
    study: 'Scan the chair while it turns. Scrape the seat.',
    behaviour: 'Watches the unit. Sitting in it takes two hours and puts the unit somewhere else.',
  },
];

/** fixture object key -> anomaly key (the Ledge's slumping fixtures all count as the Ledge) */
export const ANOMALY_OBJ: Record<string, string> = Object.fromEntries(WORLD_ANOMALIES.map((a) => [a.obj, a.key]));
for (const k of ['lg_wax_column', 'lg_wax_puddle', 'lg_slump', 'lg_sag_tube', 'lg_drip_sign']) ANOMALY_OBJ[k] = 'ledge';
export const worldAnomaly = (key: string) => WORLD_ANOMALIES.find((a) => a.key === key);
