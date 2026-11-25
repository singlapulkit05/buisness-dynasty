import React, { useState } from 'react';
import GameArt from './GameArt.jsx';
import './asset-catalogue.css';

const categories = [
  ['cars', 'Cars', 'car'], ['retro', 'Retro cars', 'retro'],
  ['aircraft', 'Aircraft & jets', 'jet'], ['yachts', 'Yachts & boats', 'yacht'],
  ['islands', 'Private islands', 'property'], ['unique', 'Unique buildings & items', 'landmark'],
  ['residence', 'Residences', 'mansion'], ['coins', 'Coins', 'gem'],
  ['paintings', 'Paintings', 'assets'], ['jewels', 'Jewels', 'gem'],
  ['stamps', 'Stamps', 'assets'], ['nft', 'NFTs', 'assets'],
  ['insignias', 'Insignias', 'assets'], ['other', 'Other assets', 'assets']
];
const legacyGroups = { car:'cars', retro:'retro', jet:'aircraft', yacht:'yachts', mansion:'residence', gem:'jewels', landmark:'unique' };
const groupOf = item => item.category || legacyGroups[item.id] || 'other';
const countOwned = (items, owned) => items.filter(x => (owned[x.id] || 0) > 0).length;

export default function AssetCatalogue({ items = [], owned = {}, category, cash, act, money }) {
  const isProperty = category === 'properties';
  const visible = items.filter(x => !x.legacy || (owned[x.id] || 0) > 0);
  const [selected, select] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('price-up');
  const [filter, setFilter] = useState('all');
  const known = new Set(categories.map(x => x[0]));
  const extra = [...new Set(visible.map(groupOf))].filter(x => !known.has(x));
  const groups = [...categories, ...extra.map(x => [x, x.replace(/[-_]/g, ' '), 'assets'])];
  const groupItems = key => visible.filter(x => groupOf(x) === key);
  const scoped = isProperty || selected === 'all' ? visible : groupItems(selected);
  const filtered = scoped.filter(x => x.name.toLowerCase().includes(search.trim().toLowerCase()) &&
    (filter === 'all' || (filter === 'owned' ? (owned[x.id] || 0) > 0 : Number(cash) >= Number(x.price))));
  const compare = (a,b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'income' ? Number(b.income || 0) - Number(a.income || 0) : sort === 'price-down' ? Number(b.price) - Number(a.price) : Number(a.price) - Number(b.price);
  const displayGroups = isProperty || selected !== 'all' ? [[selected, '', '']] : groups;
  const choose = key => { select(key); setSearch(''); };
  return <div className="asset-catalogue">
    <div className="ac-heading"><div><h2>{isProperty ? 'Real estate' : 'Asset collections'}</h2><p>{countOwned(visible,owned)} / {visible.length} collected</p></div><GameArt id={isProperty ? 'property' : 'assets'}/></div>
    <div className="ac-progress" role="progressbar" aria-label="Collection completion" aria-valuenow={countOwned(visible,owned)} aria-valuemin={0} aria-valuemax={Math.max(1,visible.length)}><span style={{width: `${visible.length ? countOwned(visible,owned)/visible.length*100 : 0}%`}}/></div>
    {!isProperty && <div className="ac-category-grid" aria-label="Asset categories">
      <button className={'ac-category '+(selected==='all'?'ac-active':'')} aria-pressed={selected==='all'} onClick={()=>choose('all')}><GameArt id="assets"/><span>All assets<small>{visible.length} items</small></span></button>
      {groups.map(([key,label,icon])=>{const rows=groupItems(key);return <button key={key} className={'ac-category '+(selected===key?'ac-active':'')} aria-pressed={selected===key} onClick={()=>choose(key)}><GameArt id={icon}/><span>{label}<small>{countOwned(rows,owned)}/{rows.length} owned</small></span></button>})}
    </div>}
    <div className="ac-controls">
      <input type="search" aria-label="Search catalogue" placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="ac-selects"><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All items</option><option value="owned">Owned only</option><option value="affordable">Affordable</option></select></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="price-up">Price: low to high</option><option value="price-down">Price: high to low</option><option value="name">Name: A–Z</option>{isProperty&&<option value="income">Highest rent</option>}</select></label></div>
    </div>
    <p className="ac-result-count">{filtered.length} items found</p>
    {filtered.length===0 && <section className="ac-empty"><h3>{scoped.length ? 'No matching items' : 'No catalogue entries yet'}</h3><p>{scoped.length ? 'Try another search or filter.' : 'This category will populate when matching wiki records are imported.'}</p></section>}
    {displayGroups.map(([key,label])=>{
      const rows=(isProperty||selected!=='all'?filtered:filtered.filter(x=>groupOf(x)===key)).slice().sort(compare);
      if(!rows.length)return null;
      return <div className="ac-group" key={key}>{label&&<h3 className="ac-group-title">{label} <small>{rows.length}</small></h3>}
      {rows.map(x=>{const qty=owned[x.id]||0;return <section className="collection-card ac-card" key={x.id}>
        <GameArt id={x.id} item={x} wide/>
        <div className="ac-card-details"><div className="ac-card-name"><h3>{x.name}</h3>{qty>0&&<span className="ac-owned">Owned: {qty}</span>}</div><strong className="ac-price">{money(x.price)}</strong>{isProperty&&<p className="green">{money(x.income||0)}/hr rental income</p>}{x.legacy&&<p className="muted">Legacy item · demonstration price</p>}</div>
        <div className="buttons"><button disabled={Number(cash)<Number(x.price)} onClick={()=>act({type:'trade',category,item:x.id})}>Buy</button><button className="secondary" disabled={!qty} onClick={()=>act({type:'trade',category,item:x.id,sell:true})}>Sell</button></div>
      </section>})}</div>;
    })}
  </div>;
}
