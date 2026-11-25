import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import useHashAnchor from '../utils/useHashAnchor';

// Where the club's two live channels stand — who is on the dock in the game, and "someone
// just posted" on Home. The app joins both as members-only channels (migration 0045 holds the
// rules), but a Supabase project goes on accepting OPEN channels, which anyone holding the
// site's public key can join, until its owner turns that off in the dashboard. Nothing in the
// app or the database can flip that setting, so this section does the two things that can be
// done from here: it tries both kinds of channel from this device and says what happened, and
// it says when turning open channels off is safe — and when it would break the app instead.
export default function LiveChannelsSection() {
  const { checkLiveChannels } = useAuth();
  const [state, setState] = useState(undefined);
  const [checking, setChecking] = useState(true);
  // Home's reminder links straight here.
  const box = useHashAnchor('live-channels', state !== undefined);

  async function check() {
    setChecking(true);
    setState(await checkLiveChannels());
    setChecking(false);
  }

  useEffect(() => {
    let active = true;
    checkLiveChannels().then((answer) => { if (active) { setState(answer); setChecking(false); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verdict = state?.verdict;
  const said = state?.membersOnly?.reason ? <> The server's answer was: <em>{state.membersOnly.reason}</em></> : null;
  return <section ref={box} className="table-card photo-privacy live-channels" id="live-channels" aria-label="Who can listen in live">
    <div className="section-heading"><div><span className="eyebrow">LIVE CHANNELS</span><h2>{verdict === 'closed' ? 'Live channels are members-only' : 'Who can listen in live'}</h2></div></div>
    {state === undefined && <p className="month-empty" role="status">Trying the live channels from this device...</p>}
    {verdict === 'closed' && <p className="month-empty" role="status">Only members can join the club's live channels: who's on the dock in the game, and "just posted" on Home. Open channels are switched off for the whole project, so the site's public key alone gets nobody in.</p>}
    {verdict === 'open' && <>
      <p className="month-empty" role="status">The app now joins its two live channels (who's on the dock in the game, and "just posted" on Home) as members-only channels, and that works from this device. But the project still accepts open channels too, and anyone holding the site's public key can join one of those and watch who is playing. Closing that is a setting only you can change:</p>
      <ol className="live-channels-steps">
        <li>In the Supabase dashboard, open this project, then Realtime, then Settings.</li>
        <li>Turn off "Allow public access to channels" and save.</li>
        <li>Come back here and press Check again.</li>
      </ol>
      <p className="month-empty">Give the crew a day or two on this update first. A phone that hasn't reloaded the app since would lose the live dock and the live feed until it does; nothing else stops working.</p>
    </>}
    {verdict === 'not-ready' && <>
      <p className="form-error" role="alert">Don't turn open channels off yet. Members-only channels are being refused for this project, so the app is still using open ones, and without them the live dock and the live feed would stop for everyone.{said}</p>
      <p className="month-empty">The two rules they need are in the migration <code>0045_members_only_live_channels.sql</code>. The deploy log says whether it could add them; if it couldn't, run that file in the Supabase SQL editor, then press Check again.</p>
    </>}
    {verdict === 'broken' && <>
      <p className="form-error" role="alert">Neither kind of channel can be joined from this device: open ones are switched off, and members-only ones are being refused. The live dock and the live feed are off until that's fixed; everything else works.{said}</p>
      <p className="month-empty">Either run the migration <code>0045_members_only_live_channels.sql</code> in the Supabase SQL editor, or turn "Allow public access to channels" back on (Realtime, then Settings) for now.</p>
    </>}
    {verdict === 'unknown' && <p className="month-empty" role="status">Couldn't reach the live channels from this device just now. Try again on a good connection.</p>}
    {state !== undefined && <div className="form-actions"><button className="button button-quiet" type="button" disabled={checking} onClick={check}>{checking ? 'Checking...' : 'Check again'}</button></div>}
  </section>;
}
