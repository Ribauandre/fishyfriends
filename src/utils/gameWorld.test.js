import { rollSpecies, PITY_CAP, JUNK_ROSTER, sizeGrade, gradeCounts, rollSize, isNewRecord, sizeLabel, sizeFraction, lengthFraction, difficultyFor, NOCTURNAL, SPECIES_SIZE, SEASONS, inSeason, speciesWeight, rarityOf, rollJunk, isJunk, JUNK_CHANCE, RARITY_INFO } from './gameSpecies';
import { BIOMES, biomeUnlocked, CANYON_CHARTER_COST, charterFare, isRegular, REGULAR_FARE } from './gameBiomes';
import { rebuildCost, rebuildBonus, effectiveLevel, MAX_REBUILDS } from './gameUpgrades';
import { LURES, FLIES, FLY_ROD, luresFor, lureAllowedOn, hatchMatch, isFly } from './gameLures';

// A random source that returns the given values in order (and the last one forever after).
const sequence = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

test('night leans the roll toward the fish that feed after dark, day leans away', () => {
  // River commons: smallmouth, yellowperch, catfish, carp, chainpickerel, trout — only catfish is nocturnal.
  const commons = BIOMES.river.species.filter((species) => rarityOf(species) === 'common');
  expect(commons).toContain('catfish');
  const weightAt = (period) => commons.map((species) => speciesWeight(species, period));
  expect(Math.max(...weightAt('night'))).toBe(3);
  expect(Math.min(...weightAt('day'))).toBe(0.6);
  // First random picks the common tier; the second walks the species weights. At night a pick
  // landing past the day-weight range still falls on catfish; by day it would have moved on.
  const catfishIndex = commons.indexOf('catfish');
  const before = commons.slice(0, catfishIndex).length; // species ahead of catfish, weight 1 each
  const pick = before + 1.5; // 1.5 into catfish's slot
  const night = rollSpecies(1, BIOMES.river.species, { period: 'night', random: sequence(0, pick / (before + 3 + (commons.length - catfishIndex - 1))) });
  const day = rollSpecies(1, BIOMES.river.species, { period: 'day', random: sequence(0, pick / (before + 0.6 + (commons.length - catfishIndex - 1))) });
  expect(night.species).toBe('catfish');
  expect(day.species).not.toBe('catfish');
  expect(NOCTURNAL).toContain('swordfish');
});

test('sizes come from the species, skewed small, and read as inches', () => {
  expect(rollSize('bluegill', () => 0)).toBe(SPECIES_SIZE.bluegill[0]);
  expect(rollSize('bluegill', () => 1)).toBe(SPECIES_SIZE.bluegill[1]);
  expect(rollSize('shark', () => 0.5)).toBeLessThan((SPECIES_SIZE.shark[0] + SPECIES_SIZE.shark[1]) / 2);
  expect(rollSize('shark', () => 0.5)).toBeGreaterThan(SPECIES_SIZE.shark[0]);
  expect(sizeLabel(23.46)).toBe('23.5 in');
  expect(rollSize('mystery', () => 0)).toBe(6);
});

test('a catch knows where it sits in its species, smallest to biggest', () => {
  expect(sizeFraction('bluegill', 5)).toBe(0);
  expect(sizeFraction('bluegill', 11)).toBe(1);
  expect(sizeFraction('bluegill', 8)).toBe(0.5);
  expect(sizeFraction('tarpon', 200)).toBe(1);
  expect(sizeFraction('bluegill', undefined)).toBe(0.5);
  expect(sizeFraction('nosuchfish', 12)).toBe(0.5);
});

test('a length sits on one scale for every fish, and a rarer fish is a wilder one', () => {
  expect(lengthFraction(4)).toBe(0);
  expect(lengthFraction(200)).toBe(1);
  expect(lengthFraction(170)).toBeLessThan(1);
  expect(lengthFraction(40)).toBeGreaterThan(lengthFraction(20));
  expect(lengthFraction(20)).toBeGreaterThan(lengthFraction(8));
  // Log scale: the small end spreads out rather than every panfish reading as nothing.
  expect(lengthFraction(20) - lengthFraction(4)).toBeGreaterThan(lengthFraction(200) - lengthFraction(80));
  expect(lengthFraction(undefined)).toBe(0.4);
  const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'].map(difficultyFor);
  for (let i = 1; i < tiers.length; i += 1) {
    expect(tiers[i].runChance).toBeGreaterThan(tiers[i - 1].runChance);
    expect(tiers[i].runPower).toBeGreaterThan(tiers[i - 1].runPower);
  }
});

