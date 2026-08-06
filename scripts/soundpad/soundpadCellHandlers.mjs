/**
 * Pure helpers shared between Soundpad.mjs (playback) and SoundpadManagerUI.mjs
 * (the cell-edit dialog). Kept free of Foundry document access so they're trivial
 * to reason about/test.
 */

/**
 * Translate a cell's loopMode into the {from, to} config RandomSoundManager.start()
 * expects. `once` isn't scheduled at all — callers should skip RandomSoundManager
 * entirely and just play the sound a single time.
 * @param {object} cell
 * @returns {{from:number, to:number}|null}
 */
export function loopConfigFor(cell) {
    if (cell.loopMode === "simple") return { from: 0, to: 0 };
    if (cell.loopMode === "interval") return { from: cell.interval, to: cell.interval };
    if (cell.loopMode === "random") return { from: cell.random.from, to: cell.random.to };
    return null;
}

/**
 * Validate a Loop random cell's Min/Max bounds: both must be whole seconds and
 * neither may be shorter than the sound's own duration (a bound shorter than the
 * clip can never be honored — the sound is still playing when the "random" delay
 * would already have re-fired it).
 * @param {number} min
 * @param {number} max
 * @param {number} durationSeconds
 * @returns {{ok:boolean, message:string}}
 */
export function validateRandomBounds(min, max, durationSeconds) {
    const minCeil = Math.ceil(durationSeconds || 0);
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
        return { ok: false, message: "Min and Max time must be whole seconds." };
    }
    if (min > max) {
        return { ok: false, message: "Min time cannot be greater than Max time." };
    }
    if (min < minCeil || max < minCeil) {
        return { ok: false, message: `Min and Max time cannot be less than the sound's duration (${minCeil}s).` };
    }
    return { ok: true, message: "" };
}
