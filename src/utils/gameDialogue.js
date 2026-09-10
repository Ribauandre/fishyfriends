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
  if (event?.type === 'buy') return `The ${event.label.toLowerCase()} — good choice. It's yours; wear it out if you like.`;
  if (event?.type === 'look') return "There we go. Looking sharp.";
  const points = gameProfile?.tackle_points || 0;
  const owned = (gameProfile?.wardrobe || []).length;
  if (owned >= 6) return "You've about cleaned out my racks. Try a combination on.";
  if (points < 40) return "Skin, beard, hair — those are on the house. The racks take tackle points; go land a few.";
  return `Hats, rods, boots and waders on the racks, ${points} points in your pocket. Try something on.`;
}

export function shopkeeperLine({ gameProfile, event, personalBests = [], bounties = [] }) {
  if (event?.type === 'error') return `${event.message} Don't take it personal.`;
  if (event?.type === 'upgrade') return `That ${event.label.toLowerCase()} will treat you right. Anything else?`;
  if (event?.type === 'lure') return `Good eye. The ${event.label.toLowerCase()} takes practice, but it pulls the big ones.`;
  if (event?.type === 'flyrod') return "A fly rod. Now you're an angler. The flies are on the dock at the river and the lake — match the hatch and mend that drift.";
  if (event?.type === 'quest') return `${event.points} points, as promised. She's going right over the counter.`;
  if (event?.type === 'bounty') return `${event.count === 1 ? 'One real fish' : `${event.count} real fish`} on the books — ${event.points} points. Keep logging them.`;
  const quests = gameProfile?.quests || {};
  if (claimableQuests(quests).some((quest) => quest.giver === 'shopkeeper')) return "Is that my bass? Hand it over and I'll square up.";
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
};

const NIGHT_TIPS = {
  river: 'Catfish and walleye come out after dark. Fish slow.',
  swamp: 'Snakeheads hunt at night. So do the catfish.',
  bay: 'Night tide — the stripers are up on the flats.',
  shoreline: 'Big stripers hit the surf after dark.',
  offshore: "Sharks own the dark water. Hold on.",
  canyon: 'Swordfish come up from the deep at night. This is the hour.',
};

// What's hatching, for anyone carrying the fly rod on trout water.
const HATCH_TIPS = {
  dawn: 'Morning rise. Tie on a dry and put it right on the ring.',
  day: 'Nothing on top in this light — drift a nymph through the seams.',
  dusk: "Evening hatch is on. Dry fly, and mend before it drags.",
  night: 'Big browns hunt after dark. Swim a streamer, slow.',
};

export function captainLine({ biome, chartered, charterError, phase, result, period = 'day', quests = {}, isRecord = false, champion = false, justWon = null, flyRod = false, lure = 'livebait' }) {
  if (charterError) return "No points, no boat. Earn your fare on the free water first.";
  if (justWon) return `Club champion. That ${speciesLabel(justWon.species).toLowerCase()} took the derby — the pennant's yours till Monday. Fly it.`;
  if (phase === 'result' && result?.success && isRecord) return `A ${speciesLabel(result.species).toLowerCase()} — and your biggest yet. That's one for the book.`;
  if (phase === 'result' && result?.success && (biome === 'offshore' || biome === 'canyon')) return `A ${speciesLabel(result.species).toLowerCase()}. That's why you charter.`;
  if (phase === 'result' && result && !result.success && (biome === 'offshore' || biome === 'canyon')) return "Big water doesn't hand them over. We can go back out.";
  const proving = questState(quests, 'rays_proving');
  if (biome === 'canyon') {
    if (!chartered) return `${BIOMES.canyon.charterCost} points and we run the shelf. Nobody else knows this spot.`;
    return period === 'night' ? NIGHT_TIPS.canyon : "The drop-off's under us. Swordfish come up at night; daytime it's tuna and sharks.";
  }
  if (biome === 'offshore') {
    if (!chartered) return `${BIOMES.offshore.charterCost} points gets you past the reef. Big water, big fish.`;
    if (period === 'night') return NIGHT_TIPS.offshore;
    return "Welcome aboard. Tuna, mahi — maybe a shark, if you've got the nerve.";
  }
  if (biome === 'bay' && !proving.done) {
    const left = QUEST_BY_KEY.rays_proving.goal.count - proving.progress;
    return left === 3 ? "Land three fish out here and I'll show you where the shelf drops off." : `${left} more from the bay and I'll run you out to the shelf.`;
  }
  if (proving.done && !questState(quests, 'canyon_sword').done && biome === 'bay') return "You've earned the trip. The Canyon's on the map when you're ready.";
  if (flyRod && BIOMES[biome]?.flyWater && phase === 'ready' && (period !== 'day' || lure !== 'livebait')) return HATCH_TIPS[period] || HATCH_TIPS.day;
  if (period === 'night' && NIGHT_TIPS[biome]) return NIGHT_TIPS[biome];
  if (champion && phase === 'ready' && biome === 'river') return "Everybody on the dock can see that pennant. Defend it.";
  return BIOME_TIPS[biome] || 'Pick your water and I’ll tell you what’s biting.';
}