test('a fish out of season is not in the water, and never the whole roster at once', () => {
  expect(inSeason('americanshad', 'spring')).toBe(true);
  expect(inSeason('americanshad', 'summer')).toBe(false);
  expect(inSeason('smallmouth', 'winter')).toBe(true);
  expect(inSeason('americanshad', null)).toBe(true);
  Object.keys(SEASONS).forEach((species) => expect(SPECIES_SIZE[species]).toBeDefined());
  // In summer the shad never rolls on the river, whatever the dice say.
  const summer = new Set(Array.from({ length: 200 }, (_, i) => rollSpecies(1, ['americanshad', 'smallmouth'], { season: 'summer', random: sequence(i / 200, i / 200) }).species));
  expect(summer.has('americanshad')).toBe(false);
  expect(summer.has('smallmouth')).toBe(true);
  // A ground whose every fish is away still has fish in it rather than nothing.
  expect(rollSpecies(1, ['americanshad'], { season: 'summer', random: sequence(0.5) }).species).toBe('americanshad');
});

test('a stick bites now and then, never runs, and is worth nothing', () => {
  expect(rollJunk(sequence(JUNK_CHANCE / 2, 0))).toEqual({ species: 'stick', rarity: 'junk' });
  // The flotsam roster: mostly sticks, and the rest now and then; none on any ground.
  expect(rollJunk(sequence(JUNK_CHANCE / 2, 0.99)).species).toBe('bottle');
  expect(new Set(JUNK_ROSTER)).toEqual(new Set(['stick', 'boot', 'plate', 'bottle']));
  JUNK_ROSTER.forEach((piece) => expect(rarityOf(piece)).toBe('junk'));
  expect(rollJunk(() => JUNK_CHANCE * 2)).toBeNull();
  expect(rollJunk(() => 0.5)).toBeNull();
  expect(isJunk('junk')).toBe(true);
  expect(isJunk('legendary')).toBe(false);
  expect(rarityOf('stick')).toBe('junk');
  expect(difficultyFor('junk').runChance).toBe(0);
  expect(difficultyFor('junk').points).toEqual([0, 0]);
  expect(difficultyFor('junk').zoneWidth).toBeGreaterThan(difficultyFor('common').zoneWidth);
  expect(RARITY_INFO.junk.label).toBe('Junk');
  expect(SPECIES_SIZE.stick).toBeDefined();
});

test('the first of a species is a record, and only a bigger one beats it', () => {
  expect(isNewRecord({}, 'walleye', 18)).toBe(true);
  expect(isNewRecord({ walleye: { size_in: 18 } }, 'walleye', 18)).toBe(false);
  expect(isNewRecord({ walleye: { size_in: '18.0' } }, 'walleye', 18.1)).toBe(true);
});

test('the canyon and the flats are the locked grounds, each dearer than the last, and each the only water for its fish', () => {
  expect(biomeUnlocked('canyon', {})).toBe(false);
  expect(biomeUnlocked('canyon', { rays_proving: { done: true } })).toBe(true);
  expect(biomeUnlocked('flats', { rays_proving: { done: true } })).toBe(false);
  expect(biomeUnlocked('flats', { rays_southern_run: { done: true } })).toBe(true);
  expect(Object.values(BIOMES).filter((biome) => biome.requiresQuest).map((biome) => biome.key)).toEqual(['canyon', 'flats', 'baja']);
  expect(biomeUnlocked('baja', { rays_southern_run: { done: true } })).toBe(false);
  expect(biomeUnlocked('baja', { rays_western_run: { done: true } })).toBe(true);
  expect(BIOMES.baja.charterCost).toBeGreaterThan(BIOMES.flats.charterCost);
  expect(BIOMES.canyon.charterCost).toBe(CANYON_CHARTER_COST);
  expect(BIOMES.canyon.charterCost).toBeGreaterThan(BIOMES.offshore.charterCost);
  expect(BIOMES.flats.charterCost).toBeGreaterThan(BIOMES.canyon.charterCost);
  const watersFor = (species) => Object.values(BIOMES).filter((biome) => biome.species.includes(species)).map((biome) => biome.key);
  expect(watersFor('swordfish')).toEqual(['canyon']);
  expect(watersFor('bluemarlin')).toEqual(['canyon']);
  ['tarpon', 'permit', 'bonefish'].forEach((species) => expect(watersFor(species)).toEqual(['flats']));
  // Every species on every ground has a fixed rarity and a size range of its own.
  const all = new Set(Object.values(BIOMES).flatMap((biome) => biome.species));
  expect(all.size).toBe(90);
  ['roosterfish', 'stripedmarlin', 'giantseabass', 'yellowtail'].forEach((species) => expect(watersFor(species)).toEqual(['baja']));
  // The stick is not on any ground's roster: it comes from the junk roll, not the species roll.
  expect(all.has('stick')).toBe(false);
  expect(Object.values(BIOMES).filter((biome) => !biome.charterCost).map((biome) => biome.key)).toEqual(['river', 'mountainlake', 'swamp', 'bay', 'shoreline', 'pier', 'creek']);
  all.forEach((species) => { expect(SPECIES_SIZE[species]).toBeDefined(); expect(rarityOf(species)).toBeDefined(); });
});

