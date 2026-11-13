#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');
const {Client}=require('pg');
(async()=>{
 const conn=process.env.DATABASE_URL_UNPOOLED||process.env.POSTGRES_URL_NON_POOLING||process.env.DATABASE_URL;
 if(!conn){console.error('No Neon connection set: DATABASE_URL_UNPOOLED or DATABASE_URL required.');process.exitCode=1;return}
 const client=new Client({connectionString:conn,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:true},connectionTimeoutMillis:15000});
 await client.connect();
 try{
  await client.query('SELECT pg_advisory_lock($1)',[20261113]);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const files=fs.readdirSync(path.join(__dirname,'../migrations')).filter(f=>/^\d+_.*\.sql$/.test(f)).sort();
  for(const file of files){if((await client.query('SELECT 1 FROM schema_migrations WHERE version=$1',[file])).rowCount)continue;
   await client.query('BEGIN');try{await client.query(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]);await client.query('COMMIT');console.log('Applied',file)}catch(e){await client.query('ROLLBACK');throw e}
  }
  const settings={site_title:'Vickipedia News',tagline:'The stories shaping today',description:'Independent Nigerian news, analysis and video.',contact_email:'',logo:'',facebook:'',instagram:'',linkedin:'',tiktok:'',about:'Vickipedia News — update this page from the CMS.',standards:'Our editorial standards will be published here.',privacy:'Our privacy policy will be published here.',footer_text:'News, perspective and video.',announcement:''};
  for(const [key,value] of Object.entries(settings))await client.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',[key,value]);
  for(const name of ['News','Politics','Editorial','Opinion','Gists','Entertainment','Metro','Foreign','Sports','Technology','Finance'])await client.query('INSERT INTO categories(slug,name,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[name.toLowerCase(),name,new Date().toISOString()]);
  console.log('Database migrations complete.');
 }finally{try{await client.query('SELECT pg_advisory_unlock($1)',[20261113])}finally{await client.end()}}
})().catch(e=>{console.error('Migration failed:',e.message);process.exitCode=1});
