import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ACTIVE_STAGES, DONE_STAGES } from '../portal-config';
import { keepFresh, onConnected } from './orderApi';
import { mergeSettings } from './studioSettings';

// ---------- money and dates ----------

export function money(value) {
  const n = Number(value ?? 0);
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Which proof was approved: "Proof 2 approved." in the message, or count the change requests before it
export function approvedProofNumber(messages = [], approval = null) {
  const ap = approval || [...messages].reverse().find((m) => m.kind === 'approval');
  if (!ap) return null;
  const m = /Proof (\d+)/.exec(ap.body || '');
  if (m) return Number(m[1]);
  return messages.filter((x) => x.kind === 'revision_request' && new Date(x.created_at) < new Date(ap.created_at)).length + 1;
}

export function firstName(order) {
  const name = order?.customer_name || order?.customer_email || '';
  return name.includes('@') ? name.split('@')[0] : name.split(' ')[0];
}

export function daysUntil(value) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

export function ago(value) {
  if (!value) return '';
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function shortDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const isActive = (o) => ACTIVE_STAGES.includes(o.stage);
export const isDone = (o) => DONE_STAGES.includes(o.stage);

export function addonsTotal(list = []) {
  return list.reduce((n, a) => n + Number(a.price ?? 0), 0);
}

export function orderTotal(order, list = []) {
  return Number(order.planner_price ?? 0) + addonsTotal(list) - Number(order.refunded_amount ?? 0);
}

function groupBy(rows, key) {
  const out = {};
  for (const r of rows) (out[r[key]] ||= []).push(r);
  return out;
}

// ---------- message threads ----------

export function threadFor(order, messages = []) {
  const real = messages.filter((m) => m.sender !== 'system');
  const last = real[real.length - 1] || messages[messages.length - 1] || null;
  return {
    order,
    last,
    lastAt: last?.created_at ?? order.created_at,
    unread: messages.filter((m) => m.sender === 'customer' && !m.read_at).length,
    needsReply: real.length > 0 && real[real.length - 1].sender === 'customer',
    hasRevision: real.some((m) => m.kind === 'revision_request' && !m.read_at),
  };
}

// ---------- admin data (shared by every admin screen) ----------

const AdminContext = createContext(null);

export function AdminDataProvider({ children }) {
  const [state, setState] = useState({ loading: true, orders: [], orderAddons: [], messages: [], profiles: [], notes: [], quotes: [], quoteMessages: [], contacts: [], contactMessages: [], orderTags: [], archive: [], studio: null });

  const reload = useCallback(async () => {
    const [orders, orderAddons, messages, profiles, notes, quotes, quoteMessages, contacts, contactMessages, orderTags, archive, studio] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('order_addons').select('*').order('created_at', { ascending: true }),
      supabase.from('messages').select('id, order_id, sender, kind, body, file_id, read_at, created_at').order('created_at', { ascending: true }),
      supabase.from('customer_profiles').select('*'),
      supabase.from('customer_notes').select('*'),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
      supabase.from('quote_messages').select('id, quote_id, sender, kind, body, read_at, created_at').order('created_at', { ascending: true }),
      supabase.from('contacts').select('*').order('updated_at', { ascending: false }),
      supabase.from('contact_messages').select('id, contact_id, sender, body, read_at, created_at').order('created_at', { ascending: true }),
      supabase.from('order_tags').select('*'),
      supabase.from('inbox_archive').select('*'),
      supabase.from('studio_settings').select('data').eq('id', 1).maybeSingle(),
    ]);
    setState({
      loading: false,
      orderTags: orderTags.data ?? [],
      archive: archive.data ?? [],
      studio: studio.data?.data ?? null,
      contacts: contacts.data ?? [],
      contactMessages: contactMessages.data ?? [],
      quotes: quotes.data ?? [],
      quoteMessages: quoteMessages.data ?? [],
      orders: orders.data ?? [],
      orderAddons: orderAddons.data ?? [],
      messages: messages.data ?? [],
      profiles: profiles.data ?? [],
      notes: notes.data ?? [],
    });
  }, []);

  // Who's in the portal right now (customers only announce themselves; you never do)
  const [online, setOnline] = useState(() => new Set());
  useEffect(() => {
    const channel = supabase.channel('portal-online');
    const sync = () => {
      const st = channel.presenceState();
      setOnline(new Set(Object.values(st).flat().map((p) => String(p.email || '').toLowerCase()).filter(Boolean)));
    };
    channel.on('presence', { event: 'sync' }, sync).on('presence', { event: 'join' }, sync).on('presence', { event: 'leave' }, sync).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    reload();
    let timer = null;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 300);
    };
    const channel = supabase
      .channel('admin-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_addons' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_messages' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_tags' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_archive' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_settings' }, soon)
      .subscribe(onConnected(soon));
    const stop = keepFresh(reload);
    return () => {
      stop();
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const value = useMemo(() => {
    const addonsByOrder = groupBy(state.orderAddons, 'order_id');
    const messagesByOrder = groupBy(state.messages, 'order_id');
    const threads = state.orders
      .filter((o) => messagesByOrder[o.id]?.some((m) => m.sender !== 'system'))
      .map((o) => threadFor(o, messagesByOrder[o.id]))
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    // Quote conversations (custom planner requests), newest activity first
    const qmByQuote = groupBy(state.quoteMessages, 'quote_id');
    const quoteThreads = state.quotes
      .map((q) => {
        const msgs = qmByQuote[q.id] ?? [];
        const real = msgs.filter((m) => m.sender !== 'system');
        const last = real[real.length - 1] || msgs[msgs.length - 1] || null;
        return {
          quote: q,
          last,
          lastAt: last?.created_at ?? q.created_at,
          unread: msgs.filter((m) => m.sender === 'customer' && !m.read_at).length,
          needsReply: q.status === 'open' && real.length > 0 && real[real.length - 1].sender === 'customer',
        };
      })
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    // Messages from the Contact page
    const cmByContact = groupBy(state.contactMessages, 'contact_id');
    const contactThreads = state.contacts
      .map((c) => {
        const msgs = cmByContact[c.id] ?? [];
        const real = msgs.filter((m) => m.sender !== 'system');
        const last = real[real.length - 1] || msgs[msgs.length - 1] || null;
        return {
          contact: c,
          last,
          lastAt: last?.created_at ?? c.created_at,
          unread: msgs.filter((m) => m.sender === 'customer' && !m.read_at).length,
          needsReply: c.status === 'open' && real.length > 0 && real[real.length - 1].sender === 'customer',
        };
      })
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    const tagsByOrder = Object.fromEntries(state.orderTags.map((t) => [t.order_id, t.tags || []]));

    // ----- one conversation per customer, across all their orders -----
    const archiveByKey = Object.fromEntries(state.archive.map((a) => [a.thread_key, a]));
    const lastCustomerAt = (msgs) => {
      const m = [...msgs].reverse().find((x) => x.sender === 'customer');
      return m ? new Date(m.created_at).getTime() : 0;
    };
    // Your choice wins until the customer writes again; otherwise finished conversations archive on their own
    const archivedState = (key, msgs, autoDone) => {
      const a = archiveByKey[key];
      if (a && new Date(a.set_at).getTime() >= lastCustomerAt(msgs)) return a.state === 'archived';
      return autoDone && !msgs.some((m) => m.sender === 'customer' && !m.read_at);
    };
    const ordersByEmail = {};
    for (const o of state.orders) (ordersByEmail[o.customer_email.toLowerCase()] ||= []).push(o);
    const customerThreads = Object.values(
      threads.reduce((acc, t) => {
        const email = t.order.customer_email.toLowerCase();
        (acc[email] ||= { email, threads: [] }).threads.push(t);
        return acc;
      }, {})
    )
      .map((g) => {
        const all = ordersByEmail[g.email] || [];
        const msgs = g.threads.flatMap((t) => messagesByOrder[t.order.id] || []);
        const latest = g.threads.reduce((a, b) => (new Date(b.lastAt) > new Date(a.lastAt) ? b : a));
        // Orders shown as chips: anything still in progress or with a conversation, the one that needs you first
        const chips = all
          .filter((o) => isActive(o) || messagesByOrder[o.id]?.some((m) => m.sender !== 'system'))
          .map((o) => ({ order: o, thread: g.threads.find((t) => t.order.id === o.id) || threadFor(o, messagesByOrder[o.id] || []) }))
          .sort((a, b) => (b.thread.unread > 0) - (a.thread.unread > 0) || isActive(b.order) - isActive(a.order) || new Date(a.order.due_at || 8e15) - new Date(b.order.due_at || 8e15) || new Date(b.thread.lastAt) - new Date(a.thread.lastAt));
        const key = `cust:${g.email}`;
        const autoDone = all.every((o) => ['complete', 'closed'].includes(o.stage));
        return {
          key,
          type: 'customer',
          email: g.email,
          name: latest.order.customer_name || latest.order.customer_email,
          order: latest.order,
          chips,
          best: chips[0]?.order || latest.order,
          last: latest.last,
          lastAt: latest.lastAt,
          unread: g.threads.reduce((n, t) => n + t.unread, 0),
          needsReply: g.threads.some((t) => t.needsReply && isActive(t.order)) || g.threads.some((t) => t.needsReply && t.unread),
          hasRevision: g.threads.some((t) => t.hasRevision),
          archived: archivedState(key, msgs, autoDone),
        };
      })
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    for (const t of quoteThreads) {
      t.key = `quote:${t.quote.id}`;
      t.archived = archivedState(t.key, qmByQuote[t.quote.id] || [], ['paid', 'closed'].includes(t.quote.status));
    }
    for (const t of contactThreads) {
      t.key = `contact:${t.contact.id}`;
      t.archived = archivedState(t.key, cmByContact[t.contact.id] || [], t.contact.status === 'closed' || Boolean(t.contact.quote_id));
    }
    const conversationFor = (orderId) => customerThreads.find((c) => c.chips.some((x) => x.order.id === orderId));
    const bestOrderFor = (email) => {
      const c = customerThreads.find((x) => x.email === String(email).toLowerCase());
      if (c) return c.best;
      return (ordersByEmail[String(email).toLowerCase()] || []).sort((a, b) => isActive(b) - isActive(a) || new Date(b.created_at) - new Date(a.created_at))[0];
    };
    const setArchived = async (key, archived) => {
      setState((st) => ({ ...st, archive: [...st.archive.filter((a) => a.thread_key !== key), { thread_key: key, state: archived ? 'archived' : 'open', set_at: new Date().toISOString() }] }));
      await supabase.from('inbox_archive').upsert({ thread_key: key, state: archived ? 'archived' : 'open', set_at: new Date().toISOString() });
    };
    const settings = mergeSettings(state.studio);
    const saveSettings = async (patch) => {
      const next = { ...(state.studio || {}), ...patch };
      setState((st) => ({ ...st, studio: next }));
      const { error } = await supabase.from('studio_settings').upsert({ id: 1, data: next, updated_at: new Date().toISOString() });
      if (error) throw error;
    };
    return {
      ...state,
      reload,
      settings,
      saveSettings,
      tagsByOrder,
      customerThreads,
      conversationFor,
      bestOrderFor,
      setArchived,
      isOnline: (email) => online.has(String(email || '').toLowerCase()),
      contactThreads,
      addonsByOrder,
      messagesByOrder,
      threads,
      quoteThreads,
      quoteMessagesByQuote: qmByQuote,
      openQuotes: state.quotes.filter((q) => q.status === 'open').length,
      totalFor: (o) => orderTotal(o, addonsByOrder[o.id]),
      activeCount: state.orders.filter(isActive).length,
      unreadThreads: customerThreads.filter((t) => t.unread > 0).length + quoteThreads.filter((t) => t.unread > 0).length + contactThreads.filter((t) => t.unread > 0).length,
    };
  }, [state, reload, online]);

  return createElement(AdminContext.Provider, { value }, children);
}

