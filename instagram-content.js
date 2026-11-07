(async () => {
 const api='https://arthur.c7barbeariatradicional.com.br';
 try {
  const r=await fetch(api+'/api/web?action=page&page=instagram',{signal:AbortSignal.timeout(4000)});if(!r.ok)return;
  const {content:c}=await r.json();
  const set=(selector,text)=>{const el=document.querySelector(selector);if(el)el.textContent=text;};
  const background=(el,src,hero=false)=>{if(el)el.style.backgroundImage=`linear-gradient(180deg,rgba(0,0,0,.16),rgba(5,5,5,.88)),url(${JSON.stringify(src)})`;};
  set('.section-head h1',c.title);set('.section-head p',c.subtitle);set('.hero-tag',c.tagline);set('.about-grid h2',c.aboutTitle);set('.about-copy p',c.about);
  document.querySelectorAll('.brand-logo').forEach(img=>img.src=c.logo);background(document.querySelector('.hero'),c.hero,true);
  for(const button of c.buttons){
   const card=[...document.querySelectorAll('.tile')].find(el=>el.dataset.name===button.key);if(!card)continue;
   card.href=button.href;const title=card.querySelector('strong'),desc=card.querySelector('small');if(title)title.textContent=button.label;if(desc)desc.textContent=button.description;background(card,button.src);
   if(button.key==='Agendamento'){const cta=document.querySelector('.hero-cta');if(cta)cta.href=button.href;}
   if(button.key==='WhatsApp'){const link=document.querySelector('.about-actions a:first-child');if(link)link.href=button.href;}
   if(button.key==='Como chegar'){const link=document.querySelector('.about-actions a:last-child');if(link)link.href=button.href;}
  }
 }catch{}
})();
