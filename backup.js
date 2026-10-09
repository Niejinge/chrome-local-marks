"use strict";

const LocalMarksBackup = (() => {
  const Styles = typeof LocalMarksStyles !== "undefined" ? LocalMarksStyles : require("./mark-styles.js");
  const FORMAT = "local-reader-marks-backup";
  const VERSION = 1;
  const MAX_RECORDS = 30000;
  const COLOR = /^#[0-9a-f]{6}$/i;

  function string(value, max, fallback = "") {
    if (typeof value !== "string") return fallback;
    if (value.length > max) throw new Error("备份字段超过长度上限，未导入以避免内容丢失");
    return value;
  }

  function number(value, min, max, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  }

  function color(value) {
    return COLOR.test(value || "") ? value : "";
  }

  function validUrl(value) {
    try {
      return ["http:", "https:", "file:"].includes(new URL(value).protocol);
    } catch (_) {
      return false;
    }
  }

  function record(source, index) {
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error(`第 ${index + 1} 条记录格式不正确`);
    const id = string(source.id, 128);
    const url = string(source.url, 8192);
    const kind = source.kind;
    if (!id || !validUrl(url) || !["page", "selection"].includes(kind)) throw new Error(`第 ${index + 1} 条记录缺少有效的 ID、类型或网址`);
    const common = {
      id,
      kind,
      url,
      title: string(source.title, 1000, url),
      createdAt: string(source.createdAt, 64),
      updatedAt: string(source.updatedAt, 64)
    };
    if (kind === "page") return common;
    const quote = string(source.quote, 2000);
    const start = source.start;
    const end = source.end;
    if (!quote || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) {
      throw new Error(`第 ${index + 1} 条标记缺少有效的原文位置`);
    }
    return {
      ...common,
      quote,
      prefix: string(source.prefix, 200),
      suffix: string(source.suffix, 200),
      start,
      end,
      ...(Number.isFinite(source.viewportRatio) ? { viewportRatio: number(source.viewportRatio, .1, .8, .35) } : {}),
      isBookmark: source.isBookmark === true,
      bookmarkColor: color(source.bookmarkColor),
      bookmarkThickness: number(source.bookmarkThickness, 0, 10, 0),
      bookmarkOpacity: number(source.bookmarkOpacity, 10, 100, 100),
      highlightColor: color(source.highlightColor),
      highlightThickness: number(source.highlightThickness, 0, 30, 0),
      highlightOpacity: number(source.highlightOpacity, 10, 100, 100),
      underlineColor: color(source.underlineColor),
      underlineThickness: number(source.underlineThickness, 0, 8, 0),
      underlineOpacity: number(source.underlineOpacity, 10, 100, 100),
      underlineStyle: source.underlineStyle === "wavy" ? "wavy" : "solid",
      note: string(source.note, 10000)
    };
  }

  function style(source, max, legacyLineStyle = false) {
    if (!source || typeof source !== "object" || Array.isArray(source) || !color(source.color)) throw new Error("备份中的样式设置无效");
    return {
      color: source.color,
      thickness: number(source.thickness, 1, max, 1),
      opacity: number(source.opacity, 10, 100, 100),
      ...(legacyLineStyle ? { lineStyle: source.lineStyle === "wavy" ? "wavy" : "solid" } : {})
    };
  }

  function stylesFromLegacy(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    return Styles.migrate(null, source, false);
  }

  function parse(text) {
    let source;
    try {
      source = JSON.parse(text);
    } catch (_) {
      throw new Error("文件不是有效的 JSON");
    }
    if (!source || source.format !== FORMAT || source.schemaVersion !== VERSION || !Array.isArray(source.records)) {
      throw new Error("这不是兼容的本地网页标记备份文件");
    }
    if (source.records.length > MAX_RECORDS) throw new Error("记录数量超过导入上限");
    const records = source.records.map(record);
    const ids = new Set(records.map((item) => item.id));
    if (ids.size !== records.length) throw new Error("备份中存在重复的记录 ID");
    let styles = null;
    if (source.styles == null) styles = stylesFromLegacy(source.legacyStyles);
    else if (source.styleVersion === 3) {
      styles = {
        bookmark: style(source.styles.bookmark, 10),
        highlight: style(source.styles.highlight, 30),
        "underline-solid": style(source.styles["underline-solid"], 8),
        "underline-wavy": style(source.styles["underline-wavy"], 8)
      };
    } else {
      const previous = {
        bookmark: style(source.styles.bookmark, 10),
        highlight: style(source.styles.highlight, 30),
        underline: style(source.styles.underline, 8, true)
      };
      styles = Styles.migrate(previous, null, false);
    }
    return { records, styles };
  }

  function fingerprint(item) {
    return item.kind === "page"
      ? `page\n${item.url}`
      : `selection\n${item.url}\n${item.start}\n${item.end}\n${item.quote}`;
  }

  function merge(existing, incoming) {
    const records = Array.isArray(existing) ? [...existing] : [];
    const ids = new Set(records.map((item) => item.id));
    const fingerprints = new Set(records.map(fingerprint));
    let added = 0;
    for (const item of incoming) {
      const key = fingerprint(item);
      if (ids.has(item.id) || fingerprints.has(key)) continue;
      records.push(item);
      ids.add(item.id);
      fingerprints.add(key);
      added += 1;
    }
    return { records, added, skipped: incoming.length - added };
  }

  function create(records, styles, legacyStyles = null) {
    return JSON.stringify({ format: FORMAT, schemaVersion: VERSION, styleVersion: styles ? 3 : null, exportedAt: new Date().toISOString(), records, styles, legacyStyles: styles ? null : legacyStyles }, null, 2);
  }

  return { parse, merge, create };
})();

if (typeof module !== "undefined") module.exports = LocalMarksBackup;
