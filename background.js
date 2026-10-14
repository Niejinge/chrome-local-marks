importScripts("mark-styles.js", "backup.js", "record-store.js");
const recordStore = LocalMarksStore.create(chrome.storage.local);
const STORAGE_KEY = "readerMarksV1";

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch (_) {
    return value || "";
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTab(tabId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || tab.status === "complete") return;
    await wait(200);
  }
}

async function sendJump(tabId, id) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "LOCAL_MARKS_JUMP",
        id
      });
      if (response && response.ok) return true;
    } catch (_) {
      // The content script may still be starting after navigation.
    }
    await wait(250);
  }
  return false;
}

async function openRecord(record, sourceWindowId = null) {
  if (!record || !record.url) return { ok: false };
  const targetUrl = normalizeUrl(record.url);
  const tabs = await chrome.tabs.query({});
  let tab = tabs.find((candidate) => normalizeUrl(candidate.url) === targetUrl);
  if (tab) {
    tab = await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    tab = await chrome.tabs.create({ url: record.url, active: true, ...(Number.isSafeInteger(sourceWindowId) && sourceWindowId>0 ? {windowId:sourceWindowId} : {}) });
  }
  await waitForTab(tab.id);
  if (record.kind === "selection") {
    const jumped = await sendJump(tab.id, record.id);
    return { ok: true, jumped, tabId: tab.id };
  }
  return { ok: true, jumped: false, tabId: tab.id };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "LOCAL_MARKS_OPEN_RECORD") {
    (async()=>{try{sendResponse(await openRecord(message.record,message.sourceWindowId))}catch(error){sendResponse({ok:false,error:error.message})}})();
    return true;
  }
  if (message && message.type === "LOCAL_MARKS_EXPORT") {
    chrome.storage.local.get(STORAGE_KEY).then((result) => {
      sendResponse({ ok: true, records: result[STORAGE_KEY] || [] });
    });
    return true;
  }
  return false;
});

let contextQueue=Promise.resolve();
function writePanelContext(context){
  const job=contextQueue.catch(()=>{}).then(async()=>{const data=await chrome.storage.session.get('readerMarksPanelContextsV1');const contexts={...data.readerMarksPanelContextsV1,[context.windowId]:context};await chrome.storage.session.set({readerMarksPanelContext:context,readerMarksPanelContextsV1:contexts});});contextQueue=job;return job;
}
const nativePanel = Boolean(chrome.sidePanel?.open && chrome.sidePanel?.onClosed &&
  (chrome.runtime.getManifest?.().permissions.includes('sidePanel') ?? true));
if (nativePanel) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

