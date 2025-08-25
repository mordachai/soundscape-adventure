import SoundscapeAdventure from "./soundscape-adventure.mjs";
import utils from "./utils/utils.mjs";
import constants from "./utils/constants.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export default class SoundscapeUI extends HandlebarsApplicationMixin(ApplicationV2) {
    soundList = [];
    soundscape = {};
    currentMood = "";
    scrollTop = 0;
    current_input = "";
    libraryIsOpen = false;

    static PARTS = {
        // header: { template: '' },
        // tabs: { template: '' },
        // description: { template: '' },
        foo: { template: 'modules/soundscape-adventure/templates/soundscape.hbs' },
        // bar: { template: '' },
    }

    static DEFAULT_OPTIONS = {
        id: "soundscape-ui",
        window: {
            title: "Soundscape",
        },
        classes: ["soundscape-ui"],
        actions: {
            reset: SoundscapeUI.test,
            viewMood: SoundscapeUI.viewMood,
        },
        dragDrop: [{ dragSelector: '[data-drag]', dropSelector: null }],
    }


    // static get defaultOptions() {
    //     const options = super.defaultOptions;
    //     options.title = "Soundscape name",
    //     options.id = 'soundscape-app';
    //     options.template = 'modules/soundscape-adventure/templates/soundscape.hbs';
    //     options.width = 1050;
    //     options.height = 800;
    //     options.resizable = true;
    //     return options;
    // }

    constructor(soundscape) {
        super({ window: { title: `${soundscape.name}` } });
        this.soundscape = soundscape;
        this.#dragDrop = this.#createDragDropHandlers();
    }

    /**
   * Define whether a user is able to begin a dragstart workflow for a given drag selector
   * @param {string} selector       The candidate HTML selector for dragging
   * @returns {boolean}             Can the current user drag this selector?
   * @protected
   */
    _canDragStart(selector) {
        // game.user fetches the current user
        return this.isEditable;
    }


    /**
     * Define whether a user is able to conclude a drag-and-drop workflow for a given drop selector
     * @param {string} selector       The candidate HTML selector for the drop target
     * @returns {boolean}             Can the current user drop on this selector?
     * @protected
     */
    _canDragDrop(selector) {
        // game.user fetches the current user
        return this.isEditable;
    }


    /**
     * Callback actions which occur at the beginning of a drag start workflow.
     * @param {DragEvent} event       The originating DragEvent
     * @protected
     */
    _onDragStart(event) {
        const el = event.currentTarget;
        if ('link' in event.target.dataset) return;

        // Extract the data you need
        let dragData = null;

        if (!dragData) return;

        // Set data transfer
        event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    }


    /**
     * Callback actions which occur when a dragged element is over a drop target.
     * @param {DragEvent} event       The originating DragEvent
     * @protected
     */
    _onDragOver(event) { }


    /**
     * Callback actions which occur when a dragged element is dropped on a target.
     * @param {DragEvent} event       The originating DragEvent
     * @protected
     */
    async _onDrop(event) {
        const data = TextEditor.getDragEventData(event);

        // Handle different data types
        switch (data.type) {
            // write your cases
        }
    }

    /**
   * Create drag-and-drop workflow handlers for this Application
   * @returns {DragDrop[]}     An array of DragDrop handlers
   * @private
   */
    #createDragDropHandlers() {
        return this.options.dragDrop.map((d) => {
            d.permissions = {
                dragstart: this._canDragStart.bind(this),
                drop: this._canDragDrop.bind(this),
            };
            d.callbacks = {
                dragstart: this._onDragStart.bind(this),
                dragover: this._onDragOver.bind(this),
                drop: this._onDrop.bind(this),
            };
            return new foundry.applications.ux.DragDrop(d);
        });
    }

    #dragDrop;

    // Optional: Add getter to access the private property

    /**
     * Returns an array of DragDrop instances
     * @type {DragDrop[]}
     */
    get dragDrop() {
        return this.#dragDrop;
    }

    async myRender(force = false, options = {}) {
        if (this.element) {
            const content = await this.element.querySelector('.mood-active');
            this.scrollTop = content?.scrollTop ?? 0;
        }

        await super.render(force, options);
        //
    }

    async test(options) {

    }

    async viewMood(options) {
        alert("dasdsad")
    }

    _onDragStart(event) {
        const div = event.target;
        const dragData = {
            type: "sound",
            soundId: div.dataset?.soundId,
            moodId: div.dataset?.moodId,

        };
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    _onDragOver(event) {
        event.preventDefault(); // Necessary to allow dropping
    }

    _onDrop(event, element) {
        event.preventDefault();
        const dropZone = event.target.closest('.drop-zone');
        if (dropZone.dataset.dropZoneType) {
            const data = JSON.parse(event.dataTransfer.getData("text/plain"));
            this.soundscape.class.moveSound(data.soundId, data.moodId, dropZone.dataset.dropZoneType, dropZone.dataset?.dropZoneCategory);
        }
        this.myRender(true);
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const content = this.element.querySelector('.mood-active');
        if (content)
            content.scrollTop = this.scrollTop;

        // Stop propagation of drag and drop in volume controls
        this.element.querySelectorAll('.soundpad-volume-container, .compact-volume-control').forEach(container => {
            // Set draggable to false
            container.setAttribute('draggable', 'false');

            container.addEventListener('mousedown', e => e.stopPropagation(), true);
            container.addEventListener('touchstart', e => e.stopPropagation(), { passive: true, capture: true });
            container.addEventListener('pointerdown', e => e.stopPropagation(), true);
            container.addEventListener('dragstart', e => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }, true);

            // Also prevent drag on all child elements
            container.addEventListener('selectstart', e => e.preventDefault());
        });

        // Add document-level event delegation as a fallback
        document.addEventListener('mousedown', (e) => {
            if (e.target.matches('.soundpad-volume-slider, .compact-volume-slider, .compact-intensity-slider') ||
                e.target.closest('.soundpad-volume-container, .compact-volume-control')) {
                const box = e.target.closest('.soundpad-list-item, .soundscape-sound-card');
                box.draggable = false;
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        }, true);

        document.addEventListener('mouseup', (e) => {
            if (e.target.matches('.soundpad-volume-slider, .compact-volume-slider, .compact-intensity-slider') ||
                e.target.closest('.soundpad-volume-container, .compact-volume-control')) {
                const box = e.target.closest('.soundpad-list-item, .soundscape-sound-card');
                box.draggable = true;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }
        }, true);


        // FILTER
        this.element.querySelectorAll('.soundscape-sliding-panel-content').forEach(container => {
            const input = container.querySelector('.filterInput');
            input.value = this.current_input;
            const items = container.querySelectorAll('.library-sound-item');

            if (this.current_input) {
                items.forEach(item => {
                    const title = item.querySelector('.library-sound-name')?.dataset?.fullName.toLowerCase() || '';
                    item.style.display = title.includes(this.current_input) ? '' : 'none';
                });
            }

            input.addEventListener('input', () => {
                const filter = input.value.toLowerCase();
                this.current_input = filter;
                
                const content = container.closest('.soundscape-sliding-panel-content');
                const items = content.querySelectorAll('.library-sound-item');
                items.forEach(item => {
                    const title = item.querySelector('.library-sound-name')?.dataset?.fullName.toLowerCase() || '';
                    item.style.display = title.includes(filter) ? '' : 'none';
                });
            });
        });
        //DRAG AND DROP
        this.element.querySelectorAll(".data-drag").forEach((el) => {
            el.setAttribute("draggable", "true");

            // Add a universal dragstart handler that checks the source
            el.addEventListener("dragstart", (event) => {
                this._onDragStart(event);
            });
        });
        // Setup drop zone
        this.element.querySelectorAll(".drop-zone").forEach((el) => {
            el.addEventListener("dragover", this._onDragOver.bind(this));
            el.addEventListener("drop", this._onDrop.bind(this));
        });
        // Mood controls
        this.element.querySelectorAll(".mood-action").forEach(async (button) => {
            button.addEventListener("click", async (event) => {
                const action = button.dataset.action;
                // Find the closest parent with data attributes
                const parent = button.closest(".mood-wrapper");
                const moodId = parent?.dataset.moodId;
                const soundscapeId = parent?.dataset.soundscapeId;

                // Log for debugging
                const root = button.closest(".soundboardadv");
                // Call appropriate method
                switch (action) {
                    case "playStopMood":
                        const icon = button.querySelector(".fa");
                        icon.className = "fa fa-spinner fa-spin mood-control soundscape-tab-button";
                        await this.soundscape.class.playStopMood(moodId);
                        if (this.element) {
                            const content = await this.element.querySelector('.mood-active');
                            this.scrollTop = content?.scrollTop ?? 0;
                        }
                        this.myRender(true);
                        break;
                    case "viewMood":
                        const soundboardElements = root.querySelectorAll('div.soundboardadv-main');
                        for (const element of soundboardElements) {

                            if (element.getAttribute('data-mood-id') === moodId) {
                                element.className = 'soundboardadv-main mood-active';
                                this.soundscape.class.currentMoodOnUI = moodId;
                            } else {
                                element.className = 'soundboardadv-main';
                            }
                        }

                        const config = await game.settings.get(constants.STORAGETRIGGERSETTINGS, "currentMoodOnUI");
                        const currentMoodSOnUI = [];
                        if (Object.keys(config).length) {
                            currentMoodSOnUI.push(...(config).split(":"));
                        }

                        for (const key in this.soundscape.class.moods) {
                            // includes the new mood.
                            if (currentMoodSOnUI.includes(key) && key != moodId) {
                                currentMoodSOnUI.splice(currentMoodSOnUI.indexOf(key), 1);
                            }

                            if (!currentMoodSOnUI.includes(key) && key == moodId) {
                                currentMoodSOnUI.push(moodId);
                            }
                        }
                        game.settings.set(constants.STORAGETRIGGERSETTINGS, "currentMoodOnUI", (currentMoodSOnUI.filter(el => el != "true")).join(":"));
                        break;
                    case "saveMood":
                        const save_btn = parent.querySelector(".fa-download");
                        save_btn.style.color = "";
                        this.soundscape.class.saveMoodsConfig();
                        break;
                    case "configMood":
                        this.moodEdit(moodId);
                        break;
                    case "createMood":
                        await this.soundscape.class.dialogNewMood();
                        break;
                    case "cloneMood":
                        await this.soundscape.class.dialogCloneMood();
                        break;
                    case "deleteMood":
                        if (moodId == this.currentMoodOnUI) {
                            this.currentMoodOnUI = null;
                        }
                        await this.soundscape.class.dialogDeleteMood(moodId);
                        break;
                    default:

                }
                this.myRender(true);
            });
        });

        // Sound controls
        this.element.querySelectorAll(".sound-control").forEach(async (button) => {
            button.addEventListener("click", async (event) => {
                const content = this.element.querySelector('.mood-active');
                this.scrollTop = content?.scrollTop ?? 0;
                const action = button.dataset.action;
                const soundId = button.dataset.soundId;
                // Find the closest parent with data attributes
                const parent = button.closest(".soundboardadv-main");

                const moodId = button.dataset.moodId;
                const soundscapeId = parent?.dataset.soundscapeId;
                const group = button.dataset?.group;
                // Log for debugging
                const root = button.closest(".soundboardadv");
                // Call appropriate method
                switch (action) {
                    case "enableDisableAudio":
                        const soundConfig = this.soundscape.class.moods[moodId].getSound(soundId);
                        const box = button.closest(".music-content");
                        const icon = button.querySelector(".fas");
                        if (!this.soundscape.class.moods[moodId].isSoundOn(soundId)) {
                            if (icon)
                                icon.className = "fas fa-volume";
                            if (box)
                                box.className = "music-content on";
                            this.soundscape.class.enableDisableSound(moodId, soundId);
                        } else {

                            if (box)
                                box.className = "music-content off";
                            if (icon)
                                icon.className = "fas fa-volume-xmark";
                            this.soundscape.class.enableDisableSound(moodId, soundId);
                        }

                        break;
                    case "volume":
                        const volume_ui = button.parentNode.querySelector('.volume-value');
                        volume_ui.innerText = parseInt(button.value * 100) + "%";
                        this.soundscape.class.changeSoundVolume(moodId, soundId, button.value);
                        break;
                    case "intensity":
                        const intensity_ui = button.parentNode.querySelector('.compact-intensity-slider');
                        intensity_ui.innerText = parseInt(button.value);
                        this.soundscape.class.changeSoundIntensity(moodId, group, button.value);
                        break;
                    case "edit-sound":

                        this.soundEdit(moodId, soundId, group);
                        return;
                        break;
                    case "play":
                        if (!this.soundscape.class.moods[moodId].isPlaying()){
                            ui.notifications.warn("You need to start the mood before you can play a soundpad sound.");
                            return;
                        }
                        const sound = this.soundscape.class.moods[moodId].getSound(soundId);
                        if (sound.type == constants.SOUNDTYPE.SOUNDPADUI) {
                            const i = button.querySelector("i");
                            i.className = "fas fa-stop";
                            button.dataset.action = "stop";
                            const s = this.soundscape.class.playlist.sounds.get(sound.id);
                            await s.load();
                            await this.soundscape.class.playSound(sound, moodId);
                            
                             const previewEndEvent = () => {
                                s.sound.removeEventListener('end', previewEndEvent);
                                s.sound.removeEventListener('stop', previewEndEvent);
                                i.className = "fas fa-play";
                                button.dataset.action = "play";
                                //this.soundscape.class.stopSound(sound, moodId);
                            };
                            s.sound.addEventListener(
                                'end',previewEndEvent
                            );
                            s.sound.addEventListener(
                                'stop', previewEndEvent
                            );
                            return;

                        }
                        break;
                    case "stop":
                        const sounds = this.soundscape.class.moods[moodId].getSound(soundId);
                        const i = button.querySelector("i");
                        if (sounds.type == constants.SOUNDTYPE.SOUNDPADUI) {
                            i.className = "fas fa-play";
                            button.dataset.action = "play";
                            this.soundscape.class.stopSound(sounds,moodId);
                            return;
                        }
                        break;
                    case "preview-sound":
                        const soundToPreview = this.soundscape.class.moods[moodId].getSound(soundId);
                        const soundToPlay = this.soundscape.class.playlist.sounds.get(soundToPreview.id);
                        await soundToPlay.load();
                        const isLoop = soundToPlay.sound.loop;
                        const volume = soundToPlay.sound.volume;
                        if (soundToPlay.playing) {
                            this.soundscape.class.playlist.stopSound(soundToPlay);
                        } else {
                            const preview_icon = button.querySelector(".sound-control-icon");
                            preview_icon.style.color = "orange";
                            preview_icon.className = "fas fa-stop sound-control";
                            soundToPlay.update({ "repeat": false, "volume": 0.6 });
                            await this.soundscape.class.playlist.playSound(soundToPlay);
                            const previewEndEvent = () => {
                                soundToPlay.sound.removeEventListener('end', previewEndEvent);
                                this.soundscape.class.playlist.stopSound(soundToPlay);
                            };

                            const previewStopEvent = () => {
                                soundToPlay.sound.removeEventListener('stop', previewStopEvent);
                                preview_icon.className = "fas fa-play sound-control";
                                preview_icon.style.color = "";
                                soundToPlay.update({ "repeat": isLoop, "volume": volume });
                            }
                            soundToPlay.sound.addEventListener(
                                'end',
                                previewEndEvent
                            );
                            soundToPlay.sound.addEventListener(
                                'stop',
                                previewStopEvent
                            )
                            return;
                        }

                        break;
                    default:
                        console.warn("action not found", action);

                }
                this.myRender(true);
            });
        });

        // block dragging of soundscape sounds
        this.element.querySelectorAll('.soundpad-volume-slider').forEach(slider => {
            slider.addEventListener('mousedown', e => {
                e.stopPropagation(); // Prevent drag start bubbling up
            });
            slider.addEventListener('click', e => {
                e.preventDefault(); // Disable dragging the whole element
            });
        });

        // Category controls
        this.element.querySelectorAll(".category-control").forEach(async (button) => {
            button.addEventListener('click', async (e) => {
                const dataset = e.currentTarget.dataset;

                const moodId = dataset.moodId;
                const categoryId = dataset?.categoryId ? dataset.categoryId : 0;
                const action = dataset.action;
                if (action == "play" || action == "stop") {
                    this.soundscape.class.playStopCategory(moodId, categoryId, action)
                } else if (action == "delete") {
                    const confirm = await foundry.applications.api.DialogV2.prompt({
                        window: { title: "Confirmation" },
                        content: "<p>Confirm delete the category?</p>",
                        modal: true,
                        rejectClose: false
                    });
                    if (confirm) {
                        await this.soundscape.class.deleteCategory(moodId, categoryId);
                        this.myRender(true);
                    }
                } else if (action == "enableAll") {
                    this.soundscape.class.enableSoundsinCategory(moodId, categoryId);
                    this.myRender(true);
                }


            });
        });

        this.element.querySelectorAll(".soundboardadv-main").forEach(el => {
            el.addEventListener('dragover', (e) => {
                const rect = el.getBoundingClientRect();
                const scrollSpeed = 10;
                const threshold = 40; // distance from edge to start scrolling
                const content = this.element.querySelector('.mood-active');
                this.scrollTop = content?.scrollTop ?? 0;

                if (e.clientY < rect.top + threshold) {
                    // Near top
                    content.scrollTop -= scrollSpeed;
                } else if (e.clientY > rect.bottom - threshold) {
                    // Near bottom
                    content.scrollTop += scrollSpeed;
                }
            });
        });

        this.element.querySelectorAll('.sound-category').forEach(el => {
            const button = el.querySelector(".category-title");
            const collapeDiv = el.querySelector(".soundscapeadv-container, .soundpad-list-container");
            if (button && collapeDiv) {
                button.addEventListener("click", (e) => {
                    const icon = e.currentTarget.querySelector("i");
                    if (icon.className.includes("fa-angle-down")) {
                        icon.className = "fa fa-angle-up";
                    } else {
                        icon.className = "fa fa-angle-down";
                    }
                    const categoryId = e.currentTarget.dataset.categoryId;
                    const parent = e.currentTarget.closest(".soundboardadv-main");
                    const moodId = parent.dataset.moodId;
                    const type = e.currentTarget.dataset.categoryType;

                    const category = this.soundscape.class.moods[moodId].categories.find(el => el.id == categoryId && el.type == type);
                    category.collapsed = !category.collapsed;


                    const content = this.element.querySelector('.mood-active');
                    this.scrollTop = content?.scrollTop ?? 0;
                    const isVisible = collapeDiv.style.display !== 'none';
                    collapeDiv.style.display = isVisible ? 'none' : '';
                });
            }
        })

        this.element.querySelectorAll(".new-category").forEach(el => {
            el.addEventListener("click", async (ev) => {
                const content = this.element.querySelector('.mood-active');
                this.scrollTop = content?.scrollTop ?? 0;
                let category_name;
                try {
                    category_name = await foundry.applications.api.DialogV2.prompt({
                        window: { title: "New Category's Name" },
                        content: '<input name="name" type="text" autofocus>',
                        ok: {
                            label: "Create",
                            callback: (event, button, dialog) => button.form.elements.name.value
                        }
                    });
                } catch {
                    return;
                }

                const dataset = ev.target.closest(".mood-active").dataset;
                const sound_group = ev.target.closest(".sound-group-type").dataset?.soundType;
                if (sound_group) {
                    await this.soundscape.class.createCategory(dataset.moodId, sound_group, category_name);
                    this.soundscape.class.moods[dataset.moodId].has_changes = true;
                    const content = this.element.querySelector('.mood-active');
                    this.scrollTop = content?.scrollTop ?? 0;
                    this.myRender(true);
                }
            })

        });

        //     const side_bar_sound_library = `
        //     `;
        this.element.querySelectorAll('.soundscape-sliding-ear').forEach(element => {
            element.addEventListener('click', async (event) => {
                const slidingPanel = await this.element.querySelector('.slide-active');
                const ear = await this.element.querySelector('.soundscape-sliding-ear');
                slidingPanel.classList.toggle('open');
                this.libraryIsOpen = !this.libraryIsOpen;
                if (this.libraryIsOpen) {
                    ear.innerText = "❮";
                } else {
                    ear.innerText = "❯";
                }
            });

        });

        const window_content = this.element.querySelector('.window-content'); //.insertAdjacentHTML('afterend', side_bar_sound_library);
        window_content.style.overflow = 'visible';


    }

    async close(options = {}) {

        SoundscapeAdventure.closeUI(this.soundscape.class.id);

        // Call the original close method
        return super.close(options);
    }

    async moodEdit(moodId) {
        const mood = this.soundscape.class.moods[moodId];

        const templatePath = "/modules/soundscape-adventure/templates/editmood.hbs";
        const triggers = [];

        for (let i = 0; i < 3; i++) {
            triggers.push({
                actions: [
                    {
                        id: "play",
                        name: "Play",
                        selected: false
                    },
                    {
                        id: "stop",
                        name: "Stop",
                        selected: false
                    }],
                on: [{
                    id: "combat",
                    name: "Combat",
                    selected: false
                }],
                events: []
            })
        }

        let triggerSettings = game.settings.get(constants.STORAGETRIGGERSETTINGS, "triggerSettings");

        if (triggerSettings[moodId]) {
            if (triggerSettings[moodId]["mood"]) {
                const currentTriggers = triggerSettings[moodId]["mood"];
                for (let i = 0; i < currentTriggers.length; i++) {
                    for (let j = 0; j < triggers[i].actions.length; j++) {
                        if (triggers[i].actions[j].id == currentTriggers[i].action) {
                            triggers[i].actions[j].selected = true;
                        }
                    }
                    for (let j = 0; j < triggers[i].on.length; j++) {
                        if (triggers[i].on[j].id == currentTriggers[i].on) {
                            triggers[i].on[j].selected = true;
                            if (triggers[i].on[j].id == "combat") {
                                triggers[i].events.push({
                                    id: "start",
                                    name: "Start",
                                    selected: currentTriggers[i].event == "start" ? true : false
                                })
                                triggers[i].events.push({
                                    id: "end",
                                    name: "End",
                                    selected: currentTriggers[i].event == "end" ? true : false
                                })
                            }
                        }
                    }
                }
            }
        }
        const html_content = await foundry.applications.handlebars.renderTemplate(templatePath, { mood: mood, triggers: triggers });
        const dialog = new foundry.applications.api.DialogV2({
            window: { title: `Edit ${mood.name}` },
            content: html_content,
            buttons: [
                {
                    action: "save",
                    label: "Save",
                    callback: (event, button, dialog) => this.updateMood(button.form.elements, moodId),
                    icon: "fas fa-check"
                },
                {
                    action: "cancel",
                    label: "Cancel",
                    callback: () => { },
                    icon: "fas fa-times"
                }]
        });
        await dialog.render(true);
        const browser = dialog.element.querySelectorAll('.onElement');
        const removeAllTriggers = dialog.element.querySelector('.removeAllTriggers');
        removeAllTriggers.addEventListener('click', async (event) => {
            const dataset = event.srcElement.dataset;
            this.soundscape.class.removeAllTriggers(dataset.moodId);
        })
        for (let i = 0; i < browser.length; i++) {
            browser[i].addEventListener('change', async (event) => {
                let eventSelect = event.target.parentNode.parentNode.querySelector(".eventElement");
                let length = eventSelect.options.length;

                for (i = length - 1; i > 0; i--) {
                    eventSelect.remove(i);
                }
                if (event.target.value == "combat") {
                    var start = document.createElement('option');
                    start.value = "start";
                    start.innerHTML = "Start";
                    eventSelect.appendChild(start);
                    var end = document.createElement('option');
                    end.value = "end";
                    end.innerHTML = "End";
                    eventSelect.appendChild(end);
                } else if (event.target.value == "scene") {
                    const scenes = Array.from(game.scenes);
                    for (let i = 0; i < scenes.length; i++) {
                        const obj = document.createElement('option');
                        obj.value = scenes[i].id;
                        obj.innerHTML = scenes[i].name;
                        eventSelect.appendChild(obj);
                    }
                }
            });
        }
    }
    async soundEdit(moodId, soundId, group) {
        const soundConfig = this.soundscape.class.moods[moodId].getSound(soundId);
        const templatePath = "/modules/soundscape-adventure/templates/editsound.hbs";
        let others = {};
        const triggers = [];
        const regionEvents = [
            CONST.REGION_EVENTS.TOKEN_ENTER,
            CONST.REGION_EVENTS.TOKEN_EXIT,
            CONST.REGION_EVENTS.TOKEN_MOVE,
            CONST.REGION_EVENTS.TOKEN_MOVE_IN,
            CONST.REGION_EVENTS.TOKEN_MOVE_OUT,
            CONST.REGION_EVENTS.TOKEN_PRE_MOVE,
            CONST.REGION_EVENTS.TOKEN_ROUND_END,
            CONST.REGION_EVENTS.TOKEN_ROUND_START,
            CONST.REGION_EVENTS.TOKEN_TURN_END,
            CONST.REGION_EVENTS.TOKEN_TURN_START,
        ];
        const triggerActions = ["play", "stop"];
        let _regions = [];
        if (game.scenes.active) {
            _regions = Array.from(game.canvas?.scene?.regions);
        }
        let onElements = [];
        for (let m = 0; m < _regions.length; m++) {
            onElements.push({
                id: _regions[m].id,
                name: _regions[m].name,
                selected: false
            })
        }
        onElements.push({
            id: "combat",
            name: "Combat",
            selected: false
        })
        for (let i = 0; i < 3; i++) {
            triggers.push({
                actions: [
                    {
                        id: "play",
                        name: "Play",
                        selected: false
                    },
                    {
                        id: "stop",
                        name: "Stop",
                        selected: false
                    }],
                on: JSON.parse(JSON.stringify(onElements)),
                events: []
            })
        }

        let triggerSettings = game.settings.get(constants.STORAGETRIGGERSETTINGS, "triggerSettings");
        if (triggerSettings[moodId]) {
            if (triggerSettings[moodId][soundId]) {
                const currentTriggers = triggerSettings[moodId][soundId];
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < triggers[i].actions.length; j++) {
                        if (triggers[i].actions[j].id == currentTriggers[i].action) {
                            triggers[i].actions[j].selected = true;
                        }
                    }
                    for (let k = 0; k < triggers[i].on.length; k++) {
                        if (triggers[i].on[k].id == currentTriggers[i].on) {
                            triggers[i].on[k].selected = true;
                            if (triggers[i].on[k].id != "combat") {
                                for (let r = 0; r < regionEvents.length; r++) {
                                    triggers[i].events.push({
                                        id: regionEvents[r],
                                        name: regionEvents[r],
                                        selected: regionEvents[r] == currentTriggers[i].event ? true : false
                                    })
                                }
                            } else {
                                triggers[i].events.push({
                                    id: "start",
                                    name: "Start",
                                    selected: "start" == currentTriggers[i].event ? true : false
                                })
                                triggers[i].events.push({
                                    id: "end",
                                    name: "End",
                                    selected: "end" == currentTriggers[i].event ? true : false
                                })
                            }
                        } else {
                            triggers[i].on[k].selected = false;
                        }
                    }
                }
            }
        }


        const sounds = this.soundscape.class.moods[moodId].getSoundByGroup(soundConfig.group);

        const html_content = await foundry.applications.handlebars.renderTemplate(templatePath, { sound: soundConfig, sounds: sounds, triggers: triggers, groups: this.soundscape.class.moods[moodId].groups });
        const soundEditDialog = new foundry.applications.api.DialogV2({
            window: { title: "Edit sound" },
            content: html_content,
            buttons: [
                {
                    action: "save",
                    label: "Save",
                    callback: (event, button, dialog) => this.updateSound(button.form.elements, soundId, moodId),
                    icon: "fas fa-check"
                },
                {
                    action: "cancel",
                    label: "Cancel",
                    callback: () => { },
                    icon: "fas fa-times"
                }]
        });
        await soundEditDialog.render(true);

        const browser = soundEditDialog.element.querySelectorAll('.onElement');

        const removeSounds = soundEditDialog.element.querySelectorAll(".sound-remove-group");

        const addSound = soundEditDialog.element.querySelector(".sound-add-group");

        // Attach to your button
        const filePickerIcon = soundEditDialog.element.querySelector(".file-picker")

        if (filePickerIcon) {
            filePickerIcon.addEventListener("click", ev => {
                const picker = new FilePicker({
                    type: "image",                       // image, audio, video, etc.
                    callback: path => {
                        const input = soundEditDialog.element.querySelector("input[name='soundIcon']");
                        input.value = path;
                    }
                });
                picker.render(true);
            });
        }

        if (addSound) {
            addSound.addEventListener("change", async (el) => {
                if (el.target.value == "NewGroup") {
                    const group = el.target.value;
                    const dataset = el.target.dataset;
                    const confirmation_dialog = new foundry.applications.api.DialogV2({
                        window: { title: "Add new Group" },
                        content: `<p>Select a name for the new group</p><input type="text" class="form-control" id="newGroupName" placeholder="New Group Name">`,
                        buttons: [
                            {
                                action: "yes",
                                label: "Yes",
                                callback: async (event, button) => {
                                    const group = button.form.elements.newGroupName.value;
                                    await this.soundscape.class.addSoundToGroup(moodId, dataset.soundId, group);
                                    soundEditDialog.close();
                                    this.myRender(true);
                                },
                                icon: "fas fa-check"
                            },
                            {
                                action: "no",
                                label: "No",
                                callback: () => { el.target.value = "" },
                                icon: "fas fa-times"
                            }]
                    });
                    confirmation_dialog.render(true);
                } else if (el.target.value) {
                    const group = el.target.value;
                    const dataset = el.target.dataset;
                    const confirmation_dialog = new foundry.applications.api.DialogV2({
                        window: { title: "Add sound to Group" },
                        content: `<p>Are you sure you want to add the sound to the group ${group}?</p>`,
                        buttons: [
                            {
                                action: "yes",
                                label: "Yes",
                                callback: async () => {
                                    await this.soundscape.class.addSoundToGroup(moodId, dataset.soundId, group);
                                    soundEditDialog.close();
                                    this.myRender(true);
                                },
                                icon: "fas fa-check"
                            },
                            {
                                action: "no",
                                label: "No",
                                callback: () => { el.target.value = "" },
                                icon: "fas fa-times"
                            }]
                    });
                    confirmation_dialog.render(true);
                }

            });
        }

        for (let i = 0; i < removeSounds.length; i++) {
            removeSounds[i].addEventListener("click", async (el) => {
                const dataset = el.currentTarget.dataset;


                const confirmation_dialog = new foundry.applications.api.DialogV2({
                    window: { title: "Remove sound" },
                    content: `<p>Are you sure you want to remove the sound from the group?</p>`,
                    buttons: [
                        {
                            action: "yes",
                            label: "Yes",
                            callback: () => {
                                this.soundscape.class.removeSoundFromGroup(moodId, dataset.soundId);
                                const parent = el.target.closest(".sound-element-group");
                                const toRemove = el.target.closest(".sound-element");
                                parent.removeChild(toRemove);
                                soundEditDialog.close();
                                this.myRender(true);
                            },
                            icon: "fas fa-check"
                        },
                        {
                            action: "no",
                            label: "No",
                            callback: () => { 
                                utils.log(utils.getCallerInfo(),`Sound not removed`, constants.LOGLEVEL.INFO);
                            },
                            icon: "fas fa-times"
                        }]
                });
                confirmation_dialog.render(true);
            });
        }
        for (let i = 0; i < browser.length; i++) {
            browser[i].addEventListener('change', async (event) => {
                let eventSelect = event.target.parentNode.parentNode.querySelector(".eventElement");
                var length = eventSelect.options.length;
                for (i = length - 1; i > 0; i--) {
                    eventSelect.remove(i);
                }
                if (event.target.value == "combat") {
                    var start = document.createElement('option');
                    start.value = "start";
                    start.innerHTML = "Start";
                    eventSelect.appendChild(start);
                    var end = document.createElement('option');
                    end.value = "end";
                    end.innerHTML = "End";
                    eventSelect.appendChild(end);
                } else if (event.target.value.length > 0) {
                    for (let i = 0; i < regionEvents.length; i++) {
                        var opt = document.createElement('option');
                        opt.value = regionEvents[i];
                        opt.innerHTML = regionEvents[i];
                        eventSelect.appendChild(opt);
                    }
                }
            })
        }

    }

    async updateMood(elements, moodId) {
        const triggers = [];
        for (let i = 0; i < elements.triggerAction.length; i++) {
            const trigger = {
                action: elements.triggerAction[i].value,
                event: elements.triggerEvent[i].value,
                on: elements.triggerOn[i].value
            }
            triggers.push(trigger)
        }
        this.soundscape.class.moods[moodId].name = elements.moodName.value;
        this.soundscape.class.saveTrigger(moodId, "mood", triggers);
        this.myRender(true);
    }
    async updateSound(elements, soundId, moodId) {

        let new_interval = {
            from: 10,
            to: 60
        };
        const from = elements.from;
        if (from) new_interval.from = from.value;
        const to = elements.to;
        if (to) new_interval.to = to.value;
        const new_fade = {
            fadeIn: parseInt(elements.fadeIn.value),
            fadeOut: parseInt(elements.fadeOut.value)
        }
        let playOnce = false;
        if (elements.playOnce) {
            playOnce = elements.playOnce.checked;
        }
        const triggers = [];
        for (let i = 0; i < elements.triggerAction.length; i++) {
            const trigger = {
                action: elements.triggerAction[i].value,
                event: elements.triggerEvent[i].value,
                on: elements.triggerOn[i].value
            }
            triggers.push(trigger)
        }
        await this.soundscape.class.saveExtas(moodId, soundId, new_interval, new_fade, playOnce);

        if (elements?.soundName)
            await this.soundscape.class.updateSoundName(soundId, elements.soundName.value);
        await this.soundscape.class.saveTrigger(moodId, soundId, triggers);
        if (elements?.soundIcon?.value) {
            await this.soundscape.class.updateSoundIcon(soundId, elements.soundIcon.value);
        }
        this.myRender(true);
    }

    updateMoodName(moodId, MoodName) {
        this.soundscape.class.moods[moodId].name = MoodName;
        this.soundscape.class.saveMoodsConfig();
        this.myRender(true);

    }

    async _prepareContext(options) {
        if (this.soundscape.class.currentMoodOnUI.length) {
            this.currentMoodOnUI = this.soundscape.class.currentMoodOnUI; // previously activeMoodId;
        } else {

            const config = await game.settings.get(constants.STORAGETRIGGERSETTINGS, "currentMoodOnUI");
            const currentMoodSOnUI = [];
            if (config.length) {
                currentMoodSOnUI.push(...((config).split(":").filter((e) => e != "")));
                for (const key in this.soundscape.class.moods) {
                    if (currentMoodSOnUI.includes(key)) {
                        this.currentMoodOnUI = key;
                        break;
                    }
                }
            }

            if (!this.currentMoodOnUI) {
                if (Object.values(this.soundscape.class.moods).length > 0) {
                    this.currentMood = Object.values(this.soundscape.class.moods)[0].id;
                }
            }
        }

        const moods = [];

        for (const key in this.soundscape.class.moods) {
            const mood = this.soundscape.class.moods[key];
            const sounds = [{
                type: constants.SOUNDTYPE.LOOP,
                name: "Loop",
                categories: mood.categories
                    .filter(el => el?.type == constants.SOUNDTYPE.LOOP)
                    .map((i) => ({ id: i.id, name: i.name, type: i.type, collapsed: i.collapsed, sounds: [] })),
            }, {
                type: constants.SOUNDTYPE.RANDOM,
                name: "Random",
                categories: mood.categories
                    .filter(el => el?.type == constants.SOUNDTYPE.RANDOM)
                    .map((i) => ({ id: i.id, name: i.name, type: i.type, collapsed: i.collapsed, sounds: [] }))

            }, {
                type: constants.SOUNDTYPE.SOUNDPAD,
                name: "Soundpad",
                categories: mood.categories
                    .filter(el => el?.type == constants.SOUNDTYPE.SOUNDPAD)
                    .map((i) => ({ id: i.id, name: i.name, type: i.type, collapsed: i.collapsed, sounds: [] })),
            }, {
                type: constants.SOUNDTYPE.SOUNDPADUI,
                name: "Soundpad UI",
                categories: mood.categories
                    .filter(el => el?.type == constants.SOUNDTYPE.SOUNDPADUI)
                    .map((i) => ({ id: i.id, name: i.name, type: i.type, collapsed: i.collapsed, sounds: [] })),
            }]

            for (let i = 0; i < mood.sounds.length; i++) {
                // avoid to change the original object sound
                const sound = structuredClone(mood.sounds[i]);
                let sound_index = 0;
                if (sound.type == constants.SOUNDTYPE.RANDOM || sound.type == constants.SOUNDTYPE.GROUP_RANDOM) {
                    sound_index = 1;
                } else if (sound.type == constants.SOUNDTYPE.SOUNDPAD || sound.type == constants.SOUNDTYPE.GROUP_SOUNDPAD) {
                    sound_index = 2;
                } else if (sound.type == constants.SOUNDTYPE.SOUNDPADUI) {
                    sound_index = 3;
                }
                let index = sound.category != "" ? sounds[sound_index].categories.findIndex(el => el.id == sound.category) : 0;
                if (index < 0) {
                    index = 0;
                }
                if (sound.type == constants.SOUNDTYPE.GROUP_LOOP || sound.type == constants.SOUNDTYPE.LOOP) {
                    if (sound.type == constants.SOUNDTYPE.GROUP_LOOP) {
                        const currentsound = sounds[sound_index].categories[index].sounds.find(el => el.group == sound.group);
                        if (!currentsound) {
                            sound.name = `Group: ${sound.group}`;
                            sounds[sound_index].categories[index].sounds.push(sound)
                        }
                    } else {
                        sounds[sound_index].categories[index].sounds.push(sound)
                    }

                } else if (sound.type == constants.SOUNDTYPE.GROUP_RANDOM || sound.type == constants.SOUNDTYPE.RANDOM) {
                    if (sound.group != "") {
                        const currentsound = sounds[sound_index].categories[index].sounds.find(el => el.group == sound.group);
                        if (!currentsound) {
                            sound.name = `Group: ${sound.group}`;
                            sounds[sound_index].categories[index].sounds.push(sound)
                        }
                    } else {
                        sounds[sound_index].categories[index].sounds.push(sound)
                    }

                } else {
                    sounds[sound_index].categories[index].sounds.push(sound)
                }
            }
            // befora add to the sounds to the mood we need to sort the sounds within the categories
            for (let i = 0; i < sounds.length; i++) {
                sounds[i].categories.forEach(category => {
                    category.sounds.sort((a, b) => a.name.localeCompare(b.name));
                });
            }
            moods.push({
                id: this.soundscape.class.moods[key].id,
                name: this.soundscape.class.moods[key].name,
                status: this.soundscape.class.moods[key].status,
                has_changes: this.soundscape.class.moods[key].has_changes,
                sounds: sounds
            })
        }
        let library = [];
        if (this.currentMoodOnUI) {
            library = this.soundscape.class.moods[this.currentMoodOnUI].sounds.filter(sound => sound.type === constants.SOUNDTYPE.SOUNDPAD);
            library = library.sort((a, b) => a.name.localeCompare(b.name));
        }
        return {
            name: this.soundscape.class.name,
            moods: Object.values(moods).sort((a, b) => a.name.localeCompare(b.name)),
            soundscapeId: this.soundscape.class.id,
            off_visible: this.soundscape.class.visible_off_sounds,
            activeMood: this.currentMoodOnUI,
            library: library,
            libraryIsOpen: this.libraryIsOpen
        }
    }


}