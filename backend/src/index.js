// Cloudflare Worker: MEEG secure API (no browser-side database credentials).
// Deploy behind a custom same-site domain; set TURSO_URL, TURSO_TOKEN and SESSION_SECRET as Worker secrets.
const te = new TextEncoder();
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const decode = v => Uint8Array.from(atob(v.replace(/-/g,"+").replace(/_/g,"/")), c=>c.charCodeAt(0));
async function mac(secret,data){const k=await crypto.subtle.importKey("raw",te.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",k,te.encode(data))));}
function equals(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function sessionToken(user,env){const payload=b64url(te.encode(JSON.stringify({id:user.id,role:user.role,exp:Math.floor(Date.now()/1000)+28800})));return payload+"."+(await mac(env.SESSION_SECRET,payload));}
async function verifySession(request,env){
  const cookie=request.headers.get("Cookie")||"";
  const token=cookie.match(/(?:^|;\s*)meeg_session=([^;]+)/)?.[1];
  if(!token)return null;
  const [body,sig,...extra]=token.split(".");
  if(!body||!sig||extra.length||!equals(await mac(env.SESSION_SECRET,body),sig))return null;
  let p;try{p=JSON.parse(new TextDecoder().decode(decode(body)));}catch{return null;}
  if(!p.id||!p.exp||p.exp<Math.floor(Date.now()/1000))return null;
  const rows=await db(env,"SELECT id,username,full_name,role,allowed_pages,status FROM dashboard_users WHERE id=? LIMIT 1",[p.id]);
  const u=rows[0];
  if(!u||u.status!=="active"||u.role!==p.role)return null;
  return u;
}
async function db(env,sql,params=[]){
  if(!env.TURSO_URL||!env.TURSO_TOKEN)throw Error("Database secrets missing");
  const endpoint=env.TURSO_URL.replace(/\/v2\/pipeline\/?$/,"").replace(/\/$/,"")+"/v2/pipeline";
  const args=params.map(v=>v===null?{type:"null"}:typeof v==="number"?{type:"integer",value:String(v)}:{type:"text",value:String(v)});
  const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+env.TURSO_TOKEN},body:JSON.stringify({requests:[{type:"execute",stmt:{sql,args}}]})});
  if(!res.ok)throw Error("Database unavailable");
  const result=(await res.json()).results?.[0];
  if(!result||result.type==="error")throw Error("Database query failed");
  const data=result.response?.result;const cols=(data?.cols||[]).map(c=>c.name);
  return (data?.rows||[]).map(row=>Object.fromEntries(row.map((c,i)=>[cols[i],c?.value??null])));
}
async function checkPassword(password,stored){
  // Only salted PBKDF2 hashes are accepted. Legacy cleartext passwords must be migrated offline.
  const parts=String(stored||"").split("$");
  if(parts.length!==4||parts[0]!=="pbkdf2-sha256")return false;
  const iterations=Number(parts[1]);
  if(!Number.isInteger(iterations)||iterations<310000||iterations>1000000)return false;
  let salt,expected;try{salt=decode(parts[2]);expected=decode(parts[3]);}catch{return false;}
  if(salt.length<16||expected.length!==32)return false;
  const key=await crypto.subtle.importKey("raw",te.encode(password),"PBKDF2",false,["deriveBits"]);
  const derived=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256));
  let diff=0;for(let i=0;i<32;i++)diff|=derived[i]^expected[i];
  return diff===0;
}
function cors(request,env){const o=request.headers.get("Origin");const allowed=(env.ALLOWED_ORIGIN||"").split(",").map(x=>x.trim());return o&&allowed.includes(o)?{"Access-Control-Allow-Origin":o,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin"}:{};}
function cookie(value){return "meeg_session="+value+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+(value?28800:0);}
export default {async fetch(request,env){
  const origin=request.headers.get("Origin");
  const headers=cors(request,env);
  if(origin&&!headers["Access-Control-Allow-Origin"])return json({error:"origin_not_allowed"},403);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  const url=new URL(request.url);
  try{
    if(url.pathname==="/api/health"&&request.method==="GET")return json({ok:true},200,headers);
    if(url.pathname==="/api/auth/login"&&request.method==="POST"){
      const body=await request.json();const username=String(body.username||"").trim().slice(0,128);const password=String(body.password||"");
      if(!username||!password||password.length>1024)return json({error:"invalid_credentials"},401,headers);
      const users=await db(env,"SELECT id,username,full_name,role,allowed_pages,status,password FROM dashboard_users WHERE LOWER(username)=LOWER(?) LIMIT 1",[username]);
      const u=users[0];
      if(!u||u.status!=="active"||!(await checkPassword(password,u.password)))return json({error:"invalid_credentials"},401,headers);
      const token=await sessionToken(u,env);
      return json({ok:true,user:{id:u.id,username:u.username,full_name:u.full_name,role:u.role,allowed_pages:u.allowed_pages}},200,{"Set-Cookie":cookie(token),...headers});
    }
    if(url.pathname==="/api/auth/logout"&&request.method==="POST")return json({ok:true},200,{"Set-Cookie":cookie(""),...headers});
    const user=await verifySession(request,env);
    if(!user)return json({error:"unauthorized"},401,headers);
    if(url.pathname==="/api/me"&&request.method==="GET")return json({user},200,headers);
    if(url.pathname==="/api/analytics/summary"&&request.method==="GET"){
      const pages=String(user.allowed_pages||"").split(",").map(x=>x.trim());
      if(user.role!=="admin"&&!pages.some(p=>["overview","analysis"].includes(p)))return json({error:"forbidden"},403,headers);
      const rows=await db(env,"SELECT COUNT(*) AS tasks, COUNT(DISTINCT labeler_name) AS labelers FROM task_submissions");
      return json({summary:rows[0]},200,headers);
    }
    return json({error:"not_found"},404,headers);
  }catch(e){return json({error:"server_error"},500,headers);}
}};
