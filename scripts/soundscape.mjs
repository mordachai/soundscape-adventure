import MoodConfig from "./moodConfig.mjs";
import constants from "./utils/constants.mjs";
import utils from "./utils/utils.mjs";
import { RandomSoundManager } from './RandomSoundManager.mjs';
import { getHandler } from './soundTypeHandlers.mjs';
import { activateLinkedSoundpads } from './soundpad-adventure.mjs';


//TODO new behavior:
// - select global soundscape
// - load each soundscape from a folder

// TODO random needs to be improved
export default class Soundscape {
    id;
    name;
    type; // Type can be local or remote
    moods; // the moods associated to this soundscape
    playlist; // the playlist related to this soundscape
    soundsConfig; // a list of all sounds available for this soundscape
    path; // the soundscape path
    status; // it identifies if the soundscape is loaded (with a playlist)
    moodsConfigFile = "";
    random_idempotency;
    advice;
    version = 4; // current format; init() overrides from the loaded file's version
    visible_off_sounds = false;
    activeMoodId = "";
    openUI = null;
    //the id of the mood is been displayed on the UI
    currentMoodOnUI = "";

    constructor(_path, _type = constants.SOUNDSCAPE_TYPE.LOCAL) {
        this.id = foundry.utils.randomID(16); // temp ID
        this.credits = null;
        this.path = _path;
        this.type = _type;
        this.status = "offline";
        this.playlist = null;
        this.soundsConfig = [];
        this.random_idempotency = [];
        this.name = `${constants.PREFIX}: ${_path.split("/").pop()}`; // temp Name
        this.moods = {};
        this.playlistId = "";
        this.description = "";
        this.created = "";
        this.randomSoundManager = new RandomSoundManager();
    }

    /** Soundscape configuration */

    async init(globalSounds = []) {
        const response = await fetch(this.path);
        if (!response.ok) {
            ui.notifications.error(`Failed to load soundscape configuration from ${this.path}. Please check the path and try again.`);
            return;
        }
        const json = await response.json();
        if (json.version < 2) {
            ui.notifications.error(`The soundscape version ${json.version} is not supported. Please update the soundscape to version 2 or higher.`);
            return;
        }
        this.id = json.id || foundry.utils.randomID(16);
        this.name = json.name;
        this.playlistId = json?.playlistId;
        this.description = json.description;
        this.created = json.created;
        this.version = json.version ?? this.version;
        const moods = json.moods;
        this.moodsConfigFile = this.path.split("/").pop();
        this.playlist = await game.playlists.get(json.playlistId);

        if (json?.credits) {
            this.credits = json.credits;
        }

        if (this.playlist == null) {
            this.playlist = await game.playlists.find(el => el.name == "Soundscape: " + this.name);
            if (!this.playlist) {
                // TODO create playlist tries to add the audio files as well
                await this.createPlaylist(moods);
            } else {
                this.playlistId = this.playlist.id;
            }
        }

        let has_changes = false;

        for (const key in moods) {
            // TODO send to load mood
            const moodConfig = new MoodConfig(json.moods[key], this.playlist);
            await moodConfig.consistence(this.playlist);
            if (json.version == 2) {
                await moodConfig.migrate_from_v2_to_v3(json.moods[key].active_groups);
                has_changes = true;
                this.version = 3;
            }
            this.moods[key] = moodConfig;
            if (moods[key].status == constants.STATUS.MOOD.PLAYING) {
                this.activeMoodId = key;
                try {
                    await this.playMood(key);
                } catch (error) {
                    // A failed autoplay (e.g. audio still locked) must not abort this
                    // loop — that used to drop every mood after this one out of
                    // this.moods entirely, since they'd never get assigned above.
                    utils.log(utils.getCallerInfo(), `Failed to autoplay mood ${key} for soundscape ${this.name}`, constants.LOGLEVEL.ERROR, error);
                }
            }
        }
        if (has_changes) {
            await this.saveMoodsConfig();
        }

        // v3 → v4: move to consuming the shared Sound Library. Interactive (asks
        // the user), so it runs after the moods are loaded.
        if (this.version < 4) {
            try {
                const migrated = await this.migrateToV4(json);
                if (migrated) {
                    this.version = 4;
                    await this.saveMoodsConfig();
                }
            } catch (err) {
                await this._migrationFailed(err, null);
            }
        }

        // A v4 soundscape may reference sounds this install's library doesn't
        // know yet (e.g. it was shared from another world). Transparently import
        // their source folder(s) as library roots before syncing from it.
        await this.ensureLibraryRoots();

        // The library is the source of truth for names — pull any renames done
        // there into this soundscape (and its playlist).
        await this.syncNamesFromLibrary();
    }

    /**
     * Ensure every sound this soundscape uses is backed by the global library.
     * For any sound the library can't resolve (no matching `libraryId`/path), the
     * source folder is detected, added as a library root and imported, then each
     * sound's `libraryId` is (re)linked. A notification names each added folder.
     * No-op (cheap) once the library already covers every sound.
     * @returns {Promise<boolean>} true if any new root was imported.
     */
    async ensureLibraryRoots() {
        const lib = game.soundscapeLibrary;
        if (!lib) return false;

        // Collect the paths of sounds the library can't resolve yet.
        const danglingPaths = [];
        for (const key in this.moods) {
            for (const s of this.moods[key].sounds) {
                if (!s.path) continue;
                const known = (s.libraryId && lib.getById(s.libraryId)) || lib.findByPath(s.path);
                if (!known) danglingPaths.push(s.path);
            }
        }
        if (!danglingPaths.length) return false;

        // Detect the source folder(s) and import them. addRoot() reports whether
        // the root was genuinely new (so we only announce first-time additions);
        // importFolder() is idempotent and skips files already in the library.
        const roots = this._detectRoots(danglingPaths);
        const added = [];
        for (const r of roots) {
            const isNew = lib.addRoot(r);
            await lib.importFolder(r);
            if (isNew) added.push(r);
        }

        // (Re)link each sound to its now-known library entry by path.
        let changed = false;
        for (const key in this.moods) {
            const mood = this.moods[key];
            for (const s of mood.sounds) {
                if (s.libraryId && lib.getById(s.libraryId)) continue;
                const libSound = lib.findByPath(s.path);
                if (libSound && s.libraryId !== libSound.id) {
                    s.libraryId = libSound.id;
                    mood.has_changes = true;
                    changed = true;
                }
            }
        }
        if (changed) await this.saveMoodsConfig();

        for (const r of added) {
            ui.notifications.info(`Sound Library: folder "${r}" was added as a root.`);
        }
        return added.length > 0;
    }

    /**
     * Update the names of this soundscape's sounds to match the global library
     * (the source of truth). Renaming a sound in the library reflects here on load
     * / reload. Updates the SoundConfig, group member names, and the PlaylistSound.
     */
    async syncNamesFromLibrary() {
        const lib = game.soundscapeLibrary;
        if (!lib) return false;
        let changed = false;

        for (const key in this.moods) {
            const mood = this.moods[key];
            for (const s of mood.sounds) {
                const libSound = (s.libraryId && lib.getById(s.libraryId)) || lib.findByPath(s.path);
                if (!libSound || s.name === libSound.name) continue;

                s.name = libSound.name;
                // Keep group member labels in sync too.
                for (const g of mood.groups) {
                    const member = g.sounds?.find(m => m.id === s.id);
                    if (member) member.name = libSound.name;
                }
                // And the underlying PlaylistSound.
                const ps = this.playlist?.sounds?.get(s.id)
                    || this.playlist?.sounds?.find(p => p.path === s.path);
                if (ps && ps.name !== libSound.name) await ps.update({ name: libSound.name });

                mood.has_changes = true;
                changed = true;
            }
        }

        if (changed) await this.saveMoodsConfig();
        return changed;
    }

