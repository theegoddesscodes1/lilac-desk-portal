import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// Several planners bought in one checkout share a Shopify order number.
// Tell them apart on screen: "#1046 · 1 of 2", "#1046 · 2 of 2".
const copyOrder = (a, b) =>
  String(a.shopify_line_item_id ?? '').localeCompare(String(b.shopify_line_item_id ?? ''), undefined, { numeric: true }) ||
  (a.copy_index ?? 0) - (b.copy_index ?? 0) ||
  String(a.id).localeCompare(String(b.id));

export function labelCopies(orders = []) {
  const groups = new Map();
  for (const o of orders) {
    const key = o.shopify_order_id ?? o.shopify_order_name;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  const labels = new Map();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    [...list].sort(copyOrder).forEach((o, i) => labels.set(o.id, `${o.shopify_order_name} · ${i + 1} of ${list.length}`));
  }
  return orders.map((o) => (labels.has(o.id) ? { ...o, shopify_order_number: o.shopify_order_name, shopify_order_name: labels.get(o.id) } : o));
}

async function labelOne(order) {
  if (!order?.shopify_order_id) return order;
  const { data } = await supabase.from('orders').select('id, shopify_order_id, shopify_order_name, shopify_line_item_id, copy_index').eq('shopify_order_id', order.shopify_order_id);
  if (!data || data.length < 2) return order;
  const labelled = labelCopies(data).find((o) => o.id === order.id);
  return labelled ? { ...order, shopify_order_number: order.shopify_order_name, shopify_order_name: labelled.shopify_order_name } : order;
}

const BUCKET = 'order-files';

export const isImage = (file) => /\.(png|jpe?g|gif|webp|heic|avif|svg)$/i.test(file?.name || file?.path || '');
export const isPdf = (file) => /\.pdf$/i.test(file?.name || file?.path || '');
export const canPreview = (file) => isImage(file) || isPdf(file);

export function safeFileName(name) {
  return name.replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').slice(-120);
}

export async function uploadOrderFile(orderId, kind, file, uploadedBy, round = null) {
  const path = `${orderId}/${kind}/${Date.now()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (uploadError) throw uploadError;

  const row = { order_id: orderId, kind, path, name: file.name, size: file.size, uploaded_by: uploadedBy };
  let { data, error } = await supabase.from('files').insert(round ? { ...row, round } : row).select().single();
  // Before the proof-rounds update is run in Supabase, save without the round
  if (error && round && /round/i.test(error.message)) {
    ({ data, error } = await supabase.from('files').insert(row).select().single());
  }
  if (error) throw error;
  return data;
}

export async function openFile(file) {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.path, 3600, { download: file.name });
    if (error) throw error;
    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    alert(`That file couldn't be downloaded: ${errorText(err)}`);
  }
}

export async function notify(orderId, event) {
  try {
    await supabase.functions.invoke('portal-notify', { body: { order_id: orderId, event } });
  } catch (err) {
    console.warn('Notification not sent', err);
  }
}

// Live updates can pause while a phone is locked or the app is in the background.
// This catches up whenever the app comes back, after a reconnect, and every minute as a safety net.
export function keepFresh(reload) {
  let last = 0;
  const run = () => {
    if (Date.now() - last < 2000) return;
    last = Date.now();
    reload();
  };
  const onVisible = () => document.visibilityState === 'visible' && run();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', run);
  window.addEventListener('online', run);
  const timer = setInterval(() => document.visibilityState === 'visible' && run(), 60000);
  const now = () => reload();
  window.addEventListener('portal-refresh', now);
  return () => {
    window.removeEventListener('portal-refresh', now);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', run);
    window.removeEventListener('online', run);
    clearInterval(timer);
  };
}

// After any change made here (send, read, approve, upload), refresh every screen right away
export function refreshAll() {
  window.dispatchEvent(new Event('portal-refresh'));
}

// Proof files grouped into rounds. Files uploaded together share a round number;
// older files without one are grouped when uploaded within 15 minutes of each other.
export function proofRounds(files, messages = []) {
  const proofs = files.filter((f) => f.kind === 'proof').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const rounds = [];
  for (const f of proofs) {
    const last = rounds[rounds.length - 1];
    const gap = last ? new Date(f.created_at) - new Date(last.files[last.files.length - 1].created_at) : Infinity;
    const same = last && (f.round != null ? last.round === f.round : last.legacy && gap < 15 * 60000);
    if (same) {
      last.files.push(f);
    } else {
      const number = f.round ?? (last ? last.number + 1 : 1);
      rounds.push({ round: f.round ?? null, legacy: f.round == null, number, files: [f], at: f.created_at });
    }
  }
  // Mark the round each approval or change request was about
  const verdicts = messages.filter((m) => m.kind === 'approval' || m.kind === 'revision_request');
  for (const r of rounds) {
    const next = rounds[rounds.indexOf(r) + 1];
    const v = verdicts.find((m) => new Date(m.created_at) >= new Date(r.at) && (!next || new Date(m.created_at) < new Date(next.at)));
    if (v) r.verdict = { id: v.id, kind: v.kind, at: v.created_at };
  }
  return rounds.reverse();
}

export function nextRoundNumber(files) {
  const rounds = proofRounds(files);
  return rounds.length ? rounds[0].number + 1 : 1;
}

export async function viewUrl(file) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// Reload once a channel (re)connects, so nothing sent while it was down is missed
export const onConnected = (reload) => (status) => {
  if (status === 'SUBSCRIBED') reload();
};

export function errorText(err) {
  return err?.message?.replace(/^.*?ERROR:\s*/, '') || 'Something went wrong. Try again.';
}

export function formatDate(value, withTime = false) {
  if (!value) return '';
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  if (withTime) Object.assign(options, { hour: 'numeric', minute: '2-digit' });
  return new Date(value).toLocaleString(undefined, options);
}

export function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function daysSince(value) {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
}

// Loads one order with everything attached, and keeps it live
export function useOrderData(orderId) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    order: null,
    files: [],
    messages: [],
    orderAddons: [],
    addons: [],
  });

  const reload = useCallback(async () => {
    const [order, files, messages, orderAddons, addons] = await Promise.all([
      supabase.from('orders').select('*').eq('id', orderId).maybeSingle(),
      supabase.from('files').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
      supabase.from('messages').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
      supabase.from('order_addons').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
      supabase.from('addons').select('*').order('sort', { ascending: true }),
    ]);
    const firstError = [order, files, messages, orderAddons, addons].find((r) => r.error)?.error;
    setState({
      loading: false,
      error: firstError ? errorText(firstError) : !order.data ? 'This order could not be found.' : null,
      order: await labelOne(order.data),
      files: files.data ?? [],
      messages: messages.data ?? [],
      orderAddons: orderAddons.data ?? [],
      addons: addons.data ?? [],
    });
  }, [orderId]);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel(`order-${orderId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files', filter: `order_id=eq.${orderId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_addons', filter: `order_id=eq.${orderId}` }, reload)
      .subscribe(onConnected(reload));
    const stop = keepFresh(reload);
    return () => {
      stop();
      supabase.removeChannel(channel);
    };
  }, [orderId, reload]);

  return { ...state, reload };
}
