import Soundscape from "./soundscape.mjs";
import SoundscapeAdventure from "./soundscape-adventure.mjs";
import utils from "./utils/utils.mjs";
import constants from "./utils/constants.mjs";

const cNoteIcon = "fa-speaker";
const cFolderIcon = "fa-plus";

class SoundscapeTab /*extends SidebarTab*/ {
	constructor(options) {
		//super(options);
		this.soundscapes = null; //options.soundscapes;

		this.tab = options.tab;
		this._oldUI = options.oldUI;

		//this.notes = NoteManager.viewableNotes();

		this.tickNotes = [];

		this.tickCount = 0;
		this.notes = {};

		if (this.tab) {
			this.render();
		}

		//Hooks.on(cModuleName + ".updateNote", (pNewNoteData, pNoteDataUpdate, pContext) => {this.renderUpdate(pNewNoteData, pNoteDataUpdate, pContext)});

		Hooks.on("userConnected", () => { this.checkEnabled() });

		Hooks.on("renderJournalSheet", (pSheet, pHTML, pContext) => {
			let vElement = pHTML[0];

			if (vElement.classList.contains("app")) {
				let vPrevDrop = vElement.ondrop;

				let vJournalID = pSheet?.document?.id;

				vElement.ondrop = (pEvent) => {
					if (vPrevDrop) {
						vPrevDrop(pEvent);
					}

					let vDropData = pEvent.dataTransfer.getData("text/plain") ? JSON.parse(pEvent.dataTransfer.getData("text/plain")) : undefined;

					if (vDropData.isNote) {
						this.onJournaldrop(vJournalID, vDropData.id);
					}
				}
			}
		});
	}

	get useoldUI() {
		return this._oldUI;
	}

	get defaultNoteOptions() {
		return {
			mouseHoverCallBack: (pID) => { this.onMouseHoverNote(pID) },
			onTickChange: (pID) => { this.onTickChange(pID) }
		}
	}

	async promptFolderLoad() {
		return new Promise((resolve) => {
			const fp = new foundry.applications.apps.FilePicker.implementation({
				type: "data",
				callback: (folderPath) => resolve(folderPath),
				type: "folder"
			});

			fp.browse();
		});
	}

	async saveJsonToFolder(folderPath, fileName, data) {
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
		const file = new File([blob], `${fileName}.json`);

		await foundry.applications.apps.FilePicker.implementation.upload("data", folderPath, file, {}, { notify: true });
	}

	async promptFileName() {
		let inputElement;
		const fields = foundry.applications.fields;

		const textInput = fields.createTextInput({
			name: "fileName",
			placeholder: "Enter file name",
			autofocus: true,
			required: true
		});

		// Wrap it into a form group with label and hint
		const textGroup = fields.createFormGroup({
			input: textInput,
			label: "File Name",
			hint: "Select a file name without extension"
		});

		// Create content container
		const content = document.createElement("div");
		content.appendChild(textGroup);
		inputElement = content.querySelector("input[name='fileName']");
		return foundry.applications.api.DialogV2.prompt({
			window: { title: "Select a file name" },
			content: content,
			modal: true,
			ok:
			{
				label: "Save",
				icon: "fa-solid fa-floppy-disk",
				callback: (event, button, dialog) => new foundry.applications.ux.FormDataExtended(button.form).object
			},


			rejectClose: false
		});
	}

	async promptFileLoad(type = ".json") {
		return new Promise((resolve, reject) => {
			// Create the file picker
			const fp = new foundry.applications.apps.FilePicker.implementation({
				type: "data", // 'image', 'audio', 'video', or 'data'
				current: "data", // initial directory
				callback: (path) => resolve(path), // resolve with selected file path
				extensions: [`.${type}`], // optional filter
			});

			fp.browse(); // open the picker
		});
	}

