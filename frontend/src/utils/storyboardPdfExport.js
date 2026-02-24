import { jsPDF } from 'jspdf';

function safeProjectName(value) {
  return (value || 'Project')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'Project';
}

function toDisplayProjectName(value) {
  const text = String(value || '').trim();
  return text || 'Project';
}

function clampText(value, max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
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
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      width: img.width,
      height: img.height
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawFramePlaceholder(doc, x, y, width, height, label = 'Visual Placeholder') {
  doc.setDrawColor(76, 87, 111);
  doc.setLineWidth(1);
  doc.roundedRect(x, y, width, height, 8, 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(122, 133, 154);
  doc.text(label, x + width / 2, y + height / 2, { align: 'center', baseline: 'middle' });
}

async function drawFrameImage(doc, imageUrl, x, y, width, height) {
  try {
    const imageData = await imageToDataUrl(imageUrl);
    const scale = Math.min(width / imageData.width, height / imageData.height);
    const drawWidth = imageData.width * scale;
    const drawHeight = imageData.height * scale;
    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;

    doc.setFillColor(10, 14, 24);
    doc.roundedRect(x, y, width, height, 8, 8, 'F');
    doc.addImage(imageData.dataUrl, 'JPEG', drawX, drawY, drawWidth, drawHeight);
  } catch (_error) {
    drawFramePlaceholder(doc, x, y, width, height, 'Image unavailable');
  }
}

function addCoverPage(doc, storyboard, projectName) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 52;

  doc.setFillColor(12, 17, 28);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');

  doc.setTextColor(110, 195, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('STORYBOARD', margin, 90);

  doc.setTextColor(240, 245, 255);
  doc.setFontSize(34);
  doc.text(`${projectName}`, margin, 142);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(15);
  doc.setTextColor(188, 201, 224);
  addWrappedText(doc, storyboard.title || 'Director Storyboard', margin, 180, pageWidth - margin * 2, 20);

  doc.setFontSize(12);
  doc.setTextColor(150, 170, 198);
  addWrappedText(doc, storyboard.summary || '', margin, 226, pageWidth - margin * 2, 16);

  doc.setTextColor(204, 219, 240);
  doc.text(`Tone: ${storyboard.tone || 'Cinematic and contrast-forward'}`, margin, 292);
}

function addBeatOverviewPage(doc, storyboard) {
  doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 52;
  let y = margin;

  doc.setFillColor(247, 250, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(18, 25, 38);
  doc.text('Beat Overview', margin, y);
  y += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(68, 82, 104);
  y = addWrappedText(doc, 'Five-beat maximum structure built for visual transformation and contrast progression.', margin, y, pageWidth - margin * 2, 16);
  y += 18;

  const frames = Array.isArray(storyboard.frames) ? storyboard.frames : [];

  frames.forEach((frame) => {
    if (y > pageHeight - 110) {
      doc.addPage();
      y = margin;
    }

    doc.setDrawColor(220, 228, 240);
    doc.roundedRect(margin, y - 14, pageWidth - margin * 2, 78, 6, 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(22, 35, 54);
    doc.text(`Frame ${frame.frameNumber}  ${frame.timing || ''}`, margin + 12, y + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(53, 70, 95);
    y = addWrappedText(doc, `Beat: ${clampText(frame.beat, 140)}`, margin + 12, y + 20, pageWidth - margin * 2 - 24, 14);
    y = addWrappedText(doc, `Intention: ${clampText(frame.whyThisExists || frame.purpose, 180)}`, margin + 12, y + 2, pageWidth - margin * 2 - 24, 14);
    y += 20;
  });
}

async function addFramePages(doc, storyboard) {
  const frames = Array.isArray(storyboard.frames) ? storyboard.frames : [];

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    doc.addPage();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 46;

    const imageWidth = pageWidth - margin * 2;
    const imageHeight = imageWidth * 9 / 16;
    const imageY = 108;

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(16, 24, 36);
    doc.text(`Frame ${frame.frameNumber}  ${frame.timing || ''}`, margin, 56);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(64, 78, 99);
    addWrappedText(doc, clampText(frame.beat, 120), margin, 78, pageWidth - margin * 2, 14);

    if (frame.imageUrl) {
      await drawFrameImage(doc, frame.imageUrl, margin, imageY, imageWidth, imageHeight);
    } else {
      drawFramePlaceholder(doc, margin, imageY, imageWidth, imageHeight);
    }

    const textY = imageY + imageHeight + 24;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20, 31, 49);
    doc.text('Intention', margin, textY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(62, 77, 98);
    addWrappedText(
      doc,
      clampText(frame.whyThisExists || frame.purpose, 240),
      margin,
      textY + 16,
      pageWidth - margin * 2,
      14
    );
  }
}

export async function createStoryboardPdfDownload(storyboard) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });

  const projectName = toDisplayProjectName(storyboard?.projectName || storyboard?.title || 'Project');
  const fileName = `${safeProjectName(projectName)}_Storyboard_v1.pdf`;

  addCoverPage(doc, storyboard || {}, projectName);
  addBeatOverviewPage(doc, storyboard || {});
  await addFramePages(doc, storyboard || {});

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);

  return { url, filename: fileName };
}
