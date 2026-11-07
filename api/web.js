const crypto = require('node:crypto');
const defaults = require('../web-defaults.json');
const SB = 'https://cjtgjqxkyvgjlhylrvas.supabase.co';
const ORIGINS = new Set(['https://arthur.c7barbeariatradicional.com.br','https://c7barbeariatradicional.com.br','https://www.c7barbeariatradicional.com.br']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status, message) => Object.assign(new Error(message), {status});
function validContent(page, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 100000) throw fail(400,'Conteúdo inválido.');
  const template = defaults[page];
  function check(value, shape, key) {
    if (typeof shape === 'string') {
      if (typeof value !== 'string' || value.length > 16000) throw fail(400,`Campo inválido: ${key}`);
      if (['agendamento','avaliacoes','avaliar','maps','href','src','reviewUrl','whatsappLink'].includes(key) && value) {
        const url = new URL(value, 'https://arthur.c7barbeariatradicional.com.br');
        if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw fail(400,'Link inválido.');
      }
      return value;
    }
    if (Array.isArray(shape)) {
      if (!Array.isArray(value) || value.length > 50) throw fail(400,`Lista inválida: ${key}`);
      return value.map(v=>check(v,shape[0],key));
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(400,`Grupo inválido: ${key}`);
    return Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,check(value[k] === undefined ? v : value[k],v,k)]));
  }
  const checked=check(data, template, page);
  if(page==='instagram') for(const button of checked.buttons) {
    if(button.key==='WhatsApp' && /^https:\/\/wa\.me\/5562992390887(?:\?|$)/.test(button.href)) button.href=defaults.arthur.whatsappLink;
  }
  return checked;
}
async function db(path, opts={}, token) {
  const key=process.env.C7_WEB_SUPABASE_SECRET;
  if (!key) throw fail(503,'A conexão segura do painel ainda precisa ser configurada.');
  const authorization=token?{Authorization:`Bearer ${token}`}:key.startsWith('eyJ')?{Authorization:`Bearer ${key}`} : {};
  const response=await fetch(SB+path,{...opts,headers:{apikey:key,...authorization,'Content-Type':'application/json',...opts.headers},signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw fail(response.status===401?401:502,'Não foi possível concluir a operação no Supabase.');
  return data;
}
async function authorize(req) {
  const token=req.headers.authorization?.replace(/^Bearer /,'');
  if(!token) throw fail(401,'Entre novamente para continuar.');
  const user=await db('/auth/v1/user',{},token);
  const admins=await db(`/rest/v1/c7_web_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,{},token);
  if(!admins?.length) throw fail(403,'Esta conta não tem acesso ao painel.');
  return {token,user};
}
function issueSession(session) {
  const payload=Buffer.from(JSON.stringify({id:session,exp:Date.now()+86400000})).toString('base64url');
  const signature=crypto.createHmac('sha256',process.env.C7_WEB_SUPABASE_SECRET).update(payload).digest('base64url');
  return payload+'.'+signature;
}
function readSession(token) {
  const [payload,signature]=String(token||'').split('.');
  const expected=crypto.createHmac('sha256',process.env.C7_WEB_SUPABASE_SECRET).update(payload||'').digest('base64url');
  if(!signature || signature.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) throw fail(400,'Sessão inválida.');
  const session=JSON.parse(Buffer.from(payload,'base64url').toString());
  if(!UUID.test(session.id)||session.exp<Date.now()) throw fail(400,'Sessão expirada.');
  return session.id;
}
module.exports=async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const origin=req.headers.origin;
  if(origin && ORIGINS.has(origin)) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS') {res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');return res.status(204).end();}
  try {
    const url=new URL(req.url,'https://arthur.c7barbeariatradicional.com.br');
    const action=url.searchParams.get('action')||'page';
    const page=url.searchParams.get('page')||'arthur';
    if(!Object.hasOwn(defaults,page)) throw fail(400,'Página inválida.');
    if(origin && !ORIGINS.has(origin)) throw fail(403,'Origem não permitida.');
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    if(action==='page' && req.method==='GET') {
      const rows=await db(`/rest/v1/c7_web_pages?id=eq.${page}&select=content,updated_at`);
      if(!rows?.length) throw fail(503,'Execute a configuração do banco de dados.');
      const saved=rows[0];
      const content=validContent(page,{...defaults[page],...saved.content});
      if(page==='arthur' && !content.avaliar) content.avaliar=defaults.arthur.avaliar;
      const id=UUID.test(url.searchParams.get('session')||'')?url.searchParams.get('session'):crypto.randomUUID();
      return res.json({content,updated_at:saved.updated_at,session:issueSession(id)});
    }
    if(action==='login' && req.method==='POST') {
      if(typeof body.email!=='string'||typeof body.password!=='string'||body.email.length>254||body.password.length>256) throw fail(400,'Informe e-mail e senha.');
      const auth=await db('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:body.email,password:body.password})}).catch(()=>{throw fail(401,'E-mail ou senha incorretos.');});
      const admins=await db(`/rest/v1/c7_web_admins?user_id=eq.${auth.user.id}&select=user_id`,{},auth.access_token);
      if(!admins?.length) throw fail(403,'Esta conta não tem acesso ao painel.');
      return res.json({access_token:auth.access_token,expires_at:Math.floor(Date.now()/1000)+auth.expires_in,email:auth.user.email});
    }
    if(action==='event' && req.method==='POST') {
      if(!process.env.C7_WEB_SUPABASE_SECRET) throw fail(503,'Métricas ainda não configuradas.');
      if(/bot|crawler|spider|preview|facebookexternalhit/i.test(req.headers['user-agent']||'')) return res.status(204).end();
      const session=readSession(body.session);
      if(!UUID.test(body.id||'')||!['view','click'].includes(body.event_type)) throw fail(400,'Evento inválido.');
      const since=new Date(Date.now()-60000).toISOString();
      const recent=await db(`/rest/v1/c7_web_events?session_id=eq.${session}&created_at=gte.${since}&select=id&limit=25`);
      if(recent.length>=25) return res.status(429).json({error:'Aguarde antes de registrar mais eventos.'});
      const event={id:body.id,page_id:page,event_type:body.event_type,session_id:session,target:body.event_type==='click'?String(body.target||'link').slice(0,100):'',source:String(body.source||'direct').slice(0,100),device:['mobile','desktop','tablet'].includes(body.device)?body.device:'unknown'};
      await db('/rest/v1/c7_web_events?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(event)});
      return res.status(204).end();
    }
    const {token,user}=await authorize(req);
    if(action==='me' && req.method==='GET') return res.json({email:user.email});
    if(action==='logout' && req.method==='POST') {await db('/auth/v1/logout',{method:'POST'},token);return res.status(204).end();}
    if(action==='save' && req.method==='PATCH') {
      const content=validContent(page,body.content);
      if(typeof body.updated_at!=='string') throw fail(400,'Recarregue a página antes de salvar.');
      const rows=await db(`/rest/v1/c7_web_pages?id=eq.${page}&updated_at=eq.${encodeURIComponent(body.updated_at)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({content})},token);
      if(!rows?.length) throw fail(409,'O conteúdo foi alterado em outra janela. Recarregue antes de salvar.');
      return res.json(rows[0]);
    }
    if(action==='upload' && req.method==='POST') {
      if(typeof body.data!=='string'||body.data.length>2800000) throw fail(400,'A imagem deve ter até 2 MB.');
      const buffer=Buffer.from(body.data,'base64');
      const jpeg=buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
      const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const webp=buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP';
      if(!jpeg&&!png&&!webp) throw fail(400,'Use uma imagem JPG, PNG ou WebP.');
      const ext=jpeg?'jpg':png?'png':'webp';
      const path=`${page}/${crypto.randomUUID()}.${ext}`;
      await db(`/storage/v1/object/c7-web-media/${path}`,{method:'POST',headers:{'Content-Type':`image/${jpeg?'jpeg':ext}`},body:buffer},token);
      return res.json({url:`${SB}/storage/v1/object/public/c7-web-media/${path}`});
    }
    if(action==='metrics' && req.method==='GET') {
      const days=Number(url.searchParams.get('days')||30);
      if(![1,7,30,90].includes(days)) throw fail(400,'Período inválido.');
      const now=new Date();
      // Calendar days in São Paulo, beginning at local midnight.
      const today=now.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
      const start=new Date(today+'T00:00:00-03:00');start.setUTCDate(start.getUTCDate()-(days-1));
      const events=[];
      for(let offset=0;offset<100000;offset+=1000) {
        const batch=await db(`/rest/v1/c7_web_events?page_id=eq.${page}&created_at=gte.${start.toISOString()}&created_at=lte.${now.toISOString()}&select=event_type,target,session_id,source,device,created_at&order=created_at.asc,id.asc&offset=${offset}&limit=1000`,{},token);
        events.push(...batch);if(batch.length<1000) break;
        if(offset===99000) throw fail(422,'Escolha um período menor para consultar os resultados.');
      }
      const daily={},clicks={},sources={},devices={},sessions=new Set();let views=0,totalClicks=0;
      for(let i=0;i<days;i++){const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);daily[d.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})]=0;}
      for(const e of events){if(e.event_type==='view'){views++;sessions.add(e.session_id);const day=new Date(e.created_at).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});daily[day]=(daily[day]||0)+1;sources[e.source]=(sources[e.source]||0)+1;devices[e.device]=(devices[e.device]||0)+1;}else{totalClicks++;clicks[e.target]=(clicks[e.target]||0)+1;}}
      return res.json({views,sessions:sessions.size,totalClicks,daily,clicks,sources,devices,days});
    }
    throw fail(405,'Operação não permitida.');
  }catch(error){console.error('c7-web',error.status||500,error.name);return res.status(error.status||500).json({error:error.status?error.message:'Não foi possível concluir. Tente novamente.'});}
};
module.exports.validContent=validContent;
