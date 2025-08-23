import SoundscapeUI from "./soundscape-ui.mjs";
import utils from './utils/utils.mjs';
import constants from "./utils/constants.mjs";
import Soundscape from "./soundscape.mjs";

class SoundscapeAdventure {
    path;
    soundboards = {};
    globalSoundscape = {};
    ui_soundscape_messages = [];
    soundscapes = {};

    constructor() {
        if (SoundscapeAdventure.instance) {
            return SoundscapeAdventure.instance;
        }

        SoundscapeAdventure.instance = this;
        return this;
    }

    async init() {
    }

    async loadSoundscape(path_To_file) {
        utils.log(utils.getCallerInfo(), `Loading soundscape from ${path_To_file}`, constants.LOGLEVEL.INFO);
        const sb = new Soundscape(path_To_file);
        await sb.init();
        this.soundscapes[sb.id] = {
            name: sb.name,
            class: sb,
        }
        let soundscapes = game.settings.get('soundscape-adventure','soundscapes');
        if (soundscapes.length > 0 && !soundscapes.includes(path_To_file)) {
            soundscapes += ";"+path_To_file
        } else {
            soundscapes = path_To_file
        }
        game.settings.set('soundscape-adventure','soundscapes', soundscapes);
        utils.log(utils.getCallerInfo(), `Saving soudscapes ${soundscapes}`, constants.LOGLEVEL.INFO);
        return true
    }

    async _save() {
        utils.log(utils.getCallerInfo(), `Saving Soundboard Adventure configuration to ${this.path}`)
        const soundboardData = [];
        for (let i = 0; i < this.soundboards.length; i++) {
            soundboardData.push({
                name: this.soundboards[i].name,
                path: this.soundboards[i].path,
                status: "offline"
            })
        }
        try {
            const blob = new Blob([JSON.stringify(soundboardData, null, 2)], { type: 'application/json' });
            const file = new File([blob], this.configurationFile, { type: 'application/json' });
            await FilePicker.upload('data', this.path, file)
        } catch (error) {
            utils.log(utils.getCallerInfo(), `Error saving Soundboard Adventure configuration to ${this.path}`, constants.LOGLEVEL.ERROR, error);
        }
    }

    openSoundboard(soundscapeId) {
        utils.log(utils.getCallerInfo(), `Opening ${soundscapeId}`)
        const sb = this.soundscapes[soundscapeId];
        if (sb) {
            const ui = new SoundscapeUI(sb);
            this.soundscapes[soundscapeId].openUI = ui;
            ui.render(true);
        }
    }
    async reloadSoundboard(soundscapeId) {
        utils.log(utils.getCallerInfo(), `Reloading ${soundscapeId}`)
        const sb = this.soundscapes[soundscapeId];
        if (sb) {
            await sb.class.reloadSoundscape();
        }
    }
    closeUI(soundscapeId) {
        this.soundscapes[soundscapeId].openUI = null;
    }

    triggerEvent(action, _data, event) {
        const data = _data.split(":");
        if (action == "play") {
            this.soundscapes[data[0]].class.playMood(data[1]);
        } else if (action == "stop") {
            this.soundscapes[data[0]].class.stopMood(data[1]);
        } else if (action == "custom") {
            // event.name event.region.name , 
            this.soundscapes[data[0]].class.playCustomTriggerEvent(event, data[1])
        }
    }

    triggerCombatEvent(event) {
        for (let key in this.soundscapes) {
            this.soundscapes[key].class.playCombatTriggerEvent(event);
        }
    }

    async deleteSoundscape(soundspaceId, remove_playlist = false) {
        if (this.soundscapes[soundspaceId].openUI) {
            this.soundscapes[soundspaceId].openUI.close();
        }
        
        const current_soundscapes = await game.settings.get('soundscape-adventure', 'soundscapes');
        utils.log(utils.getCallerInfo(), `Current soundscapes ${current_soundscapes}`, constants.LOGLEVEL.INFO);
        const soundscapes = current_soundscapes.split(";");
        for (let i = 0; i < soundscapes.length; i++) {
            if (this.soundscapes[soundspaceId].class.path.includes(soundscapes[i])) {
                soundscapes.splice(i, 1);
                if (remove_playlist) {
                    
                    const playlist = game.playlists.get(this.soundscapes[soundspaceId].class.playlist.id);

                    if (playlist) {
                        await playlist.delete();
                    }
                }
                delete this.soundscapes[soundspaceId];
            }
        }
        await game.settings.set('soundscape-adventure', 'soundscapes', soundscapes.join(";"));
    }

    // Below are some utility methods for external modules access the soundscapes
    getSoundscapes() {
        return Object.values(this.soundscapes).map(obj => obj.name);
    }

    getSoundscape(soundscapeName) {
        const obj = Object.values(this.soundscapes).filter(obj => obj.name.includes(soundscapeName));
        if (obj.length > 0) {
            return obj[0].class;
        }
    }
}

const instance = new SoundscapeAdventure();
Object.freeze(SoundscapeAdventure); // Optional: to make the instance immutable

export default instance;