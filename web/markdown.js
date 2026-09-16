'use strict';
function renderMarkdown(container, text, onInternalLink) {
 const parsed=marked.parse(String(text||''),{gfm:true,breaks:false,async:false});
 const fragment=DOMPurify.sanitize(parsed,{RETURN_DOM_FRAGMENT:true,USE_PROFILES:{html:true},FORBID_TAGS:['style','form','input','button','iframe','video','audio'],FORBID_ATTR:['style','srcset']});
 fragment.querySelectorAll('a').forEach(link=>{
  const href=link.getAttribute('href')||'';
  if(href.startsWith('#')&&onInternalLink){link.onclick=e=>{e.preventDefault();onInternalLink(href);};}
  if(!/^(https?:\/\/|mailto:|#)/i.test(href)){link.removeAttribute('href');if(onInternalLink && href && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)){link.href='#';link.onclick=e=>{e.preventDefault();onInternalLink(href);};}return;}
  if(!href.startsWith('#')){link.target='_blank';link.rel='noopener noreferrer';}
 });
 // Do not fetch remote tracking images embedded in project Markdown.
 fragment.querySelectorAll('img').forEach(img=>{const label=document.createElement('span');label.textContent=img.alt?'[图片：'+img.alt+']':'[图片请查看原件]';img.replaceWith(label);});
 fragment.querySelectorAll('table').forEach(table=>{const wrap=document.createElement('div');wrap.className='markdown-table';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','表格，可横向滚动');table.replaceWith(wrap);wrap.append(table);});
 container.replaceChildren(fragment);
 if(onInternalLink){const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);const texts=[];while(walker.nextNode())if(!walker.currentNode.parentElement.closest('code,pre,a'))texts.push(walker.currentNode);for(const textNode of texts){const source=textNode.textContent;const matches=[...source.matchAll(/\[\[([^\]]+)\]\]/g)];if(!matches.length)continue;const result=document.createDocumentFragment();let last=0;for(const match of matches){result.append(document.createTextNode(source.slice(last,match.index)));const [target,label]=match[1].split('|');const a=document.createElement('a');a.textContent=label||target;a.href='#';a.onclick=e=>{e.preventDefault();onInternalLink(target);};result.append(a);last=match.index+match[0].length;}result.append(document.createTextNode(source.slice(last)));textNode.replaceWith(result);}}
}
