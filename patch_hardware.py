import re

# 1) COPY NOVA: tira as frases ninja, poe "🥷 + nome do produto" na frente
copy = r'''import { discountPct } from './validator.js';
import type { RawOffer } from '../types.js';

const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

function selo(o: RawOffer): string | null {
  switch (o.offerType) {
    case 'bug': return '🐞🔥 BUG DE PRECO — some rapido!';
    case '2por1': return '🔥 LEVE 2, PAGUE 1';
    case 'cupom': return '🎟️ SO COM CUPOM';
    case 'promocao': return '🔥 PROMOCAO RELAMPAGO';
    default: return null;
  }
}

export function copyTemplate(o: RawOffer, link: string): string {
  const desc = discountPct(o);
  const L: string[] = [];
  if (o.offerType === 'bug' || desc >= 60) L.push('🥷🥷🥷 ACHADO NINJA RARO 🥷🥷🥷', '');
  const s = selo(o); if (s) L.push(s);
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

# 2) index.ts: desligar o radar + priorizar MAIORES DESCONTOS (boas promocoes)
p = 'src/index.ts'
with open(p, encoding='utf-8') as f:
    s = f.read()
s = s.replace('await rodarRadar()', '[] /* radar desativado: foco hardware */')
s = s.replace(
    ".sort((a, b) => b.priceTo - a.priceTo)",
    ".sort((a, b) => (b.priceFrom > b.priceTo ? 1 - b.priceTo / b.priceFrom : 0) - (a.priceFrom > a.priceTo ? 1 - a.priceTo / a.priceFrom : 0))")
with open(p, 'w', encoding='utf-8') as f:
    f.write(s)

# 3) .env: nicho hardware + 3 por hora + teto de preco maior
HARDWARE = ('ssd nvme,ssd m2,ssd externo,memoria ram ddr4,memoria ram ddr5,hd externo,'
            'pen drive,cartao micro sd,water cooler,cooler cpu,air cooler,gabinete gamer,'
            'fonte gamer,placa de video,placa de video rtx,processador ryzen,processador intel,'
            'placa mae,webcam full hd,microfone gamer,hub usb,adaptador usb c,cabo hdmi,'
            'ventoinha rgb,mousepad gamer,placa de captura,monitor gamer,headset gamer,'
            'mouse gamer,teclado mecanico')

def setenv(env, key, val):
    if re.search(rf'^{key}=', env, re.M):
        return re.sub(rf'^{key}=.*$', f'{key}={val}', env, flags=re.M)
    return env.rstrip() + f'\n{key}={val}\n'

with open('.env', encoding='utf-8') as f:
    env = f.read()
env = setenv(env, 'ALIEXPRESS_KEYWORDS', HARDWARE)
env = setenv(env, 'LOTE_POR_CICLO', '3')
env = setenv(env, 'PRECO_MAX', '5000')
with open('.env', 'w', encoding='utf-8') as f:
    f.write(env)

# Conferencias
cw = open('src/pipeline/copywriter.ts', encoding='utf-8').read()
ix = open('src/index.ts', encoding='utf-8').read()
ev = open('.env', encoding='utf-8').read()
print('COPY NOVA OK:', 'FRASES_NINJA' not in cw and '🥷 ${o.title}' in cw)
print('RADAR OFF OK:', 'radar desativado' in ix)
print('PROMO (maior desconto 1o) OK:', '1 - b.priceTo / b.priceFrom' in ix)
print('3 POR HORA OK:', 'LOTE_POR_CICLO=3' in ev)
print('HARDWARE OK:', 'teclado mecanico' in ev)
