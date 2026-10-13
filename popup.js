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
let recordSelectedId = null;
let currentPageOnly = !new URLSearchParams(location.search).has("library");
const grouping = document.getElementById("grouping");
const collapsedGroups = new Set();
const knownGroups = new Set();
const searchCollapsedGroups = new Set();
let expansionQuery = "";
const groupActions = document.getElementById("group-actions");

function setGroupsOpen(open) {
  const state = search.value.trim() ? searchCollapsedGroups : collapsedGroups;
  recordsList.querySelectorAll(".record-group details").forEach(details => {
    const key = details.dataset.groupKey;
    if (open) state.delete(key);
    else state.add(key);
    details.open = open;
  });
}
document.getElementById("expand-all").addEventListener("click", () => setGroupsOpen(true));
document.getElementById("collapse-all").addEventListener("click", () => setGroupsOpen(false));
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
    await chrome.storage.local.set({readerMarksLastBackupV1:Date.now()});
    updateCapacity();
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
    const result=await LocalMarksData.mutate({op:'import',records:backup.records,styles:importStyles.checked?backup.styles:null});
    records = result.records;
    render();
    setBackupStatus(`导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条${result.styles ? "，样式已恢复" : ""}。`);
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
  pageButton.textContent = supported ? (saved ? "已收藏 ✓" : "收藏网页") : "此页面不支持注入标记";
  pageButton.classList.toggle("saved", Boolean(saved));
}

function render() {
  const query = search.value.trim().toLowerCase();
  if (query !== expansionQuery) {
    searchCollapsedGroups.clear();
    expansionQuery = query;
  }
  // New page/site groups start collapsed; rerenders preserve individual choices.
  LocalMarksGroups.groupRecords(records, grouping.value).forEach(group => {
    if (!knownGroups.has(group.key)) {
      knownGroups.add(group.key);
      collapsedGroups.add(group.key);
    }
  });
  const filtered = records
    .filter(item => !currentPageOnly || (activeTab && normalizedUrl(item.url) === normalizedUrl(activeTab.url)))
    .filter(filterMatches)
    .filter((item) => !query || `${item.title || ""} ${item.quote || ""} ${item.note || ""} ${item.url || ""}`.toLowerCase().includes(query))
    .sort(LocalMarksGroups.compareCreated);
  grouping.closest("label").hidden = currentPageOnly;
  groupActions.hidden = currentPageOnly || grouping.value === "none";
  groupActions.querySelectorAll("button").forEach(button => button.disabled = !filtered.length);
  document.getElementById("scope-current").classList.toggle("active", currentPageOnly);
  document.getElementById("scope-all").classList.toggle("active", !currentPageOnly);
  const groupCount = LocalMarksGroups.groupRecords(filtered, grouping.value).length;
  summary.textContent = currentPageOnly ? `本页 ${filtered.length} 条记录 · 最新创建在前` : `${records.length} 条本地记录 · 显示 ${filtered.length} 条${grouping.value === "none" ? "" : ` · ${groupCount} 组`}`;
  document.getElementById("clear-all").disabled = records.length === 0;
  const pageTitle = document.getElementById('current-page-title');
  pageTitle.textContent = currentPageOnly ? activeTab?.title || hostname(activeTab?.url) : '全部网页';
  pageTitle.title = pageTitle.textContent;
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
    const li = document.createElement('li'); li.className = 'record'; li.dataset.recordId = item.id; li.classList.toggle('selected',recordSelectedId===item.id);
    const open = document.createElement('button'); open.className='open record-detail'; open.type='button'; open.title='查看详情并定位原文';
    const mode = LocalMarksUI.mode(item), icon = document.createElement('span'); icon.className='lm-type-icon '+mode;icon.innerHTML=LocalMarksUI.icon(mode);icon.style.setProperty('--type-color',mode==='bookmark'?item.bookmarkColor||'#ef6a5b':mode==='highlight'?item.highlightColor:mode.startsWith('underline')?item.underlineColor:'#087f80');
    const content=document.createElement('span');content.className='record-content';
    if(!currentPageOnly && grouping.value!=='page') {const site=document.createElement('span');site.className='site';site.textContent=item.title||hostname(item.url);content.append(site);}
    const quote=document.createElement('span');quote.className='quote';quote.textContent=item.kind==='page'?item.title||item.url:item.quote;content.append(quote);
    if(item.note){const note=document.createElement('span');note.className='note';note.textContent=item.note;content.append(note);}
    const meta=document.createElement('span');meta.className='record-meta';const badge=document.createElement('span');badge.className='badge';badge.textContent=item.highlightColor||item.underlineColor?'标注':LocalMarksUI.labels[mode];const date=document.createElement('span');date.className='date';date.textContent=formatDate(item.createdAt||item.updatedAt);meta.append(badge,date);content.append(meta);open.append(icon,content);
    open.setAttribute('aria-label','查看详情并定位原文：'+(item.quote||item.title||'网页收藏'));
    open.title='查看详情并定位原文';
    open.addEventListener('click',()=>{
      recordSelectedId=item.id;recordsList.querySelectorAll('.record').forEach(row=>row.classList.toggle('selected',row.dataset.recordId===item.id));
      window.dispatchEvent(new CustomEvent('marks-select',{detail:{item,tabId:normalizedUrl(item.url)===normalizedUrl(activeTab?.url)?activeTab?.id:null,locate:true}}));
    });
    const actions=document.createElement('div');actions.className='record-actions';
    const locate=document.createElement('button');locate.className='record-locate';locate.type='button';locate.textContent='定位';locate.setAttribute('aria-label','定位原文');locate.title='定位原文';
    locate.addEventListener('click',async()=>{
      try{const result=await chrome.runtime.sendMessage({type:'LOCAL_MARKS_OPEN_RECORD',record:item});if(result?.ok===false||result?.jumped===false&&item.kind==='selection')listError('无法定位原文，请刷新网页后重试');}catch(_){listError('无法定位原文，请刷新网页后重试');}
    });
    const remove=document.createElement('button');remove.className='delete icon-button';remove.type='button';remove.innerHTML=LocalMarksUI.icon('trash');remove.setAttribute('aria-label','删除此标记');remove.title='删除此标记';
    remove.addEventListener('click',async()=>{
      try{const result=await LocalMarksData.mutate({op:'delete',ids:[item.id],undo:true});records=result.records;render();showUndo(result);}catch(_){listError('删除失败，请重试');}
    });
    actions.append(locate,remove);li.append(open,actions);return li;
  };
  if(currentPageOnly) filtered.forEach(item=>recordsList.append(createItem(item)));
  else LocalMarksGroups.render(recordsList, filtered, grouping.value, createItem, query ? searchCollapsedGroups : collapsedGroups);
  renderPageButton();
}

