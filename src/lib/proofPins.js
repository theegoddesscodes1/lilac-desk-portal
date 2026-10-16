import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// Notes a customer pins on a proof. Unsent pins are their draft; sending a change request marks them sent.
export function usePins(orderId) {
  const [pins, setPins] = useState([]);
  const reload = useCallback(async () => {
    if (!orderId) return;
    const { data } = await supabase.from('proof_pins').select('*').eq('order_id', orderId).order('created_at', { ascending: true });
    setPins(data ?? []);
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return undefined;
    reload();
    const channel = supabase
      .channel(`pins-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proof_pins', filter: `order_id=eq.${orderId}` }, reload)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [orderId, reload]);

  const add = async (pin) => {
    const { data, error } = await supabase.from('proof_pins').insert({ order_id: orderId, ...pin }).select().single();
    if (error) throw error;
    setPins((p) => [...p, data]);
    return data;
  };
  const remove = async (id) => {
    setPins((p) => p.filter((x) => x.id !== id));
    await supabase.from('proof_pins').delete().eq('id', id);
  };
  const markSent = async (round) => {
    await supabase.from('proof_pins').update({ sent_at: new Date().toISOString() }).eq('order_id', orderId).eq('round', round).is('sent_at', null);
    reload();
  };
  return { pins, add, remove, markSent, reload };
}

// "Page 4: make this smaller", numbered in the order they were added
export function pinLines(pins, files = []) {
  const multi = new Set(pins.map((p) => p.file_id)).size > 1;
  const nameOf = (id) => files.find((f) => f.id === id)?.name;
  return pins.map((p, i) => `${i + 1}. ${multi && nameOf(p.file_id) ? `${nameOf(p.file_id)}, ` : ''}page ${p.page}: ${p.body.trim()}`);
}