test('the fly box only opens on fly water, only with the fly rod, and holds the flies for that water', () => {
  expect(FLIES.map((fly) => fly.key)).toEqual(['dryfly', 'nymph', 'streamer', 'shrimpfly']);
  expect(FLY_ROD.cost).toBeGreaterThan(0);
  expect(BIOMES.river.flyWater).toBe('fresh');
  expect(BIOMES.mountainlake.flyWater).toBe('fresh');
  expect(BIOMES.flats.flyWater).toBe('salt');
  expect(BIOMES.bay.flyWater).toBeUndefined();
  expect(luresFor('river', { fly_rod: false }).map((lure) => lure.key)).toEqual(['livebait', 'jerkbait', 'crankbait']);
  expect(luresFor('river', { fly_rod: true }).map((lure) => lure.key)).toEqual(['livebait', 'jerkbait', 'crankbait', 'dryfly', 'nymph', 'streamer']);
  // The salt box: the shrimp fly on the flats, and none of the trout flies.
  expect(luresFor('flats', { fly_rod: true }).map((lure) => lure.key)).toEqual(['livebait', 'jerkbait', 'crankbait', 'shrimpfly']);
  expect(luresFor('bay', { fly_rod: true }).map((lure) => lure.key)).toEqual(['livebait', 'jerkbait', 'crankbait']);
  expect(lureAllowedOn('dryfly', 'bay')).toBe(false);
  expect(lureAllowedOn('dryfly', 'flats')).toBe(false);
  expect(lureAllowedOn('shrimpfly', 'river')).toBe(false);
  expect(lureAllowedOn('shrimpfly', 'flats')).toBe(true);
  expect(lureAllowedOn('dryfly', 'mountainlake')).toBe(true);
  expect(lureAllowedOn('crankbait', 'bay')).toBe(true);
  expect(isFly('nymph')).toBe(true);
  expect(isFly('jerkbait')).toBe(false);
});

test('each fly matches the hatch at its own hours, and the streamer is tied for the big browns', () => {
  expect(hatchMatch('dryfly', 'dusk')).toBe(true);
  expect(hatchMatch('dryfly', 'day')).toBe(false);
  expect(hatchMatch('nymph', 'day')).toBe(true);
  expect(hatchMatch('streamer', 'night')).toBe(true);
  expect(hatchMatch('streamer', 'dawn')).toBe(false);
  expect(hatchMatch('livebait', 'day')).toBe(false);
  expect(LURES.streamer.favors).toEqual(['browntrout', 'laketrout']);
});

test('a lure\'s favoured species roll heavier within their tier', () => {
  // The lake's uncommons now include the splake; the roll below uses trout water's three
  // uncommon trout — weight 1 each, browntrout x2.5 on a streamer.
  const uncommons = BIOMES.mountainlake.species.filter((species) => rarityOf(species) === 'uncommon');
  expect(uncommons).toEqual(['brooktrout', 'rainbowtrout', 'browntrout', 'splake']);
  const troutWater = ['trout', 'brooktrout', 'rainbowtrout', 'browntrout', 'laketrout'];
  const tierPick = 0.6; // 54 of 90: the uncommon tier at bait level 1 (common 46 / uncommon 28 / rare 16)
  const plain = rollSpecies(1, troutWater, { random: sequence(tierPick, 2.2 / 3) });
  const favored = rollSpecies(1, troutWater, { random: sequence(tierPick, 2.2 / 4.5), favor: ['browntrout'] });
  expect(plain.rarity).toBe('uncommon');
  expect(favored.rarity).toBe('uncommon');
  expect(plain.species).toBe('browntrout');
  expect(favored.species).toBe('browntrout');
  // Same 2.2 into the pool, but with the extra weight on the first fish the pick lands on it instead.
  const shifted = rollSpecies(1, troutWater, { random: sequence(tierPick, 2.2 / 4.5), favor: ['brooktrout'] });
  expect(shifted.species).toBe('brooktrout');
});

