// First-person close-ups (the watch, the backpack, inspecting an item, eating,
// surgery views) all draw into the renderer's overlay scene (G.pr.overlayScene /
// overlayCamera, rendered pixel-style over the world). Only one owner shows at a
// time: claim the stage, build into your own group, release when done.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';

let owner: string | null = null;
let ownerPrio = 0;
const groups = new Map<string, THREE.Group>();

/** your group in the overlay scene; it is only visible while you own the stage */
export function fpGroup(name: string): THREE.Group {
  let g = groups.get(name);
  if (!g) {
    g = new THREE.Group();
    g.name = 'fp:' + name;
    g.visible = owner === name;
    groups.set(name, g);
    G.pr.overlayScene.add(g);
  }
  return g;
}

/** take the stage (a higher priority steals it; the loser gets bus 'fpLost' (name)) */
export function fpClaim(name: string, prio = 0): boolean {
  if (owner && owner !== name && prio <= ownerPrio) return false;
  const prev = owner;
  owner = name; ownerPrio = prio;
  for (const [k, g] of groups) g.visible = k === name;
  fpGroup(name).visible = true;
  G.pr.overlayEnabled = true;
  if (prev && prev !== name) bus.emit('fpLost', prev);
  bus.emit('fpChange', name);
  return true;
}

export function fpRelease(name: string) {
  if (owner !== name) return;
  owner = null; ownerPrio = 0;
  const g = groups.get(name); if (g) g.visible = false;
  G.pr.overlayEnabled = false;
  bus.emit('fpChange', null);
}

export function fpOwner(): string | null { return owner; }
export function fpCamera(): THREE.PerspectiveCamera { return G.pr.overlayCamera; }
