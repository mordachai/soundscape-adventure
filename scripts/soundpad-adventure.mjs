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

/**
 * Activate a mood's linked Soundpads in the manager: replaces the "checked"
 * selection outright (so previously-checked pads that aren't part of this
 * mood get deselected, not just added to) and switches "Only selected" on so
 * the pad list narrows to exactly this mood's pads. A no-op when the mood has
 * no linked pads — the manager's existing selection is left alone (see
 * Soundscape.playMood). Lazily creates the manager UI singleton if it doesn't
 * exist yet, without rendering it, so the state survives until the user
 * actually opens the window.
 */
export function activateLinkedSoundpads(padIds) {
    if (!padIds?.length) return;
    managerUI ??= new SoundpadManagerUI();
    managerUI.checkedPadIds = new Set(padIds);
    managerUI.onlySelected = true;
    if (managerUI.rendered) managerUI.myRender(true);
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

// A one-shot cell's "playing" ring must clear once its sound naturally ends.
// Playlist's own playback scheduler patches sound state (playing/pausedTime)
// through a bulk update on the *parent* Playlist doc — `changes.sounds` is an
// array of per-embedded-sound diffs — rather than through individual
// `updatePlaylistSound` embedded-doc updates, so that hook never fires for
// this (confirmed live: zero updatePlaylistSound events across a full
// play-to-end cycle, only updatePlaylist with a `sounds` diff array).
Hooks.on('updatePlaylist', (playlist, changes) => {
    if (!game.user.isGM || !Array.isArray(changes.sounds)) return;
    const stoppedIds = changes.sounds
        .filter(s => Object.hasOwn(s, 'playing') && !s.playing)
        .map(s => s._id);
    if (!stoppedIds.length) return;
    const pad = game.soundscapeSoundpads?.getSoundpadByPlaylistId(playlist.id);
    if (!pad || !managerUI?.rendered || managerUI.selectedPadId !== pad.id) return;
    if (pad.cells.some(c => stoppedIds.includes(c.playlistSoundId))) {
        managerUI.myRender(true);
    }
});
