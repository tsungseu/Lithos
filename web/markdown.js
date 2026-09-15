'use strict';
function renderMarkdown(container, text) {
 const parsed=marked.parse(String(text||''),{gfm:true,breaks:false,async:false});
 const fragment=DOMPurify.sanitize(parsed,{RETURN_DOM_FRAGMENT:true,USE_PROFILES:{html:true},FORBID_TAGS:['style','form','input','button','iframe','video','audio'],FORBID_ATTR:['style','srcset']});
 fragment.querySelectorAll('a').forEach(link=>{
  const href=link.getAttribute('href')||'';
  if(!/^(https?:\/\/|mailto:|#)/i.test(href)){link.removeAttribute('href');return;}
  if(!href.startsWith('#')){link.target='_blank';link.rel='noopener noreferrer';}
 });
 // Do not fetch remote tracking images embedded in project Markdown.
 fragment.querySelectorAll('img').forEach(img=>{const label=document.createElement('span');label.textContent=img.alt?'[图片：'+img.alt+']':'[图片请查看原件]';img.replaceWith(label);});
 fragment.querySelectorAll('table').forEach(table=>{const wrap=document.createElement('div');wrap.className='markdown-table';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','表格，可横向滚动');table.replaceWith(wrap);wrap.append(table);});
 container.replaceChildren(fragment);
}
