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
vm.runInNewContext(fs.readFileSync('background.js','utf8'),{chrome,URL,setTimeout,console});
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
