import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const BUCKET = 'order-files';

export function safeFileName(name) {
  return name.replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').slice(-120);
}

export async function uploadOrderFile(orderId, kind, file, uploadedBy) {
  const path = `${orderId}/${kind}/${Date.now()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('files')
    .insert({ order_id: orderId, kind, path, name: file.name, size: file.size, uploaded_by: uploadedBy })
    .select()
    .single();
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
      order: order.data,
      files: files.data ?? [],
      messages: messages.data ?? [],
      orderAddons: orderAddons.data ?? [],
      addons: addons.data ?? [],
    });
  }, [orderId]);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files', filter: `order_id=eq.${orderId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_addons', filter: `order_id=eq.${orderId}` }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, reload]);

  return { ...state, reload };
}
