/**
 * LibraryStore — persistence layer for the global Sound Library.
 *
 * Reads/writes a single JSON file on the data partition. The library lives in
 * `modules/soudscape-adventure/storage/library.json` (NOT under worlds/) so it is shared
 * across every world: changes in one world are visible in all of them.
 *
 * This module is intentionally self-contained and does not import anything from
 * the existing soundscape runtime, so it can evolve without touching the rest of
 * the module.
 */

const SOURCE = "data";
const DEFAULT_DIR = "modules/soundscape-adventure/storage";
const FILE_NAME = "library.json";
const BACKUP_NAME = "library.bak.json";

export class LibraryStore {
    /**
     * @param {object} [opts]
     * @param {string} [opts.dir]      Directory (under the data source) holding the file.
     * @param {string} [opts.file]     File name for the library JSON.
     */
    constructor({ dir = DEFAULT_DIR, file = FILE_NAME } = {}) {
        this.source = SOURCE;
        this.dir = dir.replace(/\/+$/, "");
        this.file = file;
    }

    /** Full path to the library JSON (under the data source). */
    get path() {
        return `${this.dir}/${this.file}`;
    }

    /** Full path to the backup JSON. */
    get backupPath() {
        return `${this.dir}/${BACKUP_NAME}`;
    }

    get _FilePicker() {
        return foundry.applications.apps.FilePicker;
    }

    /**
     * Ensure the target directory exists. Foundry's upload() requires the folder
     * to already exist, so we create it (ignoring the "already exists" error).
     */
    async ensureDirectory() {
        try {
            await this._FilePicker.implementation.createDirectory(this.source, this.dir);
        } catch (err) {
            // createDirectory throws if the directory already exists — that's fine.
            const msg = String(err?.message ?? err);
            if (!/exist/i.test(msg)) {
                console.warn(`SoundLibrary | createDirectory(${this.dir}) failed:`, err);
            }
        }
    }

    /**
     * Read and parse the library JSON.
     * @returns {Promise<object|null>} Parsed data, or null if the file does not exist.
     */
    async read() {
        try {
            // Cache-bust so we always see the latest file (other worlds may have written it).
            const response = await fetch(`${this.path}?t=${Date.now()}`);
            if (!response.ok) return null;
            return await response.json();
        } catch (err) {
            console.warn(`SoundLibrary | Could not read ${this.path}:`, err);
            return null;
        }
    }

    /**
     * Write the library JSON. Backs up the previous content first so a bad write
     * (or the future v3->v4 migration) can be recovered.
     * @param {object} data  The serializable library data.
     */
    async write(data) {
        await this.ensureDirectory();
        await this._backupExisting();
        await this._upload(this.file, data);
    }

    /**
     * Snapshot the current file to the backup path before it gets overwritten —
     * but never DOWNGRADE the backup. The backup is only refreshed when the state
     * about to be replaced is at least as complete (by sound count) as what is
     * already backed up. This keeps the backup pinned to the best known state, so
     * a run of bad/empty saves can't erode the safety net.
     */
    async _backupExisting() {
        const current = await this.read();           // the state we're about to replace
        if (!current) return;                        // nothing to back up yet
        const backup = await this.readBackup();
        const curCount = Array.isArray(current.sounds) ? current.sounds.length : 0;
        const bakCount = (backup && Array.isArray(backup.sounds)) ? backup.sounds.length : -1;
        if (curCount >= bakCount) {
            await this._upload(BACKUP_NAME, current);
        }
    }

    /** Read and parse the backup JSON, or null if absent/unreadable. */
    async readBackup() {
        try {
            const response = await fetch(`${this.backupPath}?t=${Date.now()}`);
            if (!response.ok) return null;
            return await response.json();
        } catch {
            return null;
        }
    }

    async _upload(fileName, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const file = new File([blob], fileName, { type: "application/json" });
        await this._FilePicker.implementation.upload(this.source, this.dir, file, {}, { notify: false });
    }
}
