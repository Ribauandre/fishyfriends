// The two people you deal with in Cast & Catch. Pure functions pick a line from game state so
// the NPCs react to what you just did rather than reading a fixed script; nothing here is
// persisted, and neither character can change the game's numbers — they only comment on them.
// Both know about the real person too: Sal has seen your actual personal bests, and the
// bounty board is his idea.
import { BIOMES } from './gameBiomes';
import { speciesLabel } from './gameSpecies';
import { QUEST_BY_KEY, questState, claimableQuests } from './gameQuests';

export const NPCS = {
  shopkeeper: { name: 'Sal', title: "Runs Sal's Tackle" },
  captain: { name: "Cap'n Ray", title: 'Reel Life Charters' },
  outfitter: { name: 'Marina', title: "Marina's Outfitters" },
};

// Marina runs the apparel racks: she reacts to what you just bought or changed, and otherwise
// sizes up your balance.
export function outfitterLine({ gameProfile, event }) {
  if (event?.type === 'error') return `${event.message} No harm in looking, though.`;
  if (event?.type === 'buy' && event.slot === 'pet') return `The ${event.label.toLowerCase()} — they'll sit with you on the dock and mind the bait bucket. Go on, off you go together.`;
  if (event?.type === 'buy') return `The ${event.label.toLowerCase()} — good choice. It's yours; wear it out if you like.`;
  if (event?.type === 'look') return "There we go. Looking sharp.";
  const points = gameProfile?.tackle_points || 0;
  const owned = (gameProfile?.wardrobe || []).length;
  if (owned >= 6) return "You've about cleaned out my racks. Try a combination on.";
  if (points < 40) return "Skin, beard, hair — those are on the house. The racks take tackle points; go land a few.";
  return `Caps, shirts, vests, rods, boots and jeans on the racks, a dog and a cat asleep by the door, and ${points} points in your pocket. Try something on.`;
}

export function shopkeeperLine({ gameProfile, event, personalBests = [], bounties = [] }) {
  if (event?.type === 'error') return `${event.message} Don't take it personal.`;
  if (event?.type === 'upgrade') return `That ${event.label.toLowerCase()} will treat you right. Anything else?`;
  if (event?.type === 'lure') return `Good eye. The ${event.label.toLowerCase()} takes practice, but it pulls the big ones.`;
  if (event?.type === 'flyrod') return "A fly rod. Now you're an angler. The flies are on the dock at the river and the lake, and the shrimp fly's for the flats — match the hatch and mend that drift.";
  if (event?.type === 'quest') return `${event.points} points, as promised. She's going right over the counter.`;
  if (event?.type === 'bounty') return `${event.count === 1 ? 'One real fish' : `${event.count} real fish`} on the books — ${event.points} points. Keep logging them.`;
  const quests = gameProfile?.quests || {};
  const due = claimableQuests(quests).find((quest) => quest.giver === 'shopkeeper');
  if (due) return due.key === 'sals_bull_red' ? "Is that my bull red? Hand it over and I'll square up." : "Is that my bass? Hand it over and I'll square up.";
  if (bounties.length > 0) return `Saw ${bounties.length === 1 ? 'that real catch' : `${bounties.length} real catches`} in your logbook. Bounty board's paying — cash it in.`;
  const points = gameProfile?.tackle_points || 0;
  const maxedOut = ['rod_level', 'line_level', 'reel_level', 'bait_level'].every((column) => (gameProfile?.[column] || 1) >= 5);
  if (maxedOut) return "Nothing left in here you don't already own. Go fish.";
  if (points === 0) return "Browse all you like. Land something and we'll talk.";
  const latestBest = personalBests[personalBests.length - 1];
  if (latestBest && points >= 40) return `That ${latestBest.species.toLowerCase()} you logged for real${latestBest.size_label ? ` — ${latestBest.size_label}` : ''}? Wall-worthy. Now, ${points} points…`;
  if (points < 40) return "A few more catches and that first upgrade's yours.";
  return `${points} tackle points, huh? Let's see what we can do with that.`;
}

