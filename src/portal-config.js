export const SHOP_URL = import.meta.env.VITE_SHOP_URL || 'https://lilacdesk.com';
export const DESIGNER_NAME = 'Kerry';
export const FIX_WINDOW_DAYS = 14;
export const NO_RESPONSE_DAYS = 30;

export const STAGES = [
  { key: 'order_placed', label: 'Order placed', note: 'Fill in your brief to start your delivery countdown.' },
  { key: 'brief_received', label: 'Brief received', note: 'Your brief is in. Design starts next.' },
  { key: 'designing', label: 'Designing', note: 'Your planner is being designed.' },
  { key: 'proof_ready', label: 'Proof ready', note: 'Review your proof, then approve it or request changes.' },
  { key: 'revisions', label: 'Revisions', note: 'Your changes are being made.' },
  { key: 'approved', label: 'Approved', note: 'Your final files are being prepared.' },
  { key: 'delivered', label: 'Delivered', note: 'Your planner is ready to download.' },
  { key: 'complete', label: 'Complete', note: 'This order is complete.' },
];

export const CLOSED_STAGE = {
  key: 'closed',
  label: 'Closed',
  note: `This order was closed after ${NO_RESPONSE_DAYS} days without a response. Message me if you'd like to pick it back up.`,
};

export const ALL_STAGES = [...STAGES, CLOSED_STAGE];
export const stageInfo = (key) => ALL_STAGES.find((s) => s.key === key) || STAGES[0];
export const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);

export const COUNTDOWN_STAGES = ['brief_received', 'designing', 'proof_ready', 'revisions', 'approved'];
export const RELEASED_STAGES = ['delivered', 'complete'];
export const LOCKED_STAGES = ['delivered', 'complete', 'closed'];
// Stages where the next move is the customer's (used for the no-response flag)
export const WAITING_ON_CUSTOMER = ['order_placed', 'proof_ready'];

export const TIERS = {
  basic: { label: 'Basic', days: 7, revisions: 2 },
  standard: { label: 'Standard', days: 12, revisions: 3 },
  premium: { label: 'Premium', days: 21, revisions: 4 },
  custom: { label: 'Custom', days: null, revisions: 3 },
};

export const LICENSES = { personal: 'Personal', commercial: 'Commercial' };

export const plannerLabel = (order) =>
  `${TIERS[order.tier]?.label ?? order.tier} ${LICENSES[order.license]?.toLowerCase() ?? ''} planner`.trim();

// ---------------------------------------------------------------
// Brief questions.
// Field types: text, textarea, pills (pick one), multi (pick any), cards (pick one, with a line of detail),
// month, images, files, check.
// showIf receives { tier, license, values, addons } (addons = keys bought on this order).
// extra: true puts the field in the boxed "add-on" area of its section.
// ---------------------------------------------------------------

const isDatedTier = ({ tier }) => tier !== 'basic';
const isDated = ({ tier, values }) => tier !== 'basic' && values.dated === 'Dated';
const isCommercial = ({ license }) => license === 'commercial';
const isPersonal = ({ license }) => license === 'personal';
const has = (key) => ({ addons }) => (addons || []).includes(key);

export const MAX_INSPIRATION = 10;

