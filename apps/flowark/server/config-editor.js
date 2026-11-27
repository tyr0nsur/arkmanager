const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const SECRET = /^\s*(ServerAdminPassword|ServerPassword|SpectatorPassword)\s*=(.*)$/i;
const revision = content => crypto.createHash('sha256').update(content).digest('hex');
const failure = (statusCode, message) => Object.assign(new Error(message), { statusCode });
function preserveSecrets(current, proposed) {
    if (typeof proposed !== 'string' || Buffer.byteLength(proposed) > 2 * 1024 * 1024 || proposed.includes('\0')) throw failure(400, 'Contenido INI inválido o demasiado grande');
    const secrets = new Map(); let section = '';
    for (const line of current.split(/\r?\n/)) {
        if (/^\s*\[.+\]\s*$/.test(line)) section = line.trim();
        if (SECRET.test(line)) { const key = section.toLowerCase(); if (!secrets.has(key)) secrets.set(key, {section,lines:[]}); secrets.get(key).lines.push(line); }
    }
    const output = []; section = ''; const consumed = new Set();
    const append = () => { const key=section.toLowerCase(); if(secrets.has(key)&&!consumed.has(key)){output.push(...secrets.get(key).lines);consumed.add(key);} };
    for (const line of proposed.split(/\r?\n/)) {
        const match = line.match(SECRET);
        if (match) { if (match[2].trim() !== '[REDACTED]') throw failure(400,'Cambia las credenciales mediante la rotación de secretos'); continue; }
        if (/^\s*\[.+\]\s*$/.test(line)) { append(); section=line.trim(); }
        output.push(line);
    }
    append();
    for (const [key,item] of secrets) if(!consumed.has(key)) output.push('',item.section,...item.lines);
    return output.join('\n');
}
function installConfigEditor(app, { authenticateToken, requireRole, getMap, ensureStopped, updateText, auditLog, ensureAuditLogWritable, redact }) {
    const selected = req => { const map=getMap(req.method==='GET'?req.query.mapId:req.body?.mapId);const kind=req.method==='GET'?req.query.file:req.body?.file;if(!['gameini','gameusersettings'].includes(kind))throw failure(400,'Archivo INI inválido');return {map,kind,file:kind==='gameini'?map.gameIni:map.gameUserSettings}; };
    app.get('/api/config/editor', authenticateToken, requireRole('owner'), async(req,res)=>{try{const {map,kind,file}=selected(req),content=await fs.readFile(file,'utf8');let editable=false;try{await ensureStopped(map);editable=true;}catch{}res.setHeader('Cache-Control','no-store');res.json({...redact(content),revision:revision(content),file:kind,editable});}catch(error){res.status(error.statusCode||503).json({error:error.statusCode?error.message:'No se pudo abrir el archivo INI'});}});
    app.post('/api/config/editor', authenticateToken, requireRole('owner'), async(req,res)=>{try{const {map,file}=selected(req);if(typeof req.body.revision!=='string'||! /^[a-f0-9]{64}$/.test(req.body.revision))throw failure(400,'Falta la revisión del archivo');await ensureStopped(map);await ensureAuditLogWritable();await updateText(file,current=>{if(revision(current)!==req.body.revision)throw failure(409,'El archivo cambió. Recarga antes de guardar.');return preserveSecrets(current,req.body.content);},{requireExisting:true});await auditLog(req.user.username,'CONFIG_EDIT',`[${map.id}] Edited native INI through the txAdmin ARK port`);res.json({success:true,message:'Configuración guardada. Se aplicará al arrancar el mapa.'});}catch(error){res.status(error.statusCode||503).json({error:error.statusCode?error.message:'No se pudo guardar el archivo INI'});}});
}
module.exports = { preserveSecrets, revision, installConfigEditor };
