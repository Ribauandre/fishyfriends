import React, { useEffect, useRef, useState } from 'react';
import FishIllustration from './components/FishIllustration';
import GameScene from './components/game/GameScene';
import NpcDialogue from './components/game/NpcDialogue';
import speciesIcon from './utils/speciesOptions';
import { shopkeeperLine, captainLine } from './utils/gameDialogue';
import { useAuth } from './context/AuthContext';
import { rollSpecies, difficultyFor, speciesLabel, pointsFor, sizeLabelFor, RARITY_INFO } from './utils/gameSpecies';
import { UPGRADE_TRACKS, MAX_UPGRADE_LEVEL, upgradeCost, hookWindowBonusMs, tensionMaxFor, fishSpeedMultiplier, drainMultiplier } from './utils/gameUpgrades';
import { BIOMES, BIOME_LIST } from './utils/gameBiomes';
import { LURES, LURE_LIST, lureOwned, QUALITY_BAIT_LEVELS, qualityPointsMultiplier } from './utils/gameLures';
import { INITIAL_REEL_STATE, stepReel } from './utils/reelPhysics';
import {
  INITIAL_JERK_STATE, INITIAL_CRANK_STATE, JERK_ZONE, JERK_TIME_LIMIT_MS, CRANK_TICK_MS, CRANK_BAND_WIDTH,
  jerkMarker, twitchJerk, decayJerk, jerkQuality, stepCrank, crankQuality,
} from './utils/lurePhysics';

const CAST_SWEET_SPOT = [40, 60];
const REEL_TICK_MS = 80;
const REEL_TIME_LIMIT_MS = 16000;
const JERK_TICK_MS = 50;
const DEFAULT_GAME_PROFILE = { tackle_points: 0, rod_level: 1, line_level: 1, reel_level: 1, bait_level: 1, owned_lures: [] };

