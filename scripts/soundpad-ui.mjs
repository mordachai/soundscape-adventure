import Soundscape from "./soundscape.mjs";
import SoundscapeAdventure from "./soundscape-adventure.mjs";
import constants from "./utils/constants.mjs";
export default class SoundpadUI {
    constructor() {
        this.element = null;
        this.count = 0;
        this.isUpdating = false; // Flag to prevent concurrent operations
    }

    /**
     * Initialize the counter UI
     */
    async initialize() {
        // Get the saved counter value and validate it

        // Render the counter
        await this.render();

    }

    /**
     * Render the counter UI element
     */
    async render() {
        // modify permissions
        const canModify = game.user.isGM || game.user.hasRole("ASSISTANT");

        // Create the counter HTML with inline styles for z-index
        // Only include buttons if the user has permission
        // Create your new element
        const currentElement = document.getElementById('soundpad-ui-1');
        let newElement;
        if (currentElement) {
            // If the element already exists, remove it
            newElement = currentElement;
            newElement.innerHTML = ""; // Clear existing content
        } else {
            newElement = document.createElement('aside');
        }

        newElement.id = 'soundpad-ui-1';
        newElement.style.zIndex = '1000'; // Set a high z-index to ensure it appears above other elements
        newElement.style.flex = '1';
        newElement.style.width = '100%';
        newElement.style.overflow = 'hidden';
        newElement.style.display = 'flex';
        newElement.style.flexDirection = 'row';
        newElement.style.flexWrap = 'nowrap';
        newElement.style.gap = '8px';
        newElement.style.pointerEvents = 'none';
        newElement.style.position = 'absolute';
        newElement.style.marginTop = '500px'; // TODO allow edit in the configuration
        const soundscapes = SoundscapeAdventure.soundscapes;
        let sounds = [];
        for (const soundscapeId in soundscapes) {
            const soundscape = soundscapes[soundscapeId];
            if (soundscape.class.isPlaying) {
                console.warn("Soundscape is playing");
                const mood = soundscape.class.moods[soundscape.class.activeMoodId];
                console.warn(`Sound Type: ${constants.SOUNDTYPE.SOUNDPAD}`)
                //console.warn(mood.sounds);
                sounds = await mood.sounds.filter(sound => sound.type === constants.SOUNDTYPE.SOUNDPAD);
                console.warn(sounds)

            }
        }

        // Build a 2-column menu with up to 10 rows (20 buttons max)
        let totalButtons = sounds.length;
        const buttonsPerColumn = 10; // TODO add to the configuration
        let menuHtml = ""; //`<menu class="flexrow" style="gap: 10px;">`;
        const imgs = [
            'https://images.vexels.com/media/users/3/273074/isolated/preview/496885a8007d7ce0df514a51798953a1-role-play-games-sword-icon.png',
            'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR-jABBhbq67jWo0RrIc6p2yPwbhD_3nZ24Fg&s',
            'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRaeEA7l_CfmU0KevbnrvL8rY0bOiEvIH2kKA&s',
            'https://icons.iconarchive.com/icons/raindropmemory/down-to-earth/512/G12-RPG-icon.png'
        ]
        // Calculate the number of columns needed
        const columns = Math.ceil(sounds.length / buttonsPerColumn);
        let btnIndex = 0;
        //console.warn(sounds)
        console.warn(`Total buttons: ${totalButtons}, Columns: ${columns}, Buttons per column: ${buttonsPerColumn}`);
        for (let col = 0; col < columns; col++) {
            console.warn(btnIndex);
            menuHtml += `<menu class="flexcol" style="gap: 5px;">`;
            for (let row = 0; row < buttonsPerColumn; row++) {
                if (btnIndex >= totalButtons) break;

                menuHtml += `<li style="
                background: url(${imgs[btnIndex % imgs.length]});
                background-position: center;
                background-repeat: no-repeat;
                background-size: cover;"><button style="opacity: 0.3" class="control ui-control layer icon fa-solid fa-play" data-tooltip="${sounds[btnIndex].name}" aria-pressed="false" aria-label="Lighting Controls"></button></li>`;
                btnIndex++;
                
            }
            menuHtml += `</menu>`;
        }
        newElement.innerHTML = menuHtml;

        // Find the parent div and the reference element
        const parent = document.getElementById('ui-left');
        const sceneControls = parent.querySelector('#ui-left-column-1');
        //const sceneControls = parent.querySelector('#scene-navigation');

        // Insert the new element after sceneControls
        if (parent && sceneControls) {
            sceneControls.insertAdjacentElement('beforebegin', newElement);
        } else {
            console.error("Parent or reference element not found.");
            console.error("Parent:", parent);
            console.error("Reference element:", sceneControls);
        }
    }

    /**
     * Activate event listeners
     */
    activateListeners() {
        // Add multiple event types to ensure we catch the interaction
    }

    updateDisplay() {

    }
} 