const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
function makeFixture() {
    const state = { revoked: false, calls: [], commands: [], mapA: 'island', mapB: 'scorched', jobs: [], admins: [
        {id:'owner',username:'fixture-owner',role:'owner',discordId:'100000000000000001',effectivePermissions:['obelisk.plugins.manage'],status:'active'},
        {id:'viewer',username:'fixture-viewer',role:'viewer',discordId:'123456789012345678',effectivePermissions:[],status:'active'},
    ]};
    const maps=[{id:'island',name:'Fixture Island'},{id:'scorched',name:'Fixture Scorched Earth'}];
    const server=http.createServer(async(req,res)=>{
        res.setHeader('Content-Type','application/json');
        const url=new URL(req.url,'http://fixture');
        if(url.pathname==='/healthz')return res.end(JSON.stringify({status:'ok'}));
        if(url.pathname==='/api/auth/providers')return res.end(JSON.stringify({discord:true}));
        if(url.pathname==='/api/auth/oidc/start'){res.writeHead(303,{'Location':'https://discord.com/oauth2/authorize?client_id=fixture','Set-Cookie':'obelisk-oidc=fixture-state; Path=/; HttpOnly; SameSite=Lax'});return res.end();}
        const id=(req.headers.cookie||'').includes('fixture-owner')?'owner':(req.headers.cookie||'').includes('fixture-viewer')?'viewer':null;
        const user=state.admins.find(a=>a.id===id);
        if(!user||state.revoked){res.statusCode=401;return res.end(JSON.stringify({error:'No autorizado'}));}
        if(url.pathname==='/api/auth/verify')return res.end(JSON.stringify({valid:true,user}));
        let raw='';for await(const part of req)raw+=part;let body;try{body=raw?JSON.parse(raw):undefined;}catch{res.statusCode=400;return res.end('{}');}
        state.calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:req.method,body,user:id});
        if(url.pathname==='/api/cluster/maps')return res.end(JSON.stringify({maps}));
        if(url.pathname==='/api/cluster/status')return res.end(JSON.stringify({maps:maps.map((m,i)=>({...m,map:i?'ScorchedEarth':'TheIsland',serverName:m.name,status:'online',players:i?7:3,maxPlayers:70,passwordProtected:true}))}));
        if(url.pathname==='/api/monitor/cluster')return res.end(JSON.stringify({schema:'obelisk.panel.monitor.v1',freshnessMs:6500,observedAt:Date.now(),maps:maps.map((m,i)=>({...m,status:'connected',lastSeenAt:Date.now(),resourceVersion:'0.1.0',...(user.role==='owner'?{metrics:{cpu_percent:i?27.5:14.5,rss_bytes:(i?4:6)*1073741824,uptime_seconds:7200},history:[{at:Date.now()-2000,cpu:10,rss:6*1073741824},{at:Date.now(),cpu:14.5,rss:6*1073741824}],lifecycleAvailable:true,counters:{logins:1,logouts:0,dropped:0},events:[]}:{})}))}));
        if(url.pathname.startsWith('/api/admins')){
            if(user.role!=='owner'){res.statusCode=403;return res.end(JSON.stringify({error:'Permisos insuficientes'}));}
            if(req.method==='GET')return res.end(JSON.stringify(state.admins));
            if(req.method==='POST'){state.admins.push({id:'invited',...body,status:'invited',effectivePermissions:[]});return res.end(JSON.stringify({message:'Administrador creado'}));}
            if(req.method==='PATCH'){Object.assign(state.admins.find(a=>a.id===url.pathname.split('/').at(-1)),body);return res.end(JSON.stringify({message:'Administrador actualizado'}));}
            if(req.method==='DELETE'){state.admins=state.admins.filter(a=>a.id!==url.pathname.split('/').at(-1));return res.end(JSON.stringify({message:'Acceso revocado'}));}
        }
        if(url.pathname==='/api/permissions')return res.end(JSON.stringify({permissions:{'obelisk.plugins.manage':{label:'Gestionar plugins'}},roleDefaults:{viewer:[],operator:[],owner:['obelisk.plugins.manage']}}));
        if(url.pathname==='/api/server/state')return res.end(JSON.stringify({state:'active',processId:234}));
        if(url.pathname==='/api/rcon/command'){state.commands.push(body);return res.end(JSON.stringify({response:body.command==='SaveWorld'?'World Saved':'ok:'+body.mapId+':'+body.command}));}
        if(url.pathname==='/api/server/action')return res.end(JSON.stringify({message:'Solicitud enviada'}));
        if(url.pathname==='/api/server/logs')return res.end(JSON.stringify({logs:'[ARK] '+url.searchParams.get('mapId')+' server log\nNative monitor ready\n'}));
        if(url.pathname==='/api/scheduler/restarts'){
            if(req.method==='POST'){const job={id:'fixture-job',...body,state:'pending'};state.jobs.push(job);return res.end(JSON.stringify({success:true,job}));}
            return res.end(JSON.stringify({jobs:state.jobs,timeZone:'Europe/Madrid',serverTime:Date.now()}));
        }
        if(url.pathname.startsWith('/api/scheduler/restarts/')&&req.method==='DELETE'){state.jobs=state.jobs.filter(j=>j.id!==url.pathname.split('/').at(-1));return res.end(JSON.stringify({success:true}));}
        if(url.pathname==='/api/tasks')return res.end(JSON.stringify({tasks:[],scheduleContext:{timeZone:'Europe/Madrid'}}));
        if(url.pathname==='/api/hub/instances/'+url.searchParams.get('unused'))return res.end('{}');
        if(/^\/api\/hub\/instances\/[^/]+\/plugins$/.test(url.pathname))return res.end(JSON.stringify({ok:true,outcome:'confirmed',plugins:[{plugin_id:'oMonitor',state:'running',cooperative:true,generation:1,in_flight:0}]}));
        if(/^\/api\/hub\/instances\/[^/]+\/plugins\/[^/]+\/[^/]+$/.test(url.pathname))return res.end(JSON.stringify({ok:true,outcome:'confirmed'}));
        if(url.pathname==='/api/config/editor')return res.end(JSON.stringify({content:'[ServerSettings]\nServerAdminPassword=[REDACTED]\nXPMultiplier=1000\n',revision:'a'.repeat(64),editable:false}));
        if(url.pathname==='/api/players/history')return res.end(JSON.stringify({history:[]}));
        if(url.pathname==='/api/players/bans')return res.end(JSON.stringify({bans:[]}));
        if(url.pathname==='/api/audit/log')return res.end(JSON.stringify({logs:[],page:1,totalPages:0}));
        if(url.pathname==='/api/hub/resources')return res.end(JSON.stringify({resources:{items:[{id:'command-starter',title:'Comandos y respuestas',summary:'Plantilla C11 del SDK',commands:['/sdkhello']}]}}));
        if(url.pathname==='/api/hub/catalog')return res.end(JSON.stringify({catalog:{plugins:[{id:'oMonitor',name:'Monitor nativo',summary:'Telemetría',version:'0.1.0',limitations:[]}]}}));
        if(url.pathname==='/api/hub/references')return res.end(JSON.stringify({references:{items:[{resource_id:36,name:'ASE ArkShop',family:'shop'}]}}));
        if(url.pathname==='/api/hub/parity')return res.end(JSON.stringify({parity:{accepted:0,total:157}}));
        if(url.pathname==='/api/system/health')return res.end(JSON.stringify({cpu:{cores:8},memory:{total:32*1073741824}}));
        if(url.pathname==='/api/auth/logout')return res.end(JSON.stringify({logout:true}));
        res.statusCode=404;res.end(JSON.stringify({error:'Fixture endpoint missing: '+url.pathname}));
    });
    return {server,state,maps};
}
async function startFixture() {
    const fixture=makeFixture();await new Promise(resolve=>fixture.server.listen(0,'127.0.0.1',resolve));
    process.env.NODE_ENV='test';process.env.OBELISK_PUBLIC_URL='http://127.0.0.1:0';process.env.OBELISK_PANEL_DIST=path.resolve(__dirname,'../../dist/panel');
    const {ArkGateway,ArkMonitor,ArkRunner,ArkResources,ArkScheduler,ArkWebServer}=await import('../../.test-build/ark-api.mjs');
    const gateway=new ArkGateway('http://127.0.0.1:'+fixture.server.address().port);
    const core={gateway,monitor:new ArkMonitor(gateway),runner:new ArkRunner(gateway),resources:new ArkResources(gateway),scheduler:new ArkScheduler(gateway)};
    const web=new ArkWebServer(core);await web.listen(0,'127.0.0.1');const base='http://127.0.0.1:'+web.address().port;
    async function close(){await web.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
    return {...fixture,core,web,base,close};
}
module.exports={startFixture};
