import { G } from '../game/G';
import { GameSystem } from '../game/game';
import { Player } from '../entities/player';
import { bus } from '../core/events';
import { clamp, clamp01 } from '../core/math';
import { TF } from '../world/zone';
import { itemDef } from '../items/item';

const THOUGHTS: Record<string, string[]> = {
  hunger: ['', 'I could eat something.', 'My stomach is growling.', "I really need to eat.", "I'm starving..."],
  thirst: ['', 'My mouth is dry.', "I'm thirsty.", 'I need water. Badly.', "Can't... think... water..."],
  fatigue: ['', 'I could use a nap.', "I'm so tired.", "My eyes keep closing.", "I can't stay awake."],
  endurance: ['', '', "Need to catch my breath.", "I can't keep this up.", '*gasping*'],
  panic: ['', 'Something is wrong here.', "What was that?!", "Oh god, oh god...", '!!!'],
  stress: ['', '', 'My heart is racing.', "I can't calm down.", "I'm falling apart."],
  unhappy: ['', 'Everything feels grey.', "What's the point...", 'I miss home.', 'Nothing matters anymore.'],
  boredom: ['', '', "I'm so bored.", 'Same walls. Same hum.', 'I need something to do.'],
  pain: ['', 'Ow.', 'That really hurts.', 'The pain is unbearable.', 'AAAGH...'],
  bleeding: ['', "I'm bleeding.", "I'm losing a lot of blood!", "I need to stop this bleeding NOW.", "Everything is going dark..."],
  sick: ['', 'I feel queasy.', "I'm going to be sick.", 'I feel terrible.', 'Burning up...'],
  fever: ['', 'The wound feels hot.', 'I think it is infected.', "I'm burning up.", '...'],
  cold: ['', "It's chilly.", "I'm cold.", "I'm freezing!", "Can't... feel my hands..."],
  hot: ['', "It's warm.", "It's too hot.", "I'm overheating.", '...'],
  wet: ['', '', "I'm soaked.", 'Freezing wet clothes.', ''],
  lucidity: ['', 'The hum is getting into my head.', 'Was that wall always there?', 'Am I really here?', 'None of this is real. None of this is real.'],
  corruption: ['', 'My skin is... buzzing.', 'I can see pixels when I blink.', 'Parts of me are missing.', 'ERROR ERROR ERROR'],
  heavy: ['', 'This is heavy.', 'Too much weight.', "I can barely move.", "I can't carry all this."],
  drunk: ['', 'Feeling warm.', "Woah.", 'Everything is spinning.', '...'],
};

/**
 * Runs the local survivor's body simulation each frame, gathering the
 * environment (temperature, light, water, weather, company, threats) and
 * translating moodle changes into thoughts, sounds and screen effects.
 */
export class SurvivalSystem implements GameSystem {
  name = 'survival';
  threat = 0;
  anomaly = 0;
  entertained = 0;
  private hookFor = new WeakSet<Player>();
  private lastHurt = 100;

