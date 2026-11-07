const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/web');
const defaults=require('../web-defaults.json');
const key='sb_secret_test_only';
const originalFetch=global.fetch;
async function request(action,{method='GET',body,token,origin}={}){
 let status=200,value,headers={};
 const res={setHeader:(k,v)=>headers[k]=v,status(n){status=n;return this;},json(v){value=v;return this;},end(){return this;}};
 await handler({url:'/api/web?action='+action,method,body,headers:{...(token?{authorization:'Bearer '+token}:{}),...(origin?{origin}:{}),'user-agent':'test-browser'}},res);
 return {status,value,headers};
}
function mock(fn){global.fetch=async(url,opts)=>{const value=await fn(url,opts);return {ok:true,status:200,json:async()=>value};};}
test('authorization, validation, concurrency and analytics',async t=>{
 process.env.C7_WEB_SUPABASE_SECRET=key;
 try{
  await t.test('anonymous callers cannot save or see analytics',async()=>{
   mock(()=>{throw Error('Anonymous requests should not reach the database');});
   assert.equal((await request('save',{method:'PATCH',body:{}})).status,401);
   assert.equal((await request('metrics')).status,401);
  });
  await t.test('logged-in non-admin is denied',async()=>{
   mock(url=>url.includes('/auth/')?{id:'user'}:[]);
   assert.equal((await request('me',{token:'user-token'})).status,403);
  });
  await t.test('published defaults load without exposing the server key',async()=>{
   mock(()=>[{content:{},updated_at:'2026-11-07T22:00:00Z'}]);
   const r=await request('page');assert.equal(r.status,200);assert.equal(r.value.content.nome,'Arthur Braga');assert.ok(r.value.session);assert.ok(!JSON.stringify(r.value).includes(key));
  });
  await t.test('unsafe links are rejected',()=>{
   assert.throws(()=>handler.validContent('arthur',{...defaults.arthur,agendamento:'javascript:alert(1)'}),{status:400});
   assert.throws(()=>handler.validContent('arthur',{...defaults.arthur,photos:[{...defaults.arthur.photos[0],src:'data:text/html,unsafe'}]}),{status:400});
  });
  await t.test('stale writes fail instead of overwriting newer content',async()=>{
   mock((url,opts)=>url.includes('/auth/')?{id:'user'}:url.includes('c7_web_admins')?[{user_id:'user'}]:[]);
   const r=await request('save',{method:'PATCH',token:'user-token',body:{content:defaults.arthur,updated_at:'2026-11-07T22:00:00Z'}});assert.equal(r.status,409);
  });
  await t.test('successful writes use the user token and optimistic version check',async()=>{
   mock((url,opts)=>{if(url.includes('/auth/'))return{id:'user'};if(url.includes('c7_web_admins'))return[{user_id:'user'}];assert.equal(opts.headers.Authorization,'Bearer user-token');assert.ok(url.includes('updated_at=eq.'));return[{content:defaults.arthur,updated_at:'new-version'}];});
   const r=await request('save',{method:'PATCH',token:'user-token',body:{content:defaults.arthur,updated_at:'old-version'}});assert.equal(r.status,200);assert.equal(r.value.updated_at,'new-version');
  });
  await t.test('metrics distinguish visits, sessions and clicks',async()=>{
   mock(url=>url.includes('/auth/')?{id:'user'}:url.includes('c7_web_admins')?[{user_id:'user'}]:[
    {event_type:'view',session_id:'a',source:'instagram',device:'mobile',created_at:new Date().toISOString()},
    {event_type:'view',session_id:'a',source:'instagram',device:'mobile',created_at:new Date().toISOString()},
    {event_type:'click',target:'whatsapp',session_id:'a',created_at:new Date().toISOString()}]);
   const r=await request('metrics',{token:'user-token'});assert.equal(r.status,200);assert.equal(r.value.views,2);assert.equal(r.value.sessions,1);assert.equal(r.value.totalClicks,1);assert.equal(r.value.clicks.whatsapp,1);
  });
  await t.test('event tokens cannot be forged and foreign origins are denied',async()=>{
   assert.equal((await request('event',{method:'POST',body:{session:'fake.token'}})).status,400);
   assert.equal((await request('page',{origin:'https://other.example'})).status,403);
  });
 }finally{global.fetch=originalFetch;delete process.env.C7_WEB_SUPABASE_SECRET;}
});
