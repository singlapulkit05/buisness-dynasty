"""Import factual catalogue rows from public wiki HTML or saved pages. No fabricated URLs."""
import argparse, json, re, hashlib, pathlib, urllib.parse, urllib.request
from bs4 import BeautifulSoup
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE='https://businessempire.fandom.com/wiki/'
PAGES={'Cars':'cars','Aircrafts':'aircraft','Yachts':'yachts','Real_Estate':'properties','Coins':'coins','Paintings':'paintings','Unique_Items':'unique','Jewels':'jewels','Stamps':'stamps','Insignias':'insignias','NFT':'nft','Islands':'islands','Retro_Cars':'retro'}
def number(s):
    s=s.strip().replace('\xa0',' ')
    m=re.fullmatch(r'\s*\$?\s*([\d,. ]+)\s*([KMBT])?\s*(?:/h(?:r)?)?\s*',s,re.I)
    if not m: return None
    v=m[1].replace(' ','').replace(',','')
    if re.fullmatch(r'\d+(?:\.\d{3})+',v): v=v.replace('.','')
    try: return float(v)*{'K':1e3,'M':1e6,'B':1e9,'T':1e12}.get((m[2] or '').upper(),1)
    except ValueError: return None

def ident(group,name,price):
    return 'wiki-'+group+'-'+hashlib.sha256(f'{name}|{float(price):.8f}'.encode()).hexdigest()[:16]
def extract(html,page,group):
    soup=BeautifulSoup(html,'html.parser'); out=[]; warnings=[]
    for table in soup.select('table'):
        cols=None
        for tr in table.select('tr'):
            cells=tr.find_all(['td','th'],recursive=False)
            if not cells: continue
            vals=[c.get_text(' ',strip=True) for c in cells]; lower=[v.lower() for v in vals]
            if any('price' in v or v=='cost' for v in lower) and any(c.name=='th' for c in cells):
                pi=next(i for i,v in enumerate(lower) if 'price' in v or v=='cost'); ni=next((i for i,v in enumerate(lower) if v in ('name','car','cars','aircrafts','aircraft','yacht','building','item','coin','painting','jewel','stamp','island','nft','insignia') or 'name' in v),None); ri=next((i for i,v in enumerate(lower) if 'rental income' in v),None); cols=(ni,pi,ri); continue
            if cols is None: continue
            ni,pi,ri=cols
            if pi>=len(vals): continue
            p=number(vals[pi]); name=vals[ni] if ni is not None and ni<len(vals) else next((v for i,v in enumerate(vals[:pi]) if v and not v.startswith('File:')), '')
            if p is None or p<=0 or not name or name.startswith('File:'): continue
            row={'id':ident(group,name,p),'name':name,'price':p,'category':group,'source':BASE+page}
            if group=='properties':
                income=number(vals[ri]) if ri is not None and ri<len(vals) else None
                if income is None: warnings.append(f'{name}: missing rental income'); continue
                row['income']=income
            for img in tr.select('img'):
                raw=img.get('data-src') or img.get('src') or ''
                u=urllib.parse.urljoin(BASE+page,raw)
                if urllib.parse.urlparse(u).scheme=='https' and 'static.wikia.nocookie.net'==urllib.parse.urlparse(u).hostname:
                    row['imageUrl']=u; break
            if 'imageUrl' not in row: warnings.append(f'{name}: no row image URL')
            out.append(row)
    return out,warnings

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--html-dir',type=pathlib.Path); ap.add_argument('--download-images',action='store_true',help='Only use if you have rights to redistribute/cache the images'); args=ap.parse_args()
    dest=ROOT/'shared/wiki-assets.js'; old=json.loads(dest.read_text().split('export const wikiAssets = ',1)[1].strip().rstrip(';')); rows={x['id']:x for x in old}; report={}
    for page,group in PAGES.items():
        try:
            if args.html_dir: html=(args.html_dir/(page+'.html')).read_text(encoding='utf8')
            else:
                with urllib.request.urlopen(urllib.request.Request(BASE+page,headers={'User-Agent':'BusinessDynastyCatalogue/1.0 (personal catalogue import)'}),timeout=20) as r: html=r.read().decode('utf8')
            found,warnings=extract(html,page,group)
            for row in found:
                previous=rows.get(row['id'],{}); rows[row['id']]={**previous,**row}
            report[page]={'parsed':len(found),'warnings':warnings}
        except Exception as e: report[page]={'error':str(e)}
    if args.download_images:
        folder=ROOT/'client/public/wiki-art'; folder.mkdir(parents=True,exist_ok=True)
        for row in rows.values():
            if not row.get('imageUrl'): continue
            try:
                with urllib.request.urlopen(row['imageUrl'],timeout=15) as r:
                    mime=r.headers.get_content_type(); ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}.get(mime)
                    if not ext: raise ValueError('Unsupported image MIME '+mime)
                    data=r.read(8_000_001)
                    if len(data)>8_000_000: raise ValueError('Image too large')
                filename=row['id']+'.'+ext; (folder/filename).write_bytes(data); row['localImage']='/wiki-art/'+filename
            except Exception as e: report.setdefault('imageErrors',[]).append({'id':row['id'],'error':str(e)})
    dest.write_text('export const wikiAssets = '+json.dumps(list(rows.values()),ensure_ascii=False,indent=2)+';\n'); (ROOT/'wiki-import-report.json').write_text(json.dumps(report,indent=2)); print(json.dumps({k: v.get('parsed',v.get('error')) for k,v in report.items() if isinstance(v,dict)},indent=2)); print('Total rows:',len(rows))
if __name__=='__main__': main()
