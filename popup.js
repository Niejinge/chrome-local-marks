const STORAGE_KEY = "readerMarksV1";
const STYLE_KEY = "readerMarksStyleV3";
const PREVIOUS_STYLE_KEY = "readerMarksStyleV2";
const LEGACY_STYLE_KEY = "readerMarksStyleV1";
const GROUPING_KEY = "readerMarksGroupingV1";
const search = document.getElementById("search");
const recordsList = document.getElementById("records");
const summary = document.getElementById("summary");
const filters = document.getElementById("filters");
const pageButton = document.getElementById("page-bookmark");
const importFile = document.getElementById("import-file");
const importStyles = document.getElementById("import-styles");
const backupStatus = document.getElementById("backup-status");
let records = [];
let activeTab = null;
let activeFilter = "all";
let currentPageOnly = !new URLSearchParams(location.search).has("library");
const grouping = document.getElementById("grouping");
const collapsedGroups = new Set();
const clearConfirmation = document.getElementById("clear-confirmation");
let clearSnapshot = [];

function setBackupStatus(message, isError = false) {
  backupStatus.textContent = message;
  backupStatus.classList.toggle("error", isError);
}

document.getElementById("export-data").addEventListener("click", async () => {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY, STYLE_KEY, PREVIOUS_STYLE_KEY, LEGACY_STYLE_KEY]);
    const exportedStyles = data[STYLE_KEY]
      ? LocalMarksStyles.normalize(data[STYLE_KEY])
      : data[PREVIOUS_STYLE_KEY] || data[LEGACY_STYLE_KEY]
        ? LocalMarksStyles.migrate(data[PREVIOUS_STYLE_KEY], data[LEGACY_STYLE_KEY])
        : null;
    const contents = LocalMarksBackup.create(data[STORAGE_KEY] || [], exportedStyles);
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `local-reader-marks-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setBackupStatus("备份已下载。文件含私人笔记，请勿公开分享。");
  } catch (error) {
    setBackupStatus(`导出失败：${error.message}`, true);
  }
});

document.getElementById("import-data").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) return setBackupStatus("文件超过 12 MB，无法安全导入。", true);
  try {
    const backup = LocalMarksBackup.parse(await file.text());
    const current = await chrome.storage.local.get([STORAGE_KEY, STYLE_KEY]);
    const result = LocalMarksBackup.merge(current[STORAGE_KEY], backup.records);
    const next = { [STORAGE_KEY]: result.records };
    if (importStyles.checked && backup.styles) next[STYLE_KEY] = backup.styles;
    await chrome.storage.local.set(next);
    records = result.records;
    render();
    setBackupStatus(`导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条${next[STYLE_KEY] ? "，样式已恢复" : ""}。`);
  } catch (error) {
    setBackupStatus(`导入失败：${error.message}`, true);
  }
});

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch (_) {
    return value || "";
  }
}

function isSupported(url) {
  return /^https?:\/\//.test(url || "") || /^file:\/\//.test(url || "");
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `page-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function labels(item) {
  const result = [];
  if (item.kind === "page") result.push("网页");
  if (item.isBookmark) result.push("书签");
  if (item.highlightColor || item.underlineColor) result.push("标注");
  if (item.note) result.push("笔记");
  return result;
}

function filterMatches(item) {
  if (activeFilter === "all") return true;
  if (activeFilter === "page") return item.kind === "page";
  if (activeFilter === "bookmark") return Boolean(item.isBookmark);
  if (activeFilter === "mark") return Boolean(item.highlightColor || item.underlineColor);
  if (activeFilter === "note") return Boolean(item.note);
  return true;
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
  } catch (_) {
    return "";
  }
}

function hostname(value) {
  try {
    return new URL(value).hostname || "本地文件";
  } catch (_) {
    return "未知网页";
  }
}

function renderPageButton() {
  const supported = activeTab && isSupported(activeTab.url);
  const saved = supported && records.find((item) => item.kind === "page" && item.url === normalizedUrl(activeTab.url));
  pageButton.disabled = !supported;
  pageButton.textContent = supported ? (saved ? "取消收藏当前网页" : "收藏当前网页") : "此页面不支持注入标记";
  pageButton.classList.toggle("saved", Boolean(saved));
}

