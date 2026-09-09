// The two people you deal with in Cast & Catch. Pure functions pick a line from game state so
// the NPCs react to what you just did rather than reading a fixed script; nothing here is
// persisted, and neither character can change the game's numbers — they only comment on them.
import { BIOMES } from './gameBiomes';
import { speciesLabel } from './gameSpecies';

export const NPCS = {
  shopkeeper: { name: 'Sal', title: "Runs Sal's Tackle" },
  captain: { name: "Cap'n Ray", title: 'Reel Life Charters' },
};

export function shopkeeperLine({ gameProfile, event }) {
  if (event?.type === 'error') return `${event.message} Don't take it personal.`;
  if (event?.type === 'upgrade') return `That ${event.label.toLowerCase()} will treat you right. Anything else?`;
  if (event?.type === 'lure') return `Good eye. The ${event.label.toLowerCase()} takes practice, but it pulls the big ones.`;
  const points = gameProfile?.tackle_points || 0;
  const maxedOut = ['rod_level', 'line_level', 'reel_level', 'bait_level'].every((column) => (gameProfile?.[column] || 1) >= 5);
  if (maxedOut) return "Nothing left in here you don't already own. Go fish.";
  if (points === 0) return "Browse all you like. Land something and we'll talk.";
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

export function captainLine({ biome, chartered, charterError, phase, result }) {
  if (charterError) return "No points, no boat. Earn your fare on the free water first.";
  if (phase === 'result' && result?.success && biome === 'offshore') return `A ${speciesLabel(result.species).toLowerCase()}. That's why you charter.`;
  if (phase === 'result' && result && !result.success && biome === 'offshore') return "Big water doesn't hand them over. We can go back out.";
  if (biome === 'offshore') {
    return chartered
      ? "Welcome aboard. Tuna, mahi — maybe a shark, if you've got the nerve."
      : `${BIOMES.offshore.charterCost} points gets you past the reef. Big water, big fish.`;
  }
  return BIOME_TIPS[biome] || 'Pick your water and I’ll tell you what’s biting.';
}
