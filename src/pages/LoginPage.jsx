import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { errorText } from '../lib/orderApi';
import Icon from '../components/Icons';

// Must match Supabase: Authentication > Providers > Email > "Email OTP Length" (yours is 8)
const CODE_LENGTH = 8;
const RESEND_SECONDS = 30;

// Six boxes on top of one real input, so phones can autofill the code from the email
function CodeInput({ value, onChange, onComplete, disabled }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const digits = value.padEnd(CODE_LENGTH, ' ').slice(0, CODE_LENGTH).split('');
  return (
    <div className="otp" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        className="otp-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Sign-in code"
        maxLength={CODE_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
          onChange(next);
          if (next.length === CODE_LENGTH) onComplete(next);
        }}
      />
      {digits.map((d, i) => (
        <span key={i} className={`otp-box${i === value.length ? ' otp-box--now' : ''}${d.trim() ? ' otp-box--on' : ''}`}>{d.trim()}</span>
      ))}
    </div>
  );
}

export default function LoginPage({ notice = '' }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (!wait) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send(event) {
    event?.preventDefault();
    setBusy(true);
    setError('');
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.href, shouldCreateUser: true },
    });
    setBusy(false);
    if (otpError) setError(errorText(otpError));
    else {
      setSent(true);
      setCode('');
      setWait(RESEND_SECONDS);
    }
  }

  async function verify(token) {
    setBusy(true);
    setError('');
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    });
    setBusy(false);
    if (verifyError) {
      setError('That code didn’t work. Check it, or send a new one.');
      setCode('');
    }
  }

  return (
    <main className="signin">
      <aside className="signin-art" aria-hidden="true">
        <div className="signin-brand">
          <img className="signin-art-logo" src="/logo-light.png" alt="" width="240" height="55" />
          <p className="signin-tag">Your planner, from brief to download</p>
        </div>
        <p className="signin-foot">Custom digital planners · lilacdesk.com</p>
      </aside>

      <section className="signin-panel">
        
        <div className="signin-form">
          {!sent ? (
            <form onSubmit={send}>
              <p className="label ox">Your order page</p>
              <h1 className="signin-title">Welcome back.</h1>
              <p className="signin-lead">Sign in with the email you used at checkout. I’ll send you a code, no password needed.</p>
              {notice && <p className="error">{notice}</p>}
              <label className="signin-field">
                <span>Email</span>
                <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <button type="submit" className="btn btn--block signin-go" disabled={busy || !email.includes('@')}>
                {busy ? 'Sending…' : 'Send my code'}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (code.length === CODE_LENGTH) verify(code); }}>
              <button type="button" className="signin-back" onClick={() => { setSent(false); setError(''); }}>
                <Icon name="back" size={16} /> Change email
              </button>
              <h1 className="signin-title">Check your email.</h1>
              <p className="signin-lead">Enter the {CODE_LENGTH}-digit code sent to <b>{email}</b>, or tap the link in that email.</p>
              <CodeInput value={code} onChange={setCode} onComplete={verify} disabled={busy} />
              <button type="submit" className="btn btn--block signin-go" disabled={busy || code.length < CODE_LENGTH}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <p className="signin-resend">
                {wait > 0 ? (
                  <span className="muted">Send a new code in {wait}s</span>
                ) : (
                  <button type="button" className="link-btn" onClick={() => send()} disabled={busy}>Send a new code</button>
                )}
              </p>
            </form>
          )}
          {error && <p className="error">{error}</p>}
        </div>

        <img className="signin-logo" src="/logo.png" alt="Lilac Desk" width="112" height="26" />
        <p className="signin-help">Trouble signing in? Email <a href="mailto:support@lilacdesk.com">support@lilacdesk.com</a></p>
      </section>
    </main>
  );
}
