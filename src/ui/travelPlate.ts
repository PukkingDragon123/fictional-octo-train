// Level travel (round 15): the crossing between two levels is covered by the
// loading screen of everything (src/ui/loading.ts): the backrooms unfold in 3D
// until the walls spell the name, then it fades into the new level. Nothing
// else: no plate, no bar, no "crossing to" line. A first-person entrance
// cinematic (WORLD) may put the loader up itself before the travel starts;
// showLoading is idempotent, so the bus events below just carry on from it.
import { bus } from '../core/events';
import { showLoading, hideLoading } from './loading';

export function installTravelPlate(_root?: HTMLElement) {
  bus.on('travelStart', (p: any) => {
    if (p && !p.isLocal) return;
    showLoading('travel');
  });
  bus.on('travelEnd', (p: any) => {
    if (p && !p.isLocal) return;
    void hideLoading();
  });
}
