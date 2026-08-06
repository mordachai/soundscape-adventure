/**
 * Entry point for the standalone Soundpad manager.
 *
 * This is the ONLY top-level file the rollup glob (`scripts/*.mjs`) picks up for
 * this feature; everything else lives under `scripts/soundpad/` (not matched by
 * the glob, same as `scripts/library/`) and is pulled in via this import.
 */

import { SoundpadManager } from "./soundpad/SoundpadManager.mjs";
import SoundpadManagerUI from "./soundpad/SoundpadManagerUI.mjs";
import utils from "./utils/utils.mjs";

let managerUI = null;
export function openSoundpadManager() {
    managerUI ??= new SoundpadManagerUI();
    managerUI.render(true);
    return managerUI;
}

Hooks.once("ready", async () => {
    if (!game.user.isGM) return;

    // Resuming a looping cell touches PlaylistSound#load() -> _createSound,
    // which throws if audio isn't unlocked yet. Without this wait, a pad with
    // an active loop throws out of pad.init() before it's registered in
    // manager.soundpads, so it silently vanishes from the list until reload.
    await utils.awaitAudioUnlock();

    const manager = new SoundpadManager();
    // Exposed on its own namespace, decoupled from game.soundscapeAdventure —
    // same reasoning as game.soundscapeLibrary. `.open()` is the macro/hotbar
    // entry point: game.soundscapeSoundpads.open()
    manager.open = openSoundpadManager;
    game.soundscapeSoundpads = manager;

    try {
        await manager.init();
    } catch (err) {
        console.error("SoundpadManager | failed to load:", err);
    }

    Hooks.callAll("SoundscapeAdventure-Soundpads-Ready", manager);
});

// Foundry-side rename (e.g. via the sound's own config sheet, or the playlist
// sidebar) of a cell's PlaylistSound flows back into the owning cell's alias
// name — the other sync direction is Soundpad.updateCell() calling
// ps.update({name}) when the rename happens from our own Edit-cell dialog.
// `cell.name === changes.name` catches that case and no-ops instead of looping.
Hooks.on('updatePlaylistSound', (playlistSound, changes) => {
    if (!game.user.isGM || !Object.hasOwn(changes, 'name')) return;
    const pad = game.soundscapeSoundpads?.getSoundpadByPlaylistId(playlistSound.parent?.id);
    if (!pad) return;
    const cell = pad.cells.find(c => c.playlistSoundId === playlistSound.id);
    if (!cell || cell.name === changes.name) return;
    cell.name = changes.name;
    pad.save();
});
