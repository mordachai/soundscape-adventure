import SoundscapeAdventure from "./soundscape-adventure.mjs";
import utils from "./utils/utils.mjs";
import constants from "./utils/constants.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

function controlFromInput(fromSlider, fromInput, toInput, controlSlider) {
    const [from, to] = getParsed(fromInput, toInput);
    fillSlider(fromInput, toInput, '#C6C6C6', '#25daa5', controlSlider);
    if (from > to) {
        fromSlider.value = to;
        fromInput.value = to;
    } else {
        fromSlider.value = from;
    }
}

function controlToInput(toSlider, fromInput, toInput, controlSlider) {
    const [from, to] = getParsed(fromInput, toInput);
    fillSlider(fromInput, toInput, '#C6C6C6', '#25daa5', controlSlider);
    setToggleAccessible(toInput);
    if (from <= to) {
        toSlider.value = to;
        toInput.value = to;
    } else {
        toInput.value = from;
    }
}

function controlFromSlider(fromSlider, toSlider, fromInput) {
    const [from, to] = getParsed(fromSlider, toSlider);
    fillSlider(fromSlider, toSlider, '#C6C6C6', '#25daa5', toSlider);
    if (from > to) {
        fromSlider.value = to;
        fromInput.value = to;
    } else {
        fromInput.value = from;
    }
}

function controlToSlider(fromSlider, toSlider, toInput) {
    const [from, to] = getParsed(fromSlider, toSlider);
    fillSlider(fromSlider, toSlider, '#C6C6C6', '#25daa5', toSlider);
    setToggleAccessible(toSlider);
    if (from <= to) {
        toSlider.value = to;
        toInput.value = to;
    } else {
        toInput.value = from;
        toSlider.value = from;
    }
}

function getParsed(currentFrom, currentTo) {
    const from = parseInt(currentFrom.value, 10);
    const to = parseInt(currentTo.value, 10);
    return [from, to];
}

function fillSlider(from, to, sliderColor, rangeColor, controlSlider) {
    sliderColor = "rgba(255, 0, 0, 0)";
    rangeColor = "rgba(215, 117, 78, 0.5)";
    const rangeDistance = to.max - to.min;
    const fromPosition = from.value - to.min;
    const toPosition = to.value - to.min;
    controlSlider.style.background = `linear-gradient(
      to right,
      ${sliderColor} 0%,
      ${sliderColor} ${(fromPosition) / (rangeDistance) * 100}%,
      ${rangeColor} ${((fromPosition) / (rangeDistance)) * 100}%,
      ${rangeColor} ${(toPosition) / (rangeDistance) * 100}%, 
      ${sliderColor} ${(toPosition) / (rangeDistance) * 100}%, 
      ${sliderColor} 100%)`;
}

function setToggleAccessible(currentTarget) {
    const toSlider = document.querySelector('#toSlider');
    if (Number(currentTarget.value) <= 0) {
        toSlider.style.zIndex = 2;
    } else {
        toSlider.style.zIndex = 0;
    }
}

export default class SoundscapeUI extends HandlebarsApplicationMixin(ApplicationV2) {
    soundList = [];
    soundscape = {};
    currentMood = "";
    scrollTop = 0;
    current_input = "";

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
        //
        if (event.target.dataset?.dropZone) {
            const data = JSON.parse(event.dataTransfer.getData("text/plain"));
            this.soundscape.class.moveSound(data.soundId, data.moodId, event.target.dataset.dropZone, event.target.dataset?.dropZoneCategory);
        }
        this.myRender(true);




        // Handle the drop (e.g., play sound, add to playlist, etc.)
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const content = this.element.querySelector('.mood-active');
        if (content)
            content.scrollTop = this.scrollTop;

        // STop propagation of dragndrop in the sliders
        this.element.querySelectorAll('.soundscape-sound-slider').forEach(slider => {
            slider.addEventListener('mousedown', e => e.stopPropagation());
            slider.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
            slider.addEventListener('pointerdown', e => e.stopPropagation());
            slider.addEventListener('dragstart', e => e.preventDefault());
        });

