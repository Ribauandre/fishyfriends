import React, { useEffect, useRef, useState } from 'react';
import FishIllustration from './components/FishIllustration';
import { useAuth } from './context/AuthContext';
import { rollSpecies, difficultyFor, speciesLabel, pointsFor, sizeLabelFor, RARITY_INFO } from './utils/gameSpecies';
import { UPGRADE_TRACKS, MAX_UPGRADE_LEVEL, upgradeCost, hookWindowBonusMs, tensionMaxFor, fishSpeedMultiplier, drainMultiplier } from './utils/gameUpgrades';
import { INITIAL_REEL_STATE, stepReel } from './utils/reelPhysics';

const CAST_SWEET_SPOT = [40, 60];
const REEL_TICK_MS = 80;
const REEL_TIME_LIMIT_MS = 16000;
const DEFAULT_GAME_PROFILE = { tackle_points: 0, rod_level: 1, line_level: 1, reel_level: 1, bait_level: 1 };

export default function FishingGame() {
  const { getGameProfile, listMyGameCatches, logGameCatch, purchaseUpgrade } = useAuth();
  const [gameProfile, setGameProfile] = useState(DEFAULT_GAME_PROFILE);
  const [catches, setCatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('ready');
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

  function startCast() {
    setResult(null);
    setPendingCatch(null);
    setPerfectCast(false);
    setPhase('casting');
  }

  function stopCast() {
    const power = castValueRef.current;
    setPerfectCast(power >= CAST_SWEET_SPOT[0] && power <= CAST_SWEET_SPOT[1]);
    setPhase('waiting');
  }

  // ---- Waiting for a bite: a random delay before the fish is even on the line. Striking
  // early (impatience) is its own failure mode, same button as the real hookset. ----
  const biteTimeoutRef = useRef(null);

  useEffect(() => {
    if (phase !== 'waiting') return undefined;
    const delay = 1200 + Math.random() * 2600;
    biteTimeoutRef.current = setTimeout(() => {
      setPendingCatch(rollSpecies(gameProfile.bait_level));
      setPhase('hookset');
    }, delay);
    return () => clearTimeout(biteTimeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function strikeEarly() {
    clearTimeout(biteTimeoutRef.current);
    finishRound({ success: false, message: 'Too early — there was no bite yet.' });
  }

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
    let pointsEarned = pointsFor(pendingCatch.rarity);
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
    if (response?.error) { setUpgradeError(response.error.message); return; }
    if (response.gameProfile) setGameProfile(response.gameProfile);
  }

  return <main className="content-shell game-page">
    <div className="page-intro">
      <div><span className="eyebrow">CAST &amp; CATCH</span><h1>Fishing minigame</h1><p>Time the cast, set the hook, keep tension on the line. Just for bragging rights — it never touches Fish Year or tournaments.</p></div>
      <FishIllustration species="shark" className="intro-sticker" />
    </div>

    {loading ? <p className="month-empty">Loading your tackle box...</p> : <>
      <section className="table-card game-stage">
        <div className="section-heading">
          <div><span className="eyebrow">TACKLE POINTS</span><h2>{gameProfile.tackle_points}</h2></div>
          <span className="status-badge-muted">BAIT LV {gameProfile.bait_level}</span>
        </div>

        {phase === 'ready' && <div className="game-panel">
          <p>Cast your line when you're ready.</p>
          <button className="button button-primary" type="button" aria-label="Cast" onClick={startCast}>Cast <span>→</span></button>
        </div>}

        {phase === 'casting' && <div className="game-panel">
          <p>Tap to stop the cast in the sweet spot.</p>
          <div className="cast-meter">
            <div className="cast-sweet-spot" style={{ left: `${CAST_SWEET_SPOT[0]}%`, width: `${CAST_SWEET_SPOT[1] - CAST_SWEET_SPOT[0]}%` }} />
            <div className="cast-indicator" ref={castIndicatorRef} />
          </div>
          <button className="button button-primary" type="button" onClick={stopCast}>Cast! <span>⚓</span></button>
        </div>}

        {phase === 'waiting' && <div className="game-panel">
          <p className="game-waiting-text">{perfectCast ? 'Perfect cast! ' : ''}Waiting for a bite...</p>
          <button className="button button-quiet" type="button" onClick={strikeEarly}>Set the hook</button>
        </div>}

        {phase === 'hookset' && pendingCatch && <div className="game-panel">
          <p className="game-alert">FISH ON! Set the hook now!</p>
          <div className="hookset-bar"><div key={pendingCatch.species} className="hookset-bar-fill" style={{ animationDuration: `${hooksetWindowMs}ms` }} /></div>
          <button className="button button-primary game-hookset-button" type="button" onClick={setHook}>Set the hook!</button>
        </div>}

        {phase === 'reeling' && pendingCatch && <div className="game-panel">
          <p>Hold to reel — keep the fish inside the zone.</p>
          <div className="reel-bar">
            <div className="reel-zone" style={{ left: `${reelDisplay.zonePos - zoneWidthRef.current / 2}%`, width: `${zoneWidthRef.current}%` }} />
            <FishIllustration species={pendingCatch.species} className="reel-fish" style={{ left: `${reelDisplay.fishPos}%` }} />
          </div>
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
            <FishIllustration species={result.species} className="game-result-fish" />
            <span className="status-badge rarity-tag" style={{ background: RARITY_INFO[result.rarity].color, color: RARITY_INFO[result.rarity].text }}>{RARITY_INFO[result.rarity].label.toUpperCase()}</span>
            <h3>{speciesLabel(result.species)} landed!</h3>
            <p>{result.sizeLabel} · +{result.pointsEarned} tackle points</p>
          </> : <h3>{result.message}</h3>}
          <button className="button button-primary" type="button" aria-label="Cast again" onClick={startCast}>Cast again <span>→</span></button>
        </div>}
      </section>

      <section className="table-card game-shop">
        <div className="section-heading"><div><span className="eyebrow">TACKLE SHOP</span><h2>Smooth out the fight</h2></div></div>
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
        <div className="section-heading"><div><span className="eyebrow">TROPHY CASE</span><h2>Your Cast &amp; Catch log</h2></div></div>
        {catches.length === 0 ? <p className="month-empty">No catches yet — cast a line above.</p> : <div className="trophy-grid">
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
