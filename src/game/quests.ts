// Quest definitions. Any system registers quests here; the watch's quest
// runtime lists, offers, tracks and rewards them (and may bridge them onto the
// MissionSystem). `m` in checks is the MissionSystem (flags, counters).
export interface QuestObjective {
  id: string;
  text: string;
  /** true when done; a number 0..1 shows progress */
  check: (m: any) => boolean | number;
  optional?: boolean;
}

export interface QuestDef {
  key: string;
  title: string;
  /** who uploads it to the watch: 'VOSS', a tribe, 'MERIDIAN R&D'... */
  giver?: string;
  desc: string;
  category?: string;
  objectives: QuestObjective[];
  reward?: { rp?: number; scrip?: number; unlock?: string[]; items?: [string, number][] };
  /** what accepting / completing costs (paid on completion unless payOnAccept) */
  cost?: { scrip?: number; items?: [string, number][]; payOnAccept?: boolean };
  /** quest keys (or mission flags prefixed 'flag:') needed before it is offered */
  requires?: string[];
  repeatable?: boolean;
  /** accepted automatically when offered (main story) */
  auto?: boolean;
  /** called once when completed (after rewards) */
  onComplete?: () => void;
}

const DEFS = new Map<string, QuestDef>();
export function defQuest(d: QuestDef) { DEFS.set(d.key, d); return d; }
export function questDefs(): QuestDef[] { return [...DEFS.values()]; }
export function questDef(key: string) { return DEFS.get(key); }