        this.element.querySelectorAll('.soundscape-sound-slider-container').forEach(slider => {
            slider.addEventListener('mousedown', e => e.stopPropagation());
            slider.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
            slider.addEventListener('pointerdown', e => e.stopPropagation());
            slider.addEventListener('dragstart', e => e.preventDefault());
        });
        // FILTER
        this.element.querySelectorAll('.soundboardadv-main').forEach(container => {
            const input = container.querySelector('.filterInput');
            input.value = this.current_input;
            const items = container.querySelectorAll('.soundscape-sound-card');

            if (this.current_input) {
                items.forEach(item => {
                    //
                    const title = item.querySelector('.soundscape-sound-title')?.dataset?.fullName.toLowerCase() || '';
                    item.style.display = title.includes(this.current_input) ? '' : 'none';
                });
            }

            input.addEventListener('input', () => {
                const filter = input.value.toLowerCase();
                this.current_input = filter;
                items.forEach(item => {
                    //
                    const title = item.querySelector('.soundscape-sound-title')?.dataset?.fullName.toLowerCase() || '';
                    item.style.display = title.includes(filter) ? '' : 'none';
                });
            });
        });
        //DRAG AND DROP
        this.element.querySelectorAll(".data-drag").forEach((el) => {
            el.setAttribute("draggable", "true");
            el.addEventListener("dragstart", this._onDragStart.bind(this));
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
                        if (!this.soundscape.isPlaying) {
                            icon.className = "fa fa-stop";
                        } else {
                            icon.className = "fa fa-play";
                        }
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
                        this.myRender(true);
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
                        await this.soundscape.class.dialogDeleteMood(moodId);
                        break;
                    default:

                }
                this.myRender(true);
            });
        });

        // Sound controls
        this.element.querySelectorAll(".sound-control").forEach((button) => {
            button.addEventListener("click", (event) => {
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
                        const volume_ui = button.parentNode.querySelector('#volume-value-1');
                        volume_ui.innerText = parseInt(button.value * 100) + "%";
                        this.soundscape.class.changeSoundVolume(moodId, soundId, button.value);
                        break;
                    case "intensity":
                        const intensity_ui = button.parentNode.querySelector('#intensity-value-1');
                        intensity_ui.innerText = parseInt(button.value);
                        this.soundscape.class.changeSoundIntensity(moodId, group, button.value);
                        break;
                    case "edit-sound":

                        this.soundEdit(moodId, soundId, group)
                        break;
                    case "play":
                        const sound = this.soundscape.class.moods[moodId].getSound(soundId);
                        if (sound.type == constants.SOUNDTYPE.SOUNDPAD || sound.type == constants.SOUNDTYPE.GROUP_SOUNDPAD) {
                            this.soundscape.class.playSound(sound, moodId)
                        }
                        break;
                    case "stop":
                        const sounds = this.soundscape.class.moods[moodId].getSound(soundId);
                        if (sound.type == constants.SOUNDTYPE.SOUNDPAD) {
                            this.soundscape.class.moods[moodId].stopSound(moodId, sounds)
                        }
                        break;
                    default:
                        console.warn("action not found", action);

                }
                this.myRender(true);
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
            const collapeDiv = el.querySelector(".soundscapeadv-container");
            if (button && collapeDiv) {
                button.addEventListener("click", (e) => {
                    const icon = e.currentTarget.querySelector("i");
                    if (icon.className.includes("fa-angle-down")) {
                        icon.className = "fa fa-angle-up";
                    } else {
                        icon.className = "fa fa-angle-down";
                    }
                    const categoryId = e.currentTarget.dataset.dropZoneCategory;
                    const parent = e.currentTarget.closest(".soundboardadv-main");
                    const moodId = parent.dataset.moodId;
                    const type = e.currentTarget.dataset.dropZone;

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
                const sound_group = ev.target.closest(".sound-group-type").dataset?.dropZone;
                if (sound_group) {
                    await this.soundscape.class.createCategory(dataset.moodId, sound_group, category_name);
                    this.soundscape.class.moods[dataset.moodId].has_changes = true;
                    const content = this.element.querySelector('.mood-active');
                    this.scrollTop = content?.scrollTop ?? 0;
                    this.myRender(true);
                }
            })

        });


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
        const html_content = await renderTemplate(templatePath, { mood: mood, triggers: triggers });
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

        const html_content = await renderTemplate(templatePath, { sound: soundConfig, sounds: sounds, triggers: triggers, groups: this.soundscape.class.moods[moodId].groups });
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
                            callback: () => { console.log("Sound not removed") },
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

        if (elements.soundName)
            await this.soundscape.class.updateSoundName(soundId, elements.soundName.value);
        await this.soundscape.class.saveTrigger(moodId, soundId, triggers);
        await this.soundscape.class.updateSoundIcon(soundId, elements.soundIcon.value);
        //console.warn("Sound Icon: ", elements.soundIcon.value);
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
            }]

            for (let i = 0; i < mood.sounds.length; i++) {
                // avoid to change the original object sound
                const sound = structuredClone(mood.sounds[i]);
                let sound_index = 0;
                if (sound.type == constants.SOUNDTYPE.RANDOM || sound.type == constants.SOUNDTYPE.GROUP_RANDOM) {
                    sound_index = 1;
                } else if (sound.type == constants.SOUNDTYPE.SOUNDPAD || sound.type == constants.SOUNDTYPE.GROUP_SOUNDPAD) {
                    sound_index = 2;
                }
                const index = sound.category != "" ? sounds[sound_index].categories.findIndex(el => el.id == sound.category) : 0;
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
            moods.push({
                id: this.soundscape.class.moods[key].id,
                name: this.soundscape.class.moods[key].name,
                status: this.soundscape.class.moods[key].status,
                has_changes: this.soundscape.class.moods[key].has_changes,
                sounds: sounds
            })
        }
        return {
            name: this.soundscape.class.name,
            moods: moods,
            soundscapeId: this.soundscape.class.id,
            off_visible: this.soundscape.class.visible_off_sounds,
            activeMood: this.currentMoodOnUI
        }
    }


}