import React, { useEffect, useRef, useState } from 'react';
import FishIllustration from './components/FishIllustration';
import GameScene from './components/game/GameScene';
import GameOverlay from './components/game/GameOverlay';
import PointsCounter from './components/game/PointsCounter';
import NpcDialogue from './components/game/NpcDialogue';
import BiomeMap from './components/game/BiomeMap';
import { TRAVEL_MS } from './components/game/TravelTransition';
import { GEAR_ICONS, LURE_ICONS, TACKLE_BOX, HUD_ICONS, DERBY_FLAG, vehicleFor } from './utils/gameProps';
import shopBackdrop from './assets/scenes/shop.webp';
import trophyWallBackdrop from './assets/scenes/trophywall.webp';
import speciesIcon from './utils/speciesOptions';
import { shopkeeperLine, captainLine } from './utils/gameDialogue';
import { useAuth } from './context/AuthContext';
import { rollSpecies, difficultyFor, speciesLabel, pointsFor, rollSize, sizeLabel, RARITY_INFO, rarityOf, NOCTURNAL } from './utils/gameSpecies';
import { UPGRADE_TRACKS, MAX_UPGRADE_LEVEL, upgradeCost, hookWindowBonusMs, tensionMaxFor, fishSpeedMultiplier, drainMultiplier } from './utils/gameUpgrades';
import { BIOMES, BIOME_LIST, biomeUnlocked } from './utils/gameBiomes';
import { LURES, LURE_LIST, lureOwned, QUALITY_BAIT_LEVELS, qualityPointsMultiplier } from './utils/gameLures';
import { INITIAL_REEL_STATE, stepReel } from './utils/reelPhysics';
import {
  INITIAL_JERK_STATE, INITIAL_CRANK_STATE, JERK_ZONE, JERK_TIME_LIMIT_MS, CRANK_TICK_MS, CRANK_BAND_WIDTH,
  jerkMarker, twitchJerk, decayJerk, jerkQuality, stepCrank, crankQuality,
} from './utils/lurePhysics';
import { periodFor, msUntilNextPeriod, PERIOD_LABELS } from './utils/gameClock';
import { unlockAudio, sfx, setAmbience, isMuted, toggleMuted, stopAllAudio } from './utils/gameAudio';
import { derbyFor } from './utils/gameDerby';
import { questsFor, questProgressLabel, questState, claimableQuests, QUEST_BY_KEY } from './utils/gameQuests';

const CAST_SWEET_SPOT = [40, 60];
const REEL_TICK_MS = 80;
const REEL_TIME_LIMIT_MS = 16000;
const JERK_TICK_MS = 50;
const REEL_SOUND_MS = 110;
const DEFAULT_GAME_PROFILE = { tackle_points: 0, rod_level: 1, line_level: 1, reel_level: 1, bait_level: 1, owned_lures: [], records: {}, quests: {}, bounties_claimed: [] };

