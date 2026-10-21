// The SEER-9's pages became the watch's functions (src/ui/watch). PAGES is the
// live list of functions the watch owns (the touch layer's strip reads it).
export { WATCH_PAGES as PAGES } from '../watch/watch';
export { signalStrength } from '../watch/apps';
export type PageKey = string;
