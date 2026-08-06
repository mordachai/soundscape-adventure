import { promptFolderLoad, promptFileLoad } from "../utils/filePrompts.mjs";
import { validateRandomBounds } from "./soundpadCellHandlers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const GRID_PRESETS = {
    "3x7": { cols: 3, rows: 7 },
    "5x5": { cols: 5, rows: 5 },
    "10x1": { cols: 10, rows: 1 }
};

/**
 * The single window for managing and using every Soundpad: a left pane listing
 * pads (create/select/delete) and a right pane showing the selected pad's grid.
 * Cells are click-to-play, right-click-to-loop, and double-click-to-edit;
 * drag-and-drop (from the Library, from Foundry's native Playlists sidebar,
 * or reordering cells) is always active.
 */
export default class SoundpadManagerUI extends HandlebarsApplicationMixin(ApplicationV2) {
    selectedPadId = "";
    gridPreset = "5x5";
    searchFilter = "";
    scrollTop = 0;
    listCollapsed = false;
    creatingPad = false;
    checkedPadIds = new Set();
    onlySelected = false;

    static PARTS = {
        body: { template: "modules/soundscape-adventure/templates/soundpad/manager.hbs" }
    };

    static DEFAULT_OPTIONS = {
        id: "soundpad-manager-ui",
        window: {
            title: "Soundpads",
            icon: "fas fa-grid-2",
            resizable: true
        },
        classes: ["soundpad-manager-ui"],
        dragDrop: [{ dragSelector: null, dropSelector: null }],
        position: { width: "auto", height: "auto" }
    };

    constructor(options = {}) {
        super(options);
        this.gridPreset = game.settings.get('soundscape-adventure', 'soundpad-grid-preset') || "5x5";
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

    async _prepareContext(options) {
        const manager = game.soundscapeSoundpads;
        const allPads = manager ? Object.values(manager.soundpads) : [];
        allPads.sort((a, b) => a.name.localeCompare(b.name));

        let filtered = this.searchFilter
            ? allPads.filter(p => p.name.toLowerCase().includes(this.searchFilter.toLowerCase()))
            : allPads;
        if (this.onlySelected) filtered = filtered.filter(p => this.checkedPadIds.has(p.id));

        const soundpads = filtered.map(p => ({
            id: p.id,
            name: p.name,
            selected: p.id === this.selectedPadId,
            checked: this.checkedPadIds.has(p.id),
            looping: p.hasActiveLoop()
        }));

        const padModel = manager?.getSoundpad(this.selectedPadId);
        let selectedPad = null;
        let gridSlots = [];

        const preset = GRID_PRESETS[this.gridPreset] || GRID_PRESETS["5x5"];

        if (padModel) {
            selectedPad = { id: padModel.id, name: padModel.name };
            const cols = preset.cols;
            const maxPos = padModel.cells.reduce((m, c) => Math.max(m, c.position), -1);
            // Hug exactly the preset's row count when there aren't enough cells to
            // fill it; grow past it (always with one trailing empty row as a drop
            // target) once there are — the grid scrolls vertically past preset.rows.
            const rows = Math.max(preset.rows, Math.ceil((maxPos + 1 + cols) / cols));
            const totalSlots = rows * cols;
            for (let i = 0; i < totalSlots; i++) {
                const cell = padModel.cells.find(c => c.position === i);
                gridSlots.push({
                    position: i,
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
        }

        return {
            soundpads,
            selectedPad,
            gridSlots,
            gridPresetKey: this.gridPreset,
            cols: preset.cols,
            visibleRows: preset.rows,
            searchFilter: this.searchFilter,
            listCollapsed: this.listCollapsed,
            creatingPad: this.creatingPad,
            onlySelected: this.onlySelected
        };
    }

    async myRender(force = false, options = {}) {
        const grid = this.element?.querySelector('.soundpad-grid');
        if (grid) this.scrollTop = grid.scrollTop;
        await super.render(force, options);
        const newGrid = this.element?.querySelector('.soundpad-grid');
        if (newGrid) newGrid.scrollTop = this.scrollTop;
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

    /**
     * A one-shot play's "playing" ring is driven by the live PlaylistSound
     * document, but nothing re-renders when it naturally finishes — without
     * this, the green ring stays stuck on-screen after the sound has ended.
     */
    #reRenderWhenCellEnds(pad, cellId) {
        const cell = pad.getCell(cellId);
        const ps = cell && pad._getPlaylistSound(cell);
        const sound = ps?.sound;
        if (!sound) return;
        const onEnd = () => {
            sound.removeEventListener('end', onEnd);
            this.myRender(true);
        };
        sound.addEventListener('end', onEnd);
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

    _onRender(context, options) {
        super._onRender(context, options);
        const root = this.element;

        // Sidebar: search filter
        const search = root.querySelector('.soundpad-search');
        if (search) {
            search.addEventListener('input', () => {
                this.searchFilter = search.value;
                this.myRender(true);
            });
            search.focus();
            search.selectionStart = search.selectionEnd = search.value.length;
        }

        // Sidebar: "Only selected" toggle — filters the pad list down to the
        // ones marked via each row's own checkbox.
        const onlySelectedToggle = root.querySelector('.soundpad-only-selected-toggle');
        if (onlySelectedToggle) {
            onlySelectedToggle.addEventListener('change', () => {
                this.onlySelected = onlySelectedToggle.checked;
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
                    this.myRender(true);
                }, 250);
            });
        });

        // Sidebar: rename a pad — double-click its name, independent of edit mode.
        root.querySelectorAll('.soundpad-pad-name').forEach(nameEl => {
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
                await game.settings.set('soundscape-adventure', 'soundpad-grid-preset', this.gridPreset);
                this.myRender(true);
            });
        });

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
                        this.#reRenderWhenCellEnds(pad, cellId);
                    }
                    this.myRender(true);
                }, 250);
            });

            cellEl.addEventListener('contextmenu', async (event) => {
                event.preventDefault();
                const pad = game.soundscapeSoundpads?.getSoundpad(this.selectedPadId);
                if (!pad || !cellId) return;
                if (pad.isCellPlaying(cellId)) await pad.stopCell(cellId);
                else await pad.playCell(cellId);
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
            position: { width: 360 },
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
        this.#wireCellEditDialog(dialog, duration);
    }

    #wireCellEditDialog(dialog, duration) {
        const root = dialog.element;

        const iconBtn = root.querySelector('.file-picker');
        if (iconBtn) {
            iconBtn.addEventListener('click', () => {
                new foundry.applications.apps.FilePicker.implementation({
                    type: "image",
                    callback: (path) => {
                        const input = root.querySelector("input[name='icon']");
                        input.value = path;
                        let img = root.querySelector(".sound-icon");
                        if (img) {
                            img.src = path;
                        } else {
                            const button = root.querySelector(".sound-icon-button");
                            button.querySelector("i")?.remove();
                            img = document.createElement("img");
                            img.src = path;
                            img.style.width = "32px";
                            img.style.height = "32px";
                            img.style.pointerEvents = "none";
                            img.className = "sound-icon";
                            button.appendChild(img);
                        }
                    }
                }).render(true);
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
            volume: Number(elements.volume.value)
        });
        await pad.save();
        this.myRender(true);
    }
}
