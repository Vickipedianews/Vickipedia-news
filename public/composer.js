/* Vickipedia Studio document composer.
 * Offline-first: no CDN modules, no duplicate ProseMirror plugins, no external runtime.
 * Structured output follows the Tiptap/ProseMirror JSON document shape.
 */
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const allowedURL=(s)=>{try{const u=new URL(s,location.origin);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
function fromJSON(node){if(!node||typeof node!=='object')return '';const kids=(node.content||[]).map(fromJSON).join('');const attrs=node.attrs||{};switch(node.type){
case 'doc':return kids;
case 'text':{let t=escapeHTML(node.text||'');for(const m of node.marks||[]){if(m.type==='bold')t='<strong>'+t+'</strong>';if(m.type==='italic')t='<em>'+t+'</em>';if(m.type==='strike')t='<s>'+t+'</s>';if(m.type==='code')t='<code>'+t+'</code>';if(m.type==='link'&&allowedURL(m.attrs?.href))t='<a href="'+escapeHTML(allowedURL(m.attrs.href))+'">'+t+'</a>';}return t}
case 'heading':return '<h'+(attrs.level===3?3:2)+'>'+kids+'</h'+(attrs.level===3?3:2)+'>';
case 'paragraph':return '<p>'+kids+'</p>';
case 'blockquote':return '<blockquote>'+kids+'</blockquote>';
case 'bulletList':return '<ul>'+kids+'</ul>';
case 'orderedList':return '<ol>'+kids+'</ol>';
case 'listItem':return '<li>'+kids+'</li>';
case 'horizontalRule':return '<hr>';
case 'hardBreak':return '<br>';
case 'image':return allowedURL(attrs.src)?'<figure contenteditable="false"><img src="'+escapeHTML(allowedURL(attrs.src))+'" alt="'+escapeHTML(attrs.alt||'')+'"><figcaption>'+escapeHTML(attrs.title||'')+'</figcaption></figure>':'';
case 'videoFile':return allowedURL(attrs.src)?'<video contenteditable="false" data-vicki-video controls preload="metadata" src="'+escapeHTML(allowedURL(attrs.src))+'"></video>':'';
case 'youtube':return allowedURL(attrs.src)?'<div contenteditable="false" data-video-url="'+escapeHTML(allowedURL(attrs.src))+'" class="video-embed">YouTube video · '+escapeHTML(attrs.src)+'</div>':'';
default:return kids;
}}
function initialContent(str){try{const data=JSON.parse(str);if(data?.type==='doc')return fromJSON(data)}catch{}return String(str||'').split(/\n\n+/).filter(Boolean).map(s=>s.startsWith('## ')?'<h2>'+escapeHTML(s.slice(3))+'</h2>':'<p>'+escapeHTML(s).replace(/\n/g,'<br>')+'</p>').join('')||'<p></p>'}
function marksFor(el,marks){const a=[...marks];const tag=el.tagName?.toLowerCase();if(tag==='b'||tag==='strong')a.push({type:'bold'});if(tag==='i'||tag==='em')a.push({type:'italic'});if(tag==='s'||tag==='strike')a.push({type:'strike'});if(tag==='code')a.push({type:'code'});if(tag==='a'&&allowedURL(el.getAttribute('href')))a.push({type:'link',attrs:{href:allowedURL(el.getAttribute('href'))}});return a}
function inlineNodes(el,marks=[]){const out=[];for(const child of el.childNodes){if(child.nodeType===3){if(child.textContent)out.push({...{type:'text',text:child.textContent},...(marks.length?{marks}: {})});continue}if(child.nodeType!==1)continue;if(child.tagName==='BR'){out.push({type:'hardBreak'});continue}out.push(...inlineNodes(child,marksFor(child,marks)))}return out}
function blocks(parent){const result=[];for(const el of parent.childNodes){if(el.nodeType===3){if(el.textContent.trim())result.push({type:'paragraph',content:[{type:'text',text:el.textContent}]});continue}if(el.nodeType!==1)continue;const t=el.tagName.toLowerCase();if(t==='figure'){const im=el.querySelector('img');if(im&&allowedURL(im.getAttribute('src')))result.push({type:'image',attrs:{src:allowedURL(im.getAttribute('src')),alt:im.alt||'',title:el.querySelector('figcaption')?.textContent||''}});continue}if(t==='video'){if(allowedURL(el.getAttribute('src')))result.push({type:'videoFile',attrs:{src:allowedURL(el.getAttribute('src'))}});continue}if(el.hasAttribute('data-video-url')){result.push({type:'youtube',attrs:{src:el.getAttribute('data-video-url')}});continue}
if(t==='hr'){result.push({type:'horizontalRule'});continue}if(['ul','ol'].includes(t)){result.push({type:t==='ul'?'bulletList':'orderedList',content:[...el.children].filter(x=>x.tagName==='LI').map(li=>({type:'listItem',content:[{type:'paragraph',content:inlineNodes(li)}]}))});continue}if(t==='blockquote'){result.push({type:'blockquote',content:[{type:'paragraph',content:inlineNodes(el)}]});continue}if(['h2','h3'].includes(t)){result.push({type:'heading',attrs:{level:Number(t[1])},content:inlineNodes(el)});continue}if(['p','div','li','h1'].includes(t)){result.push({type:'paragraph',content:inlineNodes(el)});continue}result.push(...blocks(el))}
return result}
export async function mountComposer({mount,toolbar,source,upload,onChange}){
 const content=document.createElement('div');content.className='vicki-tiptap';content.setAttribute('contenteditable','true');content.setAttribute('role','textbox');content.setAttribute('aria-label','Article content');content.setAttribute('aria-multiline','true');content.setAttribute('spellcheck','true');content.innerHTML=initialContent(source.value);mount.replaceChildren(content);
 const getJSON=()=>JSON.stringify({type:'doc',content:blocks(content)});
 const sync=()=>{source.value=getJSON();onChange?.()};
 const focus=()=>content.focus();
 const command=(cmd,val)=>{focus();document.execCommand(cmd,false,val);sync()};
 const inputImage=document.getElementById('composerImage'),inputVideo=document.getElementById('composerVideo');
 function insertHTML(html){focus();document.execCommand('insertHTML',false,html);sync()}
 async function addMedia(file){if(!file)return;const supported=file.type.startsWith('image/')||['video/mp4','video/webm'].includes(file.type);if(!supported)throw Error('Please select an image, MP4 or WebM file');const url=await upload(file);if(file.type.startsWith('image/'))insertHTML('<figure contenteditable="false"><img src="'+escapeHTML(url)+'" alt="'+escapeHTML(file.name.replace(/\.[^.]+$/,''))+'"><figcaption>Click image to add a caption in media settings</figcaption></figure><p></p>');else insertHTML('<video contenteditable="false" data-vicki-video controls src="'+escapeHTML(url)+'"></video><p></p>')}
 async function mediaInput(el){try{await addMedia(el.files[0])}catch(e){alert(e.message)}finally{el.value=''}}
 inputImage?.addEventListener('change',()=>mediaInput(inputImage));inputVideo?.addEventListener('change',()=>mediaInput(inputVideo));
 content.addEventListener('paste',async e=>{const files=[...(e.clipboardData?.files||[])];if(files.length){e.preventDefault();try{await addMedia(files[0])}catch(err){alert(err.message)}return}e.preventDefault();document.execCommand('insertText',false,e.clipboardData?.getData('text/plain')||'');sync()});
 content.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault()});
 content.addEventListener('drop',async e=>{const f=e.dataTransfer?.files?.[0];if(f){e.preventDefault();try{await addMedia(f)}catch(err){alert(err.message)}}});
 const commands={heading:()=>command('formatBlock','h2'),bold:()=>command('bold'),italic:()=>command('italic'),bulletList:()=>command('insertUnorderedList'),orderedList:()=>command('insertOrderedList'),blockquote:()=>command('formatBlock','blockquote'),divider:()=>insertHTML('<hr><p></p>'),undo:()=>command('undo'),redo:()=>command('redo'),image:()=>inputImage?.click(),videoFile:()=>inputVideo?.click(),link:()=>{const raw=prompt('Link URL (https://)');if(raw){const url=allowedURL(raw);if(url)command('createLink',url);else alert('Enter a valid HTTP or HTTPS URL.')}},youtube:()=>{const raw=prompt('YouTube link');if(!raw)return;const url=allowedURL(raw);if(!url||!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(new URL(url).hostname)){alert('Use a valid YouTube URL.');return}insertHTML('<div contenteditable="false" class="video-embed" data-video-url="'+escapeHTML(url)+'">YouTube embed · '+escapeHTML(url)+'</div><p></p>')}};
 toolbar.querySelectorAll('[data-cmd]').forEach(btn=>{btn.addEventListener('mousedown',e=>e.preventDefault());btn.addEventListener('click',()=>commands[btn.dataset.cmd]?.())});
 const menu=document.createElement('div');menu.className='composer-slash-menu';menu.hidden=true;menu.innerHTML='<div class="slash-heading">Insert block</div>'+[['heading','Heading'],['bulletList','Bulleted list'],['orderedList','Numbered list'],['blockquote','Quote'],['image','Image'],['youtube','YouTube'],['videoFile','Upload video'],['divider','Divider']].map(([id,t])=>'<button type="button" data-block="'+id+'">'+t+'</button>').join('');mount.parentElement.append(menu);
 function toggleSlash(){const s=window.getSelection();if(!s||!s.rangeCount||!content.contains(s.anchorNode)){menu.hidden=true;return}const n=s.anchorNode,part=n?.nodeType===3?n.textContent.slice(0,s.anchorOffset):'';menu.hidden=!part.endsWith('/')}
 content.addEventListener('input',()=>{sync();toggleSlash()});content.addEventListener('keyup',toggleSlash);
 menu.addEventListener('mousedown',e=>e.preventDefault());menu.addEventListener('click',e=>{const b=e.target.closest('[data-block]');if(!b)return;focus();document.execCommand('delete',false);commands[b.dataset.block]?.();menu.hidden=true});
 sync();return {getJSON,getText:()=>content.innerText||'',insertMedia:(item)=>{const url=allowedURL(item?.url);if(!url)return;const title=escapeHTML(item.alt||item.title||'');if(item.mime_type==='video/embed')insertHTML('<div contenteditable="false" data-video-url="'+escapeHTML(url)+'" class="video-embed">Embedded video · '+escapeHTML(item.title||'Video')+'</div>');else if(item.mime_type?.startsWith('video/'))insertHTML('<video contenteditable="false" controls preload="metadata" src="'+escapeHTML(url)+'"></video>');else insertHTML('<figure contenteditable="false"><img src="'+escapeHTML(url)+'" alt="'+title+'"><figcaption>'+title+'</figcaption></figure>')},destroy:()=>{mount.replaceChildren();menu.remove()}};
}
