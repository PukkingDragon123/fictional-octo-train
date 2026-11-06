// THE MAIN COMPUTER'S RESEARCH TREE: no screen of its own any more. The tree is
// the research lattice on the control room's main computer (research/lattice.ts,
// built into rooms/research.ts); this module is the menu's handle on it:
//   setTreeHost(lattice)        the control room registers its rig
//   openTree({ onClose })       the camera goes up to the rig; Esc / B / LOG OFF closes it
//   treeOpen() / closeTree()
import './tree.css';
import type { Branch } from '../../../game/unitTree';
import type { TreeLattice } from './lattice';

let host: TreeLattice | null = null;
export function setTreeHost(l: TreeLattice | null) { host = l; }
export const treeOpen = () => !!host?.active;
export function closeTree() { host?.close(); }
export function openTree(o: { onClose?: () => void; branch?: Branch } = {}) {
  if (!host) { o.onClose?.(); return; }
  host.open(o);
  if (import.meta.env.DEV) (window as any).__tree = host;
}