export default function FishingGame() {
  const { profile, personalBests = [], getGameProfile, listMyGameCatches, logGameCatch, purchaseUpgrade, charterBoat, purchaseLure } = useAuth();
  const [shopEvent, setShopEvent] = useState(null);
  const [gameProfile, setGameProfile] = useState(DEFAULT_GAME_PROFILE);
  const [catches, setCatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('ready');
  const [biome, setBiome] = useState('lake');
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

  useEffect(() => {
    let active = true;
    Promise.all([getGameProfile(), listMyGameCatches()]).then(([profileData, catchData]) => {
      if (!active) return;
      setGameProfile(profileData || DEFAULT_GAME_PROFILE);
      setCatches(catchData);
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // means chartering again, which is the point: most biomes are free, offshore costs a trip.
  function selectBiome(nextBiome) {
    if (nextBiome === biome) return;
    if (BIOMES[biome].charterCost > 0) setChartered(false);
    setBiome(nextBiome);
    setCharterError('');
  }

  async function startCast() {
    setCharterError('');
    const biomeConfig = BIOMES[biome];
    if (biomeConfig.charterCost > 0 && !chartered) {
      setCastBusy(true);
      const response = await charterBoat();
      setCastBusy(false);
      if (response?.error) { setCharterError(response.error.message); return; }
      if (response.gameProfile) setGameProfile(response.gameProfile);
      setChartered(true);
    }
    setPhase('casting');
  }

  // Back to the dock: lets the angler see their tackle points and switch biomes before the
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
    if (response.gameProfile) setGameProfile(response.gameProfile);
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
    setPendingCatch(rollSpecies(gameProfile.bait_level + quality * QUALITY_BAIT_LEVELS, BIOMES[biome].species));
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

  function startReel() { holdingRef.current = true; }
  function stopReel() { holdingRef.current = false; }

  async function landFish() {
    let pointsEarned = Math.round(pointsFor(pendingCatch.rarity) * qualityPointsMultiplier(presentationQuality));
    if (perfectCast) pointsEarned = Math.round(pointsEarned * 1.2);
    const sizeLabel = sizeLabelFor(pendingCatch.rarity);
    const response = await logGameCatch({ species: pendingCatch.species, rarity: pendingCatch.rarity, sizeLabel, pointsEarned });
    if (!response?.error) {
      if (response.gameProfile) setGameProfile(response.gameProfile);
      if (response.catchEntry) setCatches((previous) => [response.catchEntry, ...previous]);
    }
    setResult({ success: true, species: pendingCatch.species, rarity: pendingCatch.rarity, sizeLabel, pointsEarned });
    setPhase('result');
  }

  function finishRound({ success, message }) {
    setResult({ success, message, species: pendingCatch?.species, rarity: pendingCatch?.rarity });
    setPhase('result');
  }

  async function handleUpgrade(trackKey) {
    setUpgradeBusy(true); setUpgradeError('');
    const response = await purchaseUpgrade(trackKey);
    setUpgradeBusy(false);
    if (response?.error) { setUpgradeError(response.error.message); setShopEvent({ type: 'error', message: response.error.message }); return; }
    if (response.gameProfile) setGameProfile(response.gameProfile);
    setShopEvent({ type: 'upgrade', label: UPGRADE_TRACKS.find((track) => track.key === trackKey)?.label || 'gear' });
  }

  // Real-life personal bests sit in the trophy case next to game catches, tagged so the two
  // never get confused — the point is that the angler in the game is the actual person.
  const realTrophies = personalBests.map((best) => ({
    id: `pb-${best.id}`, species: best.species, icon: speciesIcon(best.species), sizeLabel: best.size_label, photoUrl: best.photo_url,
  }));

  return <main className="content-shell game-page">
    <div className="page-intro">
      <div><span className="eyebrow">CAST &amp; CATCH</span><h1>Fishing minigame</h1><p>Time the cast, set the hook, keep tension on the line. Just for bragging rights — it never touches Fish Year or tournaments.</p></div>
      <FishIllustration species="shark" className="intro-sticker" />
    </div>

    {loading ? <p className="month-empty">Loading your tackle box...</p> : <>
      <section className="table-card game-stage">
        <div className="section-heading">
          <div><span className="eyebrow">TACKLE POINTS</span><h2>{gameProfile.tackle_points}</h2></div>
          <div className="game-status-badges">
            <span className="status-badge-muted game-biome-badge">{BIOMES[biome].label.toUpperCase()}</span>
            <span className="status-badge-muted game-biome-badge">{LURES[lure].label.toUpperCase()}</span>
            <span className="status-badge-muted game-bait-badge">BAIT LV {gameProfile.bait_level}</span>
          </div>
        </div>

        <GameScene
          biome={biome}
          phase={phase}
          avatarUrl={profile?.avatar_url}
          displayName={profile?.display_name}
          species={pendingCatch?.species}
          reel={reelDisplay}
          zoneWidth={zoneWidthRef.current}
          result={result}
        />

        {phase === 'ready' && <div className="game-panel">
          <div className="biome-picker">
            {BIOME_LIST.map((biomeOption) => <button
              key={biomeOption.key}
              type="button"
              className={`biome-button ${biome === biomeOption.key ? 'is-active' : ''}`}
              onClick={() => selectBiome(biomeOption.key)}
            >
              <strong>{biomeOption.label}</strong>
              <span>{biomeOption.charterCost > 0 ? (chartered && biome === biomeOption.key ? 'Chartered for this trip' : `Charter · ${biomeOption.charterCost} pts`) : 'Free'}</span>
            </button>)}
          </div>
          <p>{BIOMES[biome].blurb}</p>
          <div className="biome-picker lure-picker">
            {LURE_LIST.map((lureOption) => {
              const owned = lureOwned(gameProfile, lureOption.key);
              return <button
                key={lureOption.key}
                type="button"
                className={`biome-button ${lure === lureOption.key ? 'is-active' : ''} ${owned ? '' : 'is-locked'}`}
                disabled={lureBusy}
                onClick={() => (owned ? setLure(lureOption.key) : handleLurePurchase(lureOption.key))}
              >
                <strong>{lureOption.label}</strong>
                <span>{owned ? (lureOption.cost > 0 ? 'Owned' : 'Free') : `Unlock · ${lureOption.cost} pts`}</span>
              </button>;
            })}
          </div>
          <p>{LURES[lure].blurb}</p>
          {lureError && <p className="form-error">{lureError}</p>}
          {charterError && <p className="form-error">{charterError}</p>}
          <NpcDialogue npc="captain" line={captainLine({ biome, chartered, charterError, phase })} />
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
          <p className="lure-feedback">{lureFeedback || ' '}</p>
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
            <span className="status-badge rarity-tag" style={{ background: RARITY_INFO[result.rarity].color, color: RARITY_INFO[result.rarity].text }}>{RARITY_INFO[result.rarity].label.toUpperCase()}</span>
            <h3>{speciesLabel(result.species)} landed!</h3>
            <p>{result.sizeLabel} · +{result.pointsEarned} tackle points</p>
          </> : <h3>{result.message}</h3>}
          {biome === 'offshore' && <NpcDialogue npc="captain" line={captainLine({ biome, chartered, phase, result })} />}
          <button className="button button-primary" type="button" aria-label="Back to the dock" onClick={returnToReady}>Back to the dock <span>→</span></button>
        </div>}
      </section>

      <section className="table-card game-shop">
        <div className="section-heading"><div><span className="eyebrow">TACKLE SHOP</span><h2>Smooth out the fight</h2></div></div>
        <NpcDialogue npc="shopkeeper" line={shopkeeperLine({ gameProfile, event: shopEvent })} />
        {upgradeError && <p className="form-error">{upgradeError}</p>}
        <div className="upgrade-grid">
          {UPGRADE_TRACKS.map((track) => {
            const level = gameProfile[track.column] || 1;
            const maxed = level >= MAX_UPGRADE_LEVEL;
            const cost = upgradeCost(level);
            return <div className="upgrade-card" key={track.key}>
              <strong>{track.label}</strong>
              <span className="upgrade-level">LV {level}{maxed ? ' · MAX' : ''}</span>
              <p>{track.blurb}</p>
              <button className="button button-quiet" type="button" disabled={maxed || upgradeBusy} onClick={() => handleUpgrade(track.key)}>{maxed ? 'Maxed out' : `Upgrade · ${cost} pts`}</button>
            </div>;
          })}
        </div>
      </section>

      <section className="table-card game-trophy-case">
        <div className="section-heading"><div><span className="eyebrow">TROPHY CASE</span><h2>Real bests and game catches</h2></div></div>
        {catches.length === 0 && realTrophies.length === 0 ? <p className="month-empty">Nothing on the wall yet — cast a line above, or log a real personal best on your profile.</p> : <div className="trophy-grid">
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
      </section>
    </>}
  </main>;
}
