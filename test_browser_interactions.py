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
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent
CHROME = os.environ.get("CHROME_BIN", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
MOCK = r'''
window.testStore = { data: {}, listeners: [], messages: [], runtimeListeners: [], failWrite: false };
window.chrome = window.chrome || {};
chrome.storage = {
  local: {
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
chrome.runtime = { onMessage: { addListener(fn) { testStore.runtimeListeners.push(fn); } }, sendMessage: async message => { testStore.messages.push(message); } };
chrome.storage.session = {get:async()=>({})};
chrome.windows = {getCurrent:async()=>({id:1})};
chrome.sidePanel={getLayout:async()=>({side:'right'}),close:async options=>{testStore.closedWindow=options.windowId}};
chrome.tabs = { query: async () => [{id: 1, url: location.href, title: '测试页面'}], sendMessage: async () => ({ok:true}) };
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
  if (TEST_CASE === 'content-saved') {
    $('#launcher').click(); $('#open-style-settings').click();
    check($('#panel-style-editor .presets .selected').textContent === '中', 'saved highlight preference survives a new page load');
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
    }
    mark = document.querySelector('mark[data-local-reader-mark="local"]'); mark.click();
    const styleButton = all('#quick > button').find(el=>el.textContent==='样式');
    const before = styleButton.getBoundingClientRect(); styleButton.dispatchEvent(new MouseEvent('mouseenter'));
    const after = styleButton.getBoundingClientRect();
    check(before.x===after.x && before.y===after.y, 'hovering style never moves its trigger');
    $('#quick').dispatchEvent(new MouseEvent('mouseleave')); await wait(100);
    $('.quick-settings').dispatchEvent(new MouseEvent('mouseenter')); $('#quick').dispatchEvent(new MouseEvent('mouseenter')); await wait(200);
    check($('#quick').classList.contains('open') && !$('.quick-settings').classList.contains('hidden'), 'crossing into style editor keeps it open');
    $('#quick-delete').dispatchEvent(new MouseEvent('mouseenter'));
    check($('.quick-settings').classList.contains('hidden') && styleButton.getAttribute('aria-expanded')==='false', 'hovering delete dismisses styles and resets expanded state');
    $('#quick-edit').dispatchEvent(new MouseEvent('mouseenter'));
    check(!$('#quick-mode-menu').classList.contains('hidden') && $('.quick-settings').classList.contains('hidden'), 'edit type and style menus are mutually exclusive');
    $('#quick-note').dispatchEvent(new MouseEvent('mouseenter'));
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
    $('#add-note').dispatchEvent(new MouseEvent('mouseenter'));
    check($('#mark-submenu').classList.contains('hidden') && $('#add-mark').getAttribute('aria-expanded')==='false','new note hover closes annotation submenu');
    $('#all-options').dispatchEvent(new MouseEvent('mouseenter'));
    check(!$('#settings').classList.contains('hidden'),'new style settings open on hover');
    $('#add-mark').dispatchEvent(new MouseEvent('mouseenter'));
    check($('#settings').classList.contains('hidden') && !$('#mark-submenu').classList.contains('hidden'),'new type choices replace style settings');
    $('#add-bookmark').dispatchEvent(new FocusEvent('focus'));
    check($('#settings').classList.contains('hidden') && $('#mark-submenu').classList.contains('hidden'),'new bookmark focus closes all secondary menus');
    const multiNode=document.createElement('div'); multiNode.innerHTML='<p>跨块文本第一行</p><p>跨块文本第二行</p>'; document.body.appendChild(multiNode);
    const multiRange=document.createRange(); multiRange.selectNodeContents(multiNode); selection.removeAllRanges(); selection.addRange(multiRange);
    multiNode.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); await pause(); $('#add-mark').click(); await pause();
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
    check(getComputedStyle($('#note-tooltip')).backgroundColor.includes('0.78') || getComputedStyle($('#note-tooltip')).backdropFilter.includes('blur'), 'note bubble uses translucent treatment');
    $('#all-options').dispatchEvent(new MouseEvent('mouseenter')); await wait(160);
    getComputedStyle($('#all-options')).backgroundColor;
    $('#all-options').getAnimations().forEach(animation=>animation.finish());
    const focused=getComputedStyle($('#all-options')).backgroundColor;
    check(!['rgba(0, 0, 0, 0)','rgb(241, 244, 245)'].includes(focused),'expanded primary action has a visible theme background');
    $('#all-options').dispatchEvent(new MouseEvent('mouseenter'));
    $('#toolbar').dispatchEvent(new MouseEvent('mouseleave')); await wait(300);
    check($('#settings').classList.contains('hidden') && $('#all-options').getAttribute('aria-expanded')==='false','leaving new toolbar closes settings and resets trigger');
    finish(); return;
  }
  if (TEST_CASE.startsWith('popup')) {
    check(all('#records .record').length===1, 'side panel starts with current page only');
    $('#collapse-panel').click(); await pause();
    check(testStore.closedWindow===1, 'outward arrow closes sidebar in its own window');
    window.dispatchEvent(new CustomEvent('marks-select',{detail:{item:local(),tabId:1}})); await pause();
    check(!$('#detail').hidden && $('#detail-note').value==='保留笔记', 'selected mark opens detail with note');
    $('#detail-mode').value='underline-solid'; $('#detail-mode').dispatchEvent(new Event('change')); await pause();
    check(local().underlineThickness===3 && local().note==='保留笔记', 'panel mode change uses medium and preserves note');
    $('#detail-thickness').value='5'; $('#detail-thickness').dispatchEvent(new Event('input')); $('#detail-thickness').dispatchEvent(new Event('change')); await pause();
    check(local().underlineThickness===5 && testStore.data.readerMarksStyleV3['underline-solid'].thickness===5, 'panel persists independent thickness');
    $('#detail-note').value='侧栏编辑后的笔记'; $('#detail-save').click(); await pause();
    check(local().note==='侧栏编辑后的笔记', 'panel note save persists');
    $('#detail-close').click(); check($('#detail').hidden, 'detail closes without covering page');
    const initial = structuredClone(local());
    const draftItem = {...initial,id:'draft',start:100,end:120,quote:'新笔记测试',note:''};
    // The context callback receives drafts from the page via session storage.
    testStore.listeners.forEach(fn=>fn({readerMarksPanelContext:{newValue:{draft:draftItem,tabId:1,windowId:1}}},'session'));
    await pause();
    check(!saved().some(item=>item.id==='draft'), 'opening draft does not create a mark');
    $('#detail-note').value='新建笔记'; $('#detail-save').click(); await pause();
    check(saved().find(item=>item.id==='draft')?.note==='新建笔记', 'draft saves note from side panel');
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
  const grouping = $('#grouping');
  grouping.value = 'site'; grouping.dispatchEvent(new Event('change')); await pause();
  check(all(`${list} .record-group`).length === 3, 'website grouping combines pages of the same origin');
  check(testStore.data.readerMarksGroupingV1 === 'site', 'grouping preference saved');
  const firstGroup = $(`${list} details`); firstGroup.open = false; await pause();
  $('#search').value = '远端内容'; $('#search').dispatchEvent(new Event('input')); await pause();
  check(all(`${list} .record-group`).length === 1 && $(`${list} details`).open, 'search finds matching records and expands their group');
  $('#search').value = ''; $('#search').dispatchEvent(new Event('input')); await pause();
  check(!$(`${list} details`).open, 'clearing search restores collapsed group');
  grouping.value = 'none'; grouping.dispatchEvent(new Event('change')); await pause();
  check(all(`${list} .record-group`).length === 0 && all(`${list} > li`).length === 6, 'chronological view shows every record without groups');
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
            source += '<script>' + MOCK + extra + '</script>' + script('mark-styles.js') + script('record-groups.js') + script('content.js')
        else:
            source = (ROOT / 'popup.html').read_text()
            source = source.replace('<head>', f'<head><base href="{ROOT.as_uri()}/">')
            source = source.replace('<script src="backup.js">', '<script>' + MOCK + '</script><script src="backup.js">')
        source += '<script>const TEST_CASE = ' + json.dumps(case) + ';' + CHECKS + '</script>'
        fixture = directory / 'fixture.html'
        fixture.write_text(source)
        process = subprocess.Popen([
            CHROME, *(['--force-dark-mode'] if case == 'popup-dark' else []), '--headless=new', '--no-first-run', '--no-default-browser-check',
            '--disable-background-networking', '--disable-extensions', '--allow-file-access-from-files',
            f'--user-data-dir={directory / "profile"}', '--virtual-time-budget=7000',
            '--dump-dom', fixture.as_uri()
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
    run('content')
    # Content persistence is covered by shared style unit tests.
    run('popup')
    run('popup-dark')