  update(dt: number, dh: number) {
    const p = G.local;
    if (!p) return;
    if (!this.hookFor.has(p)) {
      this.hookFor.add(p);
      p.body.onMoodle = (key, level, prev) => {
        if (level > prev && THOUGHTS[key]?.[level]) bus.emit('think', p, THOUGHTS[key][level]);
        bus.emit('moodle', p, key, level, prev);
      };
      p.body.onXp = (sk, lvl) => bus.emit('skillUp', p, sk, lvl);
    }
    if (p.body.dead) return;
    const z = G.zone;
    const tx = p.tileX(), ty = p.tileY();
    const f = z.floorAt(tx, ty);
    const outdoor = z.isOutdoor(tx, ty) || !!f?.outdoor;
    const room = z.roomAt(tx, ty);
    const env = p.envDefaults();
    env.ambient = (room.temp ?? z.env.temp) + (f?.cold ?? 0) + (outdoor && G.clock.isNight() ? -5 : 0) + (z.env.weather === 'rain' && outdoor ? -3 : 0);
    env.windExposed = outdoor;
    env.raining = z.env.weather === 'rain' && outdoor;
    env.inWater = f?.water === 'deep' ? 'deep' : f?.water === 'shallow' ? 'shallow' : 'none';
    env.floorWet = f?.wet ?? 0;
    env.moving = p.speed > 0.2;
    env.running = p.running;
    env.exertion = clamp01(Math.max(p.running ? 1 : 0, p.exertionTimer * 0.8, p.stance === 'swim' ? 0.7 : 0));
    env.resting = p.full === 'sit' || p.sittingOn !== null;
    env.asleep = p.sleeping;
    env.bedQuality = (p as any).bedQuality ?? 0.3;
    const light = G.lightLevelAt(p.x, p.z);
    env.lightLevel = clamp01(light);
    env.darkness = light < 0.12;
    let team = 0;
    for (const o of G.players.values()) if (o !== p && o.zoneKey === p.zoneKey && !o.body.dead && Math.hypot(o.x - p.x, o.z - p.z) < 9) team++;
    env.nearTeam = team;
    env.threat = this.threat;
    env.anomaly = this.anomaly;
    env.corruptZone = (z.flags[z.idx(tx, ty)] & TF.CORRUPT) ? 0.6 : 0;
    env.collapse = G.collapse;
    env.nearFire = (G as any).fireNear?.(p.x, p.z, p.zoneKey) ?? 0;
    const rw = room.x1 - room.x0 + 1, rh = room.y1 - room.y0 + 1;
    env.smallRoom = room.id > 0 && rw * rh < 12;
    env.openSpace = outdoor || (room.id > 0 && rw * rh > 400);
    env.entertained = this.entertained > 0;
    env.heavyLoad = p.heavyLoad();
    this.entertained = Math.max(0, this.entertained - dt);
    // flashlight drains batteries
    if (p.flashlightOn && p.lightItem) {
      const d = itemDef(p.lightItem.key);
      const drain = (d.light?.drainPerHour ?? 0.05) * dh;
      p.lightItem.uses = Math.max(0, (p.lightItem.uses ?? 1) - drain);
      if (p.lightItem.uses <= 0) { p.flashlightOn = false; bus.emit('think', p, 'The batteries are dead.'); }
    }
    // food in inventory ages (fridge handled by containers system)
    for (const it of p.allItems()) it.age += dh;
    p.body.update(dh, dt, env);
    // death / downed
    if (p.body.health <= 0 && !p.body.dead && !p.body.downed) {
      if (G.role !== 'solo' && G.players.size > 1) { p.body.downed = true; p.body.downedTime = 0; bus.emit('downed', p); }
      else { p.body.dead = true; bus.emit('death', p); }
    }
    if (p.body.downed) {
      p.body.downedTime += dt;
      if (p.body.downedTime > 90 || p.body.blood <= 0) { p.body.dead = true; p.body.downed = false; bus.emit('death', p); }
    }
    // screen effects reflecting the mind and body
    const fx = G.pr.fx;
    const b = p.body;
    fx.panic = clamp01((b.panic - 25) / 75);
    fx.desat = clamp01((b.unhappy - 40) / 80) * 0.6 + clamp01((50 - b.health) / 50) * 0.4;
    fx.wobble = clamp01((60 - b.lucidity) / 60) * 1.2 + clamp01(b.drunk / 60) + clamp01((b.sickness - 50) / 50) * 0.5;
    fx.blink = b.fatigue > 85 && !p.sleeping ? Math.max(0, Math.sin(G.time * 0.7) - 0.85) * 4 : 0;
    fx.glitch = Math.max(G.collapse * 0.25, clamp01((b.corruption - 20) / 80) * 0.6, (100 - b.lucidity) > 75 ? 0.15 : 0);
    const hurt = b.health;
    if (hurt < this.lastHurt - 1.5) fx.hurt = Math.min(1, fx.hurt + (this.lastHurt - hurt) / 25);
    this.lastHurt = hurt;
    fx.hurt = Math.max(0, fx.hurt - dt * 1.5);
    G.pr.shake = Math.max(G.pr.shake, fx.hurt * 0.5);
    // decay threat (creature system sets it every frame)
    this.threat = Math.max(0, this.threat - dt * 2);
    this.anomaly = Math.max(0, this.anomaly - dt * 0.5);
  }
}
