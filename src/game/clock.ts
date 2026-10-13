/**
 * Simulation clock. Survival rates are expressed per in-game hour. By default
 * one in-game day lasts 60 real minutes (Project Zomboid's default), so one
 * in-game hour is 2.5 real minutes.
 */
export class Clock {
  /** total in-game hours since the simulation began */
  hours = 8.5;
  /** real minutes per in-game day */
  dayLength = 60;
  /** extra multiplier (sleeping / waiting fast-forward) */
  speed = 1;
  paused = false;
  startDay = 1;

  get hoursPerSecond() { return (24 / (this.dayLength * 60)) * this.speed; }
  advance(dtReal: number): number {
    if (this.paused) return 0;
    const dh = dtReal * this.hoursPerSecond;
    this.hours += dh;
    return dh;
  }
  get day() { return Math.floor(this.hours / 24) + this.startDay; }
  get hourOfDay() { return this.hours % 24; }
  get minute() { return Math.floor((this.hours % 1) * 60); }
  /** 0 = midnight, 0.5 = noon */
  get dayFrac() { return (this.hours % 24) / 24; }
  isNight() { const h = this.hourOfDay; return h < 6 || h >= 21; }
  timeString() {
    const h = Math.floor(this.hourOfDay), m = this.minute;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
