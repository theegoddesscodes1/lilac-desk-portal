// Keeps an open portal tab or installed app on the newest version.
// The app stays loaded in memory for days on a phone, so after a deploy it can keep
// running old code (e.g. the 6-box sign-in) until a full reload. This checks for a
// new build whenever the app comes back to the screen and reloads if there is one.
import { supabase } from '../supabaseClient';

const pattern = /\/assets\/index-[\w-]+\.js/;
const running = () => document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src')?.match(pattern)?.[0] || '';

let checking = false;
async function newBuildWaiting() {
  const mine = running();
  if (!mine || checking) return false;
  checking = true;
  try {
    const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' });
    const latest = (await res.text()).match(pattern)?.[0];
    return Boolean(latest && latest !== mine);
  } catch {
    return false;
  } finally {
    checking = false;
  }
}

const typing = () => {
  const el = document.activeElement;
  return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) && el.value;
};

export function watchForUpdates() {
  const check = async () => {
    if (document.visibilityState === 'visible' && !typing() && (await newBuildWaiting())) window.location.reload();
  };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  setInterval(check, 15 * 60 * 1000);
  check();
}

// Sign out and start fresh, so the sign-in page is always the newest one
export async function signOut() {
  await supabase.auth.signOut();
  window.location.replace('/');
}
