hot = r'''import { createHmac } from 'node:crypto';
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
export async function collectAliexpressHot(): Promise<RawOffer[]> {
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
      page_size: '20',
      page_no: '1',
      tracking_id: trackingId,
      keywords: kw,
      sort: 'LAST_VOLUME_DESC',
    };
    params.sign = assinar(params, appSecret);
    try {
      const res = await fetch(`${GATEWAY}?${new URLSearchParams(params).toString()}`);
      const json: any = await res.json();
      if (json.error_response) {
        log.error(`HOT "${kw}": ${json.error_response.code} ${json.error_response.sub_msg || json.error_response.msg}`);
        continue;
      }
      const result = json?.aliexpress_affiliate_hotproduct_query_response?.resp_result?.result;
      const products: any[] = result?.products?.product ?? [];
      for (const p of products) {
        const id = String(p.product_id);
        if (vistos.has(id)) continue;
        vistos.add(id);
        todas.push({
          source: 'aliexpress',
          sourceProductId: id,
          title: p.product_title,
          imageUrl: p.product_main_image_url,
          priceFrom: parseFloat(p.target_original_price ?? p.target_sale_price),
          priceTo: parseFloat(p.target_sale_price),
          rating: Math.min(5, parsePct(p.evaluate_rate) / 20 || 4.6),
          ratingCount: 0,
          salesCount: Number(p.lastest_volume ?? 0),
          commissionPct: parsePct(p.commission_rate || p.hot_product_commission_rate),
          offerUrl: p.promotion_link,
        });
      }
      log.info(`HOT "${kw}": ${products.length} quentes`);
    } catch (e) {
      log.error(`HOT "${kw}" falhou: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise(r => setTimeout(r, 400));
  }
  log.info(`AliExpress HOT: ${todas.length} no total`);
  return todas;
}
'''

with open('src/collectors/aliexpress-hot.ts', 'w', encoding='utf-8') as f:
    f.write(hot)

p = 'src/index.ts'
with open(p, encoding='utf-8') as f:
    s = f.read()

if 'aliexpress-hot' not in s:
    s = s.replace(
        "import { collectAliexpress } from './collectors/aliexpress.js';",
        "import { collectAliexpress } from './collectors/aliexpress.js';\nimport { collectAliexpressHot } from './collectors/aliexpress-hot.js';",
        1)
    s = s.replace(
        "['AliExpress', collectAliexpress]] as const)",
        "['AliExpress', collectAliexpress], ['AliExpress HOT', collectAliexpressHot]] as const)",
        1)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s)

print('IMPORT OK:', 'aliexpress-hot' in s)
print('LOOP OK:', 'collectAliexpressHot]' in s)
