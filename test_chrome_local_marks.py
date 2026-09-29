import json
import pathlib
import unittest
from package_release import RELEASE_FILES


ROOT = pathlib.Path(__file__).parent


class ExtensionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        cls.content = (ROOT / "content.js").read_text(encoding="utf-8")
        cls.popup = (ROOT / "popup.js").read_text(encoding="utf-8")

    def test_manifest_v3_and_local_permissions(self):
        self.assertEqual(self.manifest["manifest_version"], 3)
        self.assertEqual(self.manifest["version"], "0.4.0")
        self.assertIn("storage", self.manifest["permissions"])
        self.assertNotIn("tabs", self.manifest["permissions"])
        self.assertNotIn("identity", self.manifest["permissions"])

    def test_no_remote_scripts_or_network_calls(self):
        combined = self.content + self.popup + (ROOT / "background.js").read_text(encoding="utf-8")
        self.assertNotIn("fetch(", combined)
        self.assertNotIn("XMLHttpRequest", combined)
        self.assertNotIn("https://", combined)

    def test_has_compact_bookmark_mark_note_toolbar(self):
        for token in ["add-bookmark", "add-mark", "all-options", "add-note", "page-action", "search", "open-style-settings"]:
            self.assertIn(token, self.content)
        self.assertNotIn('id="add-highlight"', self.content)
        self.assertNotIn('id="add-underline"', self.content)
        self.assertNotIn('id="mark-options"', self.content)
        self.assertNotIn("data-style-target", self.content)

    def test_unified_settings_include_every_mark_mode(self):
        self.assertIn('[["bookmark", "书签"], ["highlight", "高亮"], ["underline-solid", "直线"], ["underline-wavy", "波浪"]]', self.content)
        self.assertIn('$("#all-options").addEventListener', self.content)
        self.assertIn("ICONS.sliders", self.content)

    def test_all_menu_levels_have_consistent_icons(self):
        for token in ["const ICONS", "ICONS.bookmark", "ICONS.highlighter", "ICONS.note", "ICONS.edit", "ICONS.trash", "ICONS.wave", "ICONS.page"]:
            self.assertIn(token, self.content)
        self.assertIn(".quick svg,.mark-mode svg,.panel-view-tab svg,.style-tab svg", self.content)
        for color in ["#f2bd55", "#f59e0b", "#ef6a5b", "#df7e9a", "#a78bfa", "#6f91e8", "#55bfc0", "#65b883", "#7d8790"]:
            self.assertIn(color, self.content)
        for token in ["STYLE_META", "thickness-range", "text-decoration-style", "bookmarkThickness", "underlineThickness", "lineStyle"]:
            self.assertIn(token, self.content)

    def test_all_mark_styles_support_opacity(self):
        for token in ["bookmarkOpacity", "highlightOpacity", "underlineOpacity", "colorWithOpacity", 'opacityRange.min = "10"', 'opacityRange.max = "100"']:
            self.assertIn(token, self.content)

    def test_style_changes_apply_to_pending_selection_immediately(self):
        for token in ["applyPendingLive", "applyToolbarStyle", "已按新样式标注", "toolbar.classList.add(\"visible\")"]:
            self.assertIn(token, self.content)

    def test_existing_marks_have_edit_controls(self):
        for token in ["quick-edit", "edit-overlay", "edit-style-editor", "saveEditedStyle", "data-edit-mode"]:
            self.assertIn(token, self.content)

    def test_hover_opens_quick_actions_without_losing_note_preview(self):
        for token in [
            'document.addEventListener("mouseover"',
            'showQuick(mark, true)',
            'quick.addEventListener("mouseenter", cancelQuickHide)',
            'quick.addEventListener("mouseleave", scheduleQuickHide)',
            'if (previewNote) showNoteTooltip(mark, true)',
        ]:
            self.assertIn(token, self.content)

    def test_page_bookmarks_are_visible_across_pages(self):
        for token in ["panel-view-tabs", 'data-panel-view="pages"', 'records.filter((item) => item.kind === "page")', "LOCAL_MARKS_OPEN_RECORD"]:
            self.assertIn(token, self.content)

    def test_popup_can_filter_underlines(self):
        popup_html = (ROOT / "popup.html").read_text(encoding="utf-8")
        self.assertIn('data-filter="underline"', popup_html)
        self.assertIn('activeFilter === "underline"', self.popup)
        self.assertIn("item.underlineColor", self.popup)

    def test_legacy_style_settings_are_migrated(self):
        self.assertIn('readerMarksStyleV1', self.content)
        self.assertIn('readerMarksStyleV2', self.content)
        self.assertIn("normalizeStyles", self.content)
        self.assertIn("if (!saved?.highlight && legacy.color)", self.content)

    def test_storage_is_local_only(self):
        combined = self.content + self.popup
        self.assertIn("chrome.storage.local", combined)
        self.assertNotIn("chrome.storage.sync", combined)

    def test_backup_is_available_without_cloud_or_extra_permissions(self):
        popup_html = (ROOT / "popup.html").read_text(encoding="utf-8")
        for token in ['id="export-data"', 'id="import-data"', 'id="import-styles"', 'src="backup.js"']:
            self.assertIn(token, popup_html)
        for token in ["LocalMarksBackup.create", "LocalMarksBackup.parse", "LocalMarksBackup.merge"]:
            self.assertIn(token, self.popup)
        self.assertNotIn("downloads", self.manifest["permissions"])

    def test_shadow_dom_and_text_anchor_fallback(self):
        self.assertIn('attachShadow({ mode: "open" })', self.content)
        self.assertIn("item.prefix", self.content)
        self.assertIn("item.suffix", self.content)
        self.assertIn("MutationObserver", self.content)
        self.assertIn("range.startContainer.nodeType === Node.TEXT_NODE", self.content)
        self.assertIn("nextUrl !== currentUrl", self.content)

    def test_notes_have_visible_inline_indicator(self):
        for token in ["createNoteIndicator", "localNoteIndicator", "ICONS.note", "isLastPiece"]:
            self.assertIn(token, self.content)

    def test_highlight_uses_relative_line_safe_coverage(self):
        for token in ["thicknessDescription", "highlightBandSize", 'return "100%"', "padding-block", 'return "铺满"', "box-decoration-break"]:
            self.assertIn(token, self.content)
        self.assertNotIn('output.textContent = `${config.thickness}px`', self.content)

    def test_note_hover_preview_is_clamped(self):
        for token in ["note-tooltip", "showNoteTooltip", "hideNoteTooltip", "note-tooltip.truncated::after", "scrollHeight > noteTooltip.clientHeight", 'document.addEventListener("mouseover"', 'document.addEventListener("mouseout"']:
            self.assertIn(token, self.content)

    def test_duplicate_text_uses_fuzzy_context_and_position_fallback(self):
        for token in ["commonSuffixLength", "commonPrefixLength", "Math.abs(position - item.start)"]:
            self.assertIn(token, self.content)

    def test_collapsed_whitespace_can_match_source_markup(self):
        for token in ["quotePositions", "flexiblePattern", 'join("\\\\s+")', "match[0].length"]:
            self.assertIn(token, self.content)

    def test_restricted_pages_are_not_requested(self):
        matches = self.manifest["content_scripts"][0]["matches"]
        self.assertEqual(matches, ["http://*/*", "https://*/*", "file:///*"])

    def test_declared_icons_exist(self):
        for relative_path in self.manifest["icons"].values():
            self.assertTrue((ROOT / relative_path).exists(), relative_path)

    def test_release_contains_only_valid_runtime_files(self):
        for relative in RELEASE_FILES:
            path = ROOT / relative
            self.assertTrue(path.is_file(), str(path))
            self.assertTrue(all(not part.startswith("_") for part in path.relative_to(ROOT).parts), str(path))
            self.assertNotEqual(path.name, ".DS_Store", str(path))
        self.assertNotIn("test_chrome_local_marks.py", RELEASE_FILES)
        self.assertNotIn("README.md", RELEASE_FILES)

    def test_shadow_ui_clicks_are_not_closed_on_mousedown(self):
        self.assertIn('if (event.composedPath().includes(host)) return;', self.content)
        self.assertIn("deleteRecordWithFeedback", self.content)
        self.assertIn('console.error("[本地网页标记] 删除失败"', self.content)

    def test_extension_reload_error_is_handled_without_unhandled_rejection(self):
        for token in [
            'window.addEventListener("unhandledrejection"',
            "isInvalidatedContextError",
            "event.preventDefault()",
            "扩展已更新，请刷新网页后继续",
        ]:
            self.assertIn(token, self.content)


if __name__ == "__main__":
    unittest.main()
