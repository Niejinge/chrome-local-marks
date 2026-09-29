// Shared by the native side panel and the full-page library.
(() => {
  const $ = id => document.getElementById(id);
  const detail = $('detail');
  const library = new URLSearchParams(location.search).has('library');
  $('collapse-panel').hidden = library;
  if (!library) {
    chrome.windows.getCurrent().then(win => chrome.runtime.sendMessage({type:'LOCAL_MARKS_PANEL_READY',windowId:win.id}));
    chrome.sidePanel?.getLayout?.().then(layout => {
      document.body.classList.toggle('collapse-left', layout.side === 'left');
      $('collapse-panel').textContent = '›';
      $('collapse-panel').setAttribute('aria-label', layout.side === 'left' ? '向左收起侧栏' : '向右收起侧栏');
    }).catch(() => {});
    $('collapse-panel').addEventListener('click', async () => {
      try { const win=await chrome.windows.getCurrent(); await chrome.sidePanel.close({windowId:win.id}); }
      catch (_) { $('collapse-panel').title='未能收起，请使用浏览器侧栏顶部的关闭按钮'; }
    });
  }
  let selected = null;
  let draft = false;
  let targetTab = null;
  let mode = 'highlight';
  let config = null;
  let styles = LocalMarksStyles.normalize({});
  let saveQueue = Promise.resolve();
  let generation = 0;
  function status(text) { $('detail-status').textContent = text; }
  function itemMode(item) { return item.highlightColor ? 'highlight' : item.underlineColor ? (item.underlineStyle === 'wavy' ? 'underline-wavy' : 'underline-solid') : 'bookmark'; }
  function changes(type, style) {
    const clear = {isBookmark:false,bookmarkColor:'',bookmarkThickness:0,highlightColor:'',highlightThickness:0,underlineColor:'',underlineThickness:0,underlineStyle:'solid'};
    const prefix = type === 'highlight' ? 'highlight' : type === 'bookmark' ? 'bookmark' : 'underline';
    return {...clear, isBookmark:type==='bookmark', [`${prefix}Color`]:style.color, [`${prefix}Thickness`]:style.thickness, [`${prefix}Opacity`]:style.opacity, underlineStyle:type==='underline-wavy'?'wavy':'solid'};
  }
  function controls() {
    const meta = LocalMarksStyles.meta[mode];
    $('detail-mode').value = mode;
    $('detail-color').value = config.color;
    Object.assign($('detail-thickness'), {min:meta.min,max:meta.max,value:config.thickness});
    $('detail-opacity').value = config.opacity;
    $('detail-thickness-value').textContent = mode === 'highlight' && config.thickness === 30 ? '铺满' : config.thickness;
    $('detail-opacity-value').textContent = `${config.opacity}%`;
  }
  async function select(item, tabId, isDraft = false) {
    generation++;
    selected = item; draft = isDraft; targetTab = tabId || activeTab?.id;
    const token = generation;
    const data = await chrome.storage.local.get([STYLE_KEY, PREVIOUS_STYLE_KEY, LEGACY_STYLE_KEY]);
    if (token !== generation) return;
    styles = data[STYLE_KEY] ? LocalMarksStyles.normalize(data[STYLE_KEY]) : LocalMarksStyles.migrate(data[PREVIOUS_STYLE_KEY], data[LEGACY_STYLE_KEY]);
    mode = isDraft ? 'highlight' : itemMode(item);
    const prefix = mode.startsWith('underline') ? 'underline' : mode;
    config = isDraft ? {...styles[mode]} : {color:item[`${prefix}Color`] || styles[mode].color, thickness:item[`${prefix}Thickness`] || styles[mode].thickness, opacity:item[`${prefix}Opacity`] ?? styles[mode].opacity};
    $('detail-quote').textContent = item.quote || item.title || '';
    $('detail-note').value = item.note || '';
    detail.hidden = false; controls(); status(isDraft ? '写好后点击保存笔记，才会创建标注。' : '样式即时保存；笔记写好后点击保存。');
    detail.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function preview(record = null) {
    if (!targetTab || !selected || draft) return;
    chrome.tabs.sendMessage(targetTab, {type:'LOCAL_MARKS_PREVIEW',id:selected.id,record}).catch(() => {});
  }
  function save(includeNote = false) {
    if (!selected) return;
    const item = {...selected}; const nextMode = mode; const nextConfig = {...config};
    const note = $('detail-note').value; const wasDraft = draft; const token = generation;
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      const data = await chrome.storage.local.get([STORAGE_KEY, STYLE_KEY]);
      const all = data[STORAGE_KEY] || [];
      const existing = all.find(record => record.id === item.id);
      if (!existing && !wasDraft) throw Error('此标注已被删除');
      if (wasDraft && all.some(record => record.url === item.url && record.kind === 'selection' && record.id !== item.id && record.start < item.end && record.end > item.start)) throw Error('选中文字与已有标注重叠，请重新选择');
      const updated = {...(existing || item),...changes(nextMode,nextConfig),updatedAt:new Date().toISOString()};
      if (includeNote) updated.note = note;
      const remembered = LocalMarksStyles.normalize(data[STYLE_KEY]); remembered[nextMode] = nextConfig;
      await chrome.storage.local.set({[STORAGE_KEY]:[...all.filter(record=>record.id!==item.id),updated],[STYLE_KEY]:remembered});
      if (token === generation) { selected = updated; draft = false; styles = remembered; status(includeNote ? '笔记已保存' : '样式已保存'); }
    }).catch(error => { if (token === generation) { preview(); status(`保存失败：${error.message}`); } });
  }
  $('detail-mode').addEventListener('change', () => { mode=$('detail-mode').value; config={...styles[mode]}; controls(); preview({...selected,...changes(mode,config)}); if (!draft) save(); });
  for (const field of ['color','thickness','opacity']) {
    const input = $(`detail-${field}`);
    input.addEventListener('input', () => { config[field]=field==='color'?input.value:Number(input.value); controls(); preview({...selected,...changes(mode,config)}); });
    input.addEventListener('change', () => { if (!draft) save(); });
  }
  $('detail-save').addEventListener('click', () => save(true));
  $('detail-locate').addEventListener('click', () => { if (selected && !draft) chrome.runtime.sendMessage({type:'LOCAL_MARKS_OPEN_RECORD',record:selected}); });
  function close() { preview(); selected=null; generation++; detail.hidden=true; }
  $('detail-close').addEventListener('click', close);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  window.addEventListener('marks-select', event => select(event.detail.item,event.detail.tabId));
  async function context(value) {
    if (!value) return;
    const currentWindow = await chrome.windows.getCurrent();
    if (value.windowId !== currentWindow.id) return;
    if (value.draft) return select(value.draft,value.tabId,true);
    if (value.id) {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const item = (data[STORAGE_KEY]||[]).find(record=>record.id===value.id);
      if (item) select(item,value.tabId);
    }
  }
  chrome.storage.session.get('readerMarksPanelContext').then(data => context(data.readerMarksPanelContext));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area==='session' && changes.readerMarksPanelContext) context(changes.readerMarksPanelContext.newValue);
    if (area==='local' && changes[STORAGE_KEY] && selected && !draft) {
      const updated = (changes[STORAGE_KEY].newValue||[]).find(item=>item.id===selected.id);
      if (!updated) close(); else selected=updated;
    }
  });
  chrome.tabs.onActivated?.addListener(() => { if (selected && !draft) close(); });
  chrome.storage.local.get('readerMarksEntryV1').then(data => { const value=data.readerMarksEntryV1||{}; $('entry-side').value=value.hidden?'hidden':value.side||'right'; });
  $('entry-side').addEventListener('change', () => chrome.storage.local.set({readerMarksEntryV1:{hidden:$('entry-side').value==='hidden',side:$('entry-side').value==='left'?'left':'right'}}));
})();
