// Vektolab Push Worker para Cloudflare Workers.
// Requiere una KV namespace llamada TOKENS y estos secrets:
// FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, ADMIN_KEY.
// FIREBASE_PROJECT_ID puede ser un variable normal o secret.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Content-Type, Authorization',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (data, status=200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    ...CORS
  }
});

function b64url(input) {
  let s = typeof input === 'string' ? btoa(input) : btoa(String.fromCharCode(...new Uint8Array(input)));
  return s.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/,'').replace(/-----END PRIVATE KEY-----/,'').replace(/\s+/g,'');
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return bytes.buffer;
}
async function accessToken(env) {
  const now = Math.floor(Date.now()/1000);
  const header = b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim = b64url(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + '.' + claim;
  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(env.FIREBASE_PRIVATE_KEY), {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'}, key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + '.' + b64url(signature);
  const r = await fetch('https://oauth2.googleapis.com/token', {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  const data = await r.json();
  if (!r.ok) throw new Error('Google OAuth: ' + (data.error_description || data.error || r.status));
  return data.access_token;
}

async function sendOne(env, token, title, body, url, oauth) {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
    method:'POST',
    headers:{authorization:'Bearer '+oauth,'content-type':'application/json'},
    body:JSON.stringify({message:{token,data:{title:String(title),body:String(body),url:String(url||'./index.html')}}})
  });
  const data=await r.json().catch(()=>({}));
  return {ok:r.ok,data};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});

    if (url.pathname === '/api/register-token' && request.method === 'POST') {
      try {
        const {token}=await request.json();
        if (!token || typeof token !== 'string' || token.length < 20) return json({error:'Token FCM inválido'},400);
        await env.TOKENS.put(token,'1');
        return json({ok:true});
      } catch(e) { return json({error:e.message||'Solicitud inválida'},400); }
    }

    if (url.pathname === '/api/send-notification' && request.method === 'POST') {
      const auth=request.headers.get('Authorization')||'';
      if (!env.ADMIN_KEY || auth !== 'Bearer '+env.ADMIN_KEY) return json({error:'No autorizado'},401);
      try {
        const {title,body,url:targetUrl}=await request.json();
        if (!title || !body) return json({error:'Título y mensaje son obligatorios'},400);
        const listed=await env.TOKENS.list();
        const tokens=listed.keys.map(k=>k.name);
        const oauth=await accessToken(env);
        let sent=0,failed=0;
        // FCM HTTP v1 envía un dispositivo por request. Procesamos en pequeños grupos.
        for(let i=0;i<tokens.length;i+=10){
          const batch=tokens.slice(i,i+10);
          const results=await Promise.all(batch.map(t=>sendOne(env,t,title,body,targetUrl,oauth)));
          for(let j=0;j<results.length;j++){
            if(results[j].ok) sent++;
            else {
              failed++;
              const errText=JSON.stringify(results[j].data||{});
              if(/UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/i.test(errText)) {
                await env.TOKENS.delete(batch[j]);
              }
            }
          }
        }
        return json({ok:true,total:tokens.length,sent,failed});
      } catch(e) { return json({error:e.message||'Error interno'},500); }
    }

    return new Response('Vektolab Push Worker activo',{status:200,headers:{'content-type':'text/plain; charset=utf-8',...CORS}});
  }
};
