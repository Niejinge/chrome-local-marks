import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const sessionData={}, calls=[], windows=new Map([[3,{id:3,left:10,top:20,width:1200,height:900}],[4,{id:4,left:0,top:0,width:900,height:700}]]);
let listeners=[], action, removed, nextId=100, failCreate=false, failBounds=false;
const chrome={
 runtime:{getManifest:()=>({permissions:['storage']}),getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>listeners.push(fn)}},
 action:{onClicked:{addListener:fn=>action=fn}},
 storage:{local:{get:async()=>({}),set:async()=>{}},session:{get:async()=>structuredClone(sessionData),set:async value=>{Object.assign(sessionData,structuredClone(value));calls.push(['context',value])}}},
 windows:{onRemoved:{addListener:fn=>removed=fn},get:async id=>{if(!windows.has(id))throw Error('No window');return windows.get(id)},update:async(id,value)=>{if(!windows.has(id))throw Error('No window');calls.push(['focus',id]);return {...windows.get(id),...value}},create:async value=>{if(failBounds){failBounds=false;throw Error('Invalid value for bounds')}if(failCreate){failCreate=false;throw Error('Create failed')}const result={id:nextId++,...value};windows.set(result.id,result);calls.push(['create',result]);return result},remove:async id=>{windows.delete(id);removed(id)}},
 tabs:{query:async()=>[],create:async value=>{calls.push(['tab',value]);return {id:30,windowId:value.windowId,status:'complete'}},get:async id=>({id,status:'complete'}),sendMessage:async()=>({ok:true})}
};
function boot(){listeners=[];const context=vm.createContext({chrome,URL,setTimeout,console,TextEncoder,structuredClone,crypto:globalThis.crypto});context.importScripts=(...names)=>names.forEach(name=>vm.runInContext(fs.readFileSync(name,'utf8'),context));vm.runInContext(fs.readFileSync('background.js','utf8'),context);}
const pause=()=>new Promise(r=>setTimeout(r,15));
const request=(message,windowId=3)=>new Promise(resolve=>{for(const listener of listeners)if(listener(message,{tab:{id:windowId*10,windowId}},resolve)===true)break});
boot();assert.equal(typeof action,'function');
const first=await request({type:'LOCAL_MARKS_SIDE_PANEL',id:'a'});assert.equal(first.ok,true);
assert.equal(calls.filter(x=>x[0]==='create').length,1);
const window=calls.find(x=>x[0]==='create')[1];assert.match(window.url,/compat=1&sourceWindowId=3/);assert.equal(window.type,'popup');assert.equal(window.width,440);
assert(calls.findIndex(x=>x[0]==='context')<calls.findIndex(x=>x[0]==='create'));
assert.equal(sessionData.readerMarksPanelContextsV1[3].tabId,30);
await Promise.all([request({type:'LOCAL_MARKS_SIDE_PANEL',id:'b'}),request({type:'LOCAL_MARKS_SIDE_PANEL',id:'c'})]);
assert.equal(calls.filter(x=>x[0]==='create').length,1);assert.equal(sessionData.readerMarksPanelContextsV1[3].id,'c');
boot();await request({type:'LOCAL_MARKS_SIDE_PANEL',id:'restart'});assert.equal(calls.filter(x=>x[0]==='create').length,1);
await request({type:'LOCAL_MARKS_SIDE_PANEL',draft:{id:'draft',note:'新笔记'}},4);assert.equal(calls.filter(x=>x[0]==='create').length,2);assert.equal(sessionData.readerMarksPanelContextsV1[4].draft.id,'draft');
const firstId=sessionData.readerMarksCompatWindowsV1[3];await chrome.windows.remove(firstId);await pause();assert(!sessionData.readerMarksCompatWindowsV1[3]);
await request({type:'LOCAL_MARKS_SIDE_PANEL'});assert.equal(calls.filter(x=>x[0]==='create').length,3);
await action({id:30,windowId:3});await pause();assert.equal(sessionData.readerMarksPanelContextsV1[3].id,null);assert.equal(calls.filter(x=>x[0]==='create').length,3);
const visibility=await request({type:'LOCAL_MARKS_PANEL_STATE'});assert.equal(visibility.open,false);
await chrome.windows.remove(4);await pause();assert(!sessionData.readerMarksCompatWindowsV1[4]);
await chrome.windows.remove(sessionData.readerMarksCompatWindowsV1[3]);await pause();failCreate=true;
assert.equal((await request({type:'LOCAL_MARKS_SIDE_PANEL'})).ok,false);assert.equal((await request({type:'LOCAL_MARKS_SIDE_PANEL'})).ok,true);
await chrome.windows.remove(sessionData.readerMarksCompatWindowsV1[3]);await pause();failBounds=true;
assert.equal((await request({type:'LOCAL_MARKS_SIDE_PANEL'})).ok,true);assert.equal(calls.findLast(x=>x[0]==='create')[1].left,undefined);
await request({type:'LOCAL_MARKS_OPEN_RECORD',sourceWindowId:3,record:{kind:'page',url:'https://example.test/a'}});
assert.equal(calls.findLast(x=>x[0]==='tab')[1].windowId,3);
console.log('Compatibility window checks passed: missing sidePanel, scoped context, reuse, concurrent opens, worker restart, multi-window, close/reopen, toolbar, source close, failure retry and navigation destination.');
