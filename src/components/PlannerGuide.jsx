import { Link } from 'react-router-dom';

// "How to use your planner": picked from what they chose in their brief (app, device, tabs, stickers).
// Matches the downloadable guide in public/how-to-use-your-planner.pdf.
export const GUIDE_PDF = '/how-to-use-your-planner.pdf';

const APPS = {
  GoodNotes: {
    open: [
      'Tap Download on your planner, then tap the share icon and choose GoodNotes (it may say “Open in GoodNotes” or “Copy to GoodNotes”). Choose Import as New Document.',
      'Or, in GoodNotes, tap + New, choose Import, and pick the PDF from your Files or Downloads.',
      'On a Mac, drag the PDF into your GoodNotes library, or use File, then Import.',
    ],
    links: [
      'Turn on Read-only mode (the pen with a line through it, in the toolbar) and tap any link. Turn it off again to write.',
      'Or touch and hold a link, then choose Open Link.',
    ],
    stickers: {
      GoodNotes: 'Import the sticker file like your planner. Use the lasso to circle a sticker, copy it, then paste it onto any page.',
      PNG: 'Add them with the image tool, or save them into the Elements tool as your own collection so they’re one tap away.',
    },
    copy: 'Duplicate the notebook from its menu in your library before you start writing. That’s your clean copy.',
  },
  Notability: {
    open: [
      'Tap Download on your planner, then tap the share icon and choose Notability. Pick a subject and it opens as a new note.',
      'Or, in your Notability library, tap Import and pick the PDF from your Files or Downloads.',
    ],
    links: [
      'Switch from the pen to the lasso or select tool, then tap the link.',
      'Or tap with your finger. If a finger tap leaves a mark, turn on Notability’s setting that lets only your stylus write, then tap again.',
    ],
    stickers: {
      PNG: 'Tap the + (media) button, choose a photo or file, then pick your sticker. Drag the corners to resize and move it anywhere.',
    },
    copy: 'Duplicate the note from its menu in your library before you start writing. That’s your clean copy.',
  },
  'Samsung Notes': {
    open: [
      'Tap Download on your planner, then open My Files and go to Downloads.',
      'Tap the PDF and choose Samsung Notes. Or, in Samsung Notes, use the option to import a PDF and pick it from Downloads.',
    ],
    links: [
      'Switch to Read mode (the book icon at the top of the note), then tap a link.',
      'Switch back to editing when you’re ready to write. If links don’t respond, update Samsung Notes from the Galaxy Store.',
    ],
    stickers: {
      PNG: 'Save them to your Gallery. On a page, use the insert option to add an image, then pick your sticker. Resize and move it like any picture.',
    },
    copy: 'Keep the downloaded PDF in My Files or Google Drive as your clean copy, and turn on Samsung Cloud sync in the app’s settings.',
  },
  Noteshelf: {
    open: ['Open Noteshelf, tap + and choose Import.', 'Pick the PDF you downloaded from your Files or Downloads. It opens as a notebook ready to write in.'],
  },
  Xodo: {
    open: ['Download your planner, then open Xodo and tap the open (+) button.', 'Pick the PDF from your Downloads. It opens ready to write on.'],
  },
};
const GENERAL = {
  open: [
    'Download your planner, then open it in your note-taking app using its Import or Open option.',
    'Any app that writes on PDFs and supports links will work.',
  ],
  links: ['Links only respond when you’re not writing. Switch to your app’s read, view or select mode, or tap with your finger instead of your pen.'],
  stickers: {},
  copy: 'Keep the downloaded PDF somewhere safe, like cloud storage, before you start writing. That’s your clean copy.',
};
const STICKER_FALLBACK = {
  GoodNotes: 'Open the sticker file in GoodNotes, then use the lasso tool to copy a sticker and paste it onto any page.',
  PNG: 'Save them to your Photos or Files, then add them to a page with your app’s image tool. Resize and move them like any picture.',
};

function Section({ title, children, open = false }) {
  return (
    <details className="guide-sec" open={open}>
      <summary>{title}</summary>
      <div className="guide-body">{children}</div>
    </details>
  );
}

