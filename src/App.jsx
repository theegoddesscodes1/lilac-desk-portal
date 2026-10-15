import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useMatch } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { SHOP_URL } from './portal-config';
import { registerServiceWorker } from './lib/push';
import { AdminDataProvider, CustomerDataProvider, useAdmin, useCustomer } from './lib/portalData';
import Shell from './components/Shell';
import Icon from './components/Icons';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import AdminHome from './pages/admin/AdminHome';
import AdminOrders from './pages/admin/AdminOrders';
import AdminOrder from './pages/admin/AdminOrder';
import AdminMessages from './pages/admin/AdminMessages';
import AdminIncome from './pages/admin/AdminIncome';
import AdminNotifications, { buildFeed, useSeenAt } from './pages/admin/AdminNotifications';
import { AdminCustomer, AdminCustomerList } from './pages/admin/AdminCustomers';
import { CustomerBrief, CustomerFiles, CustomerHome, CustomerMessages, CustomerProofs, CustomerRoot } from './pages/customer/CustomerPages';

function AdminApp({ email }) {
  const data = useAdmin();
  const { activeCount, unreadThreads } = data;
  const [seenAt, markSeen] = useSeenAt();
  const newCount = useMemo(() => (data.loading ? 0 : buildFeed(data).filter((i) => new Date(i.at).getTime() > seenAt).length), [data, seenAt]);
  const bell = (
    <Link to="/notifications" className="ptop-icon bell" aria-label={newCount ? `Notifications, ${newCount} new` : 'Notifications'}>
      <Icon name="bell" />
      {newCount > 0 && <span className="badge">{newCount > 9 ? '9+' : newCount}</span>}
    </Link>
  );
  const items = [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/orders', label: 'Orders', icon: 'list', badge: activeCount, tone: 'grey' },
    { to: '/messages', label: 'Messages', icon: 'chat', badge: unreadThreads },
    { to: '/income', label: 'Income', icon: 'income' },
    { to: '/customers', label: 'Customers', icon: 'users' },
  ];
  return (
    <Shell
      items={items}
      sub="Studio"
      topRight={bell}
      sideTop={bell}
      footer={
        <>
          <p>{email}</p>
          <p><Link to="/settings"><u>Settings</u></Link> · <button type="button" className="link-btn" onClick={() => supabase.auth.signOut()}>Sign out</button></p>
        </>
      }
    >
      <Routes>
        <Route path="/" element={<AdminHome />} />
        <Route path="/orders" element={<AdminOrders />} />
        <Route path="/orders/:id" element={<AdminOrder />} />
        <Route path="/messages" element={<AdminMessages />} />
        <Route path="/messages/:id" element={<AdminMessages />} />
        <Route path="/income" element={<AdminIncome />} />
        <Route path="/customers" element={<AdminCustomerList />} />
        <Route path="/customers/:email" element={<AdminCustomer />} />
        <Route path="/notifications" element={<AdminNotifications seenAt={seenAt} onSeen={markSeen} />} />
        <Route path="/settings" element={<SettingsPage email={email} isAdmin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

function CustomerApp({ email }) {
  const { current, orders, unreadFor } = useCustomer();
  const match = useMatch('/orders/:id/*');
  const order = orders.find((o) => o.id === match?.params.id) || current;
  const base = order ? `/orders/${order.id}` : '/';
  const items = [
    { to: base, label: 'Home', icon: 'home', end: true },
    { to: `${base}/proofs`, label: 'Proofs', icon: 'proof', badge: order?.stage === 'proof_ready' ? 1 : 0 },
    { to: `${base}/messages`, label: 'Messages', icon: 'chat', badge: order ? unreadFor(order.id) : 0 },
    { to: `${base}/files`, label: 'Files', icon: 'files', dot: ['delivered'].includes(order?.stage) },
  ];
  return (
    <Shell
      items={items}
      sub="Your order"
      topRight={<Link to="/settings" className="avatar avatar--sm" aria-label="Settings">{email.charAt(0).toUpperCase()}</Link>}
      footer={
        <>
          <p>{email}</p>
          <p><Link to="/settings"><u>Settings</u></Link> · <a href={SHOP_URL}><u>Shop</u></a> · <button type="button" className="link-btn" onClick={() => supabase.auth.signOut()}>Sign out</button></p>
        </>
      }
    >
      <Routes>
        <Route path="/" element={<CustomerRoot />} />
        <Route path="/orders/:id" element={<CustomerHome />} />
        <Route path="/orders/:id/brief" element={<CustomerBrief />} />
        <Route path="/orders/:id/proofs" element={<CustomerProofs />} />
        <Route path="/orders/:id/messages" element={<CustomerMessages />} />
        <Route path="/orders/:id/files" element={<CustomerFiles />} />
        <Route path="/settings" element={<SettingsPage email={email} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
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
    registerServiceWorker();
  }, []);

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
      {isAdmin ? (
        <AdminDataProvider>
          <AdminApp email={email} />
        </AdminDataProvider>
      ) : (
        <CustomerDataProvider email={email}>
          <CustomerApp email={email} />
        </CustomerDataProvider>
      )}
    </BrowserRouter>
  );
}