export function useAdmin() {
  return useContext(AdminContext);
}

// ---------- customer data (their orders, for nav badges and home) ----------

const CustomerContext = createContext(null);

// Lets Kerry see when a customer has the portal open. Customers never see Kerry's status.
function useAnnouncePresence(email) {
  useEffect(() => {
    if (!email) return undefined;
    const channel = supabase.channel('portal-online', { config: { presence: { key: email.toLowerCase() } } });
    const show = () => (document.visibilityState === 'visible' ? channel.track({ email: email.toLowerCase() }) : channel.untrack());
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') show();
    });
    document.addEventListener('visibilitychange', show);
    return () => {
      document.removeEventListener('visibilitychange', show);
      supabase.removeChannel(channel);
    };
  }, [email]);
}

export function CustomerDataProvider({ email, children }) {
  useAnnouncePresence(email);
  const [state, setState] = useState({ loading: true, orders: [], messages: [], profile: null, quotes: [], quoteMessages: [], contacts: [], contactMessages: [] });

  const reload = useCallback(async () => {
    const [orders, messages, profile, quotes, quoteMessages, contacts, contactMessages] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('messages').select('id, order_id, sender, read_at, created_at').order('created_at', { ascending: true }),
      supabase.from('customer_profiles').select('*').ilike('email', email).maybeSingle(),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
      supabase.from('quote_messages').select('id, quote_id, sender, read_at, created_at').order('created_at', { ascending: true }),
      supabase.from('contacts').select('*').order('updated_at', { ascending: false }),
      supabase.from('contact_messages').select('id, contact_id, sender, read_at, created_at').order('created_at', { ascending: true }),
    ]);
    setState({
      loading: false,
      orders: orders.data ?? [],
      messages: messages.data ?? [],
      profile: profile.data ?? null,
      quotes: quotes.data ?? [],
      quoteMessages: quoteMessages.data ?? [],
      contacts: contacts.data ?? [],
      contactMessages: contactMessages.data ?? [],
    });
  }, [email]);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel('customer-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_messages' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, reload)
      .subscribe(onConnected(reload));
    const stop = keepFresh(reload);
    return () => {
      stop();
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const value = useMemo(() => {
    // The order shown on Home: the newest active one, otherwise the newest overall
    const current = state.orders.find(isActive) || state.orders[0] || null;
    const unreadFor = (orderId) =>
      state.messages.filter((m) => m.order_id === orderId && m.sender === 'admin' && !m.read_at).length;
    const unreadQuote = (quoteId) =>
      state.quoteMessages.filter((m) => m.quote_id === quoteId && m.sender !== 'customer' && !m.read_at).length;
    // A quote still being discussed (not yet paid or closed)
    const openQuote = state.quotes.find((q) => q.status === 'open' || q.status === 'quoted') || null;
    const unreadContact = (contactId) =>
      state.contactMessages.filter((m) => m.contact_id === contactId && m.sender === 'admin' && !m.read_at).length;
    return { ...state, email, reload, current, unreadFor, unreadQuote, openQuote, unreadContact };
  }, [state, email, reload]);

  return createElement(CustomerContext.Provider, { value }, children);
}

export function useCustomer() {
  return useContext(CustomerContext);
}
