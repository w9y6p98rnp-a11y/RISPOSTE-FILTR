const SESSION_COOKIE = 'rf_session';
const SESSION_DAYS = 30;

function json(status, data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }
  });
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
function clearCookie(name) { return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`; }
function uid(prefix='id') { return `${prefix}_${crypto.randomUUID()}`; }
function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function cleanNickname(v) { return String(v || '').trim().replace(/\s+/g, ' ').slice(0, 40); }

function b64(bytes) {
  let s='';
  const arr = new Uint8Array(bytes);
  for (let i=0;i<arr.length;i+=0x8000) s += String.fromCharCode(...arr.subarray(i,i+0x8000));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unb64(s) {
  const x = s.replace(/-/g,'+').replace(/_/g,'/');
  const pad = x.length % 4 ? '='.repeat(4-(x.length%4)) : '';
  const bin = atob(x+pad); return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
async function sha256(text) {
  return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
async function hashPassword(password, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' }, key, 256);
  return { salt: b64(salt), hash: b64(bits) };
}
async function verifyPassword(password, salt, expected) {
  const got = await hashPassword(password, salt);
  return got.hash === expected;
}
function safeUser(row) { return { id: row.id, email: row.email, nickname: row.nickname || '', provider: row.google_sub ? 'google' : 'email', createdAt: row.created_at }; }

async function createSession(env, userId) {
  const raw = b64(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await sha256(raw);
  const expires = Date.now() + SESSION_DAYS*86400000;
  await env.DB.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)')
    .bind(uid('sess'), userId, hash, expires, Date.now()).run();
  return { raw, expires };
}

export async function getSession(request, env) {
  if (!env.DB) return null;
  const raw = request.headers.get('Cookie')?.match(/(?:^|;\s*)rf_session=([^;]+)/)?.[1];
  if (!raw) return null;
  let token; try { token = decodeURIComponent(raw); } catch { return null; }
  const hash = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id,u.email,u.nickname,u.google_sub,u.created_at,s.expires_at
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? LIMIT 1`).bind(hash).first();
  if (!row || Number(row.expires_at) < Date.now()) return null;
  return safeUser(row);
}

export async function requireAuth(request, env) {
  const user = await getSession(request, env);
  if (!user) throw new Response(JSON.stringify({error:'Devi effettuare l\'accesso.'}), {status:401,headers:{'Content-Type':'application/json'}});
  return user;
}

async function register(request, env) {
  const body = await request.json().catch(()=>({}));
  const nickname = cleanNickname(body.nickname);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (nickname.length < 2) return json(400,{error:'Inserisci un nickname di almeno 2 caratteri.'});
  if (!validEmail(email)) return json(400,{error:'Inserisci un indirizzo email valido.'});
  if (password.length < 8) return json(400,{error:'La password deve contenere almeno 8 caratteri.'});
  const exists = await env.DB.prepare('SELECT id FROM users WHERE email=? LIMIT 1').bind(email).first();
  if (exists) return json(409,{error:'Esiste già un account con questa email.'});
  const hp = await hashPassword(password);
  const userId = uid('user');
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO users(id,email,nickname,password_hash,password_salt,google_sub,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(userId,email,nickname,hp.hash,hp.salt,null,now,now).run();
  const session = await createSession(env,userId);
  return json(200,{user:{id:userId,email,nickname,provider:'email',createdAt:now}}, {'Set-Cookie':cookie(SESSION_COOKIE,session.raw,SESSION_DAYS*86400)});
}

async function login(request, env) {
  const body = await request.json().catch(()=>({}));
  const email = normalizeEmail(body.email); const password=String(body.password||'');
  const row = await env.DB.prepare('SELECT * FROM users WHERE email=? LIMIT 1').bind(email).first();
  if (!row || !row.password_hash || !(await verifyPassword(password,row.password_salt,row.password_hash))) return json(401,{error:'Email o password non corretti.'});
  const session=await createSession(env,row.id);
  return json(200,{user:safeUser(row)}, {'Set-Cookie':cookie(SESSION_COOKIE,session.raw,SESSION_DAYS*86400)});
}

async function googleLogin(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json(503,{error:'Accesso Google non ancora configurato.'});
  if (request.headers.get('X-Requested-With') !== 'XmlHttpRequest') return json(403,{error:'Richiesta Google non valida.'});
  const body=await request.json().catch(()=>({})); const code=String(body.code||'');
  if(!code) return json(400,{error:'Codice Google mancante.'});
  const origin=new URL(request.url).origin;
  const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,grant_type:'authorization_code',redirect_uri:origin}).toString()});
  const tokens=await tokenRes.json().catch(()=>({}));
  if(!tokenRes.ok || !tokens.access_token) return json(401,{error:'Google non ha autorizzato l\'accesso.'});
  const infoRes=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`}});
  const info=await infoRes.json().catch(()=>({}));
  if(!infoRes.ok || !info.sub || !info.email || info.email_verified===false) return json(401,{error:'Non è stato possibile verificare l\'account Google.'});
  const email=normalizeEmail(info.email); const googleSub=String(info.sub); const nickname=cleanNickname(info.name || email.split('@')[0]) || 'Utente';
  let row=await env.DB.prepare('SELECT * FROM users WHERE google_sub=? OR email=? LIMIT 1').bind(googleSub,email).first();
  const now=Date.now();
  if(!row){
    const userId=uid('user');
    await env.DB.prepare(`INSERT INTO users(id,email,nickname,password_hash,password_salt,google_sub,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(userId,email,nickname,null,null,googleSub,now,now).run();
    row=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userId).first();
  } else if(!row.google_sub){
    await env.DB.prepare('UPDATE users SET google_sub=?,updated_at=? WHERE id=?').bind(googleSub,now,row.id).run();
    row=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(row.id).first();
  }
  const session=await createSession(env,row.id);
  return json(200,{user:safeUser(row)}, {'Set-Cookie':cookie(SESSION_COOKIE,session.raw,SESSION_DAYS*86400)});
}

