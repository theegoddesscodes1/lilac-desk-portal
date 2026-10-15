import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { errorText } from '../lib/orderApi';

export default function LoginPage({ notice = '' }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendLink(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.href, shouldCreateUser: true },
    });
    setBusy(false);
    if (otpError) setError(errorText(otpError));
    else setSent(true);
  }

  async function verifyCode(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (verifyError) setError('That code didn\u2019t work. Check it, or send a new one.');
  }

  return (
    <main className="login">
      <div className="login-card">
        <p className="wordmark">Lilac Desk</p>
        <h1 className="h-page">Your order page</h1>
        {notice && !sent && <p className="error">{notice}</p>}

        {!sent ? (
          <form onSubmit={sendLink}>
            <p className="muted">Enter the email address you ordered with. I'll send you a sign-in link and code.</p>
            <label className="field-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="btn btn--full" disabled={busy}>
              {busy ? 'Sending' : 'Send sign-in link'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <p className="muted">
              Check {email} for your sign-in link. If the link opens in a different browser, enter the code from the email here instead.
            </p>
            <label className="field-label" htmlFor="login-code">Code</label>
            <input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button type="submit" className="btn btn--full" disabled={busy || code.trim().length < 6}>
              {busy ? 'Checking' : 'Sign in'}
            </button>
            <button type="button" className="link-btn" onClick={() => { setSent(false); setCode(''); }}>
              Use a different email
            </button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