	async render() {
		this.soundscapes = SoundscapeAdventure.soundscapes;
		let vHeader = document.createElement("header");
		vHeader.style.flex = "none";
		if (!this.useoldUI) {
			vHeader.style.gap = "8px";
			vHeader.style.marginBlock = "8px";

			vHeader.style.gap = "8px"
			vHeader.style.display = "flex";
			vHeader.style.flexDirection = "column";
		}

		let vButtons = document.createElement("div");
		vButtons.classList.add("header-actions", "action-buttons");
		vButtons.style.display = "flex";
		if (!this.useoldUI) {
			vButtons.style.paddingInline = "8px";
			vButtons.style.gap = "8px";
		}

		// load soundscape
		let vLoadSoundscapeButton = document.createElement("button");
		vLoadSoundscapeButton.classList.add("create-document", "create-entry");
		vLoadSoundscapeButton.onclick = async (pEvent, pContext = {}) => {

			const path = await new Promise((resolve, reject) => {
				new FilePicker({
					type: "file",
					callback: (path) => {
						if (path) {
							resolve(path);
						} else {
							reject("No folder selected");
						}
					},
					top: 100,    // Position the file picker at the top
					left: 100,   // Position the file picker at the left
				}).render(true);
			});
			await SoundscapeAdventure.loadSoundscape(path);
			this.render(true);
		};

		let vLoadSoundscapeIcon = document.createElement("i");
		vLoadSoundscapeIcon.classList.add("fa-solid", cNoteIcon);

		let vLoadSoundscapeLabel = document.createElement("label");
		vLoadSoundscapeLabel.innerHTML = "Load Soundscape";

		vLoadSoundscapeButton.appendChild(vLoadSoundscapeIcon);
		vLoadSoundscapeButton.appendChild(vLoadSoundscapeLabel);
		// new soundscape button
		let vNewSoundscapeButton = document.createElement("button");
		vNewSoundscapeButton.classList.add("create-document", "create-entry");
		vNewSoundscapeButton.onclick = (pEvent) => {
			this.promptFolderLoad().then(async (folderPath) => {
				// Step 1: Choose a folder
				if (!folderPath) return ui.notifications.warn("No folder selected.");

				// Step 2: Ask for filename
				const fileName = (await this.promptFileName())?.fileName;
				if (!fileName) return ui.notifications.warn("Filename is required.");

				// Step 3: Create your data
				const exampleData = {
					name: fileName,
					created: new Date().toISOString(),
					description: "Soundscape Adventure!",
					moods: {}
				};

				// Step 4: Save it
				await this.saveJsonToFolder(folderPath, fileName, exampleData);
				//ui.notifications.info(`Saved ${fileName}.json to ${folderPath}`);

				// Step 5: Add file to the local configuration
				const current_soundscapes = await game.settings.get('soundscape-adventure', 'soundscapes');
				const soundscapes = current_soundscapes ? `${current_soundscapes};${folderPath}/${fileName}.json` : `${folderPath}/${fileName}.json`;
				await game.settings.set('soundscape-adventure', 'soundscapes', soundscapes);
				await SoundscapeAdventure.loadSoundscape(`${folderPath}/${fileName}.json`);

				// Step 6: RELOAD Tab
				this.render(true);
				// 
			});

		};

		let vNewFolderIcon = document.createElement("i");
		vNewFolderIcon.classList.add("fa-solid", cFolderIcon);

		let vNewFolderLabel = document.createElement("label");
		vNewFolderLabel.innerHTML = "New Soundscape";

		vNewSoundscapeButton.appendChild(vNewFolderIcon);
		vNewSoundscapeButton.appendChild(vNewFolderLabel);

		if (!this.useoldUI) {
			vLoadSoundscapeButton.style.flexGrow = "1";
			vNewSoundscapeButton.style.flexGrow = "1";
		}

		vButtons.appendChild(vLoadSoundscapeButton);
		vButtons.appendChild(vNewSoundscapeButton);

		vHeader.appendChild(vButtons);
		const existing_header = this.tab.querySelector("header");
		if (existing_header) {
			this.tab.removeChild(existing_header);
		}
		this.tab.appendChild(vHeader);

		// Render SIDEBAR
		const element = document.createElement("ol");
		element.classList.add("directory-list", "soundscape-list");
		element.style.padding = "0px";
		const current_playing = game.settings.get('soundscape-adventure', 'current-playing');
		// RENDER Soundscapes
		for (const soundscape in this.soundscapes) {
			const soundscape_html = this.soundscapes[soundscape].class.render(current_playing);
			const createButton = soundscape_html.querySelector('[data-action="soundscape-open"]');
			// Open soundscape [action]
			if (createButton) {
				createButton.addEventListener("click", (event) => {
					event.preventDefault(); // Optional: prevents default behavior if it's a link
					SoundscapeAdventure.openSoundboard(createButton.dataset.soundboardId);
					// Your custom logic here
				});
			}

			// Reload soundscape action
			const reloadButton = soundscape_html.querySelector('[data-action="soundscape-reload"]');
			if (reloadButton) {
				reloadButton.addEventListener("click", (event) => {
					event.preventDefault(); // Optional: prevents default behavior if it's a link
					SoundscapeAdventure.soundscapes[reloadButton.dataset.soundboardId].class.reloadSoundscape();
					// Your custom logic here
				});
			}

			// Delete soundscape action
			const deleteButton = soundscape_html.querySelector('[data-action="soundscape-remove"]');
			if (deleteButton) {
				deleteButton.addEventListener("click", async (event) => {
					event.preventDefault(); // Optional: prevents default behavior if it's a link
					
					const remove_playlist = await foundry.applications.api.DialogV2.confirm({
						window: { title: "Delete soundscape" },
						content: "<p>Do you really want to remove the soundscape? (also the playlist will be removed)</p>"
					});
					if (remove_playlist) {
						await SoundscapeAdventure.deleteSoundscape(deleteButton.dataset.soundboardId, remove_playlist);
					}
					this.render(true);
					// Your custom logic here
				});
			}

			//mood-control
			const playButtons = soundscape_html.querySelectorAll('.mood-control');
			if (playButtons.length) {
				playButtons.forEach((playButton) => {
					playButton.addEventListener("click", async (event) => {
						const dataset = event.target.closest(".mood-controls").dataset;
						if (!dataset.moodId || !dataset.soundscapeId) {
							utils.log("Missing moodId or soundscapeId in dataset: ${dataset}", constants.LOGLEVEL.WARN);
							return;
						}
						const moodId = dataset.moodId;
						const soundscapeId = dataset.soundscapeId;
						const action = event.target.dataset.action || "None"; // Default to playStopMood if not specified

						switch (action) {
							case "playStopMood":
								await this.soundscapes[soundscapeId].class.playStopMood(moodId);
								break;
							case "deleteMood":
								await this.soundscapes[soundscapeId].class.dialogDeleteMood(moodId);
								break;
							default:
								
						}
						this.render(true); // Re-render the tab to reflect changes
					});
				});
			}
			element.appendChild(soundscape_html);
		}
		const existing_element = this.tab.querySelector("ol");
		if (existing_element) {
			this.tab.removeChild(existing_element);
		}
		this.tab.appendChild(element);
	}

