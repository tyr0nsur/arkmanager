const test=require('node:test');
const assert=require('node:assert/strict');
const dgram=require('node:dgram');
const {preserveSecrets,revision}=require('../config-editor');
const {createRestartScheduler}=require('../scheduled-restarts');
const {queryAseInfo,parseInfo}=require('../a2s');

test('ARK INI round trips preserve protected credentials and reject secret changes in the raw editor',()=>{
 const original='[ServerSettings]\nServerPassword=old-private-value\nServerAdminPassword=long-admin-private-value\nHarvestAmountMultiplier=1000\n[SessionSettings]\nSessionName=Old\n';
 const edited='[ServerSettings]\nServerPassword=[REDACTED]\nServerAdminPassword=[REDACTED]\nHarvestAmountMultiplier=500\n[SessionSettings]\nSessionName=New\n';
 const result=preserveSecrets(original,edited);
 assert.match(result,/ServerPassword=old-private-value/);assert.match(result,/ServerAdminPassword=long-admin-private-value/);assert.match(result,/HarvestAmountMultiplier=500/);assert.match(result,/SessionName=New/);assert.doesNotMatch(result,/\[REDACTED\]/);
 assert.notEqual(revision(original),revision(result));
 assert.throws(()=>preserveSecrets(original,edited.replace('ServerPassword=[REDACTED]','ServerPassword=changed')),/rotación/);
 assert.match(preserveSecrets(original,'[SessionSettings]\nSessionName=Only\n'),/\[ServerSettings\][\s\S]*ServerAdminPassword=long-admin-private-value/,'removing a section must not delete its credentials');
 assert.throws(()=>preserveSecrets(original,'a\0b'),/inválido/);
});