    async reloadSoundscape() {
        // Bring the global library up to date with disk BEFORE reloading, so moved
        // or renamed files are relinked in the library (libraryId kept stable). The
        // init() → consistence() pass below then recovers each sound's new path via
        // its libraryId instead of dropping it. Done here (the explicit Refresh
        // button) and not in init() so world boot doesn't rescan the disk once per
        // soundscape. Failure is non-fatal — fall back to a plain reload.
        try {
            const summary = await game.soundscapeLibrary?.refresh();
            // Let the user know when a moved file was silently relinked, so a
            // "it just kept working" isn't mistaken for the file never having moved.
            if (summary?.relinked) {
                const names = summary.relinkedDetails.map(d => d.name);
                const shown = names.slice(0, 5).join(", ");
                const more = names.length > 5 ? ` (+${names.length - 5} more)` : "";
                ui.notifications.info(`Relinked ${summary.relinked} moved sound${summary.relinked > 1 ? "s" : ""}: ${shown}${more}.`);
            }
        } catch (err) {
            console.error("Soundscape | library refresh before reload failed:", err);
        }
        await this.init();
        // Reflect the refreshed model (e.g. names synced from the library) in any
        // open window and the sidebar.
        if (this.openUI) this.openUI.render(true);
        Hooks.callAll("SoundscapeAdventure-UpdateSidebar", "", "");
    }

    async fileExists(path) {
        try {
            const response = await fetch(path);
            return response.ok;
        } catch (e) {
            return false;
        }
    }

    async createPlaylist(moods) {
        const sounds = [];
        const playlistData = {
            name: "Soundscape: " + this.name,
            description: "A playlist created by Soundscape Adventure",
            mode: CONST.PLAYLIST_MODES.SIMULTANEOUS,
            sounds: sounds
        };

        this.playlist = await Playlist.create(playlistData);
        this.playlistId = this.playlist.id;
    }

    async save_soundboard() {
        let obj = {};
        for (let mood in this.moods) {
            obj[`${this.id}:${mood}`] = `${this.name} -> ${this.moods[mood].name}`
        }
        let soundscapes = await game.settings.get(`soundscape-adventure`, "regionSoundscapes");
        soundscapes = Object.assign(obj, soundscapes)
        game.settings.set(`soundscape-adventure`, "regionSoundscapes", soundscapes);

    }

    // enable an offiline soundscape means create a playlist
    // and load the moods
    // async enable() {
    //     await this._loadMoods();
    //     this.status = "online";
    //     const soundscapes = await game.settings.get('soundscape-adventure', 'soundscapes')
    //     //await game.settings.set('soundscape-adventure', 'soundscapes', soundscapes + ";" + this.name + "," + this.id);
    //     await this.saveMoodsConfig();
    // }

    // async validateFileExists(filePath) {
    //     const directory = filePath.substring(0, filePath.lastIndexOf('/'));
    //     const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

    //     try {
    //         const result = await foundry.applications.apps.FilePicker.browse("data", directory);

    //         if (result.files.includes(filePath)) {
    //             return true;
    //         } else {
    //             return false;
    //         }
    //     } catch (error) {
    //         return false;
    //     }
    // }

    // async reScanFolder() {
    //     await this.init();
    //     await this.saveMoodsConfig();
    // }

    //TODO sync playlist needs to be within the moodConfig
    // in the future, drag and drop will allow moods to have
    /// sounds from other soundscapes
    // async _syncPlaylist() {
    //     // validates all sounds are in the playlist
    //     for (let i = 0; i < this.soundsConfig.length; i++) {
    //         const sound = this.playlist.sounds.filter(el => el.path == this.soundsConfig[i].path);
    //         if (sound.length == 0) {
    //             // need to add the sound
    //             this.soundsConfig[i].id = await this._addSoundToPlaylist(this.soundsConfig[i]);
    //         } else if (sound.length > 1) {
    //             this.soundsConfig[i].id = sound[0].id;
    //             for (let j = 1; j < sound.length; j++) {
    //                 // double check that still exists
    //                 const sound_to_remove = this.playlist.sounds.find(el => el.id == sound[j].id);
    //                 if (sound_to_remove) {
    //                     await this.playlist.deleteEmbeddedDocuments("PlaylistSound", [sound_to_remove._id]);
    //                 }
    //             }
    //         } else {
    //             this.soundsConfig[i].id = sound[0].id;
    //         }
    //     }

    //     // validates all sounds in the playlist are valid
    //     const sounds = this.playlist.sounds;
    //     for (let i = 0; i < sounds.length; i++) {
    //         const fileExists = this.validateFileExists(sounds[i].path);
    //         if (!fileExists) {
    //             await this.playlist.deleteEmbeddedDocuments("PlaylistSound", [sounds[i]._id]);
    //         }
    //     }
    // }

    // async _addSoundToPlaylist(newSound) {
    //     utils.log(utils.getCallerInfo(), `Adding a new sound '${newSound.path}' to the playlist '${this.playlist.name}'`)
    //     await this.playlist.createEmbeddedDocuments("PlaylistSound", [newSound]);
    //     const sound = this.playlist.sounds.find(obj => obj.path == newSound.path);
    //     return sound.id;
    // }

    async _createPlaylist() {
        utils.log(utils.getCallerInfo(), `Creating playlist '${this.name}'`);
        let newPlaylistData = {
            name: this.name,
            description: "This is a playlist managed by Soundscape Adventure",
            folder: null,  // If you have a specific folder, provide its ID
            sorting: "a",  // Sorting method: "a" for alphabetic, "m" for manual
            mode: 2,  // Play mode: 0 for sequential, 1 for shuffle, 2 for simultaneous
            playing: false,  // Whether the playlist is currently playing
            sounds: this.soundsConfig
        };

        // Create the new playlist
        this.playlist = await Playlist.create(newPlaylistData);
    }

    /**
     * MOOD CONTROLS
     */
    async newMood(name, _soundsConfig = {}) {
        if (Object.keys(_soundsConfig).length === 0) {
            _soundsConfig.sounds = [];
            _soundsConfig.name = name;
            _soundsConfig.id = foundry.utils.randomID(16);
            _soundsConfig.status = "stop";
            _soundsConfig.groups = [];
            //_soundsConfig.active_groups = [];
            _soundsConfig.categories = [
                { id: "", name: "None", type: constants.SOUNDTYPE.LOOP, collapsed: false, sounds: [] },
                { id: "", name: "None", type: constants.SOUNDTYPE.RANDOM, collapsed: false, sounds: [] }
            ]

        }
        utils.log(utils.getCallerInfo(), `Create new mood ${name}`);
        const mood = new MoodConfig(_soundsConfig, this.playlist);
        //mood.consistence();
        await mood.consistence(this.playlist);
        this.moods[_soundsConfig.id] = mood;
        await this.saveMoodsConfig();
        Hooks.callAll("SoundscapeAdventure-UpdateSidebar", name, mood);
    }
    async _loadMoods() {
        utils.log(utils.getCallerInfo(), `Checking moods for ${this.name}`);
        const folder = await foundry.applications.apps.FilePicker.browse('data', this.path, { recursive: false });
        let moodConfigFile = "";
        for (const file of folder.files) {
            if (file.includes(this.moodsConfigFile)) {
                moodConfigFile = file;
            }
        }
        if (moodConfigFile.length) {
            try {
                utils.log(utils.getCallerInfo(), `Previous mood configuration has been retrieved '${moodConfigFile}'`);
                const response = await fetch(moodConfigFile);
                const contents = await response.json();

                let name_update = true;
                for (let key in contents) {
                    const moodconfig = contents[key];
                    if (this.moods[moodconfig.id] == null) {
                        const currentPlaying = await game.settings.get('soundscape-adventure', 'current-playing').split(",");
                        let status = "stop";
                        if (currentPlaying.length == 2) {
                            if (currentPlaying[0] == this.id && currentPlaying[1] == moodconfig.id) {
                                status = constants.STATUS.MOOD.PLAYING;
                            }
                        }
                        this.moods[moodconfig.id] = new MoodConfig(moodconfig, this.playlist, status);
                        //await this.moods[moodconfig.id].consistence(this.playlist);
                        //await this.moods[moodconfig.id].syncFolderSounds(this.soundsConfig);
                        if (status == constants.STATUS.MOOD.PLAYING) {
                            this.playMood(moodconfig.id, false);
                        }
                        // update soundscape sound names
                        if (name_update) {
                            name_update = false;
                            for (let i = 0; i < this.soundsConfig.length; i++) {
                                const sound = this.moods[moodconfig.id].sounds.find(obj => obj.id == this.soundsConfig[i].id);
                                if (sound) {
                                    this.soundsConfig[i].name = sound.name;
                                }
                            }
                        }
                    } else {
                        await this.moods[moodconfig.id].syncFolderSounds(this.soundsConfig);
                    }
                }
            } catch (error) {
                utils.log(utils.getCallerInfo(), `Can't parse file ${moodConfigFile}`, constants.LOGLEVEL.ERROR, error)
            }
        } else {
            utils.log(utils.getCallerInfo(), `No configuration found for ${this.name}`);
        }
        return;
    }

