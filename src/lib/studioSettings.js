// Kerry's studio settings, stored in one row (studio_settings). Anything not saved yet uses these defaults.
// The portal-daily function keeps its own copy of these defaults: change both together.
export const DEFAULT_SETTINGS = {
  quickReplies: [
    'Got it, working on it now.',
    'Your new proof is up.',
    'Your final files are ready to download.',
  ],
  quoteTemplates: [
    {
      name: 'Dated planner, about 100 pages',
      license: 'personal',
      price: '',
      scope: 'About 100 pages: a dated 2027 calendar (yearly, monthly and weekly), plus up to four sections of your choice. Tabless navigation, made for your app. 3 change rounds. Delivery in about 3 weeks.',
    },
    {
      name: 'Undated planner',
      license: 'personal',
      price: '',
      scope: 'Undated planner you can use any year: monthly and weekly spreads, plus up to four sections of your choice. Tabless navigation. 3 change rounds. Delivery in about 2 weeks.',
    },
    {
      name: 'Commercial bundle',
      license: 'commercial',
      price: '',
      scope: 'A planner you can sell or share with your clients, with your branding throughout. Includes the Keynote source file so you can make your own versions. 3 change rounds. Delivery in about 3 weeks.',
    },
  ],
  reminders: { on: true, briefDays: 3, proofDays: 4, lastCallDays: 25 },
  digest: { on: true, hour: 8 },
  review: { on: true, days: 4, url: '', thanksCode: '', thanksOffer: '10% off your next planner' },
};

export function mergeSettings(saved) {
  const s = saved || {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    reminders: { ...DEFAULT_SETTINGS.reminders, ...(s.reminders || {}) },
    digest: { ...DEFAULT_SETTINGS.digest, ...(s.digest || {}) },
    review: { ...DEFAULT_SETTINGS.review, ...(s.review || {}) },
    quickReplies: Array.isArray(s.quickReplies) ? s.quickReplies : DEFAULT_SETTINGS.quickReplies,
    quoteTemplates: Array.isArray(s.quoteTemplates) ? s.quoteTemplates : DEFAULT_SETTINGS.quoteTemplates,
  };
}
