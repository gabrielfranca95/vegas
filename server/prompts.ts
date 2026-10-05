import type { ContactEvent, EVKind, MessageKind, ResumeAIAction, ResumeData, RoleCategory, Settings } from '../shared/types.ts';
import { EV_KINDS, EVENT_LABELS, ROLE_CATEGORIES } from '../shared/types.ts';

const roleLabel = (r: RoleCategory) => ROLE_CATEGORIES.find((x) => x.key === r)?.label ?? r;

export function resumeToText(r: ResumeData, opts: { compact?: boolean } = {}): string {
  const lines: string[] = [];
  const p = r.personal;
  lines.push(`${p.name}${p.headline ? ` — ${p.headline}` : ''}`);
  if (r.summary) lines.push(`Resumo: ${r.summary}`);
  if (r.experiences.length) {
    lines.push('Experiências:');
    for (const e of r.experiences) {
      lines.push(`- ${e.role} @ ${e.company} (${e.start} – ${e.current ? 'atual' : e.end})`);
      if (!opts.compact && e.description) lines.push(...e.description.split('\n').filter(Boolean).map((l) => `  ${l}`));
    }
  }
  if (r.skills.length) lines.push(`Habilidades: ${r.skills.map((s) => `${s.category}: ${s.items}`).join(' | ')}`);
  if (!opts.compact) {
    if (r.education.length) lines.push(`Formação: ${r.education.map((e) => `${e.degree} — ${e.institution}`).join('; ')}`);
    if (r.projects.length) lines.push(`Projetos: ${r.projects.map((x) => `${x.name}: ${x.description}`).join(' | ')}`);
    if (r.certifications.length) lines.push(`Certificações: ${r.certifications.map((c) => c.name).join(', ')}`);
    if (r.languages.length) lines.push(`Idiomas: ${r.languages.map((l) => `${l.name} (${l.level})`).join(', ')}`);
  }
  return lines.join('\n');
}

// ---------- Mensagens ----------

const KIND_INSTRUCTIONS: Record<MessageKind, (limit: number) => string> = {
  invite_note: (limit) =>
    `Escreva a NOTA do convite de conexão do LinkedIn. Limite RÍGIDO de ${limit} caracteres (contando espaços). Sem saudação longa, sem assinatura. Deve dar um motivo claro para aceitar.`,
  first_message: () =>
    'A pessoa ACABOU de aceitar o convite de conexão. Escreva a primeira mensagem após a conexão: agradeça brevemente, contextualize o motivo do contato com postura de protagonista (um mini-STAR de 1 frase com resultado real do currículo) e termine com uma pergunta simples e fácil de responder. Máximo ~600 caracteres.',
  ev_delivery: () =>
    'Escreva a mensagem que ENTREGA a Entrega de Valor (EV) descrita abaixo. Apresente o material como uma contribuição espontânea e específica para a pessoa/empresa (o que é, por que é útil para ELA, 1 destaque concreto do conteúdo), sem cobrar nada em troca nesta mensagem. Termine com uma pergunta leve que convide a pessoa a reagir (ex.: se faz sentido para o time, se ela vê esse desafio por lá). Se o EV for um arquivo (PDF), diga que está anexo/segue em anexo. Máximo ~700 caracteres.',
  followup: () =>
    'A pessoa ainda não respondeu à mensagem anterior. Escreva um follow-up curto e educado (máximo ~350 caracteres), sem soar cobrança e sem repetir a mensagem anterior; traga um elemento novo (um dado, um interesse específico ou uma pergunta mais fácil).',
  reply: () =>
    'A pessoa respondeu. Escreva a resposta para dar continuidade à conversa de forma natural, respondendo ao que ela disse e conduzindo para o próximo passo (processo seletivo, conversa rápida, envio de currículo ou indicação, conforme fizer sentido).',
  direct: () =>
    'Escreva uma mensagem direta (InMail/e-mail/mensagem sem conexão prévia). Inclua um assunto curto na primeira linha no formato "Assunto: ...". Corpo com no máximo ~700 caracteres.',
};

