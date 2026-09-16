'use strict';
// A single dispatch path for ribbon, context menus, palette and keyboard.
(() => {
 const paths={
  sidebar:'M3 4h18v16H3z M8 4v16', search:'M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14 M15 15l6 6',
  graph:'M4 5l15 3-8 13z M4 5h.1 M19 8h.1 M11 21h.1', daily:'M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16 M8 14h3',
  template:'M6 3h9l4 4v14H6z M10 11h5 M10 15h5', command:'M4 6l5 5-5 5 M12 17h8', project:'M3 6h7l2 2h9v12H3z',
  distill:'M9 3h6 M10 3v7l-6 9q-1 2 2 2h12q3 0 2-2l-6-9V3 M8 15h8', help:'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18 M9 9c0-5 9-3 4 2v3 M12 17h.1',
  settings:'M9.5 2h5l.5 2.4 2 1.2 2.3-.8 2.5 4.4-1.8 1.6v2.4l1.8 1.6-2.5 4.4-2.3-.8-2 1.2-.5 2.4h-5L9 20.6l-2-1.2-2.3.8-2.5-4.4L4 14.2v-2.4l-1.8-1.6 2.5-4.4 2.3.8 2-1.2.5-2.4z M15.5 12a3.5 3.5 0 1 0-7 0a3.5 3.5 0 0 0 7 0', file:'M6 3h8l4 4v14H6z M14 3v5h4',
  folder:'M3 6h7l2 2h9v12H3z M12 11v6 M9 14h6', sort:'M4 4v16l-3-3 M4 20l3-3 M10 5h11 M10 11h8 M10 17h5',
  reveal:'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10', expand:'M6 8l6-5 6 5 M6 16l6 5 6-5',
  bookmark:'M6 3h12v18l-6-4-6 4z', plus:'M12 5v14 M5 12h14', close:'M6 6l12 12 M6 18L18 6',
  back:'M14 5l-7 7 7 7', forward:'M10 5l7 7-7 7', more:'M5 12h.01 M12 12h.01 M19 12h.01', split:'M3 4h18v16H3z M12 4v16',
  read:'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3z M12 6v15', edit:'M4 17L16 5l3 3L7 20H4z', history:'M3 11a9 9 0 1 1 3 8 M3 4v7h7 M12 7v6l4 2',
  save:'M4 3h13l3 3v15H4z M8 3v6h8V3 M8 21v-8h8v8', download:'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4'
 };
 function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]||paths.file);svg.append(p);return svg;}
 const commands=new Map();
 const run=async id=>{const c=commands.get(id);if(!c||c.enabled?.()===false)return;try{return await c.run();}catch(e){notice(e.message);}};
 function button(id,iconOnly=true){const c=commands.get(id);const b=node('button',undefined,'ws-icon');b.type='button';b.title=c.label+(c.key?' ('+c.key+')':'');b.setAttribute('aria-label',c.label);b.dataset.command=id;b.append(icon(c.icon));if(!iconOnly)b.append(node('span',c.label));b.onclick=()=>run(id);b.disabled=c.enabled?.()===false;return b;}
 window.LithosCommands={commands,register:(id,c)=>commands.set(id,c),run,button,icon};
})();
