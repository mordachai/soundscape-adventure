/**
 * Shared FilePicker/DialogV2 prompt helpers used by both the Soundscape sidebar
 * tab and the Soundpad manager for the "pick a folder, name a file, upload JSON"
 * flow. Extracted out of soundscape-tab.mjs so neither feature duplicates it.
 */

export async function promptFolderLoad() {
    return new Promise((resolve) => {
        const fp = new foundry.applications.apps.FilePicker.implementation({
            type: "folder",
            callback: (folderPath) => resolve(folderPath)
        });

        fp.browse();
    });
}

export async function promptFileName(parent, { showLoadSubfolders = true } = {}) {
    const fields = foundry.applications.fields;

    const textInput = fields.createTextInput({
        name: "fileName",
        placeholder: "Enter file name",
        autofocus: true,
        required: true
    });

    const textGroup = fields.createFormGroup({
        input: textInput,
        label: "File Name",
        hint: "Select a file name without extension"
    });

    const content = document.createElement("div");
    content.appendChild(textGroup);

    if (showLoadSubfolders) {
        const checkInput = fields.createCheckboxInput({
            name: "loadSubfolders",
            checked: false
        });
        const checkGroup = fields.createFormGroup({
            input: checkInput,
            label: "Load sounds in subfolders",
            hint: "Mark this option if you want to load sounds in subfolders (may take longer)",
        });
        content.appendChild(checkGroup);
    }

    return foundry.applications.api.DialogV2.prompt({
        window: { title: "Select a file name" },
        content: content,
        modal: true,
        ok: {
            label: "Save",
            icon: "fa-solid fa-floppy-disk",
            callback: (event, button, dialog) => new foundry.applications.ux.FormDataExtended(button.form).object
        },
        rejectClose: false
    }, parent ? { parent } : undefined);
}

export async function promptFileLoad(extension = "json") {
    return new Promise((resolve, reject) => {
        const fp = new foundry.applications.apps.FilePicker.implementation({
            type: "data",
            callback: (path) => resolve(path),
            extensions: [`.${extension}`],
        });

        fp.browse();
    });
}

export async function saveJsonToFolder(folderPath, fileName, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const file = new File([blob], `${fileName}.json`);

    await foundry.applications.apps.FilePicker.implementation.upload("data", folderPath, file, {}, { notify: true });
}
