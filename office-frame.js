'use strict';
const pages=document.getElementById('pages'),statusEl=document.getElementById('status'),sheet=document.getElementById('sheet');
let pdf=null,page=1,renderTask=null,serial=0;
async function renderPDF(){
 const seq=++serial;if(renderTask){try{renderTask.cancel();await renderTask.promise;fit();}catch(_){} }
 const p=await pdf.getPage(page);if(seq!==serial)return;
 const view=p.getViewport({scale:Math.min(1.5,1400/p.getViewport({scale:1}).width)}),canvas=document.createElement('canvas');canvas.width=view.width;canvas.height=view.height;pages.replaceChildren(canvas);
 renderTask=p.render({canvasContext:canvas.getContext('2d'),viewport:view});await renderTask.promise;fit();
 statusEl.textContent=`PDF · 第 ${page} / ${pdf.numPages} 页`;document.getElementById('prev').disabled=page===1;document.getElementById('next').disabled=page===pdf.numPages;
}
document.getElementById('prev').onclick=()=>{page=Math.max(1,page-1);renderPDF().catch(report);};document.getElementById('next').onclick=()=>{page=Math.min(pdf.numPages,page+1);renderPDF().catch(report);};
function fit(){const content=pages.querySelector('.docx-wrapper')||pages.firstElementChild;if(!content)return;content.style.zoom='1';const choice=document.getElementById('zoom').value;const natural=pages.querySelector('section.docx')?.offsetWidth||content.scrollWidth;content.style.zoom=choice==='fit'?Math.min(1,(pages.clientWidth-40)/Math.max(1,natural)):choice;}
document.getElementById('zoom').onchange=fit;new ResizeObserver(fit).observe(pages);
function report(e){statusEl.textContent='预览失败：'+e.message+'。可下载原件使用本机 Office 打开。';}
window.addEventListener('message',async event=>{
 if(event.source!==parent||event.data?.type!=='office-document')return;
 try{
 const {buffer,name}=event.data,ext=name.split('.').pop().toLowerCase();statusEl.textContent='正在排版…';
 if(ext==='docx'){
  await docx.renderAsync(buffer,pages,null,{inWrapper:true,ignoreWidth:false,breakPages:true,useBase64URL:true,renderAltChunks:false});
  pages.querySelectorAll('img').forEach(img=>{const failed=()=>{img.alt='此图片格式暂不支持，请查看原件（如 EMF/WMF）';};img.addEventListener('error',failed);if(img.complete&&!img.naturalWidth)failed();});
  pages.querySelectorAll('a').forEach(a=>{a.removeAttribute('href');a.removeAttribute('target');});
  statusEl.textContent='Word · 保留表格、图片与分页；复杂版式以原件为准';
 }else if(['xlsx','xls'].includes(ext)){
  const book=XLSX.read(buffer,{type:'array',cellFormula:false,bookVBA:false,cellHTML:false});sheet.hidden=false;
  book.SheetNames.forEach(name=>{const o=document.createElement('option');o.textContent=name;sheet.append(o);});
  const show=()=>{const ws=book.Sheets[sheet.value],table=document.createElement('table');pages.replaceChildren(table);if(!ws['!ref']){statusEl.textContent='空工作表';return;}
   const range=XLSX.utils.decode_range(ws['!ref']),endRow=Math.min(range.e.r,range.s.r+199),endCol=Math.min(range.e.c,range.s.c+39);
   const head=document.createElement('tr');head.append(document.createElement('th'));for(let c=range.s.c;c<=endCol;c++){const th=document.createElement('th');th.textContent=XLSX.utils.encode_col(c);head.append(th);}table.append(head);
   for(let r=range.s.r;r<=endRow;r++){const tr=document.createElement('tr'),th=document.createElement('th');th.textContent=r+1;tr.append(th);for(let c=range.s.c;c<=endCol;c++){const td=document.createElement('td'),cell=ws[XLSX.utils.encode_cell({r,c})];td.textContent=cell?String(cell.w??cell.v??''):'';tr.append(td);}table.append(tr);}
   statusEl.textContent=`Excel · ${sheet.value} · 显示 ${endRow-range.s.r+1} 行 × ${endCol-range.s.c+1} 列（上限200×40；公式显示已有结果，图表不呈现）`;
  };sheet.onchange=show;show();
 }else if(ext==='pdf'){
  pdf=await pdfjsLib.getDocument({data:buffer,isEvalSupported:false,disableAutoFetch:true,disableStream:true,useSystemFonts:true}).promise;
  document.getElementById('prev').hidden=false;document.getElementById('next').hidden=false;await renderPDF();
 }else{const pre=document.createElement('pre');let text=new TextDecoder().decode(buffer);if(text.includes('\ufffd'))text=new TextDecoder('gb18030').decode(buffer);pre.textContent=text;pages.replaceChildren(pre);statusEl.textContent='文本阅读';}
 fit();}catch(e){report(e);}
});
parent.postMessage({type:'office-ready'},'*');
