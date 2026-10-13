# NOCLIP: Reference Research

Research notes for **NOCLIP**, a Project Zomboid-style isometric survival sandbox set in a liminal, Backrooms- and dreamcore-flavoured simulation. It uses low-poly 3D with pixel-art textures ("3D pixel art"), co-op multiplayer, and a handheld scanner as the main UI.

Compiled 2026-10-13. Every section ends with **What we adopt**: concrete decisions and numbers for tuning. Everything in this file is reference and inspiration. None of it is a licence to copy names, art, text, audio, or UI from the works cited.

---

## 0. Method, caveats, and IP ground rules

**How these sources were gathered**
- The research sandbox could not open `pzwiki.net`, Wikipedia, or most wikis directly. Their content was read in three ways:
  1. Search-engine extracts of the pages linked below.
  2. A markdown mirror of PZwiki pages hosted on GitHub. It was scraped 2026-02-24 and gives each page's `source_url`. Example: [Moodle.md mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Player/Moodle.md).
  3. An unofficial GitHub mirror of Project Zomboid **Build 41** Lua files, read for formulas only:
     - [ISInventoryTransferAction.lua](https://raw.githubusercontent.com/Niteghxst/Project-Zomboid-Media-Files/HEAD/media/lua/client/TimedActions/ISInventoryTransferAction.lua)
     - [farming_vegetableconf.lua](https://raw.githubusercontent.com/Niteghxst/Project-Zomboid-Media-Files/HEAD/media/lua/server/Farming/farming_vegetableconf.lua)
- PZwiki is mid-migration from **Build 41 to Build 42**. Search extracts cite current stable builds 42.20.4 and 42.21.0. Where pages disagree, both values are given and marked *(conflict)*. Treat all PZ numbers as **tuning starting points, not canon**.

**IP ground rules (decided)**
- **Project Zomboid** (The Indie Stone): mechanics can inspire us. We do not copy art, icons, UI layouts, strings, or code. "Moodle" is PZ's coined word, so we use our own term (see §a).
- **Backrooms Wiki (Wikidot)**: content is **CC BY-SA 3.0** by default. Its licensing guide says derivative games must be released under CC BY-SA 3.0, or under GPLv3 with credit ([Licensing Guide](https://backrooms-wiki.wikidot.com/licensing-guide)). AI-generated images and text are banned there. So we use only the *genre premise*: noclipping into endless empty rooms, from the anonymous 2019 creepypasta. We do **not** reuse wiki-specific level numbers, names, entities, or lore items. Examples to avoid: Almond Water, M.E.G., Smilers, Hounds, Partygoers, Level Fun.
- **Kane Pixels / Kane Parsons**: do **not** reuse the *Async Research Institute* name, its logo or brand look, or its specific lore.
- **Fallout / Bethesda**: the Pip-Boy, RobCo, Vault-Tec, and Vault Boy are trademarks. Our scanner gets an original name, silhouette, iconography, and tab names.
- **Trevor Henderson, The Mandela Catalogue, and SCP**: archetypes only. All creatures must be original.

---

## a. Project Zomboid gameplay systems

### a.1 Moodles: the complete list
PZ shows status as icon "moodles" in the top-right corner. Hovering one shows details. Each moodle has up to four tiers, and positive moodles have green backgrounds ([Moodle](https://pzwiki.net/wiki/Moodle), [Category:Moodles](https://pzwiki.net/wiki/Category:Moodles)).

Active moodles (B42 wiki list):
- Hungry
- Thirsty
- Panic
- Bored
- Stressed
- Unhappy
- Drunk
- Heavy load
- Endurance
- Tired
- Hyperthermia
- Hypothermia
- Windchill
- Wet
- Injured
- Pain
- Bleeding
- Restricted movement
- Has a cold
- Sick
- Noxious smell (two variants: corpse sickness, and toxic fumes from an indoor generator, which damage up to 5% health)
- Discomfort (from clothing; raises unhappiness)
- Dead / Zombie (shown on death)

Removed, future, or debug-only moodles:
- Angry
- Hungover
- Fear
- Morale
- Sanity

B42 also ships icons, currently unused, for Concentrating, Dizzy, Exhausted, Happy, Scared, Hearing/Vision impaired, Sedated, and Wired.

**Tier thresholds.** Stat values are percentages. Effects are as listed on the wiki.

| Moodle | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Key effects / notes | Source |
|---|---|---|---|---|---|---|
| Hunger | Peckish >15% | Hungry >25% | Very Hungry >45% | Starving >70% | T1: regen −~25%. T2: −1 carry. T3: −2 carry, regen −55%. T4: no regen, health drain. Positive side: Satiated → Well Fed → Stuffed → Full to Bursting (faster healing; top two block eating). | [Hungry](https://pzwiki.net/wiki/Hungry) |
| Thirst | >13% | >25% | Parched >70% | Dying >85% | T2: −1 carry, heat dissipation −20%, regen −35%. T3: −2 carry, −60%/−60%. T4: no regen, health drain (~22%/in-game h as listed). | [Thirsty](https://pzwiki.net/wiki/Thirsty) |
| Endurance (exertion, % of endurance used) | 25% | 50% | 75% | 90% | T1: melee dmg −50%, move speed −19%. T2: no sprint, speed −37%. T3: no run/power-walk. T4: can't swing a sledgehammer. Names conflict: Out of Breath vs Moderate Exertion. | [Endurance](https://pzwiki.net/wiki/Endurance) |
| Tired (fatigue) | Drowsy >60% | Tired >70% | upper tiers reported at >80% *(conflict)* | Ridiculously Tired | Sleep is only possible at ≥60%. Drowsy narrows the vision cone and cuts endurance regen. Fatigue gain is ~0.042/in-game hour awake, so Drowsy arrives after ~14 h awake. Wakeful −30% rate, Sleepyhead +30%. | [Tired](https://pzwiki.net/wiki/Tired) |
| Heavy load (% of capacity) | >100% | >125% | >150% | >175% | Very Heavy and above: no idle endurance regen, plus continuous damage (a "back injury" that drains health down to 75%; none while sitting). | [Heavy load](https://pzwiki.net/wiki/Heavy_load), [Health mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Player/Health.md) |
| Panic | Nervous / Slight Panic | Alarmed / Panic | Frightened / Strong | Terrified / Extreme | Gain ≈3% per zombie seen, plus ≈0.5%/in-game minute while zombies are visible. Decay ~1.75%/s on day 1 (≈56 s from 100%). Narrows the vision cone (Terrified: −36 vision radius, −0.2 light). Cuts crit chance and accuracy. Aiming ≥6 negates gun penalties. Desensitised after ~150 days survived. | [Panic](https://pzwiki.net/wiki/Panic), [Moodle (old)](https://pzwiki.net/w/index.php?title=Boredom&redirect=no), [Player mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Player/Player.md) |
| Stressed | Tense >25% | Agitated >50% | (third tier) | At Breaking Point >90% | Breaking Point raises unhappiness 0.048%/s. Smoker withdrawal caps stress at 51. A cigarette clears all stress for smokers and gives −5 for non-smokers. | [Stressed](https://pzwiki.net/wiki/Stressed), [Smoker](https://pzwiki.net/wiki/Smoker) |
| Bored | >25% | >50% | >75% | >90% | Unhappiness gain from 0.048%/s at T2 to 0.096%/s at T4. Fades outdoors or while panicking. | [Bored](https://pzwiki.net/wiki/Bored) |
| Unhappy | Sad >20% | Weepy >45% | Miserable >60% | Hopeless >80% | Timed actions take ×1.25 / ×1.5 / ×1.75 / ×2.0 (new page). Old page: +7.4% / 13.7% / 19.6% / 26.5%. | [Unhappy](https://pzwiki.net/wiki/Unhappy) |
| Wet (body wetness) | Moist/Damp 15% | Wet 40% | Soaking 70% | Drenched 90% | Drenched: up to +75% heat loss and +40% discomfort. Cold chance up to ×2 at 100% wetness. An umbrella prevents T3/T4. | [Wet](https://pzwiki.net/wiki/Wet) |
| Hypothermia (core °C) | Chilly <36.5 | Cold <35 | Freezing <30 | Hypothermic <25 | Combat speed −33/−66/−90% (or 34/67/90). Hypothermic: run −100%, health drains to 1%. | [Hypothermia](https://pzwiki.net/wiki/Hypothermia) |
| Hyperthermia (core °C) | Unpleasantly Hot >37.5 | Overheated >39 | Sunstruck >40 | Hyperthermic >41 | Combat and run speed −33/−66/−90…100%. Raises thirst and fatigue rates. T3 interrupts sleep. Health loss is capped at 30%. | [Hyperthermia](https://pzwiki.net/wiki/Hyperthermia) |
| Injured (health left) | A Little Hurt <80% | Injured <60% | Severe <40% | Critical <25% | Lower strength and speed. Critical: −3 carry. | [Injured](https://pzwiki.net/wiki/Injured) |
| Bleeding (count of bleeding wounds) | 1 | 2 | 3 | 4+, or any neck bleed | Removed by bandaging every bleeding part. | [Bleeding](https://pzwiki.net/wiki/Bleeding) |
| Pain (pain value) | ≥10 | ≥20 | ≥50 | ≥75 | Minor Pain → Agony. Cuts speed and accuracy. Tier 2 and above blocks sleep without painkillers (B42.19 per pzfans). | [pzfans](https://pzfans.com/what-does-panic-do-in-project-zomboid/), [Pain](https://pzwiki.net/wiki/Pain) |
| Sick | Queasy >25% | Nauseous >50% | Sick >75% | Fever >90% | Lower strength and healing, higher body temperature. Fever drains health. | [Sick](https://pzwiki.net/wiki/Sick) |
| Drunk | Tipsy >10% | Inebriated >30% | Plastered >50% | Utterly Sh\*t-faced >70% *(older)* | Accuracy penalty is a formula of distance. Masks hypothermia moodles. | [Drunk](https://pzwiki.net/wiki/Drunk) |

**Other player stats** ([Player mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Player/Player.md)):
- Core temperature is held near **37 °C**.
- Wetness lowers both core temperature and clothing insulation.
- Unhappiness lengthens most timed actions.

### a.2 Health panel, body parts, injuries, and treatment
Opened with **H** or the heart icon, which wiggles when you take damage ([Health](https://pzwiki.net/wiki/Health)).

**17 body parts:** L/R foot, shin, thigh, hand, forearm, and upper arm, plus groin, lower torso, upper torso, neck, and head.

**Overall status tiers:** OK; Slight (90–100%); Very Minor (80–90%); Minor (70–80%); Moderate (60–70%); Severe (50–60%); Very Severe (40–50%); Critical (20–40%); Highly Critical (10–20%); Terminal (0–10%); Deceased.

**Health caps.** Injuries cap maximum health. An upper-torso fracture, for example, holds max health near 60%. **Neck wounds ignore the cap** and kill within minutes unless bandaged.

**Injury types and in-game hours to heal.** Each entry gives normal / Slow Healer / Fast Healer.
- **Scratch:** 7–15 / 15–25 / 4–10 h. Window scratch 12–20 h. Weapon scratch 5–10 h. Causes: zombie, smashing a window, failed vault, glass, car crash, tripping.
- **Laceration:** 10–20 / 20–30 / 5–10 h. A more severe scratch. Slows the character more than a scratch most of the time.
- **Deep wound (with or without glass):** 15–20 / 20–32 / 11–15 h. Fixed by **stitches** (a suture needle hurts less than needle and thread), or by staying bandaged for ~1 month. Causes: punching a window bare-handed, a broken window frame, barefoot on glass, falls, crashes at ~40–50 mph, axes.
- **Bite:** 50–80 / 80–150 / 30–50 h. A zombie bite is **100%** fatal by default (sandbox-configurable). Bites are more likely from behind.
- **Lodged glass shard:** remove it with tweezers, forceps, or bare hands (more pain). Then treat it as a deep wound: disinfect, stitch, bandage.
- **Lodged bullet:** 17–23 h after tweezers, disinfectant, stitches, and bandage.
- **Burn:** 50–100 h, unaffected by healing traits. Bandage and keep it clean. Caused by fire.
- **Fracture:** up to ~60 days (140 Slow, 40 Fast). An untreated moderate fracture lasts ≈12.8 days per the Comfrey page *(conflict)*. Treatments:
  - **Splint:** made from a rip + a straight wood item. Not possible on the head or torso. Heals ~×10 faster, more with First Aid.
  - **First Aid ≥4:** +250%.
  - **Well fed:** +30%.
  - **Comfrey poultice:** −50% time, and it stacks.
  - Causes: falls, crashes at 60+ mph, blunt weapons.
  ([Splint](https://pzwiki.net/wiki/Splint), [Comfrey Poultice](https://pzwiki.net/wiki/Comfrey_Poultice))
- **Exercise fatigue:** pain plus reduced damage or speed on the affected limb. Recovery is waiting.
- **Limb effects:**
  - Leg and foot injuries cause limping: no run or sprint.
  - Arm injuries severely cut melee and gun damage.
  - Falling more than one floor scales with height, load, and traits. A second-storey jump can give deep wounds and fractures.

**Bandages and infection** ([Bandage](https://pzwiki.net/wiki/Bandage), [Rag](https://pzwiki.net/wiki/Rag), [First Aid](https://pzwiki.net/wiki/First_Aid)):
- Bandages stop bleeding. Over time they get **dirty**, and a dirty bandage *raises* wound-infection chance.
- Bandage power: sterilised bandage 4.0, rag 2.0, dirty bandage 0.5.
- Sterilise a bandage with disinfectant, bourbon, or 500 ml of boiled water.
- A **wound infection** is minor (more pain only) and always survivable. Treat it with disinfectant, alcohol wipes, antibiotics, or a wild garlic poultice (5 wild garlic + mortar and pestle).
- First Aid level lengthens bandage life and speeds fractures. It does **not** speed scratch healing.

**Knox (zombie) infection** ([Knox Infection](https://pzwiki.net/wiki/Knox_Infection), [mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Player/Knox%20Infection.md)):
- **Transmission chance:** scratch **7%**, laceration **25%**, bite **100%**. First Aid does not change these odds.
- **Hidden state.** The game never shows the infection directly. Symptoms:

| Time after infection | Symptom |
|---|---|
| Immediately | Temperature rises |
| 1–4 h | Anxiety |
| 5–12 h | Queasy |
| 13–24 h | Nauseous |
| 25–48 h | Sick |
| 49–71 h | Fever |
| ~72 h | Death |

- Death is followed by reanimation (default **0–1 min**).
- Traits: Resilient −25% progression rate, Prone to Illness +25%.
- Sandbox options:
  - **Transmission:** Blood+Saliva / Saliva only / Everyone's infected / None.
  - **Mortality:** from Instant up to 1–2 weeks, or Never. Default 2–3 days.
  - **Reanimate time:** Instant to 1–2 weeks.
- The disabled **Hypochondriac** trait fakes the same symptoms without infection.

### a.3 Nutrition, weight, and food freshness
**Nutrients and weight** ([Nutrition](https://pzwiki.net/wiki/Nutrition), [mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Player/Nutrition.md)):
- Each food has **calories, carbohydrates, proteins, and fats**. Hunger and nutrition are separate systems. Calories drive **weight**.
- Default weight is **80**. Weight bands (B42 names):

| Band | Weight |
|---|---|
| Very High | ≥100 |
| High | 85–99.9 |
| Normal | 75.1–84.9 |
| Low | 65.1–75 |
| Very Low | 50.1–65 |
| Emaciated | ≤50 |
| Degeneration damage | at 35 |

- Any weight trait caps Fitness gains at level 6. Emaciated, Very Low, and Very High block Fitness gains entirely.
- **Weight gain:** occurs when calories exceed `base + (weight − 80) × 40`. `base` is 700, 1000, or 1800, depending on metabolism and weight.
  - Rate: ΔW = factor × (calories / 4000, capped at 1) × seconds.
  - `factor` is 0.000013, 0.000026, or 0.000039 by carb/fat intake (≤400 / 400–700 / >700).
- **Weight loss:** occurs when calories fall below `(weight − 70) × 30`. ΔW = 0.0000085 × (calories / 2500, capped at 1) × seconds.
- **Protein:** a store of 50–300 gives Strength XP ×1.5; below −300 gives ×0.7.

**Freshness** ([Category:Perishable food](https://pzwiki.net/wiki/Category:Perishable_food), [Lettuce](https://pzwiki.net/wiki/Lettuce), [Cheese](https://pzwiki.net/wiki/Cheese)):
- Each item has *Days fresh* and *Days until rotten*. Examples:
  - Lettuce 3/5
  - Radish 3/7
  - Cheese 14/20
  - Uncooked jarred food 30/60
  - Cooked jarred food 730/1560
- A fridge makes food last **×5**, a freezer **×50**. Powered fridges still rot food eventually.
- Rotten food restores less than ½ the hunger and can cause sickness, even when cooked.
- Food-illness duration: 200–280 ticks (Weak Stomach 120–230, Iron Gut 80–150).
- **Utilities:** water and power shut off on a random day between 0 and 30 (power is often 14–30, with a broadcast warning). Generators need the magazine, Electrician, or Electrical 3 ([Electricity](https://pzwiki.net/wiki/Electricity), [Survival Guide](https://pzwiki.net/wiki/Survival_Guide)).

### a.4 Temperature, wetness, and clothing
- **B41.20 added a thermoregulation model** ([Build 41.20](https://pzwiki.net/wiki/Build_41.20), [Build 41.21](https://pzwiki.net/wiki/Build_41.21)):
  - Clothing **insulation** and **wind resistance** run 0–1. **Water resistance** 1.0 stops soak-through.
  - Body heat and sweat are tracked per body part, layer by layer.
- **Examples:**
  - Padded jacket: insulation and wind 0.95.
  - Poncho: insulation 0.1, wind 0.75, waterproof.
  - Coveralls: 0.65 / 0.45.
  ([Padded Jacket](https://pzwiki.net/wiki/Padded_Jacket), [Poncho](https://pzwiki.net/wiki/Poncho))
- **Windchill** applies only outdoors, in storms or blizzards.
- **Drying:** a towel, a heat source, or time indoors dries you ([Wet](https://pzwiki.net/wiki/Wet)).
- **Having a cold** comes from long cold or wet exposure. Sneezes and coughs make noise 40, muffled by tissues ([Noise mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Environment/Noise.md)).

### a.5 Fatigue and sleep
Source for this section: [Sleep](https://pzwiki.net/wiki/Sleep), [mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Player/Sleep.md).
- **Sleep need:** ≈**9 h/day** (Wakeful ≈6 h, Sleepyhead ≈12 h). Minimum sleep **3 h**, maximum **16 h**. Time fast-forwards while asleep.
- **Bed quality:** bed > sofa/chair > floor. Tents default to "Poor" and improve with sleeping bags or pillows. Poor beds cause slow recovery and neck soreness.
- **Waking:**
  - Loud nearby noise (zombies breaking in), alarm clocks, or a watch (chime radius 7–15).
  - Extreme temperatures, or a vehicle under attack.
  - **Nightmares:** 5% base chance, rising with stress.
- **Sandbox sleep events:** zombie intrusion is likelier with open or unbarricaded openings, lights on, or running fridges and appliances.

### a.6 Panic, stress, boredom, and unhappiness
- **Interlinks:** panic clears boredom. Chronic stress (>50) and boredom feed unhappiness, and unhappiness slows actions. ([Discomfort](https://pzwiki.net/wiki/Discomfort))
- **Remedies:**
  - Reading, TV/radio, music, and killing zombies all help.
  - Beta blockers or alcohol reduce panic.
  - Cigarettes reduce stress.
  - Antidepressants and good food reduce unhappiness.
- **Panic traits:** Brave = 30% panic per the Trait list, or −70% on its own page *(conflict)*. Cowardly increases panic. Adrenaline Junkie gives +0.20 or +0.25 base speed at Strong/Extreme panic.

### a.7 Skills (B42 list) and XP
Skills by category ([Skill](https://pzwiki.net/wiki/Skill), [mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Player/Skill.md), [Build 42 project](https://pzwiki.net/wiki/PZwiki:Project_Build_42_Update)):
- **Agility:** Running (formerly Sprinting), Lightfooted, Nimble, Sneaking.
- **Combat:** Axe, Long Blunt, Short Blunt, Long Blade, Short Blade, Spear, Maintenance.
- **Crafting:** Carpentry, Blacksmithing, Carving, Cooking, Electrical, Glassmaking, Knapping, Masonry, Mechanics, Pottery, Tailoring, Welding.
- **Firearm:** Aiming, Reloading.
- **Farming:** Agriculture, Animal Care, Butchering.
- **Passive:** Strength, Fitness.
- **Survivalist:** First Aid, Fishing, Foraging, Tracking, Trapping.

XP per level, not cumulative:

| Level | Regular | Passive |
|---|---|---|
| 1 | 75 | 1,500 |
| 2 | 150 | 3,000 |
| 3 | 300 | 6,000 |
| 4 | 750 | 9,000 |
| 5 | 1,500 | 18,000 |
| 6 | 3,000 | 30,000 |
| 7 | 4,500 | 60,000 |
| 8 | 6,000 | 90,000 |
| 9 | 7,500 | 120,000 |
| 10 | 9,000 | 150,000 |

- Cumulative regular XP to level 10: **32,775**.
- **Skill books** come as 5 volumes covering 2 levels each. Multipliers: **×3, ×5, ×8, ×12, ×16**. They apply only at the matching level, and each 10% of pages read gives 10% of the bonus ([Skill book](https://pzwiki.net/wiki/Skill_book)).
- **Starting-skill XP boost:** level 0 = 25%, level 1 = 100%, level 2 = 133%, level 3+ = 166%.
- **Strength → carry capacity** ([Strength](https://pzwiki.net/wiki/Strength)):

| Strength | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Capacity | 6 | 7 | 8 | 9 | 11 | 12 | 14 | 15 | 16 | 18 | 20 |

  Default Strength is 5 (capacity 12). Hunger and thirst tiers subtract from capacity.

### a.8 Occupations and traits
**Point-buy** ([Trait](https://pzwiki.net/wiki/Trait), [Occupation](https://pzwiki.net/wiki/Occupation)):
- Unemployed / Custom occupation gives **+8** points. Other occupations shift the budget (examples below).
- Positive traits cost points and negative traits refund them. The total must be ≥0.

**Occupation examples (points):**
- Fire Officer 0
- Police Officer −4
- Park Ranger −4
- Burglar −6 (can hotwire)
- Chef −4
- Lumberjack 0
- Doctor +2
- Nurse +2
- Mechanic −4
- Electrician −4
- Veteran −8 (Desensitized)
- Fitness Instructor −6

Values come from the B42 mirror and differ slightly from the live table *(conflict)*. Example: the live table gives Carpenter −2, the mirror +1.

**Trait examples, sense- and UI-relevant** (cost shown as −N for positives and +N for negatives):

| Trait | Points | Effect |
|---|---|---|
| Keen Hearing | −6 | 200% perception radius |
| Eagle Eyed | −4 | Wider FOV; helps foraging |
| Cat's Eyes | −2 | +20% night vision |
| Inconspicuous | −4 | 50% chance zombies spot you |
| Graceful | −4 | 60% footstep sound radius |
| Dextrous | −2 | 50% inventory transfer time |
| Organized | −4 | 130% container capacity |
| Fast Learner | −6 | 130% XP (excluding Strength/Fitness) |
| Athletic | −10 | +4 Fitness, +20% run speed |
| Strong | −10 | +4 Strength, +40% knockback |
| Thick Skinned | −8 | 1.3× chance to avoid injury |
| Wakeful | −2 | −30% fatigue rate |
| Deaf | +12 | |
| Hard of Hearing | +4 | |
| Short Sighted | +2 | |
| Disorganized | +6 | 70% capacity |
| All Thumbs | +2 | 400% transfer time |
| Cowardly | +2 | |
| Smoker | +2 | |
| Slow Healer | +3 | |
| Prone to Illness | +4 | |
| Sunday Driver | +1 | |
| Illiterate | +8 | |

### a.9 Inventory and the loot window
**Layout** ([Inventory](https://pzwiki.net/wiki/Inventory), [mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Player/Inventory.md), [Survival Guide](https://pzwiki.net/wiki/Survival_Guide), [Container (tile)](https://pzwiki.net/wiki/Container_(tile))):
- There are two windows. **Player inventory** sits on the left: a list of items, with a column of container tabs (body, worn bags). The **loot window** sits on the right: every container within arm's reach, plus the **floor** treated as a container.
- Moving items: drag-and-drop or the context menu. **Loot All** moves everything, but walking or turning away cancels it.
- Progress shows as a green bar over the character.
- **Encumbrance:** every item has an encumbrance value combining weight and awkwardness. Each container shows `current / max` at its top-right.
- **Bags:**
  - They have hard capacity limits, unlike the main inventory.
  - They must be held or worn.
  - Worn bags reduce effective weight. Example: small backpack, capacity 15, **70% weight reduction**. A plastic bag in hand gives 50%.
  - Equipped items weigh less.
- **World containers:** all counters cap at 50, metal lockers 50, a military crate 50 (65 with Organized).
- **Transfer time**, from the B41 `ISInventoryTransferAction` mirror linked in §0:
  ```
  maxTime = 120                         # within the player's own containers (packing)
  if from player inventory to a non-carried container:   maxTime = 50
  if from a world container into a carried container:    maxTime = 50
  destFill = dest.capacityWeight / dest.maxWeight  (only when packing within own containers; min 0.4)
  maxTime *= min(item.actualWeight, 3) * destFill
  dest == floor: ×0.1 (from main inventory) or ×0.2 (from a world container)
  Dextrous ×0.5, All Thumbs ×4.0; walking while transferring ×1.5
  favourited items can't be moved out of the character's containers (maxTime 0)
  ```

### a.10 World interactions (context menu)
**Barricades** ([Barricade](https://pzwiki.net/wiki/Barricade)):
- **Planks:** plank + 2 nails + hammer, no skill needed, gives Carpentry XP.
  - Up to **4 planks per side** of a door or window.
  - **≤2 planks keep line of sight**; 3–4 block it.
  - Plank HP ≈ **1,000–1,500** by skill.
- **Metal:** sheets (5,000–7,500 HP, block LOS) and bars (3,000–4,500 HP, keep LOS). Both need Welding 3 plus a torch.
- **Removal:** claw hammer, crowbar, tire iron, or fire axe. Metal needs a propane torch. Nails are always lost.

**Windows** ([Window](https://pzwiki.net/wiki/Window), [Broken Glass](https://pzwiki.net/wiki/Broken_Glass)):
- **Smash** with a weapon: noisy.
- **Bare-handed** smashing risks lodged glass and deep wounds.
- **Remove glass** shards from the frame (right-click with a weapon) before **climbing through**, or risk a laceration or lodged glass.
- **Add Sheet** blocks line of sight, as do curtains.
- **Sheet rope** descends from upper floors. Barricaded windows can't take a sheet rope.
- Second-floor jumps without a rope injure.

**Furniture** ([Furniture](https://pzwiki.net/wiki/Furniture)):
- **Pick up / place / rotate.** Some pieces need tools, which auto-equip. Large pieces may exceed capacity, so set parts down nearby.
- **Disassemble:**
  - Wood: hammer + saw, or hammer + screwdriver. Sandbox-toggleable.
  - Metal: welding torch + mask.
  - Skill sets salvage yield.
- A **sledgehammer** destroys pieces that can't be moved, and leaves no materials.

### a.11 Carpentry and building
Sources: [Carpentry](https://pzwiki.net/wiki/Carpentry), [Wooden Wall](https://pzwiki.net/wiki/Wooden_Wall), [Wooden Crate](https://pzwiki.net/wiki/Wooden_Crate), [Wooden Stairs](https://pzwiki.net/wiki/Wooden_Stairs), [Handy](https://pzwiki.net/wiki/Handy).
- **Wall frame:** Carpentry 2.
- **Wooden wall** tiers at Carpentry 2/4/6. Basic wall HP is **490 at Carpentry 2, rising to 650 at Carpentry 10**.
- **Doors:** Carpentry 3/5/7, built inside a door frame.
- **Crates:** Carpentry 3 (capacity 40); Carpentry 7 (capacity 60).
- **Stairs:** Carpentry 6, 13 planks + 8 nails.
- The **Handy** trait gives +100 HP to all constructions and ≈11% faster building.

### a.12 Farming (Agriculture)
**B42 farming** ([Agriculture](https://pzwiki.net/wiki/Agriculture), [Watering Can](https://pzwiki.net/wiki/Watering_can), [Mildew Spray](https://pzwiki.net/wiki/Mildew_Spray), [Aphids Spray](https://pzwiki.net/wiki/Aphids_Spray), [Pest Flies Spray](https://pzwiki.net/wiki/Pest_Flies_Spray)):
- **Dig furrows** with a trowel or shovel, on grass or dirt with no objects on the tile.
- **Sow** from a seed packet. One packet = 5 seeds.
- **Water** in 10-unit increments. Rain adds water.
- **Diseases:** mildew, pest flies, aphids (called "Devil's Water Fungi" before B42), and slugs.
  - Sprays: mildew = milk; flies = tobacco water; aphids = water or rubbing alcohol.
  - Spray recipes come from magazines or Agriculture 6.
  - Slugs need found repellent.
- Crops have growing seasons.

**B41 code numbers.** `timeToGrow` is in-game hours per growth phase:

| Crop | Seeds | Water need (min–max) | Hours/phase | Yield |
|---|---|---|---|---|
| Carrots | 12 | 35–85 | 50–55 | 3–6 |
| Broccoli | 6 | 70 | 103–117 | 2–4 |
| Radishes | 6 | 45–85 | 56–62 | 4–9 |
| Potatoes | 4 | 65 | 89–103 | 3–4 |
| Tomato | 4 | 75 | 89–103 | 4–5 |
| Cabbages | 9 | 85 | 46–52 | 4–6 |

- **Phases:** seedling (0–1) → young (2–4) → ready to harvest (5) → seed-bearing (6) → rotten.
- **Water rule:** at or above need, normal growth. Within 10% short, the phase gets +(need − level) hours. Within 30% short, the phase stalls (retry in 5 h). Lower than that, the plant dies.
- **Disease level rule:** <10 harmless; 10–30 adds that many hours; 30–60 stalls; >60 kills the plant.

### a.13 Foraging
Source: [Foraging](https://pzwiki.net/wiki/Foraging), [Build 41.60](https://pzwiki.net/wiki/Build_41.60), [Build 41.66](https://pzwiki.net/wiki/Build_41.66).
- **Search mode** reveals items inside a spotting **radius**, not a dice roll.
- **Radius:** base **3–10 tiles**, up to **15** with bonuses. **+0.7 tiles per Foraging level**.
- **Weather** cuts the radius by up to **−75%**. An umbrella reduces the penalty.
- **Darkness** cuts it by up to **−95%**. At ≥50% darkness nothing new can be spotted, and the minimum radius drops to 1.5 tiles.
- **Head/eye coverage** costs up to **−75%**.
- **Movement:** running hurts searching, and aiming/looking around helps.
- **Category weather bias:** rain, after-rain, and night favour mushrooms, bait, and medicinal/wild plants. Snow suppresses plants.
- **Poison chance:** `ItemPoisonChance + (10 − level) × 5`.

### a.14 Trapping
Source: [Trapping](https://pzwiki.net/wiki/Trapping), [Traps mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Equipment/Traps.md), [Cage Trap](https://pzwiki.net/wiki/Cage_Trap).
- Traps **roll once per in-game hour** per animal type, using trap type, bait, and Trapping skill.
- **Animal timing:** rabbits, raccoons, and squirrels only between 19:00 and 05:00. Birds, mice, and rats at any time.
- **Catch chances:**
  - Stick trap ~40% (birds).
  - Mouse trap 25–30% (mice, rats). The only trap that can't be crafted.
  - Box 25/30%.
  - Crate 30%.
  - Cage 40% (rabbit, squirrel).
  - Snare (Trapping 1).
- **Trap "strength"** (15–50) decides whether the trap keeps its bait and survives each hour.

### a.15 Vehicles
**Keys** ([Vehicle](https://pzwiki.net/wiki/Vehicle), [Vehicle mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Environment/Vehicle.md), [Vehicle Key](https://pzwiki.net/wiki/Vehicle_Key)):
- One key per car. It starts the engine and opens doors and trunk from outside.
- Found in the ignition or glovebox, on the ground nearby, in nearby houses, or on nearby zombie corpses.
- A key icon appears over the player when they hold the key.

**Hotwiring** ([Electrical](https://pzwiki.net/wiki/Electrical), [Burglar](https://pzwiki.net/wiki/Burglar)):
- Requires **Electrical 1 + Mechanics 2**, or the Burglar occupation.
- Success at Electrical 0: **50% at engine quality ≤50**, **5% at engine quality ≥95**.
- Failure makes noise but doesn't break anything. In MP, anyone can drive a hot-wired car.

**Parts and maintenance** ([Mechanics](https://pzwiki.net/wiki/Mechanics), [Engine](https://pzwiki.net/wiki/Engine), [Brake](https://pzwiki.net/wiki/Brake), [Muffler](https://pzwiki.net/wiki/Muffler), [Gas Tank](https://pzwiki.net/wiki/Gas_Tank), [Car Battery](https://pzwiki.net/wiki/Car_Battery)):
- Parts: engine, battery, tires, brakes, suspension, muffler, gas tank, doors, windows/windshield, hood, trunk, seats, and lights.
- Tires, suspension, and mufflers wear with use. A missing muffler makes the car much louder.
- Brakes sit behind the tire.
- A battery needs only a screwdriver.
- The engine needs Mechanics 4–6 depending on class. It is repaired with engine parts and a wrench.

**Vehicle classes:** standard, heavy-duty, and sports, each needing a different repair magazine.

**Example stats:**

| Vehicle | Engine power | Engine quality | Loudness | Top speed | Seats | Trunk | Total storage |
|---|---|---|---|---|---|---|---|
| Ambulance | 490 | 75 | 110 | 70 | 2 | 130 | 180 |
| Chevalier Cossette (sport) | 570 | 90 | 90 | 120 | 2 | 30 | 75 |

Vehicles attract zombies roughly every 2 minutes, inconsistently.

### a.16 Noise and vision
**Noise volumes (tiles)** ([Noise](https://pzwiki.net/wiki/Noise), [Noise mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Environment/Noise.md), [Burglar Alarm](https://pzwiki.net/wiki/Burglar_Alarm), [Helicopter](https://pzwiki.net/wiki/Helicopter), [Noise Maker](https://pzwiki.net/wiki/Noise_Maker)):

| Source | Volume |
|---|---|
| Sneak | 3.5 |
| Walk | 7 |
| Sprint | 14 |
| Whisper | 6 |
| Shout | 30 (×3 with megaphone) |
| Construction | 15 |
| Fire | 20 |
| Zombie knocking | 20 |
| Generator | 20–25 |
| Sneeze or cough | 40 |
| Vehicle | 55–220 |
| Car horn or alarm | 150 |
| Firearms | 30 (cap gun) to 200 (shotgun) |
| Helicopter | 500 |
| Burglar alarm | **600**, for about 20 in-game minutes |
| Noise maker | 17-tile radius for 30 minutes |

- Walls, doors, and distance muffle sound.
- The code separates **radius** (reach) from **volume** (attractiveness). Example: a siren has radius 100 but volume 60.

**Vision and detection** ([Sneaking](https://pzwiki.net/wiki/Sneaking), [Keen Hearing](https://pzwiki.net/wiki/Keen_Hearing), [Panic](https://pzwiki.net/wiki/Panic), [Steam discussion](https://steamcommunity.com/app/108600/discussions/0/3288067088117206895)):
- **Vision cone:** players report **~160° by default and ~180° with Eagle Eyed**. This is player-reported, not official.
- **Behind the player:** a "perception radius" circle covers this, based on hearing. Keen Hearing doubles it.
- **What narrows the cone:** tired and panic moodles, and darkness.
- **Sneaking skill:** detection multiplier **114% at level 0 → 48% at level 10**. Quieter footsteps while crouched.
- **Zombie senses (sight, hearing, memory)** are sandbox options ([Custom Sandbox](https://pzwiki.net/wiki/Custom_Sandbox)).
- **Fog:** cuts zombie vision radius, clamped to 10–20 tiles per a B42.19 fan breakdown ([pzfans](https://pzfans.com/how-does-fog-affect-zombie-vision-and-how-to-make-it-go-away/)).

**Zombie speeds:** shambler (slow or fast), crawler (≈⅕ speed), and sprinter (sandbox only; trips occasionally) ([Zombie](https://pzwiki.net/wiki/Zombie)).

### a.17 Multiplayer features
**VOIP** ([Server settings](https://pzwiki.net/wiki/Server_settings), [Build 35](https://pzwiki.net/wiki/Build_35)):
- Proximity voice with voice activation, or push-to-talk on left Alt by default.
- `VoiceMinDistance = 10` and `VoiceMaxDistance = 100` tiles. `Voice3D = true`.
- `/voiceban` blocks a player ([Admin commands](https://pzwiki.net/wiki/Admin_commands)).

**Radios** ([Communication](https://pzwiki.net/wiki/Communication), [Walkie Talkie](https://pzwiki.net/wiki/Walkie_Talkie), [mirror](https://raw.githubusercontent.com/nghuy0901/Discord-chatbot-PZ/HEAD/knowledge/docs/pz/Equipment/Communication.md)):
- Two-way radio only works when both sets are tuned to the same frequency.
- Walkie transmit ranges and bands:

| Walkie | Range | Band |
|---|---|---|
| Toys-R-Mine | 750 | 75–150 MHz |
| Makeshift | 1,000 | 75–150 MHz (mic range 5, speaker range 8) |
| ValuTech | 2,000 | 50–200 MHz |
| Premium | 4,000 | 25–300 MHz |
| Tactical | 8,000 | 10–500 MHz |
| US Army | 16,000 | 0.2–1,000 MHz |

- Ham radios: makeshift 6,000–8,000 (scales with Electrical); US Army 20,000.
- AM/FM receivers: 88–108 MHz.
- Battery drain: ~0.7–1%/h.
- B42.21 fixed walkie VOIP while driving ([Build 42.21.0](https://pzwiki.net/wiki/Build_42.21.0)).

**Safehouses** ([Safehouse](https://pzwiki.net/wiki/Safehouse), [Server settings](https://pzwiki.net/wiki/Server_settings), [Build 41.67](https://pzwiki.net/wiki/Build_41.67)):
- Players claim a building. The owner manages members.
- Server options:
  - `PlayerSafehouse` / `AdminSafehouse`: who may claim.
  - `SafehouseDaySurvivedToClaim` (default 0).
  - `SafehouseAllowTrepass` (default true).
  - `SafehouseAllowNonResidential` (default false; added in 41.67).
  - `SafeHouseRemovalTime`: drops inactive members after 144 real hours.
  - `SafehouseAllowRespawn`.
- In early builds a claim needed a bedroom.

**Factions:** created from the user panel, with a short **tag + colour** that can show over members' heads. Admin gates: `FactionDaySurvivedToCreate`, `FactionPlayersRequiredForTag`. Tags have been unique since B35.23 ([Build 35](https://pzwiki.net/wiki/Build_35)).

### What we adopt (§a)
- **Status model.**
  - Every need is a 0–100 float with **4 escalating tiers**. Our name is "**signals**", not moodles.
  - Starting thresholds (from PZ):
    - hunger 15/25/45/70
    - thirst 13/25/70/85
    - fatigue 60/70/80/90 (sleep allowed ≥60)
    - exertion 25/50/75/90 (% of endurance spent)
    - boredom 25/50/75/90
    - stress 25/50/75/90
    - unhappiness 20/45/60/80, scaling timed actions ×1.25/1.5/1.75/2.0
    - wetness 15/40/70/90
    - core temperature: cold <36.5/35/30/25 °C, hot >37.5/39/40/41 °C
  - Positive tiers: fed and warm.
- **Encumbrance.**
  - Carry capacity = `6 + f(Strength)`, following the PZ table (6→20, default 12).
  - Load tiers at 100/125/150/175%. At 150% and above, no stamina regen and slow damage down to 75% health.
- **Health.**
  - 17 body parts, each holding a wound list.
  - Wound types: scratch, laceration, deep wound, bite, burn, fracture, lodged glass/shard.
  - Heal hours as in PZ: scratch 7–15, laceration 10–20, deep 15–20 once stitched, bite 50–80, burn 50–100, fracture ~2–8 in-game weeks with splint multipliers.
  - **Neck wounds bypass the health cap.**
  - Treatments: bandage (clean → dirty timer), sterilise, disinfect, stitch, splint, extract glass.
  - Wound infection from dirty dressings is a nuisance, not a killer.
- **"Corruption" replaces Knox.**
  - Our simulation-glitch infection uses **7% / 25% / 100%** transmission for scratch / laceration / bite. It is server-configurable.
  - Hidden 72 h timeline: 1–4 h anxiety, 5–12 queasy, 13–24 nauseous, 25–48 sick, 49–71 fever, then death and **re-instantiation as an entity**.
  - Symptoms show only as signals and scanner readouts, never a direct "infected" flag. (Our twist: the scanner could detect it at a cost.)
- **Nutrition.**
  - Track calories + carbs/fat/protein. Weight starts at 80 and uses PZ's gain/loss formulas and bands.
  - Food uses per-item `freshDays`/`rotDays`. Cold storage ×5 and frozen ×50 only while "power" holds.
  - Utilities fail randomly on day 0–30, so world power and water decay.
- **Sleep.**
  - Need ≈9 h/day, minimum 3 h, maximum 16 h.
  - Bed quality multiplies recovery.
  - Nightmare base 5%, scaled by stress.
  - Noise above a threshold wakes the sleeper.
  - In co-op, sleep fast-forward needs **all players asleep**. This is our decision, not PZ's.
- **Skills.**
  - Use PZ's XP curve: 75…9,000 regular, ×20 for passive.
  - Books/tapes give ×3/5/8/12/16 multipliers per 2-level band.
  - Start with a trimmed list (~14 skills): Fitness, Strength, Sneaking, Nimble, Blunt, Blade, Carpentry, Electrical, Mechanics, First Aid, Cooking, Farming, Foraging, Trapping, plus one simulation-specific skill such as "Debugging".
- **Traits and occupations.** Point-buy with +8 base. Include the sensory traits that map to our systems: Keen Hearing, Eagle Eyed, Cat's Eyes, Inconspicuous, Graceful, Dextrous/All Thumbs, Organized/Disorganized.
- **Inventory.**
  - Two-pane layout: player containers on the left, nearby world containers + floor on the right.
  - Every transfer is a **timed action**:

    ```
    base = 120 within own containers (50 to or from world containers)
         × min(weight, 3) × max(destFill, 0.4)
    floor drops ×0.1–0.2; Dextrous ×0.5; All Thumbs ×4; moving ×1.5
    ```
  - Worn bags reduce weight 50–70% and have hard capacities. Equipped items are lighter.
  - "Loot all" cancels if the player moves.
- **World interactions.**
  - Barricade: up to 4 planks/side, ≤2 keep line of sight. Plank HP ~1,000–1,500; metal sheet 5,000–7,500.
  - Smash window (noise) → remove glass → climb through (glass-cut risk if skipped).
  - Curtains or sheets block line of sight.
  - Sheet rope for upper floors.
  - Furniture: pick up / place / rotate / disassemble (tool sets) / sledge-destroy.
- **Building.** Frame → wall tiers at skill 2/4/6. Wall HP 490 → 650 with skill. Crates hold 40/60 by skill.
- **Farming.**
  - Furrow → sow (seed packets of 5) → water in 10-unit steps.
  - Phases: seedling, young, ready, seed, rot.
  - Water and disease bands as in the B41 rules (§a.12).
  - Diseases: three, each with a crafted counter-spray.
- **Foraging.** Radius 3–10 tiles (15 max), +0.7/level. Weather −75% max, dark −95% max (blind at ≥50%), headgear −75%.
- **Trapping.** Hourly rolls, catch chances 25–40%, nocturnal animal windows, trap strength vs bait loss.
- **Vehicles (if included).** Keys found in ignition, glovebox, on nearby corpses, or in nearby houses. Hotwire success 50% at quality ≤50 down to 5% at ≥95, and failure is loud. Parts with condition. Engine loudness 55–220 tiles.
- **Noise.**
  - Base volumes: walk 7, sprint 14, sneak 3.5, shout 30, gun 30–200, alarm 150–600.
  - Occlusion: walls and doors cut volume.
  - Separate **radius** from **attractiveness**.
- **Vision.**
  - ~160° forward cone with a short-radius 360° awareness circle behind (hearing). Eagle Eyed widens it to 180°.
  - Panic and fatigue narrow the cone. Darkness and fog shrink range (fog clamp 10–20 tiles for creatures).
  - Render everything outside line of sight darkened, as PZ does.
- **Multiplayer.**
  - Proximity voice from 10 tiles (full volume) to 100 tiles (silent). Push-to-talk default.
  - Walkie-talkies on numbered frequencies with range tiers of 750 / 2,000 / 8,000 / 16,000 tiles.
  - Claimable safehouses with owner and member lists, plus respawn and trespass toggles.
  - Factions with a tag and colour.

---

## b. Backrooms canon and visual language

### b.1 The 2019 origin: the Level 0 image story
- **May 12, 2019.** An anonymous user on 4chan's paranormal board **/x/** started a thread asking for *"disquieting images that just feel 'off'"*. The photo above it was a yellow-wallpapered, empty, carpeted room under fluorescent ceiling lights ([Wikipedia: The Backrooms](https://en.wikipedia.org/wiki/The_Backrooms)).
- **The reply that named it** (verbatim from the circulated screenshot; see the image list in the appendix):
  > "If you're not careful and you noclip out of reality in the wrong areas, you'll end up in the Backrooms, where it's nothing but the stink of old moist carpet, the madness of mono-yellow, the endless background noise of fluorescent lights at maximum hum-buzz, and approximately six hundred million square miles of randomly segmented empty rooms to be trapped in. God save you if you hear something wandering around nearby, because it sure as hell has heard you"
- **The photo's origin.** It stayed unidentified until **May 2024**. A Backrooms Discord community traced it via the Wayback Machine to an archived **March 2003** web page. It shows a former furniture store in **Oshkosh, Wisconsin**, photographed during renovation into a **HobbyTown** branch around 2002 ([Wikipedia](https://en.wikipedia.org/wiki/The_Backrooms)).
  - A Wikimedia Commons record was found linked: [File:HobbyTown USA Oshkosh interior under construction 2002 (The Backrooms).jpg](https://commons.wikimedia.org/wiki/File:HobbyTown_USA_Oshkosh_interior_under_construction_2002_(The_Backrooms).jpg). It was not opened.
  - The lesson: **it is a real place, slightly off**. No surrealist fabrication.
- **Afterwards:**
  - "Liminal space" image culture grew around it. [r/LiminalSpace](https://knowyourmeme.com/memes/liminal-spaces-images-with-elegiac-auras-dreamcore) started on Aug 14, 2019.
  - The @SpaceLiminalBot Twitter account started Aug 1, 2020.
  - Viral photo sets spread in April 2020, during COVID-era empty public spaces ([Meme.com](https://meme.com/memes/liminal-spaces), [Wikipedia: Liminal space (aesthetic)](https://en.wikipedia.org/wiki/Liminal_space_(aesthetic))).

### b.2 Community levels: summaries for inspiration only
There are two big fan canons. Both say that levels differ between versions and get rewritten often:
- the **Wikidot Backrooms Wiki** ([Levels list](https://backrooms-wiki.wikidot.com/normal-levels-i)), CC BY-SA 3.0;
- the **Fandom Backrooms Wiki** ([Level Database](https://backrooms.fandom.com/wiki/Level_List)).

| Level | Gist (visual/spatial hooks) | Sources |
|---|---|---|
| **0 "Tutorial Level" / "The Lobby"** | Non-Euclidean back rooms of a dated retail space. Mono-yellow wallpaper, worn **moist carpet** (the liquid is "not water"), scattered outlets, **inconsistently placed fluorescent lights** with a constant **hum-buzz** louder than real fluorescents (migraines). Walking straight can loop you back. Variants: blood-red rooms, pitch-black halls, the "Manila Room" (manila walls, dull orange-tinted light). | [Fandom L0](https://backrooms.fandom.com/wiki/Level_0), [Wikidot archived L0](https://backrooms-wiki.wikidot.com/archived:level-0) |
| **1 "Habitable Zone"** | Huge **concrete warehouse**: bare walls and pillars, exposed rebar, **low fog** with puddles, stairs and elevators. Water and electricity work. **Lights flicker into short blackouts**, and creatures appear during them. **Supply crates** appear behind you or after a flicker and can vanish when unobserved. | [Wikidot L1](https://backrooms-wiki.wikidot.com/level-1), [archived](https://backrooms-wiki.wikidot.com/archived:level-1) |
| **2 "Pipe Dreams"** (archived; now "Abandoned Utility Halls") | Dark grey **concrete maintenance tunnels**, pipes and vents leaking black viscous liquid. **Heat zones of 43 °C** or more near loud machinery at hall ends. | [archived L2](https://backrooms-wiki.wikidot.com/archived:level-2) |
| **3 "Electrical Station"** | Narrow **brick corridors** (inconsistent colours), dusty concrete floors, dim fluorescents, pipes with rushing liquid. Indestructible **metal bars** block halls. Very dangerous. | [Wikidot L3](https://backrooms-wiki.wikidot.com/level-3) |
| **4 "Abandoned Office"** | Empty office floor with almost no furniture. **Windows are blacked out, and un-blacked windows are traps.** Water coolers, vending machines, and fountains. Easy to enter and leave. A trimmed sublevel 4.2 is a "parking lot of fog". | [Wikidot L4](https://backrooms-wiki.wikidot.com/level-4), [4.2](https://backrooms-wiki.wikidot.com/trimmed:level-4-2) |
| **5 "Terror Hotel"** | Endless 1920s–30s hotel. A hub ballroom ("Beverly Room / Eternal Ballroom") opens onto the Main Hall or a cramped, hot **Boiler Room** of tangled pipes. A casino sublevel. | [Wikidot L5](https://backrooms-wiki.wikidot.com/level-5), [5.1](https://backrooms-wiki.wikidot.com/level-5-1) |
| **6 "Lights Out"** | **Total darkness; no light source works.** Mostly described through sound: whispers, hallucinated relatives. Stairs lead down to Level 7. | [mirror summary](https://a-syncbackroomsinvestigationwiki.webador.es/level-6-lights-out), top-rated on Wikidot |
| **7 "Thalassophobia"** | Flooded furnished room (boat, scuba gear) opening onto an **infinite ocean**. Deep zones and an "Abyss". | [mirror summary](https://a-syncbackroomsinvestigationwiki.webador.es/level-7-thalassophobia) |
| **9 "The Suburbs"** | Endless **suburb at perpetual midnight**. Furnished houses where electrics don't work. Mostly dead streetlamps, some flickering. **Two houses clipped into each other.** Streets are the danger zone, and fog spawns threats. Walking off the path into the fields leads elsewhere. | [Wikidot L9](https://backrooms-wiki.wikidot.com/level-9) |
| **11 "Endless City"** (archived) / "City That Never Sleeps" | Endless city, mostly safe with few entities. Fandom version: smog and pollutants. Sublevels include rooftops with strong winds ("The Skyscrape") and a flooded city. | [Wikidot L11](https://backrooms-wiki.wikidot.com/level-11), [archived](https://backrooms-wiki.wikidot.com/archived:level-11), [Fandom 11.3](https://backrooms.fandom.com/wiki/Level_11.3) |
| **37 "Sublimity" (Poolrooms)** | Interconnected rooms half-submerged in **lukewarm** water. **Pristine white ceramic tile everywhere**, identical tiles, the only other colour the blue-green water. Sublevel 37.1 "Deep End": damaged tiles, frigid 17–21 °C water. 37.2 "Sunlit Pools": knee-deep clear water. | [Fandom L37](https://backrooms.fandom.com/wiki/Level_37), [Wikidot L37](https://backrooms-wiki.wikidot.com/level-37) |
| **188 "Courtyard of Windows"** | Dim, cool **courtyard ringed by hotel-like windows**. Open curtains show rooms (or other places). Glowing closed curtains show silhouettes that can pull you in. Dark curtains are locked. Distant dark figures approach about an hour after you see them. The current English Wikidot moved this concept to **881**: about 100–200 equally spaced windows, many of them **window entities**. | [Fandom JA L188](https://backrooms.fandom.com/ja/wiki/Level_188), [Wikidot L881](https://backrooms-wiki.wikidot.com/level-881), [Fandom 188.8](https://backrooms.fandom.com/wiki/Level_188.8) |
| **283** | Versions conflict. Wikidot **"PlayLand"**: a megastructure of linked **indoor playgrounds** with no visible ground floor, ~1 m plastic tubes, foam labyrinths, small food-court "lounges", Class 3. Fandom "Hide or Scream": flat plain of pillars. | [Wikidot L283](https://backrooms-wiki.wikidot.com/level-283), [Fandom L283](https://backrooms.fandom.com/wiki/Level_283) |
| **"Level Fun"** (being rewritten) | Party rooms: winding halls lined with **multicolour vinyl tile** and children's-party rooms with **balloons**. Party décor anywhere is a warning sign. Later tied to a cruise ship ("SS Fun"). Signature "=)" smiley. | [Fandom Party Rooms](https://backrooms.fandom.com/wiki/Level_Fun/The_Party_Rooms), [Wikidot forum](https://backrooms-wiki.wikidot.com/forum/t-15467926/level-fun), [L26](https://backrooms-wiki.wikidot.com/level-26) |
| **Endless parking** | Level 22 "Ruins Left Behind": an infinite car park. Level 940: a garage inside an infinite parking lot (the experience of being lost). Level 35: an empty car park, not infinite. Fandom 136: an outdoor lot in starless night. | [L22](https://backrooms-wiki.wikidot.com/level-22), [L940](https://backrooms-wiki.wikidot.com/level-940), [L35](https://backrooms-wiki.wikidot.com/level-35), [Fandom 136](https://backrooms.fandom.com/wiki/Level_136) |
| **Infinite mall** | Level 33 "The Infinite Mall": empty mall, mostly bare stores and food courts. Fandom 121 "Vacant Plaza": food courts with decaying food. 6.1 "The Snackrooms": endless cafeteria. | [L33](https://backrooms-wiki.wikidot.com/level-33), [Fandom 121](https://backrooms.fandom.com/wiki/Level_121), [6.1](https://backrooms-wiki.wikidot.com/level-6-1) |
| **Liminal school** | Level 190 "School Detention": a high-school hallway with classrooms, some doors won't open. Fandom 806 "Back to School": infinite modern school. Fandom 896 "Square-Loop Schoolhouse": looping halls. | [L190](https://backrooms-wiki.wikidot.com/trimmed:level-190), [Fandom 806](https://backrooms.fandom.com/wiki/Level_806), [Fandom 896](https://backrooms.fandom.com/wiki/Level_896) |

### b.3 Entity archetypes (summary only; ours must be original)
- **Smilers:** only glowing **eyes and teeth** visible in the dark. They are hurt by light and fire ([Fandom Entity 3](https://backrooms.fandom.com/wiki/Entity_3)).
- **Hounds:** pack hunters. Packs of 10–40 corner prey and block exits ([Fandom Entity List](https://backrooms.fandom.com/wiki/Entity_List), [Wikidot L84](https://backrooms-wiki.wikidot.com/level-84)).
- **Skin-Stealers:** large humanoids that **wear victims' skin** as a disguise. Tell: translucent blood ([Wikidot Entity 10](https://backrooms-wiki.wikidot.com/entity-10)).
- **Facelings:** faceless, skinless humanoids. Mostly docile, and their numbers track humans. Variants: shadow facelings, and memory facelings that **look like a loved one** ([Wikidot Entity 9](https://backrooms-wiki.wikidot.com/entity-9)).
- **Partygoers:** party-themed predators that use décor and balloons as lures and work in teams ([Wikidot Entity 67](https://backrooms-wiki.wikidot.com/entity-67)).
- **Deathmoths:** chimeric moths in castes (Common, Praetorian, Empress). Females swarm-hunt ([Wikidot Entity 4](https://backrooms-wiki.wikidot.com/entity-4)).
- **Wretches:** degenerated former humans with crude weapons, sensitive to sound and light ([Fandom Entity List](https://backrooms.fandom.com/wiki/Entity_List), [L2.1](https://backrooms-wiki.wikidot.com/submission:level-2-1-locked)).
- **Windows:** fake windows that are entities, common in offices and courtyards. Advice: don't approach office windows ([Wikidot entities](https://backrooms-wiki.wikidot.com/entities), [L881](https://backrooms-wiki.wikidot.com/level-881)).

### b.4 Kane Pixels' series
Sources: [Wikipedia: Backrooms (web series)](https://en.wikipedia.org/wiki/Backrooms_(web_series)), [Kane Parsons](https://en.wikipedia.org/wiki/Kane_Parsons), [fan wiki](https://kanepixelsbackrooms.fandom.com/wiki/Async_Research_Institute).
- **"The Backrooms (Found Footage)"** was uploaded **Jan 7, 2022**. A cameraman noclips into the Backrooms while shooting a film.
- The series grew to ~25 YouTube shorts. It is presented as **early-1990s camcorder / VHS found footage** around a fictional organisation, the **Async Research Institute** (**not to be copied**).
- An **A24 feature film** directed by Parsons was released **May 29, 2026**.
- **Takeaway:** the VHS/camcorder grammar and "institution that explored it" framing are genre tropes now. Avoid Async's name, logo, and specifics.

### b.5 Why liminal spaces feel off: recurring design rules
Sources: [Wikipedia: Liminal space (aesthetic)](https://en.wikipedia.org/wiki/Liminal_space_(aesthetic)), [Aesthetics Wiki: Liminal Space](https://aesthetics.fandom.com/wiki/Liminal_Space), [Diel & Lewis 2022](https://orca.cardiff.ac.uk/id/eprint/151790), [IFLScience](https://www.iflscience.com/backrooms-plays-on-our-fear-of-liminal-spaces-heres-why-they-freak-us-the-hell-out-84116), [Mental Floss](https://www.mentalfloss.com/science/psychology/why-are-liminal-spaces-creepy), [Talkspace](https://www.talkspace.com/blog/what-is-a-liminal-space/), [HowStuffWorks](https://science.howstuffworks.com/engineering/architecture/liminal-spaces), [The Exit 8](https://en.wikipedia.org/wiki/The_Exit_8), [vackrooms](https://github.com/pablostanley/vackrooms).

1. **Transitional, purpose-built places:** stairwells, corridors, waiting rooms, hotels, malls, parking lots, schools out of term, pools. They are built for passing through, or for crowds.
2. **Absence of people where people are expected.** Diel & Lewis found that **human presence *reduces* uncanniness of distorted public spaces but *increases* it in private rooms**.
3. **Structural deviation from familiar configural patterns** drives uncanniness. Their study found an architectural "uncanny valley" (cubic N-curve vs realism). In practice: slightly wrong proportions, doors to nowhere, rooms one step too big.
4. **Repetition with micro-variation.** The same tile, panel, or wallpaper goes on forever, with tiny anomalies. *The Exit 8* turns this into a mechanic: spot the anomaly in a looping subway corridor.
5. **Wrong scale and impossible extent.** "Six hundred million square miles". Straight lines that loop. Non-Euclidean connections.
6. **Lighting:** cool-toned **fluorescent troffers**, flat and shadowless, some flickering or dead. Hum.
7. **Dated décor:** late-20th and early-21st-century architecture, **linoleum, drop-ceiling tiles**, 90s/2000s furniture.
8. **Lo-fi capture:** poor exposure, compression, camera noise, VHS artefacts.
9. **Missing cues and uncertainty.** No signage, no destination, ambiguous threat, so the brain reads ambiguity as threat.
10. **Mutation when unobserved.** The browser game *vackrooms* mutates unseen sections while keeping landmarks fixed.

### What we adopt (§b)
- **Premise only.** Use the generic "noclip" idea: falling through the simulation's geometry into its unused back rooms.
  - Use **our own zone names and IDs** (e.g., `SECTOR-YELLOW`, `POOL HALL`, `NIGHT SUBURB`).
  - No Wikidot or Fandom names, numbers, entities, or lore objects (CC BY-SA 3.0).
  - No Async references.
- **Noclip transitions** are diegetic "clipping" glitches: walk into a wall seam, fall through floors, desync events. This fits our "Matrix-like simulation" framing.
- **First zone, the yellow office maze:**
  - Chevron/stripe mono-yellow wallpaper (a 32–64 px texture, tinted #C9B458–#D8C77A).
  - Damp beige carpet with darker wet blotches and a "squelch" footstep set.
  - 2×4 drop-ceiling grid with **fluorescent troffers at irregular spacing**, ~10–20% of them dead or flickering.
  - Constant 120 Hz hum. Random room segmentation and loop-backs.
- **Zone archetype roster** (our versions):
  - Concrete warehouse with supply caches that only spawn when unobserved.
  - Hot pipe tunnels (temperature hazard at ≥43 °C).
  - Brick electrical corridors with barred halls.
  - Abandoned office whose windows are hazards.
  - Darkness-only zone (lights fail; navigation by sound and scanner).
  - Flooded rooms.
  - Midnight suburb (houses as shelters, streets dangerous, clipped houses).
  - White-tile **pool halls** (lukewarm water, echo, caustics).
  - Playground megastructure.
  - Endless parking garage.
  - Dead mall / food court.
  - Looping school.
  - A courtyard of windows (watched-by-windows mechanic).
- **Liminal rules as level-gen constraints:**
  - Modular tiles with **≤5% anomaly rate**.
  - No NPCs in public zones, but "lived-in" private rooms (abandoned meals, warm TV).
  - Flat, cool light.
  - Dated materials.
  - Unseen chunks may **re-roll** while the player is away, with fixed landmarks as anchors.
  - "Spot the anomaly" puzzles as optional exits.

---

## c. Dreamcore, weirdcore, and liminal-photo aesthetics

**Dreamcore** ([Aesthetics Wiki: Dreamcore](https://aesthetics.fandom.com/wiki/Dreamcore), [NYLON](https://nylon.com/fashion/dreamcore-aesthetic-weirdcore), [nssmag](https://test5.nssmag.com/en/lifestyle/28071/what-is-dreamcore-aesthetics)):
- A surreal aesthetic built on dream, daydream, and nightmare motifs. It is **softer, more ethereal, and "calm"** than weirdcore.
- **Palettes:** rainbow, **pastel**, or neon.
- **Motifs:** eyes, clouds and rainbows, skies that replace walls or floors, mushrooms, angels and winged figures, cryptic red text, voids, flowers, CRT TVs, playgrounds (Chinese dreamcore), fields and prairies, suburban scenes.
- **Origins:** Tumblr around 2018 (fan wiki), popularised on TikTok in the early-to-mid 2020s.
- **Mood:** nostalgia, déjà vu, and unease. Critics call the visuals repetitive.

**Weirdcore** ([Wikipedia: Weirdcore aesthetic](https://en.wikipedia.org/wiki/Weirdcore_aesthetic) (flagged for deletion), [Aesthetics Wiki: Weirdcore](https://aesthetics.fandom.com/wiki/Weirdcore)):
- Unsettling, nostalgic amateur imagery meant to evoke confusion, derealisation, alienation, and **anemoia**.
- **Motifs:** low-quality digital images, amateur editing, compression, word-art, primitive graphics, odd borders, out-of-context fragmentary **plain text**, VHS/glitch noise, chromatic aberration, floating eyes.

**Liminal space photography** ([Aesthetics Wiki: Liminal Space](https://aesthetics.fandom.com/wiki/Liminal_Space), [Poolcore](https://aesthetics.fandom.com/wiki/Poolcore), [Mallsoft](https://aesthetics.fandom.com/wiki/Mallsoft)):
- **Subjects:** early-morning malls, empty parking lots, school hallways in summer, roadside attractions, playgrounds, vacant houses, dead malls.
- **Look:** linoleum, ceiling tiles, cool fluorescent light, poor lighting, camera noise.
- **Poolcore:** tiled surfaces, water, blue palettes, light refraction. Eerie yet peaceful.
- **Dead-mall vs golden-era mall:** shuttered stores and decay vs bright, busy spaces.

**Notable examples and communities:**
- **r/LiminalSpace** (since Aug 2019; 500k+ members by Nov 2022). Source: [Know Your Meme](https://knowyourmeme.com/memes/cultures/liminal-spaces-images-with-elegiac-auras-dreamcore).
- The **@SpaceLiminalBot** account.
- **Jared Pike's "The Poolrooms"** renders, adapted into Tensori's VHS-presented walking sim [**POOLS** (2024)](https://en.wikipedia.org/wiki/Pools_(video_game)). It has no monsters. Death rewinds the tape.
- [**The Exit 8**](https://en.wikipedia.org/wiki/The_Exit_8): Kotake Create, UE5, Nov 2023. Anomaly-spotting in a looping corridor.
- The browser game [**vackrooms**](https://github.com/pablostanley/vackrooms): three.js/WebGPU, seeded endless maze, VHS pipeline, HRTF audio.

### What we adopt (§c)
- **Two moods, mapped to gameplay:**
  - **Dreamcore = "calm anomaly" zones:** rest, restock, sanity recovery. Pastel sky blues and whites, soft bloom, low contrast, painted-sky ceilings, playgrounds, lonely houses in misty fields, pool halls.
  - **Weirdcore = "hostile anomaly" zones:** harsh compression, glitch text, eye motifs, red cryptic signage.
- **Artificial skies.** Sky domes and painted-cloud ceilings indoors, where the sky "replaces" a ceiling. Rendered as a low-res cloud texture with **posterised gradients** (6–10 bands).
- **Cryptic text.** Signage and graffiti in plain sans-serif or word-art. Short and out of context, e.g. "you were here before". Use sparingly (≤1 per screen).
- **Eyes motif.** Use sparingly as a "you are observed" tell, tied to the observation mechanic in §f.
- **Scanner photos and recordings** get a lo-fi filter: compression blocks, noise, timestamp, a slight colour cast. This keeps "capture" diegetic.

---

## d. Rendering references

### d.1 The PS1 aesthetic: what made it look that way
Sources: [Pikuma: How PlayStation graphics & visual artefacts work](https://pikuma.com/blog/how-to-make-ps1-graphics), [PlayShader One (three.js)](https://github.com/BucketOSoftware/playshader-one), [psx-spx](https://psx-spx.consoledev.net), [Godot PS1 shader](https://godotshaders.com/shader/ps1-shader/), [PSX Cycles docs](https://superhivemarket.com/products/psx-cycles/docs), [itch.io VFX breakdown](https://itch.io/devlog/849811/vfx-breakdown-lets-go-retro.amp), [Codrops: PS1 jitter shader in R3F](https://tympanus.net/codrops/?p=80278), [GTE notes mirror](https://otakon273.duckdns.org/Consoles/RomHacking.net/rhdn_20240801/documents/[124]gte.txt).
- **Resolution:** low, with 320×240 common.
- **GTE:** fixed-point maths. Integer screen-space vertex coordinates cause **vertex jitter/wobble**.
- **Affine texture mapping:** no perspective correction, so textures warp. Developers hid it by subdividing big polygons.
- **No depth buffer.** Primitives are sorted into **ordering tables** by *average Z per polygon*, which causes sorting and z-fighting artefacts.
- **Colour:** **15/16-bit colour** (5:5:5) processed at 24 bpp, truncated with **4×4 dithering**.
- **Gouraud** (per-vertex) shading.
- **Fog** via GTE **depth cueing**: interpolate colour toward a "far colour" (DPCS/DPCT/INTPL).
- **Memory:** **1 MB VRAM**. Textures up to 256×256 and mostly **4/8-bit CLUT palettes**.
- **Filtering:** nearest-neighbour, with **no bilinear/trilinear filtering and no mipmaps**, which gives shimmering.
- **Polycounts:** Lara Croft ~300, Crash ~500.

### d.2 Modern "3D pixel art" (t3ssel8r-style)
**t3ssel8r** ([YouTube channel](https://www.youtube.com/@t3ssel8r)):
- Videos:
  - Pixel-art upscaling shader [d6tp43wZqps](https://www.youtube.com/watch?v=d6tp43wZqps). DarknessFX's [M_PixelArt_Upscaling](https://github.com/DarknessFX/UEMaterials) credits it, and a [Unity thread](https://discussions.unity.com/t/filtering-for-modern-pixel-art-graphics/924291) cites a t3ssel8r video titled *"Crafting a Better Shader for Pixel Art Upscaling"*.
  - ["Pixel Art Shader Updates"](https://www.youtube.com/watch?v=ZsMHY4LDyRE).
  - [Procedural animation / second-order dynamics](https://www.youtube.com/watch?v=KPoeNZZ6H4s): parameters f, ζ, r, solved with semi-implicit Euler.
- **Cascadeur interview** ([link](https://cascadeur.com/blog/general/making-an-animation-for-a-3d-pixel-art-game)): "true 3D assets in-engine", with blended and shared animations.

**The pixel-perfect camera trick** ([Unity forum summary](https://discussions.unity.com/t/recreating-t3ssel8rs-3d-pixel-art/928878/2), [UPixelator docs](https://github.com/Radivarig/UPixelator_Documentation), [Texel Splatting preprint](https://arxiv.org/html/2603.14587v1)):
1. Render the 3D scene with an **orthographic** camera into a low-res target with **nearest** filtering.
2. **Snap the camera to the texel grid** along its own right and up axes. This kills "pixel creep" and shimmer.
3. Then **shift the upscaled output** by the snapping error (sub-texel remainder) in screen space, so motion is smooth.
4. Render a slightly larger target (+1 texel border) to hide the shifted edge.
5. Orthographic projection makes this exact. Perspective cannot be snapped for all depths at once.

**David Holland**, ["3D Pixel Art Rendering" (2024-09-24)](https://www.davidhol.land/articles/3d-pixel-art-rendering/). The title found was this one, not "Crafting a 3D pixel art scene". Built in a custom Godot 4.3:
- **Outlines** from a depth + normal edge detector, with a **1-texel kernel** (up/down/left/right only).
- **Convex-edge highlights** only, detected via neighbour normal cross products plus heuristics.
- **Camera:** snap to view-aligned texel steps, then offset the output by the snap error.
- **Water fix:** outlines had to be fixed under refractive water.

**Edge detection details** ([Godot outline shader](https://godotshaders.com/shader/3d-pixel-art-outline-highlight-post-processing-shader/), [long-distance fix](https://godotshaders.com/shader/3d-pixel-art-outline-highlight-shader-fix-for-long-distance/)):
- Divide depth differences by pixel depth so far surfaces don't false-edge.

**Related examples:**
- [Unity isometric pixel pipeline](https://github.com/bababuyyy/unity-isometric-pixel-pipeline): toon shading, GPU grass, cloud shadows, sharp upscale.
- [KERN shader pack](https://github.com/JaWald/KERN-Shaderpack): toon colour banding, outline, downsample, CRT.

### d.3 three.js implementation (what our stack already ships)
`three@0.186.1` includes `examples/jsm/postprocessing/RenderPixelatedPass.js`. Sources: [docs](https://threejs.org/docs/pages/RenderPixelatedPass.html), [source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/postprocessing/RenderPixelatedPass.js), [example](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_postprocessing_pixel.html) by [Kody King](https://github.com/KodyJKing).

**The pass:**
- `new RenderPixelatedPass(pixelSize, scene, camera, { normalEdgeStrength: 0.3, depthEdgeStrength: 0.4 })`.
- Renders beauty and normal targets at `width/pixelSize × height/pixelSize` with `NearestFilter`.
- The shader darkens **depth edges**: `1 − depthEdgeStrength·dei`.
- It brightens **normal (crease) edges**: `1 + normalEdgeStrength·nei`. A 4-neighbour kernel picks a single-pixel edge. Only the shallower pixel draws normal edges, biased toward the normal `(1,1,1)`.
- A TSL/WebGPU `PixelationPassNode` exists with the same defaults.

**The example** uses `pixelSize: 6`:
- `OrthographicCamera` with `position.y = 2·tan(π/6)` and `z = 2`. That is a **30° downward pitch**.
- Snapping options: `pixelAlignedPanning`, `pixelAlignedObjects`, `rotationSnap: 15°`, `cameraRotationSnap: 9°`, `cameraZoomSnap: 0.1`.
- `pixelAlignFrustum()` shifts the camera's `left`/`right`/`top`/`bottom` by the fractional texel offset of the camera position projected on its right and up axes.

### d.4 Isometric camera conventions (Project Zomboid)
Sources: [PZwiki: New Tiles](https://pzwiki.net/wiki/New_Tiles), [Pikuma: Isometric projection](https://pikuma.com/blog/isometric-projection-in-games), [dee.underscore.world: isometric tiles](https://dee.underscore.world/blog/isometric-tiles/).
- **PZ uses 2:1 "isometric" (really dimetric) pixel tiles.** Tile sprites are **64×128** PNGs.
- In 2:1 dimetric, lines go 1 px up for 2 px across (tan = 0.5, ≈26.565° on screen). A flat tile is n tall by 2n wide.
- **Matching camera:** yaw 45°, **pitch 30°** down from horizontal (true isometric is 35.264°). The pitch matches the three.js example above.

**Wall cutaway and occlusion:**
- **PZ B41:** walls go transparent when you aim or target the ground outside a building ([Steam discussion](https://steamcommunity.com/app/108600/discussions/0/592887423803878372)).
- **PZ B42:** walls cut away when you look at them in combat stance, and a cutaway also applies to trees. See the reference screenshots in the appendix.
- **The Sims:** offers **walls up / walls down / cutaway**. Cutaway keeps exterior walls up but drops walls between camera and Sims to floor lines ([EA forum](https://forums.ea.com/discussions/the-sims-4-gameplay-en/inner-walls-wont-cut-away-anymore/8694620)).
- **Generic options** ([Unity thread](https://discussions.unity.com/t/make-wall-partially-transparent-when-player-is-behind-it/78077), [GameDev.net](https://www.gamedev.net/tutorials/programming/general-and-gameplay-programming/hide-objects-blocking-player-view-r3215)):
  - Hide occluders.
  - Outline or silhouette the player.
  - Use a circular mask around the player.
  - **Screen-door (dithered) transparency** ([Godot](https://godotshaders.com/shader/dithering-screen-door-transparency/), [Unity](https://discussions.unity.com/t/custom-dither-transparency-shader/857090)): alpha-clip against a 4×4 Bayer threshold, so the object stays in the opaque pass. Watch out for shadows and deferred-rendering issues.

### What we adopt (§d)
- **Camera.**
  - Orthographic, **yaw 45°, pitch 30°** (2:1 dimetric).
  - Rotation in **90° steps** only, animated with eased snapping.
  - Zoom in discrete steps (`cameraZoomSnap`-style) so the texel grid stays stable.
- **Pixel pipeline.**
  - Render at an internal res of **~480×270 or 640×360**. Upscale by an **integer** factor with nearest filtering (`RenderPixelatedPass` or our own equivalent).
  - **Texel-snap** the camera, then **sub-texel offset** the final blit (Holland/t3ssel8r method).
  - Snap moving objects to the texel grid in camera space.
  - Animations at a stepped **12 fps** cadence for a sprite feel.
- **Outlines.** Single-pixel **depth edges darkened (0.4)** and **normal/convex edges brightened (0.3)**. Depth difference normalised by depth.
- **Textures.**
  - **32 px per metre-tile**, with 64 px for hero props.
  - Palette-limited: ~16–32 colours per material set.
  - `NearestFilter`, **mipmaps off** (or one mip with a negative bias for distant floors only).
- **PS1 seasoning, used sparingly.**
  - Optional **15-bit quantise + 4×4 Bayer dither** in the final pass. On by default at low strength.
  - **Depth-cue fog** toward a per-zone far colour.
  - Light **vertex snapping only on "glitched" objects and entities**, to keep the world stable.
  - Affine warping as a *glitch-state* effect, not the default.
- **Wall cutaway.**
  - Walls and props between camera and player within a radius (~4–6 tiles) **drop to a stub height (~0.3 m)** or **dither-fade** (4×4 Bayer screen-door, never alpha blending).
  - Roofs and upper floors hide when the player is indoors.
  - Doorway reveal extends slightly ahead of the player.
  - Everything outside the vision cone is drawn but **darkened and desaturated** (PZ-style).

---

## e. Handheld UI references

**Pip-Boy 3000** (Fallout 3/NV) ([Fallout Wiki: Pip-Boy 3000](https://fallout.fandom.com/wiki/Pip-Boy_3000), [Design and Development of the Pip-Boy model 3000](https://fallout.fandom.com/wiki/Design_and_Development_of_the_Pip-Boy_model_3000), [Wikipedia: Pip-Boy](https://en.wikipedia.org/wiki/Pip-Boy)):
- Worn on the left forearm. Monochrome screen, green by default.
- Three tabs:
  - **STATS:** condition, radiation, effects, S.P.E.C.I.A.L., skills, lifetime counters.
  - **ITEMS:** weapons, apparel, aid, misc, ammo.
  - **DATA:** quests, notes/holotapes, maps.
- Bethesda's design write-up describes a **CRT display under a hood**, **oversized knobs for gloved hands**, and a text-driven UI with **1-bit icons**.
- Interplay's original idea (Boyarsky): it should look like "old, clunky technology". Bethesda restyled it as Streamline Moderne.
- The left-side knobs forced the wearer to reach across the screen.

**Pip-Boy 3000 Mark IV** (Fallout 4) ([Fallout Wiki: Mark IV](https://fallout.fandom.com/wiki/Pip-Boy_3000_Mark_IV), [Pip-Boy Edition](https://fallout.wiki/wiki/Pip-Boy_Edition)):
- **Dials moved to the right.** A simple latch replaced the biometric lock and glove.
- **Monochrome vector display** with a configurable colour (green, or beige in power armour).
- **Radio** has its own tab. Fan replicas show **STAT / INV / DATA / MAP / RADIO**.
- The 2015 Pip-Boy Edition held a smartphone running a companion app.

**Other diegetic UIs:**
- **Dead Space RIG** ([Game Developer: video](https://gamedeveloper.com/design/video-designing-i-dead-space-i-s-immersive-user-interface), [Kill Screen](https://www.killscreen.com/how-dead-space-3-pulled-dieter-rams-and-instagram/), [Dead Space Wiki: RIG](https://deadspace.fandom.com/wiki/Resource_Integration_Gear), [Wikipedia: Isaac Clarke](https://en.wikipedia.org/wiki/Isaac_Clarke)):
  - Health is a **segmented spine light bar** (green → red). Stasis meter next to it. Ammo count on the weapon.
  - Anything not belonging to the character is placed "behind him".
  - Lead UI designer Dino Ignacio's GDC 2013 talk covers it.
- **Metro (2033/Last Light/Exodus)** ([Wikipedia: Metro Exodus](https://en.wikipedia.org/wiki/Metro_Exodus), [Digital Trends](https://digitaltrends.com/?p=2290365), [TrueAchievements walkthrough](https://www.trueachievements.com/game/Metro-Exodus/walkthrough/5)):
  - Minimal HUD. A **wrist unit shows the gas-mask filter timer**, which counts only in toxic air. A beep at <1 min.
  - Exodus has a compass on the wrist.
  - Earlier games' watch had a **light-exposure indicator**.
  - A **held map that flips to a handwritten journal** with the current objective.
- **Alien: Isolation motion tracker** ([Engadget](https://www.engadget.com/2014-03-19-making-everything-new-old-again-in-alien-isolation.html), [Xbox Wire](https://news.xbox.com/en-us/2014/09/24/games-8-awesome-retro-gadgets-in-alien-isolation/), [TechRadar](https://www.techradar.com/news/gaming/the-technology-of-fear-how-alien-isolation-will-scare-you-back-to-the-1970s-1267946), [Steam discussion](https://steamcommunity.com/app/214490/discussions/0/619569608606161607)):
  - Raising it **blurs the background** (depth of field). A trigger swaps focus. "Every action carries a risk."
  - Chunky monochrome device, too big to hold with a weapon.
  - **The ping can be heard by threats.**
  - Range is player-estimated at ~10–20 m. It misses stationary targets.
  - Lo-fi retro-futurism: CRTs, beige plastic, VHS-degraded video.
- **Firewatch map** ([Kill Screen](https://www.killscreen.com/printable-firewatch-maps-add-a-new-challenge-to-the-game/), [DualShockers](https://www.dualshockers.com/campo-santo-releases-printable-firewatch-maps-for-cooperative-playthrough-or-your-wall/), [GamingBolt review](https://gamingbolt.com/firewatch-review)):
  - A held paper map plus compass, with the player's own annotations.
  - The **"you are here" dot can be turned off**. Campo Santo released printable maps so a co-pilot can navigate.
- **Project Zomboid on a second handheld screen.** The [ZomboidDS](https://github.com/Space001000/ZomboidDS) mod/app puts Inventory, Here (context actions), Deck (speed, hotbar), **Status (moodles + injured body + treatments)**, Craft, Map, and Vehicle panels on a bottom screen. This is a close functional analogue to our scanner.
- **DIY handheld builds:**
  - [PipBoy-Pi5](https://github.com/SurvivorGrim/PipBoy-Pi5): Mk IV-style replica with rotary encoder.
  - [SirLefti/piboy](https://github.com/SirLefti/piboy): original enclosure with one big knob plus a button cluster. Tabs INV / SYS / **ENV** (temperature, pressure, humidity sensors) / RAD / DBG / CLK / MAP, a status bar, and a clock.

**CRT screen effects** ([libretro crt-royale](https://docs.libretro.com/shader/crt_royale/), [Emulation Wiki: CRT shaders](https://emulation.gametechwiki.com/index.php/CRT_Shaders), [Babylon.js CRT study](https://babylonjs.medium.com/retro-crt-shader-a-post-processing-effect-study-1cb3f783afbc), [crt-pi GLSL](https://gitea.com/akouzoukos/apotris/src/branch/main/assets/shaders/crt-pi.glsl)):
- **Scanlines:** sine or row-based darkening with a non-zero floor.
- **Barrel distortion:** radial UV scaling, with black outside the tube.
- **Phosphor masks:** aperture grille (fine at 1080p), slot mask, or shadow mask (needs 1440p–4K).
- **Bloom/glow** and **convergence offsets** (chromatic aberration).
- **Phosphor colours** ([Wikipedia: Monochrome monitor](https://en.wikipedia.org/wiki/Monochrome_monitor), [phosphor tables PDF](https://curtpalme.com/forum_archived/crt_phosphor_research_20090315.pdf), [Tube Time](https://tubetime.us/index.php/2015/10/)):
  - **P1 green:** peak **≈525 nm** (490–580), medium persistence (~20 ms).
  - **P3 amber** (listed at ~602 nm).
  - **P31:** a brighter green with very short (<1 ms) persistence.

### What we adopt (§e)
- **The scanner** (working name: "**the Handset**"; final name TBD, not Pip-Boy-like).
  - Silhouette: a chunky hand-held brick with a **single large rotary dial on the right** that selects tabs, a **4-button cluster + D-pad**, a hooded CRT window (~4:3), an amber activity LED, and a wrist strap.
  - Original iconography in a 1-bit style.
- **Tabs (draft).** `BODY` (17-part body diagram, wounds, treatments, signals), `PACK` (inventory/loot, two-pane), `ENV` (sensor readouts), `MAP` (paper-style), `COMMS` (voice, walkie frequencies, squelch), `LOG` (notes, objectives, recordings).
  - ENV readings: temperature, humidity, **hum frequency**, signal/glitch level, light level.
- **Diegetic cost.**
  - Opening the Handset **raises it into view, blurs the world (DoF)**, and occupies the hands: no attacks, walk only.
  - Optional **audible ping** for the ENV sweep that entities can hear (Alien: Isolation).
- **Map.**
  - Paper-map look. Annotations by the player.
  - **"You are here" toggle** (server option). Default on. Off for a hardcore co-op-navigator mode (Firewatch).
- **Screen look.**
  - **P1 green #33FF66-ish on near-black**, with amber and white themes.
  - Scanlines every 2 screen px at 20–30% depth. Barrel k ≈ 0.06–0.10. Vignette.
  - Bloom on bright glyphs. **~30–60 ms phosphor persistence** (motion trail). Tiny convergence offset.
  - Text in a bitmap font. Low-res render target (e.g., 320×240) inside the device.
- **World HUD minimal** (Metro / Dead Space style). Only critical signals show as small icons near the character. Everything else lives on the Handset.

---

## f. Creature and horror design inspiration (archetypes only)

**Trevor Henderson** ([Wikipedia: Trevor Henderson](https://en.wikipedia.org/wiki/Trevor_Henderson), [Siren Head wiki](https://trevorhenderson.fandom.com/wiki/Siren_Head), [Bloody Disgusting](https://bloody-disgusting.com/editorials/3958283/siren-head-explained-the-origins-of-trevor-hendersons-internet-horror-icon/), [Apex Magazine interview](https://www.apexbookcompany.com/blogs/apex-magazine/interview-with-artist-trevor-henderson)):
- A Canadian artist known for **Siren Head**, **Cartoon Cat**, and **Long Horse** (Instagram, 2018).
- **Siren Head:** ~12 m (≈40 ft), emaciated, skin like rusted metal. Two sirens on a pole-neck play **radio broadcasts, white noise, and human voices** to lure prey. Inspired by **numbers stations**. Camouflaged among telephone poles.
- **Method:** faux-found-footage. **Creatures composited into ordinary photos**, often tiny in frame or towering behind trees, with grainy, lo-fi realism.
- Film adaptations are in development.

**The Mandela Catalogue** ([Wikipedia](https://en.wikipedia.org/wiki/The_Mandela_Catalogue)):
- Alex Kister, 2021.
- **"Alternates"** are doppelgängers that psychologically torment victims to **take over their identity**. They hijack TVs, PCs, and GPS units.
- Presented as found footage. VHS-quality video in Act I, older digital video in Act II.

**Analog horror** ([Wikipedia: Analog horror](https://en.wikipedia.org/wiki/Analog_horror), [Local 58](https://en.wikipedia.org/wiki/Local_58)):
- Low-fi visuals, cryptic messages, few jump scares.
- Imitates 1960s–2000s TV, VHS, and **emergency broadcasts**. Kris Straub's *Local 58* (2015) popularised it.

**SCP-173** ([SCP Wiki](https://scp-wiki.wikidot.com/scp-173), [Wikipedia](https://en.wikipedia.org/wiki/SCP-173)):
- A statue that **cannot move while in direct line of sight**. Staff keep ≥3 people present and **announce blinks**.
- It moves extremely fast when unobserved (snaps necks).
- *SCP – Containment Breach* made this a blink mechanic.

**Uncanny creature design** ([Diel & Lewis 2022](https://orca.cardiff.ac.uk/id/eprint/151790), [KeenGamer](https://www.keengamer.com/articles/features/opinion-pieces/the-art-of-scary-monster-design), [Ulster blog](https://blogs.ulster.ac.uk/cainhenderson/?p=44)):
- Plausible anatomy with **one wrong twist**: a human gait on a dog's hips, extra joints.
- **Almost-human** beats monstrous: doppelgängers and zombies sit in the uncanny valley.
- **Silhouette first.** Blend real animals for plausibility.

### What we adopt (§f)
All creatures are original. Behaviour archetypes:
1. **Watcher.** Moves **only when no player's vision cone covers it**. In co-op, any player's cone counts, so teams coordinate "eyes on". It closes distance in bursts during blinks: lights flicker, a camera cut, or the Handset raised.
2. **Mimic.** Replays **captured player voice snippets** from proximity voice, opt-in, using a local buffer of ≤3 s. It also plays radio chatter or a teammate's name to lure players. The tell: radio-band EQ and slight pitch drift.
3. **Tall Ones.** Huge silhouettes **at the horizon** of outdoor zones (night suburb, car park). Mostly ambient, rarely approach. Sell scale through fog and lights (Henderson-style composition).
4. **Wrong Fauna.** Familiar small animals with one anatomical error (backwards knees, too-human eyes) that flee or flock. Low threat, high unease.
5. **Broadcast events.** Emergency-broadcast takeovers on in-world TVs, radios, and the Handset (analog-horror grammar) that warn or lie.

---

## g. Audio references

**Fluorescent hum and buzz:**
- **Mains hum** is at **twice the line frequency**: **100 Hz** on 50 Hz grids, **120 Hz** on 60 Hz grids. Magnetostriction makes transformer cores vibrate, with rich harmonics ([Wikipedia: Mains hum](https://en.wikipedia.org/wiki/Mains_hum), [Utility frequency](https://en.wikipedia.org/wiki/Utility_frequency)).
- Electromagnetic noise includes the "buzz of fluorescent lamps" ([Electromagnetically induced acoustic noise](https://en.wikipedia.org/wiki/Electromagnetically_induced_acoustic_noise)).
- **Magnetic ballasts:** light dips **120×/s** (on 60 Hz), and the ballast transformer hums.
- **Electronic ballasts:** run at **20–60 kHz** (20–100 kHz per IEEE). Flicker-free and quieter. A 50% drop in headache and eye-strain complaints.
- Sources for the ballast points: [CCOHS](https://ccohs.gc.ca/oshanswers/ergonomics/lighting_flicker.html), [IEEE](https://technav.ieee.org/topic/electronic-ballasts/), [UAF physics](https://ffden-2.phys.uaf.edu/212_fall2009.web/Neil_Schieber/page5.html).

**Decayed ballroom music: *Everywhere at the End of Time*** ([Wikipedia](https://en.wikipedia.org/wiki/Everywhere_at_the_End_of_Time), [The Caretaker](https://en.wikipedia.org/wiki/James_Leyland_Kirby)):
- The Caretaker (Leyland Kirby), 6 albums released 2016–2019, six months apart.
- Built from **1920s–30s ballroom 78s**, progressively degraded through the stages of dementia.
  - Stages 1–3: recognisable loops.
  - Stages 4–6: chaos, then drones.
- Leitmotif: recurring *"Heartaches"* recordings, each time more distorted.
- Inspired by *The Shining*'s haunted ballroom.
- Related genres: **hauntology** (vinyl crackle as signature; Burial; Ghost Box) ([Wikipedia](https://en.wikipedia.org/wiki/Hauntology_(music))). **Mallsoft** (vaporwave of malls: lounge, muzak, reverb; Cat System Corp.'s *Palm Mall*) ([Wikipedia](https://en.wikipedia.org/wiki/Mallsoft)).

**Dreamcore music** (informal sources: [Listencorp review](https://www.listencorp.co.uk/post/crossing-bridges---dreamcore-ost), [Rekkerd](https://rekkerd.org/rewind-samples-releases-dreamcore-ambient-sample-pack), [Epidemic Sound tag](https://www.epidemicsound.com/fr/music/themes/viral-trends-aesthetics/dreamcore/)):
- **Music-box and bell timbres** "covered in fuzz", pitched-down passages.
- Drones, lo-fi synth keys, **tape flutter, vinyl crackle**, rain and birdsong field recordings.
- Tempos of ~61–140 BPM.

**Procedural Web Audio techniques:**
- **Approach:** *Designing Sound* (Andy Farnell, MIT Press 2010) treats sound "as a process rather than data". It models physics first, then builds in Pure Data ([MIT Press Bookstore](https://mitpressbookstore.mit.edu/book/9780262014410)).
- **Footsteps:**
  - Perry Cook, *Modeling Bill's Gait*: heel/toe events, LPC resonances, particle density, and control envelopes per gait and material. Drivable from game collisions ([PDF](https://soundlab.cs.princeton.edu/publications/billsgait.pdf)).
  - Turchet / Serafin / Nordahl: ground materials as solid, aggregate, liquid, or hybrid. Surface feel comes from heel-toe and step spacing ([DAFx10 PDF](https://vbn.aau.dk/files/37619408/Serafin_Turchet_Nordahl_DAFx10_P82.pdf)).
- **Wind, rain, and noise beds:**
  - Fill an `AudioBuffer` with random values in [−1, 1], then `BiquadFilterNode` (lowpass/bandpass), then gain.
  - An **LFO → gain → filter.frequency** gives wind gusts. Layer several filtered noise sources for rain.
  - Sources: [HexShift: procedural textures](https://dev.to/hexshift/how-to-generate-procedural-audio-textures-in-the-browser-no-samples-needed-332l), [HexShift: procedural effects](https://dev.to/hexshift/how-to-create-procedural-audio-effects-in-javascript-with-web-audio-api-199e), [noise generation guide](https://docs.swmansion.com/react-native-audio-api/docs/guides/noise-generation), [O'Reilly Web Audio API ch. 6](https://www.oreilly.com/library/view/web-audio-api/9781449332679/ch06.html).
- **Creature vocals:**
  - **Formant synthesis**: a glottal source, e.g. the LF model, with jitter, shimmer, and breathiness.
  - Vocal-tract formant filters.
  - Call-pattern generators for growl, howl, hiss, chirp.
  - Sources: [DogBox (browser)](https://github.com/danja/dogbox), [prani (Rust)](https://docs.rs/prani), [soundgen (R)](https://cran.r-project.org/web/packages/soundgen/refman/soundgen.html).

### What we adopt (§g)
- **Hum synth:**
  - Oscillator bank at **120 Hz** (sine) plus harmonics at 240/360/480 Hz with gains ~−6/−12/−18 dB.
  - Plus bandpassed noise around **2–6 kHz** (Q ~2) for the "buzz".
  - A slow ±0.5 Hz drift LFO.
  - **Flicker events** gate the buzz layer and add a crackle (short noise bursts at 5–30 ms).
  - Per-zone server option for 100 Hz ("EU grid").
  - Volume by fixture distance (positional), and loudest in the yellow office zone.
- **Music:**
  - Original compositions in the "decayed ballroom" idiom: 1930s-style dance-band loops played through a degradation chain (**wow/flutter LFO, vinyl crackle, lowpass sweep down to ~2 kHz, bit/sample reduction, reverb tails**).
  - The degradation stage is tied to **simulation integrity / player sanity** (EATEOT stage idea).
  - Dreamcore zones get **music-box** motifs with tape warble.
  - **No samples of The Caretaker or other copyrighted recordings.**
- **Footsteps:**
  - Two transients (heel ~0 ms, toe +60–120 ms depending on gait).
  - Each transient = a filtered noise burst plus a short resonant body per surface: carpet = lowpass ~800 Hz with a soft envelope and a "wet" squelch layer; tile = bright bandpass ~3 kHz with a pool-hall reverb; concrete; metal grate.
  - Step interval from movement speed. Volume and attack scale with sneak/walk/run (3.5/7/14 noise analog).
- **Weather:** wind is pink/brown noise → bandpass (200–800 Hz) with an LFO on frequency and gain. Rain is high-passed noise bed + random droplet grains (1–5 ms clicks through resonant filters). Indoor/outdoor occlusion via lowpass.
- **Creature vocals:** formant synth with per-species formant sets, jitter (2–5%), shimmer, a breath noise layer, and a pitch-bend "wrongness". The Mimic routes through the radio chain (§h).

---

## h. Web multiplayer and voice references

**Positional audio: `PannerNode`** ([PannerNode](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode), [constructor](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/PannerNode), [distanceModel](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/distanceModel), [refDistance](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/refDistance), [rolloffFactor](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/rolloffFactor), [maxDistance](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/maxDistance), [panningModel](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/panningModel), [coneOuterGain](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/coneOuterGain), [Spatialization basics](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics), [AudioListener](https://developer.mozilla.org/en-US/docs/Web/API/AudioListener), [createPanner](https://developer.mozilla.org/en-US/docs/web/api/baseaudiocontext/createpanner)):
- **Defaults:** `panningModel = "equalpower"` (`"HRTF"` gives higher quality), `distanceModel = "inverse"`, `refDistance = 1`, `rolloffFactor = 1`, `maxDistance = 10000`, `coneOuterGain = 0`.
- **Gain formulas by distance model:**
  - **linear:** `1 − rolloff·(d − ref)/(max − ref)`. Rolloff range 0–1. The only model that uses `maxDistance`.
  - **inverse:** `ref / (ref + rolloff·(max(d, ref) − ref))`.
  - **exponential:** `(max(d, ref)/ref)^(−rolloff)`.
- **Updating positions:** set `positionX/Y/Z.value` or use `setValueAtTime`. Listener `forward` defaults to (0, 0, −1) and `up` to (0, 1, 0). `setPosition`/`setOrientation` are deprecated.
- **HRTF startup:** an HRTF panner is silent until its impulse database loads.

**Proximity voice examples** ([Boris Smus: copresence in WebVR](https://smus.com/copresence-webvr/), [High Fidelity spatial SDK docs](https://demo.highfidelity.com/sdocs), [DEV: metaverse spatial audio](https://dev.to/larry/how-to-create-a-truly-immersive-metaverse-experience-implementing-spatial-audio-with-the-web-audio-api-3b80), [GetStream glossary](https://getstream.io/glossary/proximity-voice-chat/)):
- One panner per remote peer, positioned from that peer's game state.
- A limiter or compressor before the destination when many peers mix.
- Position data can travel with the media via Insertable Streams / Encoded Transform. We already have WebSocket state sync.

**The Chrome remote-stream workaround** ([Babylon.js forum](https://forum.babylonjs.com/t/sound-created-with-a-remote-webrtc-stream-track-does-not-seem-to-work/7047), [three.js forum](https://discourse.threejs.org/t/positionalaudio-setmediastreamsource-with-webrtc-question-not-hearing-any-sound/14301), [three.js forum 2](https://discourse.threejs.org/t/positionalaudio-does-not-work-with-setmediaelementsource/37085)):
- In Chromium, a **remote** WebRTC `MediaStream` fed to `createMediaStreamSource()` stays **silent** unless the stream is also attached to a media element.
- **Fix:** `const a = new Audio(); a.srcObject = stream; a.muted = true; a.play();` then `ctx.createMediaStreamSource(stream)`. Forum threads reference crbug 121673 and 933677.
- With three.js, use `PositionalAudio.setMediaStreamSource(stream)` (r109+), not `setMediaElementSource`.

**Echo cancellation caveat** ([atmoky known issues](https://docs.atmoky.com/known-issues), [Babylon.js AEC thread](https://forum.babylonjs.com/t/browser-audio-cancellation-doesnt-work-using-babylons-sound-component/16759), [three.js echo thread](https://discourse.threejs.org/t/webrtc-positional-audio-echo/25026)):
- Chromium applies **AEC only to audio played through media elements, not Web Audio output**. Reported as crbug 687574 and long open.
- **Workaround** (used by Mozilla Hubs): route the Web Audio mix through a **local RTCPeerConnection loopback** (`MediaStreamAudioDestinationNode` → pc1 → pc2 → `<audio>`), so AEC applies.
- Otherwise, recommend headphones.

**Radio voice effect** ([Wikipedia: Voice frequency](https://en.wikipedia.org/wiki/Voice_frequency), [VoxBooster](https://voxbooster.com/blog/radio-voice-effect), [p5.Filter](https://p5js.org/reference/p5.sound/p5.Filter/), [WaveShaperNode](https://developer.mozilla.org/en-US/docs/Web/API/WaveShaperNode), [createWaveShaper](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createWaveShaper), [oversample](https://developer.mozilla.org/en-US/docs/Web/API/WaveShaperNode/oversample), [createBiquadFilter](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createBiquadFilter)):
- Telephone voice band: **300–3400 Hz**, in a 4 kHz channel.
- Radio FX chain: **band-pass ~300 Hz–3 kHz → compression → harmonic distortion → optional static/noise**.
- MDN's `makeDistortionCurve(amount)` builds a 44,100-sample sigmoid curve. Default amount 50; the example uses 400 with `oversample = "4x"` to reduce aliasing.

**Reference implementation of a browser Backrooms game:** [vackrooms](https://github.com/pablostanley/vackrooms) uses HRTF panning, **traced wall occlusion**, **per-room reverb**, and "footsteps that are sometimes not yours".

### What we adopt (§h)
- **Topology.** WebRTC mesh (≤4–6 players) for voice, with **signalling over our existing `ws` server**. Game state stays on WebSocket.
- **Per-peer chain:** `<audio muted srcObject=stream>` (Chrome fix) → `MediaStreamSource` → **occlusion lowpass** (BiquadFilter, cutoff 600 Hz–20 kHz by wall count) → `PannerNode`.
  - Panner settings: `panningModel: "HRTF"`, `distanceModel: "inverse"`, `refDistance: 2` (tiles), `rolloffFactor: 1.2`.
  - Then a **proximity gain gate** (fade to 0 between 80 and 100 tiles, PZ `VoiceMaxDistance`; full volume ≤10 tiles) → master `DynamicsCompressor` → destination.
- **Listener** follows the local player's head. Orientation follows the iso camera's facing, so left and right stay screen-consistent.
- **Push-to-talk** default (key: V or left Alt), with a voice-activation option. Talking makes in-game **noise** (whisper 6 / normal ~15 / shout 30 tiles) that entities can hear.
- **Radio (walkie) chain:** mic → highpass 300 Hz → lowpass 3 kHz (or 3.4 kHz for "phone") → `WaveShaper` (amount ~50–150, 4x oversample) → light compression → mixed with a noise bed (−30 dB). **Squelch bursts** (80–150 ms noise) on PTT open and close.
  - Radios have **frequencies/channels** and **range tiers** (e.g., 750 / 2,000 / 8,000 tiles) with static rising near the range edge.
  - Radio audio is **not** spatialised for the receiver. It is spatialised for bystanders near the receiving handset.
- **Echo.** Ship the loopback-AEC workaround behind a flag. Default UI hint: "use headphones".
- **Privacy.** The Mimic feature (§f) uses voice snippets **only if all players opt in**. Snippets stay in local memory and are never uploaded beyond the existing peer stream.

---

## Appendix: visual reference set (internal viewing only; NOT in the repo)
These were downloaded to a session scratchpad for art direction. Each source is listed with its subject. Do not commit them or ship them.

| # | Subject | Source |
|---|---|---|
| 1 | Original 4chan Level 0 screenshot with the creepypasta text | [nightelectricity blog asset](https://raw.githubusercontent.com/nightelectricity/nightelectricity.github.io/HEAD/assets/images/backrooms.jpg) |
| 2 | Browser (three.js/WebGPU) poolroom render with VHS overlay (vackrooms) | [vackrooms docs/media](https://raw.githubusercontent.com/pablostanley/vackrooms/HEAD/docs/media/poolrooms.jpg) |
| 3 | PZ isometric town with horde (store-style screenshot) | [labring-actions template](https://raw.githubusercontent.com/labring-actions/templates/HEAD/template/project-zomboid/website-screenshot.webp) |
| 4 | PZ house interior showing wall cutaway | [living-fellows README](https://raw.githubusercontent.com/thorelvin/living-fellows/HEAD/assets/screenshot-scavenging.png) |
| 5 | PZ B42 interior with transparent cutaway walls, plus handheld hotbar UI | [ZomboidDS screenshot](https://raw.githubusercontent.com/andreyvelsk/GAFT/HEAD/public/content/zomboidds/screenshot-3.webp) |
| 6 | PZ B42 driving, dashboard, and paper-style map on a handheld screen | [ZomboidDS preview](https://raw.githubusercontent.com/andreyvelsk/GAFT/HEAD/public/content/zomboidds/preview.webp) |
| 7 | Fan-built Pip-Boy Mk IV replica (right-side knobs, green screen, tabs) | [PipBoy-Pi5 images](https://raw.githubusercontent.com/SurvivorGrim/PipBoy-Pi5/main/images/032.jpg) |
| 8 | Original DIY handheld (big knob + buttons, ENV sensor tab); EXIF/GPS stripped | [piboy docs](https://raw.githubusercontent.com/SirLefti/piboy/HEAD/docs/prototype3/proto3_final.jpg) |
| 9 | Isometric 3D pixel art scene (Godot) | [astrellon/godot-3d-pixel-art](https://raw.githubusercontent.com/astrellon/godot-3d-pixel-art/HEAD/screenshot.png) |
| 10 | three.js pixelation pass with single-pixel outlines | [three.js example screenshot](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/screenshots/webgl_postprocessing_pixel.jpg) |
| 11 | Toon banding, outline, downsample, CRT stack | [KERN showcase](https://raw.githubusercontent.com/JaWald/KERN/main/Showcase/combined.jpg) |
| 12 | Lonely cabin in a misty field (dreamcore mood) | [dharmx/walls dreamcore](https://raw.githubusercontent.com/dharmx/walls/HEAD/dreamcore/a_house_in_a_field_with_trees.jpg) |
| 13 | Pastel sky haze (dreamcore palette) | [dharmx/walls](https://raw.githubusercontent.com/dharmx/walls/HEAD/flowers/a_blue_sky_with_white_clouds_and_small_white_flowers.jpg) |
| 14 | Dead mall with a drained tiled fountain. **Public domain** (User:Mattes, Wikimedia Commons "Israel Batch 3 (172)") | [book asset](https://raw.githubusercontent.com/ctavolazzi/survivingthesingularity/HEAD/static/book-images/ch14-dead-mall.jpg) |
| 15 | Green pipe-room render (maintenance-tunnel mood) | [dharmx/walls dreamcore](https://raw.githubusercontent.com/dharmx/walls/HEAD/dreamcore/a_green_room_with_pipes.jpg) |