export const BRIEF_SECTIONS = [
  {
    key: 'brand',
    title: 'Your brand',
    showIf: isCommercial,
    fields: [
      { name: 'businessName', label: 'Business name', type: 'text', required: true },
      { name: 'productName', label: 'Product name', type: 'text', optional: true },
      { name: 'logoFiles', label: 'Logo files', type: 'files', optional: true, help: 'SVG, or PNG with a transparent background at 2000px wide or more.' },
      { name: 'brandColors', label: 'Brand colors', type: 'text', optional: true, placeholder: '#5C181E, #D6D0DE' },
      { name: 'brandFonts', label: 'Brand fonts', type: 'text', optional: true, help: 'Fonts must be licensed for commercial use.' },
      { name: 'fontFiles', label: 'Font files', type: 'files', optional: true, help: '.otf or .ttf, with proof of a commercial license.' },
      { name: 'links', label: 'Website or shop to show in the planner', type: 'text', optional: true, placeholder: 'yourshop.com, @yourhandle' },
    ],
  },
  {
    key: 'buyer',
    title: 'Your buyer',
    showIf: isCommercial,
    fields: [
      { name: 'audience', label: 'Who the planner is for', type: 'textarea', required: true },
      { name: 'whereSold', label: "Where you'll sell or share it", type: 'pills', multi: true, options: ['Etsy', 'Shopify', 'My website', 'My clients', 'Other'], optional: true },
      { name: 'problem', label: 'The problem it solves for your buyer', type: 'textarea', optional: true },
      { name: 'competition', label: 'Planners you see as competition', type: 'textarea', optional: true },
      { name: 'copyrightLine', label: 'Copyright line for the footer', type: 'text', optional: true, placeholder: '© 2027 Your Business' },
      { name: 'welcomeText', label: 'Welcome page or instructions text', type: 'textarea', optional: true },
      { name: 'personalizedNames', label: 'Names for your personalized copies', type: 'textarea', extra: true, showIf: has('personalized_copies'), help: 'One name per line. Each copy changes the name on the cover and welcome page.' },
    ],
  },
  {
    key: 'about',
    title: 'About you',
    fields: [
      { name: 'recipient', label: 'Is it a gift?', type: 'text', optional: true, placeholder: "Recipient's name", showIf: isPersonal },
      { name: 'app', label: 'The app you use', type: 'pills', required: true, options: ['GoodNotes', 'Notability', 'Noteshelf', 'Samsung Notes', 'Xodo', 'Other'] },
      { name: 'appOther', label: 'Which app?', type: 'text', required: true, showIf: ({ values }) => values.app === 'Other' },
      { name: 'device', label: 'Device', type: 'pills', required: true, half: true, options: ['iPad', 'Android tablet', 'Computer'] },
      { name: 'orientation', label: 'Orientation', type: 'pills', required: true, half: true, options: ['Portrait', 'Landscape'] },
    ],
  },
  {
    key: 'dates',
    title: 'Dates',
    fields: [
      { name: 'dated', label: 'Dated or undated', type: 'pills', required: true, half: true, options: ['Dated', 'Undated'], showIf: isDatedTier },
      { name: 'startMonth', label: 'Starts', type: 'month', required: true, half: true, showIf: isDated },
      { name: 'weekStart', label: 'Week starts on', type: 'pills', half: true, options: ['Sunday', 'Monday'] },
      { name: 'timeFormat', label: 'Time format', type: 'pills', half: true, options: ['12-hour', '24-hour'] },
      { name: 'holidays', label: 'Holidays', type: 'pills', options: ['Include holidays', 'None', 'My own list'], showIf: isDated },
      { name: 'holidayList', label: 'Your holiday list', type: 'textarea', showIf: (ctx) => isDated(ctx) && ctx.values.holidays === 'My own list' },
      { name: 'importantDates', label: 'Your important dates', type: 'textarea', extra: true, help: 'Birthdays, anniversaries, deadlines. One per line, like "Mar 14, Mom\'s birthday".', showIf: (ctx) => isDated(ctx) && has('important_dates')(ctx) },
    ],
  },
  {
    key: 'style',
    title: 'Planner style',
    fields: [
      {
        name: 'navigation',
        label: 'Navigation',
        type: 'cards',
        required: true,
        options: [
          { value: 'Tabless', detail: 'Clean pages with links built into the layout. More room to write.', tag: 'My specialty' },
          { value: 'With tabs', detail: 'Classic hyperlinked tabs along the edge of every page.' },
        ],
      },
      { name: 'tabs', label: 'Where should the tabs go?', type: 'pills', required: true, options: ['Side', 'Top', 'Bottom'], showIf: ({ values }) => values.navigation === 'With tabs' },
      { name: 'paperStyles', label: 'Paper for notes pages', hint: 'pick any', type: 'pills', multi: true, options: ['Lined', 'Dot grid', 'Grid', 'Blank', 'Cornell', 'Checklist'] },
      {
        name: 'stickerFormat',
        label: 'Sticker format',
        type: 'pills',
        options: ['GoodNotes', 'PNG'],
        showIf: (ctx) => (['premium', 'custom'].includes(ctx.tier) || has('sticker_set')(ctx)) && !has('sticker_both')(ctx),
      },
      { name: 'customPages', label: 'Pages and sections', type: 'textarea', extra: true, tag: 'Custom', optional: true, help: 'Anything from our quote you want to spell out, or anything you thought of since.', showIf: ({ tier }) => tier === 'custom' },
      { name: 'templates', label: 'Your custom templates', type: 'textarea', extra: true, tag: 'Premium', optional: true, help: 'Premium includes 12–15. List any you already know you want, or leave it to me.', showIf: ({ tier }) => tier === 'premium' },
      { name: 'extraPages', label: 'Your extra pages', type: 'textarea', extra: true, help: 'What should your extra pages be?', placeholder: 'e.g. 5 meal planning pages and 5 budget pages', showIf: has('extra_pages') },
      { name: 'extraTemplate', label: 'Your extra template', type: 'textarea', extra: true, help: 'Describe the template you added.', showIf: has('extra_template') },
      { name: 'externalLinks', label: 'Your links', type: 'textarea', extra: true, help: 'Up to 10 websites or Apple Shortcuts. One per line, with a label.', showIf: has('link_pack') },
      { name: 'calendarApp', label: 'Calendar for your add-to-calendar links', type: 'pills', extra: true, options: ['Google Calendar', 'Apple Calendar'], showIf: has('calendar_links') },
    ],
  },
  {
    key: 'look',
    title: 'Look and feel',
    fields: [
      { name: 'colors', label: 'Colors', type: 'text', placeholder: 'A mood, like muted sage and cream, or hex codes', showIf: isPersonal },
      { name: 'fonts', label: 'Fonts', type: 'pills', options: ['Classic serif', 'Clean sans-serif', 'Script accents', 'Handwritten', 'Surprise me'], showIf: isPersonal },
      { name: 'feel', label: 'Three words for how it should feel', type: 'text', placeholder: 'Calm, airy, organized' },
      { name: 'cover', label: 'Cover text', type: 'text', optional: true, placeholder: 'A name, a title, a quote' },
    ],
  },
  {
    key: 'inspo',
    title: 'Inspiration',
    note: `Planners, Pinterest saves, colors you love. Screenshots are perfect. Up to ${MAX_INSPIRATION}.`,
    fields: [{ name: 'inspiration', label: 'Inspiration images', type: 'images', max: MAX_INSPIRATION, hideLabel: true }],
  },
  {
    key: 'words',
    title: 'In your own words',
    optional: true,
    fields: [
      { name: 'description', label: 'Describe exactly what you want', type: 'textarea', big: true, help: "A layout you have in mind, how you'll use it day to day, anything the questions above didn't cover.", placeholder: "I'd love a weekly spread with a small habit tracker on the side…" },
      { name: 'dislikes', label: "Anything you don't want", type: 'textarea', placeholder: 'e.g. no florals, nothing too bright' },
      { name: 'portfolioOptOut', label: 'Keep my planner private', type: 'check', help: "I won't show it in my portfolio.", showIf: isPersonal },
      { name: 'portfolio', label: 'Can I show your planner in my portfolio?', type: 'pills', required: true, options: ['Yes', 'After my launch', 'No'], showIf: isCommercial },
      { name: 'launchDate', label: 'Your launch date', type: 'text', placeholder: 'e.g. March 2027', showIf: ({ license, values }) => license === 'commercial' && values.portfolio === 'After my launch' },
    ],
  },
];