    async playStopMood(moodId) {
        if (this.moods[moodId].status == constants.STATUS.MOOD.PLAYING) {
            await this.stopMood(moodId);
        } else {
            if (this.activeMoodId && this.activeMoodId != moodId) {
                await this.stopMood(this.activeMoodId, moodId);
            }
            await this.playMood(moodId);
        }
        if (this.openUI) {
            this.openUI.render(true);
        }
        await this.saveMoodsConfig();
        Hooks.callAll('soundscape-adventure.mood.playStopMood', this.id, moodId, this.moods[moodId]);
    }
    async playMood(moodId) {
        this.activeMoodId = moodId;
        this.isPlaying = true;
        if (this.moods[moodId]) {
            const sounds = await this.moods[moodId].getSoundsToPlay();
            this.moods[moodId].status = constants.STATUS.MOOD.PLAYING;
            // Linked Soundpads: select exactly them in the Soundpad Manager (any
            // other pad gets deselected) and switch "Only selected" on. Empty list
            // = leave the manager's current selection/filter untouched.
            activateLinkedSoundpads(this.moods[moodId].linkedSoundpads);
            // configure sound before playing
            for (let i = 0; i < sounds.length; i++) {
                const s = this.playlist.sounds.get(sounds[i].id);
                if (s) {
                    if (sounds[i].type == constants.SOUNDTYPE.RANDOM || sounds[i].type == constants.SOUNDTYPE.GROUP_RANDOM) {
                        await s.update({ repeat: false });
                    } else {
                        await s.update({ repeat: true });
                    }
                }
            }

            for (let i = 0; i < sounds.length; i++) {
                await this.playSound(sounds[i], moodId);
            }

            const groups = await this.moods[moodId].getGroupsToPlay();
            for (let i = 0; i < groups.length; i++) {
                // Intensity loop groups play their current member directly; every
                // other group (random and sequential loop groups) goes through the
                // type handler.
                if (groups[i].type == constants.SOUNDTYPE.GROUP_LOOP && !groups[i].isSequential()) {
                    await this._playLoopGroup(groups[i], moodId);
                } else {
                    await this.playSound(groups[i], moodId);
                }
            }

            // Apply fade-ins now that every sound in the batch is playing.
            // Foundry's PlaylistSound#sync() rewrites the gain on every update
            // across the playlist, so ramps scheduled during play() are wiped
            // by subsequent sounds' playing:true updates.
            //  await new Promise(r => setTimeout(r, 1000));
            // for (const sc of sounds) {
            //     //console.warn("Applying fade in for sound", sc.name);
            //     const ps = this.playlist.sounds.get(sc.id);
            //     if (sc.fadeIn) await applyFadeIn(sc, ps);
            // }
            // for (const gc of groups) {
            //     const targetId = gc.type == constants.SOUNDTYPE.GROUP_LOOP ? gc.current : gc.id;
            //     const ps = this.playlist.sounds.get(targetId);
            //     if (ps) await applyFadeIn(gc, ps);
            // }
        }
    }

    async deleteMood(moodId) {
        await this.stopMood(moodId);
        if (this.moods[moodId]) {
            delete this.moods[moodId];
            await this.syncRegionSoundscapes();
            await this.saveMoodsConfig();
            Hooks.callAll("SoundscapeAdventure-UpdateSidebar", "", "");
        }
    }

    /**
     * Synchronizes the regionSoundscapes setting with the current moods.
     * Removes entries for moods that no longer exist and adds/updates entries for current moods.
     */
    async syncRegionSoundscapes() {
        let soundscapes = await game.settings.get(`soundscape-adventure`, "regionSoundscapes");
        let hasChanges = false;

        // Remove entries for this soundscape's moods that no longer exist
        for (const key of Object.keys(soundscapes)) {
            if (key.startsWith(`${this.id}:`)) {
                const moodId = key.split(':')[1];
                if (!this.moods[moodId]) {
                    delete soundscapes[key];
                    hasChanges = true;
                }
            }
        }

        // Add/update entries for current moods
        for (const moodId in this.moods) {
            const regionKey = `${this.id}:${moodId}`;
            const value = `${this.name} -> ${this.moods[moodId].name}`;
            if (soundscapes[regionKey] !== value) {
                soundscapes[regionKey] = value;
                hasChanges = true;
            }
        }

        if (hasChanges) {
            await game.settings.set(`soundscape-adventure`, "regionSoundscapes", soundscapes);
        }
    }
    async stopMood(moodId, futureMoodId = "") {
        let futureSounds = [];
        if (futureMoodId) {
            futureSounds = await this.moods[futureMoodId].getSoundsToPlay();
        }

        this.moods[moodId].status = constants.STATUS.MOOD.STOP;
        if (this.activeMoodId == moodId) {
            this.activeMoodId = "";
        }
        const sounds = await this.moods[moodId].getSoundsToPlay();
        for (let i = 0; i < sounds.length; i++) {
            const isFutureSound = futureSounds.find(s => s.id == sounds[i].id);
            if (isFutureSound) {
                if ((isFutureSound.type == constants.SOUNDTYPE.LOOP || isFutureSound.type == constants.SOUNDTYPE.GROUP_LOOP) && isFutureSound.type == sounds[i].type) {
                    continue;
                }
            }
            await this.stopSound(sounds[i], moodId, true);
        }

        const groups = await this.moods[moodId].getGroupsToPlay();
        for (let i = 0; i < groups.length; i++) {
            // Pass the group itself so stopSound dispatches to the group handler
            // (handlers read group.current / group.sounds - a member sound lacks both).
            await this.stopSound(groups[i], moodId);
        }

        this.randomSoundManager.stopAll();


    }
    async stopAll() {
        for (const key in this.moods) {
            this.stopMood(key);
        }
        this.isPlaying = false;
    }
    async saveMoodsConfig() {
        utils.log(utils.getCallerInfo(), `Saving moods for ${this.name} to ${this.path}`)
        let moodsCopy = JSON.parse(JSON.stringify(this.moods));

        // Sync regionSoundscapes setting with current moods
        await this.syncRegionSoundscapes();

        // Reset has_changes flag for all moods
        for (let mood in this.moods) {
            this.moods[mood].has_changes = false;
        }

        try {
            const finalJson = {
                id: this.id,
                name: this.name,
                created: this.created,
                description: this.description,
                playlistId: this.playlistId,
                version: this.version,
                moods: moodsCopy
            }
            const parts = decodeURIComponent(this.path).split('/');
            const filename = parts.pop(); // "soundscape_01.json"
            const path = parts.join('/'); // "music"
            const blob = new Blob([JSON.stringify(finalJson, null, 2)], { type: 'application/json' });
            const file = new File([blob], filename, { type: 'application/json' });
            await foundry.applications.apps.FilePicker.implementation.upload('data', path, file, {}, { notify: false })
        } catch (error) {
            utils.log(utils.getCallerInfo(), `Error saving moods for ${this.name}:`, constants.LOGLEVEL.ERROR, error);
        }
        const current_play = await game.settings.get('soundscape-adventure', 'current-playing').split(",");
        if (current_play.length == 2) {
            if (current_play[0] == this.id) {
                const moodId = current_play[1];
                const mood = this.moods[moodId];
                Hooks.callAll('SoundscapeAdventure-ChangeSoundVolume', this.id, moodId, mood)
            }
        }
    }

