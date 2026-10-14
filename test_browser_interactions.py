"""Run DOM integration checks in an isolated Chrome with synthetic storage.

Uses real page rendering and extension scripts, with a mock Chrome API so no
installed extension or personal browser data is read or changed.
"""
import html
import json
import os
import pathlib
import re
import select
import signal
import shutil
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent
CHROME = os.environ.get("CHROME_BIN") or shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser") or "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
MOCK = r'''
window.testStore = { data: {}, listeners: [], messages: [], runtimeListeners: [], failWrite: false, tabListeners:[] };
window.chrome = window.chrome || {};
chrome.storage = {
  local: {
    QUOTA_BYTES:10485760,
    getBytesInUse:async()=>testStore.forceBytes??new TextEncoder().encode(JSON.stringify(testStore.data)).length,
    get: async () => structuredClone(testStore.data),
    set: async (next) => {
      if (testStore.failWrite) { testStore.failWrite = false; throw Error('simulated storage failure'); }
      const changes = {};
      for (const [key, value] of Object.entries(next)) {
        changes[key] = {oldValue: testStore.data[key], newValue: structuredClone(value)};
        testStore.data[key] = structuredClone(value);
      }
      queueMicrotask(() => testStore.listeners.forEach(fn => fn(changes, 'local')));
    }
  },
  onChanged: { addListener: fn => testStore.listeners.push(fn) }
};
chrome.runtime = { getURL:path=>'chrome-extension://test/'+path,onMessage: { addListener(fn) { testStore.runtimeListeners.push(fn); } }, sendMessage: async message => { testStore.messages.push(message);if(message.type==='LOCAL_MARKS_MUTATE'){try{testStore.writer ||= LocalMarksStore.create(chrome.storage.local);return {ok:true,result:await testStore.writer.mutate(message.command)}}catch(error){return {ok:false,error:error.message}}}if(message.type==='LOCAL_MARKS_OPEN_RECORD'){if(testStore.navigationFailure)return {ok:false};return {ok:true,jumped:true,tabId:1}} } };
chrome.storage.session = {get:async()=>testStore.session||{}};
chrome.windows = {getCurrent:async()=>({id:1}),update:async(id,options)=>{testStore.windowActions||=[];testStore.windowActions.push(['focus',id,options]);if(testStore.failFocus)throw Error('Source window closed');},remove:async id=>{testStore.windowActions||=[];testStore.windowActions.push(['close',id]);testStore.closedWindow=id}};
chrome.sidePanel={getLayout:async()=>({side:'right'}),close:async options=>{testStore.closedWindow=options.windowId}};
chrome.tabs = { create:async options=>{testStore.createdTab=options;return {id:88,...options}},onActivated:{addListener:fn=>testStore.tabListeners.push(fn)},query: async options => {testStore.queries||=[];testStore.queries.push(options);return [{id: 1, url: location.href, title: '测试页面'}]}, sendMessage: async () => ({ok:true}) };
const makeSelection = (id, url, title, quote) => ({id, url, title, quote, kind:'selection', start:0, end:quote.length,
  highlightColor:'#ef6a5b', highlightThickness:30, highlightOpacity:65, note:'保留笔记', createdAt:'2026-09-29T00:00:00Z'});
testStore.data.readerMarksStyleV2 = {bookmark:{color:'#ef6a5b',thickness:4,opacity:100},highlight:{color:'#f2bd55',thickness:7,opacity:65},underline:{color:'#a78bfa',thickness:6,opacity:35,lineStyle:'wavy'}};
testStore.data.readerMarksV1 = [
  makeSelection('local', location.href, '当前页面', '这是本页用于验证的高亮文本'),
  makeSelection('remote1', 'https://example.com/a#one', '页面甲', '远端内容一'),
  makeSelection('remote2', 'https://example.com/a#two', '页面甲', '远端内容二'),
  makeSelection('query1', 'https://example.com/b?q=1', '页面乙', '查询一'),
  makeSelection('query2', 'https://example.com/b?q=2', '页面丙', '查询二'),
  {id:'page', kind:'page', url:'https://other.example/', title:'收藏网页'}
];
'''
CHECKS = r'''
(async () => {
  const checks = [];
  const pause = () => new Promise(resolve => setTimeout(resolve, 35));
  const check = (value, message) => { if (!value) throw Error(message); checks.push(message); };
  const finish = () => { const result=document.createElement('pre');result.id='qa-results';result.textContent=JSON.stringify({case:TEST_CASE,passed:checks.length,checks});document.body.appendChild(result); };
  await pause();
  const ui = TEST_CASE.startsWith('content') ? document.querySelector('#local-reader-marks-host').shadowRoot : document;
  const $ = selector => ui.querySelector(selector);
  const all = selector => [...ui.querySelectorAll(selector)];
  const saved = () => testStore.data.readerMarksV1;
  const local = () => saved().find(item => item.id === 'local');
  if (TEST_CASE === 'content-release') {
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const mark=()=>document.querySelector('mark[data-local-reader-mark="local"]');
    mark().click();const style=all('#quick>button').find(button=>button.textContent==='样式');style.click();
    testStore.failWrite=true;const palette=$('.quick-settings .palette');palette.querySelectorAll('button')[1].click();await wait(100);
    const editor=$('.quick-settings').lmEditor;
    check(editor.isDirty()&&editor.hasFailure()&&!$('.quick-settings .editor-retry').hidden,'failed style remains dirty and offers retry');
    let rejected=false;testStore.failWrite=true;try{await editor.flush()}catch(_){rejected=true}
    check(rejected,'flush reports a failed style save instead of successful completion');
    document.querySelector('p').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));await wait(80);
    mark().click();style.click();await wait(80);
    check($('.quick-settings .swatch.selected').style.getPropertyValue('--swatch')==='#f2bd55','reopening styles retains the failed color choice');
    $('.quick-settings .editor-retry').click();await wait(160);
    check(local().highlightColor==='#f2bd55'&&!$('.quick-settings').lmEditor.isDirty(),'retry persists retained color and clears dirty state');
    mark().click();$('#quick-delete').click();await wait(80);
    check(!local()&&$('.undo-notice').matches(':popover-open'),'webpage deletion offers an accessible undo popover');
    $('.undo-action').click();await wait(120);check(local()?.highlightColor==='#f2bd55','webpage undo restores the complete annotation');
    finish();return;
  }
  if (TEST_CASE === 'popup-release') {
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    check(!$('#getting-started').hidden,'first use shows a compact help card');$('#help-dismiss').click();await pause();check($('#getting-started').hidden&&testStore.data.readerMarksHelpDismissedV1,'help dismissal is remembered');
    testStore.forceBytes=9*1048576;await updateCapacity();check(!$('#capacity-warning').hidden&&$('#storage-usage').textContent.includes('9.00'),'capacity warning reflects quota usage');$('#capacity-settings').click();check(!$('#settings-view').hidden,'capacity warning opens backup settings');$('#settings-close').click();testStore.forceBytes=0;await updateCapacity();
    $('#records .record-detail').click();await pause();
    testStore.listeners.forEach(fn=>fn({readerMarksPanelContext:{newValue:{id:null,windowId:1,tabId:1}}},'session'));await wait(100);check($('#detail').hidden&&!$('#list-view').hidden,'opening list context exits detail without page jump');
    const before=structuredClone(local());$('#records .delete').click();await wait(80);check(!local()&&$('.undo-notice').matches(':popover-open'),'list delete directly exposes undo');
    testStore.failWrite=true;$('.undo-action').click();await wait(80);check(!local()&&!$('.undo-action').disabled,'failed undo retains retry action and does not restore prematurely');$('.undo-action').click();await wait(80);check(local()?.note===before.note,'retry undo restores the record');
    const noteId=local().id;$('#records .record-detail').click();await pause();testStore.forceBytes=10485760;const original=local().note;$('#detail-note').value=original+'空间不足时的新增文字';$('#detail-note').dispatchEvent(new Event('input'));await wait(450);check(local().note===original&&!$('#detail-retry').hidden&&$('#detail-status').textContent.includes('空间不足'),'quota rejection preserves saved note and pending input');testStore.forceBytes=0;$('#detail-retry').click();await wait(100);check(local().note.includes('新增文字'),'quota failure can be retried after space is available');$('#detail-close').click();await wait(80);
    const page={id:'page-note',kind:'page',url:location.href,title:'网页笔记',note:'中文网页收藏笔记',createdAt:'2026-10-14'};
    await LocalMarksData.mutate({op:'import',records:[page]});await pause();
    const round=LocalMarksBackup.parse(LocalMarksBackup.create(testStore.data.readerMarksV1,LocalMarksStyles.defaults));check(round.records.find(x=>x.id===page.id).note===page.note,'page bookmark note survives UI data backup round trip');
    window.dispatchEvent(new CustomEvent('marks-select',{detail:{item:testStore.data.readerMarksV1.find(x=>x.id===noteId),tabId:1}}));await pause();$('#detail-delete').click();await wait(80);check(!saved().some(x=>x.id===noteId)&&$('#detail').hidden,'detail deletion returns to list');$('.undo-action').click();await wait(80);check(saved().some(x=>x.id===noteId),'detail deletion also supports undo');
    finish();return;
  }
  if (TEST_CASE === 'content-hover-transit') {
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const mark=document.querySelector('mark[data-local-reader-mark="local"]');
    const styleButton=all('#quick > button').find(button=>button.textContent==='样式');
    const menu=$('.quick-settings');
    const move=(x,y)=>document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:x,clientY:y}));
    const enter=(element,x,y)=>element.dispatchEvent(new MouseEvent('mouseenter',{clientX:x,clientY:y}));
    const opened=()=>$('#quick').classList.contains('open')&&!menu.classList.contains('hidden');
    for(const placement of ['right','left','below','above']){
      mark.click();$('#quick').style.left='400px';$('#quick').style.top='240px';styleButton.click();
      const parent=$('#quick').getBoundingClientRect();
      menu.style.maxHeight='200px';menu.style.top='0';menu.style.bottom='auto';
      if(placement==='right')menu.style.left=(parent.width+24)+'px';
      if(placement==='left')menu.style.left=(-menu.offsetWidth-24)+'px';
      if(placement==='below'){menu.style.left='0';menu.style.top=(parent.height+24)+'px';}
      if(placement==='above'){menu.style.left='0';menu.style.top=(-menu.offsetHeight-24)+'px';}
      const source=styleButton.getBoundingClientRect(),destination=menu.getBoundingClientRect();
      const start={x:source.left+source.width/2,y:source.top+source.height/2};
      const end={x:placement==='right'?destination.left+8:placement==='left'?destination.right-8:destination.left+destination.width*.5,y:placement==='above'?destination.bottom-8:placement==='below'?destination.top+8:destination.top+destination.height*.5};
      move(start.x,start.y);
      $('#quick').dispatchEvent(new MouseEvent('mouseleave',{clientX:start.x,clientY:start.y}));
      if(placement==='right'||placement==='left'){
        const sibling=placement==='right'?$('#quick-note'):$('#quick-edit'),rect=sibling.getBoundingClientRect();
        move(rect.left+rect.width*.5,start.y);enter(sibling,rect.left+rect.width*.5,start.y);
        check(opened(),placement+'ward transit does not immediately switch sibling actions');
      }
      for(let step=1;step<=7;step++){move(start.x+(end.x-start.x)*step/7,start.y+(end.y-start.y)*step/7);await wait(85);}
      enter($('#quick'),end.x,end.y);enter(menu,end.x,end.y);await wait(750);
      check(opened(),placement+' submenu survives slow diagonal crossing and stays open after entry');
      move(12,12);$('#quick').dispatchEvent(new MouseEvent('mouseleave',{clientX:12,clientY:12}));await wait(720);
      check(!$('#quick').classList.contains('open'),'leaving '+placement+' submenu genuinely closes editing tools');
    }
    mark.click();styleButton.click();
    const deleteRect=$('#quick-delete').getBoundingClientRect();move(deleteRect.left+deleteRect.width/2,deleteRect.top+deleteRect.height/2);enter($('#quick-delete'),deleteRect.left+deleteRect.width/2,deleteRect.top+deleteRect.height/2);await wait(850);
    check(menu.classList.contains('hidden')&&$('#quick').classList.contains('open'),'deliberate sibling hover eventually switches without closing the parent');
    mark.click();styleButton.click();$('#quick-delete').dispatchEvent(new FocusEvent('focus'));
    check(menu.classList.contains('hidden'),'keyboard focus still changes actions immediately');
    styleButton.click();$('#quick-note').click();await pause();
    check(!$('#note-composer').classList.contains('hidden'),'explicit note click remains immediate during style editing');
    document.querySelector('p').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));await pause();
    const text=document.createElement('p');text.textContent='新建菜单鼠标过渡';document.body.append(text);
    const range=document.createRange();range.selectNodeContents(text);window.getSelection().removeAllRanges();window.getSelection().addRange(range);text.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));await pause();
    $('#all-options').click();const createMenu=$('#settings'),trigger=$('#all-options').getBoundingClientRect();
    createMenu.style.left='0';createMenu.style.top=($('#toolbar').offsetHeight+26)+'px';createMenu.style.bottom='auto';
    const target=createMenu.getBoundingClientRect();move(trigger.left+trigger.width/2,trigger.bottom-2);$('#toolbar').dispatchEvent(new MouseEvent('mouseleave'));
    for(let step=1;step<=7;step++){move(trigger.left+trigger.width/2,target.top-24+step*5);await wait(85);}
    enter($('#toolbar'),target.left+12,target.top+12);enter(createMenu,target.left+12,target.top+12);await wait(300);
    check(!createMenu.classList.contains('hidden'),'new-selection styles share gap-crossing protection');
    move(12,12);$('#toolbar').dispatchEvent(new MouseEvent('mouseleave'));await wait(720);
    check(createMenu.classList.contains('hidden'),'new-selection settings close after a real departure');
    finish();return;
  }
  if (TEST_CASE === 'popup-compat') {
    check(!chrome.sidePanel && testStore.queries.some(value=>value.windowId===3),'compatibility list queries source window without sidePanel');
    check(!$('#group-actions').hidden===false && all('#records .record').length===1,'compatibility list starts with original page records');
    $('#records .record-detail').click();await pause();
    check(!$('#detail').hidden && testStore.messages.some(message=>message.type==='LOCAL_MARKS_OPEN_RECORD'&&message.sourceWindowId===3),'compatibility details locate in source window');
    $('#detail-note').value='兼容窗口自动保存';$('#detail-note').dispatchEvent(new Event('input'));await new Promise(resolve=>setTimeout(resolve,450));
    check(local().note==='兼容窗口自动保存','compatibility note autosaves');
    testStore.tabListeners.forEach(fn=>fn({windowId:3,tabId:999}));await pause();
    check(!$('#detail').hidden,'source tab activation preserves compatibility details');
    $('#detail-mode').value='underline-wavy';$('#detail-mode').dispatchEvent(new Event('change'));await pause();
    check(local().underlineStyle==='wavy'&&testStore.data.readerMarksAnnotationModeV1==='underline-wavy','compatibility mode edit persists');
    const oldQuote=$('#detail-quote').textContent;
    testStore.listeners.forEach(fn=>fn({readerMarksPanelContext:{newValue:{windowId:4,id:'missing'}}},'session'));await pause();
    check($('#detail-quote').textContent===oldQuote&&!$('#detail').hidden,'other source window context cannot overwrite details');
    testStore.listeners.forEach(fn=>fn({readerMarksPanelContext:{newValue:{windowId:3,id:null}}},'session'));await pause();
    check($('#detail').hidden,'reopening source list returns from details');
    $('#open-page-panel').click();await pause();
    check(testStore.createdTab?.windowId===3 && testStore.createdTab.url.includes('library=1'),'library opens in original browser window');
    $('#collapse-panel').click();await pause();
    check(testStore.closedWindow===1,'compatibility close removes only its own window');
    check(JSON.stringify(testStore.windowActions)===JSON.stringify([['focus',3,{focused:true}],['close',1]]),'compatibility close returns to source before removing manager');
    testStore.failFocus=true;testStore.closedWindow=null;
    $('#collapse-panel').click();await pause();
    check(testStore.closedWindow===1,'compatibility close still works when source no longer exists');
    finish();return;
  }
  if (TEST_CASE === 'content-note-delete') {
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    for(const mode of ['highlight','bookmark','underline-solid','underline-wavy']) {
      const item={...local(),note:'需要快捷删除的笔记',isBookmark:mode==='bookmark',highlightColor:mode==='highlight'?'#ef6a5b':'',underlineColor:mode.startsWith('underline')?'#55bfc0':'',underlineStyle:mode==='underline-wavy'?'wavy':'solid'};
      await chrome.storage.local.set({readerMarksV1:[item]});await pause();
      const mark=document.querySelector('mark[data-local-reader-mark="local"]');
      mark.querySelector('[data-local-note-indicator]').click();await pause();
      check($('#note-tooltip .note-delete') && $('#note-tooltip').classList.contains('visible'),mode+' note preview exposes quick delete');
      $('#note-tooltip .note-delete').click();await pause();
      check(local()?.note==='' && local().highlightColor===item.highlightColor && local().underlineColor===item.underlineColor && local().isBookmark===item.isBookmark,mode+' delete removes only note');
      $('.undo-action').click();await pause();
      check(local()?.note==='需要快捷删除的笔记',mode+' note delete supports undo');
    }
    let mark=document.querySelector('mark[data-local-reader-mark="local"]');mark.click();$('#quick-note').click();
    $('#note-composer-text').value='还没触发自动保存';$('#note-composer-text').dispatchEvent(new Event('input'));
    $('#note-delete').click();$('#note-composer-text').dispatchEvent(new Event('blur'));await wait(450);
    check(local()?.note==='' && $('#note-composer').classList.contains('hidden'),'editor delete cancels pending autosave and blur cannot restore note');
    $('.undo-action').click();await pause();
    mark=document.querySelector('mark[data-local-reader-mark="local"]');mark.querySelector('[data-local-note-indicator]').click();await pause();
    testStore.failWrite=true;$('#note-tooltip .note-delete').click();await pause();
    check(local()?.note==='需要快捷删除的笔记' && $('#note-tooltip').classList.contains('visible') && !$('#note-tooltip .note-delete').disabled,'failed note delete preserves note and permits retry');
    $('#note-tooltip .note-delete').click();await pause();
    check(local()?.note==='', 'retry deletes note successfully');
    $('.undo-action').click();await pause();
    const pure={...local(),isBookmark:false,highlightColor:'',underlineColor:'',note:'纯笔记内容'};
    await chrome.storage.local.set({readerMarksV1:[pure]});await pause();
    document.querySelector('mark[data-local-reader-mark="local"]').click();await pause();
    $('#note-tooltip .note-delete').click();await pause();
    check(!local()&&!document.querySelector('mark[data-local-reader-mark="local"]'),'pure note delete removes its record and page indicator');
    $('.undo-action').click();await pause();
    check(local()?.note==='纯笔记内容' && document.querySelector('mark[data-local-reader-mark="local"]'),'pure note undo restores record and indicator');
    const text=document.createElement('p');text.textContent='还未保存的新笔记';document.body.append(text);
    const r=document.createRange();r.selectNodeContents(text);getSelection().removeAllRanges();getSelection().addRange(r);text.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));await pause();$('#add-note').click();
    $('#note-composer-text').value='新草稿';$('#note-composer-text').dispatchEvent(new Event('input'));$('#note-delete').click();await wait(450);
    check(!saved().some(item=>item.quote==='还未保存的新笔记') && $('#note-composer').classList.contains('hidden'),'deleting unsaved note cancels creation');
    finish();return;
  }
  if (TEST_CASE === 'content-autosave') {
    const wait = ms=>new Promise(resolve=>setTimeout(resolve,ms));
    let mark=document.querySelector('mark[data-local-reader-mark="local"]');mark.click();$('#quick-note').click();
    const textarea=$('#note-composer-text');
    textarea.value='自动保存的笔记';textarea.dispatchEvent(new Event('input'));await wait(420);
    check(local().note==='自动保存的笔记' && !$('#note-composer').classList.contains('hidden'),'quick note autosaves while composer stays open');
    textarea.dispatchEvent(new Event('compositionstart'));textarea.value='中文输入中的候选字';textarea.dispatchEvent(new Event('input'));await wait(420);
    check(local().note==='自动保存的笔记','IME composition does not save unfinished candidates');
    textarea.dispatchEvent(new Event('compositionend'));await wait(420);
    check(local().note==='中文输入中的候选字','IME completion automatically saves confirmed text');
    textarea.value='';textarea.dispatchEvent(new Event('input'));await wait(420);
    check(local().note==='' && local().highlightColor,'clearing a note is saved without removing its highlight');
    testStore.failWrite=true;textarea.value='失败后仍保留的文字';textarea.dispatchEvent(new Event('input'));await wait(420);
    check(local().note==='' && textarea.value==='失败后仍保留的文字' && $('#note-save-status').textContent.includes('失败'),'failed quick autosave retains text and reports failure');
    textarea.dispatchEvent(new Event('input'));await wait(420);
    check(local().note==='失败后仍保留的文字','editing retries a failed quick save');
    textarea.value='离开前最后一次修改';textarea.dispatchEvent(new Event('input'));document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));await wait(70);
    check(local().note==='离开前最后一次修改','outside click flushes the latest note before closing');
    mark=document.querySelector('mark[data-local-reader-mark="local"]');mark.click();
    const actions=all('#quick>button');check(actions.at(-1).id==='quick-delete' && actions[1].textContent.includes('样式'),'delete is directly available at the far right');
    $('#quick-edit').click();check(!$('#quick-mode-menu').classList.contains('hidden'),'clicking current type opens the same type menu as hover');
    const before=document.querySelector('p').getBoundingClientRect();
    const bookmark={...local(),isBookmark:true,highlightColor:'',underlineColor:'',bookmarkColor:'#ef6a5b',bookmarkThickness:4,note:''};
    await chrome.storage.local.set({readerMarksV1:[bookmark]});await pause();
    const after=document.querySelector('p').getBoundingClientRect(),flag=$('.bookmark-flag');
    check(Boolean(flag) && flag.getBoundingClientRect().width<=10,'bookmark uses a narrow notched flag');
    check(Math.abs(before.width-after.width)<.1 && document.querySelector('mark').style.borderLeftWidth==='','bookmark does not add a border or change article width');
    const extra=document.createElement('p');extra.textContent='新选区自动保存样式';document.body.append(extra);
    const range=document.createRange();range.selectNodeContents(extra);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);extra.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));await pause();$('#all-options').click();
    const slider=$('#settings .thickness-range');slider.value='12';slider.dispatchEvent(new Event('input'));
    extra.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));await wait(80);
    check(saved().some(item=>item.quote===extra.textContent && item.highlightThickness===12),'leaving new-selection styles immediately still saves the final value');
    mark=document.querySelector('mark[data-local-reader-mark="local"]');mark.click();$('#quick-note').click();textarea.value='不允许恢复被删除的笔记';textarea.dispatchEvent(new Event('input'));
    await chrome.storage.local.set({readerMarksV1:saved().filter(item=>item.id!=='local')});await wait(420);
    check(!local(),'pending autosave does not resurrect a deleted record');

    finish();return;
  }
  if (TEST_CASE === 'popup-list') {
    check($('#group-actions').hidden,'current-page list hides group actions');
    const base=local();
    await chrome.storage.local.set({readerMarksV1:[{...base,id:'older',start:0,createdAt:'2026-01-01',updatedAt:'2026-12-01'},{...base,id:'newest',start:500,createdAt:'2026-10-09',updatedAt:'2026-10-09'}]});await pause();
    check($('#records .record').dataset.recordId==='newest','new annotations appear first regardless of document offsets or edits to old notes');
    const before=testStore.messages.length;
    $('#records .record .quote').click();await pause();
    check(!$('#detail').hidden && testStore.messages.slice(before).some(message=>message.type==='LOCAL_MARKS_OPEN_RECORD'&&message.record.id==='newest'),'clicking record text opens detail and locates its original text');
    $('#detail-close').click();await pause();
    const area=$('#records .record-detail').getBoundingClientRect();
    check(area.width>100&&area.height>=44,'detail uses the full record content as a large click target');
    $('#records .record-locate').click();await pause();
    check(testStore.messages.at(-1).type==='LOCAL_MARKS_OPEN_RECORD','explicit locate button sends page jump');
    $('#scope-all').click();await pause();
    check(all('#records details').every(el=>!el.open),'switching from current page to all starts collapsed');
    document.body.style.width='320px';
    check(document.body.scrollWidth<=320 && !$('#group-actions').hidden,'group actions fit the narrow sidebar');
    $('#expand-all').click();await pause();
    check(all('#records details').every(el=>el.open),'sidebar expand action reveals records');
    check($('#records .record').dataset.recordId==='newest','all-page groups also use creation order');
    testStore.tabListeners.forEach(fn=>fn({windowId:1,tabId:1}));await pause();
    check($('#detail').hidden,'navigation callback does not create detail from the list');
    $('#records .record-detail').click();await pause();
    testStore.tabListeners.forEach(fn=>fn({windowId:1,tabId:1}));await pause();
    check(!$('#detail').hidden,'activation of located tab keeps its detail open');
    $('#detail-close').click();await pause();testStore.navigationFailure=true;$('#records .record-detail').click();await pause();
    check(!$('#detail').hidden&&!$('#detail-navigation-status').hidden,'failed navigation keeps detail accessible and explains failure');
    testStore.navigationFailure=false;$('#detail-locate').click();await pause();
    check($('#detail-navigation-status').hidden,'detail locate button retries navigation successfully');
    finish();return;
  }
  if (TEST_CASE === 'popup-autosave') {
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const first=local();
    await chrome.storage.local.set({readerMarksV1:[first,{...first,id:'second',start:100,end:110,quote:'第二条记录',note:'第二条原笔记'}]});await pause();
    const messages=testStore.messages.length;$('#records .record-detail').click();await pause();
    check(!$('#detail').hidden && testStore.messages.slice(messages).some(message=>message.type==='LOCAL_MARKS_OPEN_RECORD'),'record content opens detail and jumps to the original text');
    check(!$('#detail-save') && !$('#detail-style').open,'detail has automatic saving and collapsed style controls');
    const note=$('#detail-note');note.value='快速连续编辑';note.dispatchEvent(new Event('input'));note.value='连续编辑最后内容';note.dispatchEvent(new Event('input'));await wait(420);
    check(local().note==='连续编辑最后内容','panel saves the final input without a manual save');
    note.dispatchEvent(new Event('compositionstart'));note.value='待确认中文';note.dispatchEvent(new Event('input'));await wait(420);
    check(local().note==='连续编辑最后内容','panel preserves IME composition until completion');note.dispatchEvent(new Event('compositionend'));await wait(420);
    check(local().note==='待确认中文','panel saves completed Chinese composition');
    note.value='';note.dispatchEvent(new Event('input'));await wait(420);check(local().note==='' && Boolean(local().highlightColor),'empty note autosave preserves annotation type');
    note.value='最后一笔';note.dispatchEvent(new Event('input'));$('#detail-close').click();await wait(80);
    check(local().note==='最后一笔' && $('#detail').hidden && !$('#list-view').hidden,'returning to list flushes pending note edits');
    $('#records .record-detail').click();await pause();
    $('#detail-style').open=true;$('#detail-style-editor .fine-adjust').open=true;
    const slider=$('#detail-thickness');slider.value='12';slider.dispatchEvent(new Event('input'));await wait(280);
    check(local().highlightThickness===12,'slider saves automatically even before release');
    slider.value='16';slider.dispatchEvent(new Event('input'));$('#detail-close').click();await wait(80);
    check(local().highlightThickness===16 && $('#detail').hidden,'leaving detail flushes the final slider value');
    $('#records .record-detail').click();await pause();$('#detail-mode').value='underline-solid';$('#detail-mode').dispatchEvent(new Event('change'));await pause();$('#detail-mode').value='highlight';$('#detail-mode').dispatchEvent(new Event('change'));await pause();check(local().highlightThickness===16,'switching types reuses the newly remembered style');$('#detail-close').click();await wait(50);
    $('#records .record-detail').click();await pause();testStore.failWrite=true;
    note.value='保存失败不能丢失';note.dispatchEvent(new Event('input'));await wait(420);
    check(local().note==='最后一笔' && note.value==='保存失败不能丢失' && !$('#detail-retry').hidden,'failed panel autosave retains input and offers retry');
    $('#detail-close').click();await wait(80);
    check($('#detail').hidden && local().note==='保存失败不能丢失','return retries and saves retained text before leaving');
    $('#records .record-detail').click();await pause();
    note.value='切换时保存';note.dispatchEvent(new Event('input'));
    window.dispatchEvent(new CustomEvent('marks-select',{detail:{item:saved().find(item=>item.id==='second'),tabId:1}}));await wait(100);
    check(local().note==='切换时保存' && note.value==='第二条原笔记','switching records cannot send a note to the wrong record');
    $('#detail-delete').click();await wait(80);
    check(!saved().some(item=>item.id==='second') && $('#detail').hidden,'detail delete directly removes the selected record');
    finish();return;
  }
  if (TEST_CASE === 'content-overlap') {
    await chrome.storage.local.set({readerMarksV1:[]}); await pause();
    const article=document.createElement('article');
    article.innerHTML='<p id="preface">'+ '前文'.repeat(40) +'</p><h2>从预训练到 RL：四阶段全景</h2><p id="body">引言给出了四个环节的地图。'+ '正文内容'.repeat(50) +'</p>';
    document.body.appendChild(article);
    const heading=article.querySelector('h2'), body=article.querySelector('#body');
    const selectText=async (element, start=0, end=element.textContent.length) => {
      const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT), nodes=[];let node;
      while ((node=walker.nextNode())) if(node.nodeValue) nodes.push(node);
      const range=document.createRange();range.setStart(nodes[0],start);range.setEnd(nodes[nodes.length-1],end);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));await pause();
    };
    await selectText(heading);$('#add-bookmark').click();await pause();
    const bookmark=saved().find(item=>item.isBookmark);
    check(Boolean(bookmark) && heading.querySelector('mark'),'heading bookmark saves and renders');
    await selectText(body);$('#add-mark').click();await pause();
    check(saved().length===2 && body.querySelector('mark'),'paragraph directly below a new heading bookmark can be annotated');
    await chrome.storage.local.set({readerMarksV1:[bookmark]});await pause();
    article.querySelector('#preface').textContent='';
    await chrome.storage.local.set({readerMarksV1:[bookmark]});await pause();
    check(Boolean(heading.querySelector('mark')),'heading bookmark relocates after preceding content changes');
    await selectText(body);$('[data-mark-mode="underline-wavy"]').click();await pause();
    check(saved().length===2 && Boolean(body.querySelector('mark')) && saved().some(item=>item.underlineStyle==='wavy' && item.underlineColor),'relocated heading bookmark does not falsely block paragraph wavy underline');
    await chrome.storage.local.set({readerMarksV1:[bookmark]});await pause();
    await selectText(body);$('#all-options').click();await pause();
    const slider=$('#settings input[type="range"]');slider.value='3';slider.dispatchEvent(new Event('input'));
    check(Boolean(body.querySelector('mark')) && saved().length===1,'live preview appears without persisting or conflicting with heading bookmark');
    slider.dispatchEvent(new Event('change'));await pause();
    check(saved().length===2 && Boolean(body.querySelector('mark')),'live style saving uses relocated ranges for overlap checks');
    await chrome.storage.local.set({readerMarksV1:[bookmark]});await pause();
    await selectText(heading);$('[data-mark-mode="highlight"]').click();await pause();
    check(saved().length===1 && saved()[0].id===bookmark.id && Boolean(saved()[0].highlightColor),'reselecting relocated heading updates the same record');
    check(saved()[0].start<bookmark.start,'editing a relocated record refreshes its saved offsets');
    await selectText(heading,2,heading.textContent.length-1);$('#add-mark').click();await pause();
    check(saved().length===1 && $('#toast').textContent.includes('重叠'),'true partial overlap remains blocked');
    finish();return;
  }
  if (TEST_CASE === 'content-saved') {
    $('#launcher').click(); $('#open-style-settings').click();
    check($('#panel-style-editor .presets .selected').textContent === '半幅', 'saved highlight preference survives a new page load');
    check(testStore.data.readerMarksStyleV3.highlight.color === '#f2bd55', 'saved highlight color survives reload');
    $('[data-panel-style="underline-solid"]').click();
    check($('#panel-style-editor .presets .selected').textContent === '粗', 'saved straight line preference survives reload');
    $('[data-panel-style="underline-wavy"]').click();
    check($('#panel-style-editor .presets .selected').textContent === '细', 'saved wavy line preference survives reload');
    check(testStore.data.readerMarksStyleV3['underline-wavy'].opacity === 35, 'saved wavy opacity survives reload');
    finish(); return;
  }
  if (TEST_CASE === 'content') {
    const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
    let mark = document.querySelector('mark[data-local-reader-mark="local"]');
    mark.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
    await wait(200);
    check(!$('#quick').classList.contains('open'), 'passing over annotation does not open actions');
    await wait(150);
    check(!$('#quick').classList.contains('open') && !$('#note-tooltip').classList.contains('visible'), 'text hover does not flash a note preview before editing');
    await wait(400);
    check($('#quick').classList.contains('open') && !$('#note-tooltip').classList.contains('visible'), '700ms shows editing alone');
    const oldTop = $('#quick').style.top;
    const piece = mark.cloneNode(true); document.body.appendChild(piece);
    mark.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:piece}));
    piece.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:mark})); await wait(350);
    check($('#quick').classList.contains('open') && $('#quick').style.top === oldTop, 'same annotation across DOM pieces keeps toolbar stable');
    piece.remove();
    const indicator=mark.querySelector('[data-local-note-indicator]');
    indicator.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:mark})); await wait(350);
    check($('#note-tooltip').classList.contains('visible') && !$('#quick').classList.contains('open') && $('.note-card-text').textContent==='保留笔记', 'note icon opens a separate readable card');
    document.dispatchEvent(new Event('scroll')); await pause();
    check(!$('#quick').classList.contains('open'), 'scroll dismisses floating tools');
    for (const [mode, thickness] of [['underline-solid',3],['underline-wavy',3],['highlight',30]]) {
      mark = document.querySelector('mark[data-local-reader-mark="local"]'); mark.click();
      $('#quick-edit').dispatchEvent(new MouseEvent('mouseenter'));
      $(`[data-quick-mode="${mode}"]`).click(); await pause();
      check(local()[mode==='highlight'?'highlightThickness':'underlineThickness']===thickness, `${mode} directly uses independent default`);
      check(local().note === '保留笔记', 'type change preserves note');
      check(testStore.data.readerMarksAnnotationModeV1===mode, 'quick edit remembers annotation type '+mode);
    }
    mark = document.querySelector('mark[data-local-reader-mark="local"]'); mark.click();
    const styleButton = all('#quick > button').find(el=>el.textContent==='样式');
    const before = styleButton.getBoundingClientRect(); styleButton.dispatchEvent(new MouseEvent('mouseenter'));
    const after = styleButton.getBoundingClientRect();
    check(before.x===after.x && before.y===after.y, 'hovering style never moves its trigger');
    $('#quick').dispatchEvent(new MouseEvent('mouseleave')); await wait(100);
    $('.quick-settings').dispatchEvent(new MouseEvent('mouseenter')); $('#quick').dispatchEvent(new MouseEvent('mouseenter')); await wait(200);
    check($('#quick').classList.contains('open') && !$('.quick-settings').classList.contains('hidden'), 'crossing into style editor keeps it open');
    $('#quick-delete').dispatchEvent(new MouseEvent('mouseenter')); await wait(400);
    check($('.quick-settings').classList.contains('hidden') && styleButton.getAttribute('aria-expanded')==='false', 'hovering delete dismisses styles and resets expanded state');
    $('#quick-edit').dispatchEvent(new MouseEvent('mouseenter'));
    check(!$('#quick-mode-menu').classList.contains('hidden') && $('.quick-settings').classList.contains('hidden'), 'edit type and style menus are mutually exclusive');
    $('#quick-note').dispatchEvent(new MouseEvent('mouseenter')); await wait(400);
    check($('#quick-mode-menu').classList.contains('hidden') && $('#quick-edit').getAttribute('aria-expanded')==='false', 'hovering note dismisses type choices');
    styleButton.dispatchEvent(new MouseEvent('mouseenter'));
    $('#quick-delete').dispatchEvent(new FocusEvent('focus'));
    check($('.quick-settings').classList.contains('hidden'), 'keyboard focus on delete dismisses style editor');
    styleButton.dispatchEvent(new MouseEvent('mouseenter'));
    styleButton.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,composed:true}));
    check($('.quick-settings').classList.contains('hidden') && $('#quick').classList.contains('open'), 'Escape closes submenu before parent toolbar');
    styleButton.dispatchEvent(new MouseEvent('mouseenter'));
    const range = $('.quick-settings input[type=range]'); range.value='15'; range.dispatchEvent(new Event('input'));
    check(local().highlightThickness===30, 'slider preview does not persist before release');
    range.dispatchEvent(new Event('change')); await pause();
    check(local().highlightThickness===15 && testStore.data.readerMarksStyleV3.highlight.thickness===15, 'slider release saves mark and type preference');
    $('#quick-note').click(); await pause();
    check(!$('.note-composer').classList.contains('hidden'), 'quick note opens inline composer');
    $('#note-composer-text').value='更新后的快捷笔记'; $('#note-composer-text').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await pause();
    check(local().note==='更新后的快捷笔记', 'quick note saves with Enter');
    mark = document.querySelector('mark[data-local-reader-mark="local"]'); mark.click();
    $('#quick-edit').dispatchEvent(new MouseEvent('mouseenter')); $('[data-quick-mode="bookmark"]').click(); await pause();
    mark = document.querySelector('mark[data-local-reader-mark="local"]'); mark.click();
    $('#quick').dispatchEvent(new MouseEvent('mouseleave')); $('#quick-note').click();
    document.dispatchEvent(new Event('scroll')); await wait(300);
    check($('#quick').classList.contains('open') && !$('.note-composer').classList.contains('hidden'), 'bookmark note composer survives hide timer and focus scroll');
    $('#note-composer-text').value='书签笔记'; $('#note-composer-text').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await pause();
    check(local().isBookmark && local().note==='书签笔记', 'bookmark note saves while retaining bookmark');
    $('#launcher').click(); await pause();
    check(testStore.messages.at(-1)?.type==='LOCAL_MARKS_SIDE_PANEL', 'edge entry opens native panel');
    const launcherTop = $('#launcher').getBoundingClientRect().top;
    $('#launcher').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:11,clientY:launcherTop+10,button:0}));
    $('#launcher').dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:11,clientY:launcherTop+110,button:0}));
    $('#launcher').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:11,clientY:launcherTop+110,button:0})); await pause();
    check(Math.abs($('#launcher').getBoundingClientRect().top-launcherTop)>20 && Number.isFinite(testStore.data.readerMarksEntryV1.position), 'entry can be dragged vertically and remembers position '+JSON.stringify({before:launcherTop,after:$('#launcher').getBoundingClientRect().top,position:testStore.data.readerMarksEntryV1.position,display:$('#launcher').style.display}));
    await chrome.storage.local.set({readerMarksEntryV1:{side:'left'}}); await pause();
    check($('#launcher').classList.contains('left'), 'entry position responds to saved preference');
    await chrome.storage.local.set({readerMarksEntryV1:{hidden:true}}); await pause();
    check($('#launcher').style.display==='none', 'entry can be hidden');
    await chrome.storage.local.set({readerMarksEntryV1:{side:'right'}}); await pause();
    testStore.runtimeListeners.forEach(fn=>fn({type:'LOCAL_MARKS_PANEL_VISIBILITY',open:true},{},()=>{}));
    check($('#launcher').style.display==='none', 'native sidebar hides webpage entry');
    testStore.runtimeListeners.forEach(fn=>fn({type:'LOCAL_MARKS_PANEL_VISIBILITY',open:false},{},()=>{}));
    check($('#launcher').style.display==='flex', 'closing native sidebar restores webpage entry');
    check(getComputedStyle($('#panel')).display==='none', 'old overlay never covers page');
    const textNode=document.createElement('p'); textNode.textContent='用于新建标注菜单回归的独立文字'; document.body.appendChild(textNode);
    const selection=window.getSelection(); const selectedRange=document.createRange(); selectedRange.selectNodeContents(textNode); selection.removeAllRanges();selection.addRange(selectedRange);
    textNode.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); await pause();
    check($('#toolbar').classList.contains('visible'),'new selection displays creation toolbar');
    const createBefore=$('#add-mark').getBoundingClientRect();
    $('#add-mark').dispatchEvent(new MouseEvent('mouseenter'));
    const createAfter=$('#add-mark').getBoundingClientRect();
    check(!$('#mark-submenu').classList.contains('hidden') && createBefore.x===createAfter.x && createBefore.y===createAfter.y,'new type menu opens without moving its primary button');
    $('#add-note').dispatchEvent(new MouseEvent('mouseenter')); await wait(400);
    check($('#mark-submenu').classList.contains('hidden') && $('#add-mark').getAttribute('aria-expanded')==='false','new note hover closes annotation submenu');
    $('#all-options').dispatchEvent(new MouseEvent('mouseenter'));
    check(!$('#settings').classList.contains('hidden'),'new style settings open on hover');
    $('#add-mark').dispatchEvent(new MouseEvent('mouseenter')); await wait(400);
    check($('#settings').classList.contains('hidden') && !$('#mark-submenu').classList.contains('hidden'),'new type choices replace style settings');
    $('#add-bookmark').dispatchEvent(new FocusEvent('focus'));
    check($('#settings').classList.contains('hidden') && $('#mark-submenu').classList.contains('hidden'),'new bookmark focus closes all secondary menus');
    const multiNode=document.createElement('div'); multiNode.innerHTML='<p>跨块文本第一行</p><p>跨块文本第二行</p>'; document.body.appendChild(multiNode);
    const multiRange=document.createRange(); multiRange.selectNodeContents(multiNode); selection.removeAllRanges(); selection.addRange(multiRange);
    await chrome.storage.local.set({readerMarksAnnotationModeV1:'underline-wavy'});await pause();
    multiNode.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); await pause(); $('#add-mark').click(); await pause();
    check(saved().find(item=>item.quote?.includes('跨块文本第一行'))?.underlineStyle==='wavy','new mark follows persisted type from another editor');
    await chrome.storage.local.set({readerMarksAnnotationModeV1:'highlight'});await pause();
    const multiRecord=saved().find(item=>item.quote?.includes('跨块文本第一行'));
    check(Boolean(multiRecord) && document.querySelector(`mark[data-local-reader-mark="${multiRecord.id}"]`), 'multi-block selection saves and renders a highlight');
    multiNode.remove();
    const resetRange=document.createRange(); resetRange.selectNodeContents(textNode); selection.removeAllRanges(); selection.addRange(resetRange);
    textNode.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); await pause();
    $('#add-note').click(); await pause();
    check(!$('#note-composer').classList.contains('hidden'), 'new note uses inline composer');
    $('#note-composer-text').value='仅笔记气泡';
    textNode.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); await pause();
    check(saved().some(item=>item.note==='仅笔记气泡' && !item.highlightColor && !item.underlineColor && !item.isBookmark), 'new note does not create a highlight or underline');
    await wait(800);
    const noteMark = [...document.querySelectorAll('mark[data-local-reader-mark]')].find(candidate => saved().find(item => item.id === candidate.dataset.localReaderMark)?.note === '仅笔记气泡');
    window.getSelection().removeAllRanges();
    noteMark.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); await wait(350);
    check($('#note-tooltip').classList.contains('visible'), 'pure note hover opens its bubble after delay');
    await wait(450);
    check($('#note-tooltip').classList.contains('visible') && !$('#quick').classList.contains('open'), 'pure note hover never opens edit menu');
    $('#note-tooltip').getAnimations().forEach(animation=>animation.finish());
    check(getComputedStyle($('#note-tooltip')).opacity==='1' && ['rgb(255, 253, 245)','rgb(43, 44, 40)'].includes(getComputedStyle($('#note-tooltip')).backgroundColor), 'note bubble uses opaque background and text');
    $('#all-options').dispatchEvent(new MouseEvent('mouseenter')); await wait(160);
    getComputedStyle($('#all-options')).backgroundColor;
    $('#all-options').getAnimations().forEach(animation=>animation.finish());
    const focused=getComputedStyle($('#all-options')).backgroundColor;
    check(!['rgba(0, 0, 0, 0)','rgb(241, 244, 245)'].includes(focused),'expanded primary action has a visible theme background');
    $('#all-options').dispatchEvent(new MouseEvent('mouseenter'));
    $('#toolbar').dispatchEvent(new MouseEvent('mouseleave')); await wait(700);
    check($('#settings').classList.contains('hidden') && $('#all-options').getAttribute('aria-expanded')==='false','leaving new toolbar closes settings and resets trigger');
    const scroller=document.createElement('div'); scroller.style.cssText='position:fixed;top:0;left:0;width:300px;height:100vh;overflow-y:auto;overflow-anchor:none';
    scroller.innerHTML='<div style="height:900px"></div><p>定位高度回归文本</p><div style="height:1500px"></div>'; document.body.appendChild(scroller);
    await chrome.storage.local.set({readerMarksV1:[...saved(),{id:'jump-height',kind:'selection',url:location.href,quote:'定位高度回归文本',viewportRatio:.25,highlightColor:'#ef6a5b',highlightThickness:30}]}); await pause();
    testStore.runtimeListeners.forEach(fn=>fn({type:'LOCAL_MARKS_JUMP',id:'jump-height'},{},()=>{}));
    const jumpTop=()=>document.querySelector('mark[data-local-reader-mark="jump-height"]').getBoundingClientRect().top;
    check(Math.abs(jumpTop()-innerHeight*.25)<2, 'jump restores saved height inside nested page scroller');
    scroller.firstElementChild.style.height='1200px'; window.dispatchEvent(new Event('resize')); await wait(220);
    check(Math.abs(jumpTop()-innerHeight*.25)<2, 'page reflow after sidebar resize keeps current mark aligned');
    scroller.firstElementChild.style.height='800px'; testStore.runtimeListeners.forEach(fn=>fn({type:'LOCAL_MARKS_PANEL_VISIBILITY',open:false},{},()=>{})); await wait(220);
    check(Math.abs(jumpTop()-innerHeight*.25)<2, 'closing sidebar keeps latest mark at saved height');
    scroller.dispatchEvent(new WheelEvent('wheel',{bubbles:true})); scroller.scrollTop=0; window.dispatchEvent(new Event('resize')); await wait(220);
    check(scroller.scrollTop===0, 'manual scrolling releases jump alignment');
    scroller.style.width='70vw';scroller.scrollTop=800-innerHeight*.35;await pause();
    const readingTop=scroller.querySelector('p').getBoundingClientRect().top;
    $('#launcher').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,pointerId:99}));
    $('#launcher').click();await pause();
    scroller.firstElementChild.style.height='1100px';window.dispatchEvent(new Event('resize'));await wait(220);
    check(Math.abs(scroller.querySelector('p').getBoundingClientRect().top-readingTop)<2,'opening list preserves current reading position during sidebar reflow');
    scroller.dispatchEvent(new WheelEvent('wheel',{bubbles:true}));scroller.scrollTop=0;window.dispatchEvent(new Event('resize'));await wait(220);
    check(scroller.scrollTop===0,'manual scrolling releases temporary reading preservation');
    finish(); return;
  }
  if (TEST_CASE.startsWith('popup')) {
    check(all('#records .record').length===1, 'side panel starts with current page only');
    $('#collapse-panel').click(); await pause();
    check(testStore.closedWindow===1, 'outward arrow closes sidebar in its own window');
    window.dispatchEvent(new CustomEvent('marks-select',{detail:{item:local(),tabId:1}})); await pause();
    check(!$('#detail').hidden && $('#detail-note').value==='保留笔记' && $('#list-view').hidden && !$('#detail-save'), 'detail replaces list and has no manual save button');
    $('#detail-mode').value='underline-solid'; $('#detail-mode').dispatchEvent(new Event('change')); await pause();
    check(local().underlineThickness===3 && local().note==='保留笔记', 'panel mode change uses medium and preserves note');
    check(testStore.data.readerMarksAnnotationModeV1==='underline-solid','detail change remembers annotation type');
    $('#detail-thickness').value='5'; $('#detail-thickness').dispatchEvent(new Event('input')); $('#detail-thickness').dispatchEvent(new Event('change')); await pause();
    check(local().underlineThickness===5 && testStore.data.readerMarksStyleV3['underline-solid'].thickness===5, 'panel persists independent thickness');
    $('#detail-note').value='侧栏编辑后的笔记'; $('#detail-note').dispatchEvent(new Event('input')); await new Promise(resolve=>setTimeout(resolve,450));
    check(local().note==='侧栏编辑后的笔记', 'panel note automatically saves without a button');
    $('#detail-close').click(); await pause(); check($('#detail').hidden, 'detail closes without covering page');
    const initial = structuredClone(local());
    const draftItem = {...initial,id:'draft',start:100,end:120,quote:'新笔记测试',note:''};
    // The context callback receives drafts from the page via session storage.
    testStore.listeners.forEach(fn=>fn({readerMarksPanelContext:{newValue:{draft:draftItem,tabId:1,windowId:1}}},'session'));
    await pause();
    check(!saved().some(item=>item.id==='draft'), 'opening draft does not create a mark');
    $('#detail-note').value='新建笔记'; $('#detail-note').dispatchEvent(new Event('input')); await new Promise(resolve=>setTimeout(resolve,450));
    check(saved().find(item=>item.id==='draft')?.note==='新建笔记', 'new note selection automatically saves from side panel');
    await chrome.storage.local.set({readerMarksV1:saved().filter(item=>item.id!=='draft')}); await pause();
    check($('#detail').hidden, 'deleting selected mark closes detail');
    document.body.style.width='320px';
    check(document.body.scrollWidth<=320, 'sidebar at 320px has no horizontal overflow');
    document.body.style.width='';
    if (TEST_CASE === 'popup-dark') check(matchMedia('(prefers-color-scheme:dark)').matches && getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()==='#191e23', 'dark sidebar follows system theme');
    $('#scope-all').click(); await pause();
  }
  const list = TEST_CASE === 'content' ? '#list' : '#records';
  check(all(`${list} .badge`).some(el => el.textContent === '标注') && !all(`${list} .badge`).some(el => ['重点','下划线','波浪线'].includes(el.textContent)), 'annotation badges use one label');
  $('[data-filter="mark"]').click(); await pause();
  check(all(`${list} .record, ${list} .item`).length === 5, 'annotation filter includes highlight and both line types');
  $('[data-filter="all"]').click(); await pause();
  check(all(`${list} .record-group`).length === 5, 'records grouped by page URL, fragments merge, queries stay separate');
  if (TEST_CASE !== 'content') {
    check(all(`${list} details`).every(el=>!el.open), 'all-page groups start collapsed');
    $('#expand-all').click(); await pause();
    check(all(`${list} details`).every(el=>el.open), 'expand all opens every visible group');
    const individual=$(`${list} details`); individual.open=false; await pause();
    $('[data-filter="all"]').click(); await pause();
    check(!$(`${list} details`).open && all(`${list} details`).slice(1).every(el=>el.open), 'individual state survives list refresh');
    $('#collapse-all').click(); await pause();
    check(all(`${list} details`).every(el=>!el.open), 'collapse all closes every visible group');
    const before=structuredClone(saved());
    await chrome.storage.local.set({readerMarksV1:[...before,{id:'group-new',kind:'page',url:'https://new-group.example/',title:'新分组'}]}); await pause();
    check(all(`${list} details`).every(el=>!el.open), 'new groups default collapsed after data update');
    await chrome.storage.local.set({readerMarksV1:before}); await pause();
  }
  const grouping = $('#grouping');
  grouping.value = 'site'; grouping.dispatchEvent(new Event('change')); await pause();
  check(all(`${list} .record-group`).length === 3, 'website grouping combines pages of the same origin');
  check(testStore.data.readerMarksGroupingV1 === 'site', 'grouping preference saved');
  const firstGroup = $(`${list} details`); firstGroup.open = false; await pause();
  $('#search').value = '远端内容'; $('#search').dispatchEvent(new Event('input')); await pause();
  check(all(`${list} .record-group`).length === 1 && $(`${list} details`).open, 'search finds matching records and expands their group');
  if (TEST_CASE !== 'content') {
    $('#collapse-all').click(); await pause();
    check(!$(`${list} details`).open, 'search results support collapse all');
    $('[data-filter="all"]').click(); await pause();
    check(!$(`${list} details`).open, 'search collapse choice survives refresh');
    $('#expand-all').click(); await pause();
    check($(`${list} details`).open, 'search results support expand all');
  }
  $('#search').value = ''; $('#search').dispatchEvent(new Event('input')); await pause();
  check(!$(`${list} details`).open, 'clearing search restores collapsed group');
  grouping.value = 'none'; grouping.dispatchEvent(new Event('change')); await pause();
  check(all(`${list} .record-group`).length === 0 && all(`${list} > li`).length === 6, 'chronological view shows every record without groups');
  if (TEST_CASE !== 'content') check($('#group-actions').hidden, 'ungrouped view hides expansion controls');
  if (TEST_CASE === 'content') {
    const remoteButton = all('#list .jump').find(el => el.textContent.includes('远端内容一'));
    remoteButton.click(); await pause();
    check(testStore.messages.at(-1)?.record.id === 'remote1', 'remote record opens its own webpage');
    document.querySelector('mark[data-local-reader-mark="local"]').click(); $('#quick-edit').click();
    check($('#edit-overlay').classList.contains('open'), 'direct edit button still opens detailed editor');
    const originalRecords = structuredClone(saved());
    await chrome.storage.local.set({readerMarksV1:[]}); await pause();
    check(!$('#edit-overlay').classList.contains('open'), 'external clear closes stale editor');
    await chrome.storage.local.set({readerMarksV1:originalRecords}); await pause();
    $('#open-style-settings').click();
  } else $('#backup-panel').open = true;
  $('#clear-all').click(); await pause();
  check($('#clear-description').textContent.includes('6 条'), 'clear confirmation names the record count');
  $('#clear-cancel').click(); await pause();
  check(saved().length === 6, 'cancel clear keeps all records');
  $('#clear-all').click(); await pause();
  testStore.failWrite = true; $('#clear-confirm').click(); await pause();
  check(saved().length === 6, 'failed storage write keeps records');
  $('#clear-cancel').click();
  $('#clear-all').click(); await pause();
  const late = {id:'late', kind:'page', url:'https://new.example/', title:'确认后新加入'};
  await chrome.storage.local.set({readerMarksV1:[...saved(),late]});
  $('#clear-confirm').click(); await pause();
  check(saved().length === 1 && saved()[0].id === 'late', 'clear preserves records added after confirmation opened');
  $('#clear-all').click(); await pause(); $('#clear-confirm').click(); await pause();
  check(saved().length === 0, 'confirmed clear removes all remaining records');
  check($('#clear-all').disabled, 'empty state disables clear');
  check(testStore.data.readerMarksGroupingV1 === 'none', 'clear preserves preferences');
  if (TEST_CASE === 'content') check(!document.querySelector('mark[data-local-reader-mark]'), 'cleared marks disappear from the page');
  finish();
})().catch(error => { const result=document.createElement('pre');result.id='qa-results';result.textContent=JSON.stringify({case:TEST_CASE,error:String(error),stack:error.stack});document.body.appendChild(result); });
'''