export function visibleSections(ctx) {
  return BRIEF_SECTIONS
    .filter((section) => !section.showIf || section.showIf(ctx))
    .map((section) => ({ ...section, fields: section.fields.filter((f) => !f.showIf || f.showIf(ctx)) }))
    .filter((section) => section.fields.length > 0);
}

// Labels for answers from the earlier version of the brief, so old briefs still read properly
export const LEGACY_LABELS = {
  monthly: 'Monthly view',
  weekly: 'Weekly view',
  daily: 'Daily view',
  sections: 'Sections',
  customSection: 'Custom section',
  portfolioOptOut: 'Keep private',
};

// ---------------------------------------------------------------
// Version 2
// ---------------------------------------------------------------

// Public key for phone notifications (the private half lives in Supabase secrets)
export const VAPID_PUBLIC_KEY = 'BCKPti5o2S_Ht17FM3BY28OdIUPBqdtXSE9Q_HrD9cwtwpVdjW9mE2OREHHOcmy7D1k8cqtCtpJ4W3uatvBfaG0';

// Where "Leave a review" goes. Leave blank to hide the button.
export const REVIEW_URL = '';

// Add-ons a customer can buy more than once on the same order
export const REPEATABLE_ADDONS = ['extra_pages', 'extra_template', 'extra_revision', 'link_pack', 'colorway', 'personalized_copies'];

export const ACTIVE_STAGES = ['order_placed', 'brief_received', 'designing', 'proof_ready', 'revisions', 'approved'];
export const DONE_STAGES = ['delivered', 'complete'];

// Short status dots used across the portal
export const STAGE_TONE = {
  order_placed: 'grey',
  brief_received: 'dark',
  designing: 'dark',
  proof_ready: 'lilac',
  revisions: 'red',
  approved: 'red',
  delivered: 'grey',
  complete: 'grey',
  closed: 'grey',
};
