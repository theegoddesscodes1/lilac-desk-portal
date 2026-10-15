import { supabase } from '../supabaseClient';
import { VAPID_PUBLIC_KEY } from '../portal-config';

function keyBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// iPhone and iPad only allow notifications once the portal is added to the home screen
export function needsHomeScreen() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return ios && !standalone;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('Service worker not registered', err);
    return null;
  }
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// Turns on notifications for this device and saves it to the portal
export async function enablePush(email, isAdmin) {
  if (!pushSupported()) throw new Error('This browser does not support notifications.');
  if (needsHomeScreen()) throw new Error('On iPhone and iPad, add the portal to your home screen first (Share, then Add to Home Screen), then turn notifications on from there.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser settings, then try again.');

  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
  if (!reg) throw new Error('Notifications could not be set up on this device.');
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  }
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').insert({
    email: email.toLowerCase(),
    is_admin: Boolean(isAdmin),
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
  // Already saved for this device is fine
  if (error && !/duplicate|unique/i.test(error.message)) throw error;
  return true;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

// On every launch: if this device already allowed notifications, make sure it's on file
export async function resyncPush(email, isAdmin) {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await enablePush(email, isAdmin);
  } catch {
    /* nothing to do */
  }
}
