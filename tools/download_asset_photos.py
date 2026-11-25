#!/usr/bin/env python3
"""Discover and download openly licensed reference photos from Wikimedia Commons.
Candidate mappings are hypotheses, not original game artwork. No economy changes.
"""
import argparse, csv, html, io, json, re, time, zipfile
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from PIL import Image, ImageOps
ROOT=Path(__file__).resolve().parents[1]
API='https://commons.wikimedia.org/w/api.php'
REPORT=ROOT/'photo-candidates.json'
REVIEW=ROOT/'photo-review.csv'
INDEX=ROOT/'client/src/asset-images.json'
ART=ROOT/'client/public/asset-photos'
AGENT='BusinessDynastyAssetPhotoTool/1.0 (interactive personal game asset reference tool)'
Image.MAX_IMAGE_PIXELS=30_000_000

def fetch(url, limit=12_000_000):
    with urlopen(Request(url,headers={'User-Agent':AGENT}),timeout=25) as r:
        b=r.read(limit+1)
        if len(b)>limit: raise ValueError('Response too large')
        return b

def api(**params):
    return json.loads(fetch(API+'?'+urlencode({'format':'json','formatversion':2,**params})))

def plain(x):
    return html.unescape(re.sub('<[^>]*>',' ',str(x))).strip()

def approved_license(s):
    return bool(re.fullmatch(r'(?:CC0(?: 1\.0)?|Public domain|CC BY(?:-SA)? [1-4]\.0)',s,re.I))

def catalogue():
    text=(ROOT/'shared/wiki-assets.js').read_text()
    rows=json.loads(text.split('export const wikiAssets = ',1)[1].strip().rstrip(';'))
    if any(not re.fullmatch(r'[A-Za-z0-9_-]+',x['id']) for x in rows): raise ValueError('Unsafe catalogue ID')
    return rows

def candidates(query):
    result=api(action='query',generator='search',gsrnamespace=6,gsrsearch=query,gsrlimit=6,prop='imageinfo',iiprop='url|mime|extmetadata',iiurlwidth=640)
    out=[]
    for p in sorted(result.get('query',{}).get('pages',[]),key=lambda p:p.get('index',999)):
        inf=(p.get('imageinfo') or [{}])[0]; m=inf.get('extmetadata',{})
        val=lambda k: plain(m.get(k,{}).get('value',''))
        lic=val('LicenseShortName'); url=inf.get('thumburl') or inf.get('url','')
        if not approved_license(lic) or inf.get('mime') not in ('image/jpeg','image/png','image/webp'): continue
        if urlparse(url).scheme!='https' or urlparse(url).hostname not in ('upload.wikimedia.org','thumb.wikimedia.org'): continue
        out.append(dict(title=p['title'],url=url,source=inf.get('descriptionurl',''),license=lic,licenseUrl=val('LicenseUrl'),author=val('Artist') or val('Credit')))
    return out

def discover(rows, include_locations):
    mappings=json.loads((ROOT/'tools/photo_queries.json').read_text()); results=[]; cache={}
    for i,r in enumerate(rows,1):
        name=r['name']; cat=r['category']; q=mappings.get(name); kind='model candidate'
        if cat=='properties':
            q=(re.sub(r'\s*\([^)]*\)|[\d_]+$','',name).strip()+' architecture building exterior') if include_locations else None
            kind='representative location only'
        if not q:
            results.append(dict(id=r['id'],name=name,category=cat,query='',kind='manual identification needed',candidates=[]));continue
        print(f'[{i}/{len(rows)}] {name}: {q}',flush=True)
        error=''
        try:
            if q not in cache:
                cache[q]=candidates(q);time.sleep(.7)
            found=cache[q]
        except Exception as e: found=[];error=str(e)
        results.append(dict(id=r['id'],name=name,category=cat,query=q,kind=kind,candidates=found,error=error))
        REPORT.write_text(json.dumps(results,ensure_ascii=False,indent=2))
    REPORT.write_text(json.dumps(results,ensure_ascii=False,indent=2))
    with REVIEW.open('w',newline='',encoding='utf-8') as f:
        w=csv.writer(f);w.writerow(['id','name','category','match_type','query','selected_candidate','candidate_1','candidate_2','candidate_3','candidate_4','candidate_5','candidate_6'])
        for r in results: w.writerow([r['id'],r['name'],r['category'],r['kind'],r['query'],'',*[x['source'] for x in r['candidates']]])
    # Contact sheet: click a photo to inspect its source. Enter selected numbers in CSV.
    blocks=[]
    for r in results:
        cards=''.join(f'<a href="{html.escape(c["source"],quote=True)}" target="_blank" rel="noopener"><img loading="lazy" src="{html.escape(c["url"],quote=True)}"><b>{i}. {html.escape(c["title"])}</b><small>{html.escape(c["license"])}</small></a>' for i,c in enumerate(r['candidates'],1))
        blocks.append(f'<section><h2>{html.escape(r["name"])}</h2><p>{html.escape(r["kind"]+" · "+r["query"]+" · "+r.get("error",""))}</p><div>{cards or "No candidates"}</div></section>')
    (ROOT/'photo-review.html').write_text('<!doctype html><meta charset="utf-8"><title>Photo review</title><style>body{font:16px system-ui;margin:24px;background:#f5f7fa;color:#182b35}section{background:white;padding:16px;margin:12px 0;border-radius:12px}section div{display:flex;gap:12px;flex-wrap:wrap}a{width:200px;color:inherit}img{width:200px;height:135px;object-fit:contain}b,small{display:block;overflow-wrap:anywhere}</style><h1>Review candidate photos</h1><p>Open source pages and check actual model and licence. Enter candidate numbers in photo-review.csv. Location images are illustrative only.</p>'+''.join(blocks))
    print(f'Discovered candidates for {sum(bool(r["candidates"]) for r in results)}/{len(rows)} items. Review photo-review.html and photo-review.csv.')

