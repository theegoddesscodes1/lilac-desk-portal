import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { SHOP_URL } from './portal-config';
import LoginPage from './pages/LoginPage';
import OrdersListPage from './pages/OrdersListPage';
import OrderPage from './pages/OrderPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminOrderPage from './pages/AdminOrderPage';

function Shell({ email, isAdmin, children }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="wordmark">Lilac Desk</Link>
        <nav className="topbar-nav">
          <span className="topbar-who">{isAdmin ? 'Admin' : email}</span>
          {!isAdmin && <a href={SHOP_URL}>Shop</a>}
          <button type="button" className="link-btn" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </nav>
      </header>
      {children}
    </div>
  );
}

// Only allow in-portal paths like /orders/abc after a one-click sign-in
function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(null);
  const [linkChecking, setLinkChecking] = useState(() => window.location.pathname === '/welcome');
  const [linkNotice, setLinkNotice] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // One-click link from the order email: /welcome?token_hash=…&type=…&next=/orders/…
  useEffect(() => {
    if (window.location.pathname !== '/welcome') return;
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type') || 'magiclink';
    const next = safeNext(params.get('next'));
    if (!tokenHash) {
      window.history.replaceState({}, '', next);
      setLinkChecking(false);
      return;
    }
    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(async ({ error }) => {
      if (error) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setLinkNotice('That sign-in link has expired or was already used. Enter your email and I\u2019ll send a new one.');
        }
      }
      window.history.replaceState({}, '', next);
      setLinkChecking(false);
    });
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) {
      setIsAdmin(null);
      return;
    }
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(Boolean(data)));
  }, [userId]);

  if (session === undefined || linkChecking) return <p className="muted page-pad">Opening your order</p>;
  if (!session) return <LoginPage notice={linkNotice} />;
  if (isAdmin === null) return <p className="muted page-pad">Loading</p>;

  const email = session.user.email;

  return (
    <BrowserRouter>
      <Shell email={email} isAdmin={isAdmin}>
        <Routes>
          <Route path="/" element={isAdmin ? <AdminDashboardPage /> : <OrdersListPage email={email} />} />
          <Route path="/orders/:id" element={isAdmin ? <AdminOrderPage /> : <OrderPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
