'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { URL } = require('node:url');
const ROOT=__dirname, PUBLIC=path.join(ROOT,'public'), UPLOADS=path.join(ROOT,'uploads'), DATA=path.join(ROOT,'data');
const PORT=Number(process.env.PORT||3000), HOST=process.env.HOST||'127.0.0.1';
const MAX_JSON=1024*1024, MAX_UPLOAD=6*1024*1024;
const STORAGE=process.env.MEDIA_STORAGE||((process.env.BLOB_READ_WRITE_TOKEN)?'vercel-blob':'local');
if(!process.env.VERCEL){fs.mkdirSync(UPLOADS,{recursive:true});fs.mkdirSync(DATA,{recursive:true});}
const db=new DatabaseSync(path.join(DATA,'blog.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS authors(id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '', social TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS articles(id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, deck TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, author_id INTEGER REFERENCES authors(id) ON DELETE SET NULL, image TEXT NOT NULL DEFAULT '', image_caption TEXT NOT NULL DEFAULT '', image_alt TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')), featured INTEGER NOT NULL DEFAULT 0, breaking INTEGER NOT NULL DEFAULT 0, video_id INTEGER, published_at TEXT, updated_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS article_authors(article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE, author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE, position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(article_id,author_id));
CREATE TABLE IF NOT EXISTS videos(id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, author_id INTEGER REFERENCES authors(id) ON DELETE SET NULL, url TEXT NOT NULL DEFAULT '', thumbnail TEXT NOT NULL DEFAULT '', duration TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subscribers(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, subscribed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
// Upgrade existing local newsroom databases without deleting content.
for(const statement of ["ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'", "ALTER TABLE users ADD COLUMN author_id INTEGER REFERENCES authors(id) ON DELETE SET NULL"]){try{db.exec(statement)}catch(e){if(!/duplicate column/i.test(e.message))throw e}}
db.exec('CREATE TABLE IF NOT EXISTS login_limits (key_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL, blocked_until INTEGER NOT NULL DEFAULT 0)');
db.exec(`CREATE TABLE IF NOT EXISTS media_assets(id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, filename TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', alt TEXT NOT NULL DEFAULT '', mime_type TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0, provider TEXT NOT NULL DEFAULT 'local', uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL);`);
const now=()=>new Date().toISOString();
const slug=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
const safeStr=(v,n=10000)=>String(v??'').slice(0,n);
const cleanUrl=s=>{s=safeStr(s,1000).trim();return /^(https?:\/\/[^\s]+|\/uploads\/[\w.\-]+|\/brand-logo\.jpeg)$/.test(s)?s:''};
const query=(sql,...args)=>db.prepare(sql).all(...args);
const one=(sql,...args)=>db.prepare(sql).get(...args);
const run=(sql,...args)=>db.prepare(sql).run(...args);
const defaults={site_title:'Vickipedia News',tagline:'The stories shaping today',description:'Independent Nigerian news, analysis and video.',contact_email:'',logo:fs.existsSync(path.join(PUBLIC,'brand-logo.jpeg'))?'/brand-logo.jpeg':'',facebook:'',instagram:'',linkedin:'',tiktok:'',about:'Vickipedia News — update this page from the CMS.',standards:'Our editorial standards will be published here.',privacy:'Our privacy policy will be published here.',footer_text:'News, perspective and video.',announcement:''};
for(const [key,value] of Object.entries(defaults))run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,value);
if(!one('SELECT id FROM articles LIMIT 1')&&!one('SELECT id FROM authors LIMIT 1')){
 const seed=JSON.parse(fs.readFileSync(path.join(DATA,'seed.json'),'utf8'));
 const names=['News','Politics','Editorial','Opinion','Gists','Entertainment','Metro','Foreign','Sports','Technology','Finance'];
 for(const name of names)run('INSERT OR IGNORE INTO categories(slug,name,created_at) VALUES(?,?,?)',slug(name),name,now());
 for(const [key,a] of Object.entries(seed.authors))run('INSERT INTO authors(slug,name,role,bio,created_at) VALUES(?,?,?,?,?)',key,a.name,a.role,a.bio,now());
 for(const a of seed.articles){const cat=one('SELECT id FROM categories WHERE name=?',a.category);const author=one('SELECT id FROM authors WHERE slug=?',a.author);run(`INSERT INTO articles(slug,title,deck,body,category_id,author_id,image_alt,tags,status,featured,breaking,published_at,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,a.id,a.title,a.deck,a.body,cat?.id||null,author?.id||null,a.image||'',(a.tags||[]).join(', '),'published',a.featured?1:0,a.breaking?1:0,new Date(a.date+' '+(a.time||'12:00 PM')).toISOString(),now(),now());}
 for(const v of seed.videos){const cat=one('SELECT id FROM categories WHERE name=?',v.category);const author=one('SELECT id FROM authors WHERE slug=?',v.author);run('INSERT INTO videos(slug,title,summary,category_id,author_id,duration,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',v.id,v.title,v.summary,cat?.id||null,author?.id||null,v.duration,'draft',now(),now());}
}
run('INSERT OR IGNORE INTO article_authors(article_id,author_id,position) SELECT a.id,a.author_id,0 FROM articles a WHERE a.author_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM article_authors aa WHERE aa.article_id=a.id)');
const json=(res,status,data,extra={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra});res.end(JSON.stringify(data))};
const error=(res,status,message)=>json(res,status,{error:message});
const escapeXml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const passwordHash=(password,salt=crypto.randomBytes(16).toString('hex'))=>salt+':'+crypto.scryptSync(password,salt,64).toString('hex');
const verifyPassword=(password,encoded)=>{const [salt,digest]=encoded.split(':');if(!salt||!digest)return false;const a=Buffer.from(digest,'hex'),b=Buffer.from(passwordHash(password,salt).split(':')[1],'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split(/=(.*)/s).slice(0,2)).filter(x=>x[0]));
function session(req){const token=cookies(req).vicki_session;if(!token)return null;return one('SELECT u.id,u.email,u.role,u.author_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',hash(token),Date.now())||null}
function setSession(req,res,userId){const token=crypto.randomBytes(32).toString('hex');run('DELETE FROM sessions WHERE expires_at<?',Date.now());run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',hash(token),userId,Date.now()+7*864e5);return `vicki_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7*86400}${req.socket.encrypted||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`}
async function body(req,limit=MAX_JSON){return await new Promise((resolve,reject)=>{let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>limit){reject(Object.assign(new Error('File/request too large'),{status:413}));req.destroy();return;}chunks.push(c)});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject)})}
const articleSelect=`SELECT a.*,c.name category,c.slug category_slug,au.name author_name,au.slug author_slug,au.role author_role,au.avatar author_avatar,(SELECT group_concat(author_id,',') FROM (SELECT aa.author_id FROM article_authors aa WHERE aa.article_id=a.id ORDER BY aa.position)) author_ids FROM articles a LEFT JOIN categories c ON c.id=a.category_id LEFT JOIN authors au ON au.id=a.author_id`;
const videoSelect=`SELECT v.*,c.name category,c.slug category_slug,au.name author_name,au.slug author_slug FROM videos v LEFT JOIN categories c ON c.id=v.category_id LEFT JOIN authors au ON au.id=v.author_id`;
function readableDate(s){return s?new Date(s).toUTCString():''}
function allowedOrigin(req){const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===req.headers.host}catch{return false}}
function validMime(buf){if(buf.length<8)return '';if(buf.subarray(0,3).equals(Buffer.from([255,216,255])))return 'jpg';if(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';if(buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')return 'webp';if(['GIF87a','GIF89a'].includes(buf.toString('ascii',0,6)))return 'gif';return ''}
function bindArticle(v,prev={}){const title=safeStr(v.title,200).trim();if(!title)throw Error('Title is required');const id=slug(v.slug||title);if(!id)throw Error('Valid slug required');const status=v.status==='published'?'published':'draft';return {slug:id,title,deck:safeStr(v.deck,600),body:safeStr(v.body,250000),category_id:v.category_id?Number(v.category_id):null,author_id:v.author_id?Number(v.author_id):null,image:cleanUrl(v.image),image_caption:safeStr(v.image_caption,500),image_alt:safeStr(v.image_alt,250),tags:safeStr(v.tags,500),status,featured:v.featured?1:0,breaking:v.breaking?1:0,video_id:v.video_id?Number(v.video_id):null,published_at:status==='published'?(prev.published_at||now()):null,updated_at:now()}}
function bindVideo(v){if(!safeStr(v.title).trim())throw Error('Title is required');return {slug:slug(v.slug||v.title),title:safeStr(v.title,200),summary:safeStr(v.summary,2500),category_id:v.category_id?Number(v.category_id):null,author_id:v.author_id?Number(v.author_id):null,url:cleanUrl(v.url),thumbnail:cleanUrl(v.thumbnail),duration:safeStr(v.duration,30),status:v.status==='published'?'published':'draft',updated_at:now()}}
function writeRow(table,obj,id=null){const keys=Object.keys(obj);if(id){const result=run(`UPDATE ${table} SET ${keys.map(k=>k+'=?').join(',')} WHERE id=?`,...keys.map(k=>obj[k]),id);if(!result.changes)throw Error('Record not found');return id}const result=run(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,...keys.map(k=>obj[k]));return Number(result.lastInsertRowid)}
function serveFile(res,filepath){const ext=path.extname(filepath).toLowerCase(),types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.mp4':'video/mp4','.webm':'video/webm'};try{const bytes=fs.readFileSync(filepath);res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','x-content-type-options':'nosniff','cache-control':'public, max-age=300'});res.end(bytes)}catch{error(res,404,'File not found')}}
function renderShell(req,res,pathname){let title=one('SELECT value FROM settings WHERE key=?','site_title').value,desc=defaults.description;
if(pathname.startsWith('/article/')){const a=one(articleSelect+' WHERE a.slug=? AND a.status=?',pathname.split('/')[2],'published');if(a){title=a.title+' | '+title;desc=a.deck||desc}}
else if(pathname.startsWith('/category/'))title=pathname.split('/')[2]+' | '+title;
else if(pathname==='/admin')title='CMS | '+title;
let html=fs.readFileSync(path.join(PUBLIC,'index.html'),'utf8');html=html.replace('__TITLE__',escapeXml(title)).replace('__DESCRIPTION__',escapeXml(desc)).replace('__CANONICAL__',escapeXml((process.env.SITE_URL||`http://${req.headers.host}`)+pathname));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(html)}
async function loginRate(req,email,success=false){
 const ip=safeStr(String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0],80);
 const key=hash(email.toLowerCase()+'|'+ip),time=Date.now();
 const row=one('SELECT * FROM login_limits WHERE key_hash=?',key);
 if(success){run('DELETE FROM login_limits WHERE key_hash=?',key);return true}
 if(row&&row.blocked_until>time)return false;
 const attempts=row&&row.window_start>time-15*60*1000?row.attempts+1:1;
 const blocked=attempts>=8?time+15*60*1000:0;
 run('INSERT INTO login_limits(key_hash,attempts,window_start,blocked_until) VALUES(?,?,?,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start,blocked_until=excluded.blocked_until',key,attempts,attempts===1?time:row.window_start,blocked);
 return !blocked;
}
async function api(req,res,u){const p=u.pathname,method=req.method,user=session(req),admin=p.startsWith('/api/admin');if(['POST','PUT','PATCH','DELETE'].includes(method)&&!allowedOrigin(req))return error(res,403,'Origin mismatch');
 if(p==='/api/public'){const settings=Object.fromEntries(query('SELECT * FROM settings').map(x=>[x.key,x.value]));const articles=query(articleSelect+" WHERE a.status='published' ORDER BY a.featured DESC,a.published_at DESC LIMIT 200");const videos=query(videoSelect+" WHERE v.status='published' ORDER BY v.created_at DESC LIMIT 100");return json(res,200,{settings,articles,videos,authors:query('SELECT * FROM authors ORDER BY name'),categories:query('SELECT * FROM categories ORDER BY id')})}
 if(p==='/api/subscribe'&&method==='POST'){let x=JSON.parse((await body(req)).toString()||'{}');const email=safeStr(x.email,254).trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return error(res,400,'Enter a valid email address');run('INSERT OR IGNORE INTO subscribers(email,subscribed_at) VALUES(?,?)',email,now());return json(res,200,{message:'Subscribed successfully'})}
 if(p==='/api/admin/state'&&method==='GET')return json(res,200,{setupRequired:!one('SELECT id FROM users LIMIT 1'),authenticated:!!user,user:user?{email:user.email,role:user.role,author_id:user.author_id}:null});
 if(p==='/api/admin/setup'&&method==='POST'){if(one('SELECT id FROM users LIMIT 1'))return error(res,403,'Setup already completed');const x=JSON.parse((await body(req)).toString());if(process.env.VERCEL||process.env.NODE_ENV==='production'){
  if(!process.env.CMS_SETUP_TOKEN||process.env.CMS_SETUP_TOKEN.length<24)return error(res,503,'CMS_SETUP_TOKEN (24+ characters) is required before the first administrator can be created');
  const expected=hash(process.env.CMS_SETUP_TOKEN),received=hash(String(x.setup_token||''));
  if(!crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(received,'hex')))return error(res,403,'Invalid setup token');
 }if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email||'')||String(x.password||'').length<8)return error(res,400,'Valid email and password of at least 8 characters required');const id=writeRow('users',{email:x.email.toLowerCase(),password_hash:passwordHash(x.password),role:'admin',created_at:now()});return json(res,200,{ok:true},{'set-cookie':setSession(req,res,id)})}
 if(p==='/api/admin/login'&&method==='POST'){const x=JSON.parse((await body(req)).toString());const email=safeStr(x.email).trim().toLowerCase();const keyAllowed=loginRate(req,email);if(!keyAllowed)return error(res,429,'Too many login attempts. Try again later');const match=one('SELECT * FROM users WHERE email=?',email);if(!match||!verifyPassword(String(x.password||''),match.password_hash))return error(res,401,'Invalid email or password');loginRate(req,email,true);return json(res,200,{ok:true},{'set-cookie':setSession(req,res,match.id)})}
 if(p==='/api/admin/logout'&&method==='POST'){const token=cookies(req).vicki_session;if(token)run('DELETE FROM sessions WHERE token_hash=?',hash(token));return json(res,200,{ok:true},{'set-cookie':'vicki_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
 if(admin&&!user&&p!=='/api/admin/media/blob-client')return error(res,401,'Log in to access the CMS');
 const isAdmin=user?.role==='admin',isEditor=user?.role==='editor'||isAdmin,isAuthor=user?.role==='author';
 if(admin&&user&&(!['admin','editor','author'].includes(user.role)))return error(res,403,'Invalid newsroom role');
 if(admin&&user&&!isAdmin&&(p.startsWith('/api/admin/settings')||p.startsWith('/api/admin/subscribers')||p==='/api/admin/users'))return error(res,403,'Administrator permissions required');

 if(p==='/api/admin/my-profile'){
  if(!user?.author_id)return error(res,404,'Your account is not linked to a contributor profile');
  if(method==='GET')return json(res,200,one('SELECT * FROM authors WHERE id=?',user.author_id));
  if(method==='PUT'){const x=JSON.parse((await body(req)).toString());run('UPDATE authors SET bio=?,avatar=?,social=? WHERE id=?',safeStr(x.bio,5000),cleanUrl(x.avatar),safeStr(x.social,1500),user.author_id);return json(res,200,{ok:true})}
 }
 if(p==='/api/admin/users'){
  if(!isAdmin)return error(res,403,'Administrator permissions required');
  if(method==='GET')return json(res,200,query('SELECT u.id,u.email,u.role,u.author_id,a.name author_name,u.created_at FROM users u LEFT JOIN authors a ON a.id=u.author_id ORDER BY u.id'));
  if(method==='POST'){const x=JSON.parse((await body(req)).toString());if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email||'')||String(x.password||'').length<8||!['admin','editor','author'].includes(x.role))return error(res,400,'Valid email, role and password (8+ characters) required');
   const aid=x.role==='author'?Number(x.author_id):null;if(x.role==='author'&&(!aid||!one('SELECT id FROM authors WHERE id=?',aid)))return error(res,400,'Link the login to an existing contributor profile');
   if(aid&&one('SELECT id FROM users WHERE author_id=?',aid))return error(res,409,'This contributor already has a login');
   const id=writeRow('users',{email:String(x.email).toLowerCase().trim(),password_hash:passwordHash(x.password),role:x.role,author_id:aid,created_at:now()});return json(res,201,{id,ok:true});
  }
  if(method==='PUT'){const x=JSON.parse((await body(req)).toString());const id=Number(x.id);const target=one('SELECT * FROM users WHERE id=?',id);if(!target)return error(res,404,'Account not found');if(!['admin','editor','author'].includes(x.role))return error(res,400,'Invalid role');if(id===user.id&&x.role!=='admin')return error(res,400,'Cannot demote your active administrator account');
   const aid=x.role==='author'?Number(x.author_id):null;if(x.role==='author'&&(!aid||!one('SELECT id FROM authors WHERE id=?',aid)))return error(res,400,'Contributor profile required');if(x.password&&String(x.password).length<8)return error(res,400,'Password must have at least 8 characters');
   const conflict=aid?one('SELECT id FROM users WHERE author_id=? AND id<>?',aid,id):null;if(conflict)return error(res,409,'Contributor already has a login');
   run('UPDATE users SET role=?,author_id=? WHERE id=?',x.role,aid,id);
   if(x.password){if(String(x.password).length<8)return error(res,400,'Password must have at least 8 characters');run('UPDATE users SET password_hash=? WHERE id=?',passwordHash(x.password),id);run('DELETE FROM sessions WHERE user_id=?',id)}
   return json(res,200,{ok:true});
  }
 }
 if(p==='/api/admin/media-assets'){
  if(method==='GET')return json(res,200,query('SELECT m.*,u.email uploaded_by_email FROM media_assets m LEFT JOIN users u ON u.id=m.uploaded_by ORDER BY m.id DESC LIMIT 1000'));
  if(method==='POST'){const x=JSON.parse((await body(req)).toString());const url=cleanUrl(x.url),mime=safeStr(x.mime_type,100),filename=safeStr(x.filename,180),size=Number(x.bytes)||0;
   if(!url||!['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm'].includes(mime)||size<0||size>250*1024*1024)return error(res,400,'Unsupported asset');
   const trusted=url.startsWith('/uploads/')|| (STORAGE==='vercel-blob'&&url.startsWith('https://')&&/\.public\.blob\.vercel-storage\.com(?:\/|$)/.test(new URL(url).hostname+'/')) || (STORAGE==='s3'&&process.env.S3_PUBLIC_BASE_URL&&url.startsWith(process.env.S3_PUBLIC_BASE_URL.replace(/\/$/,'')+'/'));
   if(!trusted)return error(res,400,'Asset URL must belong to configured media storage');
   let existing=one('SELECT id FROM media_assets WHERE url=?',url);if(existing)return json(res,200,{id:existing.id,ok:true});
   const id=writeRow('media_assets',{url,filename,title:safeStr(x.title||filename,180),alt:safeStr(x.alt,300),mime_type:mime,bytes:size,provider:STORAGE,uploaded_by:user.id,created_at:now()});return json(res,201,{id,ok:true});
  }
  if(method==='PUT'){const x=JSON.parse((await body(req)).toString());const asset=one('SELECT uploaded_by FROM media_assets WHERE id=?',Number(x.id));if(!asset)return error(res,404,'Asset not found');if(!isEditor&&asset.uploaded_by!==user.id)return error(res,403,'Only the uploader or an editor may change asset details');run('UPDATE media_assets SET title=?,alt=? WHERE id=?',safeStr(x.title,180),safeStr(x.alt,300),Number(x.id));return json(res,200,{ok:true})}
  if(method==='DELETE'){if(!isEditor)return error(res,403,'Editor permission required');const x=JSON.parse((await body(req)).toString());run('DELETE FROM media_assets WHERE id=?',Number(x.id));return json(res,200,{ok:true,note:'Asset removed from library; physical file retained to avoid breaking published content'})}
 }
 if(p==='/api/admin/dashboard'&&method==='GET'){return json(res,200,{articles:one('SELECT COUNT(*) n FROM articles').n,published:one("SELECT COUNT(*) n FROM articles WHERE status='published'").n,drafts:one("SELECT COUNT(*) n FROM articles WHERE status='draft'").n,subscribers:one('SELECT COUNT(*) n FROM subscribers').n,videos:one('SELECT COUNT(*) n FROM videos').n,recent:query(articleSelect+' ORDER BY a.updated_at DESC LIMIT 8')})}
 if(p==='/api/admin/upload'&&method==='POST'){
  const incoming=req.headers['content-type']||'',nameHeader=safeStr(req.headers['x-file-name']||'',150);
  const isVideo=incoming.startsWith('video/');
  const data=await body(req,MAX_UPLOAD);
  const ext=isVideo?(data.subarray(4,8).toString()==='ftyp'?'mp4':data.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))?'webm':''):validMime(data);
  if(!ext)return error(res,415,'Unsupported media type: JPEG, PNG, GIF, WebP, MP4 or WebM only');
  const name=crypto.randomBytes(16).toString('hex')+'.'+ext;
  const type={jpg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',mp4:'video/mp4',webm:'video/webm'}[ext];
  if(STORAGE==='vercel-blob'){
    if(!process.env.BLOB_READ_WRITE_TOKEN)return error(res,503,'Blob token is not configured');
    let put;try{({put}=require('@vercel/blob'))}catch{return error(res,503,'Install @vercel/blob to enable Vercel Blob uploads')}
    const result=await put('vickipedia/'+name,data,{access:'public',contentType:type,addRandomSuffix:false,token:process.env.BLOB_READ_WRITE_TOKEN});
    return json(res,201,{url:result.url,storage:'vercel-blob'});
  }
  if(STORAGE!=='local')return error(res,503,'Storage provider not configured: '+STORAGE);
  fs.writeFileSync(path.join(UPLOADS,name),data,{flag:'wx'});
  return json(res,201,{url:'/uploads/'+name,storage:'local'});
 }

 if(p==='/api/admin/media/sign'&&method==='POST'){
   if(STORAGE!=='s3')return error(res,400,'S3/R2 is not the active provider');
   const x=JSON.parse((await body(req)).toString());const types=['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm'];
   if(!types.includes(x.type)||!Number.isInteger(x.size)||x.size<1||x.size>250*1024*1024)return error(res,400,'Unsupported media type or size');
   const bucket=process.env.S3_BUCKET||process.env.R2_BUCKET;
   const endpoint=process.env.S3_ENDPOINT||(process.env.R2_ACCOUNT_ID?`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`:null);
   if(!bucket||!endpoint||!process.env.S3_PUBLIC_BASE_URL)return error(res,503,'S3/R2 storage is not fully configured');
   try{const {S3Client,PutObjectCommand}=require('@aws-sdk/client-s3');const {getSignedUrl}=require('@aws-sdk/s3-request-presigner');const region=process.env.S3_REGION||'auto';const client=new S3Client({region,endpoint,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID||process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY||process.env.R2_SECRET_ACCESS_KEY},forcePathStyle:true});
     const extension={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'}[x.type];
     const key='vickipedia/'+crypto.randomBytes(16).toString('hex')+'.'+extension;
     const uploadUrl=await getSignedUrl(client,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:x.type}),{expiresIn:120});
     return json(res,200,{uploadUrl,url:process.env.S3_PUBLIC_BASE_URL.replace(/\/$/,'')+'/'+key,storage:'s3'});
   }catch(e){return error(res,503,'S3 signing library not installed or configured')}
 }
 if(p==='/api/admin/media/blob-client'&&method==='POST'){
   if(STORAGE!=='vercel-blob'||!process.env.BLOB_READ_WRITE_TOKEN)return error(res,503,'Vercel Blob is not configured');
   let handleUpload;try{({handleUpload}=require('@vercel/blob/client'))}catch{return error(res,503,'@vercel/blob is not installed')}
   const message=JSON.parse((await body(req)).toString());
   const result=await handleUpload({body:message,request:req,onBeforeGenerateToken:async pathname=>{
     if(!user)throw Error('Authentication required to upload');
     if(!/^vickipedia\/[a-zA-Z0-9_.-]+$/.test(pathname))throw Error('Invalid upload path');
     return {allowedContentTypes:['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'],maximumSizeInBytes:250*1024*1024,addRandomSuffix:true};
   },onUploadCompleted:async()=>{}});
   return json(res,200,result);
 }
 if(p==='/api/admin/media-status'&&method==='GET')return json(res,200,{provider:STORAGE,maxUploadMB:6,configured:STORAGE==='local'||!!process.env.BLOB_READ_WRITE_TOKEN});
 if(p==='/api/admin/subscribers'&&method==='GET')return json(res,200,query('SELECT * FROM subscribers ORDER BY subscribed_at DESC'));
 if(p==='/api/admin/subscribers.csv'&&method==='GET'){const rows=query('SELECT * FROM subscribers ORDER BY subscribed_at DESC');const csv='email,subscribed_at\r\n'+rows.map(r=>[r.email,r.subscribed_at].map(x=>'"'+x.replace(/"/g,'""')+'"').join(',')).join('\r\n');res.writeHead(200,{'content-type':'text/csv','content-disposition':'attachment; filename="subscribers.csv"','cache-control':'no-store'});return res.end(csv)}
 if(p==='/api/admin/settings'){if(method==='GET')return json(res,200,Object.fromEntries(query('SELECT * FROM settings').map(x=>[x.key,x.value])));if(method==='PUT'){const x=JSON.parse((await body(req)).toString());for(const key of Object.keys(defaults))if(Object.hasOwn(x,key))run('UPDATE settings SET value=? WHERE key=?',key==='logo'?cleanUrl(x[key]):safeStr(x[key],key==='about'||key==='standards'||key==='privacy'?30000:1000),key);return json(res,200,{ok:true})}}
 if(p==='/api/admin/password'&&method==='PUT'){const x=JSON.parse((await body(req)).toString());const row=one('SELECT * FROM users WHERE id=?',user.id);if(!verifyPassword(String(x.current||''),row.password_hash)||String(x.password||'').length<8)return error(res,400,'Incorrect current password or new password shorter than 8 characters');run('UPDATE users SET password_hash=? WHERE id=?',passwordHash(x.password),user.id);run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?',user.id,hash(cookies(req).vicki_session));return json(res,200,{ok:true})}
 const found=p.match(/^\/api\/admin\/(articles|authors|categories|videos)(?:\/(\d+))?$/);
 if(found){const [,table,idStr]=found,id=idStr?Number(idStr):null;
 if(!isEditor&&table!=='articles'&&method!=='GET')return error(res,403,'Editor permissions required');
 if(isAuthor&&table==='articles'&&!user.author_id)return error(res,403,'Your account must be linked to a contributor profile');
 if(isAuthor&&table==='articles'&&id){const existing=one('SELECT status FROM articles WHERE id=?',id);if(existing?.status==='published'&&method!=='GET')return error(res,403,'Published stories must be edited by an editor');const owned=one('SELECT article_id FROM article_authors WHERE article_id=? AND author_id=?',id,user.author_id);if(!owned)return error(res,403,'You may only access your assigned stories')}
 if(isAuthor&&table==='articles'&&method==='DELETE')return error(res,403,'Only editors can delete stories');
const select=table==='articles'?articleSelect:table==='videos'?videoSelect:`SELECT * FROM ${table}`;
 if(method==='GET'&&isAuthor&&table==='articles'&&!id)return json(res,200,query(articleSelect+' WHERE a.id IN (SELECT article_id FROM article_authors WHERE author_id=?) ORDER BY a.updated_at DESC',user.author_id));
 if(method==='GET')return json(res,200,id?one(select+` WHERE ${table==='articles'?'a':table==='videos'?'v':table}.id=?`,id)||null:query(select+(table==='articles'?' ORDER BY a.updated_at DESC':table==='videos'?' ORDER BY v.updated_at DESC':' ORDER BY id DESC')));
 if(method==='DELETE'&&id){run(`DELETE FROM ${table} WHERE id=?`,id);return json(res,200,{ok:true})}
 if(method==='POST'&&!id||method==='PUT'&&id){const x=JSON.parse((await body(req)).toString());let values;
 if(isAuthor&&table==='articles'){if(!id)x.author_ids=[user.author_id];else delete x.author_ids;if(!id)x.author_id=user.author_id;x.status='draft';x.featured=false;x.breaking=false}
 if(table==='articles'&&Array.isArray(x.author_ids)){const ids=[...new Set(x.author_ids.map(Number))];if(ids.length>12||ids.some(n=>!Number.isSafeInteger(n)||n<=0))throw Error('Select up to 12 valid authors');for(const n of ids){if(!one('SELECT id FROM authors WHERE id=?',n))throw Error('One or more selected authors do not exist')}x.author_id=ids[0]||null}
 if(table==='articles'){const previous=id?one('SELECT * FROM articles WHERE id=?',id)||{}:{};if(isAuthor&&id)x.author_id=previous.author_id;values=bindArticle(x,previous)}
 if(table==='videos')values=bindVideo(x);
 if(table==='authors'){if(!safeStr(x.name).trim())throw Error('Author name required');values={slug:slug(x.slug||x.name),name:safeStr(x.name,150),role:safeStr(x.role,150),bio:safeStr(x.bio,5000),avatar:cleanUrl(x.avatar),social:safeStr(x.social,1500),created_at:id?one('SELECT created_at FROM authors WHERE id=?',id)?.created_at:now()}}
 if(table==='categories'){if(!safeStr(x.name).trim())throw Error('Category name required');values={slug:slug(x.slug||x.name),name:safeStr(x.name,100),created_at:id?one('SELECT created_at FROM categories WHERE id=?',id)?.created_at:now()}}
 if(table==='articles'&&!id)values.created_at=now();if(table==='videos'&&!id)values.created_at=now();const result=writeRow(table,values,id);if(table==='articles'){const ids=Array.isArray(x.author_ids)?[...new Set(x.author_ids.map(Number))]:(x.author_id?[Number(x.author_id)]:[]);if(Array.isArray(x.author_ids)||!id){run('DELETE FROM article_authors WHERE article_id=?',result);for(const [position,aid] of ids.entries())run('INSERT INTO article_authors(article_id,author_id,position) VALUES(?,?,?)',result,aid,position)}}return json(res,id?200:201,{id:result,ok:true})}
 }
 return error(res,404,'Unknown API endpoint');}
async function handler(req,res){try{const u=new URL(req.url,`http://${req.headers.host||'localhost'}`),p=decodeURIComponent(u.pathname);if(p.startsWith('/api/'))return await api(req,res,u);if(req.method!=='GET')return error(res,405,'Method not allowed');if(p==='/rss.xml'){const items=query(articleSelect+" WHERE a.status='published' ORDER BY a.published_at DESC LIMIT 40");const site=process.env.SITE_URL||`http://${req.headers.host}`;const xml=`<?xml version="1.0"?><rss version="2.0"><channel><title>Vickipedia News</title><link>${escapeXml(site)}</link><description>Latest articles</description>${items.map(a=>`<item><title>${escapeXml(a.title)}</title><link>${escapeXml(site+'/article/'+a.slug)}</link><guid>${escapeXml(site+'/article/'+a.slug)}</guid><description>${escapeXml(a.deck)}</description><pubDate>${readableDate(a.published_at)}</pubDate></item>`).join('')}</channel></rss>`;res.writeHead(200,{'content-type':'application/rss+xml; charset=utf-8'});return res.end(xml)}
 if(p==='/sitemap.xml'){const site=process.env.SITE_URL||`http://${req.headers.host}`;const paths=['/',...query("SELECT slug FROM articles WHERE status='published'").map(x=>'/article/'+x.slug),...query('SELECT slug FROM categories').map(x=>'/category/'+x.slug)];res.writeHead(200,{'content-type':'application/xml; charset=utf-8'});return res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(x=>`<url><loc>${escapeXml(site+x)}</loc></url>`).join('')}</urlset>`)}
 if(p.startsWith('/uploads/')){const name=path.basename(p);if(p!=='/uploads/'+name)return error(res,403,'Forbidden');return serveFile(res,path.join(UPLOADS,name))}
 if(['/style.css','/studio.css','/studio-admin.css','/editorial.css','/editorial-admin.css','/app.js','/admin.js','/composer.js','/blob-client.bundle.js','/favicon.ico','/brand-logo.jpeg'].includes(p))return serveFile(res,path.join(PUBLIC,p.slice(1)));
 if(p==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});return res.end('User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: '+(process.env.SITE_URL||`http://${req.headers.host}`)+'/sitemap.xml\n')}
 return renderShell(req,res,p);
 }catch(e){if(e.code?.startsWith('SQLITE_CONSTRAINT'))return error(res,409,'Slug or name already exists, or the selected relationship is invalid');console.error(e);return error(res,e.status||400,e.message||'Request failed')}}
http.createServer(handler).listen(PORT,HOST,()=>console.log(`Vickipedia News running at http://${HOST}:${PORT}`));