export interface MessagePromptInput {
  kind: MessageKind;
  settings: Settings;
  contact: { name: string; role_category: RoleCategory; role_title: string | null; notes: string | null; platform: string };
  company: string | null;
  job: { title: string; description: string | null; url: string | null } | null;
  events: ContactEvent[];
  resume: ResumeData | null;
  instruction?: string;
  ev?: { kind: EVKind; title: string; summary: string | null; content: string } | null;
}

const evKindLabel = (k: EVKind) => EV_KINDS.find((x) => x.key === k)?.label ?? k;

export function buildMessagePrompt(i: MessagePromptInput) {
  const { settings: s, contact: c } = i;
  const limit = s.followup.inviteNoteLimit;
  const firstName = c.name.trim().split(/\s+/)[0];

  const system = [
    'Você é um especialista em recrutamento e networking no LinkedIn no mercado brasileiro, ajudando um candidato a abordar pessoas sobre vagas de emprego.',
    'Escreva em português do Brasil, com naturalidade humana: sem clichês ("Espero que esteja bem"), sem bajulação, sem emojis em excesso, sem hashtags.',
    'NUNCA invente experiências, números, empresas ou fatos que não estejam no contexto. Se faltar informação, seja genérico em vez de inventar.',
    `Tom desejado pelo candidato: ${s.profile.tone}.`,
    `Estratégia de influência a seguir em todas as mensagens:\n${s.strategy}`,
    'Responda em JSON: {"variants": ["mensagem 1", "mensagem 2"]} com DUAS variações diferentes de abordagem.',
  ].join('\n');

  const history = [...i.events]
    .filter((e) => e.type !== 'note' || e.content)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .map((e) => `[${e.occurred_at.slice(0, 16).replace('T', ' ')}] ${EVENT_LABELS[e.type]}${e.content ? `: ${e.content}` : ''}`)
    .join('\n');

  const prompt = [
    `## Tarefa\n${KIND_INSTRUCTIONS[i.kind](limit)}`,
    `## Quem vai receber\nNome: ${c.name} (chame de "${firstName}")\nPerfil: ${roleLabel(c.role_category)}${c.role_title ? ` — cargo: ${c.role_title}` : ''}\nEmpresa: ${i.company ?? 'não informada'}\nCanal: ${c.platform}${c.notes ? `\nAnotações sobre a pessoa: ${c.notes}` : ''}`,
    `## Como abordar esse perfil\n${s.approach[c.role_category]}`,
    i.job
      ? `## Vaga relacionada\nTítulo: ${i.job.title}${i.job.url ? `\nLink: ${i.job.url}` : ''}\nDescrição (resumo):\n${(i.job.description ?? '').slice(0, 3500)}`
      : '## Vaga relacionada\nNenhuma vaga específica — abordagem de interesse na empresa/área.',
    `## Sobre o candidato\nNome: ${s.profile.name || i.resume?.personal.name || '(não informado)'}\nHeadline: ${s.profile.headline || i.resume?.personal.headline || ''}\nCargos-alvo: ${s.profile.targetRoles}\nPitch: ${s.profile.pitch}${i.resume ? `\n\nCurrículo resumido:\n${resumeToText(i.resume, { compact: true })}` : ''}`,
    i.ev
      ? `## Entrega de Valor (EV) a entregar\nFormato: ${evKindLabel(i.ev.kind)}\nTítulo: ${i.ev.title}\nResumo: ${i.ev.summary ?? ''}\nConteúdo (trecho):\n${i.ev.content.slice(0, 2500)}`
      : '',
    history ? `## Histórico da conversa (mais antigo → mais recente)\n${history}` : '',
    i.instruction ? `## Instrução extra do candidato\n${i.instruction}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, prompt };
}

/** Modelo simples usado quando nenhuma IA está configurada. */
export function fallbackMessage(i: MessagePromptInput): string[] {
  const first = i.contact.name.trim().split(/\s+/)[0];
  const me = i.settings.profile.name || i.resume?.personal.name || '';
  const area = i.settings.profile.headline || i.resume?.personal.headline || 'minha área';
  const company = i.company ?? 'sua empresa';
  const vaga = i.job?.title ? `a vaga de ${i.job.title}` : `oportunidades na ${company}`;
  switch (i.kind) {
    case 'invite_note':
      return [
        `Olá, ${first}! Vi ${vaga} na ${company} e meu perfil (${area}) tem bastante aderência. Gostaria de me conectar para trocar uma ideia.`.slice(
          0,
          i.settings.followup.inviteNoteLimit,
        ),
      ];
    case 'first_message':
      return [
        `Oi, ${first}, obrigado por aceitar a conexão!\n\nSou ${me ? `${me}, ` : ''}${area}, e me interessei por ${vaga}. Tenho experiência alinhada ao que a vaga pede e adoraria entender melhor o processo. Posso te enviar meu currículo?`,
      ];
    case 'followup':
      return [`Oi, ${first}! Passando só para retomar minha mensagem sobre ${vaga}. Se fizer sentido, fico à disposição para uma conversa rápida. Obrigado!`];
    case 'reply':
      return [`Obrigado pelo retorno, ${first}! `];
    case 'ev_delivery':
      return [
        `Oi, ${first}! Preparei ${i.ev ? `"${i.ev.title}"` : 'um material rápido'} pensando nos desafios da ${company}${i.job?.title ? ` para a área de ${i.job.title}` : ''}. Segue como contribuição — faz sentido para o momento de vocês?`,
      ];
    case 'direct':
      return [
        `Assunto: Interesse em ${vaga}\n\nOlá, ${first}! Sou ${me ? `${me}, ` : ''}${area}. Vi ${vaga} e acredito que meu perfil tem boa aderência. Podemos conversar rapidamente sobre o processo?`,
      ];
  }
}

// ---------- Currículo ----------

export interface ResumeRuleOptions {
  flexibleTitles?: boolean;
  estimateDates?: boolean;
}

function resumeRules(o: ResumeRuleOptions = {}) {
  return [
    'Regras inegociáveis (valem mesmo que alguma instrução do candidato peça o contrário):',
    '- Fonte da verdade = currículo base + fatos declarados pelo candidato nas instruções. Nada além disso.',
    '- NUNCA invente empresas, experiências, formações, certificações, números/métricas ou ferramentas/tecnologias que não estejam nessa fonte da verdade.',
    o.flexibleTitles
      ? '- Os cargos nas empresas anteriores não tinham nome formal definido: você PODE nomear cada cargo de forma descritiva, fiel às atividades que aparecem naquela experiência, usando o vocabulário da vaga quando ele corresponder ao que foi feito. Não aumente a senioridade além do que as responsabilidades descritas sustentam e não atribua área ou atividades que não aparecem na experiência. Para cada cargo renomeado, inclua em "changes" um item "Cargo renomeado: <original> → <novo>".'
      : '- Os cargos ocupados em cada empresa permanecem os reais. O que pode mirar a vaga é a headline/título do currículo e o resumo.',
    o.estimateDates
      ? '- Datas: mantenha as que existem. Se faltar data em alguma experiência/formação, estime um período coerente com a ordem das experiências e o tempo total informado, usando SOMENTE o ano (ex.: "2021" a "2023"), e inclua em "changes" um item "Data estimada: <empresa> <período>".'
      : '- Datas: mantenha exatamente as do currículo base; se faltar alguma, deixe como está.',
    '- Você pode reescrever, reordenar, enfatizar, condensar e usar o vocabulário/palavras-chave da vaga para descrever o que o candidato realmente fez.',
    '- Não use marcadores para preencher depois ([X], [Mês], "adicione aqui"). Sem métrica real, descreva o impacto de forma qualitativa.',
    '- Bullets começam com verbo de ação no passado (pt) ou past tense (en), são específicos e sem primeira pessoa.',
  ].join('\n');
}

const RESUME_RULES = resumeRules();

const ACTION_TEXT: Record<ResumeAIAction, string> = {
  improve: 'Melhore a escrita: clareza, gramática, fluidez e profissionalismo, mantendo o conteúdo.',
  impact: 'Reescreva com foco em impacto e resultados (verbo de ação + o que fez + resultado/escala). Sem métrica real, descreva o impacto de forma qualitativa.',
  concise: 'Deixe mais conciso e escaneável, removendo redundâncias, mantendo as informações mais fortes.',
  ats: 'Otimize para sistemas ATS: use termos padrão de mercado e palavras-chave relevantes (sem keyword stuffing), formatação simples.',
  translate_en: 'Traduza para inglês profissional (en-US), adaptando termos ao mercado internacional.',
  translate_pt: 'Traduza para português do Brasil profissional.',
  custom: 'Siga a instrução personalizada do candidato.',
};

export function buildSectionPrompt(input: {
  section: string;
  content: unknown;
  action: ResumeAIAction;
  instruction?: string;
  resume: ResumeData;
  jobDescription?: string | null;
}) {
  const system = [
    'Você é um especialista em currículos para o mercado de tecnologia e corporativo brasileiro e internacional.',
    RESUME_RULES,
    'Responda em JSON: {"result": <conteúdo revisado com EXATAMENTE a mesma estrutura/tipo do conteúdo recebido, mantendo os mesmos campos "id">, "notes": "explicação curta do que mudou"}.',
  ].join('\n\n');

  const prompt = [
    `## Ação\n${ACTION_TEXT[input.action]}`,
    input.instruction ? `## Instrução do candidato\n${input.instruction}` : '',
    `## Seção a revisar: ${input.section}\n${JSON.stringify(input.content, null, 2)}`,
    `## Contexto: currículo completo\n${resumeToText(input.resume)}`,
    input.jobDescription ? `## Vaga alvo (alinhar a ela)\n${input.jobDescription.slice(0, 5000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, prompt };
}

export function buildTailorPrompt(
  resume: ResumeData,
  job: { title: string; company: string | null; description: string; location?: string | null; workModel?: string | null },
  instructions = '',
  ruleOptions: ResumeRuleOptions = {},
) {
  const system = [
    'Você é um especialista em adaptar currículos para vagas específicas, maximizando a aderência (inclusive para filtros ATS) sem mentir.',
    resumeRules(ruleOptions),
    '- Mantenha todos os campos "id" existentes. Pode reordenar experiências apenas se fizer sentido; não remova experiências profissionais, mas pode condensar as menos relevantes.',
    '- Ajuste a headline e o resumo para a vaga; reordene habilidades priorizando as pedidas na vaga que o candidato REALMENTE tem (no base ou declaradas nas instruções).',
    '- Siga as instruções do candidato (foco por tipo de cargo, endereço a usar, texto final etc.) em tudo o que não conflitar com as regras acima. Um texto de fechamento pedido pelo candidato vai no campo "closing" ({"title": "...", "text": "..."}).',
    'Responda em JSON: {"resume": <objeto completo no MESMO formato do currículo recebido>, "changes": ["mudança 1", ...], "match": {"score": 0-100, "strengths": [...], "gaps": [...], "missingKeywords": [...], "tips": [...]}}',
    '"gaps" e "missingKeywords" são requisitos da vaga que o currículo não demonstra — NÃO os adicione ao currículo; apenas liste para o candidato avaliar.',
  ].join('\n');

  const prompt = [
    instructions.trim() ? `## Instruções do candidato (siga-as dentro das regras)\n${instructions.trim().slice(0, 6000)}` : '',
    `## Vaga\nCargo: ${job.title}\nEmpresa: ${job.company ?? ''}${job.location ? `\nLocal: ${job.location}` : ''}${job.workModel ? `\nModelo: ${job.workModel}` : ''}\n\n${job.description.slice(0, 8000)}`,
    `## Currículo base (JSON)\n${JSON.stringify(resume)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, prompt };
}

export function buildMatchPrompt(resume: ResumeData, job: { title: string; company: string | null; description: string }) {
  const system = [
    'Você é um recrutador técnico experiente. Avalie a aderência do currículo à vaga com honestidade.',
    'Responda em JSON: {"score": 0-100, "strengths": [...], "gaps": [...], "missingKeywords": [...], "tips": ["dica prática para o currículo ou para a abordagem", ...]}',
    'Escreva em português do Brasil.',
  ].join('\n');
  const prompt = `## Vaga\nCargo: ${job.title}\nEmpresa: ${job.company ?? ''}\n\n${job.description.slice(0, 8000)}\n\n## Currículo\n${resumeToText(resume)}`;
  return { system, prompt };
}

export function buildReviewPrompt(resume: ResumeData) {
  const system = [
    'Você é um especialista em currículos. Faça uma revisão crítica e prática do currículo.',
    'Avalie: clareza, impacto/resultados, palavras-chave, tamanho, consistência de datas, erros de português, seções faltando, formatação para ATS.',
    'Responda em JSON: {"score": 0-100, "summary": "visão geral em 2-3 frases", "items": [{"section": "...", "severity": "alta"|"media"|"baixa", "issue": "...", "suggestion": "..."}]}',
    'Escreva em português do Brasil.',
  ].join('\n');
  return { system, prompt: `## Currículo (JSON)\n${JSON.stringify(resume)}` };
}

export function buildParsePrompt(text: string) {
  const system = [
    'Você converte o texto de um currículo em JSON estruturado, sem inventar nada. Campos sem informação ficam como string vazia ou lista vazia.',
    'Formato exato:',
    '{"lang":"pt"|"en","personal":{"name":"","headline":"","email":"","phone":"","location":"","linkedin":"","github":"","website":""},"summary":"","experiences":[{"company":"","role":"","location":"","start":"","end":"","current":false,"description":"um bullet por linha, sem o caractere de bullet"}],"education":[{"institution":"","degree":"","start":"","end":"","description":""}],"skills":[{"category":"","items":"item1, item2"}],"languages":[{"name":"","level":""}],"certifications":[{"name":"","issuer":"","year":""}],"projects":[{"name":"","link":"","description":""}]}',
    'Datas no formato curto como aparecem (ex.: "Jan 2022", "03/2021"). Se a experiência é atual, current=true e end="".',
  ].join('\n');
  return { system, prompt: `## Texto do currículo\n${text.slice(0, 20000)}` };
}

// ---------- EV (Entrega de Valor) ----------

const EV_PRINCIPLES = [
  'A EV é uma pequena contribuição, entregue sem ser pedida, que gera valor real para a empresa/pessoa e conecta com o cargo do candidato.',
  'Objetivo: prender a atenção, demonstrar competência na prática (postura de protagonista) e despertar reciprocidade — a pessoa tende a retribuir abrindo uma conversa ou um processo.',
  'Precisa ser ESPECÍFICA para essa empresa/vaga (nada genérico), consumível em 2–3 minutos, e mostrar raciocínio do candidato.',
  'Honestidade: use só fatos do contexto (descrição da vaga, texto do site, anotações) e conhecimento geral de mercado. Quando algo for hipótese sobre a empresa, escreva como hipótese ("provavelmente", "se for o caso"). Nunca invente números, clientes ou fatos internos da empresa.',
].join('\n');

export interface EVContext {
  settings: Settings;
  company: string | null;
  companySiteText: string | null;
  job: { title: string; description: string | null } | null;
  contact: { name: string; role_category: RoleCategory; role_title: string | null; notes: string | null } | null;
  resume: ResumeData | null;
  instruction?: string;
}

function evContextBlock(c: EVContext) {
  return [
    `## Empresa\n${c.company ?? 'não informada'}`,
    c.companySiteText ? `## Texto público do site da empresa (trecho)\n${c.companySiteText.slice(0, 6000)}` : '',
    c.job ? `## Vaga\nCargo: ${c.job.title}\n${(c.job.description ?? '').slice(0, 5000)}` : '',
    c.contact
      ? `## Pessoa que vai receber\n${c.contact.name} — ${roleLabel(c.contact.role_category)}${c.contact.role_title ? ` (${c.contact.role_title})` : ''}${c.contact.notes ? `\nAnotações: ${c.contact.notes}` : ''}`
      : '',
    `## Candidato\n${c.settings.profile.headline || c.resume?.personal.headline || ''}\nCargos-alvo: ${c.settings.profile.targetRoles}${c.resume ? `\n${resumeToText(c.resume, { compact: true })}` : ''}`,
    c.instruction ? `## Instrução do candidato\n${c.instruction}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildEVIdeasPrompt(c: EVContext) {
  const kinds = EV_KINDS.filter((k) => k.key !== 'outro')
    .map((k) => `- ${k.key}: ${k.label} — ${k.hint}`)
    .join('\n');
  const system = [
    'Você é um estrategista de carreira especialista em abordagens que geram resposta de recrutadores e gestores no mercado brasileiro.',
    EV_PRINCIPLES,
    `Formatos possíveis:\n${kinds}`,
    'Proponha 4 ideias de EV diferentes entre si, viáveis para o candidato produzir em até 1–2 horas, ligadas ao cargo dele e ao contexto da empresa.',
    'Responda em JSON: {"ideas": [{"kind": "<um dos formatos>", "title": "...", "summary": "o que o material contém, em 2-3 frases", "whyItWorks": "por que isso prende a atenção dessa pessoa específica", "effort": "baixo"|"medio"|"alto"}]}',
    'Escreva em português do Brasil.',
  ].join('\n\n');
  return { system, prompt: evContextBlock(c) };
}

export function buildEVContentPrompt(c: EVContext, ev: { kind: EVKind; title: string; summary: string | null }) {
  const isReport = ev.kind === 'flash_report' || ev.kind === 'diagnostico' || ev.kind === 'benchmark' || ev.kind === 'plano_30_60_90';
  const system = [
    'Você escreve materiais curtos de alto valor que candidatos entregam a empresas para se destacar.',
    EV_PRINCIPLES,
    isReport
      ? 'Formato do conteúdo: documento de 1 página (cabe num PDF A4), em Markdown simples: use "## " para seções, "- " para tópicos, **negrito** com moderação. Estrutura sugerida: Contexto (2-3 linhas) · Principais achados/oportunidades (3-5 tópicos objetivos) · Recomendações práticas (3 tópicos, cada um com impacto esperado) · Como eu contribuiria (1-2 frases em STAR, com resultado real do currículo). Sem título no corpo (o título já existe).'
      : 'Formato do conteúdo: texto direto em Markdown simples ("## " seções, "- " tópicos), de 150 a 400 palavras. Sem título no corpo.',
    'Responda em JSON: {"summary": "resumo de 1-2 frases do material", "content": "<markdown>"}',
    'Escreva em português do Brasil.',
  ].join('\n\n');
  const prompt = `## EV a produzir\nFormato: ${evKindLabel(ev.kind)}\nTítulo: ${ev.title}\nIdeia: ${ev.summary ?? ''}\n\n${evContextBlock(c)}`;
  return { system, prompt };
}

// ---------- Perfil do LinkedIn (texto colado) ----------

export function buildProfilePrompt(text: string) {
  const system = [
    'Você extrai dados de um perfil do LinkedIn a partir do texto copiado da página. Não invente: campos sem informação ficam vazios.',
    'Responda em JSON: {"name": "", "headline": "", "roleTitle": "cargo atual", "company": "empresa atual", "location": "", "about": "resumo do Sobre em até 600 caracteres", "previousCompanies": ["até 5 empresas anteriores"]}',
  ].join('\n');
  return { system, prompt: `## Texto do perfil\n${text.slice(0, 15000)}` };
}
