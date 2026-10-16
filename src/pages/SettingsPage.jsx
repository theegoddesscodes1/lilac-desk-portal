import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Icon from '../components/Icons';
import { currentSubscription, disablePush, enablePush, needsHomeScreen, pushSupported } from '../lib/push';
import { errorText } from '../lib/orderApi';
import { signOut } from '../lib/appVersion';
import StudioSettings from './admin/StudioSettings';

function DeviceNotifications({ email, isAdmin }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    currentSubscription().then((s) => {
      const active = Boolean(s) && Notification.permission === 'granted';
      setOn(active);
      // Make sure this device is on file, in case an earlier save didn't go through
      if (active) enablePush(email, isAdmin).catch(() => {});
    });
  }, []);

  async function toggle() {
    setBusy(true);
    setMsg('');
    try {
      if (on) {
        await disablePush();
        setOn(false);
      } else {
        await enablePush(email, isAdmin);
        setOn(true);
        setMsg('Notifications are on for this device.');
      }
    } catch (err) {
      setMsg(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!pushSupported() && !needsHomeScreen()) {
    return <p className="muted small">This browser can’t show notifications. Try Chrome or Safari, or add the portal to your home screen.</p>;
  }

  return (
    <div className="setting">
      <div>
        <p className="setting-name">Notifications on this device</p>
        <p className="muted small">
          {isAdmin
            ? 'New orders, messages, briefs, change requests, approvals, and add-ons.'
            : 'When a proof is ready, when I reply, and when your planner is ready.'}
        </p>
        {needsHomeScreen() && (
          <p className="muted small">On iPhone and iPad: tap Share, then Add to Home Screen, and open the portal from there to turn these on.</p>
        )}
        {msg && <p className="small ox">{msg}</p>}
      </div>
      <button type="button" className={`switch${on ? ' switch--on' : ''}`} role="switch" aria-checked={on} onClick={toggle} disabled={busy}>
        <span />
      </button>
    </div>
  );
}

function TestPush() {
  const [state, setState] = useState('');
  async function run() {
    setState('Sending…');
    const { data, error } = await supabase.functions.invoke('portal-notify', { body: { event: 'test' } });
    if (error) return setState(`Couldn't reach the notification service: ${errorText(error)}`);
    let info = {};
    try {
      info = JSON.parse(data?.push?.text || '{}');
    } catch {
      /* not JSON */
    }
    if (data?.push?.status && data.push.status >= 300) return setState(`The push service answered ${data.push.status}: ${data.push.text}`);
    if (info.skipped) return setState(`Not sent: ${info.skipped}.`);
    if (info.devices === 0) return setState('No devices are signed up yet. Turn on notifications above first.');
    setState(`Sent to ${info.sent} of ${info.devices} device${info.devices === 1 ? '' : 's'}. It should pop up in a few seconds.`);
  }
  return (
    <div className="setting">
      <div>
        <p className="setting-name">Test notifications</p>
        <p className="muted small">{state || 'Sends a test to every device you have notifications on.'}</p>
      </div>
      <button type="button" className="btn btn--ghost btn--sm" onClick={run}>Send test</button>
    </div>
  );
}

export default function SettingsPage({ email, isAdmin }) {
  const [profile, setProfile] = useState({ name: '', phone: '', alt_email: '', notify_email: true, notify_push: true });
  const [loaded, setLoaded] = useState(isAdmin);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAdmin) return;
    supabase
      .from('customer_profiles')
      .select('*')
      .ilike('email', email)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile({ name: data.name ?? '', phone: data.phone ?? '', alt_email: data.alt_email ?? '', notify_email: data.notify_email, notify_push: data.notify_push });
        setLoaded(true);
      });
  }, [email, isAdmin]);

  async function save(patch = {}) {
    const next = { ...profile, ...patch };
    setProfile(next);
    setSaved('');
    setError('');
    const { error: saveError } = await supabase.from('customer_profiles').upsert({
      email: email.toLowerCase(),
      name: next.name.trim() || null,
      phone: next.phone.trim() || null,
      alt_email: next.alt_email.trim().toLowerCase() || null,
      notify_email: next.notify_email,
      notify_push: next.notify_push,
      updated_at: new Date().toISOString(),
    });
    if (saveError) setError(errorText(saveError));
    else setSaved('Saved.');
  }

  if (!loaded) return <p className="muted page-pad">Loading</p>;

  return (
    <main className="page page--narrow settings">
      {isAdmin && <Link to="/notifications" className="back-link"><Icon name="back" size={16} /> Notifications</Link>}
      <h1 className="sr-only">Settings</h1>

      <p className="label muted section-gap">Signed in as</p>
      <p>{email}</p>

      {!isAdmin && (
        <>
          <p className="label muted section-gap">Your details</p>
          <form
            className="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label className="field-label" htmlFor="set-name">Name</label>
            <input id="set-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} autoComplete="name" />
            <label className="field-label" htmlFor="set-phone">Phone number</label>
            <input id="set-phone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} autoComplete="tel" />
            <label className="field-label" htmlFor="set-alt">Also send emails to</label>
            <p className="field-help">Optional. Updates go to {email} and this address too.</p>
            <input id="set-alt" type="email" value={profile.alt_email} onChange={(e) => setProfile({ ...profile, alt_email: e.target.value })} autoComplete="email" />
            <button type="submit" className="btn btn--sm">Save details</button>
            {saved && <span className="muted small"> {saved}</span>}
          </form>
        </>
      )}

      <p className="label muted section-gap">Notifications</p>
      <DeviceNotifications email={email} isAdmin={isAdmin} />
      {isAdmin && <TestPush />}
      {!isAdmin && (
        <>
          <div className="setting">
            <div>
              <p className="setting-name">Phone notifications</p>
              <p className="muted small">Turn off to stop notifications on every device.</p>
            </div>
            <button type="button" className={`switch${profile.notify_push ? ' switch--on' : ''}`} role="switch" aria-checked={profile.notify_push} onClick={() => save({ notify_push: !profile.notify_push })}>
              <span />
            </button>
          </div>
          <div className="setting">
            <div>
              <p className="setting-name">Email updates</p>
              <p className="muted small">Proofs, replies, and delivery. Sign-in links are always sent.</p>
            </div>
            <button type="button" className={`switch${profile.notify_email ? ' switch--on' : ''}`} role="switch" aria-checked={profile.notify_email} onClick={() => save({ notify_email: !profile.notify_email })}>
              <span />
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}

      {isAdmin && <StudioSettings />}

      <div className="settings-foot">
        <button type="button" className="btn btn--ghost btn--sm" onClick={signOut}>Sign out</button>
      </div>
    </main>
  );
}
