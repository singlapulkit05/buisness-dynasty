"""Fetch real Wikimedia/Wikipedia photos for all items in shared/wiki-assets.js."""
import concurrent.futures
import json
import pathlib
import re
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS_JS = ROOT / 'shared/wiki-assets.js'
OUT_DIR = ROOT / 'client/public/wiki-art'
UA = 'BusinessDynastyAssetFetcher/1.0 (https://github.com/example; dev@example.com)'

AIRCRAFT_ALIASES = {
    'Cezna 150': 'Cessna 150',
    'Robertson z44': 'Robinson R44',
    'Banansa D36': 'Beechcraft Bonanza',
    'Beach Cing Ayr D200 GD': 'Beechcraft King Air',
    'Liardjet 60': 'Learjet 60',
    'AeroBus Helicopter F130': 'Airbus Helicopters H130',
    'Havvker 900hp': 'Hawker 900XP',
    'Bil 429': 'Bell 429',
    'Honta Jet MA-430': 'HondaJet',
    'Havvker 400XP': 'Hawker 400',
    'Bombordyr Chalenge 300': 'Bombardier Challenger 300',
    'Cezna Cituation XLZ+': 'Cessna Citation XLS',
    'AeroBus H260': 'Airbus Helicopters H160',
    'Augusta CW 149': 'AgustaWestland AW149',
    'Golfstrym D550': 'Gulfstream G550',
    'AeroBus ACG320': 'Airbus ACJ320',
    'AeroBus 480 Prestige': 'Airbus A380',
}

YACHT_ALIASES = {
    'MundoMarine': 'Mondomarine yacht',
    'Pelorius': 'Pelorus yacht',
    'Al Saed': 'Al Said yacht',
    'Redyant': 'Radiant yacht',
    'Serenna': 'Serene yacht',
    'Abu Dhabi': 'Azzam yacht',
    'Motor Yacht A': 'Motor Yacht A',
    'C+ (Emerald)': 'Eclipse yacht',
    'Ozam': 'Azzam yacht',
    'Sunset': 'Superyacht',
    'History Ultimate': 'History Supreme yacht',
    'Hydrogen Prime': 'Aqua superyacht',
    'Project Steel': 'Oceanco superyacht',
    'Garden': 'Superyacht',
}


def clean_query(row):
    name = row['name']
    cat = row['category']
    if cat == 'aircraft' and name in AIRCRAFT_ALIASES:
        return AIRCRAFT_ALIASES[name]
    if cat == 'yachts' and name in YACHT_ALIASES:
        return YACHT_ALIASES[name]
    if cat == 'properties':
        q = re.sub(r'\s*\([^)]*\)', '', name)
        q = re.sub(r'[_\d]+$', '', q).strip()
        q = q.replace('Brasil', 'Brazil').replace(',', ', ')
        return q
    # cars
    q = re.sub(r'\b(Old|I)\b', '', name).strip()
    q = re.sub(r'\s+', ' ', q)
    return q


def get_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=12) as r:
        return json.loads(r.read().decode('utf8'))


def find_image_url(query, cat):
    # 1. Try Wikipedia search + pageimages
    qs = urllib.parse.urlencode({
        'action': 'query',
        'generator': 'search',
        'gsrsearch': query,
        'gsrlimit': 3,
        'prop': 'pageimages',
        'pithumbsize': 640,
        'format': 'json',
    })
    try:
        data = get_json(f'https://en.wikipedia.org/w/api.php?{qs}')
        pages = sorted(
            data.get('query', {}).get('pages', {}).values(),
            key=lambda p: p.get('index', 999),
        )
        for p in pages:
            src = p.get('thumbnail', {}).get('source')
            if src and not src.lower().endswith('.svg'):
                return src
    except Exception:
        pass

    # 2. Fallback: Wikimedia Commons file search
    suffix = {'cars': ' car', 'aircraft': ' aircraft', 'yachts': ' yacht', 'properties': ' skyline'}
    qs2 = urllib.parse.urlencode({
        'action': 'query',
        'generator': 'search',
        'gsrnamespace': 6,
        'gsrsearch': query + suffix.get(cat, ''),
        'gsrlimit': 4,
        'prop': 'imageinfo',
        'iiprop': 'url|mime',
        'iiurlwidth': 640,
        'format': 'json',
    })
    try:
        data = get_json(f'https://commons.wikimedia.org/w/api.php?{qs2}')
        pages = sorted(
            data.get('query', {}).get('pages', {}).values(),
            key=lambda p: p.get('index', 999),
        )
        for p in pages:
            info = (p.get('imageinfo') or [{}])[0]
            mime = info.get('mime', '')
            if mime in ('image/jpeg', 'image/png', 'image/webp'):
                return info.get('thumburl') or info.get('url')
    except Exception:
        pass

    return None


def process_row(row):
    # Check if already downloaded
    existing = list(OUT_DIR.glob(f"{row['id']}.*"))
    if existing:
        row['localImage'] = '/wiki-art/' + existing[0].name
        return True

    q = clean_query(row)
    url = find_image_url(q, row['category'])
    if not url:
        return False

    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=15) as r:
            mime = r.headers.get_content_type()
            ext = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp',
            }.get(mime)
            if not ext:
                return False
            data = r.read(4_000_001)
            if len(data) > 4_000_000 or len(data) < 500:
                return False
        filename = f"{row['id']}.{ext}"
        (OUT_DIR / filename).write_bytes(data)
        row['localImage'] = '/wiki-art/' + filename
        return True
    except Exception:
        return False


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = json.loads(
        ASSETS_JS.read_text().split('export const wikiAssets = ', 1)[1].strip().rstrip(';')
    )
    ok = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(process_row, rows))
    ok = sum(1 for r in results if r)
    ASSETS_JS.write_text(
        'export const wikiAssets = ' + json.dumps(rows, ensure_ascii=False, indent=2) + ';\n'
    )
    missing = [(r['category'], r['name']) for r, res in zip(rows, results) if not res]
    print(f'Downloaded/linked {ok}/{len(rows)} images. Missing: {len(missing)}')
    if missing[:20]:
        print('Sample missing:', missing[:20])


if __name__ == '__main__':
    main()