async function logout(request, env) {
  const raw=request.headers.get('Cookie')?.match(/(?:^|;\s*)rf_session=([^;]+)/)?.[1];
  if(raw){try{const hash=await sha256(decodeURIComponent(raw));await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();}catch{}}
  return json(200,{ok:true},{'Set-Cookie':clearCookie(SESSION_COOKIE)});
}

async function me(request, env){ const user=await getSession(request,env); return json(200,{authenticated:!!user,user:user||null}); }

async function forgot(request,env){
  const body=await request.json().catch(()=>({})); const email=normalizeEmail(body.email);
  // Risposta volutamente generica per non rivelare quali email sono registrate.
  const generic={message:'Se l\'email è registrata, riceverai le istruzioni per reimpostare la password.'};
  if(!validEmail(email)) return json(200,generic);
  const user=await env.DB.prepare('SELECT id,nickname,email,google_sub FROM users WHERE email=? LIMIT 1').bind(email).first();
  if(!user || user.google_sub || !env.RESEND_API_KEY) return json(200,generic);
  const raw=b64(crypto.getRandomValues(new Uint8Array(32))); const tokenHash=await sha256(raw); const expires=Date.now()+30*60*1000;
  await env.DB.prepare('DELETE FROM password_resets WHERE user_id=?').bind(user.id).run();
  await env.DB.prepare('INSERT INTO password_resets(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind(uid('reset'),user.id,tokenHash,expires,Date.now()).run();
  const link=`${new URL(request.url).origin}/?reset=${encodeURIComponent(raw)}`;
  const from=env.RESEND_FROM || 'RispostaFlirt <onboarding@resend.dev>';
  await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[email],subject:'Reimposta la password di RispostaFlirt',html:`<p>Ciao ${escapeHtml(user.nickname||'')},</p><p>Hai richiesto di reimpostare la password di RispostaFlirt.</p><p><a href="${link}">Reimposta la password</a></p><p>Il link scade tra 30 minuti.</p>`})});
  return json(200,generic);
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function resetPassword(request,env){
  const body=await request.json().catch(()=>({})); const token=String(body.token||''); const password=String(body.password||'');
  if(!token || password.length<8) return json(400,{error:'Token non valido o password troppo corta.'});
  const hash=await sha256(token); const row=await env.DB.prepare('SELECT id,user_id,expires_at FROM password_resets WHERE token_hash=? LIMIT 1').bind(hash).first();
  if(!row || Number(row.expires_at)<Date.now()) return json(400,{error:'Il link per reimpostare la password è scaduto o non è valido.'});
  const hp=await hashPassword(password); const now=Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?').bind(hp.hash,hp.salt,now,row.user_id),
    env.DB.prepare('DELETE FROM password_resets WHERE id=?').bind(row.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(row.user_id)
  ]);
  const session=await createSession(env,row.user_id); const u=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(row.user_id).first();
  return json(200,{user:safeUser(u)}, {'Set-Cookie':cookie(SESSION_COOKIE,session.raw,SESSION_DAYS*86400)});
}