function render() {
  const query = search.value.trim().toLowerCase();
  const filtered = records
    .filter(item => !currentPageOnly || (activeTab && normalizedUrl(item.url) === normalizedUrl(activeTab.url)))
    .filter(filterMatches)
    .filter((item) => !query || `${item.title || ""} ${item.quote || ""} ${item.note || ""} ${item.url || ""}`.toLowerCase().includes(query))
    .sort((a, b) => currentPageOnly ? (a.start ?? Infinity) - (b.start ?? Infinity) : new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  grouping.closest("label").hidden = currentPageOnly;
  document.getElementById("scope-current").classList.toggle("active", currentPageOnly);
  document.getElementById("scope-all").classList.toggle("active", !currentPageOnly);
  const groupCount = LocalMarksGroups.groupRecords(filtered, grouping.value).length;
  summary.textContent = currentPageOnly ? `本页 ${filtered.length} 条记录 · 按正文顺序` : `${records.length} 条本地记录 · 显示 ${filtered.length} 条${grouping.value === "none" ? "" : ` · ${groupCount} 组`}`;
  document.getElementById("clear-all").disabled = records.length === 0;
  recordsList.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = query ? "没有找到匹配的标记" : "还没有标记。打开网页并选中文字即可开始。";
    recordsList.appendChild(empty);
    renderPageButton();
    return;
  }
  const createItem = (item) => {
    const li = document.createElement("li");
    li.className = "record";
    const open = document.createElement("button");
    open.className = "open";
    open.type = "button";
    const site = document.createElement("span");
    site.className = "site";
    const siteName = document.createElement("span");
    siteName.textContent = grouping.value === "site" ? item.title || item.url : hostname(item.url);
    site.appendChild(siteName);
    const badges = document.createElement("span");
    badges.className = "badges";
    labels(item).forEach((label) => {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = label;
      badges.appendChild(badge);
    });
    const quote = document.createElement("span");
    quote.className = "quote";
    quote.textContent = item.kind === "page" ? item.title || item.url : item.quote;
    open.append(site, badges, quote);
    if (item.note) {
      const note = document.createElement("span");
      note.className = "note";
      note.textContent = item.note;
      open.appendChild(note);
    }
    const date = document.createElement("span");
    date.className = "date";
    date.textContent = formatDate(item.updatedAt || item.createdAt);
    open.appendChild(date);
    open.addEventListener("click", async () => {
      const result = await chrome.runtime.sendMessage({ type: "LOCAL_MARKS_OPEN_RECORD", record: item });
      if (item.kind === "selection") window.dispatchEvent(new CustomEvent("marks-select", { detail: {item, tabId:result?.tabId} }));
    });
    const remove = document.createElement("button");
    remove.className = "delete";
    remove.type = "button";
    remove.textContent = "删除";
    remove.addEventListener("click", async () => {
      const latest = await chrome.storage.local.get(STORAGE_KEY);
      records = (latest[STORAGE_KEY] || []).filter((record) => record.id !== item.id);
      await chrome.storage.local.set({ [STORAGE_KEY]: records });
      render();
    });
    li.append(open, remove);
    return li;
  };
  LocalMarksGroups.render(recordsList, filtered, currentPageOnly ? "none" : grouping.value, createItem, collapsedGroups, Boolean(query));
  renderPageButton();
}

pageButton.addEventListener("click", async () => {
  if (!activeTab || !isSupported(activeTab.url)) return;
  const url = normalizedUrl(activeTab.url);
  const saved = records.find((item) => item.kind === "page" && item.url === url);
  if (saved) records = records.filter((item) => item.id !== saved.id);
  else {
    const timestamp = new Date().toISOString();
    records.push({ id: makeId(), kind: "page", url, title: activeTab.title || url, createdAt: timestamp, updatedAt: timestamp });
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: records });
  render();
});

search.addEventListener("input", render);
grouping.addEventListener("change", async () => {
  render();
  await chrome.storage.local.set({ [GROUPING_KEY]: grouping.value });
});
document.getElementById("clear-all").addEventListener("click", async () => {
  try {
    const current = await chrome.storage.local.get(STORAGE_KEY);
    clearSnapshot = (current[STORAGE_KEY] || []).map((item) => item.id);
    if (!clearSnapshot.length) return setBackupStatus("当前没有可清空的标记。");
    document.getElementById("clear-description").textContent = `将清空所有网页的 ${clearSnapshot.length} 条记录，包含文字标记、笔记及网页收藏。此操作无法撤销。`;
    clearConfirmation.hidden = false;
    document.getElementById("clear-cancel").focus();
  } catch (error) {
    setBackupStatus(`读取失败：${error.message}`, true);
  }
});
document.getElementById("clear-cancel").addEventListener("click", () => {
  clearConfirmation.hidden = true;
  clearSnapshot = [];
  document.getElementById("clear-all").focus();
});
document.getElementById("clear-confirm").addEventListener("click", async () => {
  if (!clearSnapshot.length) return;
  const button = document.getElementById("clear-confirm");
  button.disabled = true;
  try {
    const current = await chrome.storage.local.get(STORAGE_KEY);
    const ids = new Set(clearSnapshot);
    const remaining = (current[STORAGE_KEY] || []).filter((item) => !ids.has(item.id));
    await chrome.storage.local.set({ [STORAGE_KEY]: remaining });
    records = remaining;
    clearSnapshot = [];
    clearConfirmation.hidden = true;
    render();
    setBackupStatus(remaining.length ? "已清空确认范围内的标记，保留了新添加的记录。" : "已清空所有标记。");
  } catch (error) {
    setBackupStatus(`清空失败：${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});
filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  filters.querySelectorAll("[data-filter]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  render();
});

document.getElementById("open-page-panel").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?library=1") });
});
document.getElementById("scope-current").addEventListener("click", () => { currentPageOnly = true; render(); });
document.getElementById("scope-all").addEventListener("click", () => { currentPageOnly = false; render(); });
async function updateActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  render();
}
chrome.tabs.onActivated?.addListener(updateActiveTab);
chrome.tabs.onUpdated?.addListener((id, info) => { if (id === activeTab?.id && (info.url || info.status === "complete")) updateActiveTab(); });

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  const result = await chrome.storage.local.get([STORAGE_KEY, GROUPING_KEY]);
  grouping.value = ["page", "site", "none"].includes(result[GROUPING_KEY]) ? result[GROUPING_KEY] : "page";
  records = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[GROUPING_KEY]) {
    grouping.value = ["page", "site", "none"].includes(changes[GROUPING_KEY].newValue) ? changes[GROUPING_KEY].newValue : "page";
    render();
  }
  if (area === "local" && changes[STORAGE_KEY]) {
    records = changes[STORAGE_KEY].newValue || [];
    render();
  }
});

init();