test('scheduled restarts claim once, respect revoked owners, persist cancellation and never retry uncertain executions',async()=>{
 let data=[],clock=100000,executions=0,fail=false;let admins=[{id:'owner',username:'owner',role:'owner'}];
 const options={file:'fixture',read:async()=>structuredClone(data),update:async(file,fallback,fn)=>{data=await fn(structuredClone(data));},getAdmins:async()=>admins,getMaps:()=>[{id:'island'}],execute:async()=>{executions++;if(fail)throw Error('save_failed');},auditLog:async()=>{},now:()=>clock};
 const scheduler=createRestartScheduler(options),owner=admins[0];
 const job=await scheduler.create(owner,'island',clock+60000);await assert.rejects(()=>scheduler.create(owner,'island',clock+60000),/ya tiene/);
 clock+=60000;await Promise.all([scheduler.tick(),scheduler.tick()]);assert.equal(executions,1);assert.equal(data.find(j=>j.id===job.id).state,'completed');await scheduler.tick();assert.equal(executions,1);
 const revoked=await scheduler.create(owner,'island',clock+60000);admins=[];clock+=60000;await scheduler.tick();assert.equal(executions,1);assert.equal(data.find(j=>j.id===revoked.id).state,'deauthorized');
 admins=[owner];const cancelled=await scheduler.create(owner,'island',clock+60000);await scheduler.cancel(owner,cancelled.id);clock+=60000;await scheduler.tick();assert.equal(executions,1);
 const failed=await scheduler.create(owner,'island',clock+60000);fail=true;clock+=60000;await scheduler.tick();assert.equal(executions,2);assert.equal(data.find(j=>j.id===failed.id).state,'failed');await scheduler.tick();assert.equal(executions,2);
 data.push({...failed,id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',state:'running'});await createRestartScheduler(options).recover();assert.equal(data.at(-1).state,'unknown');await scheduler.tick();assert.equal(executions,2);
 await assert.rejects(()=>scheduler.create({...owner,role:'viewer'},'island',clock+60000),/propietario/);
 await assert.rejects(()=>scheduler.create(owner,'unmanaged',clock+60000),/Mapa inválido/);
});

test('native A2S query handles challenge and accepts the ASE zero appid without RCON',async t=>{
 const socket=dgram.createSocket('udp4');await new Promise(resolve=>socket.bind(0,'127.0.0.1',resolve));t.after(()=>socket.close());
 const text=value=>Buffer.from(value+'\0');
 const packet=Buffer.concat([Buffer.from([255,255,255,255,0x49,17]),text('ARK test'),text('TheIsland'),text('ark_survival_evolved'),text('ARK: Survival Evolved'),Buffer.from([0,0,3,70,0,100,108,1,1]),text('1.0.0.0')]);
 let requests=0;
 socket.on('message',(message,peer)=>{requests++;if(requests===1){assert.equal(message.at(-1),0);socket.send(Buffer.from([255,255,255,255,0x41,1,2,3,4]),peer.port,peer.address);}else{assert.deepEqual(message.subarray(-4),Buffer.from([1,2,3,4]));socket.send(packet,peer.port,peer.address);}});
 const result=await queryAseInfo({host:'127.0.0.1',port:socket.address().port});assert.equal(result.numplayers,3);assert.equal(result.maxplayers,70);assert.equal(result.map,'TheIsland');assert.equal(requests,2);
 assert.throws(()=>parseInfo(packet.subarray(0,12)),/invalid_a2s/);
 assert.throws(()=>parseInfo(Buffer.concat([packet,Buffer.alloc(8192)])),/invalid_a2s/);
});

test('txAdmin ARK editor enforces stopped state, optimistic revisions and credentials through HTTP',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),express=require('express');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'obelisk-ini-http-'));const file=path.join(root,'GameUserSettings.ini');
 const original='[ServerSettings]\nServerAdminPassword=fixture-private-secret\nXPMultiplier=1000\n';await fs.writeFile(file,original,{mode:0o600});
 let running=true,audits=0;
 const app=express();app.use(express.json());
 require('../config-editor').installConfigEditor(app,{
  authenticateToken:(req,res,next)=>{req.user={username:'fixture',role:req.get('X-Fixture-Role')||'owner'};next();},
  requireRole:()=> (req,res,next)=>req.user.role==='owner'?next():res.status(403).json({error:'denied'}),
  getMap:id=>{if(id!=='island')throw Object.assign(Error('map'),{statusCode:400});return{id:'island',gameIni:file,gameUserSettings:file};},
  ensureStopped:async()=>{if(running)throw Object.assign(Error('stop'),{statusCode:409});},
  updateText:async(target,update)=>{const next=update(await fs.readFile(target,'utf8'));await fs.writeFile(target,next);},
  ensureAuditLogWritable:async()=>{},auditLog:async()=>{audits++;},
  redact:content=>({content:content.replace(/ServerAdminPassword=.*/, 'ServerAdminPassword=[REDACTED]')}),
 });
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const get=()=>fetch(base+'/api/config/editor?mapId=island&file=gameusersettings');
 const first=await(await get()).json();assert.equal(first.editable,false);assert.doesNotMatch(first.content,/fixture-private-secret/);
 const edit={mapId:'island',file:'gameusersettings',revision:first.revision,content:first.content.replace('1000','500')};
 const post=()=>fetch(base+'/api/config/editor',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(edit)});
 assert.equal((await post()).status,409);assert.equal(await fs.readFile(file,'utf8'),original);
 running=false;assert.equal((await(await get()).json()).editable,true);assert.equal((await post()).status,200);assert.equal(audits,1);
 assert.match(await fs.readFile(file,'utf8'),/fixture-private-secret/);assert.match(await fs.readFile(file,'utf8'),/XPMultiplier=500/);
 assert.equal((await post()).status,409,'an old revision must not overwrite newer edits');
 assert.equal((await fetch(base+'/api/config/editor?mapId=island&file=gameusersettings',{headers:{'X-Fixture-Role':'viewer'}})).status,403);
});
