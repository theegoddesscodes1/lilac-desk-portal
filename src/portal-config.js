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
};

export const LICENSES = { personal: 'Personal', commercial: 'Commercial' };

export const plannerLabel = (order) =>
  `${TIERS[order.tier]?.label ?? order.tier} ${LICENSES[order.license]?.toLowerCase() ?? ''} planner`.trim();

// ---------------------------------------------------------------
// Brief questions. Field types: text, textarea, select, radio, checkboxes, files.
// showIf receives { tier, license, values } and hides the field when it returns false.
// ---------------------------------------------------------------

const isDatedTier = ({ tier }) => tier !== 'basic';
const isDated = ({ tier, values }) => tier !== 'basic' && values.dated === 'Dated';
const isCommercial = ({ license }) => license === 'commercial';

export const BRIEF_SECTIONS = [
  {
    title: 'Your brand',
    showIf: isCommercial,
    fields: [
      { name: 'businessName', label: 'Business name', type: 'text', required: true },
      { name: 'productName', label: 'Product name', type: 'text' },
      { name: 'logoFiles', label: 'Logo files', type: 'files', help: 'SVG, or PNG with a transparent background at 2000px wide or more.' },
      { name: 'brandColors', label: 'Brand colors', type: 'text', help: 'Hex codes, like #5C181E.' },
      { name: 'brandFonts', label: 'Brand fonts', type: 'text', help: 'Font names. Fonts must be licensed for commercial use.' },
      { name: 'fontFiles', label: 'Font files', type: 'files', help: '.otf or .ttf, with proof of a commercial license.' },
      { name: 'links', label: 'Website, shop link, or socials to include', type: 'textarea' },
    ],
  },
  {
    title: 'Your buyer',
    showIf: isCommercial,
    fields: [
      { name: 'audience', label: 'Who the planner is for', type: 'textarea', required: true },
      { name: 'whereSold', label: "Where you'll sell or share it", type: 'text', help: 'Etsy, Shopify, your site, or your clients.' },
      { name: 'problem', label: 'The problem it solves for your buyer', type: 'textarea' },
      { name: 'competition', label: 'Planners you see as competition', type: 'textarea' },
      { name: 'personalizedNames', label: 'Names for personalized copies', type: 'textarea', help: 'Only if you bought personalized copies. One name per line. Each copy changes the name on the cover and welcome page only.' },
      { name: 'copyrightLine', label: 'Copyright line for the footer', type: 'text' },
      { name: 'welcomeText', label: 'Your own instructions or welcome page text', type: 'textarea' },
    ],
  },
  {
    title: 'About you',
    fields: [
      { name: 'recipient', label: "Gift? The recipient's name", type: 'text', showIf: ({ license }) => license === 'personal' },
      { name: 'app', label: 'The app you use', type: 'select', required: true, options: ['GoodNotes', 'Notability', 'Noteshelf', 'Samsung Notes', 'Xodo', 'Other'] },
      { name: 'appOther', label: 'Which app?', type: 'text', showIf: ({ values }) => values.app === 'Other' },
      { name: 'device', label: 'Your device', type: 'select', required: true, options: ['iPad', 'Android tablet', 'Computer'] },
      { name: 'orientation', label: 'Orientation', type: 'radio', required: true, options: ['Portrait', 'Landscape'] },
    ],
  },
  {
    title: 'Dates',
    fields: [
      { name: 'dated', label: 'Dated or undated', type: 'radio', required: true, options: ['Dated', 'Undated'], showIf: isDatedTier },
      { name: 'startMonth', label: 'Start month and year', type: 'text', help: 'For example, January 2027.', showIf: isDated, required: true },
      { name: 'weekStart', label: 'Week starts on', type: 'radio', options: ['Sunday', 'Monday'] },
      { name: 'timeFormat', label: 'Time format', type: 'radio', options: ['12-hour', '24-hour'] },
      { name: 'holidays', label: 'Holidays', type: 'radio', options: ['Include holidays', 'No holidays', 'My own list'], showIf: isDated },
      { name: 'holidayList', label: 'Your holiday list', type: 'textarea', showIf: (ctx) => isDated(ctx) && ctx.values.holidays === 'My own list' },
      { name: 'importantDates', label: 'Important dates to fill in', type: 'textarea', help: 'Only with the important dates add-on.', showIf: isDated },
    ],
  },
  {
    title: 'Layouts',
    fields: [
      { name: 'monthly', label: 'Monthly view', type: 'checkboxes', options: ['Grid', 'Vertical list'], showIf: isDatedTier },
      { name: 'weekly', label: 'Weekly view', type: 'checkboxes', options: ['Vertical columns', 'Horizontal rows', 'Hourly schedule'], showIf: isDatedTier },
      { name: 'daily', label: 'Daily view', type: 'checkboxes', options: ['Time-blocked', 'Priorities and to-do', 'Journal page'], showIf: isDatedTier },
      { name: 'tabs', label: 'Tab position', type: 'radio', options: ['Side', 'Top', 'Bottom'] },
    ],
  },
  {
    title: 'Pages',
    fields: [
      { name: 'sections', label: 'Sections, and how many pages of each', type: 'textarea', required: true, help: 'From the section library in the guide, like "Habit tracker, 12 pages".' },
      { name: 'paperStyles', label: 'Paper styles for notes pages', type: 'checkboxes', options: ['Lined', 'Dot grid', 'Grid', 'Blank', 'Cornell notes', 'Checklist'] },
      { name: 'customSection', label: 'Any custom section', type: 'textarea', help: 'Describe it in a sentence or two.' },
      { name: 'stickerFormat', label: 'Sticker format', type: 'radio', options: ['GoodNotes', 'PNG', 'Both (add-on)'], help: 'Premium, or if you bought the sticker set.' },
      { name: 'externalLinks', label: 'External links', type: 'textarea', help: 'Websites, Apple Shortcuts, or calendars. Needs the link pack add-on.' },
    ],
  },
  {
    title: 'Style',
    fields: [
      { name: 'colors', label: 'Colors', type: 'textarea', help: 'A mood, like muted pastels, or hex codes.', showIf: ({ license }) => license === 'personal' },
      { name: 'fonts', label: 'Font style', type: 'text', help: 'Classic serif, clean sans-serif, script accents, or handwritten.' },
      { name: 'feel', label: 'Three words for how it should feel', type: 'text' },
      { name: 'cover', label: 'Cover style and cover text', type: 'textarea' },
      { name: 'inspiration', label: '3 to 5 inspiration images', type: 'files' },
      { name: 'dislikes', label: "Anything you don't want", type: 'textarea' },
      {
        name: 'portfolio',
        label: 'Can I show your planner in my portfolio?',
        type: 'radio',
        required: true,
        options: ['Yes', 'Yes, after my launch date', 'No'],
        showIf: ({ license }) => license === 'commercial',
      },
      { name: 'launchDate', label: 'Your launch date', type: 'text', showIf: ({ license, values }) => license === 'commercial' && values.portfolio === 'Yes, after my launch date' },
      { name: 'portfolioOptOut', label: "I'd rather you didn't show my planner in your portfolio", type: 'checkboxes', options: ['Keep it private'], showIf: ({ license }) => license === 'personal' },
    ],
  },
];

export function visibleSections(ctx) {
  return BRIEF_SECTIONS
    .filter((section) => !section.showIf || section.showIf(ctx))
    .map((section) => ({ ...section, fields: section.fields.filter((f) => !f.showIf || f.showIf(ctx)) }))
    .filter((section) => section.fields.length > 0);
}

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
