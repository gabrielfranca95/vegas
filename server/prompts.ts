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

const KIND_INSTRUCTIONS: Record<MessageKind, (limit: number, hasEv: boolean) => string> = {
  invite_note: (limit) =>
    `Escreva a NOTA do convite de conexão do LinkedIn. Limite RÍGIDO de ${limit} caracteres (contando espaços). Estrutura: "Olá, <nome>." + quem o candidato é (cargo + especialização real) + um elemento ESPECÍFICO da empresa (iniciativa/produto/área real do contexto) + motivo para conectar (para recrutador/RH: está mapeando o próximo desafio na área). Sem pedir vaga ou CV, sem "admiro o trabalho".`,
  first_message: (_l, hasEv) =>
    `A pessoa aceitou o convite (ou já era conexão). Escreva a 1ª mensagem seguindo a estrutura do exemplo que FUNCIONOU: (1) "Olá, <nome>. Tudo bem?"; (2) quem o candidato é + intenção clara para recrutador/RH ("ao mapear o mercado para o meu próximo desafio profissional focado em <área>") ou interesse genuíno para os demais perfis; (3) por que ESTA empresa: cite pelo nome 1-2 iniciativas/frentes reais do contexto; (4) ponte com a atuação do candidato nos mesmos setores/desafios; (5) ${
      hasEv
        ? 'apresente o material anexo (EV) dizendo concretamente o que ele aborda, com 1-2 resultados reais do currículo (números quando existirem)'
        : 'traga na própria mensagem 1-2 resultados reais do currículo (números quando existirem) ligados aos desafios da empresa'
    }; (6) uma frase de sinergia; (7) fechamento: "Fico à disposição para trocarmos ideias e explorarmos possíveis oportunidades de colaboração no time." Sem "novamente", sem pedir CV/vaga. Entre 550 e 900 caracteres, em 4-5 parágrafos curtos.`,
  ev_delivery: () =>
    'Escreva a mensagem que ENTREGA o material (EV) abaixo: contexto específico da empresa (iniciativa real citada pelo nome), o que o material aborda concretamente com 1-2 resultados reais do candidato, ligação com os desafios da empresa e fechamento abrindo para trocar ideias e explorar oportunidades de colaboração. Sem pedir CV/vaga. Máximo ~800 caracteres.',
  followup: () =>
    'A pessoa ainda não respondeu. Escreva um follow-up de 1-3 frases que NÃO diga "retomando"/"passando para lembrar" e NÃO repita a mensagem anterior: "Olá <nome>, espero que esteja bem." + UMA pergunta curta, fácil e dentro da área de quem recebe, ligada ao perfil/time (para recrutador: quais características considera essenciais no perfil de <cargo do candidato> na <empresa>) + uma frase curta de apreço. Proibido pergunta abstrata sobre futuro da tecnologia/mercado.',
  reply: () =>
    'A pessoa respondeu (veja a última mensagem dela no histórico). Responda como numa conversa real: primeiro o cumprimento, se houve ("Olá <nome>, estou bem, e você como está?"); depois responda EXATAMENTE o que ela perguntou, curto e direto, com prova concreta do currículo quando couber. Se ela pediu pretensão salarial e a senioridade/escopo não está claro, pergunte isso antes ("Qual o nível de senioridade da vaga? Com base nisso consigo pensar na minha faixa com mais equilíbrio"). Se pediu contato, e-mail ou horário, confirme de forma objetiva. Deixe ela conduzir. Pode separar em 2 mensagens curtas na mesma variação, com uma linha em branco entre elas.',
  direct: () =>
    'Escreva uma mensagem direta (InMail/e-mail, sem conexão prévia) com a mesma estrutura da 1ª mensagem que funcionou (intenção clara, iniciativas reais da empresa pelo nome, resultados concretos do candidato, fechamento abrindo para oportunidades de colaboração). Primeira linha "Assunto: ..." curta e específica. Máximo ~900 caracteres.',
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
  /** Texto público do site da empresa (contexto para citar iniciativas reais). */
  companySiteText?: string | null;
  /** Mensagem já enviada a outra pessoa da mesma empresa (para não repetir). */
  sameCompanyMessage?: { name: string; content: string } | null;
}

const evKindLabel = (k: EVKind) => EV_KINDS.find((x) => x.key === k)?.label ?? k;

