// Steam achievements: the list Steamworks gets (steam/achievements.csv is generated from this file by
// `node scripts/steam-ach.mjs`; keep this file free of imports so the script can read it).
// The API names are what Steamworks stores: never rename one after the app is live.
// How each is earned lives in src/platform/steam.ts (game events on the bus).

export interface SteamAchDef { api: string; name: string; desc: string; hidden?: boolean }

export const STEAM_ACHIEVEMENTS: SteamAchDef[] = [
  { api: 'ACH_FIRST_LINK', name: 'First Link', desc: 'Link into your first unit and walk it through the wall.' },
  { api: 'ACH_DEAD_AIR', name: 'Dead Air', desc: 'Answer Dr. Calder\'s first signal.' },
  { api: 'ACH_FIRST_CRAFT', name: 'Bench Work', desc: 'Craft your first item.' },
  { api: 'ACH_FIRST_SCAN', name: 'First Look', desc: 'Scan your first inhabitant.' },
  { api: 'ACH_CENSUS', name: 'Complete Census', desc: 'Scan every inhabitant on file.' },
  { api: 'ACH_CUSTODY', name: 'Chain of Custody', desc: 'Bring a sample back to the lab.' },
  { api: 'ACH_UNIT_LOST', name: 'Unit Lost', desc: 'Lose your first unit.' },
  { api: 'ACH_CLONE_REVIVE', name: 'Spare Body', desc: 'Walk out of the clone vat after a death.' },
  { api: 'ACH_LAB_FIRST', name: 'Facilities Management', desc: 'Build your first lab station.' },
  { api: 'ACH_LAB_ARCHIVE', name: 'Records Office', desc: 'Build the codex archive.' },
  { api: 'ACH_LAB_LATTICE', name: 'Lattice Work', desc: 'Build the research lattice.' },
  { api: 'ACH_LAB_FRIDGE', name: 'Cold Chain', desc: 'Build the sample fridge.' },
  { api: 'ACH_LAB_TALENT', name: 'Gifted', desc: 'Build the talent bench.' },
  { api: 'ACH_LAB_PRINTER', name: 'Print Shop', desc: 'Build the filament maker and the printer.' },
  { api: 'ACH_LAB_CLONE', name: 'Vat Grown', desc: 'Build the clone vat.' },
  { api: 'ACH_LAB_ALL', name: 'Fully Equipped', desc: 'Build every station in the lab.' },
  { api: 'ACH_RESEARCH', name: 'Grant Approved', desc: 'Research your first node on the lattice.' },
  { api: 'ACH_CODEX', name: 'Peer Reviewed', desc: 'Research a codex entry to 100%.' },
  { api: 'ACH_BUILD', name: 'Squatter\'s Rights', desc: 'Weld your first piece of a camp in the backrooms.' },
  { api: 'ACH_UPGRADE', name: 'Home Improvement', desc: 'Upgrade a piece of your camp.' },
  { api: 'ACH_HARVEST', name: 'Grow Op', desc: 'Harvest a crop you planted.' },
  { api: 'ACH_COOK', name: 'Staff Canteen', desc: 'Cook and plate a dish.' },
  { api: 'ACH_TAME', name: 'Pet Policy', desc: 'Tame an inhabitant.' },
  { api: 'ACH_SURGEON', name: 'Field Surgeon', desc: 'Stitch a wound shut.' },
  { api: 'ACH_JACKPOT', name: 'Jackpot', desc: 'Hit a jackpot at the Remittance Press.' },
  { api: 'ACH_PAID', name: 'Paid in Full', desc: 'Clear a unit\'s debt.' },
  { api: 'ACH_WAY_OUT', name: 'Way Out', desc: 'End a run alive.' },
  { api: 'ACH_FACILITY', name: 'Off the Map', desc: 'Find a hidden facility.', hidden: true },
  { api: 'ACH_NOISE', name: 'Noise Complaint', desc: 'Kill a Driller.', hidden: true },
  { api: 'ACH_HR', name: 'HR-Compliant', desc: 'Survive two days without killing anything.' },
];
