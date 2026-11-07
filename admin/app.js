(() => {
const $=s=>document.querySelector(s);
let auth=null,content=null,version=null,defaults=null,dirty=false,busy=false;
const labels={reviewUrl:'Link para avaliação do Google',nome:'Nome',cargo:'Cargo e apresentação',whatsapp:'WhatsApp com país e DDD',mensagemWhatsapp:'Mensagem inicial do WhatsApp',instagram:'Usuário do Instagram',agendamento:'Link de agendamento',avaliacoes:'Link das avaliações',avaliar:'Link para deixar avaliação',maps:'Link de localização',endereco:'Endereço',numeros:'Números de destaque',sobre:'Sobre mim · resumo',trajetoria:'Linha do tempo',frase:'Frase em destaque',fraseDestaque:'Palavras em dourado na frase',porque:'Por que me escolher',photos:'Fotos e logo',story:'História completa',title:'Título principal',subtitle:'Subtítulo',tagline:'Frase no topo',aboutTitle:'Título sobre a C7',about:'Texto sobre a C7',logo:'Logo da C7',hero:'Foto principal',buttons:'Botões do Instagram',label:'Nome',description:'Descrição',href:'Link de destino',src:'Imagem',position:'Posição do enquadramento (ex.: 50% 22%)'};
const page=()=>$('#page').value;
const notice=(text,error=false)=>{const n=$('#notice');n.textContent=text;n.classList.toggle('error',error);n.hidden=!text;};
async function api(action,options={}){
 const headers={...options.headers};if(auth)headers.Authorization='Bearer '+auth.access_token;
 if(options.body){headers['Content-Type']='application/json';options.body=JSON.stringify(options.body);}
 const r=await fetch(`/api/web?action=${action}&page=${page()}&days=${$('#days').value}`,{...options,headers});
 const value=await r.json().catch(()=>null);
 if(!r.ok){if(r.status===401&&action!=='login')signout();throw new Error(value?.error||'Não foi possível concluir. Tente novamente.');}
 return value;
}
function setDirty(){dirty=true;$('#saveState').textContent='Alterações ainda não salvas';}
function signout(){auth=null;sessionStorage.removeItem('c7-web-auth');$('#app').hidden=true;$('#login').hidden=false;$('#logout').hidden=true;}
async function enter(){await api('me');$('#login').hidden=true;$('#app').hidden=false;$('#logout').hidden=false;$('#account').textContent=auth.email;await loadPage();}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;notice('');try{const data=new FormData(e.target);auth=await api('login',{method:'POST',body:{email:data.get('email').trim(),password:data.get('password')}});sessionStorage.setItem('c7-web-auth',JSON.stringify(auth));e.target.reset();await enter();}catch(error){signout();notice(error.message,true);}finally{button.disabled=false;}});
$('#logout').onclick=async()=>{if(dirty&&!confirm('Sair sem salvar as alterações?'))return;try{await api('logout',{method:'POST'});}catch{}signout();};
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function setAt(path,value){let parent=content;for(const k of path.slice(0,-1))parent=parent[k];parent[path.at(-1)]=value;setDirty();}
function getAt(path){return path.reduce((o,k)=>o[k],content);}
function stringField(value,path,title){const label=node('label',null,title);const long=['sobre','story','about','mensagemWhatsapp','frase'].includes(String(path[0]))||value.length>120;const input=document.createElement(long?'textarea':'input');if(!long)input.type='text';input.value=value.replace(/<\/?b>/g,'');input.maxLength=16000;input.addEventListener('input',()=>setAt(path,input.value));label.append(input);return label;}
async function upload(file,path,preview,button){
 if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)){notice('Escolha uma imagem JPG, PNG ou WebP.',true);return;}
 button.disabled=true;busy=true;notice('Preparando a foto…');
 let bitmap;
 try{
  bitmap=await createImageBitmap(file);const ratio=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const mime=path.includes('logo')||getAt(path)?.includes('logo')?'image/png':'image/webp';
  let data=canvas.toDataURL(mime,.86);if(data.length>2700000)data=canvas.toDataURL('image/webp',.7);
  if(data.length>2700000)throw new Error('Escolha uma imagem menor. O limite após compressão é 2 MB.');
  const result=await api('upload',{method:'POST',body:{data:data.split(',')[1]}});setAt(path,result.url);preview.src=result.url;notice('Foto enviada. Clique em Salvar alterações para publicá-la.');
 }catch(error){notice(error.message,true);}finally{bitmap?.close();button.disabled=false;busy=false;}
}
function photoField(value,path,title){const wrap=node('div');const preview=node('img','photo-preview');preview.src=value;preview.alt=title;const input=stringField(value,path,title+' · URL');input.querySelector('input,textarea').addEventListener('input',e=>{try{const url=new URL(e.target.value);if(url.protocol==='https:')preview.src=url.href;}catch{}});const label=node('label',null,'Trocar foto');const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.onchange=()=>upload(file.files[0],path,preview,file);label.append(file);wrap.append(preview,label,input);return wrap;}
function field(value,shape,path,title){
 if(typeof value==='string')return ['src','hero','logo'].includes(String(path.at(-1)))?photoField(value,path,title):stringField(value,path,title);
 const wrap=node('div');
 if(Array.isArray(value)){
  value.forEach((item,i)=>{const entry=node('div','entry');const head=node('div','entry-head');head.append(node('strong',null,`${title} · ${i+1}`));const remove=node('button','remove','Remover');remove.type='button';remove.onclick=()=>{getAt(path).splice(i,1);setDirty();render();};head.append(remove);entry.append(head);
   if(Array.isArray(item)) {const names=path[0]==='trajetoria'?['Data','Título','Descrição']:path[0]==='numeros'?['Número ou ano','Descrição']:['Título','Descrição'];item.forEach((v,j)=>entry.append(stringField(v,[...path,i,j],names[j]||'Texto')));}
   else if(typeof item==='string')entry.append(stringField(item,[...path,i],'Texto'));
   else for(const [key,v] of Object.entries(item)){if(key==='key')continue;entry.append(field(v,shape[0][key],[...path,i,key],labels[key]||key));}
   wrap.append(entry);
  });
  // Photo slots and Instagram destinations retain stable identities.
  if(!['photos','buttons'].includes(path[0])){const add=node('button','quiet add','+ Adicionar');add.type='button';add.onclick=()=>{const blank=v=>typeof v==='string'?'':Array.isArray(v)?v.map(blank):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,blank(x)]));getAt(path).push(blank(shape[0]));setDirty();render();};wrap.append(add);}
 }else for(const [key,v] of Object.entries(value))wrap.append(field(v,shape[key],[...path,key],labels[key]||key));
 return wrap;
}
function render(){const root=$('#fields');root.replaceChildren();for(const [key,value] of Object.entries(content)){const group=node('details');const summary=node('summary',null,labels[key]||key);group.append(summary,field(value,defaults[page()][key],[key],labels[key]||key));root.append(group);}$('#saveState').textContent=dirty?'Alterações ainda não salvas':'Nenhuma alteração pendente';}
async function loadPage(){notice('');$('#openPage').href=page()==='arthur'?'/?preview=1':'https://c7barbeariatradicional.com.br/?preview=1';try{const r=await api('page');content=r.content;version=r.updated_at;dirty=false;render();await metrics();}catch(error){notice(error.message,true);}}
let previous='arthur';$('#page').onchange=async()=>{if(dirty&&!confirm('Trocar de página sem salvar as alterações?')){$('#page').value=previous;return;}previous=page();await loadPage();};
$('#editForm').onsubmit=async e=>{e.preventDefault();if(busy){notice('Aguarde o envio da foto antes de salvar.',true);return;}const button=e.submitter;button.disabled=true;notice('Salvando…');try{const saved=await api('save',{method:'PATCH',body:{content,updated_at:version}});version=saved.updated_at;content=saved.content;dirty=false;$('#saveState').textContent='Tudo salvo';notice('Alterações publicadas com sucesso.');}catch(error){notice(error.message,true);}finally{button.disabled=false;}};
function ranks(selector,values,names={}){const root=$(selector);root.replaceChildren();const entries=Object.entries(values).sort((a,b)=>b[1]-a[1]);if(!entries.length){root.append(node('p','empty','Ainda não há dados neste período.'));return;}for(const [label,count] of entries){const row=node('div','rank');row.append(node('span',null,names[label]||label),node('strong',null,count));root.append(row);}}
async function metrics(){const requested=page(),days=$('#days').value;$('#refresh').disabled=true;try{const m=await api('metrics');if(requested!==page()||days!==$('#days').value)return;$('#views').textContent=m.views.toLocaleString('pt-BR');$('#sessions').textContent=m.sessions.toLocaleString('pt-BR');$('#clicks').textContent=m.totalClicks.toLocaleString('pt-BR');ranks('#ranking',m.clicks);ranks('#sources',m.sources,{direct:'Direto / origem não informada',internal:'Navegação interna'});ranks('#devices',m.devices,{mobile:'Celular',desktop:'Computador',tablet:'Tablet',unknown:'Não informado'});const root=$('#daily');root.replaceChildren();const max=Math.max(1,...Object.values(m.daily));for(const [date,n] of Object.entries(m.daily)){const row=node('div','day');const bar=node('div','bar'),fill=node('i');fill.style.width=(n/max*100)+'%';bar.append(fill);row.append(node('span',null,date.split('-').reverse().slice(0,2).join('/')),bar,node('strong',null,n));root.append(row);}}catch(error){notice(error.message,true);}finally{$('#refresh').disabled=false;}}
$('#days').onchange=metrics;$('#refresh').onclick=metrics;
for(const [button,section] of [['metricsTab','metrics'],['editorTab','editor']])$('#'+button).onclick=()=>{for(const name of ['metrics','editor'])$('#'+name).hidden=name!==section;$('#metricsTab').classList.toggle('active',section==='metrics');$('#editorTab').classList.toggle('active',section==='editor');};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
fetch('/web-defaults.json').then(r=>r.json()).then(async d=>{defaults=d;try{auth=JSON.parse(sessionStorage.getItem('c7-web-auth'));if(auth&&auth.expires_at>Date.now()/1000)await enter();else signout();}catch{signout();}}).catch(()=>notice('Não foi possível carregar o painel. Atualize a página.',true));
})();