export default function PlannerGuide({ order, orderAddons = [], finals = [] }) {
  const b = order.brief || {};
  const appName = b.app && APPS[b.app] ? b.app : null;
  const app = { ...GENERAL, ...(appName ? APPS[appName] : {}) };
  const tabless = b.navigation !== 'With tabs';
  const addonKeys = orderAddons.map((a) => a.addon_key);
  const hasStickers = ['premium', 'custom'].includes(order.tier) || addonKeys.includes('sticker_set') || addonKeys.includes('sticker_both');
  const stickerFormats = addonKeys.includes('sticker_both') || b.stickerFormat === 'Both' ? ['GoodNotes', 'PNG'] : b.stickerFormat ? [b.stickerFormat] : ['PNG'];
  const hasSource = order.license === 'commercial' && finals.some((f) => f.kind === 'source');
  const onComputer = b.device === 'Computer';

  return (
    <div className="guide">
      <p className="label muted section-gap">How to use your planner</p>

      <Section title="Before you start" open>
        <ol>
          <li>Download your planner above onto the device you’ll plan on.</li>
          <li>Keep a clean copy of the PDF somewhere safe (iCloud Drive, Google Drive or your computer) before you write on it.</li>
          <li>Open it in your app, then tap a month or a day to check the links jump.</li>
        </ol>
      </Section>

      <Section title={`Open it in ${appName || 'your app'}`}>
        <ol>{app.open.map((t) => <li key={t}>{t}</li>)}</ol>
        {onComputer && <p className="guide-tip">On a computer, open it in your note app or any PDF reader that supports links.</p>}
      </Section>

      <Section title="Tapping links">
        <ul>{app.links.map((t) => <li key={t}>{t}</li>)}</ul>
      </Section>

      <Section title="Getting around">
        {tabless ? (
          <ul>
            <li>Your planner is tabless: tap the month name to open that month, and a date to open that day.</li>
            <li>The small links at the top of each page take you back to your calendar or index.</li>
            <li>Each view links down to the next and back up again: year, month, week, day.</li>
          </ul>
        ) : (
          <ul>
            <li>Tap the tabs along the edge of any page to jump to that month or section.</li>
            <li>The dates on your calendar pages link to their own pages too.</li>
            <li>Each view links down to the next and back up again: year, month, week, day.</li>
          </ul>
        )}
      </Section>

      {hasStickers && (
        <Section title="Using your stickers">
          <ul>
            {stickerFormats.map((f) => (
              <li key={f}><b>{f === 'GoodNotes' ? 'GoodNotes stickers' : 'PNG stickers'}:</b> {app.stickers?.[f] || STICKER_FALLBACK[f]}</li>
            ))}
          </ul>
        </Section>
      )}

      {hasSource && (
        <Section title="Your source file (commercial license)">
          <ul>
            <li>The .key file opens in Keynote on a Mac or iPad, so you can make your own versions.</li>
            <li>When you’re done editing, export it as a PDF (File, then Export To, then PDF) to keep the links working.</li>
            <li>Your license lets you sell or share the planners you make. The source file itself is just for you.</li>
          </ul>
        </Section>
      )}

      <Section title="If something isn’t working">
        <ul>
          <li><b>A link won’t jump:</b> you’re probably in a writing tool. See Tapping links above.</li>
          <li><b>A link goes to the wrong page:</b> that’s on me. Message me and I’ll fix it free within your fix window.</li>
          <li><b>New pages have no links:</b> pages you add or duplicate are copies without links. The original pages keep theirs.</li>
          <li><b>Want to start over:</b> {app.copy} You can also download the planner again here any time.</li>
        </ul>
        <p className="guide-tip">Apps change their menus from time to time, so yours might look a little different. If you get stuck, message me and I’ll walk you through it.</p>
      </Section>

      <p className="guide-help">Still stuck? <Link to={`/orders/${order.id}/messages`}><u>Message me</u></Link> and I’ll help.</p>
    </div>
  );
}
