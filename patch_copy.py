# Copy LIMPA: so "🥷 nome do produto" + preco (sem ACHADO NINJA RARO, sem selos)
copy = r'''import { discountPct } from './validator.js';
import type { RawOffer } from '../types.js';

const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

export function copyTemplate(o: RawOffer, link: string): string {
  const desc = discountPct(o);
  const L: string[] = [];
  L.push(`🥷 ${o.title}`, '');
  if (o.priceFrom > o.priceTo) L.push(`❌ De ${fmt(o.priceFrom)}`);
  let por = `✅ Por ${fmt(o.priceTo)}${desc > 0 ? ` (-${desc}%)` : ''}`;
  if (o.quantity && o.quantity > 1) por += `\n💡 Sai por ${fmt(o.priceTo / o.quantity)} cada`;
  L.push(por);
  if (o.coupon) L.push(`🎟️ Cupom: ${o.coupon}`);
  return L.join('\n');
}

export async function copyAI(o: RawOffer, link: string): Promise<string> {
  return copyTemplate(o, link);
}
'''
with open('src/pipeline/copywriter.ts', 'w', encoding='utf-8') as f:
    f.write(copy)

# Limpar a fila antiga: offers ja APROVADOS tinham a copy velha gravada.
# Marcando como REJECTED, o proximo ciclo enche a fila com copy nova.
try:
    import sqlite3, os
    if os.path.exists('data/garimpo.db'):
        con = sqlite3.connect('data/garimpo.db')
        n = con.execute("UPDATE offers SET status='REJECTED' WHERE status='APPROVED'").rowcount
        con.commit(); con.close()
        print('Fila antiga limpa (offers):', n)
    else:
        print('DB nao encontrado (ok, sera recriado)')
except Exception as e:
    print('Aviso ao limpar fila:', e)

cw = open('src/pipeline/copywriter.ts', encoding='utf-8').read()
print('COPY LIMPA OK:', ('ACHADO NINJA RARO' not in cw) and ('🥷 ${o.title}' in cw))