def download(rows, auto):
    results=json.loads(REPORT.read_text()); valid={r['id'] for r in rows}; choices={}
    if REVIEW.exists():
        with REVIEW.open(newline='',encoding='utf-8') as f:
            for r in csv.DictReader(f):
                if r['selected_candidate'].strip(): choices[r['id']]=int(r['selected_candidate'])
    index=json.loads(INDEX.read_text()) if INDEX.exists() else {};ART.mkdir(parents=True,exist_ok=True); INDEX.parent.mkdir(parents=True,exist_ok=True)
    errors=[]
    for r in results:
        id=r['id']; cs=r['candidates']; n=choices.get(id)
        if id not in valid or not cs: continue
        if n is None and auto and r['kind']=='model candidate': n=1
        if n is None: continue
        if not 1<=n<=len(cs): errors.append({'id':id,'error':'Invalid candidate selection'});continue
        c=cs[n-1]
        if not approved_license(c['license']): continue
        try:
            if urlparse(c['url']).scheme!='https' or urlparse(c['url']).hostname not in ('upload.wikimedia.org','thumb.wikimedia.org'): raise ValueError('Unsupported image host')
            filename=id+'.webp'; path=ART/filename
            with Image.open(io.BytesIO(fetch(c['url']))) as im:
                im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((640,480));im.save(path,'WEBP',quality=85)
            index[id]={**c,'file':'asset-photos/'+filename,'name':r['name'],'matchType':r['kind'],'reviewed':id in choices}
            INDEX.write_text(json.dumps(index,ensure_ascii=False,indent=2));print('Saved',r['name'],flush=True);time.sleep(.4)
        except Exception as e: errors.append({'id':id,'error':str(e)});print('Failed',r['name'],e)
    INDEX.write_text(json.dumps(index,ensure_ascii=False,indent=2))
    credits=ROOT/'client/public/asset-photo-credits.json';credits.write_text(json.dumps(index,ensure_ascii=False,indent=2))
    (ROOT/'photo-download-report.json').write_text(json.dumps({'downloaded':len(index),'missing':[r['name'] for r in rows if r['id'] not in index],'errors':errors},indent=2))
    archive=ROOT/'business-dynasty-photos.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for p in [INDEX,credits,ROOT/'client/src/GameArt.jsx',ROOT/'photo-download-report.json',*ART.glob('*.webp')]:
            if p.is_file(): z.write(p,p.relative_to(ROOT))
    print(f'{len(index)}/{len(rows)} images indexed. ZIP: {archive}')

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--discover',action='store_true');p.add_argument('--download',action='store_true');p.add_argument('--auto-vehicles',action='store_true',help='Use first candidate for mapped vehicles; not verified, review before publishing');p.add_argument('--include-locations',action='store_true',help='Search for illustrative location photos, not exact buildings');a=p.parse_args()
    rows=catalogue()
    if a.discover: discover(rows,a.include_locations)
    if a.download: download(rows,a.auto_vehicles)
    if not (a.discover or a.download): p.error('Choose --discover and/or --download')
