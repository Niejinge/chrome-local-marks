const STORAGE_KEY = "readerMarksV1";
const STYLE_KEY = "readerMarksStyleV2";
const LEGACY_STYLE_KEY = "readerMarksStyleV1";
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

function setBackupStatus(message, isError = false) {
  backupStatus.textContent = message;
  backupStatus.classList.toggle("error", isError);
}

document.getElementById("export-data").addEventListener("click", async () => {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY, STYLE_KEY, LEGACY_STYLE_KEY]);
    const contents = LocalMarksBackup.create(data[STORAGE_KEY] || [], data[STYLE_KEY] || null, data[LEGACY_STYLE_KEY] || null);
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
  if (item.highlightColor) result.push("重点");
  if (item.underlineColor) result.push(item.underlineStyle === "wavy" ? "波浪线" : "下划线");
  if (item.note) result.push("笔记");
  return result;
}

function filterMatches(item) {
  if (activeFilter === "all") return true;
  if (activeFilter === "page") return item.kind === "page";
  if (activeFilter === "bookmark") return Boolean(item.isBookmark);
  if (activeFilter === "highlight") return Boolean(item.highlightColor);
  if (activeFilter === "underline") return Boolean(item.underlineColor);
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
    .filter(filterMatches)
    .filter((item) => !query || `${item.title || ""} ${item.quote || ""} ${item.note || ""} ${item.url || ""}`.toLowerCase().includes(query))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  summary.textContent = `${records.length} 条本地记录${filtered.length === records.length ? "" : ` · 当前显示 ${filtered.length} 条`}`;
  recordsList.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = query ? "没有找到匹配的标记" : "还没有标记。打开网页并选中文字即可开始。";
    recordsList.appendChild(empty);
    renderPageButton();
    return;
  }
  filtered.forEach((item) => {
    const li = document.createElement("li");
    li.className = "record";
    const open = document.createElement("button");
    open.className = "open";
    open.type = "button";
    const site = document.createElement("span");
    site.className = "site";
    const siteName = document.createElement("span");
    siteName.textContent = hostname(item.url);
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
    open.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "LOCAL_MARKS_OPEN_RECORD", record: item });
      window.close();
    });
    const remove = document.createElement("button");
    remove.className = "delete";
    remove.type = "button";
    remove.textContent = "删除";
    remove.addEventListener("click", async () => {
      records = records.filter((record) => record.id !== item.id);
      await chrome.storage.local.set({ [STORAGE_KEY]: records });
      render();
    });
    li.append(open, remove);
    recordsList.appendChild(li);
  });
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
filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  filters.querySelectorAll("[data-filter]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  render();
});

document.getElementById("open-page-panel").addEventListener("click", async () => {
  if (!activeTab || !isSupported(activeTab.url)) return;
  try {
    await chrome.tabs.sendMessage(activeTab.id, { type: "LOCAL_MARKS_OPEN_PANEL" });
    window.close();
  } catch (_) {
    pageButton.textContent = "刷新网页后再试";
  }
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  const result = await chrome.storage.local.get(STORAGE_KEY);
  records = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    records = changes[STORAGE_KEY].newValue || [];
    render();
  }
});

init();
