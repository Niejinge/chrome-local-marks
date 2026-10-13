(() => {
  "use strict";

  if (window.top !== window || document.getElementById("local-reader-marks-host")) return;

  const STORAGE_KEY = "readerMarksV1";
  const STYLE_KEY = "readerMarksStyleV3";
  const PREVIOUS_STYLE_KEY = "readerMarksStyleV2";
  const LEGACY_STYLE_KEY = "readerMarksStyleV1";
  const GROUPING_KEY = "readerMarksGroupingV1";
  const COLORS = ["#f2bd55", "#f59e0b", "#ef6a5b", "#df7e9a", "#a78bfa", "#6f91e8", "#55bfc0", "#65b883", "#7d8790"];
  const STYLE_META = LocalMarksStyles.meta;
  const DEFAULT_STYLES = LocalMarksStyles.defaults;
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
  host.style.setProperty("font-family", '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif', "important");
  host.style.setProperty("font-size", "13px", "important");
  host.style.setProperty("line-height", "1.4", "important");
  host.style.setProperty("letter-spacing", "normal", "important");
  host.style.setProperty("text-transform", "none", "important");
  host.style.setProperty("text-shadow", "none", "important");
  host.style.setProperty("color-scheme", "light dark", "important");
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
      .launcher{position:fixed;right:18px;top:76%;display:grid;place-items:center;width:44px;height:44px;padding:0;color:#087f80;background:#fff;border:1px solid #c8d5d9;border-radius:50%;box-shadow:0 8px 26px rgba(20,34,48,.22);cursor:grab;pointer-events:auto;touch-action:none;transition:transform .16s ease,box-shadow .16s ease}
      .launcher:hover,.launcher:focus-visible{outline:2px solid #55bfc0;outline-offset:2px;transform:translateY(-2px);box-shadow:0 11px 30px rgba(20,34,48,.28)}
      .launcher svg{width:20px;height:20px}.count{position:absolute;top:-5px;right:-5px;display:grid;place-items:center;min-width:18px;height:18px;padding:0 5px;color:#fff;background:#087f80;border:2px solid #fff;border-radius:99px;font-size:10px;font-weight:750}.count:empty{display:none}
      .toolbar{position:fixed;z-index:3;display:none;width:max-content;max-width:calc(100vw - 20px);padding:7px;color:#fff;background:#17212d;border:1px solid rgba(255,255,255,.08);border-radius:11px;box-shadow:0 12px 34px rgba(0,0,0,.3);pointer-events:auto}.toolbar.visible{display:block}.actions{display:flex;align-items:stretch;gap:6px}.toolbar button{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 11px;color:#fff;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.07);border-radius:7px;cursor:pointer;white-space:nowrap}.toolbar button:hover,.toolbar button:focus-visible{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.16);outline:none}.toolbar svg,.quick svg,.mark-mode svg,.panel-view-tab svg,.style-tab svg{width:16px;height:16px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.split{display:flex;overflow:hidden;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.07);border-radius:8px}.split .primary-action{border:0;border-radius:7px 0 0 7px}.split .options{width:29px;padding-inline:5px;border:0;border-left:1px solid rgba(255,255,255,.18);border-radius:0 7px 7px 0;background:transparent}.split .options svg{width:14px;height:14px}
      .style-editor{--editor-ink:#20303d;--editor-muted:#6c7a84;--editor-bg:#f4f7f7;--editor-line:#d7e0e2;display:grid;gap:10px;color:var(--editor-ink);font-size:12px}.settings{--editor-ink:#fff;--editor-muted:rgba(255,255,255,.68);--editor-bg:rgba(255,255,255,.09);--editor-line:rgba(255,255,255,.24);width:min(520px,calc(100vw - 32px));margin-top:7px;padding:11px;background:var(--editor-bg);border-radius:8px}.editor-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.editor-title strong{font-size:12px}.editor-title small{color:var(--editor-muted)}.setting-row{display:grid;grid-template-columns:48px minmax(0,1fr);align-items:center;gap:8px}.setting-label{color:var(--editor-muted)}.palette{display:flex;gap:6px;flex-wrap:wrap}.swatch{width:24px;height:24px;padding:0!important;background:var(--swatch)!important;border:2px solid transparent!important;border-radius:50%!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.16)}.swatch.selected{border-color:var(--editor-ink)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--editor-ink) 24%,transparent),inset 0 0 0 1px rgba(0,0,0,.15)}.custom-color{width:28px;height:26px;padding:1px;border:1px solid var(--editor-line);border-radius:6px;background:transparent;cursor:pointer}.thickness-controls{display:grid;grid-template-columns:auto minmax(90px,1fr) 46px;align-items:center;gap:8px}.presets,.line-styles{display:flex;gap:5px}.style-editor .presets button,.style-editor .line-styles button{min-width:37px;padding:5px 7px;color:var(--editor-ink);background:transparent;border:1px solid var(--editor-line);border-radius:6px}.style-editor .presets button.selected,.style-editor .line-styles button.selected{color:#fff;background:#087f80;border-color:#087f80}.thickness-range{width:100%;accent-color:#087f80}.thickness-output{color:var(--editor-muted);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}.style-tabs,.mark-modes{display:flex;gap:8px;margin-bottom:12px}.style-tab,.mark-mode{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;padding:8px 9px;color:#60707b;background:#fff;border:1px solid #d5dfe2;border-radius:8px;cursor:pointer}.style-tab.active,.mark-mode.active{color:#fff;background:#087f80;border-color:#087f80}.settings .mark-mode{color:rgba(255,255,255,.78);background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.16)}.settings .mark-mode.active{color:#fff;background:#087f80;border-color:#55bfc0}
      .panel{position:fixed;top:12px;right:12px;bottom:12px;z-index:4;width:min(390px,calc(100vw - 24px));display:flex;flex-direction:column;color:#182432;background:#fff;border:1px solid #d5dfe2;border-radius:14px;box-shadow:0 24px 70px rgba(17,31,44,.3);pointer-events:auto;transform:translateX(calc(100% + 30px));transition:transform .2s ease}.panel.open{transform:none}.panel-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 18px 13px;border-bottom:1px solid #e0e7e9}.panel-header h2{margin:0;font-size:20px}.panel-header p{margin:4px 0 0;color:#667581;font-size:12px;line-height:1.45}.panel-header-actions{display:flex;gap:3px}.icon-button{display:grid;place-items:center;width:32px;height:32px;padding:0;color:#61717d;background:transparent;border:0;border-radius:7px;cursor:pointer;font-size:19px}.icon-button:hover,.icon-button.active{background:#eef4f4;color:#087f80}.panel-style-box{margin:12px 16px 5px;padding:11px;background:#f7f9f9;border:1px solid #dce5e7;border-radius:10px}.panel-view-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:12px 16px 8px}.panel-view-tab{padding:8px;color:#65747f;background:#f4f7f7;border:1px solid transparent;border-radius:8px;cursor:pointer}.panel-view-tab.active{color:#087f80;background:#edf8f7;border-color:#9ed5d2;font-weight:650}.page-action{margin:4px 16px 8px;padding:10px 12px;color:#087f80;background:#edf8f7;border:1px solid #b9ddda;border-radius:8px;cursor:pointer;font-weight:650}.page-action.saved{color:#8a4e17;background:#fff4e8;border-color:#e8c49c}.tools{display:grid;gap:9px;padding:4px 16px 8px}.search{width:100%;padding:9px 10px;color:#182432;background:#fff;border:1px solid #cbd7db;border-radius:8px;outline:none}.search:focus{border-color:#55bfc0;box-shadow:0 0 0 3px rgba(85,191,192,.15)}.filters{display:flex;gap:6px;flex-wrap:wrap}.filter{padding:5px 9px;color:#65747f;background:#fff;border:1px solid #d5dfe2;border-radius:99px;cursor:pointer;font-size:12px}.filter.active{color:#fff;background:#087f80;border-color:#087f80}.list{flex:1;margin:0;padding:4px 16px 18px;overflow:auto;list-style:none}.item{display:grid;grid-template-columns:1fr auto;gap:7px 9px;padding:13px 0;border-bottom:1px solid #e5ebed}.jump{min-width:0;padding:0;text-align:left;color:#182432;background:transparent;border:0;cursor:pointer}.jump:hover .quote{color:#087f80}.badges{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:5px}.badge{padding:2px 6px;color:#65747f;background:#eef3f4;border-radius:99px;font-size:10px}.quote{display:-webkit-box;overflow:hidden;font-size:14px;font-weight:650;line-height:1.5;-webkit-box-orient:vertical;-webkit-line-clamp:3}.note-preview{display:-webkit-box;margin-top:5px;overflow:hidden;color:#687782;font-size:12px;line-height:1.45;-webkit-box-orient:vertical;-webkit-line-clamp:2}.date{display:block;margin-top:6px;color:#88959e;font-size:10px}.item-actions{display:flex;align-self:center;gap:2px}.edit-item,.delete{padding:6px 8px;color:#7a8790;background:transparent;border:0;border-radius:6px;cursor:pointer}.edit-item:hover{color:#087f80;background:#edf8f7}.delete:hover{color:#b13e3e;background:#fff0f0}.empty{padding:34px 6px;text-align:center;color:#75838d;font-size:13px}.overlay{position:fixed;inset:0;z-index:6;display:none;place-items:center;padding:18px;background:rgba(16,26,37,.38);pointer-events:auto}.overlay.open{display:grid}.dialog{width:min(520px,100%);padding:0;color:#182432;background:#fff;border:1px solid #d5dfe2;border-radius:13px;box-shadow:0 24px 70px rgba(17,31,44,.3)}.dialog-head{display:flex;align-items:flex-start;justify-content:space-between;padding:17px 18px 12px;border-bottom:1px solid #e0e7e9}.dialog-head h2{margin:0;font-size:19px}.dialog-body{padding:16px 18px 18px}.edit-body{padding:16px 18px 18px}.edit-hint{margin:11px 0 0;color:#687782;font-size:12px}.note-quote{max-height:100px;margin:0 0 12px;padding:9px 11px;overflow:auto;color:#687782;background:#f2f6f6;border-left:3px solid #55bfc0;font-size:12px;line-height:1.55}.note-text{width:100%;min-height:130px;padding:10px 11px;resize:vertical;color:#182432;background:#fff;border:1px solid #cbd7db;border-radius:8px;outline:none;line-height:1.55}.note-text:focus{border-color:#55bfc0;box-shadow:0 0 0 3px rgba(85,191,192,.15)}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:11px}.secondary,.primary{padding:8px 12px;border-radius:7px;cursor:pointer}.secondary{color:#65747f;background:#fff;border:1px solid #d5dfe2}.primary{color:#fff;background:#087f80;border:1px solid #087f80}.quick{position:fixed;z-index:5;display:none;gap:3px;padding:5px;color:#fff;background:#17212d;border-radius:7px;box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:auto}.quick.open{display:flex}.quick button{padding:6px 9px;color:#fff;background:transparent;border:0;border-radius:5px;cursor:pointer}.quick button:hover{background:rgba(255,255,255,.13)}.quick .danger:hover{color:#ffd2d2;background:rgba(190,62,62,.24)}.note-tooltip{position:fixed;z-index:7;display:none;width:max-content;max-width:min(340px,calc(100vw - 24px));padding:9px 18px 9px 11px;color:#f7fafb;background:#17212d;border:1px solid rgba(255,255,255,.11);border-radius:9px;box-shadow:0 12px 32px rgba(0,0,0,.3);font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:none}.note-tooltip.visible{display:block;max-height:calc(6.2em + 20px);overflow:hidden}.note-tooltip.truncated::after{content:"…";position:absolute;right:9px;bottom:8px;padding-left:18px;color:#f7fafb;background:linear-gradient(90deg,rgba(23,33,45,0),#17212d 42%)}.toast{position:fixed;right:18px;bottom:72px;z-index:8;padding:9px 12px;color:#fff;background:#17212d;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.24);font-size:12px;opacity:0;transform:translateY(7px);transition:.18s ease;pointer-events:none}.toast.visible{opacity:1;transform:none}
      .actions{gap:2px}.actions>.primary-action{background:transparent;border:0}.actions>.primary-action:hover{background:rgba(255,255,255,.1);border-color:transparent}.actions>.unified-options{width:38px;margin-left:3px;padding-inline:9px;color:#67d0d1;background:transparent;border:0;border-left:1px solid rgba(255,255,255,.14);border-radius:0 7px 7px 0}.actions>.unified-options:hover{color:#fff;background:rgba(85,191,192,.15)}.panel-view-tab{display:flex;align-items:center;justify-content:center;gap:7px}.quick{gap:6px;padding:6px;border:1px solid rgba(255,255,255,.08);border-radius:10px}.quick button{display:flex;align-items:center;gap:6px;padding:7px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);border-radius:7px}.quick button:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.14)}.quick .danger{color:#ffc9c9}.quick .danger:hover{color:#fff;background:rgba(190,62,62,.35)}
      :host{color:#182432;line-height:1.4;letter-spacing:normal;text-transform:none;text-shadow:none;-webkit-text-size-adjust:100%}
      .toolbar,.quick,.note-tooltip,.toast{color:#f7fafb;background:#17212d;border:1px solid #526170;box-shadow:0 12px 34px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.2)}
      .toolbar{max-height:calc(100vh - 20px);overflow:auto;overscroll-behavior:contain}
      .toolbar button,.quick button{color:#f7fafb;line-height:1.35;text-shadow:none}.toolbar button:focus-visible,.quick button:focus-visible,.style-editor button:focus-visible,.mark-mode:focus-visible{outline:2px solid #69d7d4;outline-offset:2px}
      .panel,.dialog{color:#182432;background:#fff;border-color:#aebfc4;box-shadow:0 24px 70px rgba(17,31,44,.38),0 0 0 1px rgba(255,255,255,.75)}
      .settings{color:#fff;background:#263442;border:1px solid #546574}.settings .style-editor{--editor-ink:#fff;--editor-muted:#d4e0e5;--editor-line:#879ba5}.settings .mark-mode{color:#f7fafb;background:#344554;border-color:#718590}
      .style-editor .swatch{position:relative;flex:none;border-color:rgba(10,24,34,.35)!important}.style-editor .swatch.selected{border-color:#fff!important;box-shadow:0 0 0 2px #087f80,0 0 0 4px #fff,inset 0 0 0 1px rgba(0,0,0,.25)}.settings .swatch.selected{box-shadow:0 0 0 2px #182d36,0 0 0 4px #fff,inset 0 0 0 1px rgba(0,0,0,.25)}
      .style-editor .presets button.selected,.style-editor .line-styles button.selected{color:#fff;background:#087f80;border-color:#6dd4d2;box-shadow:0 0 0 2px rgba(85,191,192,.26);font-weight:700}.thickness-range{cursor:pointer}
      .mark-submenu{display:flex;gap:5px;margin-top:6px;padding:6px;border-top:1px solid #526170}.mark-submenu button{flex:1}.mark-submenu button.active{color:#fff;background:#087f80;border-color:#6dd4d2}.toolbar .mark-submenu svg{width:15px;height:15px}
      .style-preview{padding:7px 9px;color:#20303d;background:#fff;border:1px solid #cbd7db;border-radius:7px;font-size:14px;line-height:1.6}.style-preview mark{font:inherit}
      .quick-mode-menu{position:absolute;top:calc(100% + 4px);left:0;display:grid;grid-template-columns:repeat(2,max-content);gap:4px;padding:6px;color:#fff;background:#17212d;border:1px solid #526170;border-radius:9px;box-shadow:0 10px 28px rgba(0,0,0,.4)}.quick-mode-menu.hidden{display:none!important}.quick-mode-menu button{justify-content:flex-start}

.grouping-control{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0;color:#52636f;font-size:12px}.grouping-control select{max-width:190px;padding:6px 8px;font:inherit;color:#20303d;background:#fff;border:1px solid #b8c8ce;border-radius:7px;cursor:pointer}
.record-group{margin:0 0 9px;border:1px solid #d5dfe2;border-radius:9px;overflow:hidden;background:#fff}.record-group summary{display:grid;grid-template-columns:12px minmax(0,1fr) auto;align-items:center;gap:3px 7px;padding:10px;list-style:none;color:#20303d;background:#eef5f5;cursor:pointer}.record-group summary::-webkit-details-marker{display:none}.record-group summary::before{content:"›";font-size:19px;line-height:1}.record-group details[open]>summary::before{transform:rotate(90deg)}.record-group summary:focus-visible{outline:2px solid #087f80;outline-offset:-3px}.group-title{grid-column:2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:650}.group-count{grid-column:3;color:#087f80;font-size:11px;white-space:nowrap}.group-url{grid-column:2/4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#65747f;font-size:10px}.group-records{margin:0;padding:0 10px;max-height:none;overflow:visible;list-style:none}.group-records>li:last-child{border-bottom:0}.record-page-title{display:block;margin-bottom:5px;color:#087f80;font-size:11px;line-height:1.4}
.clear-settings{margin-top:12px;padding-top:12px;border-top:1px solid #dce5e7}.clear-settings p{color:#77524e;font-size:12px;line-height:1.5}.danger-button,.backup-actions .danger-button{padding:7px 10px;color:#a93632;background:#fff5f3;border:1px solid #dfa8a3;border-radius:7px;cursor:pointer;font:inherit}.danger-button:hover,.backup-actions .danger-button:hover{background:#ffe5e0}button:disabled{opacity:.5;cursor:default}
      .panel-view-tabs{grid-template-columns:repeat(3,minmax(0,1fr))}.panel-view-tab{gap:4px;padding:8px 3px;font-size:12px}.grouping-control{margin:4px 16px 10px}.panel-style-box{flex:0 0 auto;max-height:52vh;overflow:auto}.list{min-height:0}.quick-mode-menu button.active{color:#fff;background:#087f80;border-color:#6dd4d2}
      @media(max-width:560px){.launcher{right:13px;bottom:13px}.toolbar{left:10px!important;right:10px!important;bottom:68px!important;top:auto!important;width:auto}.actions{display:flex}.actions>.primary-action{flex:1}.actions>.unified-options{flex:0 0 38px}.settings{width:auto}.setting-row{grid-template-columns:42px 1fr}.thickness-controls{grid-template-columns:1fr 34px}.presets{grid-column:1/-1}.panel{inset:8px;width:auto}.item{grid-template-columns:1fr}.delete{justify-self:end}}
      @media(prefers-reduced-motion:reduce){.launcher,.panel,.toast{transition:none}}
      .quick{display:flex;flex-wrap:wrap;max-width:min(340px,calc(100vw - 24px));opacity:0;visibility:hidden;pointer-events:none;translate:0 4px;transition:opacity 140ms ease,translate 140ms ease,visibility 140ms}
      .quick.open{opacity:1;visibility:visible;pointer-events:auto;translate:0 0}
      .quick-mode-menu,.mark-submenu{transition:opacity 140ms ease,translate 140ms ease,visibility 140ms;opacity:1;translate:0 0;visibility:visible}
      .quick-mode-menu.hidden{display:grid!important;opacity:0;visibility:hidden;pointer-events:none;translate:0 4px}
      .mark-submenu.hidden{display:flex!important;max-height:0;margin-top:0;padding-block:0;border-top:0;overflow:hidden;opacity:0;visibility:hidden;pointer-events:none;translate:0 4px}
      .quick-settings{--editor-ink:#f0f5f7;--editor-muted:#c4d0d6;--editor-line:#647885;width:min(320px,calc(100vw - 40px));flex-basis:100%;max-height:50vh;overflow:auto}.quick-settings.hidden{display:none}
      @media(prefers-reduced-motion:reduce){.quick,.quick-mode-menu,.mark-submenu{transition:none;translate:none}}
      .panel,.overlay{display:none!important}
      .launcher{right:0;top:76%;width:30px!important;min-width:30px;height:36px;padding:0!important;display:grid;place-items:center;overflow:hidden;border-radius:9px 0 0 9px}
      .launcher svg{display:block;width:18px;height:18px;margin:0;transform:translateX(3px)}
      .launcher.left{right:auto;left:0;border-radius:0 9px 9px 0}
      .launcher.left svg{transform:translateX(-3px)}
      .quick.open{display:flex;flex-wrap:wrap;max-width:min(340px,calc(100vw - 24px))}.quick-note-preview{flex-basis:100%;max-height:5.4em;overflow:hidden;white-space:pre-wrap;text-align:left!important;line-height:1.6;display:-webkit-box!important;-webkit-line-clamp:3;-webkit-box-orient:vertical}
      .quick-note-preview[hidden]{display:none!important}.quick.preview-only>button:not(.quick-note-preview),.quick.preview-only .quick-mode-menu{display:none!important}
      @media(prefers-color-scheme:dark){.launcher{color:#92ded7;background:#23292e;border-color:#647079}}
.quick:not(.preview-only).open>button{animation:quick-reveal 140ms ease}@keyframes quick-reveal{from{opacity:0}to{opacity:1}}
      @media(prefers-reduced-motion:reduce){.quick:not(.preview-only).open>button{animation:none}}
      @media(prefers-color-scheme:light){.quick-settings{--editor-ink:#26313a;--editor-muted:#61727c;--editor-line:#a8b9c1}.settings{background:#f3f6f7;color:#26313a;--editor-ink:#26313a;--editor-muted:#61727c;--editor-line:#a8b9c1}.quick,.toolbar,.mark-submenu,.quick-mode-menu{background:#fff;color:#202a32;border:1px solid #9caab3}.quick button,.toolbar button{color:#202a32;background:#f1f4f5;border-color:#ccd5da}.quick button:hover,.toolbar button:hover{background:#e1eeed}.quick .danger{color:#a33232}}
      .quick .quick-mode-menu button.active,.toolbar .mark-submenu button.active,.quick .presets button.selected{background:#087f80;color:#fff;border-color:#6dd4d2}
      .quick-settings{position:absolute;z-index:2;box-sizing:border-box;flex:none;padding:12px;background:#17212d;color:#f0f5f7;border:1px solid #647885;border-radius:10px;box-shadow:0 8px 26px #0003;overscroll-behavior:contain}
      .quick-settings .thickness-controls{grid-template-columns:minmax(0,1fr) 40px}.quick-settings .presets{grid-column:1/-1}.quick-settings .setting-row{grid-template-columns:40px minmax(0,1fr)}
      .quick-settings::before{content:"";position:absolute;inset:-8px;z-index:-1}
      .note-tooltip{display:block;width:300px;max-width:calc(100vw - 24px);padding:14px 16px;opacity:0;visibility:hidden;translate:0 4px;transition:opacity 140ms ease,translate 140ms ease,visibility 140ms;pointer-events:none;white-space:normal;color:#33434a;background:rgba(255,253,245,.70);backdrop-filter:blur(10px);border:1px solid #dcd6bf;border-left:3px solid #c7ac60;box-shadow:0 8px 28px #16202d24}
      .note-tooltip.visible{opacity:1;visibility:visible;translate:0 0;pointer-events:auto;max-height:min(340px,calc(100vh - 24px));overflow:auto}
      .note-card-heading{display:block;color:#8a723a;font-size:11px;letter-spacing:.06em;margin-bottom:8px}.note-card-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75;max-height:10.5em;overflow:auto;font-size:13px}.note-tooltip button{display:block;margin-top:10px;padding:0;color:#087f80;border:0;background:transparent;cursor:pointer;font:inherit;font-size:11px}
      @media(prefers-color-scheme:light){.quick-settings{background:#fff;color:#26313a;border-color:#a8b9c1}}
      @media(prefers-color-scheme:dark){.note-tooltip{background:rgba(43,44,40,.70);color:#e3e4d9;border-color:#65634e;border-left-color:#c7ac60}.note-card-heading{color:#d6c286}.note-tooltip button{color:#91d4cd}}
      @media(prefers-reduced-motion:reduce){.note-tooltip{transition:none;translate:none}}
      .note-tooltip{background:#fffdf5;backdrop-filter:none}
      @media(prefers-color-scheme:dark){.note-tooltip{background:#2b2c28}}
      /* Single top-level state: hover/focus feedback survives theme overrides. */
      .toolbar{overflow:visible}
      .toolbar>.mark-submenu,.toolbar>.settings{position:absolute;box-sizing:border-box;margin:0;width:360px;max-width:calc(100vw - 20px);overflow:auto;overscroll-behavior:contain;border-radius:10px;box-shadow:0 8px 26px #0003;padding:10px;background:#17212d;color:#f7fafb;border:1px solid #526170}
      .toolbar>.mark-submenu{width:max-content;max-width:calc(100vw - 20px)}
      .note-composer{display:grid;gap:7px;min-width:250px;padding:10px;background:#17212d;color:#f7fafb;border:1px solid #526170;border-radius:9px;box-shadow:0 8px 26px #0003}
      .note-composer textarea{width:100%;min-height:62px;resize:vertical;padding:8px;color:inherit;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.3);border-radius:7px;line-height:1.5}
      .note-composer small{color:rgba(255,255,255,.68)}
      .toolbar>.note-composer{position:absolute;left:0;top:calc(100% + 6px);width:min(320px,calc(100vw - 20px))}
      .toolbar .thickness-controls{grid-template-columns:minmax(0,1fr) 40px}.toolbar .presets{grid-column:1/-1}
      .toolbar .actions>button,.quick>button{transition:background-color 120ms ease,color 120ms ease,box-shadow 120ms ease}
      .toolbar .actions>button:hover,.toolbar .actions>button:focus-visible,.toolbar .actions>button[aria-expanded="true"],.quick>button:hover,.quick>button:focus-visible,.quick>button[aria-expanded="true"]{color:#a5f1e8;background:#31524f;box-shadow:inset 0 0 0 1px #689b94}
      .quick>button.danger:hover,.quick>button.danger:focus-visible{background:#633a3e;color:#ffe0de;box-shadow:inset 0 0 0 1px #b7777b}
      @media(prefers-color-scheme:light){.toolbar .actions>button:hover,.toolbar .actions>button:focus-visible,.toolbar .actions>button[aria-expanded="true"],.quick>button:hover,.quick>button:focus-visible,.quick>button[aria-expanded="true"]{color:#066764;background:#d9eeeb;box-shadow:inset 0 0 0 1px #88bdb5}.quick>button.danger:hover,.quick>button.danger:focus-visible{color:#a12d32;background:#fbe1e2;box-shadow:inset 0 0 0 1px #da9da2}}
      @media(prefers-color-scheme:light){.note-composer{background:#fff;color:#202a32;border-color:#9caab3}.note-composer textarea{color:#202a32;background:#f5f7f8;border-color:#a8b9c1}.note-composer small{color:#61727c}}
      @media(prefers-reduced-motion:reduce){.toolbar .actions>button,.quick>button{transition:none}}
    </style>
    <button class="launcher" id="launcher" type="button" aria-label="打开我的标记" title="我的标记">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21Z"/></svg>
    </button>
    <div class="toolbar" id="toolbar" role="toolbar" aria-label="文本标记工具">
      <div class="actions">
        <button class="primary-action" id="add-bookmark" type="button">${ICONS.bookmark}<span>书签</span></button>
        <button class="primary-action" id="add-mark" type="button">${ICONS.highlighter}<span>标注</span></button>
        <button class="primary-action" id="add-note" type="button">${ICONS.note}<span>笔记</span></button>
        <button class="unified-options" id="all-options" type="button" aria-label="标记样式设置" title="标记样式设置">${ICONS.sliders}</button>
      </div>
      <div class="mark-submenu hidden" id="mark-submenu" role="group" aria-label="选择标注类型"><button type="button" data-mark-mode="highlight">${ICONS.highlighter}<span>高亮</span></button><button type="button" data-mark-mode="underline-solid">${ICONS.line}<span>直线</span></button><button type="button" data-mark-mode="underline-wavy">${ICONS.wave}<span>波浪线</span></button></div>
      <div class="settings style-editor hidden" id="settings"></div>
      <div class="note-composer hidden" id="note-composer"><textarea id="note-composer-text" maxlength="10000" placeholder="写下笔记……"></textarea><div class="note-composer-footer"><small id="note-save-status" role="status">输入后自动保存</small><button id="note-delete" class="note-delete" type="button" aria-label="删除笔记">删除笔记</button></div></div>
    </div>
    <aside class="panel" id="panel" aria-label="当前网页标记">
      <div class="panel-header"><div><h2>我的标记</h2><p>按网页整理标记与收藏</p></div><div class="panel-header-actions"><button class="icon-button" id="open-style-settings" type="button" aria-label="详细设置" title="详细设置">⚙</button><button class="icon-button" id="close-panel" type="button" aria-label="关闭">×</button></div></div>
      <section class="panel-style-box hidden" id="panel-style-box"><div class="style-tabs" id="panel-style-tabs"><button class="style-tab" data-panel-style="bookmark">${ICONS.bookmark}<span>书签</span></button><button class="style-tab active" data-panel-style="highlight">${ICONS.highlighter}<span>高亮</span></button><button class="style-tab" data-panel-style="underline-solid">${ICONS.line}<span>直线</span></button><button class="style-tab" data-panel-style="underline-wavy">${ICONS.wave}<span>波浪线</span></button></div><div class="style-editor" id="panel-style-editor"></div><div class="clear-settings"><button class="danger-button" id="clear-all" type="button">清空所有标记</button><div class="hidden" id="clear-confirmation"><p id="clear-description"></p><div class="dialog-actions"><button class="secondary" id="clear-cancel" type="button">取消</button><button class="danger-button" id="clear-confirm" type="button">确认清空</button></div></div></div></section>
      <div class="panel-view-tabs" id="panel-view-tabs"><button class="panel-view-tab" data-panel-view="all" type="button">${ICONS.marks}<span>全部标记</span></button><button class="panel-view-tab active" data-panel-view="marks" type="button">${ICONS.marks}<span>本页标记</span></button><button class="panel-view-tab" data-panel-view="pages" type="button">${ICONS.page}<span>网页收藏</span></button></div>
      <button class="page-action hidden" id="page-action" type="button">收藏当前网页</button>
      <div class="tools"><input class="search" id="search" type="search" placeholder="搜索本页标记"><div class="filters" id="filters"><button class="filter active" data-filter="all">全部</button><button class="filter" data-filter="bookmark">书签</button><button class="filter" data-filter="mark">标注</button><button class="filter" data-filter="note">笔记</button></div></div>
      <label class="grouping-control hidden" id="grouping-control">分组方式<select id="grouping" aria-label="标记分组方式"><option value="page">按网页</option><option value="site">按网站</option><option value="none">按时间，不分组</option></select></label>
      <ul class="list" id="list"></ul>
    </aside>
    <div class="quick" id="quick"><button id="quick-edit" type="button" aria-haspopup="true" aria-expanded="false">${ICONS.edit}<span>修改</span></button><button id="quick-note" type="button">${ICONS.note}<span>笔记</span></button><button class="danger" id="quick-delete" type="button">${ICONS.trash}<span>删除</span></button><div class="quick-mode-menu hidden" id="quick-mode-menu" role="group" aria-label="选择修改类型"><button type="button" data-quick-mode="bookmark">${ICONS.bookmark}<span>书签</span></button><button type="button" data-quick-mode="highlight">${ICONS.highlighter}<span>高亮</span></button><button type="button" data-quick-mode="underline-solid">${ICONS.line}<span>直线</span></button><button type="button" data-quick-mode="underline-wavy">${ICONS.wave}<span>波浪线</span></button></div></div>
    <div class="note-tooltip" id="note-tooltip" role="region" aria-label="笔记预览" aria-hidden="true"></div>
    <div class="overlay" id="edit-overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title"><div class="dialog-head"><h2 id="edit-title">修改标记</h2><button class="icon-button" id="edit-close" type="button" aria-label="关闭">×</button></div><div class="edit-body"><div class="mark-modes" id="edit-modes"><button class="mark-mode" data-edit-mode="bookmark" type="button">${ICONS.bookmark}<span>书签</span></button><button class="mark-mode" data-edit-mode="highlight" type="button">${ICONS.highlighter}<span>高亮</span></button><button class="mark-mode" data-edit-mode="underline-solid" type="button">${ICONS.line}<span>直线</span></button><button class="mark-mode" data-edit-mode="underline-wavy" type="button">${ICONS.wave}<span>波浪</span></button></div><div class="style-editor" id="edit-style-editor"></div><p class="edit-hint">修改后即时保存并更新网页中的标记。</p></div></section></div>
    <div class="overlay" id="note-overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="note-title"><div class="dialog-head"><h2 id="note-title">添加笔记</h2><button class="icon-button" id="note-close" type="button" aria-label="关闭">×</button></div><form class="dialog-body" id="note-form"><blockquote class="note-quote" id="note-quote"></blockquote><textarea class="note-text" id="note-text" maxlength="10000" placeholder="写下理解、疑问或待复习内容……"></textarea><div class="dialog-actions"><button class="secondary" id="note-cancel" type="button">取消</button><button class="primary" type="submit">保存</button></div></form></section></div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  `;

  const visualStyle = document.createElement('style');
  visualStyle.textContent = LocalMarksUI.css + `
    :host{--ui-text:#26313a;--ui-muted:#70808c;--ui-border:#e3e9ec;--ui-soft:#f4f7f8;--ui-selected:#e8f5f3;--ui-accent:#087f80;--ui-surface:#fff}
    .toolbar,.quick,.toolbar>.settings,.toolbar>.mark-submenu,.quick-mode-menu,.quick-settings,.note-composer{color:var(--ui-text);background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:11px;box-shadow:0 5px 20px #182c3918}
    .toolbar,.quick{padding:5px;gap:2px}.quick{max-width:calc(100vw - 16px)!important;flex-wrap:nowrap!important}
    .toolbar .actions>button,.quick>button{padding:7px 9px;color:var(--ui-text);background:transparent;border:0;box-shadow:none;white-space:nowrap;font-size:13px;border-radius:7px}
    .toolbar .actions>button:hover,.toolbar .actions>button:focus-visible,.quick>button:hover,.quick>button:focus-visible{background:var(--ui-soft);color:var(--ui-text);box-shadow:none}
    .toolbar .actions>button[aria-expanded=true],.quick>button[aria-expanded=true]{background:var(--ui-selected);color:var(--ui-accent);box-shadow:none}
    .quick>button.danger{margin-left:3px;border-left:1px solid var(--ui-border);border-radius:0 7px 7px 0;color:var(--ui-muted)}.quick>button.danger:hover,.quick>button.danger:focus-visible{color:#b13e3e;background:#fff0ee;box-shadow:none}
    .quick-mode-menu,.toolbar>.mark-submenu{padding:5px;gap:3px}.quick-mode-menu button,.mark-submenu button{border:0;background:transparent;color:var(--ui-text);font-size:12px;padding:8px;border-radius:7px}.quick-mode-menu button.active,.mark-submenu button.active{color:var(--ui-accent)!important;background:var(--ui-selected)!important}
    .toolbar>.settings,.quick-settings{width:300px;padding:14px}.note-composer{padding:12px}.note-composer textarea{background:var(--ui-soft);color:var(--ui-text);border:1px solid var(--ui-border);border-radius:7px}.note-composer small{color:var(--ui-muted)}
    .bookmark-flag{padding:0;border:0;background:transparent;pointer-events:auto;cursor:pointer;border-radius:1px;z-index:0}.bookmark-flag svg{display:block;width:100%;height:100%;fill:currentColor;stroke:none}.bookmark-flag:focus-visible{outline:2px solid var(--ui-accent);outline-offset:3px}
    @media(prefers-color-scheme:dark){:host{--ui-text:#e5ebef;--ui-muted:#a8b5bf;--ui-border:#3b4851;--ui-soft:#2a333b;--ui-selected:#254641;--ui-accent:#8dd8cf;--ui-surface:#20272e}.quick>button.danger:hover,.quick>button.danger:focus-visible{color:#ffb9b2;background:#492d31}}
    @media(max-width:560px){.quick>button{padding:7px 6px;font-size:12px}.toolbar>.settings{max-width:calc(100vw - 24px)}}
  `;
  root.append(visualStyle);

  const $ = (selector) => root.querySelector(selector);
  const launcher = $("#launcher");
  const toolbar = $("#toolbar");
  const settings = $("#settings");
  const markSubmenu = $("#mark-submenu");
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
  const grouping = $("#grouping");
  const collapsedGroups = new Set();
  const clearConfirmation = $("#clear-confirmation");
  let clearSnapshot = [];
  const overlay = $("#note-overlay");
  const noteTitle = $("#note-title");
  const noteQuote = $("#note-quote");
  const noteText = $("#note-text");
  const noteComposer = $("#note-composer");
  const noteComposerText = $("#note-composer-text");
  const editOverlay = $("#edit-overlay");
  const editModes = $("#edit-modes");
  const editStyleEditor = $("#edit-style-editor");
  const quick = $("#quick");
  const quickModeMenu = $("#quick-mode-menu");
  const noteTooltip = $("#note-tooltip");
  const noteActionsTheme = document.createElement('style');
  noteActionsTheme.textContent = `.note-card-actions,.note-composer-footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.note-tooltip .note-card-actions button,.note-composer .note-delete{min-height:32px;margin:8px 0 0;padding:5px 7px;border:0;border-radius:6px;background:transparent;font:inherit;font-size:11px;cursor:pointer}.note-composer-footer small{flex:1}.note-tooltip .note-delete,.note-composer .note-delete{color:#b13e3e}.note-delete:hover{background:#fff0f0}.note-delete:disabled{opacity:.5;cursor:default}.note-tooltip button:focus-visible,.note-composer button:focus-visible{outline:2px solid var(--ui-accent,#087f80);outline-offset:2px}@media(prefers-color-scheme:dark){.note-tooltip .note-delete,.note-composer .note-delete{color:#ffb9b2}.note-delete:hover{background:#492d31}}`;
  root.appendChild(noteActionsTheme);
  const toast = $("#toast");

  let records = [];
  let pendingSelection = null;
  let noteComposerTarget = null;
  let noteComposerContainer = null;
  let noteComposerSaving = false;
  let deletingNoteId = null;
  let noteSaveTimer = 0;
  let noteComposing = false;
  let noteSaveQueue = Promise.resolve();
  let recordSaveQueue = Promise.resolve();
  const knownRecordIds = new Set();
  let pendingRect = null;
  let editingId = null;
  let styleEditingId = null;
  let editMode = "highlight";
  let editConfig = null;
  let quickId = null;
  const failedStyleEdits = new Map();
  let quickHideTimer = 0;
  let quickTransit = null, createTransit = null;
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
  let submenuTimer = 0;
  let toolbarPreviewBackup = null;

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
    toastTimer = setTimeout(() => {if(!toast.querySelector('.undo-action'))toast.classList.remove("visible")}, 1800);
  }

  function normalizeStyles(saved) {
    return LocalMarksStyles.normalize(saved);
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
    if (progress >= 1) return "100%";
    return `${(42 + progress * 58).toFixed(1)}%`;
  }

  function hostname(value) {
    try {
      return new URL(value).hostname || "本地文件";
    } catch (_) {
      return "未知网页";
    }
  }

  function styleTypeForMode(mode) {
    return mode;
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
    return { color: item.underlineColor || fallback.color, thickness: item.underlineThickness || fallback.thickness, opacity: item.underlineOpacity ?? fallback.opacity };
  }

  function configForModeChange(item, mode) {
    return mode === modeForItem(item) ? configFromItem(item, mode) : structuredClone(styles[mode]);
  }

  async function load() {
    const result = await chrome.storage.local.get([STORAGE_KEY, STYLE_KEY, PREVIOUS_STYLE_KEY, LEGACY_STYLE_KEY, GROUPING_KEY, "readerMarksAnnotationModeV1"]);
    toolbarMarkMode = LocalMarksStyles.annotationMode(result.readerMarksAnnotationModeV1);
    toolbarSettingsMode = toolbarMarkMode;
    records = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    records.forEach(item => knownRecordIds.add(item.id));
    styles = result[STYLE_KEY]
      ? normalizeStyles(result[STYLE_KEY])
      : LocalMarksStyles.migrate(result[PREVIOUS_STYLE_KEY], result[LEGACY_STYLE_KEY]);
    if (!result[STYLE_KEY]) {const saved=await LocalMarksData.mutate({op:'styles-init',styleDefaults:styles});if(saved.styles)styles=saved.styles;}
    grouping.value = ["page", "site", "none"].includes(result[GROUPING_KEY]) ? result[GROUPING_KEY] : "page";
    renderStyleEditors();
    refresh();
  }

  async function saveStyles(mode, config) {
    const result=await LocalMarksData.mutate({op:'styles',styleMode:mode,styleConfig:config});
    if(result.styles)styles=result.styles;
  }
  function acceptRecords(nextRecords){
    const before=JSON.stringify(pageRecords());
    records=nextRecords;
    if(before!==JSON.stringify(pageRecords()))refresh();else renderList();
  }
  async function saveRecord(record, patch = null, annotationMode = null) {
    const snapshot=structuredClone(record);
    const job=recordSaveQueue.catch(()=>{}).then(async()=>{
      const result=await LocalMarksData.mutate({op:'upsert',record:snapshot,patch:patch||snapshot,allowCreate:!knownRecordIds.has(snapshot.id),annotationMode});
      knownRecordIds.add(snapshot.id);acceptRecords(result.records);
    });recordSaveQueue=job;return job;
  }
  async function deleteRecord(id,undo=false) {
    const job=recordSaveQueue.catch(()=>{}).then(async()=>{
      const result=await LocalMarksData.mutate({op:'delete',ids:[id],undo});knownRecordIds.add(id);acceptRecords(result.records);return result;
    });recordSaveQueue=job;return job;
  }

  async function deleteRecordWithFeedback(id, successMessage = "标记已删除") {
    try {
      const result=await deleteRecord(id,true);
      showToast(successMessage);
      LocalMarksUI.offerUndo(toast,result,()=>{},error=>showToast(error.message));
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

  function normalizeMatchText(value) {
    return String(value || "").replace(/[\u200b\u00a0]/g, " ").replace(/\s+/g, "");
  }

  function boundaryOffset(container, offset, map, isEnd = false) {
    if (container?.nodeType === Node.TEXT_NODE) {
      const entry = map.nodes.find((candidate) => candidate.node === container);
      return entry ? entry.start + Math.min(container.nodeValue.length, Math.max(0, offset)) : null;
    }
    const children = [...(container?.childNodes || [])];
    const adjacent = children[isEnd ? offset - 1 : offset] || null;
    if (adjacent) {
      const entries = map.nodes.filter((candidate) => candidate.node === adjacent || adjacent.contains?.(candidate.node));
      if (entries.length) return isEnd ? entries[entries.length - 1].end : entries[0].start;
    }
    const descendants = map.nodes.filter((candidate) => container?.contains?.(candidate.node));
    if (!descendants.length) return null;
    return isEnd ? descendants[descendants.length - 1].end : descendants[0].start;
  }

  function locate(item, fullText) {
    if (Number.isInteger(item.start) && normalizeMatchText(fullText.slice(item.start, item.end)) === normalizeMatchText(item.quote)) {
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
    indicator.setAttribute("role", "button");
    indicator.setAttribute("tabindex", "0");
    indicator.setAttribute("aria-label", "查看笔记");
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
    indicator.style.setProperty("pointer-events", "auto", "important");
    indicator.style.setProperty("cursor", "pointer", "important");
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
      mark.style.setProperty("text-decoration-thickness", `${item.underlineThickness || DEFAULT_STYLES[item.underlineStyle === "wavy" ? "underline-wavy" : "underline-solid"].thickness}px`, "important");
      mark.style.setProperty("text-underline-offset", "0.16em", "important");
      mark.style.setProperty("text-decoration-skip-ink", "none", "important");
    }
    if (item.isBookmark && isFirstPiece) {
      mark.dataset.bookmarkFlag = 'true';
      mark.style.setProperty('--bookmark-color', colorWithOpacity(item.bookmarkColor || DEFAULT_STYLES.bookmark.color, item.bookmarkOpacity ?? 100));
      mark.style.setProperty('--bookmark-size', String(item.bookmarkThickness || DEFAULT_STYLES.bookmark.thickness));
    }
    if (item.note && !item.highlightColor && !item.underlineColor && !item.isBookmark) {
      // Notes use their own soft bubble treatment and never inherit a mark style.
      mark.style.setProperty("background-color", "rgba(85,191,192,.18)", "important");
      mark.style.setProperty("border-radius", "4px", "important");
      mark.style.setProperty("box-shadow", "0 0 0 1px rgba(8,127,128,.25)", "important");
      mark.style.setProperty("padding-inline", "0.12em", "important");
    }
    if (item.note && isLastPiece) mark.dataset.hasNoteIndicator = "true";
    return mark;
  }

  function previewMark(item) {
    const escaped = escapeSelector(item.id);
    const marks = [...document.querySelectorAll(`mark[data-local-reader-mark="${escaped}"]`)];
    if (!marks.length) {
      renderMarks();
      return;
    }
    marks.forEach((mark, index) => {
      const appearance = createMark(item, index === 0, index === marks.length - 1);
      mark.style.cssText = appearance.style.cssText;
      if(appearance.dataset.bookmarkFlag) mark.dataset.bookmarkFlag = 'true'; else delete mark.dataset.bookmarkFlag;
    });
    renderBookmarkFlags();
  }

  function previewToolbarStyle(mode, config = styles[mode]) {
    if (!pendingSelection) return;
    const existing = exactSelection(pendingSelection);
    if (overlaps(pendingSelection, existing?.id)) return;
    if (!toolbarPreviewBackup) toolbarPreviewBackup = { id: (existing || pendingSelection).id, original: existing ? { ...existing } : null };
    const item = { ...(existing || pendingSelection), ...changesForMode(mode, config) };
    pendingSelection = item;
    records = [...records.filter((record) => record.id !== item.id), item];
    previewMark(item);
  }

  function previewEditedStyle() {
    const item = records.find((record) => record.id === styleEditingId);
    if (item && editConfig) previewMark({ ...item, ...changesForMode(editMode, editConfig) });
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
    renderBookmarkFlags();
  }

  const flagLayer = document.createElement('div'); flagLayer.id = 'bookmark-flags'; root.append(flagLayer);
  let flagFrame = 0;
  function renderBookmarkFlags() {
    flagLayer.replaceChildren();
    document.querySelectorAll('mark[data-bookmark-flag]').forEach(mark => {
      const rect = mark.getClientRects()[0]; if(!rect || rect.bottom < 0 || rect.top > innerHeight) return;
      const size = LocalMarksUI.flagSize(mark.style.getPropertyValue('--bookmark-size'));
      const height = Math.min(size.height, Math.max(12, rect.height * .75)), width = Math.min(size.width, height * .55);
      const block = mark.closest('h1,h2,h3,h4,h5,h6,p,li,td,blockquote');
      const before = document.createRange(); if(block){before.selectNodeContents(block);before.setEndBefore(mark);}
      const inline = block && before.toString().trim().length > 0;
      const blockRect = block?.getBoundingClientRect(), lineHeight = parseFloat(getComputedStyle(block || mark).lineHeight);
      const aboveInline = inline && Number.isFinite(lineHeight) && lineHeight - rect.height >= height + 3;
      const left = inline && !aboveInline ? (blockRect?.left || rect.left) - width - 5 : inline ? rect.left : rect.left-width-5;
      const flag = document.createElement('button'); flag.type='button'; flag.className='bookmark-flag'; flag.setAttribute('aria-label','书签：'+mark.textContent); flag.title='书签';
      flag.style.cssText=`position:fixed;left:${Math.max(2,left)}px;top:${Math.max(2,aboveInline?rect.top-height-2:rect.top+Math.max(0,(rect.height-height)/2))}px;width:${width}px;height:${height}px;color:${mark.style.getPropertyValue('--bookmark-color')}`;
      flag.innerHTML='<svg viewBox="0 0 10 18" preserveAspectRatio="none" aria-hidden="true"><path d="M1 0h8a1 1 0 0 1 1 1v17l-5-4-5 4V1a1 1 0 0 1 1-1Z"/></svg>';
      flag.addEventListener('click',()=>showQuick(mark));flag.addEventListener('mouseenter',event=>beginHover(mark,false,event));flag.addEventListener('mouseleave',scheduleQuickHide); flagLayer.append(flag);
    });
  }
  function scheduleFlags(){cancelAnimationFrame(flagFrame);flagFrame=requestAnimationFrame(renderBookmarkFlags)}
  document.addEventListener('scroll',scheduleFlags,true); window.addEventListener('resize',scheduleFlags);

  function labelFor(item) {
    const labels = [];
    if (item.kind === "page") labels.push("网页");
    if (item.isBookmark) labels.push("书签");
    if (item.highlightColor || item.underlineColor) labels.push("标注");
    if (item.note) labels.push("笔记");
    return labels;
  }

  function matchesFilter(item) {
    if (activeFilter === "all") return true;
    if (activeFilter === "bookmark") return item.kind === "page" || item.isBookmark;
    if (activeFilter === "mark") return Boolean(item.highlightColor || item.underlineColor);
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
    const baseRecords = panelView === "all" ? records : panelView === "pages"
      ? records.filter((item) => item.kind === "page")
      : pageRecords().filter((item) => item.kind === "selection");
    const filtered = baseRecords
      .filter((item) => panelView === "pages" || matchesFilter(item))
      .filter((item) => !query || `${item.title || ""} ${item.quote || ""} ${item.note || ""} ${item.url || ""}`.toLowerCase().includes(query))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    list.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = query ? "没有找到匹配内容" : panelView === "pages" ? "还没有收藏网页。点击上方按钮即可收藏当前网页。" : "还没有标记。选中文字即可添加。";
      list.appendChild(empty);
      return;
    }
    const createItem = (item) => {
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
      if (panelView === "all" && grouping.value !== "page") {
        const pageTitle = document.createElement("span");
        pageTitle.className = "record-page-title";
        pageTitle.textContent = item.title || item.url;
        jump.appendChild(pageTitle);
      }
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
        if (item.kind === "selection" && LocalMarksGroups.normalizeUrl(item.url) === pageUrl()) jumpTo(item.id);
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
      if (item.kind === "selection" && LocalMarksGroups.normalizeUrl(item.url) === pageUrl()) {
        const edit = document.createElement("button");
        edit.className = "edit-item";
        edit.type = "button";
        edit.textContent = "修改";
        edit.addEventListener("click", () => openEdit(item));
        itemActions.appendChild(edit);
      }
      itemActions.appendChild(remove);
      li.append(jump, itemActions);
      return li;
    };
    LocalMarksGroups.render(list, filtered, panelView === "all" ? grouping.value : "none", createItem, collapsedGroups, Boolean(query));
  }

  function renderStyleEditor(container, type, config, onChange, onPreview = () => {}) {
    return LocalMarksUI.renderStyleEditor(container, type, config, async (next) => {
      Object.assign(config, next);
      await onChange(next);
    }, (next) => {
      Object.assign(config, next);
      onPreview(next);
    }, {onResize: () => { if(container === quickSettings) positionQuickSettings(); else positionToolbar(); }});
  }

  async function applyToolbarStyle(mode, config = styles[mode], target = pendingSelection) {
    await saveStyles(mode, config);
    if (target) await applyPendingLive(changesForMode(mode, config), '', target);
  }

  function renderToolbarSettings(mode = toolbarSettingsMode) {
    const config = {...styles[mode]}, target = pendingSelection ? {...pendingSelection} : null;
    renderStyleEditor(settings, mode, config, (next) => applyToolbarStyle(mode, next, target), (next) => previewToolbarStyle(mode, next));
  }

  function renderStyleEditors() {
    renderStyleEditor(panelStyleEditor, panelStyleType, {...styles[panelStyleType]}, (next) => saveStyles(panelStyleType, next));
    panelStyleTabs.querySelectorAll('[data-panel-style]').forEach(button => button.classList.toggle('active', button.dataset.panelStyle === panelStyleType));
  }

  function updatePageAction() {
    const saved = pageRecords().find((item) => item.kind === "page");
    pageAction.textContent = saved ? "取消收藏当前网页" : "＋ 收藏当前网页";
    pageAction.classList.toggle("saved", Boolean(saved));
    pageAction.classList.toggle("hidden", panelView !== "pages");
    filters.classList.toggle("hidden", panelView === "pages");
    search.placeholder = panelView === "all" ? "搜索全部网页、原文或笔记" : panelView === "pages" ? "搜索收藏的网页" : "搜索本页标记";
    $("#grouping-control").classList.toggle("hidden", panelView !== "all");
    panelViewTabs.querySelectorAll("[data-panel-view]").forEach((button) => button.classList.toggle("active", button.dataset.panelView === panelView));
  }

  function refresh() {
    updatePageAction();
    renderList();
    renderMarks();
    $("#clear-all").disabled = records.length === 0;
  }

  function hideToolbar() {
    if (toolbarPreviewBackup) {
      const { id, original } = toolbarPreviewBackup;
      records = original ? [...records.filter((record) => record.id !== id), original] : records.filter((record) => record.id !== id);
      toolbarPreviewBackup = null;
      if (original) previewMark(original);
      else renderMarks();
    }
    toolbar.classList.remove("visible");
    settings.classList.add("hidden");
    markSubmenu.classList.add("hidden");
    $("#add-mark").setAttribute("aria-expanded", "false");
    clearTimeout(submenuTimer);
    setCreateMenu(null);
  }

  function showMarkSubmenu() {
    toolbarSettingsMode = toolbarMarkMode;
    clearTimeout(submenuTimer);
    setCreateMenu("mark");
    markSubmenu.querySelectorAll("[data-mark-mode]").forEach((button) => {
      const active = button.dataset.markMode === toolbarMarkMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("#add-mark").setAttribute("aria-expanded", "true");
    positionToolbar(true);
    createTransit?.activate(markSubmenu, $("#add-mark"));
  }

  function setCreateMenu(kind) {
    createTransit?.cancel();
    if(kind !== 'settings') settings.lmEditor?.flush();
    clearTimeout(submenuTimer);
    for (const [name, menu, button] of [["mark",markSubmenu,$("#add-mark")],["settings",settings,$("#all-options")]]) {
      const open = kind === name;
      menu.classList.toggle("hidden", !open); menu.inert = !open;
      button.setAttribute("aria-expanded", String(open));
    }
  }
  function hideMarkSubmenu() { setCreateMenu(null); }
  function positionToolbar() {
    if (!pendingRect) return;
    if (!matchMedia("(max-width:560px)").matches) {
      const width = toolbar.offsetWidth, height = toolbar.offsetHeight;
      toolbar.style.left = `${Math.max(10,Math.min(innerWidth-width-10,pendingRect.left+pendingRect.width/2-width/2))}px`;
      toolbar.style.top = `${pendingRect.top >= height+10 ? pendingRect.top-height-10 : Math.min(innerHeight-height-10,pendingRect.bottom+10)}px`;
      toolbar.style.transform = "none";
    }
    const menu = !markSubmenu.classList.contains("hidden") ? markSubmenu : !settings.classList.contains("hidden") ? settings : null;
    if (!menu) return;
    const rect = toolbar.getBoundingClientRect();
    const below = innerHeight-rect.bottom-16, above = rect.top-16;
    const down = below >= Math.min(menu.scrollHeight,360) || below >= above;
    menu.style.top = down ? "calc(100% + 6px)" : "auto";
    menu.style.bottom = down ? "auto" : "calc(100% + 6px)";
    menu.style.maxHeight = `${Math.max(60,down?below:above)}px`;
    menu.style.left = `${Math.max(10-rect.left,Math.min(0,innerWidth-rect.left-menu.offsetWidth-10))}px`;
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
    const endBoundary = boundaryOffset(range.endContainer, range.endOffset, map, true);
    const end = Number.isInteger(endBoundary) ? Math.max(start, endBoundary) : start + quote.length;
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
    pendingSelection.viewportRatio = Math.max(.1, Math.min(.8, rect.top / innerHeight));
    pendingRect = { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width };
    toolbar.classList.add("visible");
    positionToolbar(false);
  }

  function exactSelection(candidate) {
    const text = textMap().text;
    const item = pageRecords().find((record) => {
      if (record.kind !== "selection") return false;
      const position = locate(record, text);
      return position && position.start === candidate.start && position.end === candidate.end && normalizeMatchText(record.quote) === normalizeMatchText(candidate.quote);
    });
    // Keep the record's identity and note, but refresh its anchor when it is edited.
    return item ? { ...item, start: candidate.start, end: candidate.end, quote: candidate.quote, prefix: candidate.prefix, suffix: candidate.suffix } : undefined;
  }

  function overlaps(candidate, exactId) {
    const text = textMap().text;
    return pageRecords().some((item) => {
      if (item.kind !== "selection" || item.id === exactId) return false;
      // Use the same current-page anchor as rendering, rather than saved offsets.
      const position = locate(item, text);
      return position && candidate.start < position.end && candidate.end > position.start;
    });
  }

  async function applyPending(changes, message) {
    if (!pendingSelection) return;
    const exact = exactSelection(pendingSelection);
    if (overlaps(pendingSelection, exact && exact.id)) {
      showToast("请避免与已有标记部分重叠");
      return;
    }
    const item = { ...(exact || pendingSelection), ...changes, updatedAt: now() };
    await saveRecord(item,{...changes,start:item.start,end:item.end,quote:item.quote,prefix:item.prefix,suffix:item.suffix},LocalMarksStyles.annotationModes.includes(modeForItem(changes))?modeForItem(changes):null);
    toolbarPreviewBackup = null;
    window.getSelection()?.removeAllRanges();
    pendingSelection = null;
    pendingRect = null;
    hideToolbar();
    showToast(message);
  }

  async function applyPendingLive(changes, message, target = pendingSelection) {
    if (!target) return;
    const exact = exactSelection(target);
    if (overlaps(target, exact && exact.id)) {
      showToast('请避免与已有标记部分重叠');
      throw Error('与已有标记部分重叠');
    }
    const item = { ...(exact || target), ...changes, updatedAt: now() };
    await saveRecord(item, {...changes, updatedAt:item.updatedAt});
    if (pendingSelection && pendingSelection.start === target.start && pendingSelection.end === target.end && pendingSelection.quote === target.quote) pendingSelection = item;
    if (toolbarPreviewBackup?.id === item.id) toolbarPreviewBackup = null;
    if (message) showToast(message);
  }

  function showNoteComposer(item, container) {
    cancelHover();
    cancelQuickHide();
    noteComposerTarget = item;
    noteComposerContainer = container;
    noteComposerText.value = item?.note || '';
    $('#note-save-status').textContent = '输入后自动保存';
    noteComposer.classList.remove("hidden");
    container.appendChild(noteComposer);
    if (container === quick) {
      quick.classList.add("open");
      positionQuick(document.querySelector(`mark[data-local-reader-mark="${escapeSelector(item.id)}"]`));
    } else {
      setCreateMenu(null);
      positionToolbar();
    }
    noteComposerText.focus({preventScroll:true});
  }

  function commitNoteComposer(close = true) {
    clearTimeout(noteSaveTimer);
    if (!noteComposerTarget || noteComposing || deletingNoteId === noteComposerTarget.id) return Promise.resolve(false);
    const target = {...noteComposerTarget}, note = noteComposerText.value;
    const isNew = !records.some(item => item.id === target.id) && !target.isBookmark && !target.highlightColor && !target.underlineColor;
    const job = noteSaveQueue.catch(() => {}).then(async () => {
      noteComposerSaving = true;
      try {
        const latest = records.find(item => item.id === target.id);
        if (!latest && !isNew) throw Error('标记已被删除');
        if (!latest && !note.trim()) return true;
        if (!latest && overlaps(target, target.id)) throw Error('选中文字与已有标记重叠');
        const updated = {...(latest || target), note, noteStyle:'bubble', updatedAt:now()};
        if (!note.trim() && !updated.isBookmark && !updated.highlightColor && !updated.underlineColor) await deleteRecord(updated.id);
        else await saveRecord(updated, {note, noteStyle:'bubble', updatedAt:updated.updatedAt});
        if (noteComposerTarget?.id === target.id) {
          noteComposerTarget = updated;
          if (pendingSelection?.id === target.id) pendingSelection = updated;
          $('#note-save-status').textContent = '已自动保存';
        }
        return true;
      } catch (error) {
        $('#note-save-status').textContent = '保存失败，请重试';
        showToast('笔记保存失败，请重试');
        return false;
      } finally { noteComposerSaving = false; }
    });
    noteSaveQueue = job;
    return job.then(ok => {
      if (ok && close && noteComposerTarget?.id === target.id) {
        noteComposer.classList.add('hidden'); noteComposerTarget = null; noteComposerContainer = null;
        pendingSelection = null; pendingRect = null; hideToolbar();
      }
      return ok;
    });
  }

  async function deleteNoteWithFeedback(id) {
    if (!id || deletingNoteId) return;
    deletingNoteId = id;
    clearTimeout(noteSaveTimer);
    cancelHover();
    const composerMatches = noteComposerTarget?.id === id;
    if (composerMatches) noteComposerText.disabled = true;
    const buttons = [...root.querySelectorAll('.note-delete')];
    buttons.forEach(button => button.disabled = true);
    try {
      // Finish already queued autosaves before deleting, then block blur/pagehide resaves.
      await noteSaveQueue.catch(() => {});
      const job = recordSaveQueue.catch(() => {}).then(async () => {
        const item = records.find(record => record.id === id);
        if (!item?.note?.trim()) return null;
        const result = await LocalMarksData.mutate({op:'note-delete',id});
        knownRecordIds.add(id);acceptRecords(result.records);return result;
      });
      recordSaveQueue = job;
      const result = await job;
      if (composerMatches && noteComposerTarget?.id === id) {
        noteComposerTarget = null;noteComposerContainer = null;
        noteComposerText.value = '';noteComposer.classList.add('hidden');
        pendingSelection = null;pendingRect = null;hideToolbar();
      }
      hideNoteTooltip();quick.classList.remove('open');
      showToast('笔记已删除');
      LocalMarksUI.offerUndo(toast,result,()=>{},error=>showToast(error.message));
    } catch (error) {
      showToast('笔记删除失败，请重试');
      if (composerMatches) $('#note-save-status').textContent = '删除失败，笔记已保留';
    } finally {
      deletingNoteId = null;noteComposerText.disabled = false;
      buttons.forEach(button => button.disabled = false);
    }
  }
  $('#note-delete').addEventListener('click',()=>deleteNoteWithFeedback(noteComposerTarget?.id));

  function openNote(item) {
    showNoteComposer(item || pendingSelection, item ? quick : toolbar);
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
    const item = records.find((record) => record.id === styleEditingId);
    if (item) previewMark(item);
    editOverlay.classList.remove("open");
    styleEditingId = null;
    editConfig = null;
  }

  async function saveEditedStyle(rememberMode = false) {
    const item = records.find((record) => record.id === styleEditingId);
    if (!item || !editConfig) return;
    await saveStyles(editMode, editConfig);
    const patch=changesForMode(editMode,editConfig);await saveRecord({...item,...patch,updatedAt:now()},patch,rememberMode===true&&LocalMarksStyles.annotationModes.includes(editMode)?editMode:null);
    renderEditControls();
  }

  function renderEditControls() {
    const item = records.find((record) => record.id === styleEditingId);
    if (!item || !editConfig) return closeEdit();
    editModes.querySelectorAll("[data-edit-mode]").forEach((button) => button.classList.toggle("active", button.dataset.editMode === editMode));
    const type = styleTypeForMode(editMode);
    renderStyleEditor(editStyleEditor, type, editConfig, saveEditedStyle, previewEditedStyle);
  }

  function openEdit(item, mode) {
    openSidePanel(item);
    quick.classList.remove("open");
    return;

    if (!item || item.kind !== "selection") return;
    styleEditingId = item.id;
    editMode = mode || modeForItem(item);
    editConfig = configFromItem(item, editMode);
    editOverlay.classList.add("open");
    quick.classList.remove("open");
    quickModeMenu.classList.add("hidden");
    renderEditControls();
  }

  function jumpTo(id) {
    readingAnchor = null;
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
    const ratio = records.find(item => item.id === id)?.viewportRatio;
    jumpAnchor = { id, ratio: Number.isFinite(ratio) ? Math.max(.1, Math.min(.8, ratio)) : .35 };
    alignJumpAnchor();
    const old = target.style.getPropertyValue("outline");
    target.style.setProperty("outline", "3px solid #087f80", "important");
    setTimeout(() => target.style.setProperty("outline", old || "none", "important"), 1500);
    return true;
  }

  let jumpAnchor = null;
  let jumpResizeTimer;
  function alignJumpAnchor() {
    if (!jumpAnchor) return;
    const target = document.querySelector(`mark[data-local-reader-mark="${escapeSelector(jumpAnchor.id)}"]`);
    if (!target) return;
    const desired = Math.max(64, Math.min(innerHeight - 80, innerHeight * jumpAnchor.ratio));
    // Scroll the nearest scrollable ancestors too (chat pages often do not scroll the window).
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (!/(auto|scroll)/.test(style.overflowY) || parent.scrollHeight <= parent.clientHeight) continue;
      parent.scrollBy({ top: target.getBoundingClientRect().top - desired, behavior: "instant" });
    }
    window.scrollBy({ top: target.getBoundingClientRect().top - desired, behavior: "instant" });
  }
  let readingAnchor = null;
  function captureReadingPosition() {
    readingAnchor = null;
    jumpAnchor = null;
    const x = Math.min(innerWidth - 24, innerWidth * .45), y = Math.max(64, innerHeight * .35);
    const point = document.caretRangeFromPoint?.(x, y);
    let element = document.elementFromPoint(x, y);
    if (element === host) element = null;
    const range = point?.startContainer.nodeType === Node.TEXT_NODE ? point.cloneRange() : null;
    if (range) {
      range.setEnd(range.startContainer, Math.min(range.startContainer.length, range.startOffset + 1));
      element = range.startContainer.parentElement;
    }
    const block = element?.closest('p,h1,h2,h3,h4,h5,h6,li,pre,blockquote') || element;
    const target = range?.getBoundingClientRect().height ? range : block;
    if (target && target !== document.body && target !== document.documentElement) readingAnchor = {target, element:element || block, top:target.getBoundingClientRect().top, expires:Date.now()+2500};
  }
  function alignReadingPosition() {
    if (!readingAnchor || Date.now() > readingAnchor.expires) {readingAnchor=null;alignJumpAnchor();return;}
    const {target,element,top}=readingAnchor;
    if(!element?.isConnected){readingAnchor=null;return;}
    for(let parent=element.parentElement;parent;parent=parent.parentElement){
      const style=getComputedStyle(parent);
      if(/(auto|scroll)/.test(style.overflowY)&&parent.scrollHeight>parent.clientHeight) parent.scrollBy({top:target.getBoundingClientRect().top-top,behavior:'instant'});
    }
    window.scrollBy({top:target.getBoundingClientRect().top-top,behavior:'instant'});
  }
  window.addEventListener("resize", () => {
    clearTimeout(jumpResizeTimer);
    jumpResizeTimer=setTimeout(alignReadingPosition,180);
  });
  for (const type of ["wheel", "touchstart"]) document.addEventListener(type, event => {
    if (!event.composedPath().includes(host)) {jumpAnchor = null;readingAnchor = null;}
  }, { passive: true });

  function hideNoteTooltip() {
    noteId = null;
    noteTooltip.classList.remove("visible", "truncated");
    noteTooltip.setAttribute("aria-hidden", "true");
  }

  let noteId = null;
  function showNoteTooltip(mark) {
    const item = records.find(record => record.id === mark.dataset.localReaderMark);
    if (!item?.note?.trim()) return;
    noteId = item.id;
    quick.classList.remove("open");
    noteTooltip.replaceChildren();
    const heading = document.createElement("strong"); heading.className = "note-card-heading"; heading.textContent = "笔记";
    const text = document.createElement("div"); text.className = "note-card-text"; text.textContent = item.note;
    const open = document.createElement("button"); open.textContent = "查看 / 编辑笔记"; open.type = "button";
    open.addEventListener("click", () => openSidePanel(records.find(record => record.id === noteId)));
    const remove = document.createElement("button");remove.className = "note-delete";
    remove.type = "button";remove.textContent = "删除笔记";remove.setAttribute("aria-label", "删除笔记");
    remove.addEventListener("click", () => deleteNoteWithFeedback(item.id));
    const actions = document.createElement("div");actions.className = "note-card-actions";actions.append(open,remove);
    noteTooltip.append(heading,text,actions);
    noteTooltip.classList.add("visible"); noteTooltip.setAttribute("aria-hidden", "false");
    const anchor = mark.querySelector("[data-local-note-indicator]") || mark;
    const rect = anchor.getBoundingClientRect();
    const width = noteTooltip.offsetWidth, height = noteTooltip.offsetHeight;
    noteTooltip.style.left = `${Math.max(8,Math.min(innerWidth-width-8,rect.left))}px`;
    noteTooltip.style.top = `${Math.max(8,Math.min(innerHeight-height-8,rect.bottom+8+height <= innerHeight ? rect.bottom+8 : rect.top-height-8))}px`;
  }

  function isNoteOnlyMark(mark) {
    const item = records.find(record => record.id === mark?.dataset.localReaderMark);
    return Boolean(item?.note && !item.highlightColor && !item.underlineColor && !item.isBookmark);
  }

  let noteHoverTimer, editHoverTimer, scrollHoverTimer;
  let hoverKey = null;
  let pointerPosition = null;
  document.addEventListener("mousemove", event => { pointerPosition = {x:event.clientX,y:event.clientY}; });
  function cancelHover() { clearTimeout(noteHoverTimer); clearTimeout(editHoverTimer); hoverKey = null; }
  function beginHover(mark, isNote = false, event) {
    if (event && quickTransit?.travelling(event)) return;
    isNote = isNote || isNoteOnlyMark(mark);
    cancelQuickHide();
    const key = `${mark.dataset.localReaderMark}:${isNote ? "note" : "edit"}`;
    if (hoverKey === key) return;
    cancelHover(); hoverKey = key;
    if (isNote) {
      quick.classList.remove("open");
      noteHoverTimer = setTimeout(() => { if (mark.isConnected) showNoteTooltip(mark); }, 300);
    } else {
      hideNoteTooltip();
      if (quickId === mark.dataset.localReaderMark && quick.classList.contains("open")) return;
      editHoverTimer = setTimeout(() => { if (mark.isConnected) showQuick(mark); }, 700);
    }
  }
  async function openSidePanel(item, draft) {
    captureReadingPosition();
    cancelHover(); quick.classList.remove("open"); hideNoteTooltip();
    try {
      const result = await chrome.runtime.sendMessage({ type: "LOCAL_MARKS_SIDE_PANEL", id: item?.id, draft });
      if (result?.ok === false) throw Error(result.error);
    } catch (_) { showToast("无法打开侧栏，请点击浏览器工具栏中的扩展图标"); }
  }
  let launcherPreference = {}, nativePanelOpen = false;
  function applyLauncherPreference(value = launcherPreference) {
    launcherPreference = value;
    launcher.style.display = value.hidden || nativePanelOpen ? "none" : "flex";
    launcher.classList.toggle("left", value.side === "left");
    const position = Number.isFinite(Number(value.position)) ? Math.min(.92, Math.max(.08, Number(value.position))) : .76;
    launcher.style.top = `${position * 100}%`;
    launcher.style.bottom = "auto";
  }
  chrome.storage.local.get("readerMarksEntryV1").then(data => applyLauncherPreference(data.readerMarksEntryV1));

  let launcherDrag = null;
  launcher.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    captureReadingPosition();
    try { launcher.setPointerCapture?.(event.pointerId); } catch (_) { /* synthetic or unavailable pointer capture */ }
    launcherDrag = { pointerId: event.pointerId, startY: event.clientY, moved: false };
    launcher.classList.add("dragging");
  });
  launcher.addEventListener("pointermove", event => {
    if (!launcherDrag || event.pointerId !== launcherDrag.pointerId) return;
    if (Math.abs(event.clientY - launcherDrag.startY) > 4) launcherDrag.moved = true;
    if (!launcherDrag.moved) return;
    const position = Math.min(.92, Math.max(.08, event.clientY / Math.max(1, innerHeight)));
    launcher.style.top = `${position * 100}%`;
    launcher.style.bottom = "auto";
  });
  launcher.addEventListener("pointerup", async event => {
    if (!launcherDrag || event.pointerId !== launcherDrag.pointerId) return;
    const moved = launcherDrag.moved;
    launcher.classList.remove("dragging");
    try { launcher.releasePointerCapture?.(event.pointerId); } catch (_) { /* pointer capture may already be released */ }
    if (moved) {
      const position = Math.min(.92, Math.max(.08, event.clientY / Math.max(1, innerHeight)));
      launcherPreference = { ...launcherPreference, position };
      await chrome.storage.local.set({ readerMarksEntryV1: launcherPreference });
      launcher.addEventListener("click", event => event.stopImmediatePropagation(), { once: true, capture: true });
    }
    launcherDrag = null;
  });

  chrome.runtime.sendMessage({type:"LOCAL_MARKS_PANEL_STATE"}).then(result => { nativePanelOpen = Boolean(result?.open); applyLauncherPreference(); }).catch(() => {});

  function cancelQuickHide() {
    quickTransit?.cancelClose();
    clearTimeout(quickHideTimer);
    quickHideTimer = 0;
  }

  function scheduleQuickHide() {
    cancelQuickHide();
    const close = () => {
      cancelHover();
      if (noteId || noteComposerTarget) return;
      setQuickMenu(null);
      quick.classList.remove("open");
      quickModeMenu.classList.add("hidden");
      $("#quick-edit").setAttribute("aria-expanded", "false");
      quickSettings.classList.add("hidden");
      quickSettingsButton.setAttribute("aria-expanded", "false");
      quickId = null;
      hideNoteTooltip();
    };
    if (quickTransit) quickTransit.leave(close); else quickHideTimer = setTimeout(close, 650);
  }

  function showQuick(mark, previewNote = false) {
    if (noteComposerTarget) return;
    if (isNoteOnlyMark(mark)) {
      showNoteTooltip(mark);
      return;
    }
    cancelQuickHide();
    quick.classList.remove("preview-only");
    if (!quick.classList.contains("open") || quickId !== mark.dataset.localReaderMark) setQuickMenu(null);
    if (quickId !== mark.dataset.localReaderMark) {
      quickModeMenu.classList.add("hidden");
      $("#quick-edit").setAttribute("aria-expanded", "false");
    }
    if (quickId !== mark.dataset.localReaderMark) quick.querySelector(".quick-settings")?.classList.add("hidden");
    quickId = mark.dataset.localReaderMark;
    const item = records.find((record) => record.id === quickId);
    if (!item) return;
    const currentMode = modeForItem(item);
    $('#quick-edit').innerHTML = LocalMarksUI.icon(currentMode) + '<span>' + LocalMarksUI.labels[currentMode] + ' ⌄</span>';
    quick.classList.add("open");
    positionQuick(mark);
    hideNoteTooltip();
  }

  function positionQuick(mark) {
    const rect = mark.getBoundingClientRect();
    const width = quick.offsetWidth, height = quick.offsetHeight;
    const above = rect.top >= height + 16;
    const top = above ? rect.top - height - 8 : rect.bottom + 8;
    quick.style.transform = "none";
    quick.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, top))}px`;
    quick.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
  }
  const quickSettingsButton = document.createElement("button");
  quickSettingsButton.type = 'button'; quickSettingsButton.innerHTML = LocalMarksUI.icon('settings') + '<span>样式</span>';
  quickSettingsButton.setAttribute("aria-expanded", "false");
  const quickSettings = document.createElement("div"); quickSettings.className = "quick-settings style-editor hidden";
  quick.insertBefore(quickSettingsButton, $('#quick-note')); quick.append(quickSettings);
  function showQuickSettings() {
    cancelHover(); cancelQuickHide();
    const item = records.find(record => record.id === quickId);
    if (!item) return;
    setQuickMenu("settings");
    const mode = modeForItem(item); const retained=failedStyleEdits.get(item.id); const config = retained?.mode===mode?{...retained.config}:configFromItem(item, mode);
    quickSettings.classList.remove("hidden"); quickSettingsButton.setAttribute("aria-expanded", "true");
    renderStyleEditor(quickSettings, mode, config, async (next) => {
      try {
        await saveStyles(mode, next);
        const latest = records.find(record => record.id === item.id);
        if (latest) { const patch = {...changesForMode(mode, next),updatedAt:now()}; await saveRecord({...latest,...patch},patch); }
        failedStyleEdits.delete(item.id);
      } catch (error) { failedStyleEdits.set(item.id,{mode,config:{...next}});showToast('保存失败，请重试'); throw error; }
    }, () => previewMark({...item,...changesForMode(mode, config)}));
    if(retained)quickSettings.lmEditor?.markFailed();
    positionQuickSettings();
    quickTransit?.activate(quickSettings, quickSettingsButton);
  }
  function positionQuickSettings() {
    const rect = quick.getBoundingClientRect(), width = quickSettings.offsetWidth;
    const mark = document.querySelector(`mark[data-local-reader-mark="${escapeSelector(quickId || '')}"]`);
    const selected = mark?.getBoundingClientRect();
    // When possible, use free space beside the selection instead of covering it.
    const sideLeft = Math.max(rect.right + 8, (selected?.right || rect.right) + 12);
    if(sideLeft + width + 10 <= innerWidth){
      quickSettings.style.left = `${sideLeft-rect.left}px`;quickSettings.style.top='0';quickSettings.style.bottom='auto';quickSettings.style.maxHeight=`${Math.max(60,innerHeight-rect.top-12)}px`;return;
    }
    const below = innerHeight - Math.max(rect.bottom,selected?.bottom || 0) - 16, above = rect.top - 12;
    const down = below >= Math.min(quickSettings.scrollHeight,320) || below >= above;
    quickSettings.style.maxHeight = `${Math.max(60,down?below:above)}px`;
    quickSettings.style.top = down ? `${Math.max(rect.bottom+6,(selected?.bottom || 0)+8)-rect.top}px` : 'auto';
    quickSettings.style.bottom = down ? 'auto' : 'calc(100% + 6px)';
    quickSettings.style.left = `${Math.max(8-rect.left,Math.min(0,innerWidth-rect.left-width-8))}px`;
  }
  noteTooltip.addEventListener("mouseenter", cancelQuickHide);
  noteTooltip.addEventListener("mouseleave", () => { noteId = null; scheduleQuickHide(); });
  quickTransit = LocalMarksUI.createHoverTransit(quick, [[quickSettings,quickSettingsButton],[quickModeMenu,$('#quick-edit')]], () => quick.classList.contains('open'));
  createTransit = LocalMarksUI.createHoverTransit(toolbar, [[settings,$('#all-options')],[markSubmenu,$('#add-mark')]], () => toolbar.classList.contains('visible'));
  quickSettingsButton.addEventListener("mouseenter", event => quickTransit.request(showQuickSettings,event,quickSettings));
  quickSettingsButton.addEventListener("focus", showQuickSettings);
  quickSettingsButton.addEventListener("click", showQuickSettings);
  quick.addEventListener("mouseenter", () => { cancelQuickHide(); });
  quick.addEventListener("mouseleave", () => { scheduleQuickHide(); });
  function setQuickMenu(kind) {
    quickTransit?.cancel();
    if(kind !== 'settings') quickSettings.lmEditor?.flush();
    for (const [name, menu, button] of [["mode",quickModeMenu,$("#quick-edit")],["settings",quickSettings,quickSettingsButton]]) {
      const open = kind === name;
      menu.classList.toggle("hidden", !open); menu.inert = !open;
      button.setAttribute("aria-expanded", String(open));
    }
  }
  for (const button of [$("#quick-note"),$("#quick-delete")]) {
    button.addEventListener("mouseenter", event => quickTransit.request(() => setQuickMenu(null),event));
    button.addEventListener("focus", () => setQuickMenu(null));
  }
  for (const button of [$("#add-bookmark"),$("#add-note")]) {
    button.addEventListener("mouseenter", event => createTransit.request(() => setCreateMenu(null),event));
    button.addEventListener("focus", () => setCreateMenu(null));
  }
  setCreateMenu(null); setQuickMenu(null);
  function showQuickModeMenu() {
    setQuickMenu("mode");
    $("#quick-edit").setAttribute("aria-expanded", "true");
    const item = records.find((record) => record.id === quickId);
    quickModeMenu.querySelectorAll("[data-quick-mode]").forEach((button) => {
      const selected = Boolean(item) && button.dataset.quickMode === modeForItem(item);
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const quickRect = quick.getBoundingClientRect();
    const menuRect = quickModeMenu.getBoundingClientRect();
    const above = quickRect.bottom + menuRect.height + 8 > innerHeight;
    quickModeMenu.style.top = above ? "auto" : "calc(100% + 4px)";
    quickModeMenu.style.bottom = above ? "calc(100% + 4px)" : "auto";
    const toLeft = quickRect.left + menuRect.width + 8 > innerWidth;
    quickModeMenu.style.left = toLeft ? "auto" : "0";
    quickModeMenu.style.right = toLeft ? "0" : "auto";
    quickTransit?.activate(quickModeMenu, $("#quick-edit"));
  }
  $("#quick-edit").addEventListener("mouseenter", event => quickTransit.request(showQuickModeMenu,event,quickModeMenu));
  $("#quick-edit").addEventListener("focus", showQuickModeMenu);
  quickModeMenu.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-quick-mode]");
    if (!button || button.disabled) return;
    const item = records.find((record) => record.id === quickId);
    if (!item) return;
    const mode = button.dataset.quickMode;
    const buttons = [...quickModeMenu.querySelectorAll("button")];
    buttons.forEach((candidate) => { candidate.disabled = true; });
    cancelQuickHide();
    try {
      const patch=changesForMode(mode,configForModeChange(item,mode));await saveRecord({...item,...patch,updatedAt:now()},patch,LocalMarksStyles.annotationModes.includes(mode)?mode:null);
      quick.classList.remove("open");
      quickModeMenu.classList.add("hidden");
      $("#quick-edit").setAttribute("aria-expanded", "false");
      showToast(`已切换为${button.textContent.trim()}`);
    } catch (error) {
      showToast("切换失败，请重试");
    } finally {
      buttons.forEach((candidate) => { candidate.disabled = false; });
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (noteComposerTarget) {
      commitNoteComposer().then(ok => { if(ok) quick.classList.remove('open'); });
    }
    else if (editOverlay.classList.contains("open")) closeEdit();
    else if (overlay.classList.contains("open")) closeNote(true);
    else if (!markSubmenu.classList.contains("hidden")) hideMarkSubmenu();
    else if (!quickModeMenu.classList.contains("hidden") || !quickSettings.classList.contains("hidden")) setQuickMenu(null);
    else if (!settings.classList.contains("hidden")) setCreateMenu(null);
    else if (quick.classList.contains("open")) quick.classList.remove("open");
    else if (toolbar.classList.contains("visible")) hideToolbar();
    else panel.classList.remove("open");
    event.preventDefault();
    event.stopPropagation();
  });

  launcher.addEventListener("click", () => openSidePanel());
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
  grouping.addEventListener("change", async () => {
    renderList();
    await chrome.storage.local.set({ [GROUPING_KEY]: grouping.value });
  });
  $("#clear-all").addEventListener("click", async () => {
    try {
      const current = await chrome.storage.local.get(STORAGE_KEY);
      clearSnapshot = (current[STORAGE_KEY] || []).map((item) => item.id);
      if (!clearSnapshot.length) return showToast("当前没有可清空的标记");
      $("#clear-description").textContent = `将清空所有网页的 ${clearSnapshot.length} 条记录，包含文字标记、笔记及网页收藏。此操作无法撤销。`;
      clearConfirmation.classList.remove("hidden");
      $("#clear-cancel").focus();
    } catch (error) {
      showToast("读取标记失败，请重试");
    }
  });
  $("#clear-cancel").addEventListener("click", () => {
    clearConfirmation.classList.add("hidden");
    clearSnapshot = [];
    $("#clear-all").focus();
  });
  $("#clear-confirm").addEventListener("click", async () => {
    if (!clearSnapshot.length) return;
    $("#clear-confirm").disabled = true;
    try {
      const current = await chrome.storage.local.get(STORAGE_KEY);
      const ids = new Set(clearSnapshot);
      const remaining = (current[STORAGE_KEY] || []).filter((item) => !ids.has(item.id));
      toolbarPreviewBackup = null;
      closeNote(true);
      closeEdit();
      hideToolbar();
      quick.classList.remove("open");
      quickId = null;
      const result=await LocalMarksData.mutate({op:'delete',ids:clearSnapshot});acceptRecords(result.records);
      clearConfirmation.classList.add("hidden");
      clearSnapshot = [];
      showToast(remaining.length ? "已清空确认范围内的标记，保留了新添加的记录" : "已清空所有标记");
    } catch (error) {
      showToast("清空失败，请重试");
    } finally {
      $("#clear-confirm").disabled = false;
    }
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
  $("#add-mark").setAttribute("aria-haspopup", "true");
  $("#add-mark").setAttribute("aria-expanded", "false");
  $('#add-bookmark').addEventListener('mouseenter', () => { toolbarSettingsMode = 'bookmark'; });
  $('#add-bookmark').addEventListener('focus', () => { toolbarSettingsMode = 'bookmark'; });
  $("#add-mark").addEventListener("mouseenter", event => createTransit.request(showMarkSubmenu,event,markSubmenu));
  $("#add-mark").addEventListener("focus", showMarkSubmenu);
  toolbar.addEventListener("mouseleave", () => {
    clearTimeout(submenuTimer);
    createTransit.leave(() => setCreateMenu(null));
  });
  toolbar.addEventListener("mouseenter", () => { clearTimeout(submenuTimer); createTransit.cancelClose(); });
  markSubmenu.addEventListener("mousedown", (event) => event.preventDefault());
  markSubmenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mark-mode]");
    if (!button) return;
    const mode = button.dataset.markMode;
    applyPending(changesForMode(mode, styles[styleTypeForMode(mode)]), "标注已保存");
  });
  $("#all-options").addEventListener("mousedown", (event) => event.preventDefault());
  function showToolbarSettings() {
    setCreateMenu("settings");
    renderToolbarSettings(toolbarSettingsMode);
    positionToolbar(true);
    createTransit?.activate(settings, $("#all-options"));
  }
  $("#all-options").addEventListener("click", showToolbarSettings);
  $("#all-options").addEventListener("mouseenter", event => createTransit.request(showToolbarSettings,event,settings));
  $("#all-options").addEventListener("focus", showToolbarSettings);
  $("#add-note").addEventListener("mousedown", (event) => event.preventDefault());
  $("#add-note").addEventListener("click", () => pendingSelection && openNote(null));
  function scheduleNoteSave() {
    clearTimeout(noteSaveTimer);
    if (noteComposing) return;
    noteSaveTimer = setTimeout(() => commitNoteComposer(false), 350);
  }
  noteComposerText.addEventListener('input', scheduleNoteSave);
  noteComposerText.addEventListener('compositionstart', () => { noteComposing = true; clearTimeout(noteSaveTimer); });
  noteComposerText.addEventListener('compositionend', () => { noteComposing = false; scheduleNoteSave(); });
  noteComposerText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !noteComposing) {
      event.preventDefault();
      commitNoteComposer();
    }
  });
  noteComposerText.addEventListener("blur", () => {
    // Clicking another toolbar control commits the current note before that control acts.
    setTimeout(() => { if (!noteComposer.contains(root.activeElement)) commitNoteComposer(); }, 0);
  });
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
      if (item) await saveRecord({ ...item, note, updatedAt: now() },{note});
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
    editConfig = configForModeChange(item, editMode);
    await saveEditedStyle(true);
  });
  $('#quick-edit').addEventListener('click', showQuickModeMenu);
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
  document.addEventListener("mousedown", async (event) => {
    if (event.composedPath().includes(host)) return;
    if (noteComposerTarget && !await commitNoteComposer()) return;
    cancelHover();
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
    if (mark && (event.target.closest?.("[data-local-note-indicator]") || isNoteOnlyMark(mark))) { cancelHover(); showNoteTooltip(mark); return; }
    if (mark) { cancelHover(); showQuick(mark);
      chrome.runtime.sendMessage({type:"LOCAL_MARKS_SELECT",id:mark.dataset.localReaderMark}).catch(() => {});
    }
  });
  document.addEventListener("focusin", (event) => {
    const mark = event.target.closest?.("mark[data-local-reader-mark]");
    if (mark) { cancelHover(); if (event.target.closest?.("[data-local-note-indicator]") || isNoteOnlyMark(mark)) showNoteTooltip(mark); else showQuick(mark); }
  });
  document.addEventListener("mouseover", (event) => {
    const mark = event.target.closest?.("mark[data-local-reader-mark]");
    if (mark && (isNoteOnlyMark(mark) || !window.getSelection()?.toString().trim())) beginHover(mark, Boolean(event.target.closest?.("[data-local-note-indicator]") || isNoteOnlyMark(mark)), event);
  });
  document.addEventListener("mouseout", (event) => {
    const mark = event.target.closest?.("mark[data-local-reader-mark]");
    if (!mark) return;
    const nextMark = event.relatedTarget?.closest?.("mark[data-local-reader-mark]");
    if (nextMark?.dataset.localReaderMark === mark.dataset.localReaderMark) return;
    noteId = null;
    scheduleQuickHide();
  });

  document.addEventListener("scroll", event => {
    if (event.composedPath().includes(host)) return;
    if (noteComposerTarget) return;
    cancelHover(); quick.classList.remove("open"); hideNoteTooltip();
    clearTimeout(scrollHoverTimer);
    scrollHoverTimer = setTimeout(() => {
      if (!pointerPosition || window.getSelection()?.toString().trim()) return;
      const mark = document.elementFromPoint(pointerPosition.x,pointerPosition.y)?.closest("mark[data-local-reader-mark]");
      if (mark) beginHover(mark);
    }, 150);
  }, true);
  document.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target.closest?.("[data-local-note-indicator]")) { event.preventDefault(); cancelHover(); showNoteTooltip(event.target.closest("mark[data-local-reader-mark]")); }
    if (event.key === "Escape") { cancelHover(); quick.classList.remove("open"); hideNoteTooltip(); hideToolbar(); } });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.readerMarksAnnotationModeV1) {
      toolbarMarkMode = LocalMarksStyles.annotationMode(changes.readerMarksAnnotationModeV1.newValue);
      toolbarSettingsMode = toolbarMarkMode;
    }
    if (changes.readerMarksEntryV1) applyLauncherPreference(changes.readerMarksEntryV1.newValue);
    if (changes[GROUPING_KEY]) {
      grouping.value = ["page", "site", "none"].includes(changes[GROUPING_KEY].newValue) ? changes[GROUPING_KEY].newValue : "page";
      renderList();
    }
    if (changes[STORAGE_KEY]) {
      const previousPage = JSON.stringify(pageRecords());
      const nextRecords = changes[STORAGE_KEY].newValue || [];
      nextRecords.forEach(item => knownRecordIds.add(item.id));
      const pendingRemoved = pendingSelection && records.some((item) => item.id === pendingSelection.id)
        && !nextRecords.some((item) => item.id === pendingSelection.id);
      records = nextRecords;
      if (pendingRemoved) {
        toolbarPreviewBackup = null;
        pendingSelection = null;
        pendingRect = null;
        hideToolbar();
      }
      if (styleEditingId && !records.some((item) => item.id === styleEditingId)) closeEdit();
      if (editingId && !records.some((item) => item.id === editingId)) closeNote(false);
      if (quickId && !records.some((item) => item.id === quickId)) {
        quick.classList.remove("open");
        quickModeMenu.classList.add("hidden");
        quickId = null;
      }
      if(previousPage!==JSON.stringify(pageRecords()))refresh();else renderList();
    }
    if (changes[STYLE_KEY]) {
      styles = normalizeStyles(changes[STYLE_KEY].newValue || {});
      renderStyleEditors();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "LOCAL_MARKS_PANEL_VISIBILITY") { nativePanelOpen = Boolean(message.open); applyLauncherPreference(); clearTimeout(jumpResizeTimer); jumpResizeTimer=setTimeout(alignReadingPosition,180); sendResponse({ok:true}); return false; }
    if (message?.type === 'LOCAL_MARKS_VALIDATE_SELECTION') {
      const position = locate(message.selection, textMap().text);
      if(!position){sendResponse({ok:false,error:'网页内容已变化，请重新选择原文'});return false;}
      const candidate = {...message.selection,...position}, exact = exactSelection(candidate);
      sendResponse({ok:!overlaps(candidate,exact?.id),position,error:'选中文字与已有标记部分重叠'});return false;
    }
    if (message?.type === "LOCAL_MARKS_PREVIEW") {
      const item = records.find(record => record.id === message.id);
      if (item) previewMark(message.record || item);
      sendResponse({ ok: Boolean(item) }); return false;
    }
    if (message?.type === "LOCAL_MARKS_JUMP") {
      const ok = jumpTo(message.id);
      sendResponse({ ok });
      return true;
    }
    if (message?.type === "LOCAL_MARKS_OPEN_PANEL") {
      openSidePanel();
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

  window.addEventListener('pagehide', () => {
    if(noteComposerTarget && deletingNoteId !== noteComposerTarget.id){
      chrome.runtime.sendMessage({type:'LOCAL_MARKS_FINAL_SAVE',record:{...noteComposerTarget},allowCreate:!knownRecordIds.has(noteComposerTarget.id),note:noteComposing?noteComposerTarget.note:noteComposerText.value}).catch(()=>{});
    }
    const createDirty=settings.lmEditor?.isDirty(),editDirty=quickSettings.lmEditor?.isDirty();
    const target=createDirty?pendingSelection:editDirty?records.find(item=>item.id===quickId):null;
    if(target){const mode=createDirty?toolbarSettingsMode:modeForItem(target),config=createDirty?settings.lmEditor.config:quickSettings.lmEditor.config;
      chrome.runtime.sendMessage({type:'LOCAL_MARKS_FINAL_SAVE',record:{...target},allowCreate:!knownRecordIds.has(target.id),stylePatch:changesForMode(mode,config),styleMode:mode,styleConfig:{...config}}).catch(()=>{});
    }
  });

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
