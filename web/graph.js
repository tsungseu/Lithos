'use strict';
const graphState={nodes:[],edges:[],selected:null,scale:1,x:0,y:0,request:0,preview:0};
const graphSVG=$('knowledge-graph'), svgNS='http://www.w3.org/2000/svg';
function svgNode(tag,attributes,text){const el=document.createElementNS(svgNS,tag);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,value);if(text!==undefined)el.textContent=text;return el;}
function graphTransform(){const layer=$('graph-layer');if(layer)layer.setAttribute('transform',`translate(${graphState.x} ${graphState.y}) scale(${graphState.scale})`);}
function drawGraph(){
 graphSVG.replaceChildren();const layer=svgNode('g',{id:'graph-layer'});graphSVG.append(layer);
 const map=new Map(graphState.nodes.map(n=>[n.id,n]));const adjacent=new Set([graphState.selected]);
 graphState.edges.forEach(e=>{if(e.source===graphState.selected)adjacent.add(e.target);if(e.target===graphState.selected)adjacent.add(e.source);});
 graphState.edges.forEach(e=>{const a=map.get(e.source),b=map.get(e.target);layer.append(svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'graph-edge '+e.kind+(e.source===graphState.selected||e.target===graphState.selected?' focused':'')}));});
 const query=$('graph-search').value.trim().toLowerCase();
 graphState.nodes.forEach(n=>{
  const selected=n.id===graphState.selected,match=query&&n.title.toLowerCase().includes(query);
  const g=svgNode('g',{transform:`translate(${n.x} ${n.y})`,class:'graph-node '+n.kind+(selected?' selected':'')+(match?' match':''),tabindex:'0',role:'button','aria-label':(n.kind==='directory'?'目录：':'文档：')+n.title});
  g.append(svgNode('circle',{r:n.kind==='directory'?9:6}));g.append(svgNode('title',{},n.id));
  if(graphState.nodes.length<75||selected||match||n.level<2)g.append(svgNode('text',{x:n.x<0?-13:13,y:5,'text-anchor':n.x<0?'end':'start'},n.title.length>19?n.title.slice(0,18)+'…':n.title));
  g.addEventListener('click',()=>{if(!graphState.moved)selectGraphNode(n);});
  g.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();if(!graphState.moved&&n.kind==='directory')enterLibrary(n.id==='.'?'':n.id);});
  g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(e.key==='Enter'&&n.kind==='directory')enterLibrary(n.id==='.'?'':n.id);else selectGraphNode(n);}});layer.append(g);
 });graphTransform();
}
function layoutGraph(){
 const map=new Map(graphState.nodes.map(n=>[n.id,n]));const kids=new Map();
 graphState.edges.filter(e=>e.kind==='contains').forEach(e=>{if(!kids.has(e.source))kids.set(e.source,[]);kids.get(e.source).push(e.target);});
 function weight(id){return Math.max(1,(kids.get(id)||[]).reduce((s,c)=>s+weight(c),0));}
 function place(id,start,end,depth){const n=map.get(id),angle=(start+end)/2;n.level=depth;n.x=depth?Math.cos(angle)*depth*108:0;n.y=depth?Math.sin(angle)*depth*108:0;let cursor=start;const children=kids.get(id)||[],sum=children.reduce((s,c)=>s+weight(c),0);children.forEach(c=>{const span=(end-start)*weight(c)/sum;place(c,cursor,cursor+span,depth+1);cursor+=span;});}
 if(graphState.nodes.length)place(graphState.nodes[0].id,-Math.PI,Math.PI,0);
 // Separate close siblings without adding inferred relationships.
 for(let round=0;round<65;round++)for(let i=1;i<graphState.nodes.length;i++)for(let j=i+1;j<graphState.nodes.length;j++){
  const a=graphState.nodes[i],b=graphState.nodes[j];let dx=a.x-b.x,dy=a.y-b.y;const distance=Math.hypot(dx,dy)||.1;
  if(distance<32){if(!dx&&!dy)dx=.1;const push=(32-distance)/distance*.12;a.x+=dx*push;a.y+=dy*push;b.x-=dx*push;b.y-=dy*push;}
 }
}
async function loadKnowledgeGraph(){
 const request=++graphState.request;++graphState.preview;graphState.selected=null;
 $('graph-status').textContent='正在读取目录与实际引用…';
 try{const result=await api('/api/graph?folder='+encodeURIComponent(state.knowledgeFolder||'')+'&depth='+$('graph-depth').value);if(request!==graphState.request)return;
  graphState.nodes=result.nodes;graphState.edges=result.edges;graphState.scale=1;graphState.x=0;graphState.y=0;layoutGraph();drawGraph();
  $('graph-title').textContent='选择一个节点';$('graph-path').textContent='';$('graph-actions').replaceChildren();$('graph-neighbors').replaceChildren();$('graph-body').textContent='双击目录直接展开图谱；单击查看信息，单击文档阅读全文。键盘选中目录后按 Enter 展开。';$('graph-matches').replaceChildren();
  $('graph-status').textContent=`${result.nodes.length} 个节点 · ${result.edges.filter(e=>e.kind==='reference').length} 条引用。${result.note} ${result.warnings.join('；')}`;
 }catch(e){if(request===graphState.request)$('graph-status').textContent='图谱读取失败：'+e.message;}
}
async function selectGraphNode(n){
 const request=++graphState.preview;graphState.selected=n.id;
 // Keep the clicked SVG element alive so the browser can dispatch dblclick.
 graphSVG.querySelectorAll('.graph-node').forEach((el,i)=>el.classList.toggle('selected',graphState.nodes[i].id===n.id));
 graphSVG.querySelectorAll('.graph-edge').forEach((el,i)=>{const edge=graphState.edges[i];el.classList.toggle('focused',edge.source===n.id||edge.target===n.id);});
 graphTransform();$('graph-title').textContent=n.title;$('graph-path').textContent=n.path;
 $('graph-actions').replaceChildren();$('graph-neighbors').replaceChildren();$('graph-body').replaceChildren();
 if(n.kind==='directory'){
  const b=node('button','展开此目录图谱','secondary');b.addEventListener('click',()=>enterLibrary(n.id==='.'?'':n.id));$('graph-actions').append(b);
 }else{
  const download=node('a','下载原件','secondary');download.href='/api/library-download?path='+encodeURIComponent(n.id);download.setAttribute('download',n.title);$('graph-actions').append(download);
  const open=node('button','打开为文档标签','secondary');open.onclick=()=>window.LithosKnowledge?.open(n.id,true);$('graph-actions').append(open);
 }
 const related=graphState.edges.filter(e=>e.kind==='reference'&&(e.source===n.id||e.target===n.id));
 $('graph-neighbors').append(node('p',related.length?`关联引用 · ${related.length}`:'当前范围内没有可解析的文档引用。','small muted'));
 related.forEach(e=>{const target=graphState.nodes.find(x=>x.id===(e.source===n.id?e.target:e.source));const b=node('button',(e.source===n.id?'引用 → ':'被引用 ← ')+target.title,'graph-result');b.addEventListener('click',()=>selectGraphNode(target));$('graph-neighbors').append(b);});
 if(n.kind==='file')try{const detail=await api('/api/library-preview?path='+encodeURIComponent(n.id));if(request!==graphState.preview)return;const body=$('graph-body');if(detail.format==='markdown')renderMarkdown(body,detail.content);else body.append(node('pre',detail.content));if(detail.warning)body.prepend(node('p',detail.warning,'setting-info'));}catch(e){if(request===graphState.preview)$('graph-body').textContent=e.message;}
}
function showGraph(enabled){$('library').classList.toggle('graph-mode',enabled);$('graph-panel').hidden=!enabled;document.querySelector('.library-grid').hidden=enabled;$('library-graph-view').setAttribute('aria-pressed',String(enabled));$('library-list-view').setAttribute('aria-pressed',String(!enabled));if(enabled)loadKnowledgeGraph();}
$('library-graph-view').addEventListener('click',()=>showGraph(true));$('library-list-view').addEventListener('click',()=>showGraph(false));
document.addEventListener('library-scope',()=>{if(!$('graph-panel').hidden)loadKnowledgeGraph();});
$('graph-refresh').addEventListener('click',loadKnowledgeGraph);$('graph-depth').addEventListener('change',loadKnowledgeGraph);
$('graph-search').addEventListener('input',()=>{drawGraph();const query=$('graph-search').value.trim().toLowerCase();const matches=$('graph-matches');matches.replaceChildren();if(query){const found=graphState.nodes.filter(n=>n.title.toLowerCase().includes(query));matches.append(node('p',`${found.length} 个匹配节点（当前图谱范围）`));found.slice(0,30).forEach(n=>{const b=node('button',n.title,'graph-result');b.addEventListener('click',()=>{graphState.x=-n.x;graphState.y=-n.y;graphState.scale=1;selectGraphNode(n);});matches.append(b);});}});
function zoomGraph(factor){graphState.scale=Math.max(.25,Math.min(4,graphState.scale*factor));graphTransform();}
$('graph-plus').addEventListener('click',()=>zoomGraph(1.2));$('graph-minus').addEventListener('click',()=>zoomGraph(1/1.2));$('graph-reset').addEventListener('click',()=>{graphState.x=0;graphState.y=0;graphState.scale=1;graphTransform();});
graphSVG.addEventListener('wheel',e=>{e.preventDefault();zoomGraph(e.deltaY<0?1.12:1/1.12);},{passive:false});
let graphDrag=null;
graphSVG.addEventListener('pointerdown',e=>{if(e.button!==0)return;graphDrag={x:e.clientX,y:e.clientY,originX:graphState.x,originY:graphState.y};graphState.moved=false;});
graphSVG.addEventListener('pointermove',e=>{if(!graphDrag)return;const scale=graphSVG.getScreenCTM();if(!scale)return;const dx=(e.clientX-graphDrag.x)/scale.a,dy=(e.clientY-graphDrag.y)/scale.d;if(Math.hypot(dx,dy)>4){graphState.moved=true;graphState.x=graphDrag.originX+dx;graphState.y=graphDrag.originY+dy;graphTransform();}});
window.addEventListener('pointerup',()=>graphDrag=null);graphSVG.addEventListener('pointerleave',()=>graphDrag=null);
if(location.hash==='#graph'){showView('library');showGraph(true);}