let compatWindowQueue = Promise.resolve();
function openCompatWindow(context) {
  const job = compatWindowQueue.catch(() => {}).then(async () => {
    await writePanelContext(context);
    const data = await chrome.storage.session.get('readerMarksCompatWindowsV1');
    const windows = {...data.readerMarksCompatWindowsV1};
    const previous = windows[context.windowId];
    if (previous && await chrome.windows.get(previous).catch(() => null)) {
      await chrome.windows.update(previous,{focused:true});
      return previous;
    }
    const source = await chrome.windows.get(context.windowId);
    const width = 440, height = Math.max(480,Math.min(820,(source.height || 900)-80));
    const options = {
      url:chrome.runtime.getURL(`popup.html?compat=1&sourceWindowId=${context.windowId}`),
      type:'popup',width,height,
      left:Math.round((source.left || 0)+(source.width || 1200)-width),
      top:Math.round((source.top || 0)+60),focused:true
    };
    let panel;
    try { panel = await chrome.windows.create(options); }
    catch(error) {
      if(!/bounds|screen space/i.test(error.message || ''))throw error;
      // Let the browser place it when saved/source bounds are off-screen.
      panel = await chrome.windows.create({url:options.url,type:'popup',width,height:600,focused:true});
    }
    windows[context.windowId] = panel.id;
    try { await chrome.storage.session.set({readerMarksCompatWindowsV1:windows}); }
    catch(error) { await chrome.windows.remove(panel.id).catch(()=>{});throw error; }
    return panel.id;
  });
  compatWindowQueue = job;
  return job;
}
if (!nativePanel) chrome.action.onClicked.addListener(tab => {
  if (!tab?.windowId) return;
  openCompatWindow({id:null,tabId:tab.id,windowId:tab.windowId,nonce:Date.now()}).catch(console.error);
});
chrome.windows?.onRemoved?.addListener(windowId => {
  const job = compatWindowQueue.catch(() => {}).then(async () => {
    const data=await chrome.storage.session.get('readerMarksCompatWindowsV1');
    const windows={...data.readerMarksCompatWindowsV1};
    for(const [source,panel] of Object.entries(windows)) {
      if(panel===windowId)delete windows[source];
      else if(Number(source)===windowId){delete windows[source];await chrome.windows.remove(panel).catch(()=>{});}
    }
    await chrome.storage.session.set({readerMarksCompatWindowsV1:windows});
  });
  compatWindowQueue=job;
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "LOCAL_MARKS_SIDE_PANEL" || !sender.tab) return false;
  // Call open before awaiting storage to preserve the user's click gesture.
  const context = { id: message.id || null, draft: message.draft || null, tabId: sender.tab.id, windowId: sender.tab.windowId, nonce: Date.now() };
  const opening = nativePanel ? chrome.sidePanel.open({ windowId: sender.tab.windowId }) : openCompatWindow(context);
  Promise.all([opening, nativePanel ? writePanelContext(context) : Promise.resolve()])
    .then(() => reply({ ok: true })).catch(error => reply({ ok: false, error: error.message }));
  return true;
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "LOCAL_MARKS_SELECT" && sender.tab) {
    writePanelContext({id:message.id,tabId:sender.tab.id,windowId:sender.tab.windowId,nonce:Date.now()}).catch(console.error);
  }
});

// Scope visibility to the browser window; closing through Chrome also restores the entry.
let visibilityQueue = Promise.resolve();
function setPanelVisibility(windowId, open) {
  visibilityQueue = visibilityQueue.catch(() => {}).then(async () => {
    const data = await chrome.storage.session.get('readerMarksPanelWindows');
    const windows = {...data.readerMarksPanelWindows, [windowId]:open};
    await chrome.storage.session.set({readerMarksPanelWindows:windows});
    const tabs = await chrome.tabs.query({windowId});
    await Promise.allSettled(tabs.map(tab=>chrome.tabs.sendMessage(tab.id,{type:'LOCAL_MARKS_PANEL_VISIBILITY',open})));
  });
  return visibilityQueue;
}
chrome.sidePanel?.onOpened?.addListener(info=>setPanelVisibility(info.windowId,true));
chrome.sidePanel?.onClosed?.addListener(info=>setPanelVisibility(info.windowId,false));
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if (message?.type==='LOCAL_MARKS_PANEL_STATE' && sender.tab) {
    chrome.storage.session.get('readerMarksPanelWindows').then(data=>reply({open:Boolean(data.readerMarksPanelWindows?.[sender.tab.windowId])}));
    return true;
  }
  if (message?.type==='LOCAL_MARKS_PANEL_READY' && !sender.tab) {
    if(nativePanel)setPanelVisibility(message.windowId,true);
  }
  return false;
});

// Final edits and all normal writes use the same queue, including after worker restart.
chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
  if(!['LOCAL_MARKS_MUTATE','LOCAL_MARKS_FINAL_SAVE'].includes(message?.type))return false;
  const command=message.type==='LOCAL_MARKS_MUTATE'?message.command:{op:'upsert',record:message.record,allowCreate:message.allowCreate,patch:{...(message.stylePatch||{}),...(typeof message.note==='string'?{note:message.note}:{})},styleMode:message.styleMode,styleConfig:message.styleConfig};
  (async()=>{try{reply({ok:true,result:await recordStore.mutate(command)})}catch(error){reply({ok:false,error:error.message})}})();
  return true;
});
