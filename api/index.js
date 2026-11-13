'use strict';
const handler=require('../server-pg');
module.exports=async(req,res)=>{
 const u=new URL(req.url,'https://'+(req.headers.host||'localhost'));
 const path=u.searchParams.get('route');
 if(path!==null){u.searchParams.delete('route');req.url='/'+path.replace(/^\/+/, '')+(u.searchParams.size?'?'+u.searchParams.toString():'');}
 return handler(req,res);
};