// The whole game lives in one frame: the scene is the viewport, the HUD sits on it as signage,
// and the dock below it holds whatever the current phase needs. The map, the tackle shop, the
// almanac and the trophy case open as overlays inside the frame rather than as cards further
// down the page, so the loop is dock -> cast -> bite -> reel -> result -> dock without ever
// leaving the screen. `clock` is injectable so the harness and tests can pick the hour.
export default function FishingGame({ clock = () => new Date() }) {
  const {
    profile, personalBests = [], getGameProfile, listMyGameCatches, logGameCatch, purchaseUpgrade, charterBoat, purchaseLure,
    claimQuestReward, listDerbyLeaders, listFishYearBounties, claimFishYearBounties,
  } = useAuth();
  const [shopEvent, setShopEvent] = useState(null);
  const [gameProfile, setGameProfile] = useState(DEFAULT_GAME_PROFILE);
  const [catches, setCatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('ready');
  const [overlay, setOverlay] = useState(null);
  const [biome, setBiome] = useState('river');
  const [travel, setTravel] = useState(null);
  const [chartered, setChartered] = useState(false);
  const [castBusy, setCastBusy] = useState(false);
  const [charterError, setCharterError] = useState('');
  const [lure, setLure] = useState('livebait');
  const [lureBusy, setLureBusy] = useState(false);
  const [lureError, setLureError] = useState('');
  const [lureDisplay, setLureDisplay] = useState(null);
  const [lureFeedback, setLureFeedback] = useState('');
  const [presentationQuality, setPresentationQuality] = useState(0);
  const [perfectCast, setPerfectCast] = useState(false);
  const [pendingCatch, setPendingCatch] = useState(null);
  const [result, setResult] = useState(null);
  const [reelDisplay, setReelDisplay] = useState({ fishPos: 50, zonePos: 50, progress: 0, tension: 0 });
  const [upgradeError, setUpgradeError] = useState('');
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [period, setPeriod] = useState(() => periodFor(clock()));
  const [muted, setMuted] = useState(() => isMuted());
  const [audioReady, setAudioReady] = useState(false);
  const [bounties, setBounties] = useState([]);
  const [bountyBusy, setBountyBusy] = useState(false);
  const [questBusy, setQuestBusy] = useState(false);
  const [derbyLeaders, setDerbyLeaders] = useState(null);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const [derby] = useState(() => derbyFor(clock()));

  useEffect(() => {
    let active = true;
    Promise.all([getGameProfile(), listMyGameCatches(), listFishYearBounties ? listFishYearBounties() : []]).then(([profileData, catchData, bountyData]) => {
      if (!active) return;
      setGameProfile({ ...DEFAULT_GAME_PROFILE, ...(profileData || {}) });
      setCatches(catchData);
      setBounties(bountyData || []);
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Time of day follows the real clock; re-tint exactly at the next boundary. ----
  useEffect(() => {
    const timer = setTimeout(() => setPeriod(periodFor(clockRef.current())), msUntilNextPeriod(clockRef.current()));
    return () => clearTimeout(timer);
  }, [period]);

  // ---- Sound: the ambient bed follows the ground and the hour once the player has tapped
  // something (browsers won't start audio before that); effects fire on phase changes. ----
  useEffect(() => { if (audioReady) setAmbience(biome, period); }, [audioReady, biome, period]);
  useEffect(() => () => stopAllAudio(), []);
  function wakeAudio() { unlockAudio(); setAudioReady(true); }
  function handleSoundToggle() { wakeAudio(); setMuted(toggleMuted()); sfx.tap(); }

  const previousPointsRef = useRef(null);
  useEffect(() => {
    if (loading) return;
    const previous = previousPointsRef.current;
    previousPointsRef.current = gameProfile.tackle_points;
    if (previous !== null && previous !== gameProfile.tackle_points) sfx.coin(gameProfile.tackle_points > previous);
  }, [gameProfile.tackle_points, loading]);

  useEffect(() => {
    if (phase === 'casting') sfx.cast();
    else if (phase === 'waiting') sfx.splash();
    else if (phase === 'hookset') sfx.bite();
  }, [phase]);

  // ---- Casting: a power meter you have to time a stop on. Landing it in the sweet spot
  // earns a small points bonus on whatever gets landed this round. ----
  const castIndicatorRef = useRef(null);
  const castValueRef = useRef(0);
  const castRafRef = useRef(null);
  const castStartRef = useRef(0);

  useEffect(() => {
    if (phase !== 'casting') return undefined;
    castStartRef.current = performance.now();
    function tick(now) {
      const elapsed = now - castStartRef.current;
      const value = 50 + 50 * Math.sin(elapsed / 380);
      castValueRef.current = value;
      if (castIndicatorRef.current) castIndicatorRef.current.style.left = `${value}%`;
      castRafRef.current = requestAnimationFrame(tick);
    }
    if (typeof requestAnimationFrame === 'function') castRafRef.current = requestAnimationFrame(tick);
    return () => { if (castRafRef.current) cancelAnimationFrame(castRafRef.current); };
  }, [phase]);

  // Switching biomes ends any chartered trip in progress — heading back to a paid biome later
  // means chartering again, which is the point: most biomes are free, the charters cost a trip.
  // The trip itself plays out on the stage (TravelTransition) while the new ground is already
  // set underneath, so nothing waits on the animation.
  const travelTimerRef = useRef(null);
  function selectBiome(nextBiome) {
    setOverlay(null);
    if (nextBiome === biome || !biomeUnlocked(nextBiome, gameProfile.quests)) return;
    if (BIOMES[biome].charterCost > 0) setChartered(false);
    setBiome(nextBiome);
    setCharterError('');
    clearTimeout(travelTimerRef.current);
    const vehicle = vehicleFor(biome, nextBiome);
    setTravel({ to: nextBiome, vehicle });
    sfx.travel(vehicle);
    travelTimerRef.current = setTimeout(() => setTravel(null), TRAVEL_MS);
  }
  useEffect(() => () => clearTimeout(travelTimerRef.current), []);

  async function startCast() {
    wakeAudio();
    setCharterError('');
    setOverlay(null);
    clearTimeout(travelTimerRef.current);
    setTravel(null);
    const biomeConfig = BIOMES[biome];
    if (biomeConfig.charterCost > 0 && !chartered) {
      setCastBusy(true);
      const response = await charterBoat(biome);
      setCastBusy(false);
      if (response?.error) { setCharterError(response.error.message); return; }
      if (response.gameProfile) setGameProfile((current) => ({ ...current, ...response.gameProfile }));
      setChartered(true);
    }
    setPhase('casting');
  }

  // Back to the dock: lets the angler see their tackle points and switch grounds before the
  // next trip, rather than snapping straight back into casting wherever they left off.
  function returnToReady() {
    setResult(null);
    setPendingCatch(null);
    setPerfectCast(false);
    setPresentationQuality(0);
    setLureFeedback('');
    setPhase('ready');
  }

  async function handleLurePurchase(lureKey) {
    setLureBusy(true); setLureError('');
    const response = await purchaseLure(lureKey);
    setLureBusy(false);
    if (response?.error) { setLureError(response.error.message); setShopEvent({ type: 'error', message: response.error.message }); return; }
    if (response.gameProfile) setGameProfile((current) => ({ ...current, ...response.gameProfile }));
    setShopEvent({ type: 'lure', label: LURES[lureKey].label });
    setLure(lureKey);
  }

  function stopCast() {
    const power = castValueRef.current;
    setPerfectCast(power >= CAST_SWEET_SPOT[0] && power <= CAST_SWEET_SPOT[1]);
    setPhase('waiting');
  }

  // ---- Waiting for a bite. How this plays depends on the lure: live bait is a random delay
  // (striking early is its own failure mode, same button as the real hookset); jerk bait and
  // crank bait turn the wait into a skill check whose quality shifts the roll toward rarer
  // fish and pays a points bonus (see utils/gameLures.js and utils/lurePhysics.js). ----
  const biteTimeoutRef = useRef(null);
  const lureIntervalRef = useRef(null);
  const jerkStateRef = useRef(INITIAL_JERK_STATE);
  const jerkElapsedRef = useRef(0);
  const jerkMarkerRef = useRef(0);
  const crankStateRef = useRef(INITIAL_CRANK_STATE);
  const crankHoldingRef = useRef(false);

  function triggerBite(quality) {
    clearInterval(lureIntervalRef.current);
    setPresentationQuality(quality);
    setPendingCatch(rollSpecies(gameProfile.bait_level + quality * QUALITY_BAIT_LEVELS, BIOMES[biome].species, { period }));
    setPhase('hookset');
  }

  useEffect(() => {
    if (phase !== 'waiting') return undefined;
    const interaction = LURES[lure].interaction;
    setLureFeedback('');

    if (interaction === 'wait') {
      const delay = 1200 + Math.random() * 2600;
      biteTimeoutRef.current = setTimeout(() => triggerBite(0), delay);
      return () => clearTimeout(biteTimeoutRef.current);
    }

    if (interaction === 'twitch') {
      jerkStateRef.current = INITIAL_JERK_STATE;
      jerkElapsedRef.current = 0;
      jerkMarkerRef.current = 0;
      setLureDisplay({ marker: 0, attraction: 0 });
      lureIntervalRef.current = setInterval(() => {
        jerkElapsedRef.current += JERK_TICK_MS;
        jerkStateRef.current = decayJerk(jerkStateRef.current, JERK_TICK_MS);
        jerkMarkerRef.current = jerkMarker(jerkElapsedRef.current);
        setLureDisplay({ marker: jerkMarkerRef.current, attraction: jerkStateRef.current.attraction, lineOut: 100 - (jerkElapsedRef.current / JERK_TIME_LIMIT_MS) * 100 });
        if (jerkElapsedRef.current >= JERK_TIME_LIMIT_MS) {
          clearInterval(lureIntervalRef.current);
          finishRound({ success: false, message: 'Worked it all the way back — no takers.' });
        }
      }, JERK_TICK_MS);
      return () => clearInterval(lureIntervalRef.current);
    }

    crankStateRef.current = INITIAL_CRANK_STATE;
    crankHoldingRef.current = false;
    setLureDisplay({ ...INITIAL_CRANK_STATE });
    lureIntervalRef.current = setInterval(() => {
      const nextState = stepCrank(crankStateRef.current, { holding: crankHoldingRef.current });
      crankStateRef.current = nextState;
      setLureDisplay(nextState);
      if (nextState.attraction >= 100) triggerBite(crankQuality(nextState));
      else if (nextState.distance >= 100) {
        clearInterval(lureIntervalRef.current);
        finishRound({ success: false, message: 'Cranked it back to the boat — nothing followed.' });
      }
    }, CRANK_TICK_MS);
    return () => clearInterval(lureIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function strikeEarly() {
    clearTimeout(biteTimeoutRef.current);
    finishRound({ success: false, message: 'Too early — there was no bite yet.' });
  }

  function twitch() {
    const nextState = twitchJerk(jerkStateRef.current, jerkMarkerRef.current);
    jerkStateRef.current = nextState;
    setLureFeedback(nextState.lastTwitchOnBeat ? 'Nice twitch.' : 'Spooked it — off the beat.');
    setLureDisplay((previous) => ({ ...previous, marker: jerkMarkerRef.current, attraction: nextState.attraction }));
    sfx.tap();
    if (nextState.attraction >= 100) triggerBite(jerkQuality(nextState));
  }

  function startCrank() { crankHoldingRef.current = true; }
  function stopCrank() { crankHoldingRef.current = false; }

  // ---- Hookset: a short, rarity-scaled window (widened by the rod level) to react in. ----
  const hooksetTimeoutRef = useRef(null);
  const hooksetWindowMs = pendingCatch ? difficultyFor(pendingCatch.rarity).hookWindowMs + hookWindowBonusMs(gameProfile.rod_level) : 0;

  useEffect(() => {
    if (phase !== 'hookset' || !pendingCatch) return undefined;
    hooksetTimeoutRef.current = setTimeout(() => {
      finishRound({ success: false, message: 'The fish stole the bait — you missed the hookset.' });
    }, hooksetWindowMs);
    return () => clearTimeout(hooksetTimeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pendingCatch]);

  function setHook() {
    clearTimeout(hooksetTimeoutRef.current);
    setPhase('reeling');
  }

  // ---- Reel-in: the real skill test. Hold to reel the catch zone up toward the fish; the
  // fish drifts erratically (harder/faster for rarer fish, smoothed by the reel level), and
  // line tension climbs whenever it's outside the zone (capped higher by the line level). ----
  const holdingRef = useRef(false);
  const reelStateRef = useRef(INITIAL_REEL_STATE);
  const reelIntervalRef = useRef(null);
  const reelElapsedRef = useRef(0);
  const zoneWidthRef = useRef(0);
  const tensionMaxRef = useRef(100);

  useEffect(() => {
    if (phase !== 'reeling' || !pendingCatch) return undefined;
    const difficulty = difficultyFor(pendingCatch.rarity);
    const fishSpeed = difficulty.fishSpeed * fishSpeedMultiplier(gameProfile.reel_level);
    const drainRate = difficulty.drainRate * drainMultiplier(gameProfile.reel_level);
    zoneWidthRef.current = difficulty.zoneWidth;
    tensionMaxRef.current = tensionMaxFor(gameProfile.line_level);

    reelStateRef.current = INITIAL_REEL_STATE;
    holdingRef.current = false;
    reelElapsedRef.current = 0;
    setReelDisplay(INITIAL_REEL_STATE);

    reelIntervalRef.current = setInterval(() => {
      reelElapsedRef.current += REEL_TICK_MS;
      const nextState = stepReel(reelStateRef.current, { holding: holdingRef.current, fishSpeed, drainRate, zoneWidth: zoneWidthRef.current });
      reelStateRef.current = nextState;
      setReelDisplay(nextState);

      if (nextState.progress >= 100) {
        clearInterval(reelIntervalRef.current);
        landFish();
      } else if (nextState.tension >= tensionMaxRef.current) {
        clearInterval(reelIntervalRef.current);
        finishRound({ success: false, message: 'The line snapped!' });
      } else if (reelElapsedRef.current >= REEL_TIME_LIMIT_MS) {
        clearInterval(reelIntervalRef.current);
        finishRound({ success: false, message: 'It worked the hook loose and swam off.' });
      }
    }, REEL_TICK_MS);

    return () => clearInterval(reelIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pendingCatch]);

  const [reelHolding, setReelHolding] = useState(false);
  function startReel() { holdingRef.current = true; setReelHolding(true); }
  function stopReel() { holdingRef.current = false; setReelHolding(false); }

  useEffect(() => {
    if (!reelHolding) return undefined;
    const ticker = setInterval(() => sfx.reelTick(), REEL_SOUND_MS);
    return () => clearInterval(ticker);
  }, [reelHolding]);

  async function landFish() {
    let pointsEarned = Math.round(pointsFor(pendingCatch.rarity) * qualityPointsMultiplier(presentationQuality));
    if (perfectCast) pointsEarned = Math.round(pointsEarned * 1.2);
    const sizeIn = rollSize(pendingCatch.species);
    const label = sizeLabel(sizeIn);
    const response = await logGameCatch({ species: pendingCatch.species, rarity: pendingCatch.rarity, sizeLabel: label, pointsEarned, sizeIn, biome });
    let isRecord = false;
    let completedQuests = [];
    if (!response?.error) {
      if (response.gameProfile) setGameProfile((current) => ({ ...current, ...response.gameProfile }));
      if (response.catchEntry) setCatches((previous) => [response.catchEntry, ...previous]);
      isRecord = Boolean(response.isRecord);
      completedQuests = response.completedQuests || [];
    }
    sfx.land(pendingCatch.rarity);
    if (isRecord) sfx.record();
    setResult({ success: true, species: pendingCatch.species, rarity: pendingCatch.rarity, sizeLabel: label, sizeIn, pointsEarned, isRecord, completedQuests });
    setPhase('result');
  }

  function finishRound({ success, message }) {
    if (!success) { if (/snapped/i.test(message)) sfx.snap(); else sfx.lost(); }
    setResult({ success, message, species: pendingCatch?.species, rarity: pendingCatch?.rarity });
    setPhase('result');
  }

  async function handleUpgrade(trackKey) {
    setUpgradeBusy(true); setUpgradeError('');
    const response = await purchaseUpgrade(trackKey);
    setUpgradeBusy(false);
    if (response?.error) { setUpgradeError(response.error.message); setShopEvent({ type: 'error', message: response.error.message }); return; }
    if (response.gameProfile) setGameProfile((current) => ({ ...current, ...response.gameProfile }));
    setShopEvent({ type: 'upgrade', label: UPGRADE_TRACKS.find((track) => track.key === trackKey)?.label || 'gear' });
  }

  async function handleQuestTurnIn(questKey) {
    if (!claimQuestReward) return;
    setQuestBusy(true);
    const response = await claimQuestReward(questKey);
    setQuestBusy(false);
    if (response?.error) { setShopEvent({ type: 'error', message: response.error.message }); return; }
    if (response.gameProfile) setGameProfile((current) => ({ ...current, ...response.gameProfile }));
    setShopEvent({ type: 'quest', points: response.points });
  }

  async function handleBountyClaim() {
    if (!claimFishYearBounties) return;
    setBountyBusy(true);
    const response = await claimFishYearBounties();
    setBountyBusy(false);
    if (response?.error) { setShopEvent({ type: 'error', message: response.error.message }); return; }
    if (response.gameProfile) setGameProfile((current) => ({ ...current, ...response.gameProfile }));
    setBounties([]);
    setShopEvent({ type: 'bounty', count: response.claimed, points: response.points });
  }

  // The derby board loads when the trophy case opens, so the dock never waits on it.
  useEffect(() => {
    if (overlay !== 'trophies' || !listDerbyLeaders) return undefined;
    let active = true;
    setDerbyLeaders(null);
    listDerbyLeaders({ species: derby.species, since: derby.since }).then((rows) => { if (active) setDerbyLeaders(rows || []); });
    return () => { active = false; };
  }, [overlay, listDerbyLeaders, derby]);

  // Real-life personal bests sit in the trophy case next to game catches, tagged so the two
  // never get confused — the point is that the angler in the game is the actual person.
  const realTrophies = personalBests.map((best) => ({
    id: `pb-${best.id}`, species: best.species, icon: speciesIcon(best.species), sizeLabel: best.size_label, photoUrl: best.photo_url,
  }));

  const toggleOverlay = (name) => { wakeAudio(); sfx.tap(); setOverlay((current) => (current === name ? null : name)); };
  const biomeConfig = BIOMES[biome];
  const groundCost = biomeConfig.charterCost > 0 ? (chartered ? 'chartered' : `charter · ${biomeConfig.charterCost} pts`) : 'free';
  const quests = gameProfile.quests || {};
  const records = gameProfile.records || {};
  const captainQuests = questsFor('captain', quests);
  const shopQuests = questsFor('shopkeeper', quests);
  const captainClaimable = claimableQuests(quests).filter((quest) => quest.giver === 'captain');
  const almanacTotal = new Set(BIOME_LIST.flatMap((entry) => entry.species)).size;
  const almanacCaught = Object.keys(records).length;

  if (loading) return <main className="content-shell game-page">
    <div className="game-loading"><img className="game-loading-box" src={TACKLE_BOX} alt="" /><p className="month-empty">Loading your tackle box...</p></div>
  </main>;

  return <main className="content-shell game-page">
    <div className={`game-frame is-${phase} ${overlay ? 'has-overlay' : ''}`}>
      <div className="game-body">
      <div className="game-stage">
      <GameScene
        biome={biome}
        phase={phase}
        displayName={profile?.display_name}
        species={pendingCatch?.species}
        reel={reelDisplay}
        zoneWidth={zoneWidthRef.current}
        result={result}
        holding={reelHolding}
        travel={travel}
        period={period}
      />
      {/* The HUD lives on the stage itself, as signage in the world: a plank plate for the
          balance, plank tags for the current setup, and signpost buttons for the map, the shop,
          the almanac and the trophy case. It sits above the overlays so those buttons always work. */}
      <header className="game-hud">
        <div className="hud-plate">
          <span className="hud-brand">CAST &amp; CATCH</span>
          <PointsCounter value={gameProfile.tackle_points} />
        </div>
        <div className="hud-chips" aria-label="Current setup">
          <span className="hud-chip">{biomeConfig.label}</span>
          <span className="hud-chip has-icon"><img src={LURE_ICONS[lure]} alt="" />{LURES[lure].label}</span>
          <span className={`hud-chip is-${period}`}>{PERIOD_LABELS[period]}</span>
          <span className="hud-chip">Bait LV {gameProfile.bait_level}</span>
        </div>
        <nav className="hud-nav" aria-label="Game menu">
          <button type="button" className={`hud-button ${overlay === 'map' ? 'is-open' : ''}`} disabled={phase !== 'ready'} aria-pressed={overlay === 'map'} aria-label="Travel" onClick={() => toggleOverlay('map')}><img src={HUD_ICONS.map} alt="" /><span aria-hidden="true">Travel</span></button>
          <button type="button" className={`hud-button ${overlay === 'shop' ? 'is-open' : ''}`} aria-pressed={overlay === 'shop'} aria-label="Shop" onClick={() => toggleOverlay('shop')}><img src={HUD_ICONS.shop} alt="" /><span aria-hidden="true">Shop</span></button>
          <button type="button" className={`hud-button ${overlay === 'almanac' ? 'is-open' : ''}`} aria-pressed={overlay === 'almanac'} aria-label="Almanac" onClick={() => toggleOverlay('almanac')}><img src={HUD_ICONS.almanac} alt="" /><span aria-hidden="true">Almanac</span></button>
          <button type="button" className={`hud-button ${overlay === 'trophies' ? 'is-open' : ''}`} aria-pressed={overlay === 'trophies'} aria-label="Trophies" onClick={() => toggleOverlay('trophies')}><img src={HUD_ICONS.trophies} alt="" /><span aria-hidden="true">Trophies</span></button>
          <button type="button" className={`hud-button hud-button-sound ${muted ? 'is-muted' : ''}`} aria-label={muted ? 'Sound off' : 'Sound on'} aria-pressed={!muted} onClick={handleSoundToggle}><img src={HUD_ICONS.sound} alt="" /><span aria-hidden="true">{muted ? 'Muted' : 'Sound'}</span></button>
        </nav>
      </header>
      </div>

      <div className="game-dock">
        {phase === 'ready' && <div className="game-panel">
          <div className="dock-row">
            <button type="button" className="dock-ground" onClick={() => toggleOverlay('map')} aria-label={`Change fishing ground · currently ${biomeConfig.label}`}>
              <span>Fishing</span><strong>{biomeConfig.label}</strong><small>{groundCost}</small>
            </button>
            <div className="lure-chips" role="group" aria-label="Lure">
              {LURE_LIST.map((lureOption) => {
                const owned = lureOwned(gameProfile, lureOption.key);
                return <button
                  key={lureOption.key}
                  type="button"
                  className={`lure-chip ${lure === lureOption.key ? 'is-active' : ''} ${owned ? '' : 'is-locked'}`}
                  disabled={lureBusy}
                  aria-pressed={lure === lureOption.key}
                  onClick={() => (owned ? setLure(lureOption.key) : handleLurePurchase(lureOption.key))}
                >
                  <img className="lure-icon" src={LURE_ICONS[lureOption.key]} alt="" />
                  <span className="lure-chip-text">
                    <strong>{lureOption.label}</strong>
                    <span>{owned ? (lureOption.cost > 0 ? 'Owned' : 'Free') : `Unlock · ${lureOption.cost} pts`}</span>
                  </span>
                </button>;
              })}
            </div>
          </div>
          <p className="dock-hint">{biomeConfig.blurb} {LURES[lure].blurb}</p>
          {derby.grounds.includes(biome) && <p className="dock-derby"><img src={DERBY_FLAG} alt="" /> Derby water: the club is after <strong>{speciesLabel(derby.species).toLowerCase()}</strong> this week.</p>}
          {lureError && <p className="form-error">{lureError}</p>}
          {charterError && <p className="form-error">{charterError}</p>}
          <NpcDialogue npc="captain" line={captainLine({ biome, chartered, charterError, phase, period, quests })} compact />
          {captainQuests.length > 0 && <ul className="quest-list is-compact" aria-label="Cap'n Ray's quests">
            {captainQuests.map((quest) => <li key={quest.key} className={`quest-row ${questState(quests, quest.key).done ? 'is-done' : ''}`}>
              <span className="quest-title">{quest.title}</span>
              <span className="quest-progress">{questProgressLabel(quest, quests)}</span>
              {captainClaimable.some((candidate) => candidate.key === quest.key) && <button type="button" className="button button-quiet quest-turn-in" disabled={questBusy} onClick={() => handleQuestTurnIn(quest.key)}>Turn in · {quest.reward.points} pts</button>}
            </li>)}
          </ul>}
          <button className="button button-primary" type="button" aria-label="Cast" disabled={castBusy} onClick={startCast}>{castBusy ? 'Chartering...' : 'Cast'} <span>→</span></button>
        </div>}

        {phase === 'casting' && <div className="game-panel">
          <p>Tap to stop the cast in the sweet spot.</p>
          <div className="cast-meter">
            <div className="cast-sweet-spot" style={{ left: `${CAST_SWEET_SPOT[0]}%`, width: `${CAST_SWEET_SPOT[1] - CAST_SWEET_SPOT[0]}%` }} />
            <div className="cast-indicator" ref={castIndicatorRef} />
          </div>
          <button className="button button-primary" type="button" onClick={stopCast}>Cast! <span>⚓</span></button>
        </div>}

        {phase === 'waiting' && LURES[lure].interaction === 'wait' && <div className="game-panel">
          <p className="game-waiting-text">{perfectCast ? 'Perfect cast! ' : ''}Waiting for a bite...</p>
          <button className="button button-quiet" type="button" onClick={strikeEarly}>Set the hook</button>
        </div>}

        {phase === 'waiting' && LURES[lure].interaction === 'twitch' && lureDisplay && <div className="game-panel">
          <p className="game-waiting-text">{perfectCast ? 'Perfect cast! ' : ''}Twitch when the marker hits the zone.</p>
          <div className="cast-meter">
            <div className="cast-sweet-spot" style={{ left: `${JERK_ZONE[0]}%`, width: `${JERK_ZONE[1] - JERK_ZONE[0]}%` }} />
            <div className="cast-indicator" style={{ left: `${lureDisplay.marker}%` }} />
          </div>
          <div className="reel-meters">
            <div className="reel-meter"><span>Attraction</span><div className="reel-meter-track"><div className="reel-meter-fill is-progress" style={{ width: `${lureDisplay.attraction}%` }} /></div></div>
            <div className="reel-meter"><span>Line out</span><div className="reel-meter-track"><div className="reel-meter-fill is-tension" style={{ width: `${lureDisplay.lineOut ?? 100}%` }} /></div></div>
          </div>
          <p className="lure-feedback">{lureFeedback || ' '}</p>
          <button className="button button-primary game-hookset-button" type="button" onClick={twitch}>Twitch</button>
        </div>}

        {phase === 'waiting' && LURES[lure].interaction === 'crank' && lureDisplay && <div className="game-panel">
          <p className="game-waiting-text">{perfectCast ? 'Perfect cast! ' : ''}Hold to crank — keep the speed in the strike zone.</p>
          <div className="cast-meter">
            <div className="cast-sweet-spot" style={{ left: `${lureDisplay.bandCenter - CRANK_BAND_WIDTH / 2}%`, width: `${CRANK_BAND_WIDTH}%` }} />
            <div className="cast-indicator" style={{ left: `${lureDisplay.speed}%` }} />
          </div>
          <div className="reel-meters">
            <div className="reel-meter"><span>Attraction</span><div className="reel-meter-track"><div className="reel-meter-fill is-progress" style={{ width: `${lureDisplay.attraction}%` }} /></div></div>
            <div className="reel-meter"><span>Line out</span><div className="reel-meter-track"><div className="reel-meter-fill is-tension" style={{ width: `${100 - lureDisplay.distance}%` }} /></div></div>
          </div>
          <button
            className="button button-primary game-reel-button"
            type="button"
            onPointerDown={startCrank}
            onPointerUp={stopCrank}
            onPointerLeave={stopCrank}
            onTouchStart={startCrank}
            onTouchEnd={stopCrank}
          >Hold to crank</button>
        </div>}

        {phase === 'hookset' && pendingCatch && <div className="game-panel">
          <p className="game-alert">FISH ON! Set the hook now!</p>
          <div className="hookset-bar"><div key={pendingCatch.species} className="hookset-bar-fill" style={{ animationDuration: `${hooksetWindowMs}ms` }} /></div>
          <button className="button button-primary game-hookset-button" type="button" onClick={setHook}>Set the hook!</button>
        </div>}

        {phase === 'reeling' && pendingCatch && <div className="game-panel">
          <p>Hold to reel — keep the fish inside the glowing zone.</p>
          <div className="reel-meters">
            <div className="reel-meter"><span>Progress</span><div className="reel-meter-track"><div className="reel-meter-fill is-progress" style={{ width: `${reelDisplay.progress}%` }} /></div></div>
            <div className="reel-meter"><span>Line tension</span><div className="reel-meter-track"><div className="reel-meter-fill is-tension" style={{ width: `${Math.min(100, (reelDisplay.tension / tensionMaxRef.current) * 100)}%` }} /></div></div>
          </div>
          <button
            className="button button-primary game-reel-button"
            type="button"
            onPointerDown={startReel}
            onPointerUp={stopReel}
            onPointerLeave={stopReel}
            onTouchStart={startReel}
            onTouchEnd={stopReel}
          >Hold to reel</button>
        </div>}

        {phase === 'result' && result && <div className="game-panel game-result">
          {result.success ? <>
            <div className="result-tags">
              <span className="status-badge rarity-tag" style={{ background: RARITY_INFO[result.rarity].color, color: RARITY_INFO[result.rarity].text }}>{RARITY_INFO[result.rarity].label.toUpperCase()}</span>
              {result.isRecord && <span className="status-badge rarity-tag is-record">NEW RECORD</span>}
              {result.species === derby.species && <span className="status-badge rarity-tag is-derby">DERBY FISH</span>}
            </div>
            <h3>{speciesLabel(result.species)} landed!</h3>
            <p>{result.sizeLabel} · +{result.pointsEarned} tackle points</p>
            {result.completedQuests?.map((key) => <p key={key} className="quest-complete">Quest complete: <strong>{QUEST_BY_KEY[key]?.title}</strong>{QUEST_BY_KEY[key]?.reward.unlocks ? ' — a new ground is on the map.' : ' — turn it in.'}</p>)}
          </> : <h3>{result.message}</h3>}
          {(biome === 'offshore' || biome === 'canyon' || result.isRecord) && <NpcDialogue npc="captain" line={captainLine({ biome, chartered, phase, result, period, quests, isRecord: result.isRecord })} compact />}
          <button className="button button-primary" type="button" aria-label="Back to the dock" onClick={returnToReady}>Back to the dock <span>→</span></button>
        </div>}
      </div>

      {overlay === 'map' && <GameOverlay eyebrow="Travel" title="Fishing grounds" onClose={() => setOverlay(null)}>
        <BiomeMap biome={biome} chartered={chartered} onSelect={selectBiome} onShop={() => setOverlay('shop')} quests={quests} derby={derby} />
        <p className="dock-hint">{biomeConfig.blurb}</p>
      </GameOverlay>}

      {overlay === 'shop' && <GameOverlay eyebrow="Sal's Tackle" title="Tackle shop" backdrop={shopBackdrop} onClose={() => setOverlay(null)}>
        <NpcDialogue npc="shopkeeper" line={shopkeeperLine({ gameProfile, event: shopEvent, personalBests, bounties })} />
        {upgradeError && <p className="form-error">{upgradeError}</p>}
        <div className="upgrade-grid">
          {UPGRADE_TRACKS.map((track) => {
            const level = gameProfile[track.column] || 1;
            const maxed = level >= MAX_UPGRADE_LEVEL;
            const cost = upgradeCost(level);
            return <div className="upgrade-card" key={track.key}>
              <img className="upgrade-icon" src={GEAR_ICONS[track.key]} alt="" />
              <strong>{track.label}</strong>
              <span className="upgrade-level">LV {level}{maxed ? ' · MAX' : ''}</span>
              <p>{track.blurb}</p>
              <button className="button button-quiet" type="button" disabled={maxed || upgradeBusy} onClick={() => handleUpgrade(track.key)}>{maxed ? 'Maxed out' : `Upgrade · ${cost} pts`}</button>
            </div>;
          })}
        </div>
        <div className="shop-boards">
          <section className="shop-board" aria-label="Sal's quests">
            <span className="eyebrow">SAL'S WALL</span>
            {shopQuests.map((quest) => {
              const state = questState(quests, quest.key);
              return <div className={`quest-card ${state.done ? 'is-done' : ''}`} key={quest.key}>
                <strong>{quest.title}</strong>
                <p>{quest.brief} <em>{quest.hint}</em></p>
                <span className="quest-progress">{questProgressLabel(quest, quests)}</span>
                {state.done && !state.claimed && <button type="button" className="button button-quiet" disabled={questBusy} onClick={() => handleQuestTurnIn(quest.key)}>Turn in · {quest.reward.points} pts</button>}
              </div>;
            })}
          </section>
          <section className="shop-board" aria-label="Bounty board">
            <span className="eyebrow">BOUNTY BOARD</span>
            <div className="quest-card">
              <strong>Real catches pay here</strong>
              <p>Every fish you log for Fish Year is worth {bounties[0]?.points || 15} tackle points at the counter, once.</p>
              <span className="quest-progress">{bounties.length === 0 ? 'Nothing new to claim' : `${bounties.length} to claim · ${bounties.length * (bounties[0]?.points || 15)} pts`}</span>
              <button type="button" className="button button-quiet" disabled={bounties.length === 0 || bountyBusy} onClick={handleBountyClaim}>Claim bounty</button>
            </div>
          </section>
        </div>
        <p className="dock-hint">Lures are on the dock — pick one there, or unlock it from its chip.</p>
      </GameOverlay>}

      {overlay === 'almanac' && <GameOverlay eyebrow="Field guide" title="Almanac" backdrop={trophyWallBackdrop} onClose={() => setOverlay(null)}>
        <p className="almanac-progress"><strong>{almanacCaught}</strong> of <strong>{almanacTotal}</strong> species landed. {period === 'night' ? 'Night feeders are marked.' : 'Some only feed after dark.'}</p>
        {BIOME_LIST.map((ground) => {
          const unlocked = biomeUnlocked(ground.key, quests);
          return <section key={ground.key} className={`almanac-biome ${unlocked ? '' : 'is-locked'}`} aria-label={unlocked ? ground.label : 'Locked ground'}>
            <h3>{unlocked ? ground.label : '???'} <small>{ground.species.filter((species) => records[species]).length} / {ground.species.length}</small></h3>
            <div className="almanac-grid">
              {ground.species.map((species) => {
                const record = records[species];
                const rarity = rarityOf(species);
                return <div key={species} className={`almanac-card ${record ? 'is-known' : 'is-unknown'}`} data-species={species}>
                  <FishIllustration species={species} />
                  <strong>{record && unlocked ? speciesLabel(species) : '???'}</strong>
                  <span className="almanac-meta">
                    <i className="rarity-dot" style={{ background: RARITY_INFO[rarity].color }} title={RARITY_INFO[rarity].label} />
                    {record ? `Best ${sizeLabel(record.size_in)}` : RARITY_INFO[rarity].label}
                    {NOCTURNAL.includes(species) && <em title="Feeds after dark"> ☾</em>}
                    {species === derby.species && <img className="almanac-flag" src={DERBY_FLAG} alt="Derby target" />}
                  </span>
                </div>;
              })}
            </div>
          </section>;
        })}
      </GameOverlay>}

      {overlay === 'trophies' && <GameOverlay eyebrow="Trophy case" title="Real bests and game catches" backdrop={trophyWallBackdrop} onClose={() => setOverlay(null)}>
        <section className="derby-board" aria-label="Club derby">
          <div className="derby-head">
            <img src={DERBY_FLAG} alt="" />
            <div>
              <span className="eyebrow">CLUB DERBY · {derby.key}</span>
              <h3>Biggest {speciesLabel(derby.species).toLowerCase()} this week</h3>
              <small>Found in {derby.grounds.map((ground) => BIOMES[ground].label).join(', ')}. Resets Monday.</small>
            </div>
          </div>
          {derbyLeaders === null && <p className="month-empty">Checking the board...</p>}
          {derbyLeaders?.length === 0 && <p className="month-empty">Nobody has landed one yet this week. First on the board wins bragging rights.</p>}
          {derbyLeaders?.length > 0 && <ol className="derby-list">
            {derbyLeaders.slice(0, 10).map((row, index) => <li key={row.userId} className={row.userId === profile?.id ? 'is-me' : ''}>
              <span className="derby-rank">{index + 1}</span>
              <span className="mini-avatar">{row.avatarUrl ? <img src={row.avatarUrl} alt="" /> : row.anglerName.slice(0, 1).toUpperCase()}</span>
              <span className="derby-name">{row.anglerName}</span>
              <strong>{sizeLabel(row.sizeIn)}</strong>
            </li>)}
          </ol>}
        </section>
        {catches.length === 0 && realTrophies.length === 0 ? <p className="month-empty">Nothing on the wall yet — cast a line, or log a real personal best on your profile.</p> : <div className="trophy-grid">
          {realTrophies.map((entry) => <div className="trophy-card is-real" key={entry.id}>
            {entry.photoUrl ? <img className="trophy-photo" src={entry.photoUrl} alt={entry.species} /> : <FishIllustration species={entry.icon} />}
            <span className="rarity-tag is-real">Real PB</span>
            <strong>{entry.species}</strong>
            <span>{entry.sizeLabel || 'Logged for real'}</span>
          </div>)}
          {catches.map((entry) => <div className="trophy-card" key={entry.id}>
            <FishIllustration species={entry.species} />
            <span className="rarity-tag" style={{ background: RARITY_INFO[entry.rarity]?.color, color: RARITY_INFO[entry.rarity]?.text }}>{RARITY_INFO[entry.rarity]?.label || entry.rarity}</span>
            <strong>{speciesLabel(entry.species)}</strong>
            <span>{entry.size_label} · +{entry.points_earned} pts</span>
          </div>)}
        </div>}
      </GameOverlay>}
      </div>
    </div>
  </main>;
}
