import unittest
from fastapi.testclient import TestClient
from luna.app import app
from tests import page_source


class TestFrontendVaultUI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.response = cls.client.get("/")
        cls.source = page_source(cls.client)

    def test_index_renders_http_200(self):
        """GET / should render HTTP 200 with HTML content."""
        self.assertEqual(self.response.status_code, 200)
        self.assertIn("text/html", self.response.headers.get("content-type", ""))

    def test_provider_dropdown_markup_exists(self):
        """All three settings dropdowns are custom menus, not native selects."""
        html = self.source
        for element_id in (
            "llmProviderTrigger", "llmProviderMenu", "selectLlmProvider",
            "transcribeTrigger", "transcribeMenu", "selectTranscribeProvider",
            "openaiModelTrigger", "openaiModelMenu", "selectOpenaiModel", "openaiModelItems",
        ):
            self.assertIn(f'id="{element_id}"', html)
        self.assertIn("function setLlmProvider", html)
        self.assertIn("function syncLlmProviderUI", html)
        self.assertIn("function selectTranscribe", html)
        self.assertIn("function selectOpenaiModel", html)
        self.assertIn("function toggleMenu", html)

    def test_ui_files_are_versioned_and_the_guide_has_one_source(self):
        self.assertNotIn("{{ASSET_VERSION}}", self.response.text)
        self.assertRegex(self.response.text, r'/assets/ui/app\.js\?v=\d+')
        res = self.client.get("/guide", follow_redirects=False)
        self.assertEqual((res.status_code, res.headers["location"]), (307, "/#guide"))

    def test_job_confirmation_states_rights_and_privacy(self):
        html = self.response.text
        self.assertIn('id="wsModalUsageNotice"', html)
        self.assertIn("на которые у вас есть права", html)
        self.assertIn("в провайдеров, выбранных в Настройках", html)

    def test_failed_job_can_be_dismissed(self):
        """A failed job must keep a working close control and a calm badge."""
        html = self.source
        self.assertIn("setCancelButtonVisible(true, 'Закрыть')", html)
        self.assertNotIn('Failed <span class="animate-spin', html)
        self.assertIn("Скачивание прервалось", html)

    def test_ratio_labels_cover_every_supported_ratio(self):
        """Video card ratio badges stay minimal: numeric ratios only, zero icons or orientation words."""
        source = self.source
        for label in ("'16:9'", "'9:16'", "'3:4'", "'4:5'", "'4:3'", "'1:1'"):
            self.assertIn(label, source)
        self.assertIn("renderRatioBadgeHtml", source)
        self.assertIn("formatCompactRatio", source)
        self.assertIn("filterCountSquare", source)
        self.assertIn("ratioMetaFromSize", source)

        # Badge helper & VAULT_RATIOS render text-only ratio pill (no lucide icon, no Landscape/Portrait/Square words)
        ratios_block = source.split("const VAULT_RATIOS = [")[1].split("];")[0]
        badge_block = source.split("function renderRatioBadgeHtml(label)")[1].split("function ratioAspectClass")[0]
        self.assertNotIn("data-lucide", badge_block)
        self.assertIn("ratio-text", badge_block)
        for word in ("Landscape", "Portrait", "Square"):
            self.assertNotIn(word, ratios_block)

        # Applied on Studio cards and Media Vault Grid cards; Node Canvas AI Clipper omits the badge
        for section_fn in (
            ("function renderOpusResults(data)", "function copyText("),
            ("function renderProjectFiles(proj)", "function toggleProjectDrawer"),
        ):
            block = source.split(section_fn[0])[1].split(section_fn[1])[0]
            self.assertIn("renderRatioBadgeHtml(", block)
            self.assertNotIn("9:16 Portrait", block)
            self.assertNotIn("16:9 Landscape", block)

        clipper_block = source.split("function renderClipperWorkflow(proj)")[1].split("(function initClipperCanvasControls()")[0]
        self.assertNotIn("renderRatioBadgeHtml(", clipper_block)
        self.assertNotIn("ratio-pill", clipper_block)

    def test_video_hover_controls_scrim_and_selection_rules(self):
        """Video overlays stay hidden until video hover, animate synchronously with scrim, delay hide 1s, and stay off in selection mode."""
        source = self.source
        css = self.client.get("/assets/ui/luna.css").text

        self.assertIn("const VIDEO_CONTROLS_HIDE_DELAY_MS = 1000;", source)
        self.assertIn("function initVideoHoverPlayers", source)
        self.assertIn("clearVideoHoverControls(container)", source)

        # All 3 video card renderers wire hover controls
        for section_fn in (
            ("function renderOpusResults(data)", "function copyText("),
            ("function renderClipperWorkflow(proj)", "(function initClipperCanvasControls()"),
            ("function renderProjectFiles(proj)", "function toggleProjectDrawer"),
        ):
            block = source.split(section_fn[0])[1].split(section_fn[1])[0]
            self.assertIn("initVideoHoverPlayers(", block)
            self.assertIn("video-preview-wrapper", block)

        # Light DOM & Shadow DOM share exact synchronized opacity fade + subtle bottom gradient scrim
        self.assertIn(".video-preview-wrapper .ratio-pill", css)
        self.assertIn('.video-preview-wrapper[data-controls-visible="true"] .ratio-pill', css)
        self.assertIn("#projectFilesGrid.is-selecting .ratio-pill", css)
        self.assertIn("#clipperBranchingClipsWrapper.is-selecting .ratio-pill", css)
        self.assertIn("transition: opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)", css)

        sutro_block = source.split("window.compactSutroPlayers = function ()")[1].split("document.addEventListener('fullscreenchange'")[0]
        self.assertIn(".media-gradient-bottom", sutro_block)
        self.assertIn("rgba(0, 0, 0, 0.72)", sutro_block)
        self.assertIn('data-controls-visible="true"', sutro_block)
        self.assertIn("transition: opacity 220ms cubic-bezier(0.22, 1, 0.36, 1) !important;", sutro_block)
        self.assertIn(':host([data-audio-player="true"]) media-control-bar', sutro_block)

    def test_studio_video_cards_move_clip_meta_to_footer_and_handle_zero_start(self):
        """Studio video cards place Clip #N • duration in the footer, keep 0s starts, and drop MP4 Video/raw timestamps."""
        source = self.source
        helper_block = source.split("function buildStudioVideoMetaParts(item, idx)")[1].split("function renderOpusResults(data)")[0]
        studio_block = source.split("function renderOpusResults(data)")[1].split("function copyText(")[0]

        self.assertIn("hasExplicitStart", helper_block)
        self.assertIn("`Клип #${idx + 1}`", helper_block)
        self.assertIn("if (hasClip)", helper_block)

        self.assertIn("buildStudioVideoMetaParts(item, idx)", studio_block)
        self.assertNotIn("MP4 Video", studio_block)
        self.assertNotIn("footerMetaLabel", studio_block)
        self.assertNotIn("`${item.start_time} - ${item.end_time}`", studio_block)
        self.assertIn("sm:text-[15px]", studio_block)
        self.assertIn("mt-2 text-xs text-zinc-400", studio_block)

    def test_navbar_tabs_exist(self):
        """Check for tabBtnStudio and tabBtnVault."""
        html = self.source
        self.assertIn('id="tabBtnStudio"', html)
        self.assertIn('id="tabBtnVault"', html)
        self.assertIn('id="mainTabsPill"', html)
        self.assertIn('class="t-tabs"', html)
        self.assertIn('class="t-tab', html)
        self.assertIn("Studio", html)
        self.assertIn("Media Vault", html)

    def test_main_content_sections_exist(self):
        """Check for section-studio and section-vault."""
        html = self.source
        self.assertIn('id="section-studio"', html)
        self.assertIn('id="section-vault"', html)
        # section-vault should initially have 'hidden' class
        self.assertIn('id="section-vault" class="hidden', html)

    def test_media_vault_gallery_elements_exist(self):
        """Check for vault gallery grid, storage header, filters, search, and empty state."""
        html = self.source
        self.assertIn('id="vaultGalleryGrid"', html)
        self.assertIn('id="vaultStoragePath"', html)
        self.assertIn('id="vaultTotalFiles"', html)
        self.assertIn('id="vaultTotalSize"', html)
        self.assertIn('id="vaultSearchInput"', html)
        self.assertIn('id="vaultEmptyState"', html)

        # Platform underline tabs + contextual mode & sort dropdown pills
        self.assertIn('id="vaultPlatformTabs"', html)
        self.assertIn('id="vaultPlatformUnderline"', html)
        self.assertIn('id="vaultModeDropdownBtn"', html)
        self.assertIn('id="vaultSortDropdownBtn"', html)
        self.assertIn("Все типы", html)
        self.assertIn("Все типы", html)
        self.assertIn("YouTube", html)
        self.assertIn("Instagram", html)
        self.assertIn("TikTok", html)
        self.assertIn("ИИ-клипы", html)
        self.assertIn("Нарезка видео", html)
        self.assertIn("Полное видео", html)
        self.assertIn("Аудио MP3", html)
        self.assertIn("Сначала новые", html)
        self.assertIn("Сначала старые", html)
        for count_id in (
            "vaultCountAll",
            "vaultCountYoutube",
            "vaultCountInstagram",
            "vaultCountTiktok",
        ):
            self.assertIn(f'id="{count_id}"', html)

    def test_delete_modal_exists(self):
        """Check for delete confirmation modal and its key elements."""
        html = self.source
        self.assertIn('id="deleteModal"', html)
        self.assertIn('id="deleteModalTitle"', html)
        self.assertIn('id="deleteModalPath"', html)
        self.assertIn('id="deleteModalConfirmBtn"', html)
        self.assertIn("Cancel", html)
        self.assertIn("Delete", html)

    def test_standard_workspace_detail_uses_unified_dropdown_and_icon_download(self):
        """Standard workspace header & cards use 3-dot dropdown + frameless download icon, without altering AI Clipper/Trimmer."""
        source = self.source
        css = self.client.get("/assets/ui/luna.css").text

        # Workspace header unified 3-dot button, old duplicate pencil/trash header controls removed
        self.assertIn('id="btnProjectDetailMenu"', source)
        self.assertNotIn('id="btnRenameInDetail"', source)
        self.assertNotIn('id="btnDeleteInDetail"', source)

        # AI Clipper & Trimmer remain untouched
        self.assertIn('id="btnClipperRename"', source)
        self.assertIn('id="btnClipperDelete"', source)
        self.assertIn("function renderClipperWorkflow", source)

        # Rename modal supports locked extension badge
        self.assertIn('id="renameWsExtBadge"', source)
        self.assertIn('id="renameWsTargetType"', source)

        # Dropdown labels & file card footer (no Open in Explorer, no white Download capsule button)
        self.assertIn('id="vaultCardMenuSelectLabel"', source)
        self.assertIn("Выбрать файлы", source)
        self.assertIn("toggleFileCardMenu", source)
        self.assertIn("luna-download-icon-link", source)
        self.assertIn("executeBulkDeleteVaultItems", source)
        render_files_block = source.split("function renderProjectFiles(proj)")[1].split("function toggleProjectDrawer")[0]
        self.assertNotIn("<span>Download</span>", render_files_block)
        self.assertIn("luna-download-icon-link", render_files_block)
        self.assertIn("toggleFileCardMenu", render_files_block)

        # Shared selection toolbar must not be blanket-hidden inside standard workspaces
        self.assertNotIn("body.in-workspace .vault-selection-bar", css)
        self.assertIn("#projectFilesGrid.is-selecting", css)
        self.assertIn(".luna-download-icon-link", css)

    def test_clipper_trimmer_card_actions_and_english_tooltips(self):
        """Verify AI Clipper / Trimmer cards match frameless icon actions, title-only rename, and English toolbar tooltips."""
        source = self.source
        css = self.client.get("/assets/ui/luna.css").text

        render_clipper_block = source.split("function renderClipperWorkflow(proj)")[1].split("(function initClipperCanvasControls()")[0]
        self.assertIn("vault-file-card", render_clipper_block)
        self.assertIn("vault-card-check", render_clipper_block)
        self.assertIn("toggleFileCardMenu", render_clipper_block)
        self.assertIn("luna-download-icon-link", render_clipper_block)
        self.assertNotIn("<span>Download</span>", render_clipper_block)
        self.assertNotIn("hover:border-white/[0.06]", render_clipper_block)
        self.assertNotIn("hover:bg-white/[0.04]", render_clipper_block)
        self.assertNotIn("hover:bg-white/[0.08]", render_clipper_block)
        self.assertIn(".caption-trigger-row:hover", css)
        self.assertIn("background: rgba(255, 255, 255, 0.06);", css)
        self.assertNotIn('title="More actions"', source)
        self.assertNotIn('title="Download Clip"', source)
        self.assertNotIn('title="Download File"', source)
        self.assertNotIn('title="Settings"', source)
        self.assertNotIn('title="Back"', source)

        # Studio results cards match modern Workspace cards (frameless icon download, no white pill button)
        studio_results_block = source.split("function renderOpusResults(data)")[1].split("function copyText(")[0]
        self.assertIn("vault-file-card", studio_results_block)
        self.assertIn("luna-download-icon-link", studio_results_block)
        self.assertNotIn("Download MP4", studio_results_block)
        self.assertNotIn("Download Audio MP3", studio_results_block)

        self.assertIn("targetType === 'clip-title'", source)
        self.assertIn("title_only: true", source)
        self.assertIn("#clipperBranchingClipsWrapper.is-selecting", css)

        toolbar_start = source.find('class="t-clipper-toolbar"')
        toolbar_snippet = source[toolbar_start:source.find("clipperZoomOut()", toolbar_start) + 200]
        self.assertNotIn("Reset Posisi Card", source)
        for tooltip in (
            "Reset Card Positions",
            "Rename Workspace",
            "Delete Workspace",
            "Zoom In",
            "Reset Zoom (100%)",
            "Zoom Out",
        ):
            self.assertIn(tooltip, toolbar_snippet)

    def test_required_js_functions_exist(self):
        """Verify presence of all required JS state and functions in index.html."""
        html = self.source
        required_functions = [
            "function switchMainTab",
            "function updateTabsPill",
            "function loadVaultItems",
            "function updateVaultBadge",
            "function updateVaultStatsUI",
            "function setVaultFilter",
            "function setVaultModeFilter",
            "function setVaultSort",
            "function toggleVaultDropdown",
            "function updateVaultPlatformUnderline",
            "function updateVaultTabCounts",
            "function getProjectOutputMode",
            "function sortVaultProjects",
            "function showToast",
            "const lunaToast =",
            "function onVaultSearchInput",
            "function clearVaultSearch",
            "function renderVaultGallery",
            "function openVaultFolder",
            "function openVaultFile",
            "function confirmDeleteVaultItem",
            "function closeDeleteModal",
            "function executeDeleteVaultItem",
            "function triggerAction",
            "function openWorkspaceModal",
            "function fetchNextWorkspaceIndex",
            "function confirmAndStartProcess",
        ]
        for fn in required_functions:
            with self.subTest(fn=fn):
                self.assertIn(fn, html, f"Missing required JS function: {fn}")

    def test_api_calls_and_vault_urls_in_script(self):
        """Verify JS script calls appropriate vault endpoints and /media-vault/ URLs."""
        html = self.source
        self.assertIn("/api/vault", html)
        self.assertIn("/api/vault/open-file", html)
        self.assertIn("/api/vault/open-folder", html)
        self.assertIn("/media-vault/", html)

    def test_modal_styling_and_buttons(self):
        """Verify modals use neutral dark #171717 and use t-btn atoms instead of btn-luxe-cta."""
        html = self.source
        # No blueish #0c0e14 allowed
        self.assertNotIn("0c0e14", html)

        # Modals must use #171717
        self.assertIn('id="workspaceConfirmModal"', html)
        self.assertIn('id="renameWorkspaceModal"', html)
        self.assertIn('id="deleteModal"', html)

        # Verify buttons in modals do not use btn-luxe-cta
        rename_modal_snippet = html[html.find('id="renameWorkspaceModal"'):html.find('id="deleteModal"')]
        self.assertNotIn("btn-luxe-cta", rename_modal_snippet)
        self.assertIn("t-btn-primary", rename_modal_snippet)
        self.assertIn("t-btn-secondary", rename_modal_snippet)

    def test_ai_clipper_shows_quality_pill_with_1080p_default(self):
        """AI Short Clips must expose the quality dropdown while keeping 1080p as default."""
        html = self.source
        self.assertIn('id="drawer-quality-pill"', html)
        self.assertIn("var selectedQuality = '1080';", html)
        self.assertIn('<span id="currentQualityLabel">1080p FHD</span>', html)
        drawer_fn = html.split("function updateDrawer(feat)")[1].split("function closeAllDropdowns(")[0]
        ai_branch = drawer_fn.split("feat.drawer === 'ai-clip'")[1].split("feat.drawer === 'quality'")[0]
        self.assertIn("drawerQualityPill.classList.remove('hidden')", ai_branch)

    def test_settings_and_empty_vault_use_coss_button_variants(self):
        """Empty Vault CTA uses coss default button; Settings uses toast Save/Cancel prompt and Check/Change match Test Connection."""
        html = self.source
        self.assertNotIn("button-wrapper", html)
        self.assertNotIn("settings-save-btn", html)

        for expected in (
            'id="btnOpenStudioEmpty"',
            "coss-btn coss-btn-default",
            'id="btnCheckSystem"',
            'id="btnChangeCookies"',
            'id="checkSystemIcon"',
            "btnToastSaveSettings",
            "btnToastCancelSettings",
            "revertSettingsToSnapshot",
        ):
            self.assertIn(expected, html)

        css = self.client.get("/assets/ui/luna.css").text
        self.assertIn(".coss-btn-default", css)
        self.assertIn(".luna-toast-action-btn.is-primary", css)
        self.assertIn(".pill-control.is-locked", css)
        self.assertIn(".sub-menu-item.is-disabled", css)
        self.assertNotIn(".settings-save-btn", css)
        self.assertNotIn(".coss-btn-outline", css)
        self.assertNotIn(".button-wrapper", css)

    def test_youtube_shorts_autodetect_locks_ratio_and_ai_clip(self):
        """YouTube Shorts links auto-select Full HD Video and lock ratio + AI Short Clips + Нарезка видео."""
        html = self.source
        for expected in (
            "function isYoutubeShortUrl",
            "function syncYoutubeShortState",
            "function syncYoutubeShortLockUI",
            "YOUTUBE_SHORT_LOCKED_FEATURES",
            "Нарезка видео недоступна для YouTube Shorts",
            "short-lock-icon",
            "pill-lock-icon",
            "isYoutubeShortLocked",
            "type_yt_video",
            "type_yt_clip",
        ):
            self.assertIn(expected, html)
        self.assertNotIn("Shorts N/A", html)

    def test_main_tabs_and_guide_subtabs_sync_url_hash(self):
        """Main tabs and Guide sub-tabs must sync location.hash so refreshes keep the active route."""
        html = self.source
        for expected in (
            "function syncLocationHash",
            "function getMainTabHash",
            "function applyRouteFromHash",
            "window.addEventListener('popstate', () => applyRouteFromHash())",
            "currentGuideTab",
            "data-init-route",
        ):
            self.assertIn(expected, html)

        css = self.client.get("/assets/ui/luna.css").text
        self.assertIn('html[data-init-route="workspace"] #vaultProjectsListView', css)
        self.assertIn("html[data-init-route] #section-studio", css)
        self.assertIn("html[data-init-route] #mainTabsPill", css)
        self.assertIn("updateTabsPill(immediatePill)", html)

    def test_16_9_ratio_locks_face_detect_ui(self):
        """Selecting 16:9 Wide must lock Face Track back to Center Crop, hide chevron cleanly, and show lock icon."""
        html = self.source
        for expected in (
            "function syncFaceDetectLockUI",
            "Отслеживание лица недоступно для широкого соотношения 16:9",
            "syncFaceDetectLockUI();",
            "pill-lock-icon",
        ):
            self.assertIn(expected, html)

        css = self.client.get("/assets/ui/luna.css").text
        for expected_css in (
            ".pill-control svg.hidden",
            '.pill-control.is-locked svg[id$="Chevron"]',
            ".pill-control.is-locked .pill-lock-icon",
            ".sub-menu-item.is-disabled .short-lock-icon",
        ):
            self.assertIn(expected_css, css)

    def test_strict_url_validation_and_dynamic_quality_status(self):
        """Frontend URL validation restricts supported domains and task labels reflect selected quality."""
        html = self.source
        for expected in (
            "SUPPORTED_MEDIA_DOMAINS",
            "function isSupportedMediaHost",
            "QUALITY_LABELS",
            "Скачивание видео ${activeTaskQuality}p",
            "data.quality || localStorage.getItem('luna_active_quality')",
        ):
            self.assertIn(expected, html)

    def test_clip_language_controls_and_original_unicorn_background(self):
        """AI clip language selector (ID/EN) lives in Settings only (no modal duplicate), and original UnicornStudio WebGL background exists cleanly."""
        html = self.source
        for expected in (
            'id="selectClipLanguage"',
            'id="clipLanguageMenu"',
            "function setClipLanguage",
            'data-us-project="N9XzvQXu7fA5SY2ewADJ"',
        ):
            self.assertIn(expected, html)

        for removed_dup in (
            'id="wsClipLanguageRow"',
            'id="wsLangBtnId"',
            'id="wsLangBtnEn"',
            "function setWorkspaceClipLanguage",
        ):
            self.assertNotIn(removed_dup, html)

        self.assertNotIn("studioFallbackCanvas", html)
        self.assertNotIn('data-bg-mode="fallback"', html)
        self.assertNotIn("/assets/ui/hero-waves.png", html)

        bg_js = self.client.get("/assets/ui/background.js").text
        self.assertIn("failIfMajorPerformanceCaveat: false", bg_js)
        self.assertIn("fastly.jsdelivr.net", bg_js)
        self.assertNotIn("__drawStudioFallbackFrame", bg_js)
        self.assertNotIn("/assets/ui/hero-waves.png", bg_js)

    def test_settings_dependency_toast_key_hints_and_storage_copy(self):
        """Settings dependency check reports cookies truthfully, warns on unsaved keys, and clarifies Move Folder."""
        html = self.source
        for expected in (
            "function renderCookieStatus",
            "Основные утилиты готовы (cookies YouTube не загружены)",
            "Все утилиты и cookies YouTube готовы",
            "Ключ введён, но не сохранён: проверьте его кнопкой «Проверить подключение», чтобы стала доступна кнопка «Сохранить ключ».",
            "Не сохранён • проверьте",
            "«Перенести папку» переносит только сохранённые медиафайлы.",
        ):
            self.assertIn(expected, html)

    def test_viewport_ui_scale_normalization_preserves_1536_baseline(self):
        """Desktop UI zoom normalization locks 90%/100%/110% scale proportions to 125% (1150px) baseline without scaling WebGL bg."""
        html = self.source
        for expected in (
            "var TARGET_BASE_WIDTH = 1150;",
            "var TARGET_MIN_HEIGHT = 610;",
            "window.__lunaApplyUiScale = applyLunaUiScale;",
            "window.__getLunaUiScale",
            "--luna-ui-zoom",
            "function getLunaUiScale()",
        ):
            self.assertIn(expected, html)

        css = self.client.get("/assets/ui/luna.css").text
        for expected_css in (
            "min-height: calc(100vh / var(--luna-ui-zoom, 1)) !important;",
            "zoom: calc(1 / var(--luna-ui-zoom, 1));",
            "max-width: calc((100vw / var(--luna-ui-zoom, 1)) - 32px);",
        ):
            self.assertIn(expected_css, css)

        bg_js = self.client.get("/assets/ui/background.js").text
        self.assertIn("__getLunaUiScale", bg_js)

    def test_unicorn_background_wave_lifecycle_guards(self):
        """Phase 4.2: Static wave/gradient planes stay drawable across tab switches, resizes, and WebGL context restores."""
        bg_js = self.client.get("/assets/ui/background.js").text
        for expected in (
            "function __keepUnicornPlanesDrawable",
            "function __bindSceneContextHandlers",
            "scene.disablePlanes = function () {}",
            "scene.paused = true",
            "scene.paused = false",
            "webglcontextlost",
            "webglcontextrestored",
            "scene.refresh()",
            "window.addEventListener('pageshow'",
            "window.addEventListener('pagehide'",
            "window.devicePixelRatio",
        ):
            self.assertIn(expected, bg_js)

    def test_studio_background_selector_defaults_to_obsidian_and_lazy_loads_webgl(self):
        """Studio defaults to lightweight Workspace dark ('obsidian'), offers 13 presets at bottom of Settings with auto-save, and lazy-loads WebGL."""
        html = self.source
        for expected in (
            'id="studioBgCssLayer"',
            'data-bg-id="obsidian"',
            'id="settingsStudioBackgroundSection"',
            'id="studioBackgroundGrid"',
            'id="studioBgSaveStatus"',
            "function renderStudioBackgroundCards",
            "async function selectStudioBackground",
        ):
            self.assertIn(expected, html)

        # Settings Studio Background section sits at the bottom after System Status
        self.assertGreater(
            html.index('id="settingsStudioBackgroundSection"'),
            html.index('id="cookieStatusBadge"'),
        )

        bg_js = self.client.get("/assets/ui/background.js").text
        for preset_id in (
            "'obsidian'",
            "'lunar-waves'",
            "'crimson-horizon'",
            "'emerald-horizon'",
            "'dark-horizon'",
            "'crimson-abyss'",
            "'emerald-abyss'",
            "'violet-abyss'",
            "'ocean-glow'",
            "'copper-forge'",
            "'stellar-mist'",
            "'cosmic-nebula'",
            "'prismatic-aurora'",
        ):
            self.assertIn(preset_id, bg_js)
        self.assertIn("function __ensureUnicornStudioLoaded", bg_js)
        self.assertIn("window.applyStudioBackground", bg_js)
        self.assertNotIn("patterncraft", bg_js.lower())

    def test_in_app_updater_and_unsaved_settings_guard_markup(self):
        """Phase 4.4: Settings header has Check for Updates + modal, indeterminate update toast, API key auto-save, and leave guard."""
        html = self.source
        for expected in (
            'id="btnCheckUpdates"',
            'id="updateModal"',
            'id="updateModalActionBtn"',
            'id="updateModalLaterBtn"',
            'id="updateModalOkBtn"',
            "async function checkForLunaUpdates",
            "async function startLunaUpdate",
            "function hasUnsavedApiKeys",
            "function hasUnsavedSettingsChanges",
            "function guardUnsavedSettingsLeave",
            "saveProviderKey(provider, { auto: true })",
            "luna_update_just_completed",
        ):
            self.assertIn(expected, html)

        css = self.client.get("/assets/ui/luna.css").text
        for expected_css in (
            ".luna-toast-card.is-attention",
            ".luna-toast-progress-track",
            ".luna-toast-progress-bar",
            ".luna-toast-link",
        ):
            self.assertIn(expected_css, css)

        # Preflight API key toast with subtle "Перейти в настройки" link & refined Check for Updates button (no bounce .t-btn)
        for expected_preflight in (
            "function showMissingApiKeyToast",
            "async function checkAiClipApiKeysBeforeGenerate",
            "Перейти в настройки",
            "X-Luna-Error-Code",
            'id="checkUpdatesSpinner"',
            'data-lucide="arrow-down-to-line"',
        ):
            self.assertIn(expected_preflight, html)
        btn_slice = html[html.index('id="btnCheckUpdates"'):html.index('id="btnCheckUpdates"') + 340]
        self.assertNotIn("t-btn", btn_slice)
        self.assertIn("font-normal", btn_slice)


if __name__ == "__main__":
    unittest.main()
