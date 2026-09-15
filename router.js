'use strict';
const viewPaths={home:'/app',work:'/app/projects',library:'/app/knowledge',guide:'/app/guide',settings:'/app/settings'};
const baseShowView=showView;
showView=function(name){baseShowView(name);const path=viewPaths[name];if(path&&location.pathname!==path)history.pushState({view:name},'',path);document.title=(name==='settings'?'配置 · ':'')+'曜石 · Lithos';};
function routeCurrent(){const view=Object.keys(viewPaths).find(k=>viewPaths[k]===location.pathname)||(location.hash==='#graph'?'library':'home');baseShowView(view);if(view==='settings')loadSettings();if(location.hash==='#graph')showGraph(true);document.title=(view==='settings'?'配置 · ':'')+'曜石 · Lithos';}
window.addEventListener('popstate',routeCurrent);
routeCurrent();
