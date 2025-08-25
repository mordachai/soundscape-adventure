import constants from "./utils/constants.mjs";
import utils from "./utils/utils.mjs";
class SoundConfig {

    constructor(obj) {
        this.id = obj.id;
        this._id = obj._id;
        this.status = obj.status;
        this.group = obj.group;
        this.name = obj.name;
        this.description = obj.description;
        this.path = obj.path;
        this.repeat = obj.repeat;
        this.volume = obj.volume;
        this.type = obj.type
        this.group = obj.group
        this.intensity = obj.intensity
        this.to = Object.hasOwn(obj, 'to') ? obj.to : 60,
            this.from = Object.hasOwn(obj, 'from') ? obj.from : 10,
            this.fadeIn = Object.hasOwn(obj, 'fadeIn') ? obj.fadeIn : 0,
            this.fadeOut = Object.hasOwn(obj, 'fadeOut') ? obj.fadeOut : 0,
            this.playOnce = Object.hasOwn(obj, 'playOnce') ? obj.playOnce : false
        this.category = Object.hasOwn(obj, 'category') ? obj.category : ""
        this.soundIcon = Object.hasOwn(obj, 'soundIcon') ? obj.soundIcon : "";
    }
}


export default class MoodConfig {
    id;
    name;
    status;
    sounds;
    active_groups;
    groups = []; // TODO example: { id: "xgkgit", name: "Rain", type: constants.SOUND_TYPE.RANDOM_GROUP, fade_in, fade_out,   }
    categories = []; //  example: { id: "1Y6Y8abJ1KlMiVgc", name: "Songs", type: "1", collapsed: false }
    has_changes = false;
    // TODO update file sound path
    constructor(moodConfig, playlist, _status = "stop") {
        utils.log(utils.getCallerInfo(), `MoodConfig:`, constants.LOGLEVEL.INFO);
        //
        this.id = moodConfig.id;
        this.name = moodConfig.name;
        this.status = moodConfig.status;
        this.active_groups = moodConfig.active_groups ? moodConfig.active_groups : [];
        this.sounds = [];
        this.categories = moodConfig?.categories ? moodConfig.categories : [];
        const soundpadui = this.categories.filter(el => el.type == constants.SOUNDTYPE.SOUNDPADUI);
        if (soundpadui.length == 0) {
            this.categories.push({ id: "", name: "None", type: constants.SOUNDTYPE.SOUNDPADUI, collapsed: false, sounds: [] })
        }
        //this.groups = moodConfig?.groups ? moodConfig.groups : [];
        const _sounds = moodConfig.sounds.slice();
        for (let i = 0; i < _sounds.length; i++) {
            if (_sounds[i].hasOwnProperty('group')) {
                if (!this.groups.includes(_sounds[i].group) && _sounds[i].group != "") {
                    this.groups.push(_sounds[i].group);
                }
            }
            if (_sounds[i].hasOwnProperty('status')) {
                this.sounds.push(new SoundConfig(_sounds[i]));
            } else {
                _sounds[i].status = "off";
                this.sounds.push(new SoundConfig(_sounds[i]));
            }

        }
    }

    async registerSound(sound, playlist) {
        await playlist.createEmbeddedDocuments("PlaylistSound", [{
            id: sound.id,
            name: sound.name,
            path: sound.path,
            repeat: sound.repeat,
            volume: sound.volume,
        }]);
        const finalSound = await playlist.sounds.find(el => el.path == sound.path);
        return finalSound.id;
    }