const BIOME_TIPS = {
  river: 'Work the current seams for smallmouth and walleye. Watch for snakeheads — nasty, but they count.',
  mountainlake: "Trout water, top to bottom. Nothing else lives up there, and nothing else needs to.",
  swamp: "Bass and panfish in the weeds. Something bigger's in there too, if you're patient.",
  bay: 'Flounder on the bottom, stripers on the tide. Salmon push through when the rivers run.',
  shoreline: 'Surf casting country. Fluke in close, blues and stripers when the bait shows up.',
  pier: 'Kingfish and porgies on the bottom, macks and blues when the water warms. Watch the pilings.',
  creek: 'Fish the tide. White perch on the drop, stripers and seatrout when it floods.',
};

// What the calendar puts in the water, where it changes the story.
const SEASON_TIPS = {
  'river:spring': "Shad are running. Small bright lures, fish the seams.",
  'bay:winter': 'Winter flounder are in the mud. Slow and small.',
  'bay:spring': 'Tautog on the rocks and winter flounder in the mud — the last of them.',
  'shoreline:summer': 'Warm water: Spanish macks, pompano in the wash, and sandbar sharks after dark.',
  'shoreline:fall': 'Fall run. Albies and bonito are crashing bait — cast fast.',
  'pier:summer': 'Macks and kings past the end of the pier when the water warms.',
  'pier:fall': 'Fall run off the pier — bonito and kings.',
  'offshore:summer': 'Bluefin season. Big water, biggest fish. Hold on.',
  'canyon:summer': 'The billfish are up: whites, sails. This is the season.',
  'mountainlake:winter': "Ice fishing. Perch and splake through the lead, lakers if you're patient.",
};

const NIGHT_TIPS = {
  river: 'Catfish and walleye come out after dark. Fish slow.',
  swamp: 'Snakeheads hunt at night. So do the catfish, and the bowfin under the moss.',
  bay: 'Night tide — the stripers are up on the flats.',
  shoreline: 'Big stripers hit the surf after dark.',
  pier: 'Eels and toadfish under the lights. Sharks past the end.',
  creek: 'Eels on the mud after dark, and stripers in the creek mouth.',
  offshore: "Sharks own the dark water. Hold on.",
  canyon: 'Swordfish come up from the deep at night. This is the hour.',
  flats: 'Tarpon roll in the channel after dark. Big fly, big fish, hold on.',
  baja: 'Nothing on the beach after dark. Drop deep for the giant sea bass.',
};

// The flats by daylight, for anyone with the shrimp fly tied on.
const FLATS_TIPS = {
  dawn: "Tails up on the flat — bonefish. Lead them with the shrimp and let it sit.",
  day: "Sun's high, you'll see them coming. Land the shrimp soft, they spook.",
  dusk: 'Permit on the edge at dusk. Same shrimp, longer lead.',
};

// What's hatching, for anyone carrying the fly rod on trout water.
const HATCH_TIPS = {
  dawn: 'Morning rise. Tie on a dry and put it right on the ring.',
  day: 'Nothing on top in this light — drift a nymph through the seams.',
  dusk: "Evening hatch is on. Dry fly, and mend before it drags.",
  night: 'Big browns hunt after dark. Swim a streamer, slow.',
};

