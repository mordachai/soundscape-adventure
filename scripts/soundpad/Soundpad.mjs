import utils from "../utils/utils.mjs";
import constants from "../utils/constants.mjs";
import { RandomSoundManager } from "../RandomSoundManager.mjs";
import soundTypeHandlers from "../soundTypeHandlers.mjs";
import { loopConfigFor } from "./soundpadCellHandlers.mjs";

/**
 * One Soundpad = one JSON file (a grid of cells) backed by its own dedicated
 * Playlist (living in the shared "Soundpads" folder — see SoundpadManager).
 * Unlike the old single shared playlist, each cell gets its own PlaylistSound
 * even when two cells point at the same audio file — mirrors Foundry's own
 * Track Name vs Audio Source split, and is what lets a cell's alias name stay
 * in sync with its PlaylistSound's name (see updateCell / the
 * `updatePlaylistSound` hook in soundpad-adventure.mjs) without fighting over
 * a ps shared by another cell.
 */
export default class Soundpad {
    id;
    name;
    created;
    version = 1;
    path;
    /** 0 = no highlight; 1-8 indexes into the --sa-soundpad-color-N theme swatches. */
    color = 0;
    cells = [];
    playlist = null;
    playlistId = "";
    randomSoundManager = new RandomSoundManager();
    /** Cleanup fns for in-flight _resumeLoopingCells listeners/timers — see stopAllCells(). */
    #pendingResumes = new Set();

    constructor(path) {
        this.id = foundry.utils.randomID(16);
        this.path = path;
        this.name = `Soundpad: ${path.split("/").pop()}`;
        this.created = new Date().toISOString();
    }

    async init(folder) {
        const response = await fetch(this.path);
        if (!response.ok) {
            // Throw instead of silently registering a name-only, cell-less pad —
            // that fake-empty state is what used to look like "lost my soundpad".
            // Let the caller (SoundpadManager.init) warn and leave the path in
            // settings for a retry on next reload, rather than pruning it.
            throw new Error(`Failed to fetch soundpad configuration from ${this.path} (${response.status})`);
        }
        const json = await response.json();
        this.id = json.id || this.id;
        this.name = json.name || this.name;
        this.created = json.created || this.created;
        this.version = json.version ?? this.version;
        this.color = json.color ?? this.color;
        this.cells = Array.isArray(json.cells) ? json.cells : [];
        this.playlistId = json.playlistId || "";

        await this.ensurePlaylist(folder);
        await this.consistence();
        await this._resumeLoopingCells();
    }

    /** Find this pad's own Playlist by tracked id (or by folder+name for a first-ever load), creating it if neither exists. */
    async ensurePlaylist(folder) {
        this.playlist = (this.playlistId && game.playlists.get(this.playlistId))
            || game.playlists.find(p => p.folder?.id === folder?.id && p.name === this.name);
        if (!this.playlist) {
            this.playlist = await Playlist.create({
                name: this.name,
                folder: folder?.id ?? null,
                mode: CONST.PLAYLIST_MODES.SIMULTANEOUS,
                sounds: []
            });
        } else if (folder && this.playlist.folder?.id !== folder.id) {
            await this.playlist.update({ folder: folder.id });
        }
        this.playlistId = this.playlist.id;
    }

    /**
     * Repair every cell's PlaylistSound link (recreate it if missing — no more
     * find-by-path reuse, each cell owns its own ps now), re-link a stale
     * libraryId, force repeat:false — looping is always driven by
     * RandomSoundManager per-cell, never by the native PlaylistSound flag — and
     * canonicalize `position` to a dense 0..n-1 order (drag reordering only ever
     * works on this dense order, no interior gaps).
     */
    async consistence() {
        if (!this.playlist) return;
        this.cells.sort((a, b) => a.position - b.position);
        this.cells.forEach((c, i) => { c.position = i; });

        // Batched into at most one update call + one create call per pad load
        // (instead of up to 2 awaited doc writes per cell) — boot time is when
        // the static file server / DB is under the heaviest load across every
        // pad in every world, so N pads x M cells of serial writes adds up fast.
        const toCreate = [];
        const updates = [];
        for (const cell of this.cells) {
            const ps = this.playlist.sounds.get(cell.playlistSoundId);
            if (!ps) {
                toCreate.push(cell);
                continue;
            }
            const patch = {};
            // JSON is authoritative on load — a name divergence here means the
            // rename didn't make it to the other side before last shutdown.
            if (ps.name !== cell.name) patch.name = cell.name;
            if (ps.repeat) patch.repeat = false;
            if (Object.keys(patch).length) updates.push({ _id: ps.id, ...patch });
        }

        if (updates.length) {
            await this.playlist.updateEmbeddedDocuments("PlaylistSound", updates);
        }
        if (toCreate.length) {
            const created = await this.playlist.createEmbeddedDocuments("PlaylistSound",
                toCreate.map(cell => ({ name: cell.name, path: cell.path, volume: 0.8, repeat: false })));
            toCreate.forEach((cell, i) => { cell.playlistSoundId = created[i].id; });
        }

        for (const cell of this.cells) {
            if (!cell.libraryId) {
                const libSound = game.soundscapeLibrary?.findByPath(cell.path);
                if (libSound) cell.libraryId = libSound.id;
            }
        }
    }

