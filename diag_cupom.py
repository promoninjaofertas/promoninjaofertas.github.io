# DIAGNOSTICO (so leitura): ve se a API da AliExpress devolve cupom e quais campos.
# Nao altera nada no sistema.
import time, hmac, hashlib, json, urllib.request, urllib.parse

def getenv(k):
    for line in open('.env', encoding='utf-8'):
        s = line.strip()
        if s.startswith(k + '='):
            return s[len(k) + 1:]
    return ''

APP_KEY = getenv('ALIEXPRESS_APP_KEY')
APP_SECRET = getenv('ALIEXPRESS_APP_SECRET')
TRACK = getenv('ALIEXPRESS_TRACKING_ID') or 'promoninja'

def call(extra):
    params = {
        'app_key': APP_KEY, 'method': 'aliexpress.affiliate.hotproduct.query',
        'sign_method': 'sha256', 'timestamp': str(int(time.time() * 1000)),
        'target_currency': 'BRL', 'target_language': 'PT', 'ship_to_country': 'BR',
        'page_size': '30', 'page_no': '1', 'tracking_id': TRACK,
        'keywords': 'pen drive', 'sort': 'LAST_VOLUME_DESC',
    }
    params.update(extra)
    base = ''.join(k + params[k] for k in sorted(params))
    params['sign'] = hmac.new(APP_SECRET.encode(), base.encode(), hashlib.sha256).hexdigest().upper()
    url = 'https://api-sg.aliexpress.com/sync?' + urllib.parse.urlencode(params)
    return json.loads(urllib.request.urlopen(url, timeout=30).read().decode())

FIELDS = ('product_id,product_title,target_sale_price,target_original_price,evaluate_rate,'
          'lastest_volume,commission_rate,coupon_amount,coupon_start_time,coupon_end_time,'
          'coupon_remain_quantity,promo_code,product_main_image_url,promotion_link')

data = call({'fields': FIELDS})
if 'error_response' in data:
    er = data['error_response']
    print('Com fields deu erro:', er.get('sub_msg') or er.get('msg'), '-> tentando sem fields...')
    data = call({})

try:
    res = data['aliexpress_affiliate_hotproduct_query_response']['resp_result']['result']
    prods = res.get('products', {}).get('product', [])
except Exception as e:
    print('Estrutura inesperada:', e)
    print(json.dumps(data)[:1000])
    raise SystemExit

print('TOTAL produtos:', len(prods))
if prods:
    print('=== CAMPOS DISPONIVEIS (1o produto) ===')
    for k in sorted(prods[0].keys()):
        print('   ', k)
    cupom_keys = [k for k in prods[0].keys() if 'coupon' in k.lower() or 'promo_code' in k.lower()]
    print('=== CAMPOS DE CUPOM:', cupom_keys if cupom_keys else 'NENHUM')

    def temcupom(p):
        return any(str(p.get(k, '')).strip() not in ('', '0', 'None') for k in cupom_keys) if cupom_keys else False

    com = [p for p in prods if temcupom(p)]
    print('=== Produtos COM cupom:', len(com), 'de', len(prods))
    for p in com[:3]:
        print('   -', str(p.get('product_title'))[:45], '| R$', p.get('target_sale_price'),
              '|', {k: p.get(k) for k in cupom_keys})
