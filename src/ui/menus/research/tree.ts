// THE MAIN COMPUTER'S RESEARCH TREE: no screen of its own any more. The tree is
// the research lattice on the control room's main computer (research/lattice.ts,
// built into rooms/research.ts); this module is the menu's handle on it:
//   setTreeHost(lattice)        the control room registers its rig
//   openTree({ onClose })       the camera goes up to the rig; Esc / B / LOG OFF closes it
//   treeOpen() / closeTree()
import './tree.css';
import type { Branch } from '../../../game/unitTree';
import type { TreeLattice } from './lattice';
import { mxOk } from '../../machine/core';
import { openSkillTree } from '../../bandos/skilltree';

let host: TreeLattice | null = null;
export function setTreeHost(l: TreeLattice | null) { host = l; }
export const treeOpen = () => !!board || !!host?.active;
export function closeTree() { if (board) board.close(); else host?.close(); }
// round 17: the main computer opens the skill tree board (src/ui/bandos/skilltree.ts): big 3D models on
// sockets, lit conduits, quest requirements on the plates, the install sequence on every purchase.
// The 3D lattice stays the room's dressing; it is the fallback without WebGL.
let board: { close(): void } | null = null;
export function openTree(o: { onClose?: () => void; branch?: Branch } = {}) {
  if (mxOk()) {
    board = openSkillTree({ onClose: () => { board = null; o.onClose?.(); } });
    return;
  }
  if (!host) { o.onClose?.(); return; }
  host.open(o);
  if (import.meta.env.DEV) (window as any).__tree = host;
}
