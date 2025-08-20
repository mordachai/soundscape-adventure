import Soundscape from "./soundscape.mjs";
import SoundscapeAdventure from "./soundscape-adventure.mjs";
import constants from "./utils/constants.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

/**
 * SoundpadUI as a Foundry Application using Handlebars templates.
 */
export default class SoundpadUI extends HandlebarsApplicationMixin(ApplicationV2) {
    static PARTS = {
        foo: { template: 'modules/soundscape-adventure/templates/soundpad-ui.hbs' }
    }
    static DEFAULT_OPTIONS = {
        id: "soundpad-ui",
        window: {
            title: "🎛️ Soundpad UI",
        },
        classes: ["soundpad-ui"]
    }
    constructor(options = {}) {
        super(options);
        this.count = 0;
        this.isUpdating = false;
    }

    // static get defaultOptions() {
    //     return foundry.utils.mergeObject(super.defaultOptions, {
    //         id: "soundpad-ui",
    //         template: "modules/soundscape-adventure/templates/soundpad-ui.hbs",
    //         classes: ["soundpad-ui"],
    //         popOut: false,
    //         width: 400,
    //         height: "auto",
    //         left: 0,
    //         top: 500, // TODO: make configurable
    //         zIndex: 1000,
    //         resizable: false,
    //     });
    // }

    async _preparePartContext(partId, context) {
        context.partId = `${this.id}-${partId}`;
        return context;
    }
    /**
     * Prepare data for the template.
     */
    async _prepareContext(options) {
        const canModify = game.user.isGM || game.user.hasRole("ASSISTANT");
        let config_category = game.settings.get('soundscape-adventure', "configCategory");
        if (!config_category) {
            ui.notifications.warn("No soundpad UI category configured. Using all sounds without category.");
            config_category = "";
        }
        const soundscapes = SoundscapeAdventure.soundscapes;
        let name = "";
        let sounds = [];
        for (const soundscapeId in soundscapes) {
            const soundscape = soundscapes[soundscapeId];
            if (soundscape.class.isPlaying) {
                const mood = soundscape.class.moods[soundscape.class.activeMoodId];
                if(mood) {
                    sounds = mood.sounds.filter(sound => sound.type === constants.SOUNDTYPE.SOUNDPADUI);
                    name = mood.name;
                    this.soundscape = soundscape.class;
                }
            }
        }
        const imgs = [];
        const buttonsPerColumn = 10;
        const columns = Math.ceil(sounds.length / buttonsPerColumn);
        return {
            canModify,
            sounds,
            imgs,
            buttonsPerColumn,
            columns,
            name
        };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const buttons = this.element.querySelectorAll('.soundpad-btn1');
        buttons.forEach(button => {
            button.addEventListener('click', async (event) => {
                if (!this.soundscape.activeMoodId) return;
                const btn = event.currentTarget;
                btn.style.opacity = 1;
                const idx = parseInt(event.currentTarget.dataset.idx);
                const sound = context.sounds[idx];
                const playlist = this.soundscape.playlist;
                const playlistSound = await playlist.sounds.find(s => s.id === sound.id);
                await playlistSound.load();
                console.warn("Playlist sound", playlistSound);
                console.warn("Sound", sound);
                console.warn("btn", btn);
                const icon = btn.querySelector('i');
                if (!playlistSound) {
                    console.warn("Sound not found in playlist");
                    return;
                }
                if (sound && !playlistSound.playing) {
                    console.warn("Playing sound", sound);
                    // before playing, make sure it isn't configured as a loop sound
                    await this.soundscape.playSound(sound, this.soundscape.activeMoodId);
                    btn.style.backgroundColor = "#c9593f";

                    //icon.classList.toggle('fa-play', !playlistSound.playing);
                    icon.className = "fas fa-stop";
                    setTimeout(() => {
                        playlistSound.sound.addEventListener(
                            'end',
                            (event) => {
                                btn.style.backgroundColor = "";
                                icon.className = "fas fa-play";
                                btn.style.opacity = 0.5;
                            }
                        );
                        playlistSound.sound.addEventListener(
                            'stop',
                            (event) => {
                                btn.style.backgroundColor = "";
                                icon.className = "fas fa-play";
                                btn.style.opacity = 0.5;
                            }
                        )
                    }, 100);

                } else if (sound && playlistSound.playing) {
                    await this.soundscape.stopSound(sound, this.soundscape.activeMoodId);
                    btn.style.backgroundColor = "";
                    icon.className = "fas fa-play";
                }
            });
            button.addEventListener('contextmenu', async (event) => {
                if (!this.soundscape.activeMoodId) return;
                event.preventDefault(); // stop context menu

                const idx = parseInt(event.currentTarget.dataset.idx);
                const sound = context.sounds[idx];
                const playlist = this.soundscape.playlist;
                const playlistSound = playlist.sounds.find(s => s.id === sound.id);

                // Remove any existing sliders first
                //soundselected
                const currentBar = this.element.querySelector('.soundpad-volume2-slider');
                currentBar.style.display = 'flex';
                //currentBar.querySelector('.soundpad-volume-label').textContent = playlistSound.name;
                // Remove any existing slider
                let slider = currentBar.querySelector('input[type="range"]');
                if (slider) slider.remove();

                // Create and add new slider
                slider = document.createElement('input');
                slider.type = 'range';
                slider.min = 0;
                slider.max = 1;
                slider.step = 0.01;
                slider.style.marginTop = "100px";
                slider.className = 'soundpad-volume-slider-input';
                slider.style.writingMode = "bt-lr";
                slider.style.transform = "rotate(270deg)";
                slider.style.width = "200px";
                slider.style.boxShadow = "rgb(243 240 240 / 35%) 0px 0px 5px 0px";
                
                let volume_label = currentBar.querySelector('.soundpad-volume-label');
                if (!volume_label) {
                    volume_label = document.createElement('span');
                volume_label.className = 'soundpad-volume-label';
                volume_label.style.display = 'block';
                volume_label.style.textAlign = 'center';
                volume_label.textContent = `Volume`;
                currentBar.appendChild(volume_label);
                }
                

                currentBar.appendChild(slider);
                let volume_value = currentBar.querySelector('.soundpad-volume-value');
                if (!volume_value) {
                    volume_value = document.createElement('span');
                volume_value.className = 'soundpad-volume-value';
                volume_value.style.display = 'block';
                volume_value.style.textAlign = 'center';
                volume_value.style.marginTop = "100px";
                }
                volume_value.textContent = `${parseInt(sound.volume * 100)} %`;
                currentBar.appendChild(volume_value);
                
                let label = this.element.querySelector('.soundpad-label');
                label.style.whiteSpace= "nowrap";
                label.style.display = 'block';
                label.style.textAlign = 'center';
                label.textContent = playlistSound.name;
                //currentBar.appendChild(label);
                const listener = async () => {
                    if (playlistSound) {
                        this.soundscape.changeSoundVolume(this.soundscape.activeMoodId, sound.id, parseFloat(slider.value));
                        await playlistSound.update({ volume: parseFloat(slider.value) });
                        volume_value.textContent = `${parseInt(slider.value * 100)} %`;   
                    }
                }
                slider.value = parseFloat(sound?.volume) ?? 1;
                slider.addEventListener('input', listener, false);
            });
        });
        return context;
    }
}
