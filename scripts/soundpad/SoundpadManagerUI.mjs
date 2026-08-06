import { promptFolderLoad, promptFileLoad } from "../utils/filePrompts.mjs";
import { validateRandomBounds } from "./soundpadCellHandlers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const GRID_PRESETS = {
    "3x7": { cols: 3, rows: 7 },
    "4x5": { cols: 4, rows: 5 },
    "10x2": { cols: 10, rows: 2 }
};

// Every preset pages at the same size regardless of its own cols×rows — 3×7
// (21) is capped to 20 (its last slot is simply never rendered) so grid and
// pad-list pagination always deal in the same page size.
const PAGE_SIZE = 20;
// Hard ceiling on how many pages either pager will ever show — a pad or pad
// list needing more than this should be split, not scrolled/paged forever.
const MAX_PAGES = 3;

/**
 * The single window for managing and using every Soundpad: a left pane listing
 * pads (create/select/delete) and a right pane showing the selected pad's grid.
 * Cells are click-to-play, right-click-to-loop, and double-click-to-edit;
 * drag-and-drop (from the Library, from Foundry's native Playlists sidebar,
 * or reordering cells) is always active.
 */
export default class SoundpadManagerUI extends HandlebarsApplicationMixin(ApplicationV2) {
    selectedPadId = "";
    gridPreset = "4x5";
    searchFilter = "";
    listCollapsed = false;
    creatingPad = false;
    checkedPadIds = new Set();
    onlySelected = false;
    gridPage = 0;
    listPage = 0;
    listHeaderOpen = false;

    static PARTS = {
        body: {
            template: "modules/soundscape-adventure/templates/soundpad/manager.hbs",
            scrollable: [".soundpad-pad-list"]
        }
    };

    static DEFAULT_OPTIONS = {
        id: "soundpad-manager-ui",
        window: {
            title: "Soundpads",
            icon: "fas fa-grid-2",
            resizable: false
        },
        classes: ["soundpad-manager-ui"],
        dragDrop: [{ dragSelector: null, dropSelector: null }],
        position: { width: "auto", height: "auto" }
    };

    constructor(options = {}) {
        super(options);
        this.gridPreset = game.settings.get('soundscape-adventure', 'soundpad-grid-preset') || "4x5";
        this.#dragDrop = this.#createDragDropHandlers();
    }

    _canDragStart() { return true; }
    _canDragDrop() { return true; }

