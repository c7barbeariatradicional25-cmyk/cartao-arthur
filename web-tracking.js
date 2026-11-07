(() => {
  const script=document.currentScript;
  const page=script.dataset.page||'arthur';
  const base=script.dataset.api||'';
  if(new URLSearchParams(location.search).has('preview')) return;
  let id;
  try {id=sessionStorage.getItem('c7-web-session');if(!id){id=crypto.randomUUID();sessionStorage.setItem('c7-web-session',id);}}catch{id=crypto.randomUUID();}
  let source='direct';
  const utm=new URLSearchParams(location.search).get('utm_source');
  if(utm) source=utm.replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,100)||'direct';
  else if(document.referrer){try{const ref=new URL(document.referrer);source=ref.hostname===location.hostname?'internal':ref.hostname;}catch{}}
  const device=/iPad|Tablet/i.test(navigator.userAgent)?'tablet':/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop';
  const session=fetch(`${base}/api/web?action=page&page=${page}&session=${id}`).then(r=>r.ok?r.json():null).catch(()=>null);
  async function track(event_type,target='') {
    const config=await session;if(!config?.session)return;
    fetch(`${base}/api/web?action=event&page=${page}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),session:config.session,event_type,target,source,device}),keepalive:true}).catch(()=>{});
  }
  track('view');
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');if(!link)return;
    const target=link.dataset.link||link.dataset.name||link.getAttribute('aria-label')||link.textContent.trim().replace(/\s+/g,' ').slice(0,100)||'link';
    track('click',target);
  });
})();
