"use strict";

const LocalMarksStyles = (() => {
  const defaults = {
    bookmark: { color: "#ef6a5b", thickness: 4, opacity: 100 },
    highlight: { color: "#ef6a5b", thickness: 30, opacity: 100 },
    "underline-solid": { color: "#ef6a5b", thickness: 3, opacity: 100 },
    "underline-wavy": { color: "#ef6a5b", thickness: 3, opacity: 100 }
  };
  const meta = {
    bookmark: { label: "书签", min: 1, max: 10, presets: [[2, "细"], [4, "中"], [7, "粗"]] },
    highlight: { label: "高亮", min: 3, max: 30, presets: [[7, "细"], [15, "中"], [30, "粗"]] },
    "underline-solid": { label: "直线", min: 1, max: 8, presets: [[1, "细"], [3, "中"], [6, "粗"]] },
    "underline-wavy": { label: "波浪线", min: 1, max: 8, presets: [[1, "细"], [3, "中"], [6, "粗"]] }
  };
  function normalize(saved) {
    const result = structuredClone(defaults);
    Object.keys(defaults).forEach((mode) => {
      const source = saved?.[mode] || {};
      if (/^#[0-9a-f]{6}$/i.test(source.color || "")) result[mode].color = source.color;
      for (const [field, min, max] of [["thickness", meta[mode].min, meta[mode].max], ["opacity", 10, 100]]) {
        if (source[field] == null || source[field] === "") continue;
        const value = Number(source[field]);
        if (Number.isFinite(value)) result[mode][field] = Math.min(max, Math.max(min, value));
      }
    });
    return result;
  }
  function migrate(previous, legacy, resetThickness = true) {
    const source = {
      bookmark: previous?.bookmark,
      highlight: previous?.highlight || legacy
    };
    // V2 had only one line style: assign it only to the mode it actually described.
    if (previous?.underline) {
      source[previous.underline.lineStyle === "wavy" ? "underline-wavy" : "underline-solid"] = previous.underline;
    }
    const result = normalize(source);
    if (resetThickness) {
      for (const mode of ["highlight", "underline-solid", "underline-wavy"]) result[mode].thickness = defaults[mode].thickness;
    }
    return result;
  }
  const annotationModes = ["highlight", "underline-solid", "underline-wavy"];
  const annotationMode = value => annotationModes.includes(value) ? value : "highlight";
  return { defaults, meta, normalize, migrate, annotationModes, annotationMode };
})();

if (typeof module !== "undefined" && module.exports) module.exports = LocalMarksStyles;