async function getData(request,env,user){
  const uidv=user.id;
  const [girls,messages,states,settings]=await Promise.all([
    env.DB.prepare('SELECT id,name,note,memory,created_at AS createdAt,updated_at AS updatedAt FROM girls WHERE user_id=? ORDER BY updated_at DESC').bind(uidv).all(),
    env.DB.prepare('SELECT client_id AS clientId,girl_id AS girlId,role,text,image_data AS imageData,created_at AS createdAt FROM messages WHERE user_id=? ORDER BY created_at ASC').bind(uidv).all(),
    env.DB.prepare('SELECT girl_id AS girlId,message,image_data AS imageData,image_name AS imageName,results_html AS resultsHtml,role,ai_hint AS aiHint,updated_at AS updatedAt FROM girl_states WHERE user_id=?').bind(uidv).all(),
    env.DB.prepare('SELECT value FROM settings WHERE user_id=? AND key=? LIMIT 1').bind(uidv,'app').first()
  ]);
  return json(200,{user, girls:girls.results||[], messages:messages.results||[], girlStates:states.results||[], settings:settings?.value?JSON.parse(settings.value):null});
}

async function syncData(request,env,user){
  const body=await request.json().catch(()=>({})); const uidv=user.id;
  const girls=Array.isArray(body.girls)?body.girls:[]; const messages=Array.isArray(body.messages)?body.messages:[]; const states=Array.isArray(body.girlStates)?body.girlStates:[];
  if(girls.length>500 || messages.length>5000 || states.length>500) return json(413,{error:'Troppi dati in una sola sincronizzazione.'});
  const statements=[];
  for(const g of girls){ if(!g?.id || !g?.name) continue; statements.push(env.DB.prepare(`INSERT INTO girls(id,user_id,name,note,memory,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,note=excluded.note,memory=excluded.memory,updated_at=excluded.updated_at WHERE girls.user_id=excluded.user_id`).bind(String(g.id),uidv,String(g.name).slice(0,80),String(g.note||'').slice(0,160),String(g.memory||''),Number(g.createdAt)||Date.now(),Number(g.updatedAt)||Date.now())); }
  for(const m of messages){ if(!m?.girlId || !m?.clientId) continue; statements.push(env.DB.prepare(`INSERT INTO messages(id,user_id,girl_id,client_id,role,text,image_data,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,client_id) DO UPDATE SET text=excluded.text,image_data=excluded.image_data,created_at=excluded.created_at`).bind(uid('msg'),uidv,String(m.girlId),String(m.clientId),m.role==='her'?'her':'me',String(m.text||''),m.imageData?String(m.imageData):null,Number(m.createdAt)||Date.now())); }
  for(const s of states){ if(!s?.girlId) continue; statements.push(env.DB.prepare(`INSERT INTO girl_states(user_id,girl_id,message,image_data,image_name,results_html,role,ai_hint,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,girl_id) DO UPDATE SET message=excluded.message,image_data=excluded.image_data,image_name=excluded.image_name,results_html=excluded.results_html,role=excluded.role,ai_hint=excluded.ai_hint,updated_at=excluded.updated_at`).bind(uidv,String(s.girlId),String(s.message||''),s.imageData?String(s.imageData):null,String(s.imageName||''),String(s.resultsHtml||''),s.role==='me'?'me':'her',String(s.aiHint||''),Number(s.updatedAt)||Date.now())); }
  if(body.settings) statements.push(env.DB.prepare(`INSERT INTO settings(user_id,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(uidv,'app',JSON.stringify(body.settings),Date.now()));
  if(statements.length){ for(let i=0;i<statements.length;i+=80) await env.DB.batch(statements.slice(i,i+80)); }
  return json(200,{ok:true});
}

export async function onAuthRequest(request,env,ctx){
  const path=new URL(request.url).pathname;
  try{
    if(path==='/api/auth/config') return json(200,{googleClientId:env.GOOGLE_CLIENT_ID||''});
    if(path==='/api/auth/me' && request.method==='GET') return me(request,env);
    if(path==='/api/auth/register' && request.method==='POST') return register(request,env);
    if(path==='/api/auth/login' && request.method==='POST') return login(request,env);
    if(path==='/api/auth/google' && request.method==='POST') return googleLogin(request,env);
    if(path==='/api/auth/logout' && request.method==='POST') return logout(request,env);
    if(path==='/api/auth/forgot' && request.method==='POST') return forgot(request,env);
    if(path==='/api/auth/reset' && request.method==='POST') return resetPassword(request,env);
    if(path==='/api/data' && request.method==='GET'){ const user=await requireAuth(request,env); return getData(request,env,user); }
    if(path==='/api/data/sync' && request.method==='POST'){ const user=await requireAuth(request,env); return syncData(request,env,user); }
    return null;
  }catch(e){
    if(e instanceof Response) return e;
    console.error('Auth error',e); return json(500,{error:e?.message||'Errore autenticazione.'});
  }
}
