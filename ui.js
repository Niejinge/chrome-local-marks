/* Shared visual controls for the webpage tools and the native side panel. */
const LocalMarksUI = (() => {
  const icons = {
    bookmark:'<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M1 1h10v18l-5-3.5L1 19Z"/></svg>',
    highlight:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 9-9 5 5-9 9H4Z M14 6l3-3 5 5-3 3 M3 22h17"/></svg>',
    'underline-solid':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h10M12 5v9M4 20h16"/></svg>',
    'underline-wavy':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h10M12 5v8M3 19q2-5 4 0t4 0 4 0 4 0"/></svg>',
    note:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v15H9l-4 4Z M8 8h8M8 12h6"/></svg>',
    trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>',
    chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6M16 14v6"/></svg>',
    back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>',
    page:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6Z M15 3v5h4M9 12h6M9 16h6"/></svg>'
  };
  const labels={bookmark:'书签',highlight:'高亮','underline-solid':'直线','underline-wavy':'波浪线',note:'笔记',page:'网页收藏'};
  const colors=['#ef6a5b','#f2bd55','#f59e0b','#df7e9a','#a78bfa','#6f91e8','#55bfc0','#65b883','#7d8790'];
  const css=`
    .lm-editor{display:block;color:var(--ui-text,#26313a);font-size:13px;line-height:1.5}
    .lm-editor .editor-title{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 12px}.lm-editor .editor-title strong{font-size:13px;font-weight:650}.lm-editor .editor-title small{font-size:11px;color:var(--ui-muted,#70808c)}
    .lm-editor .style-preview{display:flex;align-items:center;min-height:42px;padding:10px 12px;margin-bottom:14px;border:0;border-radius:8px;background:var(--ui-soft,#f4f7f8);font-size:13px;overflow:hidden}.lm-editor .sample-flag{display:inline-block;flex:none;margin-right:6px;clip-path:polygon(0 0,100% 0,100% 100%,50% 76%,0 100%)}
    .lm-editor .setting-row{display:grid;grid-template-columns:38px minmax(0,1fr);gap:8px;align-items:center;margin:12px 0}.lm-editor .setting-label{color:var(--ui-muted,#70808c);font-size:12px}
    .lm-editor .palette{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.lm-editor button.swatch{position:relative;width:22px;height:22px;min-width:22px;padding:0;border:0!important;border-radius:50%;background:var(--swatch)!important;box-shadow:none!important}.lm-editor button.swatch.selected{outline:2px solid var(--ui-accent,#087f80);outline-offset:2px}.lm-editor button.swatch.selected::after{content:'';position:absolute;inset:0;pointer-events:none;background:center / 14px 14px no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 12l4 4 8-8' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");filter:drop-shadow(0 1px 1px #0004)}.lm-editor .custom-color{width:23px;height:24px;padding:1px;border:1px solid var(--ui-border,#e3e9ec);border-radius:5px;background:transparent}
    .lm-editor .presets{display:flex;gap:3px;width:100%;padding:3px;background:var(--ui-soft,#f4f7f8);border-radius:8px}.lm-editor .presets button{display:block;flex:1;min-width:0;margin:0;padding:5px 7px;border:0!important;border-radius:6px;color:var(--ui-muted,#70808c)!important;background:transparent!important;box-shadow:none!important;font:inherit;font-size:12px}.lm-editor .presets button.selected{color:var(--ui-accent,#087f80)!important;background:var(--ui-selected,#e8f5f3)!important;font-weight:650}
    .lm-editor .fine-adjust{margin-top:14px;border-top:1px solid var(--ui-border,#e3e9ec);padding-top:10px}.lm-editor .fine-adjust>summary{display:flex;justify-content:space-between;color:var(--ui-muted,#70808c);cursor:pointer;list-style:none;font-size:12px}.lm-editor .fine-adjust>summary::after{content:'⌄'}.lm-editor .fine-adjust[open]>summary::after{content:'⌃'}.lm-editor .fine-adjust>summary::-webkit-details-marker{display:none}.lm-editor .fine-adjust[open]~.setting-row{display:none}.lm-editor .fine-adjust .setting-row{grid-template-columns:48px minmax(0,1fr)}
    .lm-editor .thickness-controls{display:grid;grid-template-columns:minmax(0,1fr) 43px;align-items:center;gap:8px;min-width:0}.lm-editor input[type=range]{width:100%;min-width:0;margin:0;accent-color:var(--ui-accent,#087f80);cursor:pointer}.lm-editor output{text-align:right;color:var(--ui-muted,#70808c);font-size:11px;font-variant-numeric:tabular-nums}.lm-editor .editor-status{min-height:0;margin-top:8px;font-size:11px;color:var(--ui-muted,#70808c)}.lm-editor .editor-status:empty{display:none}.lm-editor .editor-status.error{color:#b13e3e}
    .editor-retry{padding:4px 8px;border:0;border-radius:5px;background:var(--ui-selected,#e8f5f3);color:var(--ui-accent,#087f80);cursor:pointer}.editor-retry[hidden]{display:none!important}
    .undo-notice{position:fixed;inset:auto 16px 22px auto;margin:0;max-width:calc(100vw - 32px);align-items:center;gap:14px;padding:10px 12px;border:1px solid var(--ui-border,#e3e9ec);border-radius:9px;background:#26313a;color:#fff;font-size:13px;box-shadow:0 6px 22px #0002;pointer-events:auto}.undo-notice:popover-open{display:flex}.undo-notice button{padding:4px 7px;min-height:30px;border:0;border-radius:5px;background:transparent;color:inherit;cursor:pointer}.undo-notice .undo-action{color:#9de6dd;font-weight:650}.undo-notice button:focus-visible{outline:2px solid #9de6dd;outline-offset:2px}
    .lm-icon{width:17px;height:17px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.lm-type-icon{display:grid;place-items:center;width:25px;height:26px;flex:none;color:var(--type-color,#087f80)}.lm-type-icon.bookmark svg{fill:currentColor;stroke:none;width:11px;height:18px}
  `;
  function mode(item){return item.kind==='page'?'page':item.highlightColor?'highlight':item.underlineColor?(item.underlineStyle==='wavy'?'underline-wavy':'underline-solid'):item.isBookmark?'bookmark':'note'}
  function icon(name){return (icons[name]||icons.bookmark).replace('<svg ','<svg class="lm-icon" ')}
  function flagSize(value){return {width:6+Math.max(1,Math.min(10,Number(value)||4))*.65,height:12+Math.max(1,Math.min(10,Number(value)||4))}}
  function paintSample(element,type,config){
    element.replaceChildren();element.style.cssText='';
    const text=document.createElement('span');text.textContent=type==='bookmark'?'书签效果预览':'标注效果预览 Aa';
    const alpha=config.opacity/100,color=config.color,ink=`rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},${alpha})`;
    if(type==='bookmark'){
      const flag=document.createElement('span'),size=flagSize(config.thickness);flag.className='sample-flag';flag.style.cssText=`width:${size.width}px;height:${size.height}px;background:${color};opacity:${alpha}`;element.append(flag);
    }else if(type==='highlight'){
      text.style.backgroundImage=`linear-gradient(${ink},${ink})`;text.style.backgroundSize=`100% ${42+(config.thickness-3)/27*58}%`;text.style.backgroundRepeat='no-repeat';text.style.backgroundPosition='center';
    }else{
      text.style.textDecoration=`underline ${type==='underline-wavy'?'wavy':'solid'} ${ink} ${config.thickness}px`;text.style.textUnderlineOffset='.2em';
    }
    element.append(text);
  }
  function renderStyleEditor(container,type,config,onChange,onPreview=()=>{},options={}){
    const old=container.lmEditor;if(old)old.dispose();
    container.replaceChildren();container.classList.add('lm-editor');
    const meta=LocalMarksStyles.meta[type];let timer=0,dirty=false,disposed=false,revision=0,inFlight=0,failed=false,queue=Promise.resolve();
    const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el};
    const title=make('div','editor-title'),name=make('strong','',labels[type]+'样式'),hint=make('small','','自动保存');title.append(name,hint);
    const preview=make('div','style-preview');preview.setAttribute('aria-label','样式实时预览');
    const feedback=make('div','editor-status');feedback.setAttribute('role','status');
    const retry=make('button','editor-retry','重试');retry.type='button';retry.hidden=true;
    function markFailed(message='保存失败，请重试'){dirty=true;failed=true;feedback.textContent=message;feedback.classList.add('error');retry.hidden=false;}
    function flush(){
      clearTimeout(timer);if(!dirty)return queue;dirty=false;const snapshot={...config},token=revision;inFlight++;
      queue=queue.catch(()=>{}).then(()=>onChange(snapshot));
      queue.then(()=>{inFlight--;if(token===revision){failed=false;retry.hidden=true;if(!disposed){feedback.textContent='已保存';feedback.classList.remove('error')}}},error=>{inFlight--;if(token===revision&&!disposed)markFailed(error.message||'保存失败，请重试');});
      return queue;
    }
    retry.addEventListener('click',()=>flush());
    function update(immediate=false){revision++;dirty=true;failed=false;retry.hidden=true;feedback.textContent='';feedback.classList.remove('error');paintSample(preview,type,config);sync();onPreview({...config});clearTimeout(timer);if(immediate)flush();else timer=setTimeout(flush,220)}
    const row=(label)=>{const el=make('div','setting-row');el.append(make('span','setting-label',label));return el};
    const colorRow=row('颜色'),palette=make('div','palette');
    colors.forEach((color,index)=>{const button=make('button','swatch');button.type='button';button.style.setProperty('--swatch',color);button.setAttribute('aria-label',`${['红色','黄色','橙色','粉色','紫色','蓝色','青色','绿色','灰色'][index]} ${color}`);button.addEventListener('click',()=>{config.color=color;update(true)});palette.append(button)});
    const custom=make('input','custom-color');custom.type='color';custom.value=config.color;custom.setAttribute('aria-label','自定义颜色');custom.addEventListener('input',()=>{config.color=custom.value;update()});custom.addEventListener('change',()=>{config.color=custom.value;update(true)});palette.append(custom);colorRow.append(palette);
    const presetsRow=row(type==='bookmark'?'大小':type==='highlight'?'覆盖':'线宽'),presets=make('div','presets');
    const names=type==='bookmark'?['小','标准','大']:type==='highlight'?['细','半幅','铺满']:['细','标准','粗'];
    meta.presets.forEach(([value],index)=>{const button=make('button','',names[index]);button.type='button';button.addEventListener('click',()=>{config.thickness=value;update(true)});presets.append(button)});presetsRow.append(presets);
    const fine=make('details','fine-adjust');fine.append(make('summary','','精细调整'));
    const thicknessRow=row(type==='bookmark'?'大小':type==='highlight'?'覆盖':'线宽'),controls=make('div','thickness-controls');
    const range=make('input','thickness-range');range.type='range';range.min=String(meta.min);range.max=String(meta.max);range.step='1';range.setAttribute('aria-label',labels[type]+(type==='bookmark'?'大小':'粗细'));
    const output=make('output','thickness-output');
    const opacityRow=row('不透明度'),opacityControls=make('div','thickness-controls'),opacityRange=make('input','thickness-range');opacityRange.type='range';opacityRange.min='10';opacityRange.max='100';opacityRange.step='1';opacityRange.setAttribute('aria-label',labels[type]+'不透明度');const opacityOutput=make('output','thickness-output');
    if(options.idPrefix){range.id=options.idPrefix+'thickness';output.id=options.idPrefix+'thickness-value';custom.id=options.idPrefix+'color';opacityRange.id=options.idPrefix+'opacity';opacityOutput.id=options.idPrefix+'opacity-value'}
    for(const [input,field] of [[range,'thickness'],[opacityRange,'opacity']]){input.addEventListener('input',()=>{config[field]=Number(input.value);update()});input.addEventListener('change',()=>{config[field]=Number(input.value);update(true)});input.addEventListener('blur',flush)}
    controls.append(range,output);thicknessRow.append(controls);opacityControls.append(opacityRange,opacityOutput);opacityRow.append(opacityControls);fine.append(thicknessRow,opacityRow);
    fine.addEventListener('toggle',()=>{presetsRow.hidden=fine.open;options.onResize?.()});
    function sync(){
      palette.querySelectorAll('button').forEach((button,index)=>{const selected=colors[index].toLowerCase()===config.color.toLowerCase();button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});
      presets.querySelectorAll('button').forEach((button,index)=>{const selected=meta.presets[index][0]===config.thickness;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});
      range.value=String(config.thickness);opacityRange.value=String(config.opacity);custom.value=config.color;output.textContent=type==='highlight'?`${Math.round(config.thickness/30*100)}%`:type==='bookmark'?`${Math.round(flagSize(config.thickness).width)}px`:`${config.thickness}px`;opacityOutput.textContent=`${config.opacity}%`;
    }
    container.append(title,preview,colorRow,presetsRow,fine,feedback,retry);sync();paintSample(preview,type,config);
    const api={flush,isDirty(){return dirty||inFlight>0},hasFailure(){return failed},markFailed,dispose(){flush();disposed=true;clearTimeout(timer)},config};container.lmEditor=api;return api;
  }
  // Delay sibling hover changes while the pointer travels toward the open panel.
  // No invisible overlay is used, so clicks on real actions remain immediate.
  function createHoverTransit(parent, entries, isOpen) {
    let pendingTimer=0,closeTimer=0,origin=null,point=null,previous=null,toward=true,lastMoved=0,deadline=0;
    const opened=()=>isOpen()?entries.find(([menu])=>!menu.classList.contains('hidden')):null;
    const distance=(p,r)=>Math.hypot(Math.max(r.left-p.x,0,p.x-r.right),Math.max(r.top-p.y,0,p.y-r.bottom));
    function track(event){
      const next={x:event.clientX,y:event.clientY},entry=opened();
      if(previous&&entry&&Math.hypot(next.x-previous.x,next.y-previous.y)>1){toward=distance(next,entry[0].getBoundingClientRect())<=distance(previous,entry[0].getBoundingClientRect())+3;lastMoved=Date.now();}
      previous=point=next;
    }
    document.addEventListener('mousemove',track,{passive:true});
    function travelling(event){
      if(event)track(event);
      const entry=opened();
      if(!entry||!origin||!point||Date.now()>deadline||!toward||Date.now()-lastMoved>650)return false;
      const destination=entry[0].getBoundingClientRect(),source=origin,pad=12;
      if(point.x>=destination.left-pad&&point.x<=destination.right+pad&&point.y>=destination.top-pad&&point.y<=destination.bottom+pad)return true;
      let polygon;
      if(destination.left>=source.right)polygon=[[source.left,source.top-pad],[destination.left+pad,destination.top-pad],[destination.left+pad,destination.bottom+pad],[source.left,source.bottom+pad]];
      else if(destination.right<=source.left)polygon=[[source.right,source.top-pad],[destination.right-pad,destination.top-pad],[destination.right-pad,destination.bottom+pad],[source.right,source.bottom+pad]];
      else if(destination.top>=source.bottom)polygon=[[source.left-pad,source.top],[source.right+pad,source.top],[destination.right+pad,destination.top+pad],[destination.left-pad,destination.top+pad]];
      else polygon=[[source.left-pad,source.bottom],[source.right+pad,source.bottom],[destination.right+pad,destination.bottom-pad],[destination.left-pad,destination.bottom-pad]];
      // Convex corridor between the trigger and the panel's facing edge.
      const crosses=polygon.map(([x,y],i)=>{const [nx,ny]=polygon[(i+1)%polygon.length];return (nx-x)*(point.y-y)-(ny-y)*(point.x-x)});
      return crosses.every(n=>n>=0)||crosses.every(n=>n<=0);
    }
    function cancelClose(){clearTimeout(closeTimer);closeTimer=0;}
    function cancel(){clearTimeout(pendingTimer);pendingTimer=0;cancelClose();origin=null;deadline=0;}
    function activate(menu,button){cancel();origin=button.getBoundingClientRect();toward=true;lastMoved=Date.now();}
    function arm(){if(origin&&!deadline){deadline=Date.now()+1800;lastMoved=Date.now();}}
    function request(action,event,target){
      clearTimeout(pendingTimer);cancelClose();track(event);
      const current=opened();
      if(!current){action();return;}
      if(current[0]===target){activate(...current);return;}
      arm();
      const run=()=>{if(!isOpen())return cancel();if(travelling()){pendingTimer=setTimeout(run,80);return;}pendingTimer=0;action();};
      pendingTimer=setTimeout(run,350);
    }
    function leave(action){
      cancelClose();arm();
      const run=()=>{if(travelling()){closeTimer=setTimeout(run,80);return;}cancel();action();};
      closeTimer=setTimeout(run,650);
    }
    parent.addEventListener('mouseenter',cancelClose);
    for(const [menu] of entries)menu.addEventListener('mouseenter',()=>{clearTimeout(pendingTimer);pendingTimer=0;cancelClose();origin=null;});
    return {activate,request,leave,cancel,cancelClose,travelling};
  }
  function offerUndo(container,result,onRestored=()=>{},onError=()=>{}){
    if(!result?.undoToken)return;
    container.querySelector('.undo-notice')?.remove();
    const token=result.undoToken,expiresAt=result.expiresAt;let snapshot=result.deletedRecords;
    const notice=document.createElement('div');notice.className='undo-notice';notice.setAttribute('popover','manual');notice.setAttribute('role','status');
    const label=document.createElement('span');label.textContent='已删除';
    const undo=document.createElement('button');undo.className='undo-action';undo.type='button';undo.textContent='撤销';
    const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','关闭撤销提示');
    function dismiss(){clearTimeout(timer);snapshot=null;notice.remove();}
    undo.addEventListener('click',async()=>{undo.disabled=true;try{await LocalMarksData.mutate({op:'undo',token,records:snapshot});dismiss();onRestored();}catch(error){undo.disabled=false;onError(error);}});
    close.addEventListener('click',dismiss);notice.append(label,undo,close);container.append(notice);
    if(notice.showPopover)notice.showPopover();
    const timer=setTimeout(dismiss,Math.max(0,expiresAt-Date.now()));
  }
  return {css,icon,labels,mode,flagSize,renderStyleEditor,createHoverTransit,offerUndo};
})();
