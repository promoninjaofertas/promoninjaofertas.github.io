# DIAGNOSTICO 2 (so leitura): testa os endpoints de PROMOCOES/cupons da API.
# Nao altera nada.
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

def call(method, extra):
    params = {'app_key': APP_KEY, 'method': method, 'sign_method': 'sha256',
              'timestamp': str(int(time.time() * 1000))}
    params.update(extra)
    base = ''.join(k + params[k] for k in sorted(params))
    params['sign'] = hmac.new(APP_SECRET.encode(), base.encode(), hashlib.sha256).hexdigest().upper()
    url = 'https://api-sg.aliexpress.com/sync?' + urllib.parse.urlencode(params)
    return json.loads(urllib.request.urlopen(url, timeout=30).read().decode())

# 1) Lista de promocoes disponiveis
print('===== 1) featuredpromo.get (promocoes disponiveis) =====')
promo_name = None
d1 = call('aliexpress.affiliate.featuredpromo.get', {'fields': 'promo_name,promo_desc,product_num'})
if 'error_response' in d1:
    er = d1['error_response']
    print('ERRO (sem acesso?):', er.get('code'), er.get('sub_msg') or er.get('msg'))
else:
    try:
        promos = d1['aliexpress_affiliate_featuredpromo_get_response']['resp_result']['result']['promos']['promo']
        for p in promos:
            nome = p.get('promo_name')
            print('  -', nome, '| produtos:', p.get('product_num'), '|', str(p.get('promo_desc'))[:40])
            if promo_name is None:
                promo_name = nome
        cupons = [p.get('promo_name') for p in promos if 'coupon' in str(p.get('promo_name')).lower() or 'cupom' in str(p.get('promo_desc')).lower()]
        print('  >> Promocoes que parecem ser de CUPOM:', cupons if cupons else 'nenhuma obvia')
    except Exception as e:
        print('Estrutura inesperada:', e, json.dumps(d1)[:600])

# 2) Produtos de uma promocao + checar campos de cupom
print()
print('===== 2) featuredpromo.products.get (produtos da 1a promo) =====')
if not promo_name:
    print('Sem promo_name pra testar (passo 1 nao retornou).')
else:
    print('Usando promo_name =', promo_name)
    FIELDS = ('product_id,product_title,target_sale_price,target_original_price,evaluate_rate,'
              'lastest_volume,commission_rate,coupon_amount,coupon_start_time,coupon_end_time,'
              'promo_code,discount,promotion_link')
    d2 = call('aliexpress.affiliate.featuredpromo.products.get', {
        'promotion_name': promo_name, 'fields': FIELDS,
        'target_currency': 'BRL', 'target_language': 'PT', 'country': 'BR',
        'page_size': '20', 'page_no': '1', 'tracking_id': TRACK})
    if 'error_response' in d2:
        er = d2['error_response']
        print('ERRO:', er.get('code'), er.get('sub_msg') or er.get('msg'))
    else:
        try:
            res = d2['aliexpress_affiliate_featuredpromo_products_get_response']['resp_result']['result']
            prods = res.get('products', {}).get('product', [])
            print('TOTAL produtos:', len(prods))
            if prods:
                print('CAMPOS:', sorted(prods[0].keys()))
                cupom = [k for k in prods[0].keys() if 'coupon' in k.lower() or 'promo_code' in k.lower()]
                print('CAMPOS DE CUPOM:', cupom if cupom else 'NENHUM')
        except Exception as e:
            print('Estrutura inesperada:', e, json.dumps(d2)[:600])