    /**
     * SOUND CONTROLS
     */

    /**
     * Facade methods - hide internal structure from external callers
     */

    /**
     * Get a sound configuration from a mood
     * @param {string} moodId - The mood ID
     * @param {string} soundId - The sound ID
     * @returns {SoundConfig|undefined}
     */
    getSound(moodId, soundId) {
        return this.moods[moodId]?.getSound(soundId);
    }

    /**
     * Get a group configuration from a mood
     * @param {string} moodId - The mood ID
     * @param {string} groupId - The group ID
     * @returns {GroupConfig|undefined}
     */
    getGroup(moodId, groupId) {
        return this.moods[moodId]?.getGroup(groupId);
    }

    /**
     * Get a sound from the playlist
     * @param {string} soundId - The sound ID
     * @returns {PlaylistSound|undefined}
     */
    getPlaylistSound(soundId) {
        return this.playlist?.sounds.get(soundId);
    }

    /**
     * Mark a mood as having unsaved changes
     * @param {string} moodId - The mood ID
     */
    markMoodAsChanged(moodId) {
        if (this.moods[moodId]) {
            this.moods[moodId].markAsChanged();
        }
    }

    /**
     * Check if a mood exists
     * @param {string} moodId - The mood ID
     * @returns {boolean}
     */
    hasMood(moodId) {
        return !!this.moods[moodId];
    }

    /**
     * Get a mood by ID
     * @param {string} moodId - The mood ID
     * @returns {MoodConfig|undefined}
     */
    getMood(moodId) {
        return this.moods[moodId];
    }

    async enableDisableSound(moodId, soundId) {
        const mood = this.moods[moodId];
        if (mood) {
            await mood.enableDisableSound(soundId);
        } else {
            ui.notifications.error("Mood Not found: " + moodId)
        }
    }

    async enableSound(moodId, soundId) {
        const mood = this.moods[moodId];
        if (mood) {
            if (!mood.isSoundOn(soundId)) {
                mood.enableSound(soundId);
                if (mood.isPlaying()) {
                    const s = mood.getSound(soundId);
                    if (s) {
                        this.playSound(s, moodId);
                    } else {
                        utils.log(utils.getCallerInfo(), `Sound ${soundId} not found in playlist`, constants.LOGLEVEL.ERROR);
                    }
                }
            }
            mood.has_changes = true;
        } else {
            utils.log(utils.getCallerInfo(), `Sound ${soundId} not found in mood ${moodId}`, constants.LOGLEVEL.ERROR);
        }
    }

    async changeSoundVolume(moodId, soundId, newVolume, soundType) {
        const mood = this.moods[moodId];
        if (!mood) {
            ui.notifications.error(`Cannot change volume for mood ${moodId}`);
            return;
        }

        // Get old volume before modification
        const existingConfig = mood.findById(soundId);
        if (!existingConfig) {
            ui.notifications.error(`Cannot change volume for sound ${soundId}`);
            return;
        }
        const oldVolume = existingConfig.volume;
        newVolume = parseFloat(newVolume);

        // Modify and get the updated config in one call (no redundant lookup).
        // For a group this also updates the volume of every member sound.
        const soundConfig = mood.changeSoundVolume(soundId, newVolume);
        if (!soundConfig) return;

        if (Array.isArray(soundConfig.sounds)) {
            for (const member of soundConfig.sounds) {
                const playlistSound = this.playlist.sounds.get(member.id);
                if (playlistSound) {
                    await playlistSound.update({ volume: newVolume });
                }
            }
        } else {
            const playlistSound = this.playlist.sounds.get(soundConfig.id);
            if (playlistSound) {
                await playlistSound.update({ volume: newVolume });
            }
        }

        // Play/stop logic based on volume change
        if (mood.isPlaying()) {
            if (newVolume == 0) {
                this.stopSound(soundConfig, moodId);
            } else if (oldVolume == 0 && newVolume > 0) {
                this.playSound(soundConfig, moodId);
            }
        }

        Hooks.callAll('SoundscapeAdventure-ChangeSoundVolume', this.id, moodId, mood);
    }

    async stopSound(soundConfig, moodId, stop_mood = false) {
        const mood = this.moods[moodId];
        if (!mood) return;

        // Use the Strategy Pattern - get handler for this sound type
        const handler = getHandler(soundConfig.type);
        const context = {
            playlist: this.playlist,
            playlistId: this.playlistId,
            mood: mood,
            moodId: moodId,
            randomSoundManager: this.randomSoundManager
        };

        await handler.stop(soundConfig, context);
    }

    async _playSound(soundConfig, moodId, typeOverride = null) {
        const mood = this.moods[moodId];
        const handler = getHandler(typeOverride ?? soundConfig.type);
        const context = {
            playlist: this.playlist,
            playlistId: this.playlistId,
            mood: mood,
            moodId: moodId,
            randomSoundManager: this.randomSoundManager,
            playFromGroup: this.playFromGroup.bind(this)
        };

        await handler.play(soundConfig, context);
        // await sound.load();
        // sound.update({ volume: soundConfig.volume });
        // if (soundConfig.type === constants.SOUNDTYPE.GROUP_LOOP || soundConfig.type === constants.SOUNDTYPE.LOOP) {
        //     sound.update({ "repeat": true });
        // } else {
        //     sound.update({ "repeat": false });
        // }
        // await this.playlist.playSound(sound);
        // await new Promise(r => setTimeout(r, 0));
        // if (soundConfig.fadeIn > 0) {
        //     sound.sound.fade(soundConfig.volume, { duration: soundConfig.fadeIn * 1000, from: 0 })
        // }
    }

    async playSound(soundConfig, moodId) {
        const mood = this.moods[moodId];
        if (!mood) return;

        if (soundConfig.volume == 0) {
            ui.notifications.warn(`The Sound ${soundConfig.name} is muted. Change the volume before hitting play.`);
        }


        // Use the Strategy Pattern - get handler for this sound type
        const handler = getHandler(soundConfig.type);
        const context = {
            playlist: this.playlist,
            playlistId: this.playlistId,
            mood: mood,
            moodId: moodId,
            randomSoundManager: this.randomSoundManager,
            playFromGroup: this.playFromGroup.bind(this)
        };

        await handler.play(soundConfig, context);
    }

    async playFromGroup(groupId, moodId) {
        const soundGroup = await this.moods[moodId].groups.find(g => g.id == groupId);
        if (soundGroup.sounds.length > 0) {
            if (soundGroup.type == constants.SOUNDTYPE.GROUP_LOOP) {
                this._playLoopGroup(soundGroup, moodId);
            }
        }
    }

    async _playLoopGroup(groupConfig, moodId) {
        const stopSounds = await groupConfig.sounds.filter(el => el.id != groupConfig.current);
        //const playlistSound = this.playlist.sounds.get(groupConfig.current);
        for (let i = 0; i < stopSounds.length; i++) {
            await this.playlist.stopSound({ id: stopSounds[i].id });
        }
        const soundConfig = await this.moods[moodId].getSound(groupConfig.current);
        if (!soundConfig) return;
        soundConfig.fadeIn = groupConfig.fadeIn;
        soundConfig.fadeOut = groupConfig.fadeOut;
        // The current member sound carries the GROUP_LOOP type, but here it must
        // play as a single repeating loop - force the loop handler and repeat flag
        // (when reached directly via playMood/changeSoundIntensity the group handler,
        // which would normally set repeat, is bypassed).
        const currentSound = this.playlist.sounds.get(groupConfig.current);
        if (currentSound) await currentSound.update({ repeat: true });
        await this._playSound(soundConfig, moodId, constants.SOUNDTYPE.LOOP);
    }

