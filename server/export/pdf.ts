import PDFDocument from 'pdfkit';
import type { ResumeData } from '../../shared/types.ts';
import { SECTION_LABELS, bullets, contactLine, period } from '../resume-utils.ts';

// As fontes padrão do PDF (Helvetica) usam WinAnsi: cobre acentos do português,
// mas não emojis/setas. Caracteres fora do conjunto são trocados por equivalentes.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const REPLACEMENTS: Record<string, string> = { '→': '->', '←': '<-', '✓': '-', '★': '*', '·': '·', '​': '' };

export function sanitize(text: string) {
  return Array.from(text)
    .map((ch) => {
      if (REPLACEMENTS[ch] !== undefined) return REPLACEMENTS[ch];
      const code = ch.codePointAt(0)!;
      if (code <= 0xff || WIN_ANSI_EXTRA.has(ch)) return ch;
      return '';
    })
    .join('');
}

const COLORS = { text: '#1f2937', muted: '#4b5563', accent: '#1e3a8a', rule: '#cbd5e1' };

export function resumeToPdf(r: ResumeData): Promise<Buffer> {
  const L = SECTION_LABELS[r.lang];
  const doc = new PDFDocument({ size: 'A4', margins: { top: 46, bottom: 46, left: 50, right: 50 }, info: { Title: r.personal.name } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const t = (s: string) => sanitize(s ?? '');

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
  };

  const section = (title: string) => {
    ensureSpace(48);
    doc.moveDown(0.7);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.accent).text(t(title.toUpperCase()), left, doc.y, { characterSpacing: 0.6 });
    const y = doc.y + 2;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.7).strokeColor(COLORS.rule).stroke();
    doc.y = y + 6;
  };

  const entryHeader = (leftText: string, rightText: string, sub?: string) => {
    ensureSpace(40);
    const y = doc.y;
    const rightW = 140;
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.text).text(t(leftText), left, y, { width: width - rightW - 8 });
    const afterLeft = doc.y;
    if (rightText) doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.muted).text(t(rightText), left + width - rightW, y + 1, { width: rightW, align: 'right' });
    doc.y = Math.max(afterLeft, doc.y);
    if (sub) doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(COLORS.muted).text(t(sub), left, doc.y, { width });
    doc.moveDown(0.2);
  };

  const bulletList = (text: string) => {
    for (const b of bullets(text)) {
      ensureSpace(14);
      const y = doc.y;
      doc.font('Helvetica').fontSize(9.8).fillColor(COLORS.text);
      doc.text('•', left + 4, y);
      doc.text(t(b), left + 16, y, { width: width - 16, lineGap: 1.2 });
      doc.moveDown(0.15);
    }
  };

  const paragraph = (text: string) => {
    doc.font('Helvetica').fontSize(9.8).fillColor(COLORS.text).text(t(text), left, doc.y, { width, lineGap: 1.5, align: 'justify' });
  };

  // Cabeçalho
  const p = r.personal;
  doc.font('Helvetica-Bold').fontSize(21).fillColor(COLORS.text).text(t(p.name || 'Seu nome'), left, doc.y, { width });
  if (p.headline) doc.font('Helvetica').fontSize(11.5).fillColor(COLORS.accent).text(t(p.headline), { width });
  const contacts = contactLine(p);
  if (contacts.length) {
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(t(contacts.join('   |   ')), { width });
  }

  if (r.summary.trim()) {
    section(L.summary);
    paragraph(r.summary);
  }

  if (r.experiences.length) {
    section(L.experiences);
    r.experiences.forEach((e, i) => {
      if (i > 0) doc.moveDown(0.5);
      entryHeader([e.role, e.company].filter(Boolean).join(' — '), period(e.start, e.end, e.current, r.lang), e.location || undefined);
      bulletList(e.description);
    });
  }

  if (r.projects.length) {
    section(L.projects);
    r.projects.forEach((x, i) => {
      if (i > 0) doc.moveDown(0.4);
      entryHeader(x.name, '', x.link || undefined);
      bulletList(x.description);
    });
  }

  if (r.skills.length) {
    section(L.skills);
    for (const s of r.skills) {
      ensureSpace(14);
      doc.font('Helvetica-Bold').fontSize(9.8).fillColor(COLORS.text).text(t(s.category ? `${s.category}: ` : ''), left, doc.y, { continued: true, width });
      doc.font('Helvetica').text(t(s.items));
      doc.moveDown(0.15);
    }
  }

  if (r.education.length) {
    section(L.education);
    r.education.forEach((e, i) => {
      if (i > 0) doc.moveDown(0.4);
      entryHeader([e.degree, e.institution].filter(Boolean).join(' — '), period(e.start, e.end, false, r.lang));
      if (e.description.trim()) bulletList(e.description);
    });
  }

  if (r.certifications.length) {
    section(L.certifications);
    for (const c of r.certifications) {
      ensureSpace(14);
      doc.font('Helvetica').fontSize(9.8).fillColor(COLORS.text).text(t(['• ' + c.name, c.issuer, c.year].filter(Boolean).join(' — ')), left, doc.y, { width });
    }
  }

  if (r.languages.length) {
    section(L.languages);
    doc.font('Helvetica').fontSize(9.8).fillColor(COLORS.text).text(t(r.languages.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join('   •   ')), left, doc.y, { width });
  }

  doc.end();
  return done;
}
