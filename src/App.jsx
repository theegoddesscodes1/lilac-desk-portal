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

export default function App() {
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) {
      setIsAdmin(null);
      return;
    }
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(Boolean(data)));
  }, [userId]);

  if (session === undefined) return <p className="muted page-pad">Loading</p>;
  if (!session) return <LoginPage />;
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
