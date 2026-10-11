// Vercel serverless function. Never expose RENTCAST_API_KEY to the browser.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300');
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  if (!process.env.RENTCAST_API_KEY) return res.status(503).json({error:'RENTCAST_API_KEY is not configured in Vercel environment variables.'});
  const q=req.query || {};
  const mode=q.mode==='buy'?'buy':'rent';
  const loc=String(q.location||'').trim();
  const match=loc.match(/^(.+?),\s*([A-Za-z]{2})$/);
  if (!match && !/^\d{5}$/.test(loc)) return res.status(400).json({error:'Enter a city and two-letter state (Denver, CO), or a five-digit ZIP code.'});
  const url=new URL('https://api.rentcast.io/v1/listings/'+(mode==='buy'?'sale':'rental/long-term'));
  if(match){url.searchParams.set('city',match[1].trim());url.searchParams.set('state',match[2].toUpperCase());}
  else url.searchParams.set('zipCode',loc);
  url.searchParams.set('status','Active');
  url.searchParams.set('limit','25');
  url.searchParams.set('includeTotalCount','true');
  const beds=String(q.beds??''); const baths=String(q.baths??'');
  if (/^[0-9]$/.test(beds)) url.searchParams.set('bedrooms',beds==='4'?'4:*':beds==='0'?'0':' '+beds+':*'.trim());
  if (/^[1-9]$/.test(baths)) url.searchParams.set('bathrooms',baths+':*');
  const budget=Number(q.budget);
  if(mode==='rent' && Number.isFinite(budget) && budget>=100 && budget<=100000) url.searchParams.set('price','*:'+Math.floor(budget));
  try {
    const upstream=await fetch(url,{headers:{'X-Api-Key':process.env.RENTCAST_API_KEY,'Accept':'application/json'},signal:AbortSignal.timeout(12000)});
    if(!upstream.ok) return res.status(upstream.status===429?429:502).json({error:upstream.status===429?'RentCast request limit reached. Try again later.':upstream.status===401?'RentCast rejected the API key. Check your Vercel environment variable.':'RentCast listing request failed ('+upstream.status+').'});
    const items=await upstream.json();
    const countHeader=upstream.headers.get('x-total-count');
    const count=countHeader!==null&&/^\d+$/.test(countHeader)?Number(countHeader):null;
    res.status(200).json({count,returned:items.length,mode,updatedAt:new Date().toISOString(),listings:items.map(x=>({id:x.id,address:x.formattedAddress,price:x.price,beds:x.bedrooms,baths:x.bathrooms,lat:x.latitude,lon:x.longitude,propertyType:x.propertyType,lastSeenDate:x.lastSeenDate})),countIsExact:count!==null});
  } catch(e) {res.status(502).json({error:'Unable to contact RentCast right now.'});}
}
