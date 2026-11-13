#!/usr/bin/env node
'use strict';
const esbuild=require('esbuild');
(async()=>{await esbuild.build({entryPoints:['scripts/blob-client-entry.js'],bundle:true,minify:true,format:'esm',platform:'browser',target:['es2020'],outfile:'public/blob-client.bundle.js',logLevel:'warning'});console.log('Built browser Blob upload client.');})().catch(e=>{console.error(e);process.exitCode=1});
