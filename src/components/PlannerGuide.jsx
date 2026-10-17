import { Link } from 'react-router-dom';

// "How to use your planner": picked from what they chose in their brief (app, device, tabs, stickers)
const APP_STEPS = {
  GoodNotes: [
    'Tap Download on your planner, then choose GoodNotes from the share options (it may say “Open in GoodNotes”).',
    'Or open GoodNotes, tap + (New) and choose Import, then pick the PDF from your Files or Downloads.',
    'It opens as a notebook. Write right on the pages.',
  ],
  Notability: [
    'Tap Download on your planner, then choose Notability from the share options.',
    'Or open Notability, tap Import and pick the PDF from your Files.',
    'It opens as a note you can write on, with every page in place.',
  ],
  Noteshelf: [
    'Open Noteshelf, tap + and choose Import (or Import File).',
    'Pick the PDF you downloaded from your Files or Downloads.',
    'It opens as a notebook ready to write in.',
  ],
  'Samsung Notes': [
    'Download your planner, then open My Files and go to Downloads.',
    'Tap the PDF and choose Samsung Notes, or start a new note in Samsung Notes and use its PDF import option.',
    'It opens as a note you can write on with your S Pen.',
  ],
  Xodo: [
    'Download your planner, then open Xodo and tap the open (+) button.',
    'Pick the PDF from your Downloads. It opens ready to write on.',
    'Use the annotate tools to write; the links work when you tap with your finger.',
  ],
};
const GENERAL_STEPS = [
  'Download your planner, then open it in your note-taking app using its Import or Open option.',
  'Any app that writes on PDFs and supports links will work (GoodNotes, Notability, Noteshelf, Samsung Notes, Xodo and more).',
];

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
  const app = b.app && APP_STEPS[b.app] ? b.app : null;
  const tabless = b.navigation !== 'With tabs';
  const addonKeys = orderAddons.map((a) => a.addon_key);
  const hasStickers = ['premium', 'custom'].includes(order.tier) || addonKeys.includes('sticker_set') || addonKeys.includes('sticker_both');
  const stickerFormats = addonKeys.includes('sticker_both') || b.stickerFormat === 'Both' ? ['GoodNotes', 'PNG'] : b.stickerFormat ? [b.stickerFormat] : ['PNG'];
  const hasSource = order.license === 'commercial' && finals.some((f) => f.kind === 'source');
  const onComputer = b.device === 'Computer';

  return (
    <div className="guide">
      <p className="label muted section-gap">How to use your planner</p>

      <Section title={`Open it in ${app || 'your app'}`} open>
        <ol>{(app ? APP_STEPS[app] : GENERAL_STEPS).map((s) => <li key={s}>{s}</li>)}</ol>
        {onComputer && <p className="guide-tip">On a computer, open it in your note app or any PDF reader that supports links.</p>}
        <p className="guide-tip">Menus can look a little different between app versions. If you get stuck, message me and I’ll walk you through it.</p>
      </Section>

      <Section title="Getting around">
        {tabless ? (
          <ul>
            <li>Your planner is tabless: tap any month, week or section name to jump straight there.</li>
            <li>Look for the small links at the top of each page to get back to your calendar or index.</li>
          </ul>
        ) : (
          <ul>
            <li>Tap the tabs along the edge of any page to jump to that section.</li>
            <li>Months and weeks on your calendar pages link to their own pages too.</li>
          </ul>
        )}
        <p className="guide-tip">If a link doesn’t respond, switch from the pen to your finger (or your app’s read or view mode) and tap again. Links can’t be tapped while you’re writing.</p>
      </Section>

      {hasStickers && (
        <Section title="Using your stickers">
          <ul>
            {stickerFormats.includes('GoodNotes') && <li><b>GoodNotes stickers:</b> open the sticker file in GoodNotes, then use the lasso tool to copy a sticker and paste it onto any page.</li>}
            {stickerFormats.includes('PNG') && <li><b>PNG stickers:</b> save them to your Photos or Files, then add them to a page with your app’s image tool. Resize and move them like any picture.</li>}
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

      <Section title="Keep a clean copy">
        <ul>
          <li>Before you start writing, duplicate your planner in your app (or keep the downloaded PDF) so you can always start fresh.</li>
          <li>Your files stay here in your order page, so you can download them again any time.</li>
        </ul>
      </Section>

      <p className="guide-help">Still stuck? <Link to={`/orders/${order.id}/messages`}><u>Message me</u></Link> and I’ll help.</p>
    </div>
  );
}
