/**
 * Entry point for the standalone Sound Library (Phase 1).
 *
 * This is the ONLY top-level file the rollup glob (`scripts/*.mjs`) picks up for
 * the library; everything else lives under `scripts/library/` (not matched by the
 * glob, same as `scripts/utils/`) and is pulled in via this import. Keeping a
 * single entry here means the library can be added or removed without touching
 * any existing soundscape file.
 */

import { SoundLibrary } from "./library/SoundLibrary.mjs";
import LibraryApp from "./library/ui/LibraryApp.mjs";

/** Lazily-created singleton window. */
let libraryApp = null;
export function openLibrary() {
    libraryApp ??= new LibraryApp();
    libraryApp.render(true);
    return libraryApp;
}

Hooks.once("ready", async () => {
    const library = new SoundLibrary();
    // Exposed on its own namespace to stay fully decoupled from the existing
    // `game.soundscapeAdventure` singleton during Phase 1.
    game.soundscapeLibrary = library;

    try {
        await library.load();
        console.log(`SoundLibrary | loaded ${library.size} sound(s) from ${library.store.path}`);
    } catch (err) {
        console.error("SoundLibrary | failed to load:", err);
    }

    Hooks.callAll("SoundscapeAdventure-Library-Ready", library);
});

// Own button in the Sounds control group — no edits to existing init code.
Hooks.on("getSceneControlButtons", (controls) => {
    if (!controls.sounds?.tools) return;
    controls.sounds.tools["soundscape-library"] = {
        name: "soundscape-library",
        title: "Sound Library",
        icon: "fas fa-list-music",
        button: true,
        visible: game.user.isGM,
        onChange: () => openLibrary()
    };
});
