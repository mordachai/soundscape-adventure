import utils from "../utils/utils.mjs";
import constants from "../utils/constants.mjs";
import { saveJsonToFolder } from "../utils/filePrompts.mjs";
import Soundpad from "./Soundpad.mjs";

const FOLDER_NAME = "Soundpads";
const FOLDER_COLOR = "#0e2b50";

/**
 * Singleton registry for every loaded Soundpad, plus the shared "Soundpads"
 * Playlist folder each pad's own Playlist lives in. Mirrors SoundscapeAdventure's
 * shape (loadX/deleteX against a semicolon-joined world setting) but
 * deliberately does not touch game.soundscapeAdventure — kept on its own
 * game.soundscapeSoundpads namespace, same reasoning as game.soundscapeLibrary.
 *
 * Each Soundpad owns its own Playlist (created/tracked by Soundpad.ensurePlaylist)
 * rather than sharing one flat playlist across every pad — see
 * Soundpad.mjs for why.
 */
export class SoundpadManager {
    soundpads = {};
    folder = null;

    async init() {
        await this.ensureFolder();

        // Deliberately never rewrites the 'soundpads' setting here. Boot time is
        // exactly when the static file server is under the heaviest load, so a
        // transient fetch hiccup is common and must never be mistaken for the
        // file genuinely being gone — that used to silently and permanently prune
        // the path from the world setting on every reload. The only place a path
        // is ever removed is the explicit, user-initiated deleteSoundpad().
        const current = game.settings.get('soundscape-adventure', 'soundpads');
        const paths = current.split(";").map(p => p.trim()).filter(p => p.length > 0);
        for (const path of paths) {
            try {
                await this.loadSoundpad(path, false);
            } catch (error) {
                ui.notifications.warn(`Failed to load Soundpad at ${path}. It stays in settings — check the file still exists, then reload.`);
                console.error(error);
            }
        }
    }

    async ensureFolder() {
        const id = game.settings.get('soundscape-adventure', 'soundpad-folder-id');
        this.folder = (id && game.folders.get(id)) || game.folders.find(f => f.type === "Playlist" && f.name === FOLDER_NAME);
        if (!this.folder) {
            this.folder = await Folder.create({
                name: FOLDER_NAME,
                type: "Playlist",
                color: FOLDER_COLOR,
                sorting: "a"
            });
        }
        await game.settings.set('soundscape-adventure', 'soundpad-folder-id', this.folder.id);
    }

    async loadSoundpad(path, trackInSetting = true) {
        const existing = Object.values(this.soundpads).find(p => p.path === path);
        if (existing) return existing;

        utils.log(utils.getCallerInfo(), `Loading soundpad from ${path}`, constants.LOGLEVEL.INFO);
        const pad = new Soundpad(path);
        await pad.init(this.folder);

        // Two different Soundpad files can carry the same `id` (e.g. one was
        // duplicated on disk from the other as a starting template). Since the
        // registry and every selection/lookup key off `id`, a collision would
        // silently overwrite whichever pad loaded first on every reload. Detect
        // it and mint+persist a fresh id so it's fixed for good, not just this session.
        const collision = this.soundpads[pad.id];
        if (collision && collision.path !== pad.path) {
            pad.id = foundry.utils.randomID(16);
            await pad.save();
        }

        this.soundpads[pad.id] = pad;

        if (trackInSetting) {
            let current = game.settings.get('soundscape-adventure', 'soundpads');
            current = current.length > 0 ? `${current};${path}` : path;
            await game.settings.set('soundscape-adventure', 'soundpads', current);
        }
        return pad;
    }

    async createSoundpad(folderPath, fileName) {
        const exampleData = {
            name: fileName,
            created: new Date().toISOString(),
            version: 1,
            cells: []
        };
        await saveJsonToFolder(folderPath, fileName, exampleData);
        return this.loadSoundpad(`${folderPath}/${fileName}.json`);
    }

    async deleteSoundpad(id) {
        const pad = this.soundpads[id];
        if (!pad) return;

        pad.stopAllCells();
        delete this.soundpads[id];

        const current = game.settings.get('soundscape-adventure', 'soundpads');
        const remaining = current.split(";").filter(p => p.length > 0 && p !== pad.path);
        await game.settings.set('soundscape-adventure', 'soundpads', remaining.join(";"));

        // 1:1 pad<->playlist now, so deleting the pad's own playlist is enough —
        // no cross-pad reference scan needed (that's what the old shared-playlist
        // pruneOrphanedPlaylistSound used to do).
        if (pad.playlist) await pad.playlist.delete();
    }

    getSoundpad(id) {
        return this.soundpads[id];
    }

    /** Route a raw Foundry-side PlaylistSound event back to its owning pad — used by the name-sync hook in soundpad-adventure.mjs. */
    getSoundpadByPlaylistId(playlistId) {
        return Object.values(this.soundpads).find(p => p.playlist?.id === playlistId);
    }

    /** Resolve a pad by id first, then by exact (case-insensitive) name — lets macros use a human name instead of an id. */
    findSoundpad(padRef) {
        return this.soundpads[padRef]
            || Object.values(this.soundpads).find(p => p.name.toLowerCase() === String(padRef).toLowerCase());
    }

    // ------------------------------------------------------------ macro API

    /**
     * Trigger a cell by pad + cell name (or id) — the entry point for macros/RegionBehaviors,
     * e.g. `game.soundscapeSoundpads.play("Weather", "Thunder Loop")`. Loop mode, volume,
     * variation etc. all come from the cell's own configuration in the Soundpad editor — pass
     * `once: true` to force a single play regardless of how the cell is configured.
     * @param {string} padRef pad id or name
     * @param {string} cellRef cell id or name
     * @param {{once?: boolean}} [options]
     * @returns {Promise<boolean>} true if a matching cell was found and triggered
     */
    async play(padRef, cellRef, { once = false } = {}) {
        const pad = this.findSoundpad(padRef);
        const cell = pad && this._findCell(pad, cellRef);
        if (!cell) {
            ui.notifications.warn(`Soundpad cell "${cellRef}" not found on pad "${padRef}".`);
            return false;
        }
        await (once ? pad.playCellOnce(cell.id) : pad.playCell(cell.id));
        return true;
    }

    /**
     * Stop a cell by pad + cell name (or id) — the macro/RegionBehavior counterpart to play().
     * @param {string} padRef pad id or name
     * @param {string} cellRef cell id or name
     * @returns {Promise<boolean>} true if a matching cell was found and stopped
     */
    async stop(padRef, cellRef) {
        const pad = this.findSoundpad(padRef);
        const cell = pad && this._findCell(pad, cellRef);
        if (!cell) return false;
        await pad.stopCell(cell.id);
        return true;
    }

    /** Whether a cell (by pad + cell name or id) is currently playing/looping. */
    isPlaying(padRef, cellRef) {
        const pad = this.findSoundpad(padRef);
        const cell = pad && this._findCell(pad, cellRef);
        return !!cell && pad.isCellPlaying(cell.id);
    }

    _findCell(pad, cellRef) {
        return pad.getCell(cellRef)
            || pad.cells.find(c => c.name.toLowerCase() === String(cellRef).toLowerCase());
    }
}
