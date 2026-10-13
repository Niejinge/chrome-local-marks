"use strict";

const LocalMarksGroups = (() => {
  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      url.hash = "";
      return url.href;
    } catch (_) {
      return value || "";
    }
  }

  function compareCreated(a, b) {
    const timestamp = item => Date.parse(item.createdAt || item.updatedAt) || 0;
    return timestamp(b) - timestamp(a) || String(a.id || '').localeCompare(String(b.id || ''));
  }

  function groupRecords(records, mode = "page") {
    const groups = new Map();
    const sorted = [...records].sort(compareCreated);
    sorted.forEach((item) => {
      const url = normalizeUrl(item.url);
      let key = url;
      let title = item.title || url || "未知网页";
      let description = url;
      if (mode === "site") {
        try {
          const parsed = new URL(url);
          key = parsed.protocol === "file:" ? "file:" : parsed.origin;
          title = parsed.host || "本地文件";
          description = key === "file:" ? "本地文件中的标记" : key;
        } catch (_) { /* Keep malformed legacy URLs in their own page group. */ }
      }
      if (!groups.has(key)) groups.set(key, { key: `${mode}:${key}`, title, description, items: [] });
      groups.get(key).items.push(item);
    });
    return [...groups.values()];
  }

  function render(container, records, mode, createItem, collapsed, forceOpen = false) {
    container.replaceChildren();
    if (mode === "none") {
      [...records]
        .sort(compareCreated)
        .forEach((item) => container.appendChild(createItem(item)));
      return;
    }
    groupRecords(records, mode).forEach((group) => {
      const li = document.createElement("li");
      li.className = "record-group";
      const details = document.createElement("details");
      details.dataset.groupKey = group.key;
      details.open = forceOpen || !collapsed.has(group.key);
      const summary = document.createElement("summary");
      const title = document.createElement("span");
      title.className = "group-title";
      title.textContent = group.title;
      const count = document.createElement("span");
      count.className = "group-count";
      count.textContent = `${group.items.length} 条`;
      const address = document.createElement("span");
      address.className = "group-url";
      address.textContent = group.description;
      address.title = group.description;
      summary.append(title, count, address);
      const children = document.createElement("ul");
      children.className = "group-records";
      group.items.forEach((item) => children.appendChild(createItem(item)));
      details.append(summary, children);
      details.addEventListener("toggle", () => {
        if (!details.isConnected || forceOpen) return;
        if (details.open) collapsed.delete(group.key);
        else collapsed.add(group.key);
      });
      li.appendChild(details);
      container.appendChild(li);
    });
  }

  return { normalizeUrl, compareCreated, groupRecords, render };
})();

if (typeof module !== "undefined" && module.exports) module.exports = LocalMarksGroups;