    #createDragDropHandlers() {
        return this.options.dragDrop.map((d) => {
            d.permissions = {
                dragstart: this._canDragStart.bind(this),
                drop: this._canDragDrop.bind(this),
            };
            d.callbacks = {
                dragover: (event) => event.preventDefault(),
            };
            return new foundry.applications.ux.DragDrop(d);
        });
    }

    #dragDrop;
    #draggingCellId = null;
    /** See bringToFront() override below. */
    #frontPinned = false;

    /**
     * Foundry raises a window's z-index on *every* bringToFront() call, which
     * fires on essentially any click inside it — so merely double-clicking a
     * cell to open its edit dialog was enough to haul the whole manager to the
     * very top of the window stack, above whatever else the user had in front
     * (e.g. a character sheet). Let the real open (first call) assign a normal
     * z-index as usual, then ignore further calls until the window is closed
     * and reopened — a deliberate reopen (sidebar/scene-control toggle) should
     * still raise it, an incidental click on its own contents shouldn't.
     */
    bringToFront() {
        if (this.#frontPinned) return;
        super.bringToFront();
        this.#frontPinned = true;
    }

    _onClose(options) {
        super._onClose(options);
        this.#frontPinned = false;
    }

    async _prepareContext(options) {
        const manager = game.soundscapeSoundpads;
        const allPads = manager ? Object.values(manager.soundpads) : [];
        allPads.sort((a, b) => a.name.localeCompare(b.name));

        let filtered = this.searchFilter
            ? allPads.filter(p => p.name.toLowerCase().includes(this.searchFilter.toLowerCase()))
            : allPads;
        if (this.onlySelected) filtered = filtered.filter(p => this.checkedPadIds.has(p.id));

        const listPageCount = Math.min(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), MAX_PAGES);
        this.listPage = Math.min(this.listPage, listPageCount - 1);
        const listStart = this.listPage * PAGE_SIZE;

        const soundpads = filtered.slice(listStart, listStart + PAGE_SIZE).map(p => ({
            id: p.id,
            name: p.name,
            selected: p.id === this.selectedPadId,
            checked: this.checkedPadIds.has(p.id),
            looping: p.hasActiveLoop(),
            color: p.color || 0
        }));

        const padModel = manager?.getSoundpad(this.selectedPadId);
        let selectedPad = null;
        let gridSlots = [];
        let gridPageCount = 1;

        const preset = GRID_PRESETS[this.gridPreset] || GRID_PRESETS["4x5"];
        // Every preset pages at PAGE_SIZE regardless of its own cols×rows — 3×7
        // (21) simply never renders its last slot, so grid and list pagination
        // always deal in the same page size.
        const pageSlotCount = Math.min(preset.cols * preset.rows, PAGE_SIZE);

        if (padModel) {
            selectedPad = { id: padModel.id, name: padModel.name, color: padModel.color || 0 };
            // maxPos (not cells.length) tolerates gaps left by removeCell, which
            // doesn't renumber the remaining cells.
            const maxPos = padModel.cells.reduce((m, c) => Math.max(m, c.position), -1);
            const filledThrough = maxPos + 1;
            gridPageCount = Math.max(1, Math.ceil(filledThrough / pageSlotCount));
            // A partially-filled last page already exposes empty drop targets;
            // only reserve a fresh page when the last one is completely full.
            if (filledThrough > 0 && filledThrough % pageSlotCount === 0 && gridPageCount < MAX_PAGES) gridPageCount += 1;
            gridPageCount = Math.min(gridPageCount, MAX_PAGES);
            this.gridPage = Math.min(this.gridPage, gridPageCount - 1);

            const pageStart = this.gridPage * pageSlotCount;
            for (let local = 0; local < pageSlotCount; local++) {
                const position = pageStart + local;
                const cell = padModel.cells.find(c => c.position === position);
                gridSlots.push({
                    position,
                    empty: !cell,
                    cell: cell ? {
                        id: cell.id,
                        name: cell.name,
                        icon: cell.icon,
                        loopMode: cell.loopMode,
                        playing: padModel.isCellPlaying(cell.id),
                        looping: padModel.isCellLooping(cell.id)
                    } : null
                });
            }
        } else {
            this.gridPage = 0;
        }

        const stripActive = !!(selectedPad && this.gridPreset === "10x2");

        return {
            soundpads,
            selectedPad,
            gridSlots,
            stripActive,
            // Only strip mode gates the pad-list header/search behind a
            // closed-by-default drawer — every other preset always shows it.
            listHeaderOpen: !stripActive || this.listHeaderOpen,
            gridPresetKey: this.gridPreset,
            cols: preset.cols,
            visibleRows: preset.rows,
            searchFilter: this.searchFilter,
            listCollapsed: this.listCollapsed,
            creatingPad: this.creatingPad,
            onlySelected: this.onlySelected,
            listPage: this.listPage + 1,
            showListPager: listPageCount > 1,
            canListPrev: this.listPage > 0,
            canListNext: this.listPage < listPageCount - 1,
            gridPage: this.gridPage + 1,
            showGridPager: gridPageCount > 1,
            canGridPrev: this.gridPage > 0,
            canGridNext: this.gridPage < gridPageCount - 1
        };
    }

    async myRender(force = false, options = {}) {
        await super.render(force, options);
        // Window must always hug soundpad-grid-box's actual size (varies with
        // grid preset, list-collapse, empty state) — re-run auto sizing every
        // render instead of only on first open.
        this.setPosition({ width: "auto", height: "auto" });
    }

    async _onDrop(event) {
        event.preventDefault();
        if (event.__saDropHandled) return;
        event.__saDropHandled = true;
        this.#clearDropIndicators();

        const cellEl = event.target.closest('.soundpad-cell');
        if (!cellEl) return;

        const manager = game.soundscapeSoundpads;
        const pad = manager?.getSoundpad(this.selectedPadId);
        if (!pad) return;

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch {
            return;
        }

        if (data.type === "reorder") {
            const targetIndex = Number(cellEl.dataset.position) + (this.#isLeftHalf(event, cellEl) ? 0 : 1);
            pad.reorderCell(data.cellId, targetIndex);
            await pad.save();
            this.myRender(true);
            return;
        }

        let payload;
        if (data.type === "library") {
            const libSound = game.soundscapeLibrary?.getById(data.libraryId);
            if (!libSound) {
                ui.notifications.warn("Sound not found in the library.");
                return;
            }
            payload = { libraryId: data.libraryId, path: libSound.path, name: libSound.name };
        } else if (data.type === "PlaylistSound") {
            // Native Foundry Playlists sidebar row, dropped straight onto a cell.
            // libraryId is left for Soundpad#consistence's path-matching relink
            // pass to fill in later if it finds a match.
            const ps = await fromUuid(data.uuid);
            if (!ps?.path) {
                ui.notifications.warn("Sound not found.");
                return;
            }
            const libSound = game.soundscapeLibrary?.findByPath(ps.path);
            payload = { libraryId: libSound?.id ?? "", path: ps.path, name: ps.name };
        } else {
            return;
        }

        const position = Number(cellEl.dataset.position);
        const existing = pad.cells.find(c => c.position === position);
        if (existing) {
            // Replace this cell's sound in place — keeps its position/loop config.
            await pad.replaceCellSound(existing.id, payload);
        } else {
            // Any empty slot is just a trailing drop target — append to the dense order.
            await pad.addCell(pad.cells.length, payload);
        }
        await pad.save();
        this.myRender(true);
    }

    #isLeftHalf(event, cellEl) {
        const rect = cellEl.getBoundingClientRect();
        return (event.clientX - rect.left) < rect.width / 2;
    }

    #clearDropIndicators() {
        this.element?.querySelectorAll('.soundpad-cell.drop-before, .soundpad-cell.drop-after').forEach(c => {
            c.classList.remove('drop-before', 'drop-after');
        });
    }

    /**
     * Small swatch popover (appended to document.body, not the app's own DOM,
     * so it isn't clipped by the list pane's overflow:auto) offering the 8
     * theme-defined pad colors. Clicking the already-active swatch toggles the
     * tag off (color 0 = no highlight) instead of just re-selecting it.
     */
    _openColorPicker(padId, x, y) {
        document.querySelector('.soundpad-color-picker')?.remove();
        const pad = game.soundscapeSoundpads?.getSoundpad(padId);
        if (!pad) return;

        const picker = document.createElement('div');
        picker.className = 'soundpad-color-picker';
        picker.style.left = `${x}px`;
        picker.style.top = `${y}px`;

        for (let i = 1; i <= 8; i++) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'soundpad-color-swatch';
            if (pad.color === i) swatch.classList.add('active');
            swatch.style.setProperty('--swatch-color', `var(--sa-soundpad-color-${i})`);
            swatch.dataset.tooltip = `Color ${i}`;
            swatch.addEventListener('click', async (event) => {
                event.stopPropagation();
                pad.color = pad.color === i ? 0 : i;
                await pad.save();
                picker.remove();
                this.myRender(true);
            });
            picker.appendChild(swatch);
        }

        document.body.appendChild(picker);
        // Clamp so the popover never renders past the right/bottom viewport edge.
        const rect = picker.getBoundingClientRect();
        if (rect.right > window.innerWidth) picker.style.left = `${window.innerWidth - rect.width - 4}px`;
        if (rect.bottom > window.innerHeight) picker.style.top = `${window.innerHeight - rect.height - 4}px`;

        const closeOnOutsideClick = (event) => {
            if (picker.contains(event.target)) return;
            picker.remove();
            document.removeEventListener('click', closeOnOutsideClick);
            document.removeEventListener('contextmenu', closeOnOutsideClick);
        };
        // Deferred so the contextmenu event that opened the picker doesn't
        // immediately bubble into this same listener and close it again.
        setTimeout(() => {
            document.addEventListener('click', closeOnOutsideClick);
            document.addEventListener('contextmenu', closeOnOutsideClick);
        }, 0);
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const root = this.element;

        // Strip mode (10x2 preset) removes the window chrome entirely (see
        // .strip-active .window-header in _soundpads.scss) so the whole app
        // reads as a slim horizontal strip — no title bar, no drag handle,
        // no close control, so all three are recreated below.
        root.classList.toggle('strip-active', context.stripActive);

        if (context.stripActive) {
            // With no header to grab, dragging the window happens by pointer-
            // downing anywhere on the body that isn't an interactive control.
            const body = root.querySelector('.soundpad-manager-body');
            body?.addEventListener('pointerdown', (event) => {
                if (event.target.closest('button, input, a, select, [data-action], .soundpad-cell, .soundpad-pad-list-item, .soundpad-toggle-row')) return;
                event.preventDefault();
                const start = { x: event.clientX, y: event.clientY, ...this.position };
                const onMove = (e) => {
                    this.setPosition({ left: start.left + (e.clientX - start.x), top: start.top + (e.clientY - start.y) });
                };
                const onUp = () => window.removeEventListener('pointermove', onMove);
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp, { once: true });
            });
        }

        // Pad-list header/search drawer (strip mode only — see listHeaderOpen
        // in _prepareContext).
        const listHeaderToggle = root.querySelector('[data-action="toggleListHeader"]');
        if (listHeaderToggle) {
            listHeaderToggle.addEventListener('click', () => {
                this.listHeaderOpen = !this.listHeaderOpen;
                this.myRender(true);
            });
        }

        // Window must hug the mosaic (soundpad-grid-pane), not the pad list —
        // cap the list pane's height to whatever the mosaic actually rendered
        // at, so it scrolls internally instead of inflating the window past
        // the grid. Skipped in the empty state (no pad selected), where the
        // grid pane has no intrinsic height of its own.
        const listPane = root.querySelector('.soundpad-pad-list-pane');
        const gridBox = root.querySelector('.soundpad-grid-box');
        if (listPane) {
            listPane.style.maxHeight = gridBox
                ? `${root.querySelector('.soundpad-grid-pane').getBoundingClientRect().height}px`
                : "";
        }

        // Sidebar: search filter
        const search = root.querySelector('.soundpad-search');
        if (search) {
            search.addEventListener('input', () => {
                this.searchFilter = search.value;
                this.listPage = 0;
                this.myRender(true);
            });
            search.focus();
            search.selectionStart = search.selectionEnd = search.value.length;
        }

        const searchClear = root.querySelector('.soundpad-search-clear');
        if (searchClear) {
            searchClear.addEventListener('click', () => {
                this.searchFilter = "";
                this.listPage = 0;
                this.myRender(true);
            });
        }

        // Sidebar: "Only selected" toggle — filters the pad list down to the
        // ones marked via each row's own checkbox.
        const onlySelectedToggle = root.querySelector('.soundpad-only-selected-toggle');
        if (onlySelectedToggle) {
            onlySelectedToggle.addEventListener('change', () => {
                this.onlySelected = onlySelectedToggle.checked;
                this.listPage = 0;
                this.myRender(true);
            });
        }

        // Sidebar: per-pad mark checkbox — stopPropagation so it never also
        // triggers the row's own selectPad click below.
        root.querySelectorAll('.soundpad-pad-checkbox').forEach(label => {
            label.addEventListener('click', (event) => event.stopPropagation());
            const input = label.querySelector('input');
            input.addEventListener('change', () => {
                const padId = label.dataset.padId;
                if (input.checked) this.checkedPadIds.add(padId);
                else this.checkedPadIds.delete(padId);
                this.myRender(true);
            });
        });

        // Sidebar: select / delete pad. Selection is delayed by one dblclick
        // window instead of firing immediately: an immediate select calls
        // myRender(true), which tears down every DOM node (including the name
        // span) before a following dblclick could ever land on it. Delaying —
        // and having the dblclick handler below cancel the pending select —
        // lets a plain click still select (after a short delay) while a double
        // click on the name reliably reaches rename instead. (A prior attempt
        // put stopPropagation() on every click on the name span instead; that
        // broke single-click selection outright, since the name span fills
        // nearly the whole row width.)
        root.querySelectorAll('.soundpad-pad-list-item').forEach(item => {
            item.addEventListener('click', () => {
                clearTimeout(item._selectTimer);
                item._selectTimer = setTimeout(() => {
                    this.selectedPadId = item.dataset.padId;
                    this.gridPage = 0;
                    this.myRender(true);
                }, 250);
            });

            // Draggable onto a mood's "Linked Soundpads" drop zone in the
            // Soundscape editor window — separate DnD payload type from the
            // in-pane cell "reorder" drag above.
            item.draggable = true;
            item.addEventListener('dragstart', (event) => {
                const padId = item.dataset.padId;
                const pad = game.soundscapeSoundpads?.getSoundpad(padId);
                event.dataTransfer.setData("text/plain", JSON.stringify({ type: "soundpad-link", padId, padName: pad?.name ?? "" }));
                event.dataTransfer.effectAllowed = "copy";
            });
        });

        // Sidebar: right-click a pad's name to tag it with a highlight color;
        // double-click to rename, independent of edit mode.
        root.querySelectorAll('.soundpad-pad-name').forEach(nameEl => {
            nameEl.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const padId = nameEl.closest('.soundpad-pad-list-item')?.dataset.padId;
                if (padId) this._openColorPicker(padId, event.clientX, event.clientY);
            });
            nameEl.addEventListener('dblclick', (event) => {
                event.stopPropagation();
                const li = nameEl.closest('.soundpad-pad-list-item');
                clearTimeout(li?._selectTimer);
                const padId = li?.dataset.padId;
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'soundpad-pad-rename-input';
                input.value = nameEl.textContent;
                nameEl.replaceWith(input);
                input.focus();
                input.select();
                input.addEventListener('click', (e) => e.stopPropagation());
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') input.blur();
                    if (e.key === 'Escape') { input.value = nameEl.textContent; input.blur(); }
                });
                input.addEventListener('blur', async () => {
                    const pad = game.soundscapeSoundpads?.getSoundpad(padId);
                    const newName = input.value.trim();
                    if (pad && newName && newName !== pad.name) {
                        pad.name = newName;
                        await pad.save();
                    }
                    this.myRender(true);
                }, { once: true });
            });
        });
        root.querySelectorAll('[data-action="deletePad"]').forEach(el => {
            el.addEventListener('click', async (event) => {
                event.stopPropagation();
                const padId = el.dataset.padId;
                const pad = game.soundscapeSoundpads?.getSoundpad(padId);
                const confirmed = await foundry.applications.api.DialogV2.confirm({
                    window: { title: "Delete Soundpad" },
                    content: `<p>Are you sure you want to delete "${pad?.name ?? "this soundpad"}"? This cannot be undone.</p>`
                });
                if (!confirmed) return;
                await game.soundscapeSoundpads.deleteSoundpad(padId);
                if (this.selectedPadId === padId) this.selectedPadId = "";
                this.checkedPadIds.delete(padId);
                this.myRender(true);
            });
        });

        // Sidebar: set the root folder every new Soundpad JSON gets saved into —
        // same "browse for a folder, remember it" idiom as the Sound Library's
        // import roots, just a single root instead of a managed list.
        const setRootBtn = root.querySelector('[data-action="setRootFolder"]');
        if (setRootBtn) {
            setRootBtn.addEventListener('click', async () => {
                const folderPath = await promptFolderLoad();
                if (!folderPath) return;
                await game.settings.set('soundscape-adventure', 'soundpad-root', folderPath);
                ui.notifications.info(`New Soundpads will be saved to ${folderPath}.`);
            });
        }

        // Sidebar: load an existing Soundpad JSON (e.g. recovering pads whose
        // world setting got lost, but whose files are still on disk).
        const loadPadBtn = root.querySelector('[data-action="loadPad"]');
        if (loadPadBtn) {
            loadPadBtn.addEventListener('click', async () => {
                const path = await promptFileLoad('json');
                if (!path) return;
                try {
                    const pad = await game.soundscapeSoundpads.loadSoundpad(path);
                    this.selectedPadId = pad.id;
                    this.gridPage = 0;
                    ui.notifications.info(`Loaded Soundpad "${pad.name}".`);
                } catch (err) {
                    ui.notifications.error(`Failed to load Soundpad from ${path}.`);
                    console.error(err);
                }
                this.myRender(true);
            });
        }

        // Sidebar: new pad — no folder/filename dialogs, just an inline name
        // field (like the pad-rename input) that creates straight into the
        // configured root folder on blur/Enter.
        const newPadBtn = root.querySelector('[data-action="newPad"]');
        if (newPadBtn) {
            newPadBtn.addEventListener('click', () => {
                const folderPath = game.settings.get('soundscape-adventure', 'soundpad-root');
                if (!folderPath) {
                    ui.notifications.warn("Set a Soundpads root folder first.");
                    return;
                }
                this.creatingPad = true;
                this.myRender(true);
            });
        }

        const newPadInput = root.querySelector('.soundpad-new-pad-input');
        if (newPadInput) {
            newPadInput.focus();
            newPadInput.addEventListener('click', (e) => e.stopPropagation());
            newPadInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') newPadInput.blur();
                if (e.key === 'Escape') { newPadInput.dataset.cancel = "1"; newPadInput.blur(); }
            });
            newPadInput.addEventListener('blur', async () => {
                this.creatingPad = false;
                if (newPadInput.dataset.cancel) return this.myRender(true);

                const folderPath = game.settings.get('soundscape-adventure', 'soundpad-root');
                const fileName = newPadInput.value.trim() || newPadInput.placeholder;
                try {
                    const pad = await game.soundscapeSoundpads.createSoundpad(folderPath, fileName);
                    this.selectedPadId = pad.id;
                    this.gridPage = 0;
                } catch (err) {
                    ui.notifications.error("Failed to create Soundpad.");
                    console.error(err);
                }
                this.myRender(true);
            }, { once: true });
        }

        // List pane: collapse toggle
        const listToggleBtn = root.querySelector('[data-action="toggleList"]');
        if (listToggleBtn) {
            listToggleBtn.addEventListener('click', () => {
                this.listCollapsed = !this.listCollapsed;
                this.myRender(true);
            });
        }

        // Grid header: size preset toggles
        root.querySelectorAll('[data-action="setGridPreset"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                this.gridPreset = btn.dataset.preset;
                this.gridPage = 0;
                await game.settings.set('soundscape-adventure', 'soundpad-grid-preset', this.gridPreset);
                this.myRender(true);
            });
        });

        // Grid header: page arrows (clamped again in _prepareContext, so
        // over-incrementing here is harmless).
        const prevGridBtn = root.querySelector('[data-action="prevGridPage"]');
        if (prevGridBtn) {
            prevGridBtn.addEventListener('click', () => {
                this.gridPage = Math.max(0, this.gridPage - 1);
                this.myRender(true);
            });
        }
        const nextGridBtn = root.querySelector('[data-action="nextGridPage"]');
        if (nextGridBtn) {
            nextGridBtn.addEventListener('click', () => {
                this.gridPage += 1;
                this.myRender(true);
            });
        }

        // Sidebar: pad-list page arrows.
        const prevListBtn = root.querySelector('[data-action="prevListPage"]');
        if (prevListBtn) {
            prevListBtn.addEventListener('click', () => {
                this.listPage = Math.max(0, this.listPage - 1);
                this.myRender(true);
            });
        }
        const nextListBtn = root.querySelector('[data-action="nextListPage"]');
        if (nextListBtn) {
            nextListBtn.addEventListener('click', () => {
                this.listPage += 1;
                this.myRender(true);
            });
        }

        // Grid cells: click / right-click / double-click, and drop targets.
        // Click is delayed by one dblclick window (same idiom as the sidebar's
        // select-vs-rename split above) so a double-click's two rapid clicks
        // never also trigger a play — the dblclick handler cancels the pending
        // click before its timer fires.
        root.querySelectorAll('.soundpad-cell').forEach(cellEl => {
            const cellId = cellEl.dataset.cellId;

            cellEl.addEventListener('click', () => {
                if (!cellId) return; // empty cell, drop target only
                clearTimeout(cellEl._playTimer);
                cellEl._playTimer = setTimeout(async () => {
                    const pad = game.soundscapeSoundpads?.getSoundpad(this.selectedPadId);
                    if (!pad) return;
                    if (pad.isCellPlaying(cellId)) {
                        await pad.stopCell(cellId);
                    } else {
                        await pad.playCellOnce(cellId);
                    }
                    this.myRender(true);
                }, 250);
            });

            cellEl.addEventListener('contextmenu', async (event) => {
                event.preventDefault();
                const pad = game.soundscapeSoundpads?.getSoundpad(this.selectedPadId);
                if (!pad || !cellId) return;
                if (pad.isCellPlaying(cellId)) {
                    await pad.stopCell(cellId);
                } else {
                    await pad.playCell(cellId);
                }
                this.myRender(true);
            });

            cellEl.addEventListener('dblclick', () => {
                if (!cellId) return;
                clearTimeout(cellEl._playTimer);
                this._openCellEditDialog(cellId);
            });

            // Filled cells are draggable to reorder the mosaic.
            if (cellId) {
                cellEl.draggable = true;
                cellEl.addEventListener('dragstart', (event) => {
                    this.#draggingCellId = cellId;
                    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "reorder", cellId }));
                    event.dataTransfer.effectAllowed = "move";
                });
                cellEl.addEventListener('dragend', () => {
                    this.#draggingCellId = null;
                    this.#clearDropIndicators();
                });
            }

            cellEl.addEventListener('dragover', (event) => {
                event.preventDefault();
                if (!this.#draggingCellId || cellId === this.#draggingCellId) return;
                this.#clearDropIndicators();
                cellEl.classList.add(this.#isLeftHalf(event, cellEl) ? 'drop-before' : 'drop-after');
            });
            cellEl.addEventListener('dragleave', () => {
                cellEl.classList.remove('drop-before', 'drop-after');
            });
            cellEl.addEventListener('drop', this._onDrop.bind(this));
        });
    }

    async _openCellEditDialog(cellId) {
        const pad = game.soundscapeSoundpads?.getSoundpad(this.selectedPadId);
        const cell = pad?.getCell(cellId);
        if (!pad || !cell) return;

        const ps = pad._getPlaylistSound(cell);
        if (ps) await ps.load();
        const duration = ps?.sound?.duration ?? 0;
        const durationLabel = duration ? `${Math.round(duration)}s` : "unknown";

        const templatePath = "/modules/soundscape-adventure/templates/soundpad/parts/cell-edit.hbs";
        const html = await foundry.applications.handlebars.renderTemplate(templatePath, {
            cell,
            durationLabel,
            volumePercent: Math.round((cell.volume ?? 0.8) * 100)
        });

        const dialog = new foundry.applications.api.DialogV2({
            window: { title: `Edit "${cell.name}"`, resizable: false },
            position: { width: 380 },
            content: html,
            buttons: [
                {
                    action: "delete",
                    label: "Delete",
                    icon: "fas fa-trash",
                    callback: async () => {
                        await pad.removeCell(cellId);
                        await pad.save();
                        this.myRender(true);
                    }
                },
                {
                    action: "save",
                    label: "Save",
                    icon: "fas fa-check",
                    callback: (event, button) => this._saveCellEdit(button.form.elements, cellId, duration)
                },
                {
                    action: "cancel",
                    label: "Cancel",
                    icon: "fas fa-times",
                    callback: () => { }
                }
            ]
        });
        await dialog.render(true);
        this.#wireCellEditDialog(dialog, duration, cell);
    }

    #wireCellEditDialog(dialog, duration, cell) {
        const root = dialog.element;

        const iconBtn = root.querySelector('.file-picker');
        const iconInput = root.querySelector("input[name='icon']");
        const resetBtn = root.querySelector('.sound-icon-reset');

        const setIcon = (path) => {
            iconInput.value = path;
            const button = root.querySelector(".sound-icon-button");
            let img = button.querySelector(".sound-icon");
            if (path) {
                if (!img) {
                    button.querySelector("i")?.remove();
                    img = document.createElement("img");
                    img.className = "sound-icon";
                    img.style.pointerEvents = "none";
                    button.appendChild(img);
                }
                img.src = path;
            } else {
                img?.remove();
                if (!button.querySelector("i")) {
                    const icon = document.createElement("i");
                    icon.className = "fas fa-volume-high";
                    icon.dataset.tooltip = "Cell icon";
                    button.appendChild(icon);
                }
            }
            if (resetBtn) resetBtn.style.display = path ? "" : "none";
        };

        if (iconBtn) {
            iconBtn.addEventListener('click', () => {
                new foundry.applications.apps.FilePicker.implementation({
                    type: "image",
                    callback: (path) => setIcon(path)
                }).render(true);
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                setIcon("");
            });
        }

        const loopMode = root.querySelector('select[name="loopMode"]');
        const randomFields = root.querySelector('.soundpad-random-fields');
        const intervalFields = root.querySelector('.soundpad-interval-fields');
        const warning = root.querySelector('.soundpad-validation-warning');
        const saveBtn = root.querySelector('button[data-action="save"]');
        const randomFrom = root.querySelector('input[name="randomFrom"]');
        const randomTo = root.querySelector('input[name="randomTo"]');
        const volumeRange = root.querySelector('.volume-range');
        const volumeValue = root.querySelector('.volume-value');

        const syncVisibility = () => {
            if (randomFields) randomFields.style.display = loopMode.value === "random" ? "" : "none";
            if (intervalFields) intervalFields.style.display = loopMode.value === "interval" ? "" : "none";
            checkValidity();
        };

        const checkValidity = () => {
            if (loopMode.value !== "random" || !warning) {
                if (warning) warning.style.display = "none";
                if (saveBtn) saveBtn.disabled = false;
                return;
            }
            const { ok, message } = validateRandomBounds(Number(randomFrom.value), Number(randomTo.value), duration);
            warning.textContent = message;
            warning.style.display = ok ? "none" : "";
            if (saveBtn) saveBtn.disabled = !ok;
        };

        if (loopMode) loopMode.addEventListener('change', syncVisibility);
        if (randomFrom) randomFrom.addEventListener('input', checkValidity);
        if (randomTo) randomTo.addEventListener('input', checkValidity);
        if (volumeRange && volumeValue) {
            volumeRange.addEventListener('input', () => {
                volumeValue.textContent = `${Math.round(volumeRange.value * 100)}%`;
            });
        }

        // Preview: plays locally only (AudioHelper.play's second arg `false`
        // skips the socket broadcast) at whatever volume the slider currently
        // shows, not necessarily the saved value.
        const previewBtn = root.querySelector('.soundpad-preview-button');
        if (previewBtn && cell?.path) {
            let previewSound = null;
            const setPreviewIcon = (kind) => {
                const icon = previewBtn.querySelector('i');
                if (icon) icon.className = kind === "stop" ? "fas fa-stop" : "fas fa-play";
            };
            const stopPreview = () => {
                try { previewSound?.stop(); } catch { /* already stopped */ }
                previewSound = null;
                setPreviewIcon("play");
            };
            previewBtn.addEventListener('click', async () => {
                if (previewSound) {
                    stopPreview();
                    return;
                }
                try {
                    previewSound = await foundry.audio.AudioHelper.play(
                        { src: cell.path, volume: Number(volumeRange?.value ?? cell.volume ?? 0.8), loop: false, autoplay: true },
                        false
                    );
                    setPreviewIcon("stop");
                    previewSound.addEventListener('end', stopPreview);
                    previewSound.addEventListener('stop', stopPreview);
                } catch (err) {
                    ui.notifications.warn(`Could not preview "${cell.name}".`);
                    console.warn("Soundscape Adventure | soundpad preview failed:", err);
                }
            });
            root.querySelectorAll('button[data-action]').forEach(btn => {
                btn.addEventListener('click', stopPreview);
            });
        }

        syncVisibility();
    }

    async _saveCellEdit(elements, cellId, duration) {
        const pad = game.soundscapeSoundpads?.getSoundpad(this.selectedPadId);
        const cell = pad?.getCell(cellId);
        if (!pad || !cell) return;

        const loopMode = elements.loopMode.value;
        if (loopMode === "random") {
            const { ok, message } = validateRandomBounds(Number(elements.randomFrom.value), Number(elements.randomTo.value), duration);
            if (!ok) {
                ui.notifications.warn(message);
                return;
            }
        }

        await pad.updateCell(cellId, {
            name: elements.name.value || cell.name,
            icon: elements.icon.value || "",
            loopMode,
            random: { from: Number(elements.randomFrom.value) || 0, to: Number(elements.randomTo.value) || 0 },
            interval: Number(elements.interval.value) || 0,
            volume: Number(elements.volume.value),
            volumeVariation: Number(elements.volumeVariation.value) || 0
        });
        await pad.save();

        // A running loop snapshots its config into RandomSoundManager at start()
        // and never re-reads the cell — restart it so edits (loop mode, interval,
        // volume, variation, ...) actually take effect instead of only applying
        // next time the loop happens to be (re)started.
        if (pad.isCellLooping(cellId)) {
            await pad.stopCell(cellId);
            await pad.playCell(cellId);
        }

        this.myRender(true);
    }
}
