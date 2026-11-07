(async()=>{
 try{
  const r=await fetch('/api/web?action=page&page=arthur',{signal:AbortSignal.timeout(4000)});if(!r.ok)return;
  const {content:c}=await r.json();if(!Array.isArray(c.story))return;
  const root=document.querySelector('article');root.replaceChildren();for(const text of c.story){const p=document.createElement('p');p.textContent=text;if(text.startsWith('De colaborador a proprietário.'))p.className='highlight';root.append(p);}
  const logo=c.photos?.find(p=>p.key==='logo.webp');if(logo)document.querySelector('img.logo').src=logo.src;
 }catch{}
})();
