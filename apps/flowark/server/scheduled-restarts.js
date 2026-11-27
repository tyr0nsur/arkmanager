const crypto = require('node:crypto');
const error = (statusCode,message) => Object.assign(new Error(message),{statusCode});
function createRestartScheduler({ file, read, update, getAdmins, getMaps, execute, auditLog, now=Date.now }) {
    let running=false;
    const valid = job => job && /^[a-f0-9-]{36}$/.test(job.id||'') && typeof job.createdBy==='string' && typeof job.mapId==='string' && Number.isSafeInteger(job.dueAt) && ['pending','running','completed','failed','cancelled','deauthorized','unknown'].includes(job.state);
    async function list(){const jobs=await read(file,[]);if(!Array.isArray(jobs)||jobs.length>200||jobs.some(job=>!valid(job)))throw error(503,'El registro de reinicios requiere revisión');return jobs;}
    async function create(admin,mapId,dueAt){if(admin.role!=='owner')throw error(403,'Solo un propietario puede programar reinicios');if(!getMaps().some(map=>map.id===mapId))throw error(400,'Mapa inválido');if(!Number.isSafeInteger(dueAt)||dueAt<now()+60000||dueAt>now()+7*86400000)throw error(400,'Programa el reinicio entre 1 minuto y 7 días');let job;await update(file,[],jobs=>{if(jobs.some(j=>j.mapId===mapId&&['pending','running'].includes(j.state)))throw error(409,'Este mapa ya tiene un reinicio programado');job={id:crypto.randomUUID(),mapId,createdBy:admin.id,createdByName:admin.username,dueAt,createdAt:now(),state:'pending'};return [...jobs.filter(j=>['pending','running'].includes(j.state)).concat(jobs.filter(j=>!['pending','running'].includes(j.state)).slice(-150)),job];});await auditLog(admin.username,'RESTART_SCHEDULED',`[${mapId}] Restart scheduled for ${new Date(dueAt).toISOString()}`);return job;}
    async function cancel(admin,id){if(admin.role!=='owner')throw error(403,'Solo un propietario puede cancelar reinicios');let found=false;await update(file,[],jobs=>jobs.map(job=>{if(job.id!==id)return job;found=true;if(job.state!=='pending')throw error(409,'Este reinicio ya no se puede cancelar');return {...job,state:'cancelled',finishedAt:now()};}));if(!found)throw error(404,'Reinicio no encontrado');await auditLog(admin.username,'RESTART_CANCELLED',`Cancelled scheduled restart ${id}`);}
    async function recover(){await update(file,[],jobs=>jobs.map(job=>job.state==='running'?{...job,state:'unknown',finishedAt:now(),reason:'El gestor se reinició durante la operación. Confirma el estado del mapa antes de repetirla.'}:job));}
    async function tick(){if(running)return;running=true;try{const jobs=await list();for(const job of jobs.filter(job=>job.state==='pending'&&job.dueAt<=now())){
        const admin=(await getAdmins()).find(a=>a.id===job.createdBy),map=getMaps().find(m=>m.id===job.mapId);let claimed=false;
        await update(file,[],items=>items.map(item=>{if(item.id!==job.id||item.state!=='pending')return item;claimed=true;return {...item,state:admin?.role==='owner'&&map?'running':'deauthorized',startedAt:now()};}));
        if(!claimed||admin?.role!=='owner'||!map)continue;
        let outcome='completed',reason='';try{await execute(map,admin);}catch(e){outcome='failed';reason='El reinicio no se confirmó. Revisa el mapa antes de repetir la operación.';}
        await update(file,[],items=>items.map(item=>item.id===job.id?{...item,state:outcome,reason,finishedAt:now()}:item));
        await auditLog(admin.username,'SCHEDULED_RESTART_RESULT',`[${job.mapId}] ${outcome}`);
    }}finally{running=false;}}
    return {list,create,cancel,recover,tick};
}
function installRestartRoutes(app,{service,authenticateToken,requireRole}){
    const handle=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.statusCode||503).json({error:e.statusCode?e.message:'No se pudo actualizar la programación'});}};
    app.get('/api/scheduler/restarts',authenticateToken,requireRole('operator'),handle(async(req,res)=>res.json({jobs:await service.list(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,serverTime:Date.now()})));
    app.post('/api/scheduler/restarts',authenticateToken,requireRole('owner'),handle(async(req,res)=>res.json({success:true,job:await service.create(req.user,req.body?.mapId,req.body?.dueAt)})));
    app.delete('/api/scheduler/restarts/:id',authenticateToken,requireRole('owner'),handle(async(req,res)=>{await service.cancel(req.user,req.params.id);res.json({success:true});}));
}
module.exports={createRestartScheduler,installRestartRoutes};
