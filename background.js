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

async function openRecord(record) {
  if (!record || !record.url) return { ok: false };
  const targetUrl = normalizeUrl(record.url);
  const tabs = await chrome.tabs.query({});
  let tab = tabs.find((candidate) => normalizeUrl(candidate.url) === targetUrl);
  if (tab) {
    tab = await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    tab = await chrome.tabs.create({ url: record.url, active: true });
  }
  await waitForTab(tab.id);
  if (record.kind === "selection") {
    const jumped = await sendJump(tab.id, record.id);
    return { ok: true, jumped };
  }
  return { ok: true, jumped: false };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "LOCAL_MARKS_OPEN_RECORD") {
    openRecord(message.record).then(sendResponse);
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