export function captainLine({ biome, chartered, charterError, phase, result, period = 'day', season = null, quests = {}, isRecord = false, champion = false, justWon = null, flyRod = false, lure = 'livebait' }) {
  if (charterError) return "No points, no boat. Earn your fare on the free water first.";
  if (justWon) return `Club champion. That ${speciesLabel(justWon.species).toLowerCase()} took the derby — the pennant's yours till Monday. Fly it.`;
  if (phase === 'result' && result?.success && result.rarity === 'junk') return "That's a stick. Happens to the best of us. Cast again.";
  if (phase === 'result' && result?.success && isRecord) return `A ${speciesLabel(result.species).toLowerCase()} — and your biggest yet. That's one for the book.`;
  const charter = (BIOMES[biome]?.charterCost || 0) > 0;
  if (phase === 'result' && result?.success && charter) return `A ${speciesLabel(result.species).toLowerCase()}. That's why you charter.`;
  if (phase === 'result' && result && !result.success && charter) return biome === 'flats' ? "Spooked it. Skinny water's like that. Pole on, there's more." : "Big water doesn't hand them over. We can go back out.";
  const proving = questState(quests, 'rays_proving');
  const southern = questState(quests, 'rays_southern_run');
  const western = questState(quests, 'rays_western_run');
  if (biome === 'baja') {
    if (!chartered) return `${BIOMES.baja.charterCost} points covers the flight and my cousin's panga. Roosters on the beach, marlin off the point.`;
    if (period === 'night') return NIGHT_TIPS.baja;
    return "Cousin's water. Roosterfish chase bait right up the beach; yellowtail on the reef, marlin off the point.";
  }
  if (biome === 'flats') {
    if (!chartered) return `${BIOMES.flats.charterCost} points and we trailer the skiff south. Skinny water, spooky fish, and nothing like it.`;
    if (period === 'night') return NIGHT_TIPS.flats;
    if (southern.done && !western.done) return `${QUEST_BY_KEY.rays_western_run.goal.count - western.progress} more off this flat and I'll call my cousin in Baja.`;
    if (western.done && !questState(quests, 'baja_rooster').done) return "Baja's on the map. Bring sunscreen.";
    if (flyRod && lure === 'shrimpfly') return FLATS_TIPS[period] || FLATS_TIPS.day;
    return "Pole's up. Bones on the flat, permit on the edge, tarpon in the channel. Cast soft — they spook.";
  }
  if (biome === 'canyon') {
    if (!chartered) return `${BIOMES.canyon.charterCost} points and we run the shelf. Nobody else knows this spot.`;
    if (period === 'night') return NIGHT_TIPS.canyon;
    if (!southern.done) {
      const left = QUEST_BY_KEY.rays_southern_run.goal.count - southern.progress;
      return `${left} more over the gunwale out here and I'll trailer the skiff south. There's a flat I know.`;
    }
    return "The drop-off's under us. Swordfish come up at night; daytime it's tuna, wahoo and sharks.";
  }
  if (biome === 'offshore') {
    if (!chartered) return `${BIOMES.offshore.charterCost} points gets you past the reef. Big water, big fish.`;
    if (period === 'night') return NIGHT_TIPS.offshore;
    if (southern.done && !questState(quests, 'flats_slam').done) return "The Flats are on the map. Bring the fly rod.";
    return "Welcome aboard. Tuna, mahi, wahoo — maybe a shark, if you've got the nerve.";
  }
  if (biome === 'bay' && !proving.done) {
    const left = QUEST_BY_KEY.rays_proving.goal.count - proving.progress;
    return left === 3 ? "Land three fish out here and I'll show you where the shelf drops off." : `${left} more from the bay and I'll run you out to the shelf.`;
  }
  if (proving.done && !questState(quests, 'canyon_sword').done && biome === 'bay') return "You've earned the trip. The Canyon's on the map when you're ready.";
  if (flyRod && BIOMES[biome]?.flyWater && phase === 'ready' && (period !== 'day' || lure !== 'livebait')) return HATCH_TIPS[period] || HATCH_TIPS.day;
  if (period === 'night' && NIGHT_TIPS[biome]) return NIGHT_TIPS[biome];
  if (champion && phase === 'ready' && biome === 'river') return "Everybody on the dock can see that pennant. Defend it.";
  if (season && SEASON_TIPS[`${biome}:${season}`]) return SEASON_TIPS[`${biome}:${season}`];
  return BIOME_TIPS[biome] || 'Pick your water and I’ll tell you what’s biting.';
}
