import { AlignmentType, BorderStyle, Document, LevelFormat, Packer, Paragraph, TabStopType, TextRun } from 'docx';
import type { ResumeData } from '../../shared/types.ts';
import { SECTION_LABELS, bullets, contactLine, period } from '../resume-utils.ts';

const FONT = 'Calibri';
const ACCENT = '1E3A8A';
const MUTED = '4B5563';
// Largura útil de uma página A4 com margens de 0,8" (em twips), usada para alinhar datas à direita.
const RIGHT_TAB = 11906 - 2 * 1152;

function heading(text: string) {
  return new Paragraph({
    spacing: { before: 240, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1', space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: ACCENT, size: 21, font: FONT, characterSpacing: 12 })],
  });
}

function entry(leftText: string, rightText: string, sub?: string) {
  const out = [
    new Paragraph({
      spacing: { before: 120, after: 20 },
      tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
      keepNext: true,
      children: [
        new TextRun({ text: leftText, bold: true, size: 21, font: FONT }),
        ...(rightText ? [new TextRun({ text: `\t${rightText}`, size: 19, color: MUTED, font: FONT })] : []),
      ],
    }),
  ];
  if (sub) {
    out.push(new Paragraph({ spacing: { after: 40 }, keepNext: true, children: [new TextRun({ text: sub, italics: true, size: 19, color: MUTED, font: FONT })] }));
  }
  return out;
}

function bulletParas(text: string) {
  return bullets(text).map(
    (b) =>
      new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        spacing: { after: 30 },
        children: [new TextRun({ text: b, size: 20, font: FONT })],
      }),
  );
}

export async function resumeToDocx(r: ResumeData): Promise<Buffer> {
  const L = SECTION_LABELS[r.lang];
  const p = r.personal;
  const children: Paragraph[] = [];

  children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: p.name || 'Seu nome', bold: true, size: 40, font: FONT })] }));
  if (p.headline) children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: p.headline, size: 23, color: ACCENT, font: FONT })] }));
  const contacts = contactLine(p);
  if (contacts.length) children.push(new Paragraph({ children: [new TextRun({ text: contacts.join('  |  '), size: 18, color: MUTED, font: FONT })] }));

  if (r.summary.trim()) {
    children.push(heading(L.summary));
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: r.summary, size: 20, font: FONT })] }));
  }

  if (r.experiences.length) {
    children.push(heading(L.experiences));
    for (const e of r.experiences) {
      children.push(...entry([e.role, e.company].filter(Boolean).join(' — '), period(e.start, e.end, e.current, r.lang), e.location || undefined));
      children.push(...bulletParas(e.description));
    }
  }

  if (r.projects.length) {
    children.push(heading(L.projects));
    for (const x of r.projects) {
      children.push(...entry(x.name, '', x.link || undefined));
      children.push(...bulletParas(x.description));
    }
  }

  if (r.skills.length) {
    children.push(heading(L.skills));
    for (const s of r.skills) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            ...(s.category ? [new TextRun({ text: `${s.category}: `, bold: true, size: 20, font: FONT })] : []),
            new TextRun({ text: s.items, size: 20, font: FONT }),
          ],
        }),
      );
    }
  }

  if (r.education.length) {
    children.push(heading(L.education));
    for (const e of r.education) {
      children.push(...entry([e.degree, e.institution].filter(Boolean).join(' — '), period(e.start, e.end, false, r.lang)));
      if (e.description.trim()) children.push(...bulletParas(e.description));
    }
  }

  if (r.certifications.length) {
    children.push(heading(L.certifications));
    for (const c of r.certifications) {
      children.push(
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: [c.name, c.issuer, c.year].filter(Boolean).join(' — '), size: 20, font: FONT })],
        }),
      );
    }
  }

  if (r.languages.length) {
    children.push(heading(L.languages));
    children.push(
      new Paragraph({
        children: [new TextRun({ text: r.languages.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join('   •   '), size: 20, font: FONT })],
      }),
    );
  }

  if (r.closing.text.trim()) {
    children.push(heading(r.closing.title.trim() || (r.lang === 'en' ? 'Professional philosophy' : 'Filosofia profissional')));
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: r.closing.text, size: 20, font: FONT })] }));
  }

  const doc = new Document({
    creator: p.name || 'Vagas CRM',
    title: p.name,
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1008, bottom: 1008, left: 1152, right: 1152 } } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
