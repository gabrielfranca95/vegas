import { useEffect, useRef, useState } from 'react';
import { Copy, Loader2, Send, Sparkles, Trash2 } from 'lucide-react';
import type { Job, JobChatMessage } from '../../../shared/types';
import { api } from '../lib/api';
import { copyText } from '../lib/format';
import { useToast } from '../lib/toast';
import { Button, Textarea } from './ui';

const QUICK: { label: string; text: string; send?: boolean }[] = [
  { label: 'Carta de apresentação', text: 'Escreva uma carta de apresentação para esta vaga.', send: true },
  {
    label: 'Por que sou o melhor candidato',
    text: 'O formulário da vaga pede: "Explique ao recrutador de que forma sua qualificação atende aos requisitos da vaga e porque você é o melhor candidato para preenchê-la. Utilize também esse espaço para responder questões formuladas pelo recrutador na descrição da vaga." Escreva esse texto ligando cada requisito principal da vaga à minha experiência real e responda também qualquer pergunta que esteja na descrição da vaga.',
    send: true,
  },
  { label: 'Perguntas do formulário', text: 'Responda estas perguntas da candidatura:\n1. \n2. \n3. ' },
  { label: 'Por que esta empresa?', text: 'Responda: por que você quer trabalhar nesta empresa e nesta vaga?', send: true },
  { label: 'Fale sobre você', text: 'Responda em até 600 caracteres: "Fale um pouco sobre você".', send: true },
  { label: 'E-mail com o CV', text: 'Escreva um e-mail curto para enviar meu currículo para esta vaga (com assunto).', send: true },
];

export default function ApplicationChat({ job }: { job: Job }) {
  const toast = useToast();
  const [messages, setMessages] = useState<JobChatMessage[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.jobs
      .chat(job.id)
      .then(setMessages)
      .catch((e) => toast((e as Error).message, 'error'));
  }, [job.id, toast]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const send = async (message = text) => {
    if (!message.trim() || sending) return;
    setSending(true);
    setMessages((m) => [...(m ?? []), { id: -1, role: 'user', content: message.trim(), created_at: new Date().toISOString() }]);
    setText('');
    try {
      const out = await api.jobs.sendChat(job.id, message.trim());
      setMessages(out.messages);
      if (out.failed?.length) toast(`Respondido com ${out.model} (reserva).`, 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
      setMessages((m) => (m ?? []).filter((x) => x.id !== -1));
      setText(message);
    } finally {
      setSending(false);
    }
  };

  const clear = async () => {
    if (!confirm('Apagar a conversa desta vaga?')) return;
    await api.jobs.clearChat(job.id);
    setMessages([]);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Cole aqui as perguntas do formulário da vaga ou peça uma carta de apresentação. A IA responde em texto pronto para colar, usando a descrição da vaga e o seu currículo
        {job.tailored_resume_id ? ' adaptado' : ' oficial'}.
      </p>

      <div className="scroll-thin max-h-[48vh] min-h-40 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
        {messages === null ? (
          <div className="grid h-32 place-items-center text-slate-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Nenhuma conversa ainda. Use um atalho abaixo ou escreva sua pergunta.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap shadow-sm ${
                  m.role === 'user' ? 'rounded-br-sm bg-indigo-600 text-white' : 'rounded-bl-sm bg-white text-slate-800'
                }`}
              >
                {m.content}
                {m.role === 'assistant' && (
                  <div className="mt-2 flex justify-end border-t border-slate-100 pt-1.5">
                    <button
                      onClick={async () => (await copyText(m.content)) && toast('Resposta copiada', 'info')}
                      className="flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
                    >
                      <Copy size={12} /> Copiar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 text-sm text-slate-500 shadow-sm">
              <Loader2 size={14} className="animate-spin" /> Escrevendo…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q.label}
            disabled={sending}
            onClick={() => {
              if (q.send) send(q.text);
              else {
                setText(q.text);
                setTimeout(() => document.getElementById(`chat-input-${job.id}`)?.focus(), 0);
              }
            }}
            className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
          >
            <Sparkles size={11} /> {q.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea
          id={`chat-input-${job.id}`}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
          }}
          placeholder="Cole a pergunta da vaga ou peça um ajuste (ex.: “deixe mais curto”, “em inglês”). Ctrl+Enter envia."
        />
        <div className="flex gap-2 sm:flex-col">
          <Button variant="primary" icon={<Send size={15} />} loading={sending} disabled={!text.trim()} onClick={() => send()} className="flex-1">
            Enviar
          </Button>
          {!!messages?.length && (
            <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={clear}>
              Limpar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