    async changeSoundIntensity(moodId, groupId, value) {
        const mood = this.moods[moodId];
        if (!mood) return;

        // setIntensity now returns the group (no redundant lookup)
        const groupConfig = mood.setIntensity(groupId, value);

        // Sequential loop groups ignore intensity entirely.
        if (groupConfig?.isSequential()) return;

        if (mood.isPlaying() && groupConfig) {
            await this._playLoopGroup(groupConfig, moodId);
        }
    }

    /**
     * Change the playback mode of a loop group. If the mood is currently playing,
     * the group is restarted so the new mode takes effect immediately.
     */
    async setGroupPlayMode(moodId, groupId, mode) {
        const mood = this.moods[moodId];
        if (!mood) return;

        const group = mood.getGroup(groupId);
        if (!group || group.playMode === mode) return;

        const wasPlaying = mood.isPlaying() && group.status === constants.STATUS.SOUND.ON;
        if (wasPlaying) await this.stopSound(group, moodId);

        mood.setGroupPlayMode(groupId, mode);

        if (wasPlaying) await this.playSound(group, moodId);
        await this.saveMoodsConfig();
    }

    async updateSoundIcon(moodId, soundId, newIcon) {
        this.moods[moodId].updateSoundIcon(soundId, newIcon);
    }

    async updateSoundName(soundId, newName) {
        const sound = await this.playlist.sounds.get(soundId);
        if (sound) {
            sound.update({ name: newName });
            for (let key in this.moods) {
                this.moods[key].updateSoundName(soundId, newName);
            }
        }
        await this.saveMoodsConfig();
    }

    async saveExtas(moodId, soundId, new_interval, new_fade, playOnce) {
        const soundConfig = await this.moods[moodId].getSound(soundId);

        this.moods[moodId].setFade(soundId, new_fade.fadeIn, new_fade.fadeOut);
        this.moods[moodId].setInterval(soundId, new_interval.from, new_interval.to);
        this.moods[moodId].setPlayOnce(soundId, playOnce);
    }
    //moveSound(data.soundId, data.moodId, event.target.dataset.dropZone, event.target.dataset?.dropZoneCategory)
    async moveSound(soundId, moodId, target, category = 0) {
        const mood = this.moods[moodId];
        if (!mood) return;
        const targetType = target.toLowerCase();

        // Resolve the dragged item: it may be a whole group (soundId is a group id)
        // or a single sound. A single sound that belongs to a group is treated as a group move.
        let group = mood.getGroup(soundId);
        const sound = await mood.getSound(soundId);
        if (!group && sound?.group) {
            group = mood.getGroup(sound.group);
        }
        const isGroup = !!group;

        // Groups can only be dropped on the Loop or Random sections.
        if (isGroup
            && targetType != constants.SOUNDTYPE.LOOP
            && targetType != constants.SOUNDTYPE.RANDOM) {
            ui.notifications.warn(`You can only move a group to the Loop or Random sections. To move it elsewhere, move the sounds individually.`);
            return;
        }

        const sounds = isGroup ? mood.getSoundByGroup(group.id) : (sound ? [sound] : []);
        if (!isGroup && sounds.length == 0) return;

        if (targetType == constants.SOUNDTYPE.RANDOM) {
            if (isGroup) {
                group.type = constants.SOUNDTYPE.GROUP_RANDOM;
                group.category = category ? category : "";
            }
            for (let i = 0; i < sounds.length; i++) {
                const s = this.playlist.sounds.get(sounds[i].id);
                if (s) {
                    s.update({ repeat: false });
                }
                sounds[i].repeat = false;
                sounds[i].type = isGroup ? constants.SOUNDTYPE.GROUP_RANDOM : constants.SOUNDTYPE.RANDOM;
                sounds[i].category = category ? category : "";
            }
        } else if (targetType == constants.SOUNDTYPE.LOOP) {
            if (isGroup) {
                group.type = constants.SOUNDTYPE.GROUP_LOOP;
                group.category = category ? category : "";
            }
            for (let i = 0; i < sounds.length; i++) {
                const s = this.playlist.sounds.get(sounds[i].id);
                if (s) {
                    s.update({ repeat: true });
                }
                sounds[i].repeat = true;
                sounds[i].type = isGroup ? constants.SOUNDTYPE.GROUP_LOOP : constants.SOUNDTYPE.LOOP;
                sounds[i].category = category ? category : "";
            }
            // Re-pick the current sound for a loop group based on its intensity.
            if (isGroup) group._adjustIntensity();
        }
    }

    /**
     * v4: add a sound from the global Sound Library to a mood. Creates the
     * PlaylistSound in this soundscape's playlist if it isn't there yet (dedupe by
     * path), then adds a SoundConfig referencing the library entry.
     */
    async addLibrarySoundToMood(moodId, libraryId, type = constants.SOUNDTYPE.LOOP, category = "") {
        const mood = this.moods[moodId];
        if (!mood) return;
        const libSound = game.soundscapeLibrary?.getById(libraryId);
        if (!libSound) {
            ui.notifications.warn(`Sound not found in the library.`);
            return;
        }
        // Idempotent by libraryId/path: re-dragging a sound already in the mood is
        // a no-op with a friendly notice (a valid user action).
        if (mood.hasSoundFromLibrary(libraryId, libSound.path)) {
            ui.notifications.info(`"${libSound.name}" is already in this mood.`);
            return;
        }

        let ps = this.playlist.sounds.find(s => s.path === libSound.path);
        if (!ps) {
            await this.playlist.createEmbeddedDocuments("PlaylistSound", [{
                name: libSound.name,
                path: libSound.path,
                volume: 0.5,
                repeat: type === constants.SOUNDTYPE.LOOP
            }]);
            ps = this.playlist.sounds.find(s => s.path === libSound.path);
        }
        if (!ps) {
            ui.notifications.error(`Could not add "${libSound.name}" to the playlist.`);
            return;
        }

        mood.addLibrarySound({ playlistSoundId: ps.id, libraryId, name: libSound.name, path: libSound.path, type, category });
        await this.saveMoodsConfig();
        if (this.openUI) this.openUI.render(true);
    }

    /** Link a Soundpad to a mood (dragged in from the Soundpad Manager's pad list). */
    async addLinkedSoundpadToMood(moodId, padId, padName = "") {
        const mood = this.moods[moodId];
        if (!mood || !padId) return;
        if (!mood.addLinkedSoundpad(padId)) {
            ui.notifications.info(`"${padName || padId}" is already linked to this mood.`);
            return;
        }
        await this.saveMoodsConfig();
        if (this.openUI) this.openUI.render(true);
    }

    /** Unlink a Soundpad from a mood. */
    async removeLinkedSoundpadFromMood(moodId, padId) {
        const mood = this.moods[moodId];
        if (!mood) return;
        mood.removeLinkedSoundpad(padId);
        await this.saveMoodsConfig();
        if (this.openUI) this.openUI.render(true);
    }

    /**
     * v4: remove a sound from a mood. Deletes the PlaylistSound from this
     * soundscape's playlist if no other mood still references that file.
     */
    async removeSoundFromMood(moodId, soundId) {
        const mood = this.moods[moodId];
        if (!mood) return;
        const sound = mood.getSound(soundId);
        if (!sound) return;
        const path = sound.path;

        await this.stopSound(sound, moodId);
        mood.removeSoundEntry(soundId);

        const stillUsed = Object.values(this.moods).some(m => m.sounds.some(s => s.path === path));
        if (!stillUsed) {
            const ps = this.playlist.sounds.find(s => s.path === path);
            if (ps) await this.playlist.deleteEmbeddedDocuments("PlaylistSound", [ps.id]);
        }
        await this.saveMoodsConfig();
        if (this.openUI) this.openUI.render(true);
    }

