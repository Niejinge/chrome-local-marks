(() => {
  "use strict";

  if (window.top !== window || document.getElementById("local-reader-marks-host")) return;

  const STORAGE_KEY = "readerMarksV1";
  const STYLE_KEY = "readerMarksStyleV2";
  const LEGACY_STYLE_KEY = "readerMarksStyleV1";
  const COLORS = ["#f2bd55", "#f59e0b", "#ef6a5b", "#df7e9a", "#a78bfa", "#6f91e8", "#55bfc0", "#65b883", "#7d8790"];
  const STYLE_META = {
    bookmark: { label: "书签边标", min: 1, max: 10, presets: [[2, "细"], [4, "中"], [7, "粗"]] },
    highlight: { label: "重点标注", min: 3, max: 30, presets: [[7, "细"], [15, "中"], [30, "铺满"]] },
    underline: { label: "下划线", min: 1, max: 8, presets: [[1, "细"], [3, "中"], [6, "粗"]] }
  };
  const DEFAULT_STYLES = {
    bookmark: { color: "#ef6a5b", thickness: 4, opacity: 100 },
    highlight: { color: "#f2bd55", thickness: 15, opacity: 100 },
    underline: { color: "#6f91e8", thickness: 2, opacity: 100, lineStyle: "solid" }
  };
  const ICONS = {
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21Z"/></svg>',
    highlighter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 11-6 6v4h4l6-6"/><path d="m22 12-4 4-8-8 4-4Z"/><path d="M3 21h18"/></svg>',
    line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16h14"/><path d="M8 5h8M12 5v7"/></svg>',
    wave: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0 3 4 4.5 0"/><path d="M8 5h8M12 5v6"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 9h8M8 13h5"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></svg>',
    page: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6Z"/><path d="M15 3v5h5M9 13h6M9 17h6"/></svg>',
    marks: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 15 7-7 5 5-7 7H4Z"/><path d="m14 5 2-2 5 5-2 2M13 19h8"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>'
  };
  const host = document.createElement("div");
  host.id = "local-reader-marks-host";
  host.style.setProperty("all", "initial", "important");
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("inset", "0", "important");
  host.style.setProperty("z-index", "2147483647", "important");
  host.style.setProperty("pointer-events", "none", "important");
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  function isInvalidatedContextError(reason) {
    const message = String(reason?.message || reason || "");
    return message.includes("Extension context invalidated");
  }

  window.addEventListener("unhandledrejection", (event) => {
    if (!isInvalidatedContextError(event.reason)) return;
    event.preventDefault();
    showToast("扩展已更新，请刷新网页后继续");
  });

  root.innerHTML = `
    <style>
      :host{all:initial;color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
      *{box-sizing:border-box}button,input,textarea{font:inherit}.hidden{display:none!important}
      .launcher{position:fixed;right:18px;bottom:18px;display:grid;place-items:center;width:44px;height:44px;padding:0;color:#087f80;background:#fff;border:1px solid #c8d5d9;border-radius:50%;box-shadow:0 8px 26px rgba(20,34,48,.22);cursor:pointer;pointer-events:auto;transition:transform .16s ease,box-shadow .16s ease}
      .launcher:hover,.launcher:focus-visible{outline:2px solid #55bfc0;outline-offset:2px;transform:translateY(-2px);box-shadow:0 11px 30px rgba(20,34,48,.28)}
      .launcher svg{width:20px;height:20px}.count{position:absolute;top:-5px;right:-5px;display:grid;place-items:center;min-width:18px;height:18px;padding:0 5px;color:#fff;background:#087f80;border:2px solid #fff;border-radius:99px;font-size:10px;font-weight:750}.count:empty{display:none}
      .toolbar{position:fixed;z-index:3;display:none;width:max-content;max-width:calc(100vw - 20px);padding:7px;color:#fff;background:#17212d;border:1px solid rgba(255,255,255,.08);border-radius:11px;box-shadow:0 12px 34px rgba(0,0,0,.3);pointer-events:auto}.toolbar.visible{display:block}.actions{display:flex;align-items:stretch;gap:6px}.toolbar button{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 11px;color:#fff;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.07);border-radius:7px;cursor:pointer;white-space:nowrap}.toolbar button:hover,.toolbar button:focus-visible{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.16);outline:none}.toolbar svg,.quick svg,.mark-mode svg,.panel-view-tab svg,.style-tab svg{width:16px;height:16px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.split{display:flex;overflow:hidden;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.07);border-radius:8px}.split .primary-action{border:0;border-radius:7px 0 0 7px}.split .options{width:29px;padding-inline:5px;border:0;border-left:1px solid rgba(255,255,255,.18);border-radius:0 7px 7px 0;background:transparent}.split .options svg{width:14px;height:14px}
      .style-editor{--editor-ink:#20303d;--editor-muted:#6c7a84;--editor-bg:#f4f7f7;--editor-line:#d7e0e2;display:grid;gap:10px;color:var(--editor-ink);font-size:12px}.settings{--editor-ink:#fff;--editor-muted:rgba(255,255,255,.68);--editor-bg:rgba(255,255,255,.09);--editor-line:rgba(255,255,255,.24);width:min(520px,calc(100vw - 32px));margin-top:7px;padding:11px;background:var(--editor-bg);border-radius:8px}.editor-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.editor-title strong{font-size:12px}.editor-title small{color:var(--editor-muted)}.setting-row{display:grid;grid-template-columns:48px minmax(0,1fr);align-items:center;gap:8px}.setting-label{color:var(--editor-muted)}.palette{display:flex;gap:6px;flex-wrap:wrap}.swatch{width:24px;height:24px;padding:0!important;background:var(--swatch)!important;border:2px solid transparent!important;border-radius:50%!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.16)}.swatch.selected{border-color:var(--editor-ink)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--editor-ink) 24%,transparent),inset 0 0 0 1px rgba(0,0,0,.15)}.custom-color{width:28px;height:26px;padding:1px;border:1px solid var(--editor-line);border-radius:6px;background:transparent;cursor:pointer}.thickness-controls{display:grid;grid-template-columns:auto minmax(90px,1fr) 46px;align-items:center;gap:8px}.presets,.line-styles{display:flex;gap:5px}.style-editor .presets button,.style-editor .line-styles button{min-width:37px;padding:5px 7px;color:var(--editor-ink);background:transparent;border:1px solid var(--editor-line);border-radius:6px}.style-editor .presets button.selected,.style-editor .line-styles button.selected{color:#fff;background:#087f80;border-color:#087f80}.thickness-range{width:100%;accent-color:#087f80}.thickness-output{color:var(--editor-muted);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}.style-tabs,.mark-modes{display:flex;gap:8px;margin-bottom:12px}.style-tab,.mark-mode{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;padding:8px 9px;color:#60707b;background:#fff;border:1px solid #d5dfe2;border-radius:8px;cursor:pointer}.style-tab.active,.mark-mode.active{color:#fff;background:#087f80;border-color:#087f80}.settings .mark-mode{color:rgba(255,255,255,.78);background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.16)}.settings .mark-mode.active{color:#fff;background:#087f80;border-color:#55bfc0}
      .panel{position:fixed;top:12px;right:12px;bottom:12px;z-index:4;width:min(390px,calc(100vw - 24px));display:flex;flex-direction:column;color:#182432;background:#fff;border:1px solid #d5dfe2;border-radius:14px;box-shadow:0 24px 70px rgba(17,31,44,.3);pointer-events:auto;transform:translateX(calc(100% + 30px));transition:transform .2s ease}.panel.open{transform:none}.panel-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 18px 13px;border-bottom:1px solid #e0e7e9}.panel-header h2{margin:0;font-size:20px}.panel-header p{margin:4px 0 0;color:#667581;font-size:12px;line-height:1.45}.panel-header-actions{display:flex;gap:3px}.icon-button{display:grid;place-items:center;width:32px;height:32px;padding:0;color:#61717d;background:transparent;border:0;border-radius:7px;cursor:pointer;font-size:19px}.icon-button:hover,.icon-button.active{background:#eef4f4;color:#087f80}.panel-style-box{margin:12px 16px 5px;padding:11px;background:#f7f9f9;border:1px solid #dce5e7;border-radius:10px}.panel-view-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:12px 16px 8px}.panel-view-tab{padding:8px;color:#65747f;background:#f4f7f7;border:1px solid transparent;border-radius:8px;cursor:pointer}.panel-view-tab.active{color:#087f80;background:#edf8f7;border-color:#9ed5d2;font-weight:650}.page-action{margin:4px 16px 8px;padding:10px 12px;color:#087f80;background:#edf8f7;border:1px solid #b9ddda;border-radius:8px;cursor:pointer;font-weight:650}.page-action.saved{color:#8a4e17;background:#fff4e8;border-color:#e8c49c}.tools{display:grid;gap:9px;padding:4px 16px 8px}.search{width:100%;padding:9px 10px;color:#182432;background:#fff;border:1px solid #cbd7db;border-radius:8px;outline:none}.search:focus{border-color:#55bfc0;box-shadow:0 0 0 3px rgba(85,191,192,.15)}.filters{display:flex;gap:6px;flex-wrap:wrap}.filter{padding:5px 9px;color:#65747f;background:#fff;border:1px solid #d5dfe2;border-radius:99px;cursor:pointer;font-size:12px}.filter.active{color:#fff;background:#087f80;border-color:#087f80}.list{flex:1;margin:0;padding:4px 16px 18px;overflow:auto;list-style:none}.item{display:grid;grid-template-columns:1fr auto;gap:7px 9px;padding:13px 0;border-bottom:1px solid #e5ebed}.jump{min-width:0;padding:0;text-align:left;color:#182432;background:transparent;border:0;cursor:pointer}.jump:hover .quote{color:#087f80}.badges{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:5px}.badge{padding:2px 6px;color:#65747f;background:#eef3f4;border-radius:99px;font-size:10px}.quote{display:-webkit-box;overflow:hidden;font-size:14px;font-weight:650;line-height:1.5;-webkit-box-orient:vertical;-webkit-line-clamp:3}.note-preview{display:-webkit-box;margin-top:5px;overflow:hidden;color:#687782;font-size:12px;line-height:1.45;-webkit-box-orient:vertical;-webkit-line-clamp:2}.date{display:block;margin-top:6px;color:#88959e;font-size:10px}.item-actions{display:flex;align-self:center;gap:2px}.edit-item,.delete{padding:6px 8px;color:#7a8790;background:transparent;border:0;border-radius:6px;cursor:pointer}.edit-item:hover{color:#087f80;background:#edf8f7}.delete:hover{color:#b13e3e;background:#fff0f0}.empty{padding:34px 6px;text-align:center;color:#75838d;font-size:13px}.overlay{position:fixed;inset:0;z-index:6;display:none;place-items:center;padding:18px;background:rgba(16,26,37,.38);pointer-events:auto}.overlay.open{display:grid}.dialog{width:min(520px,100%);padding:0;color:#182432;background:#fff;border:1px solid #d5dfe2;border-radius:13px;box-shadow:0 24px 70px rgba(17,31,44,.3)}.dialog-head{display:flex;align-items:flex-start;justify-content:space-between;padding:17px 18px 12px;border-bottom:1px solid #e0e7e9}.dialog-head h2{margin:0;font-size:19px}.dialog-body{padding:16px 18px 18px}.edit-body{padding:16px 18px 18px}.edit-hint{margin:11px 0 0;color:#687782;font-size:12px}.note-quote{max-height:100px;margin:0 0 12px;padding:9px 11px;overflow:auto;color:#687782;background:#f2f6f6;border-left:3px solid #55bfc0;font-size:12px;line-height:1.55}.note-text{width:100%;min-height:130px;padding:10px 11px;resize:vertical;color:#182432;background:#fff;border:1px solid #cbd7db;border-radius:8px;outline:none;line-height:1.55}.note-text:focus{border-color:#55bfc0;box-shadow:0 0 0 3px rgba(85,191,192,.15)}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:11px}.secondary,.primary{padding:8px 12px;border-radius:7px;cursor:pointer}.secondary{color:#65747f;background:#fff;border:1px solid #d5dfe2}.primary{color:#fff;background:#087f80;border:1px solid #087f80}.quick{position:fixed;z-index:5;display:none;gap:3px;padding:5px;color:#fff;background:#17212d;border-radius:7px;box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:auto}.quick.open{display:flex}.quick button{padding:6px 9px;color:#fff;background:transparent;border:0;border-radius:5px;cursor:pointer}.quick button:hover{background:rgba(255,255,255,.13)}.quick .danger:hover{color:#ffd2d2;background:rgba(190,62,62,.24)}.note-tooltip{position:fixed;z-index:7;display:none;width:max-content;max-width:min(340px,calc(100vw - 24px));padding:9px 18px 9px 11px;color:#f7fafb;background:#17212d;border:1px solid rgba(255,255,255,.11);border-radius:9px;box-shadow:0 12px 32px rgba(0,0,0,.3);font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:none}.note-tooltip.visible{display:block;max-height:calc(6.2em + 20px);overflow:hidden}.note-tooltip.truncated::after{content:"…";position:absolute;right:9px;bottom:8px;padding-left:18px;color:#f7fafb;background:linear-gradient(90deg,rgba(23,33,45,0),#17212d 42%)}.toast{position:fixed;right:18px;bottom:72px;z-index:8;padding:9px 12px;color:#fff;background:#17212d;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.24);font-size:12px;opacity:0;transform:translateY(7px);transition:.18s ease;pointer-events:none}.toast.visible{opacity:1;transform:none}
      .actions{gap:2px}.actions>.primary-action{background:transparent;border:0}.actions>.primary-action:hover{background:rgba(255,255,255,.1);border-color:transparent}.actions>.unified-options{width:38px;margin-left:3px;padding-inline:9px;color:#67d0d1;background:transparent;border:0;border-left:1px solid rgba(255,255,255,.14);border-radius:0 7px 7px 0}.actions>.unified-options:hover{color:#fff;background:rgba(85,191,192,.15)}.panel-view-tab{display:flex;align-items:center;justify-content:center;gap:7px}.quick{gap:6px;padding:6px;border:1px solid rgba(255,255,255,.08);border-radius:10px}.quick button{display:flex;align-items:center;gap:6px;padding:7px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);border-radius:7px}.quick button:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.14)}.quick .danger{color:#ffc9c9}.quick .danger:hover{color:#fff;background:rgba(190,62,62,.35)}
      @media(max-width:560px){.launcher{right:13px;bottom:13px}.toolbar{left:10px!important;right:10px!important;bottom:68px!important;top:auto!important;width:auto}.actions{display:flex}.actions>.primary-action{flex:1}.actions>.unified-options{flex:0 0 38px}.settings{width:auto}.setting-row{grid-template-columns:42px 1fr}.thickness-controls{grid-template-columns:1fr 34px}.presets{grid-column:1/-1}.panel{inset:8px;width:auto}.item{grid-template-columns:1fr}.delete{justify-self:end}}
      @media(prefers-reduced-motion:reduce){.launcher,.panel,.toast{transition:none}}
    </style>
    <button class="launcher" id="launcher" type="button" aria-label="打开我的标记" title="我的标记">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21Z"/></svg>
      <strong class="count" id="count"></strong>
    </button>
    <div class="toolbar" id="toolbar" role="toolbar" aria-label="文本标记工具">
      <div class="actions">
        <button class="primary-action" id="add-bookmark" type="button">${ICONS.bookmark}<span>书签</span></button>
        <button class="primary-action" id="add-mark" type="button">${ICONS.highlighter}<span>标注</span></button>
        <button class="primary-action" id="add-note" type="button">${ICONS.note}<span>笔记</span></button>
        <button class="unified-options" id="all-options" type="button" aria-label="标记样式设置" title="标记样式设置">${ICONS.sliders}</button>
      </div>
      <div class="settings style-editor hidden" id="settings"></div>
    </div>
    <aside class="panel" id="panel" aria-label="当前网页标记">
      <div class="panel-header"><div><h2>我的标记</h2><p>本页标记与跨网页收藏</p></div><div class="panel-header-actions"><button class="icon-button" id="open-style-settings" type="button" aria-label="标记样式设置" title="标记样式设置">⚙</button><button class="icon-button" id="close-panel" type="button" aria-label="关闭">×</button></div></div>
      <section class="panel-style-box hidden" id="panel-style-box"><div class="style-tabs" id="panel-style-tabs"><button class="style-tab" data-panel-style="bookmark">${ICONS.bookmark}<span>书签</span></button><button class="style-tab active" data-panel-style="highlight">${ICONS.highlighter}<span>高亮</span></button><button class="style-tab" data-panel-style="underline">${ICONS.line}<span>下划线</span></button></div><div class="style-editor" id="panel-style-editor"></div></section>
      <div class="panel-view-tabs" id="panel-view-tabs"><button class="panel-view-tab active" data-panel-view="marks" type="button">${ICONS.marks}<span>本页标记</span></button><button class="panel-view-tab" data-panel-view="pages" type="button">${ICONS.page}<span>网页收藏</span></button></div>
      <button class="page-action hidden" id="page-action" type="button">收藏当前网页</button>
      <div class="tools"><input class="search" id="search" type="search" placeholder="搜索本页标记"><div class="filters" id="filters"><button class="filter active" data-filter="all">全部</button><button class="filter" data-filter="bookmark">书签</button><button class="filter" data-filter="highlight">重点</button><button class="filter" data-filter="underline">下划线</button><button class="filter" data-filter="note">笔记</button></div></div>
      <ul class="list" id="list"></ul>
    </aside>
    <div class="quick" id="quick"><button id="quick-edit" type="button">${ICONS.edit}<span>修改</span></button><button id="quick-note" type="button">${ICONS.note}<span>笔记</span></button><button class="danger" id="quick-delete" type="button">${ICONS.trash}<span>删除</span></button></div>
    <div class="note-tooltip" id="note-tooltip" role="tooltip" aria-hidden="true"></div>
    <div class="overlay" id="edit-overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title"><div class="dialog-head"><h2 id="edit-title">修改标记</h2><button class="icon-button" id="edit-close" type="button" aria-label="关闭">×</button></div><div class="edit-body"><div class="mark-modes" id="edit-modes"><button class="mark-mode" data-edit-mode="bookmark" type="button">${ICONS.bookmark}<span>书签</span></button><button class="mark-mode" data-edit-mode="highlight" type="button">${ICONS.highlighter}<span>高亮</span></button><button class="mark-mode" data-edit-mode="underline-solid" type="button">${ICONS.line}<span>直线</span></button><button class="mark-mode" data-edit-mode="underline-wavy" type="button">${ICONS.wave}<span>波浪</span></button></div><div class="style-editor" id="edit-style-editor"></div><p class="edit-hint">修改后即时保存并更新网页中的标记。</p></div></section></div>
    <div class="overlay" id="note-overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="note-title"><div class="dialog-head"><h2 id="note-title">添加笔记</h2><button class="icon-button" id="note-close" type="button" aria-label="关闭">×</button></div><form class="dialog-body" id="note-form"><blockquote class="note-quote" id="note-quote"></blockquote><textarea class="note-text" id="note-text" maxlength="10000" placeholder="写下理解、疑问或待复习内容……"></textarea><div class="dialog-actions"><button class="secondary" id="note-cancel" type="button">取消</button><button class="primary" type="submit">保存</button></div></form></section></div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  `;

  const $ = (selector) => root.querySelector(selector);
  const launcher = $("#launcher");
  const count = $("#count");
  const toolbar = $("#toolbar");
  const settings = $("#settings");
  const panel = $("#panel");
  const panelStyleBox = $("#panel-style-box");
  const panelStyleTabs = $("#panel-style-tabs");
  const panelStyleEditor = $("#panel-style-editor");
  const openStyleSettings = $("#open-style-settings");
  const panelViewTabs = $("#panel-view-tabs");
  const pageAction = $("#page-action");
  const search = $("#search");
  const list = $("#list");
  const filters = $("#filters");
  const overlay = $("#note-overlay");
  const noteTitle = $("#note-title");
  const noteQuote = $("#note-quote");
  const noteText = $("#note-text");
  const editOverlay = $("#edit-overlay");
  const editModes = $("#edit-modes");
  const editStyleEditor = $("#edit-style-editor");
  const quick = $("#quick");
  const noteTooltip = $("#note-tooltip");
  const toast = $("#toast");

  let records = [];
  let pendingSelection = null;
  let pendingRect = null;
  let editingId = null;
  let styleEditingId = null;
  let editMode = "highlight";
  let editConfig = null;
  let quickId = null;
  let quickHideTimer = 0;
  let activeFilter = "all";
  let panelView = "marks";
  let toastTimer = 0;
  let ignoreMutationsUntil = 0;
  let restoreTimer = 0;
  let currentUrl = pageUrl();
  let styles = structuredClone(DEFAULT_STYLES);
  let toolbarMarkMode = "highlight";
  let toolbarSettingsMode = "highlight";
  let panelStyleType = "highlight";

  function pageUrl() {
    const url = new URL(location.href);
    url.hash = "";
    return url.href;
  }

  function pageRecords() {
    const url = pageUrl();
    return records.filter((item) => item.url === url);
  }

  function now() {
    return new Date().toISOString();
  }

  function makeId() {
    return crypto.randomUUID ? crypto.randomUUID() : `mark-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeSelector(value) {
    return CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 1800);
  }

  function normalizeStyles(saved, legacy = {}) {
    const result = structuredClone(DEFAULT_STYLES);
    ["bookmark", "highlight", "underline"].forEach((type) => {
      const source = saved?.[type] || {};
      const meta = STYLE_META[type];
      if (/^#[0-9a-f]{6}$/i.test(source.color || "")) result[type].color = source.color;
      const thickness = Number(source.thickness);
      if (Number.isFinite(thickness)) result[type].thickness = Math.min(meta.max, Math.max(meta.min, thickness));
      const opacity = Number(source.opacity);
      if (Number.isFinite(opacity)) result[type].opacity = Math.min(100, Math.max(10, opacity));
    });
    if (!saved?.highlight && legacy.color) result.highlight.color = legacy.color;
    if (!saved?.highlight && Number.isFinite(Number(legacy.thickness))) result.highlight.thickness = Math.min(STYLE_META.highlight.max, Math.max(STYLE_META.highlight.min, Number(legacy.thickness)));
    result.underline.lineStyle = saved?.underline?.lineStyle === "wavy" ? "wavy" : "solid";
    return result;
  }

  function colorWithOpacity(hex, opacity = 100) {
    const normalized = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex.slice(1) : "000000";
    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    const alpha = Math.min(100, Math.max(10, Number(opacity) || 100)) / 100;
    return `rgba(${red},${green},${blue},${alpha})`;
  }

  function thicknessDescription(type, value) {
    const meta = STYLE_META[type];
    const progress = (Math.min(meta.max, Math.max(meta.min, Number(value))) - meta.min) / (meta.max - meta.min || 1);
    if (type === "highlight" && progress >= 0.96) return "铺满";
    if (progress < 0.24) return "细";
    if (progress < 0.5) return "偏细";
    if (progress < 0.76) return "适中";
    return "偏宽";
  }

  function highlightBandSize(thickness) {
    const meta = STYLE_META.highlight;
    const progress = (Math.min(meta.max, Math.max(meta.min, Number(thickness))) - meta.min) / (meta.max - meta.min || 1);
    if (progress >= 0.96) return "100%";
    const em = 0.42 + Math.pow(progress, 0.75) * 0.86;
    return `min(${em.toFixed(3)}em, calc(1lh - 0.08em))`;
  }

  function hostname(value) {
    try {
      return new URL(value).hostname || "本地文件";
    } catch (_) {
      return "未知网页";
    }
  }

  function styleTypeForMode(mode) {
    return mode.startsWith("underline") ? "underline" : mode;
  }

  function modeForItem(item) {
    if (item.highlightColor) return "highlight";
    if (item.underlineColor) return item.underlineStyle === "wavy" ? "underline-wavy" : "underline-solid";
    return "bookmark";
  }

  function changesForMode(mode, source, exclusive = true) {
    const changes = exclusive ? {
      isBookmark: false,
      bookmarkColor: "",
      bookmarkThickness: 0,
      bookmarkOpacity: 100,
      highlightColor: "",
      highlightThickness: 0,
      highlightOpacity: 100,
      underlineColor: "",
      underlineThickness: 0,
      underlineOpacity: 100,
      underlineStyle: "solid"
    } : {};
    if (mode === "bookmark") return { ...changes, isBookmark: true, bookmarkColor: source.color, bookmarkThickness: source.thickness, bookmarkOpacity: source.opacity };
    if (mode === "highlight") return { ...changes, highlightColor: source.color, highlightThickness: source.thickness, highlightOpacity: source.opacity };
    return { ...changes, underlineColor: source.color, underlineThickness: source.thickness, underlineOpacity: source.opacity, underlineStyle: mode === "underline-wavy" ? "wavy" : "solid" };
  }

  function configFromItem(item, mode) {
    const type = styleTypeForMode(mode);
    const fallback = styles[type];
    if (type === "bookmark") return { color: item.bookmarkColor || fallback.color, thickness: item.bookmarkThickness || fallback.thickness, opacity: item.bookmarkOpacity ?? fallback.opacity };
    if (type === "highlight") return { color: item.highlightColor || fallback.color, thickness: item.highlightThickness || fallback.thickness, opacity: item.highlightOpacity ?? fallback.opacity };
    return { color: item.underlineColor || fallback.color, thickness: item.underlineThickness || fallback.thickness, opacity: item.underlineOpacity ?? fallback.opacity, lineStyle: mode === "underline-wavy" ? "wavy" : "solid" };
  }

  async function load() {
    const result = await chrome.storage.local.get([STORAGE_KEY, STYLE_KEY, LEGACY_STYLE_KEY]);
    records = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    styles = normalizeStyles(result[STYLE_KEY], result[LEGACY_STYLE_KEY]);
    renderStyleEditors();
    refresh();
  }

  async function saveStyles() {
    await chrome.storage.local.set({ [STYLE_KEY]: styles });
    renderStyleEditors();
  }

  async function saveRecords(nextRecords) {
    records = nextRecords;
    await chrome.storage.local.set({ [STORAGE_KEY]: records });
    refresh();
  }

  async function saveRecord(record) {
    await saveRecords([...records.filter((item) => item.id !== record.id), record]);
  }

  async function deleteRecord(id) {
    await saveRecords(records.filter((item) => item.id !== id));
  }

  async function deleteRecordWithFeedback(id, successMessage = "标记已删除") {
    try {
      await deleteRecord(id);
      showToast(successMessage);
      return true;
    } catch (error) {
      console.error("[本地网页标记] 删除失败", error);
      showToast("删除失败，请重新加载扩展后重试");
      return false;
    }
  }

  function isExcluded(node) {
    const parent = node.parentElement;
    if (!parent || host.contains(parent)) return true;
    if (parent.closest("script,style,noscript,textarea,input,select,option,[contenteditable=true]")) return true;
    return false;
  }

  function textMap() {
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeValue && !isExcluded(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    let text = "";
    let node;
    while ((node = walker.nextNode())) {
      const start = text.length;
      text += node.nodeValue;
      nodes.push({ node, start, end: text.length });
    }
    return { text, nodes };
  }

  function removeMarks() {
    document.querySelectorAll("mark[data-local-reader-mark]").forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent || ""));
    });
  }

  function commonSuffixLength(left, right, limit = 96) {
    const max = Math.min(left.length, right.length, limit);
    let length = 0;
    while (length < max && left[left.length - 1 - length] === right[right.length - 1 - length]) length += 1;
    return length;
  }

  function commonPrefixLength(left, right, limit = 96) {
    const max = Math.min(left.length, right.length, limit);
    let length = 0;
    while (length < max && left[length] === right[length]) length += 1;
    return length;
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function quotePositions(quote, fullText) {
    const matches = [];
    let from = 0;
    let index;
    while ((index = fullText.indexOf(quote, from)) !== -1) {
      matches.push({ start: index, end: index + quote.length });
      from = index + Math.max(1, quote.length);
    }
    if (matches.length || !/\s/.test(quote)) return matches;
    const flexiblePattern = quote.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
    if (!flexiblePattern) return matches;
    const regex = new RegExp(flexiblePattern, "gu");
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length });
      if (!match[0].length) regex.lastIndex += 1;
    }
    return matches;
  }

  function locate(item, fullText) {
    if (Number.isInteger(item.start) && fullText.slice(item.start, item.end) === item.quote) {
      return { start: item.start, end: item.end };
    }
    const positions = quotePositions(item.quote, fullText);
    if (positions.length === 1) return positions[0];
    let winner = null;
    let winnerScore = -1;
    let winnerDistance = Number.POSITIVE_INFINITY;
    positions.forEach((candidate) => {
      const position = candidate.start;
      const actualPrefix = fullText.slice(Math.max(0, position - (item.prefix || "").length), position);
      const actualSuffix = fullText.slice(candidate.end, candidate.end + (item.suffix || "").length);
      const prefixScore = commonSuffixLength(item.prefix || "", actualPrefix);
      const suffixScore = commonPrefixLength(item.suffix || "", actualSuffix);
      const score = prefixScore + suffixScore;
      const distance = Number.isInteger(item.start) ? Math.abs(position - item.start) : 0;
      if (score > winnerScore || (score === winnerScore && distance < winnerDistance)) {
        winner = position;
        winnerScore = score;
        winnerDistance = distance;
      }
    });
    if (winner === null) return null;
    return positions.find((candidate) => candidate.start === winner) || null;
  }

  function createNoteIndicator() {
    const indicator = document.createElement("span");
    indicator.dataset.localNoteIndicator = "";
    indicator.setAttribute("aria-hidden", "true");
    indicator.innerHTML = ICONS.note;
    indicator.style.setProperty("display", "inline-flex", "important");
    indicator.style.setProperty("align-items", "center", "important");
    indicator.style.setProperty("justify-content", "center", "important");
    indicator.style.setProperty("width", "1.05em", "important");
    indicator.style.setProperty("height", "1.05em", "important");
    indicator.style.setProperty("margin-left", "0.2em", "important");
    indicator.style.setProperty("vertical-align", "-0.14em", "important");
    indicator.style.setProperty("color", "#087f80", "important");
    indicator.style.setProperty("background", "rgba(85,191,192,.16)", "important");
    indicator.style.setProperty("border-radius", "4px", "important");
    indicator.style.setProperty("box-shadow", "0 0 0 1px rgba(8,127,128,.28)", "important");
    indicator.style.setProperty("pointer-events", "none", "important");
    const svg = indicator.querySelector("svg");
    if (svg) {
      svg.style.setProperty("width", "0.72em", "important");
      svg.style.setProperty("height", "0.72em", "important");
      svg.style.setProperty("stroke", "currentColor", "important");
    }
    return indicator;
  }

  function createMark(item, isFirstPiece, isLastPiece) {
    const mark = document.createElement("mark");
    mark.dataset.localReaderMark = item.id;
    if (item.note) mark.setAttribute("aria-label", `笔记：${item.note}`);
    else mark.setAttribute("aria-label", "已标记，悬浮或点击可编辑");
    mark.tabIndex = 0;
    mark.style.setProperty("color", "inherit", "important");
    mark.style.setProperty("background-color", "transparent", "important");
    mark.style.setProperty("padding", "0", "important");
    mark.style.setProperty("cursor", "pointer", "important");
    if (item.highlightColor) {
      const highlightColor = colorWithOpacity(item.highlightColor, item.highlightOpacity ?? 100);
      const isFullHighlight = (Number(item.highlightThickness) || DEFAULT_STYLES.highlight.thickness) >= STYLE_META.highlight.max;
      if (isFullHighlight) {
        mark.style.setProperty("padding-block", "min(0.16em, max(0px, (1lh - 1em) / 2 - 0.02em))", "important");
      }
      mark.style.setProperty("background-image", `linear-gradient(${highlightColor},${highlightColor})`, "important");
      mark.style.setProperty("background-repeat", "no-repeat", "important");
      mark.style.setProperty("background-position", "center", "important");
      mark.style.setProperty("background-size", `100% ${highlightBandSize(item.highlightThickness || DEFAULT_STYLES.highlight.thickness)}`, "important");
      mark.style.setProperty("box-decoration-break", "clone", "important");
      mark.style.setProperty("-webkit-box-decoration-break", "clone", "important");
    } else {
      mark.style.setProperty("background-image", "none", "important");
    }
    if (item.underlineColor) {
      mark.style.setProperty("text-decoration-line", "underline", "important");
      mark.style.setProperty("text-decoration-style", item.underlineStyle === "wavy" ? "wavy" : "solid", "important");
      mark.style.setProperty("text-decoration-color", colorWithOpacity(item.underlineColor, item.underlineOpacity ?? 100), "important");
      mark.style.setProperty("text-decoration-thickness", `${item.underlineThickness || DEFAULT_STYLES.underline.thickness}px`, "important");
      mark.style.setProperty("text-underline-offset", "0.16em", "important");
      mark.style.setProperty("text-decoration-skip-ink", "none", "important");
    }
    if (item.isBookmark && isFirstPiece) {
      const bookmarkColor = colorWithOpacity(item.bookmarkColor || DEFAULT_STYLES.bookmark.color, item.bookmarkOpacity ?? 100);
      mark.style.setProperty("border-left", `${item.bookmarkThickness || DEFAULT_STYLES.bookmark.thickness}px solid ${bookmarkColor}`, "important");
      mark.style.setProperty("padding-left", "0.16em", "important");
      mark.style.setProperty("border-radius", "2px", "important");
    }
    if (item.note && !item.underlineColor) mark.style.setProperty("box-shadow", "inset 0 -2px rgba(8,127,128,.55)", "important");
    if (item.note && isLastPiece) mark.dataset.hasNoteIndicator = "true";
    return mark;
  }

  function renderMarks() {
    ignoreMutationsUntil = Date.now() + 160;
    hideNoteTooltip();
    removeMarks();
    const map = textMap();
    const placed = [];
    pageRecords()
      .filter((item) => item.kind === "selection")
      .map((item) => ({ item, position: locate(item, map.text) }))
      .filter((entry) => entry.position)
      .sort((a, b) => b.position.start - a.position.start)
      .forEach(({ item, position }) => {
        if (placed.some((used) => position.start < used.end && position.end > used.start)) return;
        const pieces = map.nodes.filter((entry) => entry.end > position.start && entry.start < position.end).reverse();
        const firstEntry = pieces.reduce((first, entry) => !first || entry.start < first.start ? entry : first, null);
        const lastEntry = pieces.reduce((last, entry) => !last || entry.start > last.start ? entry : last, null);
        pieces.forEach((entry) => {
          const localStart = Math.max(0, position.start - entry.start);
          const localEnd = Math.min(entry.node.nodeValue.length, position.end - entry.start);
          let selected = entry.node;
          if (localEnd < selected.nodeValue.length) selected.splitText(localEnd);
          if (localStart > 0) selected = selected.splitText(localStart);
          const mark = createMark(item, entry === firstEntry, entry === lastEntry);
          selected.replaceWith(mark);
          mark.appendChild(selected);
          if (mark.dataset.hasNoteIndicator === "true") mark.appendChild(createNoteIndicator());
        });
        placed.push(position);
      });
  }

  function labelFor(item) {
    const labels = [];
    if (item.kind === "page") labels.push("网页");
    if (item.isBookmark) labels.push("书签");
    if (item.highlightColor) labels.push("重点");
    if (item.underlineColor) labels.push(item.underlineStyle === "wavy" ? "波浪线" : "下划线");
    if (item.note) labels.push("笔记");
    return labels;
  }

  function matchesFilter(item) {
    if (activeFilter === "all") return true;
    if (activeFilter === "bookmark") return item.kind === "page" || item.isBookmark;
    if (activeFilter === "highlight") return Boolean(item.highlightColor);
    if (activeFilter === "underline") return Boolean(item.underlineColor);
    if (activeFilter === "note") return Boolean(item.note);
    return true;
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
    } catch (_) {
      return "";
    }
  }

  function renderList() {
    const query = search.value.trim().toLowerCase();
    const baseRecords = panelView === "pages"
      ? records.filter((item) => item.kind === "page")
      : pageRecords().filter((item) => item.kind === "selection");
    const filtered = baseRecords
      .filter((item) => panelView === "pages" || matchesFilter(item))
      .filter((item) => !query || `${item.title} ${item.quote || ""} ${item.note || ""}`.toLowerCase().includes(query))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    list.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = query ? "没有找到匹配内容" : panelView === "pages" ? "还没有收藏网页。点击上方按钮即可收藏当前网页。" : "还没有标记。选中文字即可添加。";
      list.appendChild(empty);
      return;
    }
    filtered.forEach((item) => {
      const li = document.createElement("li");
      li.className = "item";
      const jump = document.createElement("button");
      jump.className = "jump";
      jump.type = "button";
      const badges = document.createElement("span");
      badges.className = "badges";
      labelFor(item).forEach((label) => {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = label;
        badges.appendChild(badge);
      });
      const quote = document.createElement("span");
      quote.className = "quote";
      quote.textContent = item.kind === "page" ? item.title : item.quote;
      jump.append(badges, quote);
      if (item.note) {
        const preview = document.createElement("span");
        preview.className = "note-preview";
        preview.textContent = item.note;
        jump.appendChild(preview);
      }
      if (item.kind === "page") {
        const site = document.createElement("span");
        site.className = "note-preview";
        site.textContent = hostname(item.url);
        jump.appendChild(site);
      }
      const date = document.createElement("span");
      date.className = "date";
      date.textContent = formatDate(item.updatedAt || item.createdAt);
      jump.appendChild(date);
      jump.addEventListener("click", () => {
        if (item.kind === "selection") jumpTo(item.id);
        else chrome.runtime.sendMessage({ type: "LOCAL_MARKS_OPEN_RECORD", record: item });
      });
      const remove = document.createElement("button");
      remove.className = "delete";
      remove.type = "button";
      remove.textContent = "删除";
      remove.addEventListener("click", async () => {
        await deleteRecordWithFeedback(item.id);
      });
      const itemActions = document.createElement("div");
      itemActions.className = "item-actions";
      if (item.kind === "selection") {
        const edit = document.createElement("button");
        edit.className = "edit-item";
        edit.type = "button";
        edit.textContent = "修改";
        edit.addEventListener("click", () => openEdit(item));
        itemActions.appendChild(edit);
      }
      itemActions.appendChild(remove);
      li.append(jump, itemActions);
      list.appendChild(li);
    });
  }

  function renderStyleEditor(container, type, config = styles[type], onChange = saveStyles, showLineStyle = true) {
    const meta = STYLE_META[type];
    container.replaceChildren();

    const title = document.createElement("div");
    title.className = "editor-title";
    const strong = document.createElement("strong");
    strong.textContent = `${meta.label}样式`;
    const hint = document.createElement("small");
    hint.textContent = "预设或精细调节";
    title.append(strong, hint);

    const colorRow = document.createElement("div");
    colorRow.className = "setting-row";
    const colorLabel = document.createElement("span");
    colorLabel.className = "setting-label";
    colorLabel.textContent = "颜色";
    const palette = document.createElement("div");
    palette.className = "palette";
    COLORS.forEach((color, index) => {
      const button = document.createElement("button");
      button.className = `swatch${config.color.toLowerCase() === color.toLowerCase() ? " selected" : ""}`;
      button.type = "button";
      button.style.setProperty("--swatch", color);
      button.setAttribute("aria-label", `常用颜色 ${index + 1}`);
      button.addEventListener("click", async () => {
        config.color = color;
        await onChange();
      });
      palette.appendChild(button);
    });
    const customColor = document.createElement("input");
    customColor.className = "custom-color";
    customColor.type = "color";
    customColor.value = config.color;
    customColor.setAttribute("aria-label", "自定义颜色");
    customColor.title = "自定义颜色";
    customColor.addEventListener("change", async () => {
      config.color = customColor.value;
      await onChange();
    });
    palette.appendChild(customColor);
    colorRow.append(colorLabel, palette);

    const thicknessRow = document.createElement("div");
    thicknessRow.className = "setting-row";
    const thicknessLabel = document.createElement("span");
    thicknessLabel.className = "setting-label";
    thicknessLabel.textContent = type === "bookmark" ? "边标" : "粗细";
    const controls = document.createElement("div");
    controls.className = "thickness-controls";
    const presets = document.createElement("div");
    presets.className = "presets";
    meta.presets.forEach(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.classList.toggle("selected", config.thickness === value);
      button.addEventListener("click", async () => {
        config.thickness = value;
        await onChange();
      });
      presets.appendChild(button);
    });
    const range = document.createElement("input");
    range.className = "thickness-range";
    range.type = "range";
    range.min = String(meta.min);
    range.max = String(meta.max);
    range.step = "1";
    range.value = String(config.thickness);
    range.setAttribute("aria-label", `${meta.label}粗细`);
    const output = document.createElement("output");
    output.className = "thickness-output";
    output.textContent = thicknessDescription(type, config.thickness);
    range.addEventListener("input", () => {
      config.thickness = Number(range.value);
      output.textContent = thicknessDescription(type, config.thickness);
      presets.querySelectorAll("button").forEach((button, index) => button.classList.toggle("selected", meta.presets[index][0] === config.thickness));
    });
    range.addEventListener("change", onChange);
    controls.append(presets, range, output);
    thicknessRow.append(thicknessLabel, controls);

    container.append(title, colorRow, thicknessRow);

    const opacityRow = document.createElement("div");
    opacityRow.className = "setting-row";
    const opacityLabel = document.createElement("span");
    opacityLabel.className = "setting-label";
    opacityLabel.textContent = "透明度";
    const opacityControls = document.createElement("div");
    opacityControls.className = "thickness-controls";
    const opacityPresets = document.createElement("div");
    opacityPresets.className = "presets";
    [[35, "淡"], [65, "中"], [100, "实"]].forEach(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.classList.toggle("selected", config.opacity === value);
      button.addEventListener("click", async () => {
        config.opacity = value;
        await onChange();
      });
      opacityPresets.appendChild(button);
    });
    const opacityRange = document.createElement("input");
    opacityRange.className = "thickness-range";
    opacityRange.type = "range";
    opacityRange.min = "10";
    opacityRange.max = "100";
    opacityRange.step = "1";
    opacityRange.value = String(config.opacity);
    opacityRange.setAttribute("aria-label", `${meta.label}透明度`);
    const opacityOutput = document.createElement("output");
    opacityOutput.className = "thickness-output";
    opacityOutput.textContent = `${config.opacity}%`;
    opacityRange.addEventListener("input", () => {
      config.opacity = Number(opacityRange.value);
      opacityOutput.textContent = `${config.opacity}%`;
      opacityPresets.querySelectorAll("button").forEach((button, index) => button.classList.toggle("selected", [35, 65, 100][index] === config.opacity));
    });
    opacityRange.addEventListener("change", onChange);
    opacityControls.append(opacityPresets, opacityRange, opacityOutput);
    opacityRow.append(opacityLabel, opacityControls);
    container.appendChild(opacityRow);

    if (type === "underline" && showLineStyle) {
      const lineRow = document.createElement("div");
      lineRow.className = "setting-row";
      const lineLabel = document.createElement("span");
      lineLabel.className = "setting-label";
      lineLabel.textContent = "线型";
      const lineStyles = document.createElement("div");
      lineStyles.className = "line-styles";
      [["solid", "直线"], ["wavy", "波浪线"]].forEach(([value, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.classList.toggle("selected", config.lineStyle === value);
        button.addEventListener("click", async () => {
          config.lineStyle = value;
          await onChange();
        });
        lineStyles.appendChild(button);
      });
      lineRow.append(lineLabel, lineStyles);
      container.appendChild(lineRow);
    }
  }

  async function applyToolbarStyle(mode, message = "已按新样式标注") {
    const type = styleTypeForMode(mode);
    if (type === "underline") styles.underline.lineStyle = mode === "underline-wavy" ? "wavy" : "solid";
    await saveStyles();
    if (pendingSelection) await applyPendingLive(changesForMode(mode, styles[type]), message);
  }

  function renderToolbarSettings(mode = toolbarSettingsMode) {
    settings.replaceChildren();
    const modes = document.createElement("div");
    modes.className = "mark-modes";
    [["bookmark", "书签"], ["highlight", "高亮"], ["underline-solid", "直线"], ["underline-wavy", "波浪"]].forEach(([value, label]) => {
      const button = document.createElement("button");
      button.className = `mark-mode${mode === value ? " active" : ""}`;
      button.type = "button";
      const icon = value === "bookmark" ? ICONS.bookmark : value === "highlight" ? ICONS.highlighter : value === "underline-wavy" ? ICONS.wave : ICONS.line;
      button.innerHTML = `${icon}<span>${label}</span>`;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", async () => {
        toolbarSettingsMode = value;
        if (value !== "bookmark") toolbarMarkMode = value;
        await applyToolbarStyle(value);
      });
      modes.appendChild(button);
    });
    settings.appendChild(modes);
    const editor = document.createElement("div");
    editor.className = "style-editor";
    settings.appendChild(editor);
    const type = styleTypeForMode(mode);
    renderStyleEditor(editor, type, styles[type], async () => applyToolbarStyle(mode), false);
  }

  function renderStyleEditors() {
    if (!settings.classList.contains("hidden")) renderToolbarSettings(toolbarSettingsMode);
    renderStyleEditor(panelStyleEditor, panelStyleType);
    panelStyleTabs.querySelectorAll("[data-panel-style]").forEach((button) => button.classList.toggle("active", button.dataset.panelStyle === panelStyleType));
  }

  function updatePageAction() {
    const saved = pageRecords().find((item) => item.kind === "page");
    pageAction.textContent = saved ? "取消收藏当前网页" : "＋ 收藏当前网页";
    pageAction.classList.toggle("saved", Boolean(saved));
    pageAction.classList.toggle("hidden", panelView !== "pages");
    filters.classList.toggle("hidden", panelView === "pages");
    search.placeholder = panelView === "pages" ? "搜索收藏的网页" : "搜索本页标记";
    panelViewTabs.querySelectorAll("[data-panel-view]").forEach((button) => button.classList.toggle("active", button.dataset.panelView === panelView));
  }

  function refresh() {
    const current = pageRecords().filter((item) => item.kind === "selection");
    count.textContent = current.length ? String(current.length) : "";
    count.setAttribute("aria-label", `本页标记数量：${current.length}`);
    updatePageAction();
    renderList();
    renderMarks();
  }

  function hideToolbar() {
    toolbar.classList.remove("visible");
    settings.classList.add("hidden");
  }

  function positionToolbar(expanded = false) {
    if (!pendingRect || matchMedia("(max-width:560px)").matches) return;
    const width = Math.min(expanded ? 520 : 480, innerWidth - 20);
    const left = Math.min(innerWidth - width / 2 - 10, Math.max(width / 2 + 10, pendingRect.left + pendingRect.width / 2));
    const placeAbove = pendingRect.top > (expanded ? 255 : 90);
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${placeAbove ? pendingRect.top - 10 : pendingRect.bottom + 10}px`;
    toolbar.style.transform = placeAbove ? "translate(-50%,-100%)" : "translate(-50%,0)";
  }

  function prepareSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return hideToolbar();
    const range = selection.getRangeAt(0);
    if (host.contains(range.commonAncestorContainer)) return hideToolbar();
    const quote = selection.toString().trim();
    if (!quote || quote.length > 2000) return hideToolbar();
    const map = textMap();
    const raw = selection.toString();
    const leading = raw.length - raw.trimStart().length;
    let start;
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const entry = map.nodes.find((candidate) => candidate.node === range.startContainer);
      if (!entry) return hideToolbar();
      start = entry.start + range.startOffset + leading;
    } else {
      const child = range.startContainer.childNodes[range.startOffset] || null;
      const entry = child
        ? map.nodes.find((candidate) => candidate.node === child || (child.contains && child.contains(candidate.node)))
        : [...map.nodes].reverse().find((candidate) => range.startContainer.contains(candidate.node));
      if (!entry) return hideToolbar();
      start = (child ? entry.start : entry.end) + leading;
    }
    const end = start + quote.length;
    pendingSelection = {
      id: makeId(),
      kind: "selection",
      url: pageUrl(),
      title: document.title || location.hostname,
      quote,
      prefix: map.text.slice(Math.max(0, start - 80), start),
      suffix: map.text.slice(end, end + 80),
      start,
      end,
      isBookmark: false,
      bookmarkColor: "",
      bookmarkThickness: 0,
      bookmarkOpacity: 100,
      highlightColor: "",
      highlightThickness: 0,
      highlightOpacity: 100,
      underlineColor: "",
      underlineThickness: 0,
      underlineOpacity: 100,
      underlineStyle: "solid",
      note: "",
      createdAt: now(),
      updatedAt: now()
    };
    const rect = range.getBoundingClientRect();
    pendingRect = { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width };
    positionToolbar(false);
    toolbar.classList.add("visible");
  }

  function overlaps(candidate, exactId) {
    return pageRecords().some((item) => item.kind === "selection" && item.id !== exactId && candidate.start < item.end && candidate.end > item.start);
  }

  async function applyPending(changes, message) {
    if (!pendingSelection) return;
    const exact = pageRecords().find((item) => item.kind === "selection" && item.start === pendingSelection.start && item.end === pendingSelection.end && item.quote === pendingSelection.quote);
    if (overlaps(pendingSelection, exact && exact.id)) {
      showToast("请避免与已有标记部分重叠");
      return;
    }
    const item = { ...(exact || pendingSelection), ...changes, updatedAt: now() };
    await saveRecord(item);
    window.getSelection()?.removeAllRanges();
    pendingSelection = null;
    pendingRect = null;
    hideToolbar();
    showToast(message);
  }

  async function applyPendingLive(changes, message) {
    if (!pendingSelection) return;
    const exact = pageRecords().find((item) => item.kind === "selection" && item.start === pendingSelection.start && item.end === pendingSelection.end && item.quote === pendingSelection.quote);
    if (overlaps(pendingSelection, exact && exact.id)) {
      showToast("请避免与已有标记部分重叠");
      return;
    }
    const item = { ...(exact || pendingSelection), ...changes, updatedAt: now() };
    pendingSelection = item;
    await saveRecord(item);
    toolbar.classList.add("visible");
    showToast(message);
  }

  function openNote(item) {
    editingId = item ? item.id : null;
    noteTitle.textContent = item && item.note ? "编辑笔记" : "添加笔记";
    noteQuote.textContent = item ? item.quote : pendingSelection?.quote || "";
    noteText.value = item?.note || "";
    overlay.classList.add("open");
    hideToolbar();
    noteText.focus();
  }

  function closeNote(clearPending) {
    overlay.classList.remove("open");
    editingId = null;
    if (clearPending) {
      pendingSelection = null;
      pendingRect = null;
      window.getSelection()?.removeAllRanges();
    }
  }

  function closeEdit() {
    editOverlay.classList.remove("open");
    styleEditingId = null;
    editConfig = null;
  }

  async function saveEditedStyle() {
    const item = records.find((record) => record.id === styleEditingId);
    if (!item || !editConfig) return;
    await saveRecord({ ...item, ...changesForMode(editMode, editConfig), updatedAt: now() });
    renderEditControls();
  }

  function renderEditControls() {
    const item = records.find((record) => record.id === styleEditingId);
    if (!item || !editConfig) return closeEdit();
    editModes.querySelectorAll("[data-edit-mode]").forEach((button) => button.classList.toggle("active", button.dataset.editMode === editMode));
    const type = styleTypeForMode(editMode);
    renderStyleEditor(editStyleEditor, type, editConfig, saveEditedStyle, false);
  }

  function openEdit(item) {
    if (!item || item.kind !== "selection") return;
    styleEditingId = item.id;
    editMode = modeForItem(item);
    editConfig = configFromItem(item, editMode);
    editOverlay.classList.add("open");
    quick.classList.remove("open");
    renderEditControls();
  }

  function jumpTo(id) {
    panel.classList.remove("open");
    let target = document.querySelector(`mark[data-local-reader-mark="${escapeSelector(id)}"]`);
    if (!target) {
      renderMarks();
      target = document.querySelector(`mark[data-local-reader-mark="${escapeSelector(id)}"]`);
    }
    if (!target) {
      showToast("网页内容已变化，暂时无法定位原文");
      return false;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const old = target.style.getPropertyValue("outline");
    target.style.setProperty("outline", "3px solid #087f80", "important");
    setTimeout(() => target.style.setProperty("outline", old || "none", "important"), 1500);
    return true;
  }

  function hideNoteTooltip() {
    noteTooltip.classList.remove("visible", "truncated");
    noteTooltip.setAttribute("aria-hidden", "true");
    noteTooltip.textContent = "";
  }

  function showNoteTooltip(mark, avoidQuick = false) {
    const item = records.find((record) => record.id === mark.dataset.localReaderMark);
    const note = item?.note?.trim();
    if (!note) return hideNoteTooltip();
    noteTooltip.textContent = note;
    noteTooltip.classList.add("visible");
    noteTooltip.setAttribute("aria-hidden", "false");
    noteTooltip.classList.toggle("truncated", noteTooltip.scrollHeight > noteTooltip.clientHeight + 1);
    const rect = mark.getBoundingClientRect();
    const tipRect = noteTooltip.getBoundingClientRect();
    const left = Math.min(innerWidth - tipRect.width - 12, Math.max(12, rect.left + rect.width / 2 - tipRect.width / 2));
    const quickTop = avoidQuick ? quick.getBoundingClientRect().top : rect.top;
    const below = rect.bottom + 8;
    const top = avoidQuick && below + tipRect.height + 12 <= innerHeight
      ? below
      : quickTop >= tipRect.height + 12
        ? quickTop - tipRect.height - 8
        : Math.min(innerHeight - tipRect.height - 12, below);
    noteTooltip.style.left = `${left}px`;
    noteTooltip.style.top = `${Math.max(12, top)}px`;
  }

  function cancelQuickHide() {
    clearTimeout(quickHideTimer);
    quickHideTimer = 0;
  }

  function scheduleQuickHide() {
    cancelQuickHide();
    quickHideTimer = setTimeout(() => {
      quick.classList.remove("open");
      quickId = null;
      hideNoteTooltip();
    }, 260);
  }

  function showQuick(mark, previewNote = false) {
    cancelQuickHide();
    quickId = mark.dataset.localReaderMark;
    const item = records.find((record) => record.id === quickId);
    if (!item) return;
    const rect = mark.getBoundingClientRect();
    quick.style.top = `${rect.top > 58 ? rect.top - 7 : rect.bottom + 7}px`;
    quick.style.transform = rect.top > 58 ? "translate(-50%,-100%)" : "translate(-50%,0)";
    quick.classList.add("open");
    const width = quick.getBoundingClientRect().width;
    const left = Math.min(innerWidth - width / 2 - 12, Math.max(width / 2 + 12, rect.left + rect.width / 2));
    quick.style.left = `${left}px`;
    if (previewNote) showNoteTooltip(mark, true);
    else hideNoteTooltip();
  }

  quick.addEventListener("mouseenter", cancelQuickHide);
  quick.addEventListener("mouseleave", scheduleQuickHide);

  launcher.addEventListener("click", () => panel.classList.toggle("open"));
  $("#close-panel").addEventListener("click", () => panel.classList.remove("open"));
  openStyleSettings.addEventListener("click", () => {
    const opening = panelStyleBox.classList.contains("hidden");
    panelStyleBox.classList.toggle("hidden", !opening);
    openStyleSettings.classList.toggle("active", opening);
    openStyleSettings.setAttribute("aria-expanded", String(opening));
    if (opening) renderStyleEditors();
  });
  panelStyleTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-panel-style]");
    if (!button) return;
    panelStyleType = button.dataset.panelStyle;
    renderStyleEditors();
  });
  panelViewTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-panel-view]");
    if (!button) return;
    panelView = button.dataset.panelView;
    search.value = "";
    updatePageAction();
    renderList();
  });
  pageAction.addEventListener("click", async () => {
    const saved = pageRecords().find((item) => item.kind === "page");
    if (saved) {
      await deleteRecordWithFeedback(saved.id, "已取消网页收藏");
    } else {
      await saveRecord({ id: makeId(), kind: "page", url: pageUrl(), title: document.title || location.hostname, createdAt: now(), updatedAt: now() });
      showToast("网页已收藏");
    }
  });
  $("#add-bookmark").addEventListener("mousedown", (event) => event.preventDefault());
  $("#add-bookmark").addEventListener("click", () => applyPending(changesForMode("bookmark", styles.bookmark), "已加入书签"));
  $("#add-mark").addEventListener("mousedown", (event) => event.preventDefault());
  $("#add-mark").addEventListener("click", () => applyPending(changesForMode(toolbarMarkMode, styles[styleTypeForMode(toolbarMarkMode)]), "标注已保存"));
  $("#all-options").addEventListener("mousedown", (event) => event.preventDefault());
  $("#all-options").addEventListener("click", () => {
    const isOpen = !settings.classList.contains("hidden");
    settings.classList.toggle("hidden", isOpen);
    if (!isOpen) renderToolbarSettings(toolbarSettingsMode);
    positionToolbar(!isOpen);
  });
  $("#add-note").addEventListener("mousedown", (event) => event.preventDefault());
  $("#add-note").addEventListener("click", () => pendingSelection && openNote(null));
  search.addEventListener("input", renderList);
  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    activeFilter = button.dataset.filter;
    filters.querySelectorAll("[data-filter]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    renderList();
  });
  $("#note-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const note = noteText.value.trim();
    if (!note) return showToast("请先填写笔记内容");
    if (editingId) {
      const item = records.find((record) => record.id === editingId);
      if (item) await saveRecord({ ...item, note, updatedAt: now() });
      closeNote(false);
      showToast("笔记已更新");
    } else {
      closeNote(false);
      await applyPending({ note }, "笔记已保存");
    }
  });
  $("#note-close").addEventListener("click", () => closeNote(true));
  $("#note-cancel").addEventListener("click", () => closeNote(true));
  $("#edit-close").addEventListener("click", closeEdit);
  editModes.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-edit-mode]");
    if (!button) return;
    const item = records.find((record) => record.id === styleEditingId);
    if (!item) return;
    editMode = button.dataset.editMode;
    editConfig = configFromItem(item, editMode);
    await saveEditedStyle();
  });
  $("#quick-edit").addEventListener("click", () => {
    const item = records.find((record) => record.id === quickId);
    if (item) openEdit(item);
  });
  $("#quick-note").addEventListener("click", () => {
    const item = records.find((record) => record.id === quickId);
    quick.classList.remove("open");
    if (item) openNote(item);
  });
  $("#quick-delete").addEventListener("click", async () => {
    const id = quickId;
    quick.classList.remove("open");
    if (id) await deleteRecordWithFeedback(id);
  });

  document.addEventListener("mouseup", (event) => {
    if (event.composedPath().includes(host)) return;
    setTimeout(prepareSelection, 0);
  });
  document.addEventListener("keyup", (event) => {
    if (event.key === "Shift" || event.key.startsWith("Arrow")) setTimeout(prepareSelection, 0);
  });
  document.addEventListener("mousedown", (event) => {
    if (event.composedPath().includes(host)) return;
    hideToolbar();
    pendingSelection = null;
    pendingRect = null;
    window.getSelection()?.removeAllRanges();
    if (!event.target.closest?.("mark[data-local-reader-mark]")) {
      quick.classList.remove("open");
      hideNoteTooltip();
    }
  });
  document.addEventListener("click", (event) => {
    const mark = event.target.closest?.("mark[data-local-reader-mark]");
    if (mark) showQuick(mark);
  });
  document.addEventListener("focusin", (event) => {
    const mark = event.target.closest?.("mark[data-local-reader-mark]");
    if (mark) showQuick(mark);
  });
  document.addEventListener("mouseover", (event) => {
    const mark = event.target.closest?.("mark[data-local-reader-mark]");
    if (mark && !window.getSelection()?.toString().trim()) showQuick(mark, true);
  });
  document.addEventListener("mouseout", (event) => {
    const mark = event.target.closest?.("mark[data-local-reader-mark]");
    if (!mark) return;
    const nextMark = event.relatedTarget?.closest?.("mark[data-local-reader-mark]");
    if (nextMark?.dataset.localReaderMark === mark.dataset.localReaderMark) return;
    scheduleQuickHide();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEY]) {
      records = changes[STORAGE_KEY].newValue || [];
      refresh();
    }
    if (changes[STYLE_KEY]) {
      styles = normalizeStyles(changes[STYLE_KEY].newValue || {});
      renderStyleEditors();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "LOCAL_MARKS_JUMP") {
      const ok = jumpTo(message.id);
      sendResponse({ ok });
      return true;
    }
    if (message?.type === "LOCAL_MARKS_OPEN_PANEL") {
      panel.classList.add("open");
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  const observer = new MutationObserver((mutations) => {
    if (Date.now() < ignoreMutationsUntil || !pageRecords().some((item) => item.kind === "selection")) return;
    const meaningful = mutations.some((mutation) => {
      const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
      return target && !host.contains(target) && !target.closest?.("mark[data-local-reader-mark]");
    });
    if (!meaningful) return;
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(renderMarks, 700);
  });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  setInterval(() => {
    const nextUrl = pageUrl();
    if (nextUrl !== currentUrl) {
      currentUrl = nextUrl;
      pendingSelection = null;
      pendingRect = null;
      hideToolbar();
      panel.classList.remove("open");
      refresh();
    }
  }, 1000);

  load();
})();
