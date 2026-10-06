import { MapPin } from 'lucide-react';
import { Input } from './ui';

/** Até 3 endereços (bairro e cidade) onde a pessoa reside; o mais próximo da vaga vai no currículo adaptado. */
export default function AddressFields({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const slots = [0, 1, 2].map((i) => value[i] ?? '');
  const set = (i: number, v: string) => {
    const next = [...slots];
    next[i] = v;
    onChange(next.map((x) => x.trim()).some(Boolean) ? next : []);
  };
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-600">Endereços onde você reside (até 3)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {slots.map((v, i) => (
          <div key={i} className="relative">
            <MapPin size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-8"
              value={v}
              onChange={(e) => set(i, e.target.value)}
              placeholder={i === 0 ? 'Principal: bairro, cidade - UF' : 'Bairro, cidade - UF'}
            />
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Ao adaptar o currículo, o sistema calcula a distância até o local da vaga e usa o endereço mais próximo no cabeçalho (vaga remota usa o principal). Cadastre só
        endereços onde você realmente reside.
      </p>
    </div>
  );
}