    /**
     * v3 → v4 migration. Asks the user (with an optional backup), imports the
     * detected source folder(s) into the global Sound Library, then keeps only the
     * sounds the moods actually use (drops the old SOUNDPAD dump), tags each kept
     * sound with its libraryId, and trims the playlist.
     * @returns {Promise<boolean>} true if migrated, false if postponed/failed.
     */
    async migrateToV4(json) {
        const lib = game.soundscapeLibrary;
        if (!lib) {
            ui.notifications.warn(`Sound Library not ready; "${this.name}" will be migrated next time.`);
            return false;
        }

        const allPaths = [];
        for (const key in this.moods) {
            for (const s of this.moods[key].sounds) if (s.path) allPaths.push(s.path);
        }
        const roots = this._detectRoots(allPaths);

        const parts = decodeURIComponent(this.path).split('/');
        const filename = parts.pop();
        const bkName = filename.replace(/\.json$/i, '') + '-bk.json';

        const esc = foundry.utils.escapeHTML;
        const rootsHtml = roots.length
            ? `<ul>${roots.map(r => `<li><code>${esc(r)}</code></li>`).join("")}</ul>`
            : `<p><em>No source folder detected.</em></p>`;

        let result;
        try {
            result = await foundry.applications.api.DialogV2.wait({
                window: { title: `Migrate "${this.name}" to v4` },
                content: `
                    <p><b>${esc(this.name)}</b> uses the old format.<br />Migrating to v4 makes it consume the shared
                    <b>Sound Library</b>: only the sounds actually used by its moods stay in the soundscape and its
                    playlist.</p>
                    <p>These folder(s) will be imported into the library:</p>
                    ${rootsHtml}
                    <label style="display:flex;gap:.4rem;align-items:center;margin-top:.5rem">
                        <input type="checkbox" name="backup" checked> Back up the current file as <code>${esc(bkName)}</code>
                    </label>`,
                buttons: [
                    {
                        action: "migrate", label: "Migrate", icon: "fas fa-wand-magic-sparkles", default: true,
                        callback: (ev, btn) => ({ backup: btn.form.elements.backup.checked })
                    },
                    { action: "later", label: "Later", icon: "fas fa-clock" }
                ],
                rejectClose: false
            });
        } catch {
            return false;
        }
        if (!result || result === "later") return false;

        try {
            // 1. Backup the current (v3) file.
            if (result.backup) await this._backupJson(json, bkName);

            // 2. Import the detected folders into the global library.
            for (const r of roots) {
                lib.addRoot(r);
                await lib.importFolder(r);
            }

            // 3. Drop the SOUNDPAD dump; tag the kept sounds with their library id.
            for (const key in this.moods) {
                const mood = this.moods[key];
                mood.sounds = mood.sounds.filter(s => s.type !== constants.SOUNDTYPE.SOUNDPAD);
                for (const s of mood.sounds) {
                    const libSound = lib.findByPath(s.path);
                    if (libSound) s.libraryId = libSound.id;
                }
                mood.has_changes = true;
            }

            // 4. Trim the playlist to the used paths.
            const usedPaths = new Set();
            for (const key in this.moods) {
                for (const s of this.moods[key].sounds) usedPaths.add(s.path);
            }
            const toDelete = Array.from(this.playlist.sounds)
                .filter(ps => !usedPaths.has(ps.path))
                .map(ps => ps.id);
            if (toDelete.length) await this.playlist.deleteEmbeddedDocuments("PlaylistSound", toDelete);

            ui.notifications.info(`Migrated "${this.name}" to v4 — kept ${usedPaths.size} sound(s), removed ${toDelete.length} from the playlist.`);
            return true;
        } catch (err) {
            await this._migrationFailed(err, result.backup ? bkName : null);
            return false;
        }
    }

    /** Report a migration failure and point the user to GitHub issues. */
    async _migrationFailed(err, bkName) {
        utils.log(utils.getCallerInfo(), `v4 migration failed for "${this.name}"`, constants.LOGLEVEL.ERROR, err);
        const esc = foundry.utils.escapeHTML;
        const url = constants.MODULE.issuesUrl;
        const backupNote = bkName
            ? `<p>A backup was saved as <code>${esc(bkName)}</code> — your original data is safe.</p>`
            : `<p><b>No backup was made.</b> Avoid further changes to this soundscape until resolved.</p>`;
        try {
            await foundry.applications.api.DialogV2.prompt({
                window: { title: "Soundscape migration failed" },
                content: `
                    <p>Migrating <b>${esc(this.name)}</b> to v4 failed:</p>
                    <pre style="white-space:pre-wrap;max-height:8rem;overflow:auto;opacity:.85">${esc(String(err?.message ?? err))}</pre>
                    ${backupNote}
                    <p>Please open an issue so we can fix it (include the browser console log, F12):</p>
                    <p><a href="${url}" target="_blank" rel="noopener">${url}</a></p>`,
                ok: { label: "Open an issue", icon: "fab fa-github", callback: () => window.open(url, "_blank", "noopener") },
                rejectClose: false
            });
        } catch {
            ui.notifications.error(`Migration of "${this.name}" failed — please open an issue at ${url}`, { permanent: true });
        }
    }

    /**
     * Validate that this soundscape satisfies the v4 invariants. Returns a report
     * (no side effects) — handy for checking migrations. See validateAll().
     */
    validateV4() {
        const lib = game.soundscapeLibrary;
        const issues = [];
        const usedPaths = new Set();
        let soundpadDump = 0, danglingLib = 0, missingInPlaylist = 0, noLibraryId = 0, total = 0;

        for (const key in this.moods) {
            for (const s of this.moods[key].sounds) {
                total++;
                usedPaths.add(s.path);
                if (s.type === constants.SOUNDTYPE.SOUNDPAD) soundpadDump++;
                if (!s.libraryId) noLibraryId++;
                const inLib = (s.libraryId && lib?.getById(s.libraryId)) || lib?.findByPath(s.path);
                if (!inLib) danglingLib++;
                const ps = this.playlist?.sounds?.get(s.id) || this.playlist?.sounds?.find(p => p.path === s.path);
                if (!ps) missingInPlaylist++;
            }
        }
        const extras = Array.from(this.playlist?.sounds ?? []).filter(ps => !usedPaths.has(ps.path));

        if (this.version !== 4) issues.push(`version is ${this.version}, expected 4`);
        if (soundpadDump) issues.push(`${soundpadDump} leftover SOUNDPAD dump sound(s)`);
        if (danglingLib) issues.push(`${danglingLib} sound(s) not found in the library`);
        if (missingInPlaylist) issues.push(`${missingInPlaylist} sound(s) missing from the playlist`);
        if (extras.length) issues.push(`${extras.length} extra playlist sound(s) not used by any mood`);
        if (noLibraryId) issues.push(`${noLibraryId} sound(s) without a libraryId (warning)`);

        return {
            name: this.name,
            version: this.version,
            totalSounds: total,
            playlistSounds: this.playlist?.sounds?.size ?? 0,
            ok: issues.length === 0,
            issues
        };
    }

    /** Identify the source folder(s) from a set of file paths (common prefix). */
    _detectRoots(paths) {
        const dirs = [...new Set(paths.map(p => {
            const d = decodeURIComponent(p);
            const i = d.lastIndexOf("/");
            return i >= 0 ? d.slice(0, i) : "";
        }).filter(Boolean))];
        if (!dirs.length) return [];

        const split = dirs.map(d => d.split("/"));
        let prefix = split[0];
        for (const segs of split.slice(1)) {
            let i = 0;
            while (i < prefix.length && i < segs.length && prefix[i] === segs[i]) i++;
            prefix = prefix.slice(0, i);
        }
        const common = prefix.join("/");
        return common ? [common] : dirs;
    }

