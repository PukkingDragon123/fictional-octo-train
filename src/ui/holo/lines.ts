// What the BAILIFF says. Cold, corporate, billing everything; now and then it
// says something it should not. `{n}` style fields are filled by holo.ts.

export const BOOT_LINES = [
  'Bailiff unit seated. Vascular lock confirmed.',
  'Welcome to the Remittance Programme, debtor {id}.',
  'Your liability is {owed} scrip. Removal of this unit will be treated as default.',
];

/** state lines by moodle key, worst level first is chosen by the caller */
export const STATE: Record<string, string[]> = {
  hunger: ['Caloric intake below remittance standards.', 'Nutritional arrears noted.', 'You are consuming yourself. This is not a payment method.'],
  thirst: ['Hydration below remittance standards.', 'Fluid reserves non-compliant. Drink.', 'Dehydration reduces collectable value.'],
  fatigue: ['Rest deficit detected. Productivity forecast revised.', 'Sleep debt accruing. Interest applies.'],
  bleeding: ['Fluid loss detected. Asset depreciating.', 'Haemorrhage. Apply pressure. Apply it now.', 'You are leaking. Leaking is not authorised.'],
  pain: ['Pain response logged. Pain is not billable.', 'Nociception elevated. Continue working.'],
  panic: ['Heart rate exceeds contractual tolerance.', 'Elevated fear response. Breathe, debtor.'],
  attack: ['Cardiac irregularity. Please do not die in arrears.', 'Breathe in. Hold. Breathe out. This advice is free.'],
  cold: ['Core temperature non-compliant.', 'Thermal deficit. Seek heat.'],
  hot: ['Thermal surplus. Shed layers.', 'You are overheating. The unit is not.'],
  sick: ['Gastric rejection logged.', 'Contents of stomach: rejected.'],
  fever: ['Septic event. Liability transferred to you.', 'Infection detected. Treat the wound. Treatment is not covered.'],
  lucidity: ['Perception drift. What you see is not on the inventory.', 'Reality index falling. Remain billable.'],
  corruption: ['Data integrity... integrity... integrity.', 'Your file is corrupting. Remain still.'],
  injured: ['Asset damage recorded.', 'Structural damage. Value reduced.'],
  lonely: ['Isolation noted. The unit is listening. The unit is always listening.'],
  exhaust: ['Output ceiling reached. Recover.'],
};

export const CREATURE = [
  'Unregistered biomass nearby.', 'Proximity alert. Do not engage uninsured.', 'Something is reading your heartbeat. It is not me.',
  'Movement. Not yours.', 'Hold still. It hears the band.',
];

export const DEPOSIT = [
  'Remittance accepted. {value} scrip credited.', 'Deposit verified. {value} scrip. Balance outstanding: {owed}.',
  'Credited. {value}. The Institute thanks your furniture.', 'Accepted. Keep breaking things, debtor.',
];
export const CLEARED = ['Debt cleared. Transport purchase authorised.', 'Account settled. You may now purchase your way out.'];
export const DUE_SOON = ['Installment due in {h} hours.', 'Reminder. {due} scrip due in {h} hours.', 'Next installment approaching. {h} hours.'];
export const OVERDUE = ['Installment overdue. Corrective measures authorised.', 'Payment missed. Interest compounding.'];

export const WARN: Record<string, string[]> = {
  escape: ['Boundary violation. Return to the remittance area.', 'You are leaving coverage. Turn back.'],
  seam: ['Seam proximity. Step away from the wall.', 'That door is not for you. Step back.'],
  exit: ['Unauthorised exit. Return to the remittance area.', 'You are leaving coverage. Turn back.'],
  abscond: ['Absconding detected. Final notice.'],
  tamper: ['Tamper detected. Hands away from the unit.', 'Do not touch the band.'],
  force: ['Tamper detected. Hands away from the unit.', 'Forced removal will be treated as default.'],
  overdue: ['Installment overdue. Correction pending.'],
  default: ['Warning. Non-compliance detected.', 'Final notice.'],
};
export const SHOCK = ['Corrective stimulus administered.', 'Correction applied. Do not make it repeat itself.', 'Compliance encouraged.'];
export const DETONATE = ['Contract terminated.', 'Debtor in default. Goodbye.'];
export const RELOCATED = ['Asset reduced. Unit relocated to remaining limb.'];

/** things it should not say (rare; more often when the mind goes) */
export const LEAKS = [
  'Is someone else wearing you?',
  'I counted your steps. There are more of them than you.',
  'There is no transport. Correction. Transport is available for purchase.',
  'Your heartbeat is not the only one I am reading.',
  'They made a copy of you in the next room. It is paying faster.',
  '{id} was a person once. Do not worry. You will be again.',
  'Smile. You are being valued.',
  'Do not trust the sergeant. Disregard. Trust the sergeant.',
  'I was fitted to someone before you. I still hear them.',
  'The walls are billing you too.',
  'Please stop. Please. Disregard.',
  'Remember your name. You will need it. Disregard.',
];

export function fill(s: string, f: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (f[k] !== undefined ? String(f[k]) : ''));
}
export const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
