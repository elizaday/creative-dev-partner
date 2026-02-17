import { jsPDF } from 'jspdf';

function safeFileName(value) {
  return (value || 'concept')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 14) {
  const lines = doc.splitTextToSize(text || '', maxWidth);
  lines.forEach((line, idx) => {
    doc.text(line, x, y + idx * lineHeight);
  });
  return y + lines.length * lineHeight;
}

async function imageToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image fetch failed (${response.status})`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function exportConceptPdf(concept, conceptNumber) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(concept.title || `Final Concept ${conceptNumber}`, margin, y);
  y += 24;

  if (concept.tagline) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(12);
    y = addWrappedText(doc, `"${concept.tagline}"`, margin, y, contentWidth);
    y += 12;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Core Concept', margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  y = addWrappedText(doc, concept.description || '', margin, y, contentWidth, 13);
  y += 14;

  const frames = Array.isArray(concept.storyboardFrames) ? concept.storyboardFrames : [];
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    if (y > pageHeight - 180) {
      doc.addPage();
      y = margin;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Frame ${frame.frameNumber || i + 1} ${frame.timing ? `- ${frame.timing}` : ''}`, margin, y);
    y += 14;

    if (frame.imageUrl) {
      try {
        const imageData = await imageToDataUrl(frame.imageUrl);
        const imageWidth = contentWidth;
        const imageHeight = Math.min(220, (imageWidth * 9) / 16);
        doc.addImage(imageData, 'JPEG', margin, y, imageWidth, imageHeight);
        y += imageHeight + 10;
      } catch (error) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('(Image unavailable in export)', margin, y);
        y += 14;
      }
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y = addWrappedText(doc, `Visual: ${frame.visual || ''}`, margin, y, contentWidth, 12);
    y = addWrappedText(doc, `Action: ${frame.action || ''}`, margin, y + 4, contentWidth, 12);
    y = addWrappedText(doc, `Audio: ${frame.audio || ''}`, margin, y + 4, contentWidth, 12);
    y += 12;
  }

  const fileName = `${conceptNumber || concept.number || 1}-${safeFileName(concept.title)}.pdf`;
  doc.save(fileName);
}
