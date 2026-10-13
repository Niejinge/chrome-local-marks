import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const listeners = [], calls = [];
const sessionData = {}, events = {};
const chrome = {
  runtime:{onMessage:{addListener: fn => listeners.push(fn)}},
  sidePanel:{onOpened:{addListener:fn=>events.open=fn},onClosed:{addListener:fn=>events.close=fn},setPanelBehavior:async v=>calls.push(['behavior',v]),open:async v=>calls.push(['open',v])},
  storage:{session:{get:async()=>sessionData,set:async v=>{Object.assign(sessionData,v);calls.push(['context',v]);}},local:{get:async()=>({})}},
  tabs:{query:async options=>[{id:options.windowId*10}],sendMessage:async(id,message)=>calls.push(['visibility',id,message])}
};
const context=vm.createContext({chrome,URL,setTimeout,console,TextEncoder,structuredClone,crypto:globalThis.crypto});
context.importScripts=(...names)=>names.forEach(name=>vm.runInContext(fs.readFileSync(name,'utf8'),context));
vm.runInContext(fs.readFileSync('background.js','utf8'),context);
const open = listeners.find(fn=>fn({type:'probe'}, {},()=>{})===false && fn.toString().includes('LOCAL_MARKS_SIDE_PANEL'));
let response;
open({type:'LOCAL_MARKS_SIDE_PANEL',id:'mark-1'},{tab:{id:7,windowId:3}},v=>response=v);
await new Promise(r=>setTimeout(r,0));
assert.equal(calls[1][0],'open');
assert.equal(calls[2][0],'context');
assert.equal(calls[2][1].readerMarksPanelContext.tabId,7);
assert.equal(response.ok,true);
const count=calls.filter(c=>c[0]==='open').length;
listeners.forEach(fn=>fn({type:'LOCAL_MARKS_SELECT',id:'mark-2'},{tab:{id:7,windowId:3}},()=>{}));
await new Promise(r=>setTimeout(r,0));
assert.equal(calls.filter(c=>c[0]==='open').length,count);
assert.equal(calls.at(-1)[1].readerMarksPanelContext.id,'mark-2');
chrome.sidePanel.open=async()=>{throw Error('gesture unavailable')};
open({type:'LOCAL_MARKS_SIDE_PANEL'},{tab:{id:7,windowId:3}},v=>response=v);
await new Promise(r=>setTimeout(r,0));
assert.equal(response.ok,false);
console.log('Side panel background checks passed: gesture order, context, selection without opening, failure response.');

events.open({windowId:3}); await new Promise(r=>setTimeout(r,0));
assert.equal(sessionData.readerMarksPanelWindows[3],true);
assert.deepEqual(calls.at(-1).slice(0,2),['visibility',30]);
events.open({windowId:4}); await new Promise(r=>setTimeout(r,0));
events.close({windowId:3}); await new Promise(r=>setTimeout(r,0));
assert.equal(sessionData.readerMarksPanelWindows[3],false);
assert.equal(sessionData.readerMarksPanelWindows[4],true);
assert.equal(calls.at(-1)[2].open,false);
console.log('Panel visibility checks passed: native open/close, entry restore, independent browser windows.');

const data={readerMarksV1:[{id:'final',kind:'selection',url:'https://example.test',quote:'原文',start:0,end:2,highlightColor:'#ef6a5b',note:'旧笔记'}]};
chrome.storage.local.get=async()=>structuredClone(data);
chrome.storage.local.set=async next=>Object.assign(data,structuredClone(next));
const final=message=>new Promise(resolve=>listeners.forEach(fn=>fn({type:'LOCAL_MARKS_FINAL_SAVE',...message},{},resolve)));
assert.equal((await final({record:{id:'final',url:'https://example.test'},note:'关闭前的最后文字'})).ok,true);
assert.equal(data.readerMarksV1[0].note,'关闭前的最后文字');
assert.equal(data.readerMarksV1[0].highlightColor,'#ef6a5b');
await final({record:{id:'final',url:'https://example.test'},note:''});
assert.equal(data.readerMarksV1[0].note,'');
assert.equal(data.readerMarksV1.length,1);
data.readerMarksV1=[];
assert.equal((await final({record:{id:'final',url:'https://example.test'},note:'不得恢复已删除的记录',allowCreate:false})).ok,false);
assert.equal(data.readerMarksV1.length,0);
await final({record:{id:'new',kind:'selection',quote:'新原文',start:0,end:3,url:'https://example.test'},allowCreate:true,note:'新笔记'});
assert.equal(data.readerMarksV1[0].note,'新笔记');
console.log('Final save checks passed: last edit, empty note, style preservation, deleted-record guard, new note.');

await final({record:data.readerMarksV1[0],stylePatch:{highlightColor:'#123456'},styleMode:'highlight',styleConfig:{color:'#123456',opacity:60}});
assert.equal(data.readerMarksV1[0].highlightColor,'#123456');
assert.equal(data.readerMarksStyleV3.highlight.color,'#123456');
console.log('Final style checks passed: appearance and remembered preference.');

await final({record:data.readerMarksV1[0],stylePatch:{highlightColor:null,underlineColor:'#654321',underlineStyle:'wavy'},styleMode:'underline-wavy',styleConfig:{color:'#654321',thickness:3,opacity:80}});
assert.equal(data.readerMarksStyleV3['underline-wavy'].color,'#654321');
assert.equal(data.readerMarksStyleV3.highlight.color,'#123456');