export function buildMessagePrompt(i: MessagePromptInput) {
  const { settings: s, contact: c } = i;
  const limit = s.followup.inviteNoteLimit;
  const firstName = c.name.trim().split(/\s+/)[0];

  const system = [
    'Você é um especialista em recrutamento e networking no LinkedIn no mercado brasileiro, ajudando um candidato a abordar pessoas sobre vagas de emprego.',
    'Escreva em português do Brasil impecável (acentos e ortografia corretos), com naturalidade humana, sem bajulação, sem emojis soltos, sem hashtags.',
    'NUNCA invente experiências, números, empresas ou fatos que não estejam no contexto. Se faltar informação, seja genérico em vez de inventar.',
    `Tom desejado pelo candidato: ${s.profile.tone}.`,
    `Estratégia a seguir em todas as mensagens:\n${s.strategy}`,
    s.examples?.trim()
      ? `Abordagens reais que FUNCIONARAM para este candidato (use como referência de estrutura, tom e tamanho; NÃO copie fatos, empresas ou projetos do exemplo que não estejam no currículo):\n${s.examples.trim()}`
      : '',
    'Responda em JSON: {"variants": ["mensagem 1", "mensagem 2"]} com DUAS variações diferentes, ambas seguindo a estratégia.',
  ]
    .filter(Boolean)
    .join('\n');

  const history = [...i.events]
    .filter((e) => e.type !== 'note' || e.content)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .map((e) => `[${e.occurred_at.slice(0, 16).replace('T', ' ')}] ${EVENT_LABELS[e.type]}${e.content ? `: ${e.content}` : ''}`)
    .join('\n');

  const prompt = [
    `## Tarefa\n${KIND_INSTRUCTIONS[i.kind](limit, Boolean(i.ev))}`,
    `## Quem vai receber\nNome: ${c.name} (chame de "${firstName}")\nPerfil: ${roleLabel(c.role_category)}${c.role_title ? ` — cargo: ${c.role_title}` : ''}\nEmpresa: ${i.company ?? 'não informada'}\nCanal: ${c.platform}${c.notes ? `\nAnotações sobre a pessoa: ${c.notes}` : ''}`,
    `## Como abordar esse perfil\n${s.approach[c.role_category]}`,
    i.job
      ? `## Vaga aberta na empresa (CONTEXTO para escolher o tema de valor — não citar a vaga no convite nem na 1ª mensagem)\nTítulo: ${i.job.title}\nDescrição (resumo):\n${(i.job.description ?? '').slice(0, 3500)}`
      : '## Vaga\nNenhuma vaga específica — abordagem de interesse na empresa/área.',
    `## Sobre o candidato\nNome: ${s.profile.name || i.resume?.personal.name || '(não informado)'}\nHeadline: ${s.profile.headline || i.resume?.personal.headline || ''}\nCargos-alvo: ${s.profile.targetRoles}\nPitch: ${s.profile.pitch}${i.resume ? `\n\nCurrículo resumido:\n${resumeToText(i.resume, { compact: true })}` : ''}`,
    i.ev
      ? `## Entrega de Valor (EV) a entregar\nFormato: ${evKindLabel(i.ev.kind)}\nTítulo: ${i.ev.title}\nResumo: ${i.ev.summary ?? ''}\nConteúdo (trecho):\n${i.ev.content.slice(0, 2500)}`
      : '',
    i.companySiteText
      ? `## Site da empresa (fonte para citar iniciativas reais pelo nome)\n${i.companySiteText.slice(0, 5000)}`
      : '## Site da empresa\nNão disponível — use apenas o que estiver na vaga e nas anotações; não invente iniciativas.',
    i.sameCompanyMessage
      ? `## Já foi enviada esta mensagem para ${i.sameCompanyMessage.name}, da mesma empresa — escreva algo claramente DIFERENTE (outra iniciativa, outro resultado, outra abertura)\n${i.sameCompanyMessage.content.slice(0, 1200)}`
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
  const area = i.settings.profile.headline || i.resume?.personal.headline || 'profissional de tecnologia';
  const company = i.company ?? 'sua empresa';
  const target = i.settings.profile.targetRoles || area;
  const skills =
    i.resume?.skills
      .flatMap((g) => g.items.split(','))
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(', ') || 'minhas competências';
  switch (i.kind) {
    case 'invite_note':
      return [
        `Olá, ${first}. Sou ${area} e estou mapeando o mercado para o meu próximo desafio. A ${company} chamou minha atenção e gostaria de conectar para trocarmos ideias.`.slice(
          0,
          i.settings.followup.inviteNoteLimit,
        ),
      ];
    case 'first_message':
    case 'ev_delivery':
    case 'direct':
      return [
        `${i.kind === 'direct' ? `Assunto: ${area} — próximo desafio\n\n` : ''}Olá, ${first}. Tudo bem?\n\nSou ${area} e, ao mapear o mercado para o meu próximo desafio profissional em ${target}, a ${company} se destacou no meu radar.\n\nTenho atuação com ${skills}${i.ev ? ` e preparei um material (anexo), "${i.ev.title}", com perspectivas sobre como essa experiência pode apoiar os desafios de vocês` : ''}.\n\nFico à disposição para trocarmos ideias e explorarmos possíveis oportunidades de colaboração no time.`,
      ];
    case 'followup':
      return [`Olá ${first}, espero que esteja bem. Gostaria de saber quais características você considera essenciais para o perfil de ${target} na ${company}. Aprecio a oportunidade de entender melhor o que valorizam na equipe.`];
    case 'reply':
      return [`Olá ${first}, estou bem, e você como está?\n\n`];
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
    '- Siga as instruções do candidato (foco por tipo de cargo, endereço a usar etc.) em tudo o que não conflitar com as regras acima. Se o currículo base já tem "closing", copie-o sem alterações; se não tem e o candidato pediu um texto final, coloque-o em "closing" ({"title": "...", "text": "..."}).',
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
  'Precisa ser ESPECÍFICA para essa empresa/vaga (nada genérico), consumível em 2–3 minutos, e mostrar raciocínio do candidato. Cite iniciativas/produtos reais da empresa pelo nome quando o contexto trouxer.',
  'Adeque ao destinatário: recrutador/RH → material de FIT executivo (desafios prováveis do time e como a experiência real do candidato resolve, com resultados e números reais); tech lead/gestor → perspectiva técnica concreta; diretor/dono → visão de negócio. Evite "reflexão estratégica" abstrata para recrutador.',
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

// ---------- Assistente de candidatura ----------

export function buildApplicationChatPrompt(input: {
  settings: Settings;
  job: { title: string; company: string | null; description: string | null; location: string | null; work_model: string | null };
  resume: ResumeData | null;
  history: { role: 'user' | 'assistant'; content: string }[];
  message: string;
}) {
  const s = input.settings;
  const system = [
    'Você é o assistente de candidatura do candidato. Escreve respostas prontas para colar em formulários de vagas, cartas de apresentação e e-mails para recrutadores, em português do Brasil (ou no idioma da pergunta/vaga).',
    'Escreva na primeira pessoa, como o próprio candidato, com tom profissional, natural e direto. Texto puro pronto para colar: sem títulos em Markdown, sem asteriscos, sem comentários seus antes ou depois.',
    'Conecte as respostas aos requisitos da vaga e use exemplos concretos do currículo (método STAR quando for pergunta comportamental: situação, tarefa, ação, resultado).',
    'Se vierem várias perguntas, responda cada uma em sequência, repetindo a pergunta numerada antes da resposta.',
    'Carta de apresentação: 3 a 4 parágrafos curtos (abertura com o interesse na vaga, 1-2 parágrafos de fit com resultados do currículo, fechamento com disponibilidade), sem cabeçalho de endereço.',
    'Veracidade: use só fatos do currículo, das instruções do candidato e da conversa. Se a pergunta depende de algo que você não sabe (pretensão salarial, disponibilidade, data de início, documentos), não invente: pergunte isso ao candidato em uma frase curta e, se fizer sentido, já mostre como a resposta ficaria.',
    'Se o candidato pedir ajuste ("mais curto", "mais formal", "em inglês"), reescreva a última resposta.',
  ].join('\n');

  const history = input.history
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'CANDIDATO' : 'VOCÊ'}: ${m.content}`)
    .join('\n\n');

  const j = input.job;
  const prompt = [
    `## Vaga\nCargo: ${j.title}\nEmpresa: ${j.company ?? ''}${j.location ? `\nLocal: ${j.location}` : ''}${j.work_model ? `\nModelo: ${j.work_model}` : ''}\n\n${(j.description ?? '(sem descrição)').slice(0, 6000)}`,
    input.resume ? `## Currículo do candidato (adaptado para esta vaga, quando existir)\n${resumeToText(input.resume)}` : '## Currículo\n(não cadastrado)',
    `## Sobre o candidato\nNome: ${s.profile.name || input.resume?.personal.name || ''}\nPitch: ${s.profile.pitch}\nCargos-alvo: ${s.profile.targetRoles}`,
    s.resumeAutomation.instructions.trim() ? `## Instruções/fatos declarados pelo candidato\n${s.resumeAutomation.instructions.trim().slice(0, 4000)}` : '',
    history ? `## Conversa até aqui\n${history}` : '',
    `## Nova mensagem do candidato\n${input.message}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, prompt };
}