// The tier a roll lands in over many evenly spread rolls, on a roster with one fish of every
// tier (the charter grounds have no common fish, which would skew it): the share of each.
const ONE_OF_EACH = ['bluegill', 'pike', 'laketrout', 'mahimahi', 'shark'];
function tierShares(baitLevel, options = {}) {
  const counts = {};
  const N = 2000;
  for (let i = 0; i < N; i += 1) {
    const t = (i + 0.5) / N;
    const { rarity } = rollSpecies(baitLevel, ONE_OF_EACH, { random: sequence(t, 0.5), ...options });
    counts[rarity] = (counts[rarity] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / N]));
}

test('better bait is mostly more rares and epics: a legendary stays a long shot, and a dry spell nudges it', () => {
  const stock = tierShares(1);
  const best = tierShares(5);
  expect(stock.legendary).toBeCloseTo(0.02, 2);
  // Level 5 roughly doubles the legendary and more than doubles the epic, and no more —
  // it used to make a legendary one bite in six.
  expect(best.legendary).toBeGreaterThan(0.03);
  expect(best.legendary).toBeLessThan(0.05);
  expect(best.epic).toBeGreaterThan(stock.epic * 1.8);
  expect(best.rare).toBeGreaterThan(stock.rare * 1.5);
  expect(best.common).toBeLessThan(stock.common * 0.7);
  // Forty dry bites treble the legendary weight; the cap holds after that.
  expect(tierShares(1, { pity: 40 }).legendary).toBeGreaterThan(stock.legendary * 2.5);
  expect(tierShares(1, { pity: 400 }).legendary).toBeCloseTo(tierShares(1, { pity: PITY_CAP / 0.1 }).legendary, 2);
});

test('a charter is full fare until you are a regular there, then half', () => {
  const roster = BIOMES.canyon.species;
  expect(charterFare('canyon', {})).toBe(CANYON_CHARTER_COST);
  const half = Object.fromEntries(roster.slice(0, Math.floor(roster.length / 2)).map((s) => [s, { sizeIn: 10 }]));
  expect(isRegular('canyon', half)).toBe(false);
  const more = Object.fromEntries(roster.slice(0, Math.floor(roster.length / 2) + 1).map((s) => [s, { sizeIn: 10 }]));
  expect(isRegular('canyon', more)).toBe(true);
  expect(charterFare('canyon', more)).toBe(Math.round(CANYON_CHARTER_COST * REGULAR_FARE));
  // Records on another ground do not make you a regular here, and a free ground has no fare.
  expect(charterFare('flats', more)).toBe(BIOMES.flats.charterCost);
  expect(charterFare('river', more)).toBe(0);
});

test('a record is graded by where it sits in the species\' size range, and flotsam is never graded', () => {
  const [min, max] = SPECIES_SIZE.pike;
  expect(sizeGrade('pike', min)).toBe('bronze');
  expect(sizeGrade('pike', min + (max - min) * 0.6)).toBe('silver');
  expect(sizeGrade('pike', max)).toBe('gold');
  expect(sizeGrade('pike', 0)).toBeNull();
  expect(gradeCounts({ pike: { size_in: max }, bluegill: { size_in: SPECIES_SIZE.bluegill[0] }, stick: { size_in: 30 } })).toEqual({ bronze: 1, silver: 0, gold: 1 });
});

test('a rebuild plays a track above its number, costs more each time, and the club makes a charter free', () => {
  expect(rebuildCost(0)).toBe(1500);
  expect(rebuildCost(2)).toBe(2500);
  expect(rebuildBonus(2)).toBe(1);
  expect(rebuildBonus(99)).toBe(MAX_REBUILDS * 0.5);
  expect(effectiveLevel({ rod_level: 1, rebuilds: { rod: 3 } }, 'rod')).toBe(2.5);
  expect(effectiveLevel({ rod_level: 5 }, 'rod')).toBe(5);
  expect(charterFare('baja', {}, { member: true })).toBe(0);
  expect(charterFare('baja', {})).toBe(BIOMES.baja.charterCost);
});
