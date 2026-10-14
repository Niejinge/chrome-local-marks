// The native side panel and the library share the same detail view and auto-save.
(() => {
  const $ = id => document.getElementById(id);
  const detail = $('detail'), listView = $('list-view'), editor = $('detail-style-editor');
  const theme = document.createElement('style'); theme.textContent = LocalMarksUI.css; document.head.append(theme);
  const params = new URLSearchParams(location.search);
  const library = params.has('library');
  const compatibility = params.has('compat');
  const sourceWindow = Number(params.get('sourceWindowId')) || null;
  async function contextWindowId(){return compatibility ? sourceWindow : (await chrome.windows.getCurrent()).id;}
  if(compatibility){
    document.body.classList.add('compatibility');
    $('collapse-panel').textContent='×';
    $('collapse-panel').setAttribute('aria-label','关闭标记窗口');
    $('collapse-panel').title='关闭标记窗口';
  }
  $('collapse-panel').hidden = library; document.body.classList.toggle('library',library);
  $('detail-delete').innerHTML = LocalMarksUI.icon('trash');
  if (!library) {
    if(!compatibility)chrome.windows.getCurrent().then(win => chrome.runtime.sendMessage({type:'LOCAL_MARKS_PANEL_READY',windowId:win.id}));
    const layoutRequest = compatibility ? null : chrome.sidePanel?.getLayout?.();
    layoutRequest?.then(layout => {
      document.body.classList.toggle('collapse-left',layout.side==='left');
      $('collapse-panel').setAttribute('aria-label',layout.side==='left'?'向左收起侧栏':'向右收起侧栏');
    }).catch(()=>{});
    $('collapse-panel').addEventListener('click',async()=>{
      if(!await flush())return;
      try{
        const win=await chrome.windows.getCurrent();
        if(compatibility){
          // Return to the article before destroying this window's execution context.
          if(sourceWindow && sourceWindow!==win.id){
            try{await chrome.windows.update(sourceWindow,{focused:true});}
            catch(_){/* The source may already have closed; still allow closing this window. */}
          }
          await chrome.windows.remove(win.id);
        }else await chrome.sidePanel.close({windowId:win.id});
      }
      catch(_){$('collapse-panel').title=compatibility?'未能关闭，请使用窗口关闭按钮':'未能收起，请使用浏览器侧栏顶部的关闭按钮';}
    });
  }
  let selected=null, newSelection=false, targetTab=null, mode='note', config=null;
  let saveQueue=Promise.resolve(), generation=0, noteTimer=0, noteDirty=false, composing=false;
  let listScroll=0, failure=null, noteInFlight=0, locating=0;
  const createdIds = new Set();
  let styles=LocalMarksStyles.normalize({});
  function status(text,error=false){$('detail-status').textContent=text;$('detail-status').classList.toggle('error',error);$('detail-retry').hidden=!error;}
  function changes(type,style){
    const clear={isBookmark:false,bookmarkColor:'',bookmarkThickness:0,highlightColor:'',highlightThickness:0,underlineColor:'',underlineThickness:0,underlineStyle:'solid'};
    const prefix=type==='highlight'?'highlight':type==='bookmark'?'bookmark':'underline';
    return {...clear,isBookmark:type==='bookmark',[`${prefix}Color`]:style.color,[`${prefix}Thickness`]:style.thickness,[`${prefix}Opacity`]:style.opacity,underlineStyle:type==='underline-wavy'?'wavy':'solid'};
  }
  function styleSummary(){
    const colorName={'#ef6a5b':'红色','#f2bd55':'黄色','#f59e0b':'橙色','#df7e9a':'粉色','#a78bfa':'紫色','#6f91e8':'蓝色','#55bfc0':'青色','#65b883':'绿色','#7d8790':'灰色'};
    $('detail-style-summary').textContent=`样式 · ${colorName[config?.color]||'自定义颜色'} / ${LocalMarksUI.labels[mode]||''}`;
  }
  function paintControls(){
    const hasStyle=Boolean(LocalMarksStyles.meta[mode]);$('detail-style').hidden=!hasStyle;
    $('detail-title').innerHTML=LocalMarksUI.icon(mode)+'<span>'+LocalMarksUI.labels[mode]+'详情</span>';
    $('detail-title').className=mode; $('detail-title').style.setProperty('--detail-mark-color',config?.color||'#087f80');
    if(!hasStyle){editor.lmEditor?.dispose();editor.replaceChildren();return;}
    $('detail-mode').value=mode;styleSummary();
    const id=selected.id,token=generation,allowCreate=newSelection,type=mode;
    const configCopy={...config};
    LocalMarksUI.renderStyleEditor(editor,type,configCopy,async next=>{
      if(selected?.id===id){config={...next};$('detail-title').style.setProperty('--detail-mark-color',next.color);styleSummary();}
      return enqueue(id,changes(type,next),{token,allowCreate,type,next});
    },next=>{
      if(selected?.id===id){config={...next};$('detail-title').style.setProperty('--detail-mark-color',next.color);styleSummary();}
      preview(id,changes(type,next));
    },{idPrefix:'detail-'});
  }
  function preview(id,patch=null){
    if(!targetTab||!selected||newSelection||selected.kind!=='selection')return;
    chrome.tabs.sendMessage(targetTab,{type:'LOCAL_MARKS_PREVIEW',id,record:patch?{...selected,...patch}:null}).catch(()=>{});
  }
  function enqueue(id,patch,options={}){
    const item={...selected},token=options.token??generation,allowCreate=options.allowCreate??newSelection,sourceTab=targetTab;
    const task=saveQueue.catch(()=>{}).then(async()=>{
      const data=await chrome.storage.local.get([STORAGE_KEY,STYLE_KEY]);const all=data[STORAGE_KEY]||[];
      const existing=all.find(record=>record.id===id);
      if(!existing&&(!allowCreate||createdIds.has(id)))throw Error('此标记已被删除');
      if(!existing&&!patch.note?.trim()&&!options.type)return;
      // Note-only selections stay note-only; editing a note never changes its mark type.
      let anchor = {};
      if(!existing && item.kind==='selection' && sourceTab){
        const result = await chrome.tabs.sendMessage(sourceTab,{type:'LOCAL_MARKS_VALIDATE_SELECTION',selection:item});
        if(result?.ok===false)throw Error(result.error||'无法定位原文');
        if(result?.position)anchor=result.position;
      }
      const result=await LocalMarksData.mutate({op:'upsert',record:{...item,...anchor},patch:{...anchor,...patch},allowCreate:allowCreate&&!createdIds.has(id),styleMode:options.type,styleConfig:options.next,annotationMode:options.rememberMode&&LocalMarksStyles.annotationModes.includes(options.type)?options.type:null});
      const updated=result.record;createdIds.add(id);
      if(result.styles)styles=result.styles;
      if(token===generation&&selected?.id===id){selected=updated;newSelection=false;failure=null;status('已自动保存');}
    });
    saveQueue=task;
    return task.catch(error=>{
      if(token===generation&&selected?.id===id){failure=()=>enqueue(id,patch,options);status(`保存失败：${error.message}`,true);}
      throw error;
    });
  }
  function flushNote(){
    clearTimeout(noteTimer);
    if(!selected||!noteDirty)return saveQueue.catch(()=>{});
    if(composing)return Promise.reject(Error('请先完成文字输入'));
    noteDirty=false;
    const id=selected.id,patch={note:$('detail-note').value};
    if(newSelection){patch.noteStyle='bubble';}
    noteInFlight++;return enqueue(id,patch).catch(error=>{if(selected?.id===id)noteDirty=true;throw error;}).finally(()=>noteInFlight--);
  }
  async function flush(){
    try{await flushNote();await editor.lmEditor?.flush();await saveQueue;if(failure)return false;return true;}catch(_){return false;}
  }
  async function select(item,tabId,isNew=false,shouldLocate=false){
    if(selected&&!await flush())return;
    if(detail.hidden)listScroll=window.scrollY;
    generation++;selected=item;newSelection=isNew;failure=null;noteDirty=false;
    targetTab=tabId || (normalizedUrl(item.url)===normalizedUrl(activeTab?.url)?activeTab?.id:null);
    const token=generation,data=await chrome.storage.local.get([STYLE_KEY,PREVIOUS_STYLE_KEY,LEGACY_STYLE_KEY]);if(token!==generation)return;
    styles=data[STYLE_KEY]?LocalMarksStyles.normalize(data[STYLE_KEY]):LocalMarksStyles.migrate(data[PREVIOUS_STYLE_KEY],data[LEGACY_STYLE_KEY]);
    mode=isNew?'note':LocalMarksUI.mode(item);
    const prefix=mode.startsWith('underline')?'underline':mode;
    config=styles[mode]?{color:item[`${prefix}Color`]||styles[mode].color,thickness:item[`${prefix}Thickness`]||styles[mode].thickness,opacity:item[`${prefix}Opacity`]??styles[mode].opacity}:null;
    $('detail-quote').textContent=item.quote||item.title||item.url||'';$('detail-note').value=item.note||'';
    $('detail-source').textContent=item.title||hostname(item.url);$('detail-source').title=item.url||'';
    $('detail-meta').textContent=hostname(item.url)+(item.createdAt?' · '+formatDate(item.createdAt):'');
    $('detail-locate').textContent=item.kind==='page'?'打开网页':'定位原文';$('detail-locate').disabled=isNew;
    $('detail-delete').hidden=isNew;listView.hidden=true;detail.hidden=false;$('settings-view').hidden=true;
    $('settings-toggle').setAttribute('aria-expanded','false');$('detail-style').open=false;
    $('detail-navigation-status').hidden=true;
    paintControls();status('输入后自动保存');window.scrollTo({top:0,behavior:'instant'});
    if(shouldLocate)await locateSelected(token);
  }
  async function close(save=true){
    if(save&&!await flush())return;
    clearTimeout(noteTimer);generation++;selected=null;newSelection=false;noteDirty=false;failure=null;
    editor.lmEditor?.dispose();detail.hidden=true;listView.hidden=false;
    requestAnimationFrame(()=>window.scrollTo({top:listScroll,behavior:'instant'}));
  }
  $('detail-note').addEventListener('input',()=>{
    noteDirty=true;clearTimeout(noteTimer);status('');
    if(!composing)noteTimer=setTimeout(()=>flushNote().catch(()=>{}),350);
  });
  $('detail-note').addEventListener('compositionstart',()=>{composing=true;clearTimeout(noteTimer);});
  $('detail-note').addEventListener('compositionend',()=>{composing=false;noteDirty=true;clearTimeout(noteTimer);noteTimer=setTimeout(()=>flushNote().catch(()=>{}),350);});
  $('detail-note').addEventListener('blur',()=>{if(!composing)flushNote().catch(()=>{});});
  $('detail-mode').addEventListener('change',async()=>{
    if(!await flush()){$('detail-mode').value=mode;return;}
    mode=$('detail-mode').value;config={...styles[mode]};paintControls();
    const patch=changes(mode,config);preview(selected.id,patch);enqueue(selected.id,patch,{type:mode,next:config,rememberMode:true}).catch(()=>{});
  });
  $('detail-retry').addEventListener('click',()=>{if(noteDirty)flushNote().catch(()=>{});else failure?.().catch(()=>{});});
  async function locateSelected(token=generation){
    if(!selected||newSelection)return;
    const item=selected;locating++;$('detail-navigation-status').hidden=true;
    try{
      const result=await chrome.runtime.sendMessage({type:'LOCAL_MARKS_OPEN_RECORD',record:item,sourceWindowId:sourceWindow});
      if(result?.ok!==true||item.kind==='selection'&&result.jumped===false)throw Error('网页内容已变化或暂时无法定位，请刷新网页后重试');
      if(token===generation&&selected?.id===item.id)targetTab=result.tabId||targetTab;
    }catch(error){if(token===generation&&selected?.id===item.id){$('detail-navigation-status').textContent=error.message||'定位失败，请重试';$('detail-navigation-status').hidden=false;}}
    finally{locating--;}
  }
  $('detail-locate').addEventListener('click',async()=>{if(await flush())await locateSelected();});
  $('detail-delete').addEventListener('click',async()=>{
    if(!selected||!await flush())return;
    const id=selected.id;
    try{const data=await chrome.storage.local.get(STORAGE_KEY);const result=await LocalMarksData.mutate({op:'delete',ids:[id],undo:true});close(false);showUndo(result);}
    catch(_){status('删除失败，请重试',true);}
  });
  $('detail-close').addEventListener('click',()=>close());
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!detail.hidden&&!event.isComposing)close();});
  window.addEventListener('marks-select',event=>select(event.detail.item,event.detail.tabId,false,event.detail.locate===true));
  async function context(value){
    if(library||!value)return;const windowId=await contextWindowId();if(value.windowId!==windowId)return;
    if(value.draft)return select(value.draft,value.tabId,true);
    if(value.id){const data=await chrome.storage.local.get(STORAGE_KEY),item=(data[STORAGE_KEY]||[]).find(record=>record.id===value.id);if(item)await select(item,value.tabId);}
    else if(!detail.hidden)await close();
  }
  (async()=>{if(library)return;const windowId=await contextWindowId();const data=await chrome.storage.session.get(['readerMarksPanelContext','readerMarksPanelContextsV1']);await context(data.readerMarksPanelContextsV1?.[windowId]||data.readerMarksPanelContext);})();
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='session'&&changes.readerMarksPanelContext)context(changes.readerMarksPanelContext.newValue);
    if(area==='local'&&changes[STORAGE_KEY]&&selected){
      const updated=(changes[STORAGE_KEY].newValue||[]).find(item=>item.id===selected.id);
      if(!updated&&!newSelection)close(false);else if(updated){selected=updated;newSelection=false;}
    }
  });
  window.addEventListener('pagehide', () => {
    if(!selected)return;
    const dirtyStyle=editor.lmEditor?.isDirty();
    if(!noteDirty&&!noteInFlight&&!dirtyStyle)return;
    chrome.runtime.sendMessage({type:'LOCAL_MARKS_FINAL_SAVE',record:{...selected},allowCreate:newSelection,note:composing?selected.note:$('detail-note').value,stylePatch:dirtyStyle&&config?changes(mode,config):null,styleMode:dirtyStyle?mode:null,styleConfig:dirtyStyle&&config?{...config}:null}).catch(()=>{});
  });
  chrome.tabs.onActivated?.addListener(async info=>{const win=await chrome.windows.getCurrent();if(!library&&!compatibility&&info.windowId===win.id&&selected&&!locating&&info.tabId!==targetTab)close();});
  chrome.storage.local.get('readerMarksEntryV1').then(data=>{const value=data.readerMarksEntryV1||{};$('entry-side').value=value.hidden?'hidden':value.side||'right';});
  $('entry-side').addEventListener('change',async()=>{const data=await chrome.storage.local.get('readerMarksEntryV1');await chrome.storage.local.set({readerMarksEntryV1:{...data.readerMarksEntryV1,hidden:$('entry-side').value==='hidden',side:$('entry-side').value==='left'?'left':'right'}});});
})();