    render(id, current_playing) {
        const moodRender = document.createElement('li');
        moodRender.id = this.name;
        moodRender.className = 'playlist-mood flexrow';
        moodRender.dataset.soundboardId = id;
        moodRender.dataset.moodId = this.id;
        moodRender.style.display = 'flex';

        // Create the strong text for Peaceful Day
        const moodRenderText = document.createElement('strong');
        moodRenderText.textContent = this.name;

        // Create sound controls for Peaceful Day
        const moodRenderControls = document.createElement('div');
        moodRenderControls.className = 'mood-controls flexrow';
        moodRenderControls.dataset.soundscapeId = id;
        moodRenderControls.dataset.moodId = this.id;
        moodRenderControls.style.textAlign = 'right';
        moodRenderControls.style.maxWidth = '50px';

        // Create delete control for Peaceful Day
        const moodRenderDeleteControl = document.createElement('a');
        moodRenderDeleteControl.className = 'soundscape-tab-button mood-control fa-solid fa-trash';
        moodRenderDeleteControl.dataset.action = 'deleteMood';
        moodRenderDeleteControl.dataset.tooltip = 'Delete Mood';
        moodRenderDeleteControl.dataset.soundscapeId = id;
        moodRenderDeleteControl.dataset.moodId = this.id;

        // Create play control for Peaceful Day
        const moodRenderPlayControl = document.createElement('a');
        if (this.status == "playing") {
            moodRenderPlayControl.className = 'soundscape-tab-button mood-control fas fa-stop item-active';
        } else {
            moodRenderPlayControl.className = 'soundscape-tab-button mood-control fas fa-play';
        }
        moodRenderPlayControl.dataset.action = 'playStopMood';
        moodRenderPlayControl.dataset.tooltip = 'Play Mood';
        moodRenderPlayControl.dataset.soundboardId = id;
        moodRenderPlayControl.dataset.moodId = this.id;

        // Add controls to Peaceful Day
        moodRenderControls.appendChild(moodRenderDeleteControl);
        moodRenderControls.appendChild(moodRenderPlayControl);
        moodRender.appendChild(moodRenderText);
        moodRender.appendChild(moodRenderControls);
        return moodRender;

    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            status: this.status,
            categories: this.categories,
            active_groups: this.active_groups,
            sounds: this.sounds
        }
    }

    // validate files for sounds in the mood exist
    async consistence(playlist) {
        // validates if all sounds in the mood are in the playlist
        for (let i = 0; i < this.sounds.length; i++) {
            const playlistsound = playlist.sounds.find(el => el.path == this.sounds[i].path);
            if (!playlistsound) {
                this.has_changes = true;
                const response = await fetch(this.sounds[i].path, { method: 'HEAD' });
                if (!response.ok) {
                    // Log or notify about the missing file, but do not stop execution
                    ui.notifications.warn(`Sound not found ${this.sounds[i].path}. Removing from the soundscape.`);
                    this.sounds.splice(i,1);
                } else {
                    // Only load if the file was found
                    this.sounds[i].id = await this.registerSound(this.sounds[i], playlist);
                    utils.log(utils.getCallerInfo(),`Had to register a new audio: ${this.sounds[i].path}`, constants.LOGLEVEL.INFO);
                }
            } else {
                this.sounds[i].id = playlistsound.id;
            }
        }

        // validates if all sounds in the playlist are in the mood
        const plSounds = Array.from(playlist.sounds)
        for (let i = 0; i < plSounds.length; i++) {
            const sound = this.sounds.find(el => el.path == plSounds[i].path);
            if (!sound) {
                this.sounds.push(new SoundConfig({
                    id: plSounds[i].id,
                    _id: plSounds[i].id,
                    status: "off",
                    group: "",
                    name: plSounds[i].name,
                    description: "",
                    path: plSounds[i].path,
                    repeat: false,
                    volume: "0.0",
                    type: constants.SOUNDTYPE.SOUNDPAD,
                    intensity: "",
                    to: 0,
                    from: 0,
                    fadeIn: 0,
                    fadeOut: 0,
                    playOnce: false,
                    category: ""
                }));

            }
        }

        return;
    }

    async validateFileExists(filePath) {
        const directory = filePath.substring(0, filePath.lastIndexOf('/'));
        const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

        try {
            const result = await foundry.applications.apps.FilePicker.browse("data", directory);

            if (result.files.includes(filePath)) {
                return true;
            } else {
                return false;
            }
        } catch (error) {
            return false;
        }
    }

    // adds to the playlist custom sounds
    // sounds that aren't part of the folder
    async updatePlaylist(playlist) {
        utils.log("Not implemented yet", constants.LOGLEVEL.INFO);
    }

    isSoundOn(soundId) {
        const sound = this.sounds.find(obj => obj.id == soundId);
        if (sound.status == "on") {
            return true;
        }
        return false;
    }

    disableSound(_id) {
        const sound = this.sounds.find(obj => obj.id == _id);
        if (sound) {
            if (sound.group != "") {
                this.disableSoundByGroup(sound.group);
            } else {
                sound.status = "off";
            }
        }
    }

    enableSound(_id) {
        const sound = this.sounds.find(obj => obj.id == _id);
        if (sound) {
            if (sound.group != "") {
                this.enableSoundByGroup(sound.group);
            } else {
                sound.status = "on";
            }
        }
    }

    getEnabledSounds() {
        return this.sounds.filter(obj => obj.status == "on");
    }

    getSoundByCategory(category, enable_sounds = false) {
        if (enable_sounds) {
            return this.sounds.filter(obj => obj.status == "on" && obj.category == category);
        }
        return this.sounds.filter(obj => obj.category == category);
    }

    getSound(soundId) {
        const sound = this.sounds.find(obj => obj.id == soundId);
        return sound;
    }
    getSoundByGroup(group) {
        return this.sounds.filter(obj => obj.group == group);
    }
    enableSoundByGroup(group) {
        const sounds = this.sounds.filter(obj => obj.group == group);
        for (let i = 0; i < sounds.length; i++) {
            sounds[i].status = "on";
        }
        this.active_groups.push(group);
    }
    disableSoundByGroup(group) {
        const sounds = this.sounds.filter(obj => obj.group == group);
        for (let i = 0; i < sounds.length; i++) {
            sounds[i].status = "off";
        }

    }

    changeSoundVolume(soundId, volume) {
        let sound = this.sounds.find(obj => obj.id == soundId);
        if (sound) {
            sound.volume = volume;
        }
    }

    updateSoundName(soundId, newName) {
        const sound = this.sounds.find(obj => obj.id == soundId);
        sound.name = newName;
    }

    updateSoundIcon(soundId, newIcon) {
        const sound = this.sounds.find(obj => obj.id == soundId);
        sound.soundIcon = newIcon;
    }

    isPlaying() {
        return this.status == "playing";
    }
}
