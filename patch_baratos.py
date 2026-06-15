import os

# 1) Novo coletor BARATAO: hardware <=R$50, mais vendido, com desconto >=40%
barato = r'''import { createHmac } from 'node:crypto';
import { config } from '../lib/config.js';
import { log } from '../lib/logger.js';
import type { RawOffer } from '../types.js';

const GATEWAY = 'https://api-sg.aliexpress.com/sync';
function assinar(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params).sort().map(k => k + params[k]).join('');
  return createHmac('sha256', secret).update(base, 'utf8').digest('hex').toUpperCase();
}
function parsePct(v?: string): number {
  if (!v) return 0;
  const n = parseFloat(String(v).replace('%', '').trim());
  return isNaN(n) ? 0 : n;
}
export async function collectAliexpressBarato(): Promise<RawOffer[]> {
  const { appKey, appSecret, trackingId, keywords } = config.aliexpress;
  if (!appKey) return [];
  const todas: RawOffer[] = [];
  const vistos = new Set<string>();
  for (const kw of keywords.slice(0, 15)) {
    const params: Record<string, string> = {
      app_key: appKey,
      method: 'aliexpress.affiliate.hotproduct.query',
      sign_method: 'sha256',
      timestamp: String(Date.now()),
      target_currency: 'BRL',
      target_language: 'PT',
      ship_to_country: 'BR',
      page_size: '40',
      page_no: '1',
      tracking_id: trackingId,
      keywords: kw,
      sort: 'LAST_VOLUME_DESC',
      max_sale_price: '50',
    };
    params.sign = assinar(params, appSecret);
    try {
      const res = await fetch(`${GATEWAY}?${new URLSearchParams(params).toString()}`);
      const json: any = await res.json();
      if (json.error_response) { log.error(`BARATO "${kw}": ${json.error_response.sub_msg || json.error_response.msg}`); continue; }
      const result = json?.aliexpress_affiliate_hotproduct_query_response?.resp_result?.result;
      const products: any[] = result?.products?.product ?? [];
      for (const p of products) {
        const id = String(p.product_id);
        if (vistos.has(id)) continue;
        const priceTo = parseFloat(p.target_sale_price);
        const priceFrom = parseFloat(p.target_original_price ?? p.target_sale_price);
        if (!(priceTo > 0) || priceTo > 50) continue;
        const disc = priceFrom > priceTo ? 1 - priceTo / priceFrom : 0;
        if (disc < 0.40) continue;
        vistos.add(id);
        todas.push({
          source: 'aliexpress',
          sourceProductId: id,
          title: p.product_title,
          imageUrl: p.product_main_image_url,
          priceFrom,
          priceTo,
          rating: Math.min(5, parsePct(p.evaluate_rate) / 20 || 4.6),
          ratingCount: 0,
          salesCount: Number(p.lastest_volume ?? 0),
          commissionPct: parsePct(p.commission_rate || p.hot_product_commission_rate),
          offerUrl: p.promotion_link,
          offerType: 'promocao',
        });
      }
      log.info(`BARATO "${kw}": ${products.length} analisados`);
    } catch (e) {
      log.error(`BARATO "${kw}" falhou: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise(r => setTimeout(r, 400));
  }
  todas.sort((a, b) => (b.priceFrom > b.priceTo ? 1 - b.priceTo / b.priceFrom : 0) - (a.priceFrom > a.priceTo ? 1 - a.priceTo / a.priceFrom : 0));
  log.info(`AliExpress BARATO: ${todas.length} achados <=R$50`);
  return todas.slice(0, 30);
}
'''
with open('src/collectors/aliexpress-barato.ts', 'w', encoding='utf-8') as f:
    f.write(barato)

# 2) index.ts: importar + ligar o coletor na lista de fontes
p = 'src/index.ts'
with open(p, encoding='utf-8') as f:
    s = f.read()
if 'aliexpress-barato' not in s:
    s = s.replace(
        "import { collectAliexpressHot } from './collectors/aliexpress-hot.js';",
        "import { collectAliexpressHot } from './collectors/aliexpress-hot.js';\nimport { collectAliexpressBarato } from './collectors/aliexpress-barato.js';",
        1)
    s = s.replace(
        "collectAliexpressHot]] as const)",
        "collectAliexpressHot], ['AliExpress BARATO', collectAliexpressBarato]] as const)",
        1)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s)

# 3) validator.ts: liberar preco <=R$50 SOMENTE para os baratos (offerType promocao)
v = 'src/pipeline/validator.ts'
with open(v, encoding='utf-8') as f:
    vd = f.read()
vd = vd.replace(
    "if (o.priceTo < r.precoMin)",
    "if (o.offerType !== 'promocao' && o.priceTo < r.precoMin)")
vd = vd.replace(
    "if (o.priceTo > r.precoMax)",
    "if (o.priceTo > (o.offerType === 'promocao' ? 50 : r.precoMax))")
with open(v, 'w', encoding='utf-8') as f:
    f.write(vd)

# Conferencias
ix = open('src/index.ts', encoding='utf-8').read()
vd2 = open('src/pipeline/validator.ts', encoding='utf-8').read()
print('COLLECTOR OK:', os.path.exists('src/collectors/aliexpress-barato.ts'))
print('INDEX OK:', 'collectAliexpressBarato]' in ix)
print('VALIDATOR OK:', "o.offerType !== 'promocao'" in vd2)
