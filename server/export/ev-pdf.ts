import PDFDocument from 'pdfkit';
import { sanitize } from './pdf.ts';

const C = {
  band: '#1e3a8a',
  bandText: '#ffffff',
  bandMuted: '#c7d2fe',
  accent: '#1e3a8a',
  text: '#1f2937',
  muted: '#6b7280',
  rule: '#e5e7eb',
  chip: '#eef2ff',
};

export interface EVPdfInput {
  title: string;
  kindLabel: string;
  summary: string | null;
  content: string;
  company: string | null;
  author: { name: string; headline: string; email: string; linkedin: string; phone: string };
}

/** Escreve uma linha com trechos **negrito** alternando a fonte. */
function richLine(doc: PDFKit.PDFDocument, text: string, x: number, width: number, opts: { size: number; color: string; indent?: number }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  doc.fontSize(opts.size).fillColor(opts.color);
  parts.forEach((part, i) => {
    const bold = part.startsWith('**') && part.endsWith('**');
    const text = sanitize(bold ? part.slice(2, -2) : part);
    const continued = i < parts.length - 1;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    // Só o primeiro trecho define posição e largura; os seguintes continuam na mesma linha.
    if (i === 0) doc.text(text, x, doc.y, { width, continued, lineGap: 1.6 });
    else doc.text(text, { continued });
  });
}

export function evToPdf(input: EVPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 40, left: 48, right: 48 }, bufferPages: true, info: { Title: input.title } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const pageBottom = () => doc.page.height - doc.page.margins.bottom - 36;
  const ensure = (h: number) => {
    if (doc.y + h > pageBottom()) {
      doc.addPage({ margins: { top: 48, bottom: 40, left: 48, right: 48 } });
    }
  };

  // Faixa de cabeçalho
  const bandH = 128;
  doc.rect(0, 0, doc.page.width, bandH).fill(C.band);
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(C.bandMuted)
    .text(sanitize(input.kindLabel.toUpperCase()), left, 30, { width, characterSpacing: 1.4 });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(C.bandText).text(sanitize(input.title), left, 46, { width, lineGap: 1 });
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const forLine = [input.company ? `Preparado para ${input.company}` : '', `por ${input.author.name || 'candidato'}`, dateStr].filter(Boolean).join('  ·  ');
  doc.font('Helvetica').fontSize(9.5).fillColor(C.bandMuted).text(sanitize(forLine), left, Math.max(doc.y + 6, bandH - 30), { width });

  doc.y = bandH + 22;

  // Resumo em destaque
  if (input.summary?.trim()) {
    const boxY = doc.y;
    doc.font('Helvetica-Oblique').fontSize(10.5);
    const h = doc.heightOfString(sanitize(input.summary), { width: width - 28, lineGap: 2 }) + 20;
    doc.rect(left, boxY, width, h).fill(C.chip);
    doc.rect(left, boxY, 3, h).fill(C.accent);
    doc.fillColor(C.text).text(sanitize(input.summary), left + 16, boxY + 10, { width: width - 28, lineGap: 2 });
    doc.y = boxY + h + 16;
  }

  // Corpo em Markdown simples
  for (const raw of input.content.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      doc.moveDown(0.35);
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      ensure(40);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(C.accent).text(sanitize(line.replace(/^#{1,3}\s+/, '').replace(/\*\*/g, '')), left, doc.y, { width });
      const y = doc.y + 2;
      doc.moveTo(left, y).lineTo(left + 40, y).lineWidth(1.5).strokeColor(C.accent).stroke();
      doc.y = y + 7;
      continue;
    }
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      ensure(16);
      const y = doc.y;
      doc.circle(left + 5, y + 4.6, 1.8).fill(C.accent);
      doc.y = y;
      richLine(doc, bullet[1], left + 16, width - 16, { size: 10, color: C.text });
      doc.moveDown(0.25);
      continue;
    }
    ensure(16);
    richLine(doc, line, left, width, { size: 10, color: C.text });
    doc.moveDown(0.3);
  }

  // Rodapé com contato em todas as páginas
  const footer = [input.author.name, input.author.headline, input.author.email, input.author.phone, input.author.linkedin].filter((s) => s?.trim()).join('   |   ');
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Zera a margem inferior para escrever no rodapé sem disparar uma nova página.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 34;
    doc.moveTo(left, y - 8).lineTo(left + width, y - 8).lineWidth(0.6).strokeColor(C.rule).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(sanitize(footer), left, y, { width, align: 'center', lineBreak: false });
  }

  doc.end();
  return done;
}