(() => {
 const layout=document.querySelector('.graph-layout'),reader=document.querySelector('.graph-reader');
 const handle=node('div',undefined,'graph-splitter');handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-label','调整图谱预览宽度');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-valuemin','25');handle.setAttribute('aria-valuemax','75');reader.before(handle);
 let width=45;try{const stored=Number(localStorage.getItem('lithos.graph-reader-width'));if(stored>=25&&stored<=75)width=stored;}catch(_){}
 function resize(value){width=Math.max(25,Math.min(75,value));layout.style.setProperty('--reader-width',width+'%');handle.setAttribute('aria-valuenow',String(Math.round(width)));}
 function save(){try{localStorage.setItem('lithos.graph-reader-width',String(width));}catch(_){}}
 handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;handle.setPointerCapture(e.pointerId);e.preventDefault();});
 handle.addEventListener('pointermove',e=>{if(!handle.hasPointerCapture(e.pointerId))return;const box=layout.getBoundingClientRect();resize((box.right-e.clientX)/box.width*100);});
 handle.addEventListener('pointerup',e=>{if(handle.hasPointerCapture(e.pointerId)){handle.releasePointerCapture(e.pointerId);save();}});
 handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();resize(e.key==='Home'?25:e.key==='End'?75:width+(e.key==='ArrowLeft'?5:-5));save();});
 const expand=node('button','展开预览','subtle');expand.setAttribute('aria-expanded','false');expand.onclick=()=>{const expanded=layout.classList.toggle('reader-expanded');expand.textContent=expanded?'返回图谱':'展开预览';expand.setAttribute('aria-expanded',String(expanded));};document.querySelector('.graph-controls').append(expand);resize(width);
})();
