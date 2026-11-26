import { wikiAssets } from './wiki-assets.js';
import { wikiStocks, wikiCrypto } from './wiki-markets.js';
// Economy catalogue sourced from businessempire.fandom.com (real-world names normalized).
export const catalog = {
 businesses: [
 ['shop','Small retail shop',15000,500,'retail'],['taxi','Taxi company',30000,1100,'fleet'],['transport','Transportation company',75000,2500,'fleet'],['construction','Construction company',90000,1800,'project'],['it','IT company',120000,3000,'project'],['bank','Bank',500000,12000,'bank'],['clothing','Clothing brand',250000,8000,'retail'],['factory','Factory',400000,10000,'retail'],['dealer','Car dealership',300000,9000,'retail'],['shipping','Shipping company',1000000,30000,'fleet'],['oil','Oil and gas company',5000000,140000,'retail'],['sports','Sports club',750000,15000,'sports'],['holding','Holding company',10000000,400000,'retail'],['space','Space agency',20000000,600000,'project'],
 ['logistics_empire','Global Logistics Corp',2500000,85000,'fleet',true],['tech_conglomerate','Apex Tech Conglomerate',4000000,140000,'project',true],['aerospace_titan','Orbital Aerospace Group',50000000,1800000,'project',true]
 ].map(([id,name,price,income,kind,mergedOnly])=>({id,name,price,income,kind,maxLevel:50,mergedOnly:!!mergedOnly})),
 stocks:[
  ...[['gt','Global Technologies',150,0.12],['energy','Atlas Energy',80,0.2],['bankstock','Union Finance',50,0.18],['retailstock','Metro Retail',35,0.08]].map(([id,name,price,dividend])=>({id,name,price,dividend,legacy:true})),
  ...wikiStocks
 ],
 crypto: wikiCrypto,
 properties:[['apt','City apartment',40000,120],['office','Office building',250000,900],['hotel','Luxury hotel',1500000,6500],['tower','Skyscraper',12000000,42000]].map(([id,name,price,income])=>({id,name,price,income})),
 assets:[['car','Sports car',95000],['retro','Classic car',150000],['jet','Private jet',10000000],['yacht','Yacht',7000000],['mansion','Residence',2500000],['gem','Rare gemstone',500000],['landmark','Unique building',20000000]].map(([id,name,price])=>({id,name,price})),
 mergers:[
  {id:'logistics_empire',name:'Global Logistics Corp',requires:['taxi','transport','shipping'],level:3,cost:500000,duration:1800000},
  {id:'tech_conglomerate',name:'Apex Tech Conglomerate',requires:['it','construction','factory'],level:4,cost:800000,duration:2700000},
  {id:'holding',name:'Financial Holding Empire',requires:['bank','it','construction'],level:5,cost:1000000,duration:3600000},
  {id:'aerospace_titan',name:'Orbital Aerospace Group',requires:['oil','space','holding'],level:5,cost:5000000,duration:5400000}
 ],
 boosters:[{id:'double',name:'Double business income',mult:2,duration:21600000,scope:'business'},{id:'global',name:'Global business +30%',mult:1.3,duration:14400000,scope:'global'},{id:'special',name:'Special business +10%',mult:1.1,duration:14400000,scope:'business'}],
 wait:60000, startingCash:'100000', startingSlots:3, startingStorage:{garage:4,hangar:2,marina:2}
};

// Keep old IDs for existing saves; hide unowned demo entries in the UI.
for (const key of ['properties','assets']) {
  catalog[key] = [...catalog[key].map(x=>({...x,legacy:true})), ...wikiAssets.filter(x=>key==='properties'?x.category==='properties':x.category!=='properties')];
}

export function stockTotalShares(item) {
  if (!item) return 100000;
  if (item.totalShares) return item.totalShares;
  return Math.max(10000, Math.round(10000000 / Math.max(5, Number(item.price || 10))));
}

export function getOwnershipTier(pct) {
  if (pct >= 100) return { tier: 'Wholly Owned Subsidiary', badge: '100% SUBSIDIARY', divBonus: 0.40, next: null };
  if (pct >= 51) return { tier: 'Controlling Stake', badge: '51% CONTROL', divBonus: 0.25, next: 100 };
  if (pct >= 25) return { tier: 'Major Shareholder', badge: '25% MAJOR', divBonus: 0.12, next: 51 };
  if (pct >= 10) return { tier: 'Minority Stake', badge: '10% MINORITY', divBonus: 0.05, next: 25 };
  return { tier: 'Public Investor', badge: null, divBonus: 0, next: 10 };
}