	renderEntries() {
		for (let vKey of Object.keys(this.notes)) {
			let vClass = CONFIG[cModuleName].noteTypes[this.notes[vKey].type];

			let vToggles = this.noteToggle;

			if (vClass) {
				this.notes[vKey] = new vClass(vKey, this.notes[vKey], this.defaultNoteOptions);

				//this.entries.appendChild(this.notes[vKey].render());

				let vElement = this.notes[vKey].render();

				/*
				if (vElement && this.notes[vKey].valid) {
					this.entries.appendChild(vElement);
				}
				else {
					delete this.notes[vKey];
				}
				*/
			}
			else {
				delete this.notes[vKey];
			}
		}

		//this.sortEntries();
		this.rebuildTickList();
	}

	/*
	renderUnsorted() {
		let vUsers = Array.from(game.users).filter(vUser => !vUser.isSelf);
		
		for (let vUser of vUsers) {
			let vUserCategory = document.createElement("details");
			let vUserTitle = document.createElement("summary");
			vUserTitle.style.marginLeft = "15px";
			vUserTitle.innerHTML = vUser.name;
			
			let vUserCatDIV = document.createElement("div");
			vUserCatDIV.style.height = "auto";
			vUserCatDIV.style.marginLeft = "15px";
			
			vUserCategory.appendChild(vUserTitle);
			vUserCategory.appendChild(vUserCatDIV);
			
			this.unsortedMain.appendChild(vUserCategory);
			
			this.unsortedCats[vUser.id] = vUserCategory;
			this.unsortedCatDIVs[vUser.id] = vUserCatDIV;
		}
	}
	*/

	renderPopout() {
		new tabWindow().render(true);
	}

	checkEnabled() {
		for (let vNote of Object.values(this.notes)) {
			vNote.checkEnabled();
		}
	}

	async createEntry(pType, pData, pContext = {}) {
		let vClass = CONFIG[cModuleName].noteTypes[pType];

		if (vClass) {
			return await NoteManager.createNewNote({ ...pData, type: pType }, pContext);
		}
	}

	addNote(pID, pContext = {}) {
		this.closeNote(pID);

		let vNote = NoteManager.getNote(pID);

		if (vNote) {
			let vClass = CONFIG[cModuleName].noteTypes[vNote.type];

			if (vClass && NoteManager.canSeeSelf(vNote)) {
				this.notes[pID] = new vClass(pID, vNote, this.defaultNoteOptions);

				this.notes[pID].render();

				if (this.notes[pID].valid) {
					this.rootFolder.checkNote(pID, pContext);
					/*
					let vTargetFolder = this.rootFolder;
					
					if (pContext.targetFolderID) {
						vTargetFolder = this.rootFolder.folder[pContext.targetFolderID] || this.rootFolder;
					}
					
					if (vTargetFolder) {
						vTargetFolder.addNote(this.notes[pID].id);//appendChild(vElement);
					}
					*/
				}
				else {
					delete this.notes[pID];
				}

				//this.sortEntries();
				this.rebuildTickList();
			}
		}
	}

	closeNote(pID) {
		let vNote = this.notes[pID];

		if (vNote) {
			delete this.notes[pID];

			vNote.close();
		}
	}

