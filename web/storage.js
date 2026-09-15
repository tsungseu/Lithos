'use strict';
// Versioned local browser configuration, aligned with TrendQuant's provider model.
// API keys are persisted only in this local origin and sent only on user action.
const WorkbenchStore=(()=>{
 const key='workbench.providers.v1',version=2,efforts=['default','minimal','low','medium','high','xhigh'];
 const clean=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
 function endpoint(value){const text=clean(value,500).replace(/\/+$/,'');const url=new URL(text);if(url.username||url.password||url.search||url.hash)throw Error('地址不能包含账号、密钥或查询参数');if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('远程地址须使用HTTPS，本机地址可使用HTTP');if(/\/(chat\/completions|responses|messages)$/i.test(url.pathname))throw Error('请填写Base URL，不包含具体请求路径');return text;}
 function modelItem(entry){const modelId=clean(typeof entry==='string'?entry:entry?.modelId,120);if(!modelId)return null;return {modelId,name:clean(entry?.name,120)||modelId,contextWindow:Math.min(100000000,Math.max(0,Number(entry?.contextWindow)||0))};}
 function normalize(value){const providers=[],ids=new Set();for(const raw of (Array.isArray(value?.providers)?value.providers:[]).slice(0,30)){
  try{if(!raw||typeof raw!=='object')continue;const name=clean(raw.name,60),baseUrl=endpoint(raw.baseUrl);if(!name)continue;const models=[],seen=new Set();for(const entry of (Array.isArray(raw.models)?raw.models:[]).slice(0,100)){const item=modelItem(entry);if(item&&!seen.has(item.modelId)){models.push(item);seen.add(item.modelId);}}
  if(!models.length)continue;let id=clean(raw.id,80)||crypto.randomUUID();if(ids.has(id))id=crypto.randomUUID();ids.add(id);providers.push({id,name,baseUrl,apiKey:clean(raw.apiKey,400),format:'openai',models,model:seen.has(raw.model)?raw.model:models[0].modelId,effort:efforts.includes(raw.effort)?raw.effort:'default'});}catch(_){}
 }return {providers,activeId:providers.some(p=>p.id===value?.activeId)?value.activeId:(providers[0]?.id||'')};}
 function load(){try{const raw=localStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);return normalize(parsed.data||parsed);}const legacy=JSON.parse(localStorage.getItem('knowledge-provider')||'null');if(legacy?.endpoint&&legacy?.model){const data=normalize({providers:[{id:'migrated',name:'原有模型配置',baseUrl:legacy.endpoint,apiKey:legacy.key||'',models:[legacy.model],model:legacy.model}],activeId:'migrated'});save(data);return data;}}catch(_){}return {providers:[],activeId:''};}
 function save(value){const data=normalize(value);localStorage.setItem(key,JSON.stringify({version,data,updatedAt:new Date().toISOString()}));return data;}
 function active(){const data=load();return data.providers.find(p=>p.id===data.activeId)||null;}
 return {load,save,normalize,endpoint,active,key,efforts};
})();
