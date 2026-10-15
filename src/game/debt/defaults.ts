// The debt contract's sandbox fields and their defaults (also in Game.sandbox),
// importable by the menus without pulling in the game systems.
export const CONTRACT_SANDBOX: Record<string, number> = {
  /** starting debt in scrip */
  debt: 25000,
  /** in-game days between installments */
  debtDays: 2,
  /** the band's charge: 0 takes the forearm, 1 kills */
  bandLethal: 0,
  /** 1 = missing the final installment detonates every band */
  finalLethal: 0,
};
