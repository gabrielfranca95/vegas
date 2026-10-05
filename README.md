# Vagas CRM

Sistema local para organizar a busca de emprego: quadro de vagas (estilo Trello), abordagem de pessoas no LinkedIn/Gupy com lembretes de follow-up, Entrega de Valor (EV), currículo com IA (exporta PDF e Word) e indicadores ao longo do tempo. Funciona no celular (layout responsivo) e tem login com dados separados por usuário (até 2 contas por padrão).

## Rodar

```bash
npm install
npm run dev
```

- Front: http://localhost:5173
- API: http://localhost:3001

Requer Node 22.5+ (usa o SQLite embutido do Node, `node:sqlite`).

Para rodar como app único (sem hot reload): `npm run build && npm start` → http://localhost:3001

## Login

No primeiro acesso, crie a sua conta. A segunda conta é criada pelo link "Criar outra conta" na tela de login. Cada usuário tem os próprios dados, currículos e chaves de IA. O limite padrão é 2 usuários (variável `MAX_USERS`).

## Abas

| Aba | O que faz |
| --- | --- |
| **Vagas** | Kanban com arrastar e soltar. Cole o link da vaga (LinkedIn, Gupy, RioVagas, Vagas.com; Indeed costuma bloquear leitura automática) e os dados são preenchidos, incluindo o e-mail de candidatura quando a vaga pede "envie seu currículo para…". Cada card mostra as pessoas da empresa e alertas de follow-up. |
| **Mensagens** | Pessoas abordadas (recrutador, líder técnico, gerente, diretor, dono…). Gera mensagens com IA por tipo de pessoa e etapa (nota de convite, primeira mensagem, follow-up, resposta), botão para copiar e abrir o LinkedIn, linha do tempo e lembretes automáticos. Métricas de tempo de aceite e de resposta por perfil. |
| **Entrega de Valor (EV)** | Contribuição para a empresa entregue na conversa (Flash Report em PDF, leitura da vaga, diagnóstico, plano 30-60-90, benchmark, prova de conceito…). A IA sugere ideias a partir da vaga, da pessoa e do site da empresa, gera o conteúdo e o PDF. |
| **Currículo** | Currículo oficial + versões adaptadas por vaga. Botões de IA por seção, revisão geral, importação de PDF/DOCX e exportação em PDF ou Word. |
| **Indicadores** | Meta "1 proposta a cada N interações completas" (padrão 200), funil, efeito do EV na taxa de resposta, evolução semanal, resultados por plataforma e por tipo de pessoa. |
| **Configurações** | Chaves e modelos de IA (Gemini, OpenAI, Claude, DeepSeek), perfil, estratégia de influência, diretrizes por tipo de pessoa, regras de follow-up, meta, colunas do quadro e senha. |

## Como os lembretes funcionam

O estágio de cada pessoa é calculado a partir da linha do tempo (eventos registrados):

1. **A abordar** → enviar convite.
2. **Convite enviado** → aguarda; após N dias sem aceite, sinaliza.
3. **Conectado** → sinaliza para enviar a mensagem na hora.
4. **Aguardando resposta** → follow-up após os dias configurados (padrão 3, 5, 7), até o máximo de follow-ups.
5. **Em conversa** → quando a pessoa responde, sinaliza que é sua vez.

Eventos podem ter data/hora editada, então dá para registrar algo que aconteceu antes.

**Interação completa** = a pessoa respondeu ou o ciclo foi encerrado. **Entrevistas e propostas** contam quando a vaga entra nas colunas "Entrevistas"/"Proposta" do quadro ou quando o evento é registrado na pessoa (sem contar duas vezes a mesma vaga). Toda mudança de coluna fica registrada, por isso os indicadores mostram a evolução no tempo.

## Dados

Tudo fica em `data/vagas.db` (SQLite), inclusive as chaves de API. A pasta `data/` está no `.gitignore`.
Também é possível definir as chaves por variável de ambiente: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`.

## Estrutura

```
server/           API Express (TypeScript via tsx)
  routes/         jobs, contacts, resumes
  ai.ts           chamada aos provedores de IA
  prompts.ts      prompts de mensagens e currículo
  followup.ts     cálculo de estágio, próxima ação e métricas
  scrape.ts       leitura de vagas por link
  export/         geração de PDF e DOCX
shared/types.ts   tipos usados pelo servidor e pelo front
web/              front React + Vite + Tailwind
```
