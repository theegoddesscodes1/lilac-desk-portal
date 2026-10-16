import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ACTIVE_STAGES, DONE_STAGES } from '../portal-config';
import { keepFresh, onConnected } from './orderApi';

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
  const [state, setState] = useState({ loading: true, orders: [], orderAddons: [], messages: [], profiles: [], notes: [], quotes: [], quoteMessages: [] });

  const reload = useCallback(async () => {
    const [orders, orderAddons, messages, profiles, notes, quotes, quoteMessages] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('order_addons').select('*').order('created_at', { ascending: true }),
      supabase.from('messages').select('id, order_id, sender, kind, body, file_id, read_at, created_at').order('created_at', { ascending: true }),
      supabase.from('customer_profiles').select('*'),
      supabase.from('customer_notes').select('*'),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
      supabase.from('quote_messages').select('id, quote_id, sender, kind, body, read_at, created_at').order('created_at', { ascending: true }),
    ]);
    setState({
      loading: false,
      quotes: quotes.data ?? [],
      quoteMessages: quoteMessages.data ?? [],
      orders: orders.data ?? [],
      orderAddons: orderAddons.data ?? [],
      messages: messages.data ?? [],
      profiles: profiles.data ?? [],
      notes: notes.data ?? [],
    });
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
    return {
      ...state,
      reload,
      addonsByOrder,
      messagesByOrder,
      threads,
      quoteThreads,
      quoteMessagesByQuote: qmByQuote,
      openQuotes: state.quotes.filter((q) => q.status === 'open').length,
      totalFor: (o) => orderTotal(o, addonsByOrder[o.id]),
      activeCount: state.orders.filter(isActive).length,
      unreadThreads: threads.filter((t) => t.unread > 0).length + quoteThreads.filter((t) => t.unread > 0).length,
    };
  }, [state, reload]);

  return createElement(AdminContext.Provider, { value }, children);
}

export function useAdmin() {
  return useContext(AdminContext);
}

// ---------- customer data (their orders, for nav badges and home) ----------

const CustomerContext = createContext(null);

export function CustomerDataProvider({ email, children }) {
  const [state, setState] = useState({ loading: true, orders: [], messages: [], profile: null, quotes: [], quoteMessages: [] });

  const reload = useCallback(async () => {
    const [orders, messages, profile, quotes, quoteMessages] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('messages').select('id, order_id, sender, read_at, created_at').order('created_at', { ascending: true }),
      supabase.from('customer_profiles').select('*').ilike('email', email).maybeSingle(),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
      supabase.from('quote_messages').select('id, quote_id, sender, read_at, created_at').order('created_at', { ascending: true }),
    ]);
    setState({
      loading: false,
      orders: orders.data ?? [],
      messages: messages.data ?? [],
      profile: profile.data ?? null,
      quotes: quotes.data ?? [],
      quoteMessages: quoteMessages.data ?? [],
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
    return { ...state, email, reload, current, unreadFor, unreadQuote, openQuote };
  }, [state, email, reload]);

  return createElement(CustomerContext.Provider, { value }, children);
}

export function useCustomer() {
  return useContext(CustomerContext);
}
