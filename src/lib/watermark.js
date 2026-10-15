import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const MARK = 'PROOF   LILAC DESK';
const FOOTER = 'Proof for review only. Final files are delivered without this mark.';

function proofName(name, ext) {
  const base = name.replace(/\.[^.]+$/, '');
  return `${base}-proof.${ext}`;
}

async function watermarkPdf(file) {
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.TimesRoman);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.min(width, height) / 9;
    const textWidth = font.widthOfTextAtSize(MARK, size);
    const angle = Math.atan2(height, width);

    // Center the diagonal mark on the page
    const x = width / 2 - (textWidth / 2) * Math.cos(angle) + (size / 3) * Math.sin(angle);
    const y = height / 2 - (textWidth / 2) * Math.sin(angle) - (size / 3) * Math.cos(angle);
    page.drawText(MARK, {
      x,
      y,
      size,
      font,
      color: rgb(0.36, 0.09, 0.12),
      opacity: 0.16,
      rotate: degrees((angle * 180) / Math.PI),
    });

    const footerSize = Math.max(5, Math.min(8, width / 80));
    page.drawText(FOOTER, { x: 12, y: 8, size: footerSize, font, color: rgb(0.2, 0.2, 0.2), opacity: 0.55 });
  }

  const bytes = await pdf.save();
  return new File([bytes], proofName(file.name, 'pdf'), { type: 'application/pdf' });
}

async function watermarkImage(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  const size = Math.min(canvas.width, canvas.height) / 9;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.atan2(canvas.height, canvas.width));
  ctx.font = `${size}px "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(92, 24, 30, 0.18)';
  ctx.fillText(MARK, 0, 0);
  ctx.restore();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new File([blob], proofName(file.name, 'png'), { type: 'image/png' });
}

// Returns { file, watermarked }. Unsupported types are returned unchanged.
export async function watermarkProof(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return { file: await watermarkPdf(file), watermarked: true };
  }
  if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
    return { file: await watermarkImage(file), watermarked: true };
  }
  return { file, watermarked: false };
}
