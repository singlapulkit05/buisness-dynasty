import React from 'react';
import photos from './asset-images.json';
const artIds = new Set(['property', 'taxi', 'retro', 'construction', 'oil', 'tower', 'yacht', 'factory', 'gt', 'eth', 'business', 'dealer', 'slots', 'shipping', 'office', 'car', 'home', 'activity', 'boost', 'energy', 'shop', 'sports', 'sol', 'bank', 'retailstock', 'invest', 'bankstock', 'space', 'btc', 'apt', 'jet', 'holding', 'mansion', 'transport', 'profile', 'hotel', 'logo', 'landmark', 'premium', 'gem', 'clothing', 'it', 'assets']);
const fallbackIds={cars:'car',retro:'retro',aircraft:'jet',yachts:'yacht',properties:'property',unique:'landmark',islands:'property',coins:'gem',paintings:'assets',jewels:'gem',stamps:'assets',insignias:'assets',nft:'assets'};
export default function GameArt({id,item,wide=false}) {
 const fallback=`${import.meta.env.BASE_URL}game-art/${artIds.has(id)?id:(fallbackIds[item?.category]||'business')}.svg`;
 const photo=photos[item?.id];
 const src=item?.localImage||(photo?.file?`${import.meta.env.BASE_URL}${photo.file}`:null)||item?.imageUrl||fallback;
 return <img key={src} title={photo&&!item?.localImage?`${photo.matchType}${photo.reviewed?'':' (unreviewed)'} · ${photo.author} · ${photo.license}`:undefined} className={wide?'game-art wide':'game-art'} src={src} alt={item?.name||''} loading="lazy" width={wide?480:48} height={wide?220:48} draggable="false" onError={e=>{if(e.currentTarget.getAttribute('src')!==fallback)e.currentTarget.src=fallback}}/>;
}
