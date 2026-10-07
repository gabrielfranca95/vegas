import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2, X } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai' | 'linkedin' | 'success';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-200/70 disabled:text-slate-300',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
  ai: 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-60',
  linkedin: 'bg-[#0a66c2] text-white hover:bg-[#004182] disabled:opacity-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  const sz = size === 'sm' ? 'px-2.5 py-1 text-xs gap-1' : 'px-3.5 py-2 text-sm gap-1.5';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${sz} ${VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'sm' ? 13 : 16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

const fieldBase =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

/** Classes base dos campos; ocupa a largura toda, a menos que o chamador defina uma largura própria. */
const fieldCls = (extra = '') => `${fieldBase} ${/(^|\s)(w-|flex-1)/.test(extra) ? '' : 'w-full'} ${extra}`;

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={fieldCls(props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={fieldCls(props.className)} />;
}

export function Textarea({ autoGrow, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoGrow || !ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight + 2}px`;
  }, [autoGrow, props.value]);
  return <textarea ref={ref} {...props} className={fieldCls(props.className)} />;
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-2 pt-2 backdrop-blur-[2px] sm:p-4 sm:pt-[6vh]" onMouseDown={onClose}>
      <div className={`w-full ${width} rounded-2xl bg-white shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 sm:px-5">
          <h2 className="min-w-0 text-base font-semibold text-slate-900">{title}</h2>
          <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>
  );
}

export function Badge({ children, color = '#64748b', className = '' }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={`tinted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`}
      style={{ backgroundColor: `${color}1a`, color }}
    >
      {children}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-500">
      {icon && <div className="text-slate-400">{icon}</div>}
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="max-w-sm text-sm">{children}</div>}
    </div>
  );
}

/** Menu suspenso simples (fecha ao clicar fora). */
export function Dropdown({ trigger, children, align = 'left' }: { trigger: (toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div className="relative inline-block" ref={ref}>
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div className={`absolute z-40 mt-1 min-w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children, icon }: { onClick: () => void; children: ReactNode; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100">
      {icon}
      {children}
    </button>
  );
}

export const PLATFORM_COLORS: Record<string, string> = {
  linkedin: '#0a66c2',
  gupy: '#7c3aed',
  riovagas: '#0891b2',
  indeed: '#2557a7',
  vagascom: '#ea580c',
  email: '#0f766e',
  whatsapp: '#16a34a',
  outro: '#64748b',
};
