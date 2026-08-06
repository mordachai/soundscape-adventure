import constants from './constants.mjs';

function getCallerInfo() {
    const err = new Error();
    const stackArray = err.stack.split('\n').map(line => line.trim());
  
    // Adjust index based on how deep you are in the call stack
    const stack = stackArray[2]; // This might need adjustment based on your environment
    const match = stack.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/) || stack.match(/at\s+(.*):(\d+):(\d+)/);
  
    if (match) {
        const filename = match[2] || match[1];
        const pattern = /http:\/\/.*\/modules\/soundscape-adventure\//;

      return {
        functionName: match[1],
        filename: filename.replace(pattern, ''),
        line: match[3],
        column: match[4]
      };
    }
  
    return null;
}

function log(info, message, level = constants.LOGLEVEL.INFO, error = "") {
    const init_message = "Soundscape-Adventure";
    const log_enabled = game.settings.get('soundscape-adventure', 'enable-logs');

    if (log_enabled || level == constants.LOGLEVEL.ERROR) {
        switch (level) {
            case constants.LOGLEVEL.ERROR:
                console.error(`(${init_message}) Filename: (${info.filename}):${info.line}`, message, error);
                break;
            case constants.LOGLEVEL.WARN:
                console.warn(`(${init_message}) Filename: (${info.filename}):${info.line}`, message, error);
                break;
            case constants.LOGLEVEL.INFO:
            default:
                console.info(`(${init_message}) Filename: ${info.filename}:${info.line}`, message, error);
        }
    }
}

function randomWaitTime(_from, _to) {
    const from = _from * 1000;
    const to = _to * 1000;
    return Math.floor(Math.random() * (to - from + 1) + from)
}

/**
 * Browsers block audio (and thus PlaylistSound#_createSound, which throws
 * synchronously rather than queuing) until a user gesture. `game.audio.unlock`
 * is Foundry's own promise for this (set from AudioHelper#awaitFirstGesture()
 * at client boot) — reuse it instead of rolling our own listener, so we're in
 * sync with the exact same gesture Foundry itself unlocks on. Any boot-time
 * code that touches PlaylistSound.load()/_createSound (loop-resume, autoplay,
 * etc.) must await this first or it throws.
 */
async function awaitAudioUnlock() {
    if (!game.audio.locked) return;
    await game.audio.unlock;
}

/**
 * Pick a random volume within ± variationPercent of baseVolume (both in the
 * 0-1 fraction space), clamped to 0-100% before converting back.
 * @param {number} baseVolume 0-1
 * @param {number} variationPercent 0-100
 * @returns {number} 0-1
 */
function randomizedVolume(baseVolume, variationPercent) {
    if (!variationPercent) return baseVolume;
    const basePercent = baseVolume * 100;
    const low = Math.max(0, basePercent - variationPercent);
    const high = Math.min(100, basePercent + variationPercent);
    const raw = low + Math.random() * (high - low);
    // Snap to 10% steps (0.1, 0.2, ... 0.9) instead of a smooth continuous
    // float — discrete jumps read as clearly different, not "samish".
    const stepped = Math.round(raw / 10) * 10;
    return Math.min(100, Math.max(0, stepped)) / 100;
}

async function copyToClipboard(path, target) {
    if (!path) return;
    try {
        await game.clipboard.copyPlainText(path);
        if (target) {
            const original = target.dataset.tooltip;
            target.dataset.tooltip = "Copied!";
            game.tooltip.activate(target, { text: "Copied!" });
            setTimeout(() => {
                game.tooltip.deactivate();
                if (original) target.dataset.tooltip = original;
            }, 900);
        }
    } catch (err) {
        console.warn("Soundscape-Adventure | copy to clipboard failed", err);
        ui.notifications.warn("Could not copy path to clipboard.");
    }
}

export default {
    log,
    randomWaitTime,
    randomizedVolume,
    getCallerInfo,
    copyToClipboard,
    awaitAudioUnlock
};