    /**
     * A looping cell's *current* play survives reload on its own (Foundry
     * resumes any PlaylistSound already marked playing), but our own
     * RandomSoundManager scheduling is pure in-memory JS state and does not.
     * Without this, the loop would silently stop the moment that resumed play
     * ends. Re-arm the loop by waiting for that play to end naturally, then
     * handing off to the normal playCell() scheduling — no restart, no glitch.
     *
     * Foundry's resume isn't guaranteed to actually happen, though: if the
     * elapsed real time since the world last saw this sound "playing" already
     * exceeds its clip duration, Foundry just quietly flips `playing` back to
     * false on its own without ever starting audio or dispatching "end" — so a
     * listener that only waits for "end" can wait forever on a resume that was
     * never coming, and the loop looks (thanks to the placeholder job below)
     * like it's still active while actually being permanently dead. A fallback
     * timer bounded by the clip's own duration guarantees we notice and
     * restart for real instead of hanging indefinitely.
     */
    async _resumeLoopingCells() {
        for (const cell of this.cells) {
            if (cell.loopMode === "once") continue;
            const ps = this._getPlaylistSound(cell);
            if (!ps || !ps.playing) continue;
            try {
                await ps.load();
            } catch (error) {
                // A load failure here (e.g. audio still locked) must not abort the
                // loop — that would throw out of init() and drop the whole pad from
                // the manager's registry, making it look "gone" until next reload.
                utils.log(utils.getCallerInfo(), `Failed to resume looping cell ${cell.name}`, constants.LOGLEVEL.ERROR, error);
                continue;
            }
            const sound = ps.sound;
            if (!sound) continue;
            const cellId = cell.id;
            // Placeholder job so isCellLooping()/the UI badge reads "looping"
            // immediately on reload instead of only once the resumed play
            // naturally ends and hands off to the real scheduled job below.
            this.randomSoundManager.jobs.set(`${this.playlist.id}-${cellId}`, { timeoutId: null, config: { soundIds: ps.id } });
            let settled = false;
            let timeoutId;
            // Deleting the pad before this ever settles (stopAllCells, see
            // #pendingResumes) must not later fire playCell() on a torn-down
            // pad/playlist — cancel the listener/timer outright instead.
            const cleanup = () => {
                sound.removeEventListener("end", onEnd);
                clearTimeout(timeoutId);
                this.#pendingResumes.delete(cleanup);
            };
            // Only the natural "end" resumes the loop — a manual stopCell() in the
            // meantime must not trigger a restart via the sound's "stop" event.
            const onEnd = () => {
                if (settled) return;
                settled = true;
                cleanup();
                this.playCell(cellId);
            };
            sound.addEventListener("end", onEnd);
            const maxWaitMs = (sound.duration > 0 ? sound.duration : 30) * 1000 + 1000;
            timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                this.playCell(cellId);
            }, maxWaitMs);
            this.#pendingResumes.add(cleanup);
        }
    }

    /** Always creates a fresh PlaylistSound — no find-by-path reuse, since each cell now owns its own entry (Track Name can differ per cell even for the same Audio Source). */
    async _createPlaylistSound(path, name) {
        const [created] = await this.playlist.createEmbeddedDocuments("PlaylistSound", [{
            name, path, volume: 0.8, repeat: false
        }]);
        return created;
    }

    async save() {
        utils.log(utils.getCallerInfo(), `Saving soundpad ${this.name} to ${this.path}`);
        try {
            // Keep the pad's own Playlist name in step with a pad rename.
            if (this.playlist && this.playlist.name !== this.name) {
                await this.playlist.update({ name: this.name });
            }
            const parts = decodeURIComponent(this.path).split('/');
            const filename = parts.pop();
            const dir = parts.join('/');
            await this._backupExisting(dir, filename);
            const finalJson = {
                id: this.id,
                name: this.name,
                created: this.created,
                version: this.version,
                color: this.color,
                playlistId: this.playlistId,
                cells: this.cells
            };
            const blob = new Blob([JSON.stringify(finalJson, null, 2)], { type: 'application/json' });
            const file = new File([blob], filename, { type: 'application/json' });
            await foundry.applications.apps.FilePicker.implementation.upload('data', dir, file, {}, { notify: false });
        } catch (error) {
            utils.log(utils.getCallerInfo(), `Error saving soundpad ${this.name}:`, constants.LOGLEVEL.ERROR, error);
        }
    }

    /**
     * Snapshot the file as it exists on disk (BEFORE this save's content
     * overwrites it) to `.backups/<name>.bak.json`, overwriting whatever
     * backup was already there — so a bad save (bug, race, whatever) never
     * means the pad is truly gone. Lives in a `.backups` subfolder (not next
     * to the pad files) so the pad folder itself doesn't double in the file
     * picker.
     */
    async _backupExisting(dir, filename) {
        try {
            const response = await fetch(`${this.path}?t=${Date.now()}`);
            if (!response.ok) return;
            const current = await response.json();

            // Normalize first: if `this.path` itself already points at a
            // `.bak.json` (e.g. loaded back in via "Load existing Soundpad
            // JSON"), don't stack another `.bak` onto it.
            const baseName = filename.replace(/\.bak\.json$/i, '.json');
            const bakName = baseName.replace(/\.json$/i, '.bak.json');
            const backupDir = `${dir}/.backups`;

            try {
                await foundry.applications.apps.FilePicker.implementation.createDirectory('data', backupDir);
            } catch { /* already exists */ }
            const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
            const file = new File([blob], bakName, { type: 'application/json' });
            await foundry.applications.apps.FilePicker.implementation.upload('data', backupDir, file, {}, { notify: false });
        } catch (error) {
            utils.log(utils.getCallerInfo(), `Error backing up soundpad ${this.name}:`, constants.LOGLEVEL.ERROR, error);
        }
    }

    // ------------------------------------------------------------------ cells

    getCell(cellId) {
        return this.cells.find(c => c.id === cellId);
    }

    async addCell(position, { libraryId, path, name, icon = "" }) {
        const ps = await this._createPlaylistSound(path, name);
        const cell = {
            id: foundry.utils.randomID(16),
            position,
            libraryId,
            path,
            playlistSoundId: ps?.id ?? "",
            name,
            icon,
            volume: 0.8,
            volumeVariation: 0,
            loopMode: "once",
            random: { from: 0, to: 0 },
            interval: 0
        };
        this.cells.push(cell);
        return cell;
    }

    /** Swap a cell's underlying sound (drag a new library sound onto a filled slot) — deletes the old PlaylistSound, creates a fresh one, keeps position/loop config. */
    async replaceCellSound(cellId, { libraryId, path, name }) {
        const cell = this.getCell(cellId);
        if (!cell) return null;
        const oldPs = this._getPlaylistSound(cell);
        const ps = await this._createPlaylistSound(path, name);
        if (oldPs) await this.playlist.deleteEmbeddedDocuments("PlaylistSound", [oldPs.id]);
        Object.assign(cell, { libraryId, path, name, playlistSoundId: ps?.id ?? "" });
        return cell;
    }

    async removeCell(cellId) {
        const cell = this.getCell(cellId);
        if (!cell) return null;
        this.stopCell(cellId);
        const ps = this._getPlaylistSound(cell);
        this.cells = this.cells.filter(c => c.id !== cellId);
        // 1:1 now — this cell was the only thing referencing its ps, safe to
        // delete outright, no cross-pad/cross-cell usage scan needed.
        if (ps) await this.playlist.deleteEmbeddedDocuments("PlaylistSound", [ps.id]);
        return cell;
    }

    /** Renaming a cell keeps its PlaylistSound's Track Name in step — the other sync direction is the `updatePlaylistSound` hook in soundpad-adventure.mjs. */
    async updateCell(cellId, patch) {
        const cell = this.getCell(cellId);
        if (!cell) return null;
        const renaming = Object.hasOwn(patch, 'name') && patch.name !== cell.name;
        Object.assign(cell, patch);
        if (renaming) {
            const ps = this._getPlaylistSound(cell);
            if (ps && ps.name !== cell.name) await ps.update({ name: cell.name });
        }
        return cell;
    }

    /**
     * Move a cell to `targetIndex` in the dense 0..n-1 order and renumber every
     * cell's `position` to match — the drag-to-reorder mosaic operation.
     */
    reorderCell(cellId, targetIndex) {
        const ordered = [...this.cells].sort((a, b) => a.position - b.position);
        const idx = ordered.findIndex(c => c.id === cellId);
        if (idx === -1) return;
        const [cell] = ordered.splice(idx, 1);
        const clamped = Math.max(0, Math.min(targetIndex, ordered.length));
        ordered.splice(clamped, 0, cell);
        ordered.forEach((c, i) => { c.position = i; });
        this.cells = ordered;
    }

    // --------------------------------------------------------------- playback

    _getPlaylistSound(cell) {
        if (!this.playlist || !cell) return null;
        return this.playlist.sounds.get(cell.playlistSoundId) ?? this.playlist.sounds.find(s => s.path === cell.path);
    }

    /** Always a single play, regardless of the cell's configured loop mode — the "click to play once" behavior. */
    async playCellOnce(cellId) {
        const cell = this.getCell(cellId);
        if (!cell) return;
        const ps = this._getPlaylistSound(cell);
        if (!ps) {
            ui.notifications.warn(`"${cell.name}" could not be found in the Soundpad playlist.`);
            return;
        }
        const volume = utils.randomizedVolume(cell.volume, cell.volumeVariation);
        await soundTypeHandlers.playSoundWithFade({ fadeIn: 0, fadeOut: 0, volume }, ps, this.playlist);
    }

    /** Play using the cell's configured loop mode (falls back to a single play for "once") — the "right-click to loop" behavior. */
    async playCell(cellId) {
        const cell = this.getCell(cellId);
        if (!cell) return;
        if (cell.loopMode === "once") return this.playCellOnce(cellId);

        const ps = this._getPlaylistSound(cell);
        if (!ps) {
            ui.notifications.warn(`"${cell.name}" could not be found in the Soundpad playlist.`);
            return;
        }
        const loop = loopConfigFor(cell);
        this.randomSoundManager.start(this.playlist.id, ps.id, {
            from: loop.from,
            to: loop.to,
            volume: cell.volume,
            volumeVariation: cell.volumeVariation,
            playOnce: false,
            fadeIn: 0,
            fadeOut: 0
        }, cellId);
    }

    async stopCell(cellId) {
        const cell = this.getCell(cellId);
        if (!cell) return;
        const ps = this._getPlaylistSound(cell);
        if (!ps) return;
        // stop() already calls playlist.stopSound() when this cell has a running
        // job — don't also fire it here, ps.playing hasn't caught up to that
        // in-flight update yet and a second concurrent stopSound() would race it.
        const wasLooping = this.isCellLooping(cellId);
        this.randomSoundManager.stop(this.playlist.id, ps.id, cellId);
        if (!wasLooping && ps.playing) await this.playlist.stopSound(ps);
    }

    isCellLooping(cellId) {
        return this.randomSoundManager.jobs.has(`${this.playlist.id}-${cellId}`);
    }

    isCellPlaying(cellId) {
        const cell = this.getCell(cellId);
        const ps = this._getPlaylistSound(cell);
        return !!ps?.playing || this.isCellLooping(cellId);
    }

    stopAllCells() {
        for (const cleanup of this.#pendingResumes) cleanup();
        for (const cell of this.cells) this.stopCell(cell.id);
    }

    /** True if at least one cell is actively looping right now — surfaced as a badge on the pad list. */
    hasActiveLoop() {
        return this.cells.some(c => this.isCellLooping(c.id));
    }
}
