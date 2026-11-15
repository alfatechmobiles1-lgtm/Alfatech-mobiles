"""One-off: add Samsung + OPPO from the 16 Nov 2026 rate lists. Price = MOP. DP is never published."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
f = root / 'public/catalog.json'
c = json.loads(f.read_text(encoding='utf-8'))
c['models'] = [m for m in c['models'] if m['brand'] not in ('Samsung', 'OPPO')]

def V(label, price, **k):
    vid = label.lower().replace('gb', '').replace(' + ', '-').replace('+', '-').replace(' ', '').replace('(', '').replace(')', '')
    return dict(id=vid, label=label, price=price, mrp=None, stock=True, **k)

def M(brand, mid, name, variants, note=''):
    return dict(id=mid, brand=brand, name=name, display='', chip='', cam='', front='', batt='', os='Android',
                highlights='', src='', colours=[], variants=variants, hidden=False,
                offers=['Price is MOP (market operating price). Card offers and EMI: ask at the shop.'] , photoNote='Photo coming soon')

S, O = 'Samsung', 'OPPO'
sam = [
 M(S,'samsung-galaxy-z-fold8','Samsung Galaxy Z Fold8 5G',[V('12GB + 256GB',179999),V('12GB + 512GB',199999)]),
 M(S,'samsung-galaxy-z-fold8-ultra','Samsung Galaxy Z Fold8 Ultra 5G',[V('256GB',199999),V('512GB',219999)]),
 M(S,'samsung-galaxy-z-flip8','Samsung Galaxy Z Flip8 5G',[V('12GB + 256GB',124999)]),
 M(S,'samsung-galaxy-z-fold7','Samsung Galaxy Z Fold7 5G',[V('12GB + 256GB',174999)]),
 M(S,'samsung-galaxy-z-flip7-fe','Samsung Galaxy Z Flip7 FE 5G',[V('256GB',95999)]),
 M(S,'samsung-galaxy-s26-ultra','Samsung Galaxy S26 Ultra 5G',[V('256GB',154999),V('1TB',214999)]),
 M(S,'samsung-galaxy-s26','Samsung Galaxy S26 5G',[V('12GB + 256GB',102999)]),
 M(S,'samsung-galaxy-s26-fe','Samsung Galaxy S26 FE 5G',[V('256GB',71999,hidden=True)]),
 M(S,'samsung-galaxy-s25-ultra','Samsung Galaxy S25 Ultra 5G',[V('256GB',119999)]),
 M(S,'samsung-galaxy-s25','Samsung Galaxy S25 5G',[V('12GB + 256GB',84999)]),
 M(S,'samsung-galaxy-s25-fe','Samsung Galaxy S25 FE 5G',[V('512GB',77999)]),
 M(S,'samsung-galaxy-a57','Samsung Galaxy A57 5G',[V('256GB',62999),V('12GB + 256GB',72499)]),
 M(S,'samsung-galaxy-a37','Samsung Galaxy A37 5G',[V('8GB + 128GB',46999),V('256GB',54499),V('12GB + 256GB',63999)]),
 M(S,'samsung-galaxy-a36','Samsung Galaxy A36 5G',[V('12GB + 256GB',46499)]),
 M(S,'samsung-galaxy-a27','Samsung Galaxy A27 5G',[V('6GB + 128GB',35999),V('8GB + 128GB',40999),V('8GB + 256GB',47499)]),
 M(S,'samsung-galaxy-a17','Samsung Galaxy A17 5G',[V('6GB + 128GB',27999),V('6GB + 128GB (TA)',29999),V('8GB + 128GB',30999)]),
 M(S,'samsung-galaxy-a07','Samsung Galaxy A07',[V('4GB + 128GB',20999)]),
]
opp = [
 M(O,'oppo-a6c','OPPO A6c 4G',[V('4GB + 64GB',17999)]),
 M(O,'oppo-a6x','OPPO A6x 5G',[V('4GB + 64GB',19999),V('4GB + 128GB',23999),V('6GB + 128GB',26999)]),
 M(O,'oppo-a6s','OPPO A6s',[V('4GB + 128GB',24999),V('6GB + 128GB',27999)]),
 M(O,'oppo-a6','OPPO A6',[V('4GB + 128GB',29999),V('6GB + 128GB',31999),V('6GB + 256GB',35999)]),
 M(O,'oppo-a6-pro','OPPO A6 Pro',[V('8GB + 128GB',32999),V('8GB + 256GB',35999)]),
 M(O,'oppo-f33-pro','OPPO F33 Pro 5G',[V('8GB + 128GB',39999),V('8GB + 256GB',43999)]),
 M(O,'oppo-f35','OPPO F35 5G',[V('6GB + 128GB',38999),V('8GB + 128GB',42999)]),
 M(O,'oppo-f35-pro','OPPO F35 Pro 5G',[V('6GB + 128GB',45999),V('8GB + 128GB',49999),V('8GB + 256GB',54999)]),
 M(O,'oppo-reno16-c','OPPO Reno16 C 5G',[V('8GB + 128GB',52999),V('8GB + 256GB',57999),V('12GB + 256GB',62999)]),
 M(O,'oppo-reno16','OPPO Reno16 5G',[V('8GB + 256GB',72999),V('12GB + 256GB',79999)]),
 M(O,'oppo-find-x9s','OPPO Find X9s 5G',[V('12GB + 256GB',84999),V('12GB + 512GB',94999)]),
 M(O,'oppo-k14x','OPPO K14x 5G',[V('4GB + 64GB',18999),V('4GB + 128GB',21999),V('6GB + 128GB',24999)]),
 M(O,'oppo-k14','OPPO K14 5G',[V('6GB + 128GB',25999),V('6GB + 256GB',28999)]),
]
for m in sam + opp:
    ids = [v['id'] for v in m['variants']]
    assert len(ids) == len(set(ids)), m['id']
    for v in m['variants']:
        if v['id'].endswith('(ta)'): v['id'] = v['id'].replace('(ta)', 'ta')
        v['id'] = v['id'].replace('(', '').replace(')', '')
# keep brand order: Apple, Samsung, Redmi, Motorola, vivo, OPPO
order = {'Apple': 0, 'Samsung': 1, 'Redmi': 2, 'Motorola': 3, 'vivo': 4, 'OPPO': 5}
c['models'] += sam + opp
c['models'].sort(key=lambda m: order[m['brand']])
c['updated'] = '2026-11-16'
f.write_text(json.dumps(c, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(c['models']), sum(len(m['variants']) for m in c['models']))