def run(case):
    with tempfile.TemporaryDirectory(prefix="local-marks-browser-") as directory:
        directory = pathlib.Path(directory)
        script = lambda name: f'<script src="{(ROOT / name).as_uri()}"></script>'
        if case.startswith("content"):
            source = '<!doctype html><meta charset="utf-8"><title>本地标记测试</title><p>这是本页用于验证的高亮文本</p>'
            extra = "testStore.data.readerMarksStyleV3={bookmark:{color:'#ef6a5b',thickness:4,opacity:100},highlight:{color:'#f2bd55',thickness:15,opacity:65},'underline-solid':{color:'#65b883',thickness:6,opacity:80},'underline-wavy':{color:'#a78bfa',thickness:1,opacity:35}};" if case == 'content-saved' else ''
            source += '<script>' + MOCK + extra + '</script>' + script('mark-styles.js') + script('ui.js') + script('backup.js') + script('record-store.js') + script('store-client.js') + script('record-groups.js') + script('content.js')
        else:
            source = (ROOT / 'popup.html').read_text()
            source = source.replace('<head>', f'<head><base href="{ROOT.as_uri()}/">')
            source = source.replace('<script src="backup.js">', '<script>' + MOCK + ('chrome.sidePanel=undefined;' if case=='popup-compat' else '') + '</script><script src="record-store.js"></script><script src="backup.js">')
        source += '<script>const TEST_CASE = ' + json.dumps(case) + ';' + CHECKS + '</script>'
        fixture = directory / 'fixture.html'
        fixture.write_text(source)
        process = subprocess.Popen([
            CHROME, *(['--window-size=1200,900'] if case == 'content-hover-transit' else []), *(['--force-dark-mode'] if case == 'popup-dark' else []), '--headless=new', '--no-first-run', '--no-default-browser-check',
            '--disable-background-networking', '--disable-extensions', '--allow-file-access-from-files',
            f'--user-data-dir={directory / "profile"}', '--virtual-time-budget=14000',
            '--dump-dom', fixture.as_uri()+('?compat=1&sourceWindowId=3' if case=='popup-compat' else '')
        ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
        output = b''
        deadline = time.monotonic() + 25
        match = None
        try:
            while time.monotonic() < deadline:
                if select.select([process.stdout], [], [], 0.2)[0]:
                    chunk = os.read(process.stdout.fileno(), 65536)
                    if not chunk:
                        break
                    output += chunk
                    match = re.search(r'<pre id="qa-results">(.*?)</pre>', output.decode(errors='replace'), re.S)
                    if match:
                        break
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
        if not match:
            raise RuntimeError(f'{case}: Chrome produced no test result (exit={process.returncode})')
        result = json.loads(html.unescape(match.group(1)))
        print(json.dumps(result, ensure_ascii=False))
        if result.get('error'):
            raise AssertionError(result['error'])


if __name__ == '__main__':
    run('popup-compat')
    run('content-note-delete')
    run('content-release')
    run('popup-release')
    run('content-hover-transit')
    run('content-autosave')
    run('popup-autosave')
    run('popup-list')
    run('content-overlap')
    run('content')
    # Content persistence is covered by shared style unit tests.
    run('popup')
    run('popup-dark')