    /** Write the current JSON to a backup file alongside the soundscape. */
    async _backupJson(json, bkName) {
        try {
            const parts = decodeURIComponent(this.path).split('/');
            parts.pop();
            const dir = parts.join('/');
            const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
            const file = new File([blob], bkName, { type: 'application/json' });
            await foundry.applications.apps.FilePicker.implementation.upload('data', dir, file, {}, { notify: false });
            utils.log(utils.getCallerInfo(), `Backed up ${this.name} to ${bkName}`, constants.LOGLEVEL.INFO);
        } catch (e) {
            utils.log(utils.getCallerInfo(), `Backup failed for ${this.name}`, constants.LOGLEVEL.ERROR, e);
        }
    }

    async removeSoundFromGroup(moodId, soundId, groupId) {
        await this.moods[moodId].removeSoundFromGroup(soundId, groupId);
        // const sound = this.moods[moodId].getSound(soundId);
        // if (sound) {
        //     sound.group = "";
        //     if (sound.type == constants.SOUNDTYPE.GROUP_RANDOM) {
        //         sound.type = constants.SOUNDTYPE.RANDOM;
        //     } else if (sound.type == constants.SOUNDTYPE.GROUP_LOOP) {
        //         sound.type = constants.SOUNDTYPE.LOOP;
        //     }
        //     await this.saveMoodsConfig();
        // }
    }

    async deleteGroup(moodId, groupId) {
        const mood = this.moods[moodId];
        if (!mood) return;
        const group = mood.getGroup(groupId);
        if (!group) {
            ui.notifications.error(`Cannot delete group ${groupId}. Group not found.`);
            return;
        }
        // stop the group if it's currently playing so the scheduler/playlist clean up
        if (group.status == constants.STATUS.SOUND.ON) {
            await this.stopSound(group, moodId);
        }
        mood.removeGroup(groupId);
        await this.saveMoodsConfig();
    }

    async addSoundToNewGroup(moodId, soundId, groupName) {
        await this.moods[moodId].createGroup(groupName, soundId);
        return;
    }

    async addSoundToGroup(moodId, soundId, groupId) {
        const sound = await this.moods[moodId].getSound(soundId);
        const group = await this.moods[moodId].getGroup(groupId);

        if (!sound || !group) {
            ui.notifications.error(`Cannot add sound to group ${groupId}. Sound or Group not found.`);
            return;
        }
        // if we add a random sound to a group and that sound is playing we need to stop it.
        if (sound.type == constants.SOUNDTYPE.RANDOM && sound.status == constants.STATUS.SOUND.ON) {
            this.randomSoundManager.stop(this.playlistId, sound.id);
        }
        // if the group we are adding the new sound is playing, we have to stop, add the sound and restart it.
        if (group.status == constants.STATUS.SOUND.ON && group.type == constants.SOUNDTYPE.GROUP_RANDOM) {
            const grupoofsounds = await group.sounds.map(sound => sound.id);
            this.randomSoundManager.stop(this.playlistId, grupoofsounds);
        }
        // await this.moods[moodId].addSoundToGroup(soundId, groupId);
        group.addSound({ id: sound.id, name: sound.name });
        sound.group = group.id;
        this.moods[moodId].has_changes = true;
        // restart  the group random
        if (group.status == constants.STATUS.SOUND.ON && group.type == constants.SOUNDTYPE.GROUP_RANDOM && this.moods[moodId].status == constants.STATUS.MOOD.PLAYING) {
            const groupOfSounds = group.sounds.map(sound => sound.id);
            this.randomSoundManager.start(
                this.playlistId,
                groupOfSounds,
                group.random.from,
                group.random.to,
                group.volume,
                group.playOnce);
        }
    }

    /**
     * TRIGGER
     */

    async playCombatTriggerEvent(event) {
        for (let key in this.moods) {
            this.playCustomTriggerEvent(event, key);
        }
    }
    async playCustomTriggerEvent(event, moodId) {

        const triggerSettings = game.settings.get(constants.STORAGETRIGGERSETTINGS, "triggerSettings");
        const moodTriggers = triggerSettings[moodId];
        let groups = [];

        if (moodTriggers) {
            for (let soundId in moodTriggers) {
                if (soundId == "mood") {
                    const triggers = moodTriggers[soundId];
                    for (let i = 0; i < triggers.length; i++) {
                        if (triggers[i].on == event.region.id && triggers[i].event == event.name) {
                            if (triggers[i].action == "play") {
                                this.playMood(moodId, true);
                            } else if (triggers[i].action == "stop") {
                                this.stopMood(moodId);
                            }
                        }
                    }

                } else {
                    if (this.moods[moodId].status != constants.STATUS.MOOD.PLAYING) continue;
                    const soundConfig = await this.moods[moodId].getSound(soundId);
                    //const triggerConfig = moodTriggers[soundId];
                    const triggers = moodTriggers[soundId];
                    for (let i = 0; i < triggers.length; i++) {
                        if (triggers[i].on == event.region.id && triggers[i].event == event.name) {
                            if (triggers[i].action == "play") {
                                this.playSound(soundConfig, moodId);
                            } else if (triggers[i].action == "stop") {
                                this.stopSound(soundConfig, moodId);
                            }
                        }
                    }
                }
            }
        }
    }
    async saveTrigger(moodId, soundId, triggers) {
        let triggerSettings = game.settings.get(constants.STORAGETRIGGERSETTINGS, "triggerSettings");
        if (!triggerSettings[moodId]) {
            triggerSettings[moodId] = {};
        }
        if (soundId == "mood") {
            triggerSettings[moodId]["mood"] = triggers;
        } else {
            const soundConfig = await this.moods[moodId].getSound(soundId);
            triggerSettings[moodId][soundId] = triggers
            if (soundConfig.group != "") {
                const sounds = this.moods[moodId].getSoundByGroup(soundConfig.group);
                for (let i = 0; i < sounds.length; i++) {
                    triggerSettings[moodId][sounds[i].id] = triggers;
                }
            }
        }
        game.settings.set(constants.STORAGETRIGGERSETTINGS, "triggerSettings", triggerSettings);
    }

    async removeAllTriggers(moodId) {
        let triggerSettings = game.settings.get(constants.STORAGETRIGGERSETTINGS, "triggerSettings");

        if (triggerSettings[moodId]) {
            const tr = triggerSettings[moodId];
            for (let key in triggerSettings[moodId]) {
                delete triggerSettings[moodId][key];
            }
            game.settings.set(constants.STORAGETRIGGERSETTINGS, "triggerSettings", triggerSettings);
        }
    }

    async cloneMood(moodId, newName) {
        utils.log(utils.getCallerInfo(), `Cloning mood ${moodId} to ${newName}`);
        const mood = this.moods[moodId];
        if (mood) {
            const newMood = new MoodConfig(mood.toJSON(), this.playlist, "stop");
            //await newMood.consistence(this.playlist);
            newMood.name = newName;
            newMood.id = foundry.utils.randomID(16);
            this.moods[newMood.id] = newMood;
            this.saveMoodsConfig();
            Hooks.callAll("SoundscapeAdventure-UpdateSidebar", "", newMood);
            return newMood;
        } else {
            utils.log(utils.getCallerInfo(), `Mood ${moodId} not found`, constants.LOGLEVEL.ERROR);
        }
    }