function listError(message){const el=document.getElementById('list-status');el.textContent=message;el.hidden=false;}
document.querySelector('.logo').innerHTML=LocalMarksUI.icon('bookmark');
document.getElementById('settings-toggle').innerHTML=LocalMarksUI.icon('settings');
function showSettings(open){document.getElementById('settings-view').hidden=!open;document.getElementById('settings-toggle').setAttribute('aria-expanded',String(open));if(open)document.getElementById('backup-panel').open=true;}
document.getElementById('settings-toggle').addEventListener('click',()=>showSettings(document.getElementById('settings-view').hidden));
document.getElementById('settings-close').addEventListener('click',()=>showSettings(false));

pageButton.addEventListener("click", async () => {
  if (!activeTab || !isSupported(activeTab.url)) return;
  const url = normalizedUrl(activeTab.url);
  const timestamp=new Date().toISOString();
  try{const result=await LocalMarksData.mutate({op:'page-toggle',record:{id:makeId(),kind:'page',url,title:activeTab.title||url,createdAt:timestamp,updatedAt:timestamp}});records=result.records;render();if(result.undoToken)showUndo(result);}
  catch(error){listError(error.message);}

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
    const result=await LocalMarksData.mutate({op:'delete',ids:clearSnapshot});
    const remaining=result.records;records=remaining;
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

function showUndo(result){LocalMarksUI.offerUndo(document.getElementById('undo-status'),result,()=>{},error=>listError(error.message));}
let capacityGeneration=0,capacityTimer=0;
async function updateCapacity(){
  const token=++capacityGeneration;
  try{const usage=await LocalMarksData.usage();const data=await chrome.storage.local.get('readerMarksLastBackupV1');if(token!==capacityGeneration)return;
    const last=data.readerMarksLastBackupV1;
    document.getElementById('storage-usage').textContent=`已用 ${(usage.bytes/1048576).toFixed(2)} / ${(usage.limit/1048576).toFixed(0)} MB · ${last?'上次导出 '+new Date(last).toLocaleDateString('zh-CN'):'尚未导出备份'}`;
    document.getElementById('capacity-warning').hidden=usage.ratio<.8;
  }catch(_){document.getElementById('storage-usage').textContent='暂时无法读取存储用量，请重试';}
}
document.getElementById('capacity-settings').addEventListener('click',()=>showSettings(true));
document.getElementById('help-dismiss').addEventListener('click',async()=>{try{await chrome.storage.local.set({readerMarksHelpDismissedV1:true});document.getElementById('getting-started').hidden=true;}catch(error){listError('未能保存提示设置，请重试');}});
chrome.storage.local.get('readerMarksHelpDismissedV1').then(data=>{document.getElementById('getting-started').hidden=Boolean(data.readerMarksHelpDismissedV1)});
chrome.storage.onChanged.addListener((_changes,area)=>{if(area==='local'){clearTimeout(capacityTimer);capacityTimer=setTimeout(updateCapacity,100)}});
updateCapacity();
