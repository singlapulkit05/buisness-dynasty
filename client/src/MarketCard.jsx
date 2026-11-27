import GameArt from './GameArt.jsx';
import React,{useState,useEffect,useId} from 'react';
import Decimal from 'decimal.js';
import {price} from '../../shared/engine.js';
import {stockTotalShares,getOwnershipTier} from '../../shared/catalog.js';
import {money} from '../../shared/format.js';
import {api} from './storage.js';
const ranges={'1D':24,'1W':168,'1M':720,'3M':2160,'1Y':8760};
export default function MarketCard({item,category,owned,costBasis,watched,orders,at,cash,act,online=true,liveQuote=null,onCloudUpdate}){
 const [range,R]=useState('1W'),[side,S]=useState('buy'),[orderKind,K]=useState('market'),[targetP,TP]=useState(''),[mode,M]=useState('qty'),[qty,Q]=useState('1'),[usd,U]=useState('1000'),[hover,H]=useState(null),[candles,setCandles]=useState([]),[tradeBusy,setTradeBusy]=useState(false),[tradeMsg,setTradeMsg]=useState(''); const id=useId().replace(/:/g,'');

 useEffect(()=>{
  if(!online)return;
  let alive=true;
  api(`/market/history/${category}/${item.id}`).then(res=>{if(alive&&Array.isArray(res.candles))setCandles(res.candles)}).catch(()=>{});
  return()=>{alive=false};
 },[item.id,category,online,liveQuote?.tickId]);

 const hours=ranges[range],end=Math.floor(at/3600000)*3600000, count=Math.min(hours,120);
 const basePoints=Array.from({length:count+1},(_,i)=>{const t=end-Math.round(hours*(1-i/count))*3600000;return {t,v:Number(price(item,t))}});
 const points=range==='1D'&&candles.length>=2?candles.map(c=>({t:c.t,v:Number(c.c)})):basePoints;
 const ptCount=Math.max(1,points.length-1);
 const current=liveQuote?Number(liveQuote.price):points.at(-1).v;
 const first=points[0].v, change=first>0?(current/first-1)*100:0, up=change>=0, color=up?'#087f5b':'#c24141';
 const min=Math.min(...points.map(p=>p.v)),max=Math.max(...points.map(p=>p.v)),pad=Math.max((max-min)*.12,max*.005,.00001),lo=min-pad,hi=max+pad;
 const X=i=>8+i/ptCount*254,Y=v=>12+(hi-v)/(hi-lo)*112;
 const line=points.map((p,i)=>`${i?'L':'M'}${X(i).toFixed(2)},${Y(p.v).toFixed(2)}`).join(' ');
 const activeIdx=Math.min(ptCount,Math.max(0,hover??ptCount));
 const selected=points[activeIdx]||points[points.length-1];
 const totalShares=category==='stocks'?stockTotalShares(item):null;
 const reservedShares=(orders||[]).filter(o=>o.side==='buy').reduce((sum,o)=>sum+o.qty,0);
 const maxAvailable=totalShares!==null?Math.max(0,totalShares-owned-reservedShares):1000000;
 const ownPct=totalShares?((owned/totalShares)*100):0;
 const tier=totalShares?getOwnershipTier(ownPct):null;
 const limit=side==='buy'?Math.max(0,Math.min(maxAvailable,Number(new Decimal(cash).div(current).floor()))):Math.min(1000000,owned);
 const effectiveQty=mode==='qty'?(/^\d+$/.test(qty)?Number(qty):0):(Number(usd)>0?Math.min(1000000,Math.floor(Number(usd)/current)):0);
 const valid=effectiveQty>0&&effectiveQty<=1000000&&effectiveQty<=limit;
 const total=new Decimal(current).times(effectiveQty);
 const cost=Number(costBasis||0),holdVal=current*owned,pnl=holdVal-cost,pnlPct=cost>0?(pnl/cost*100):0;
 const presets=[1,10,100,1000];
 const usdPresets=[100,1000,10000,100000];
 async function submitLiveTrade(){
  if(!online||tradeBusy)return;
  setTradeBusy(true);setTradeMsg('');
  try{
   if(orderKind==='market'){
    const res=await api('/market/trade',{category,item:item.id,qty:effectiveQty,sell:side==='sell'});
    if(onCloudUpdate&&res.cloud)await onCloudUpdate(res.cloud);
    setTradeMsg(`${side==='buy'?'Bought':'Sold'} ${effectiveQty} @ ${money(res.fill.price)}`);
   }else{
    const res=await api('/market/orders',{category,item:item.id,side,kind:orderKind,targetPrice:Number(targetP),qty:effectiveQty});
    if(onCloudUpdate&&res.cloud)await onCloudUpdate(res.cloud);
    setTradeMsg(res.filled?`Order filled @ ${money(res.price)}`:`${orderKind.toUpperCase()} ${side} placed`);
   }
  }catch(e){setTradeMsg(e.message)}finally{setTradeBusy(false)}
 }
 async function cancelLiveOrder(orderId){
  if(!online||tradeBusy)return;
  setTradeBusy(true);setTradeMsg('');
  try{
   const res=await api('/market/orders/'+orderId,undefined,'DELETE');
   if(onCloudUpdate&&res.cloud)await onCloudUpdate(res.cloud);
   setTradeMsg('Order cancelled');
  }catch(e){setTradeMsg(e.message)}finally{setTradeBusy(false)}
 }
 return <section className="market-card"><div className="line"><div className="art-heading"><GameArt id={item.id}/><div><span className="eyebrow">{category==='stocks'?'EQUITY':'DIGITAL ASSET'} · {online&&liveQuote?<span className="green">LIVE</span>:<span className="negative">OFFLINE QUOTE</span>}</span><h3>{item.name}</h3></div></div><div className="line" style={{gap:6}}><button className="secondary small" onClick={()=>act({type:'toggleWatchlist',item:item.id})}>{watched?'★ Watched':'☆ Watch'}</button><span className="tag">{owned.toLocaleString()} owned</span></div></div><div className="market-price">{money(current)}</div><div className={up?'green':'negative'}>{up?'+':''}{change.toFixed(2)}% <span className="muted">· {range}{liveQuote?.updatedAt?` · ${new Date(liveQuote.updatedAt).toLocaleTimeString()}`:''}</span></div>{owned>0&&cost>0&&<div className={pnl>=0?'green':'negative'} style={{fontSize:13,marginTop:4}}>P&amp;L: {pnl>=0?'+':''}{money(pnl)} ({pnl>=0?'+':''}{pnlPct.toFixed(2)}%)</div>}
 <div className="range-tabs">{Object.keys(ranges).map(r=><button key={r} className={range===r?'active':''} onClick={()=>{R(r);H(null)}}>{r}</button>)}</div>
 <div className="chart-readout">{new Date(selected.t).toLocaleString()} · <b>{money(selected.v)}</b></div>
 <svg className="market-chart" viewBox="0 0 350 154" role="img" aria-label={`${item.name} simulated price history over ${range}`} onPointerMove={e=>{const b=e.currentTarget.getBoundingClientRect();H(Math.max(0,Math.min(ptCount,Math.round(((e.clientX-b.left)/b.width*350-8)/254*ptCount))))}} onPointerLeave={()=>H(null)}>
 <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".17"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
 {[0,1,2,3].map(i=>{const v=hi-(hi-lo)*i/3,y=Y(v);return <g key={i}><line x1="8" x2="262" y1={y} y2={y} stroke="#e1e7ed" strokeDasharray="3 3"/><text x="270" y={y+4} fontSize="9" fill="#64748b">{money(v)}</text></g>})}
 <path d={`${line} L262,124 L8,124 Z`} fill={`url(#${id})`}/><path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
 <line x1={X(activeIdx)} x2={X(activeIdx)} y1="12" y2="124" stroke={color} strokeDasharray="3 3"/><circle cx={X(activeIdx)} cy={Y(selected.v)} r="3" fill={color}/>
 {[0,.5,1].map((f,i)=><text key={i} x={8+254*f} y="145" textAnchor={i===0?'start':i===2?'end':'middle'} fontSize="9" fill="#64748b">{new Date((points[Math.round(ptCount*f)]||selected).t).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</text>)}
 </svg><p className="muted">Simulated market · hourly price changes {item.dividend?' · Dividend '+money(item.dividend)+'/hr per share':''}</p>
 {tier&&<div style={{margin:'8px 0 12px',padding:'10px 12px',background:'#f8fafc',borderRadius:10,border:'1px solid #e2e8f0'}}>
   <div className="line"><span className="eyebrow">OWNERSHIP &amp; ACQUISITION</span><span className="tag">{tier.tier}</span></div>
   <div className="profile-kv"><span>Equity Stake</span><strong>{owned.toLocaleString()} / {totalShares.toLocaleString()} ({ownPct.toFixed(2)}%)</strong></div>
   {tier.divBonus>0&&<div className="profile-kv"><span>Control Dividend Bonus</span><strong className="green">+{(tier.divBonus*100).toFixed(0)}%</strong></div>}
   {tier.next&&<progress max={tier.next} value={Math.min(tier.next,ownPct)} style={{width:'100%',marginTop:4}}/>}
 </div>}
 <div className="trade-tabs"><button className={side==='buy'?'active':''} onClick={()=>{S('buy');Q('1')}}>Buy</button><button className={side==='sell'?'active':''} onClick={()=>{S('sell');Q('1')}}>Sell</button></div>
 <div className="trade-tabs"><button className={orderKind==='market'?'active':''} onClick={()=>K('market')}>Market</button><button className={orderKind==='limit'?'active':''} onClick={()=>{K('limit');TP(String(current))}}>Limit</button><button className={orderKind==='stop'?'active':''} onClick={()=>{K('stop');TP(String(current))}}>Stop</button></div>
 {orderKind!=='market'&&<label>Target Price ($)<input type="number" min="0.01" step="any" value={targetP} onChange={e=>TP(e.target.value)}/></label>}
 <div className="trade-tabs"><button className={mode==='qty'?'active':''} onClick={()=>M('qty')}>By {category==='stocks'?'shares':'units'}</button><button className={mode==='usd'?'active':''} onClick={()=>M('usd')}>By custom $ amount</button></div>
 {mode==='qty'?<><label>Quantity ({category==='stocks'?'shares':'units'})<input type="number" min="1" max="1000000" step="1" inputMode="numeric" value={qty} onChange={e=>Q(e.target.value)}/></label><div className="quantity-tabs">{presets.map(n=><button key={n} className={Number(qty)===n?'active':''} disabled={n>limit} onClick={()=>Q(String(n))}>{n.toLocaleString()}</button>)}<button disabled={!limit} onClick={()=>Q(String(limit))}>Max</button></div></>:<><label>Custom amount (USD)<input type="number" min="1" step="any" inputMode="decimal" value={usd} onChange={e=>U(e.target.value)}/></label><div className="quantity-tabs">{usdPresets.map(n=><button key={n} className={Number(usd)===n?'active':''} onClick={()=>U(String(n))}>${n>=1000?`${n/1000}K`:n}</button>)}<button disabled={!limit} onClick={()=>U(String(new Decimal(current).times(limit).toDecimalPlaces(2)))}>Max</button></div></>}
 <div className="line trade-total"><span>{effectiveQty.toLocaleString()} {category==='stocks'?'shares':'units'} · {side==='buy'?'Cost':'Proceeds'}</span><strong>{money(orderKind==='market'?total:new Decimal(Number(targetP)||0).times(effectiveQty))}</strong></div>{!online&&<p className="negative" style={{fontSize:12}}>Connect to the internet for live market trading.</p>}{tradeMsg&&<p className="notice" style={{margin:'6px 0'}}>{tradeMsg}</p>}<button disabled={!online||tradeBusy||!valid||(orderKind!=='market'&&!(Number(targetP)>0))} onClick={submitLiveTrade}>{tradeBusy?'Executing…':orderKind==='market'?(side==='buy'?'Buy':'Sell'):`Place ${orderKind} ${side}`} {valid?effectiveQty.toLocaleString():''} {category==='stocks'?'shares':'units'}</button>
 {(orders||[]).length>0&&<div style={{marginTop:12}}><span className="eyebrow">OPEN ORDERS</span>{orders.map(o=><div key={o.id} className="profile-kv"><span>{o.kind.toUpperCase()} {o.side.toUpperCase()} {o.qty} @ {money(o.targetPrice)}</span><button className="secondary small" disabled={!online||tradeBusy} onClick={()=>cancelLiveOrder(o.id)}>Cancel</button></div>)}</div>}
 </section>
}