    render(current_playing) {
        const directoryItem = document.createElement('li');
        directoryItem.className = 'directory-item document playlist flexrow';
        directoryItem.dataset.entryId = this.id;
        directoryItem.dataset.documentId = this.id;
        directoryItem.style.display = 'flex';
        // Create the header element
        const header = document.createElement('header');
        header.className = 'playlist-header flexrow';
        header.style.width = '100%';

        // Create the title h4 element
        const title = document.createElement('h4');
        title.className = 'entry-name playlist-name';
        title.draggable = true;
        title.style.color = 'var(--color-text-emphatic)';
        title.style.flex = '3';

        // // Create the collapse icon
        const playlistSounds = document.createElement('ol');
        const collapseIcon = document.createElement('i');
        collapseIcon.className = 'collapse fa fa-angle-down';
        collapseIcon.addEventListener('click', (ev) => {
            playlistSounds.classList.toggle("hidden");
            if (collapseIcon.className.includes("down")) {
                collapseIcon.className = 'collapse fa fa-angle-up';
            } else {
                collapseIcon.className = 'collapse fa fa-angle-down';
            }
        });

        // // Add the collapse icon and text to the title
        title.appendChild(collapseIcon);
        title.appendChild(document.createTextNode(` ${this.name}`));

        // Create the controls div
        const controls = document.createElement('div');
        controls.className = 'playlist-controls flexrow';
        controls.style.textAlign = 'center';
        controls.style.alignItems = 'center';
        controls.style.justifyContent = 'center';
        controls.style.gap = '5px';

        // Create the speaker control
        const speakerControl = document.createElement('a');
        speakerControl.className = 'soundboard-control fa-solid fa-speaker';
        speakerControl.style.fontSize = 'medium';
        speakerControl.dataset.action = 'soundscape-open';
        speakerControl.dataset.tooltip = 'Open Soundscape';
        speakerControl.dataset.soundboardId = this.id;

        // Create the reload control
        const reloadControl = document.createElement('a');
        reloadControl.className = 'soundboard-control fa-solid fa-rotate-right';
        reloadControl.style.fontSize = 'medium';
        reloadControl.dataset.action = 'soundscape-reload';
        reloadControl.dataset.tooltip = 'Reload Soundscape';
        reloadControl.dataset.soundboardId = this.id;

        // Create the delete control
        const deleteControl = document.createElement('a');
        deleteControl.className = 'soundboard-control fa-solid fa-trash';
        deleteControl.style.fontSize = 'medium';
        deleteControl.dataset.action = 'soundscape-remove';
        deleteControl.dataset.tooltip = 'Delete Soundscape';
        deleteControl.dataset.soundboardId = this.id;

        // Add the controls to the controls div
        controls.appendChild(speakerControl);
        controls.appendChild(reloadControl);
        controls.appendChild(deleteControl);

        // Add the title and controls to the header
        header.appendChild(title);
        header.appendChild(controls);

        // Create the playlist sounds list
        playlistSounds.className = 'playlist-sounds';
        playlistSounds.style.textAlign = 'left';
        playlistSounds.style.width = '100%';

        // order moods by name
        const orderedMoods = Object.values(this.moods).sort((a, b) => a.name.localeCompare(b.name));

        for (const key in orderedMoods) {
            const id = orderedMoods[key].id;
            try {
                playlistSounds.appendChild(this.moods[id].render(this.id, current_playing));
            } catch (error) {
                console.warn(`Mood ${id} does not have a render method.`);
                console.warn(error);
            }
        }
        directoryItem.appendChild(header);
        directoryItem.appendChild(playlistSounds);
        return directoryItem;
    }

    async dialogCloneMood() {
        const moods = Object.values(this.moods);
        const options = moods.map(mood => `<option value="${mood.id}">${mood.name}</option>`).join('')
        let newMood = [];
        try {
            newMood = await foundry.applications.api.DialogV2.prompt({
                window: { title: "Select a name for the new mood" },
                content: `<select id="originalmood" name="originalmood" class="form-control">
                ${options}
            </select>
              <input id="moodname" name="moodname" value="" placeholder="Mood name">`,
                ok: {
                    label: "Clone Mood",
                    callback: (event, button, dialog) => [button.form.elements.moodname.value, button.form.elements.originalmood.value]
                }
            }, { parent: this });
        } catch {
            return;
        }
        if (!newMood || newMood.length < 2) {
            ui.notifications.warn("Error cloning a mood.");
            return;
        } else {

            if (newMood[0].trim() == "") {
                ui.notifications.warn("You must provide a name for the new mood.");
            } else {
                await this.cloneMood(newMood[1], newMood[0]);
            }
        }

    }

    async dialogNewMood() {
        let newMoodName = "";
        try {
            newMoodName = await foundry.applications.api.DialogV2.prompt({
                window: { title: "Select a name for the new mood" },
                content: `<input id="moodname" name="moodname" value="" placeholder="Mood name" autofocus>`,
                ok: {
                    label: "New Mood",
                    callback: (event, button, dialog) => button.form.elements.moodname.value
                }
            }, { parent: this });
        } catch {
            return;
        }
        if (!newMoodName || newMoodName.trim() === "") {
            ui.notifications.warn("You must provide a name for the new mood.");
            return;
        } else {
            await this.newMood(newMoodName);
        }
    }

    async dialogDeleteMood(moodId) {
        const name = this.moods[moodId].name;
        const response = await foundry.applications.api.DialogV2.confirm({
            content: `Are you sure you want to delete the mood ${name}?`,
            rejectClose: false,
            modal: true
        }, { parent: this });

        if (response) {
            await this.deleteMood(moodId);
            return true;
        }
        return false;
    }

    async createCategory(moodId, type, categoryName) {

        const id = foundry.utils.randomID(16);
        this.moods[moodId].categories.push({ id: id, name: categoryName, type: type, collapsed: false });
        return id;
    }

    async renameCategory(moodId, categoryId, newCategoryName) {
        const index = this.moods[moodId].categories.findIndex(el => el.id == categoryId);
        if (index) {
            this.moods[moodId].categories[index].name = newCategoryName;
        }
        this.moods[moodId].has_changes = true;
    }

    async playStopCategory(moodId, categoryId, action) {
        if (this.moods[moodId].isPlaying()) {
            const category = this.moods[moodId].categories.find(el => el.id == categoryId);
            const all_categories_same_name = this.moods[moodId].categories.filter(el => el.name == category.name);
            for (const cat of all_categories_same_name) {
                const sounds = await this.moods[moodId].getSoundByCategory(cat.id, true);
                if (action == "stop") {
                    for (const sound of sounds) {
                        await this.stopSound(sound, moodId, false);
                    }
                } else {
                    for (const sound of sounds) {
                        await this.playSound(sound, moodId);
                    }
                }
            }
        } else {
            ui.notifications.warn("Mood is currently stop")
        }
    }

    async enableSoundsinCategory(moodId, categoryId) {
        const sounds = await this.moods[moodId].getSoundByCategory(categoryId, false);
        for (const sound of sounds) {
            await this.enableSound(moodId, sound.id);
        }
    }

    async deleteCategory(moodId, categoryId) {
        const sounds = await this.moods[moodId].getSoundByCategory(categoryId, false);
        for (const sound of sounds) {
            sound.category = "";
        }
        const index = this.moods[moodId].categories.findIndex(el => el.id == categoryId);

        if (index > 0) {
            this.moods[moodId].categories.splice(index, 1);
        }

        this.moods[moodId].has_changes = true;
    }

    //the following functions are used by external modules
    getMoods() {
        return Object.values(this.moods).map(obj => obj.name);
    }
    async playStopMoodByName(moodName, force = false) {
        const mood = Object.values(this.moods).find(m => m.name.toLowerCase() == moodName.toLowerCase());
        if (mood) {
            this.playStopMood(mood.id, force);
        } else {
            ui.notifications.warn(`Mood ${moodName} not found in Soundscape ${this.name}`);
        }
    }
    // read all ogg, mp3, wav files from a folder and add them to a list of paths to include in the playlist
    async addSoundsToPlaylist(folderPath, loadSubfolders) {
        const paths = [];
        const browseOptions = { recursive: loadSubfolders };
        const filePickerResult = await foundry.applications.apps.FilePicker.browse('data', folderPath, browseOptions);

        const soundFileRegex = /\.(mp3|ogg|wav)$/i;
        for (const file of filePickerResult.files) {
            if (soundFileRegex.test(file)) {
                paths.push(file);
            }
        }
        if (paths.length > 0)
            await this.playlist.bulkImportSounds(paths);
        const dirs = filePickerResult.dirs;
        if (loadSubfolders && dirs.length > 0) {
            for (const dir of dirs) {
                const subfolderPaths = await this.addSoundsToPlaylist(dir, loadSubfolders);
            }
        }
    }

    async toggleCategoryCollapsed(moodId, categoryId) {
        this.moods[moodId].toggleCategoryCollapsed(categoryId);
    }
}