	renderUpdate(pNewNoteData, pNoteDataUpdate, pContext) {
		let vNote = this.notes[pNewNoteData.id];

		if (vNote) {
			if (pContext.deletion || !NoteManager.canSeeSelf(pNewNoteData)) {
				this.closeNote(pNewNoteData.id);
			}
			else {
				vNote.updateRender(pNewNoteData, pNoteDataUpdate, pContext);
			}
		}
		else {
			if (!pContext.deletion && NoteManager.canSeeSelf(pNewNoteData)) {
				this.addNote(pNewNoteData.id, pContext);
			}
		}
	}

	/*
	onEntriesdrop(pEvent) {
		let vDropData = pEvent.dataTransfer.getData("text/plain") ? JSON.parse(pEvent.dataTransfer.getData("text/plain")) : undefined;
		
		if (vDropData?.isNote) {
			let vElements = this.entries.childNodes;
			
			let i = 0;
			
			let vBeforeCenter = false;
			
			while (i < vElements.length && !vBeforeCenter) {
				let vRectangle =  vElements[i].getBoundingClientRect();
				
				let vMiddle = vRectangle.top + vRectangle.height/2;
				vBeforeCenter = pEvent.pageY < vMiddle;
				
				if (!vBeforeCenter) {
					i = i+1;
				}
			}
			
			if (i < vElements.length) {
				let vBeforeID = vElements[i].id;
				
				if (vBeforeID != vDropData.id) {
					this.sortBefore(vDropData.id, vBeforeID);
				}
			}
			else {
				this.sortatEnd(vDropData.id);
			}	
		}
	}
		
	onUnsortedDrop(pEvent) {
		let vDropData = pEvent.dataTransfer.getData("text/plain") ? JSON.parse(pEvent.dataTransfer.getData("text/plain")) : undefined;
		
		if (vDropData?.isNote) {
			
		}
	}
	*/

	onJournaldrop(pJournalID, pNoteID) {
		if (pJournalID && pNoteID) {
			this.notes[pNoteID]?.onJournaldrop(pJournalID);
		}
	}

	onMouseHoverNote(pID) {
		for (let vKey of Object.keys(this.notes)) {
			if (vKey != pID) {
				this.notes[vKey].isMouseHover = false;
			}
		}
	}

	onTickChange(pID) {
		if (this.notes[pID]?.hastick) {
			if (!this.tickNotes.find(vNote => vNote.id == pID)) {
				this.tickNotes.push(this.notes[pID]);
			}
		}
		else {
			this.tickNotes = this.tickNotes.filter(vNote => vNote?.hastick);
		}

		if (this.tickNotes.length > 0 && !this.hasTick) {
			this.tick();
		}
	}

	rebuildTickList() {
		this.tickNotes = Object.values(this.notes).filter(vNote => vNote?.hastick);

		if (this.tickNotes.length > 0 && !this.hasTick) {
			this.tick();
		}
	}

	tick(pForce) {
		if (this.tickNotes.length > 0) {
			this.hasTick = true;
			this.tickCount = this.tickCount + 1;
			for (let vNote of this.tickNotes) {
				vNote?.tickbasic(this.tickCount);
			}
			setTimeout(() => { this.tick() }, cTickInterval);
		}
		else {
			this.hasTick = false;
		}
	}

	/*
	sortBefore(pInsertID, pBeforeID) {
		let vSortorder = this.sortorder.order;
		
		let vElement = this.notes[pInsertID].element;
		let vBeforeElement = this.notes[pBeforeID].element;
		
		if (vElement && vBeforeElement) {
			let vNewSortorder = vSortorder.filter(vID => vID != pInsertID);
			
			let vSortIndex = vNewSortorder.indexOf(pBeforeID);
			
			vNewSortorder = [...vNewSortorder.slice(0, vSortIndex), pInsertID, ...vNewSortorder.slice(vSortIndex, vNewSortorder.length)];
			
			vBeforeElement.before(vElement);
		
			this.sortorder = {order : vNewSortorder};
		}
	}
		
	sortatStart(pInsertID) {
		let vSortorder = this.sortorder.order;
		
		let vElement = this.notes[pInsertID].element;
		
		if (vElement) {
			vSortorder.unshift(pInsertID);
			
			this.entries.prepend(vElement);
			
			this.sortorder = {order : vSortorder};
		}
	}
		
	sortatEnd(pInsertID) {
		let vSortorder = this.sortorder.order;
		
		let vElement = this.notes[pInsertID].element;
		
		if (vElement) {
			vSortorder.push(pInsertID);
			
			this.entries.appendChild(vElement);
			
			this.sortorder = {order : vSortorder};
		}
	}
	*/

	filterEntries(pFilter) {
		this.rootFolder.applyFilter(pFilter);
	}
}

export default SoundscapeTab;