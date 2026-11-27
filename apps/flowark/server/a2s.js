const dgram = require('node:dgram');
const { TextDecoder } = require('node:util');
const decoder = new TextDecoder('utf-8', { fatal: true });
function parseInfo(packet) {
    if (!Buffer.isBuffer(packet) || packet.length < 20 || packet.length > 8192 || packet.readInt32LE(0) !== -1 || packet[4] !== 0x49) throw Error('invalid_a2s_info');
    let offset = 6;
    const string = () => { const end=packet.indexOf(0,offset); if(end<offset||end-offset>2048)throw Error('invalid_a2s_string'); const text=decoder.decode(packet.subarray(offset,end));offset=end+1;return text; };
    const name=string(),map=string(),folder=string(),game=string();
    if(folder!=='ark_survival_evolved'||!game.toLowerCase().includes('ark: survival evolved')||packet.length-offset<9)throw Error('unexpected_game_response');
    offset+=2; const numplayers=packet[offset++],maxplayers=packet[offset++];const password=Boolean(packet[offset+3]);offset+=5;const version=string();
    return { name,map,numplayers,maxplayers,password,version,source:'a2s_info' };
}
function queryAseInfo({host,port,timeout=1500}) {
    return new Promise((resolve,reject)=>{
        const socket=dgram.createSocket('udp4');let finished=false,challenged=false;
        const timer=setTimeout(()=>finish(Error('a2s_timeout')),timeout);
        function finish(error,value){if(finished)return;finished=true;clearTimeout(timer);try{socket.close();}catch{}error?reject(error):resolve(value);}
        const query=Buffer.concat([Buffer.from([255,255,255,255,0x54]),Buffer.from('Source Engine Query\0')]);
        socket.on('error',error=>finish(error));
        socket.on('message',packet=>{
            if(packet.length===9&&packet.readInt32LE(0)===-1&&packet[4]===0x41&&!challenged){challenged=true;socket.send(Buffer.concat([query,packet.subarray(5)]));return;}
            try{finish(null,parseInfo(packet));}catch(error){finish(error);}
        });
        socket.connect(port,host,()=>{if(!finished)socket.send(query);});
    });
}
module.exports={parseInfo,queryAseInfo};
