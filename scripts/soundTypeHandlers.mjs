/**
 * Sound Type Handlers - Strategy Pattern for sound playback
 *
 * Each handler implements play() and stop() methods for a specific sound type.
 * This eliminates the large switch statements in Soundscape.playSound() and stopSound().
 */

import constants from "./utils/constants.mjs";

/**
 * Context object passed to all handlers
 * @typedef {Object} SoundContext
 * @property {Playlist} playlist - The Foundry playlist
 * @property {string} playlistId - The playlist ID
 * @property {MoodConfig} mood - The current mood
 * @property {RandomSoundManager} randomSoundManager - The random sound manager
 * @property {Function} _playSound - Helper function to play a sound with fade
 * @property {Function} _playLoopGroup - Helper function to play loop groups
 */

/**
 * Helper to play a sound with fade in/out
 * @param {SoundConfig} soundConfig
 * @param {PlaylistSound} sound
 * @param {Playlist} playlist
 */
export async function playSoundWithFade(soundConfig, sound, playlist) {
    await sound.load();

    // foundryVTT suports fade out nativally. We can use that instead of implementing our own fade out logic.
    console.warn(`Playing sound ${sound.name} with fade out ${soundConfig.fadeOut} and fade in ${soundConfig.fadeIn}`);
    await sound.update({ fade: soundConfig.fadeOut > 0 ? soundConfig.fadeOut * 1000 : null });
    //console.warn(`Playing sound ${sound.name} with fade out ${soundConfig.fadeOut}`);

    sound.update({ volume: soundConfig.volume });
    await playlist.playSound(sound);
    if (soundConfig.fadeIn > 0) {
        await sound.load();
        // foundry VTT sets gain to default everytime we play a sound.
        // that requires us to create a custom node to set the gain, this custom node will be the man-in-the-middle that allows the fadein work
        const s = sound.sound;
        const context = s.context;
        const fadeNode = context.createGain();
        const target = soundConfig.volume;
        fadeNode.gain.value = 0; // start silent
        // disconnect source from foundry gain
        s.sourceNode.disconnect();
        // reconnect through private node
        s.sourceNode.connect(fadeNode);
        fadeNode.connect(s.gainNode);
        // fade in
        const now = context.currentTime;
        fadeNode.gain.setValueAtTime(0, now);
        fadeNode.gain.linearRampToValueAtTime(
            1.0,
            now + Number(soundConfig.fadeIn)
        );
        
        // const interval = setInterval(() => {

        //     console.warn(
        //         `Sound ${sound.name}: gain ${fadeNode.gain.value}`
        //     );

        // }, 1000);

        // setTimeout(() => {

        //     clearInterval(interval);

        //     console.warn(
        //         `Fade finished in sound ${sound.name}: volume ${fadeNode.gain.value}`
        //     );

        // }, soundConfig.fadeIn * 1000);
    }

    await new Promise(r => setTimeout(r, 0));
}

function rampVolume({
    start = 0,
    end = 0.6,
    durationSeconds = 10,
    onUpdate = () => { },
    onComplete = () => { }
}) {
    const steps = durationSeconds;
    const stepTime = 1000; // 1 second
    const increment = (end - start) / steps;

    let current = start;
    let count = 0;

    function tick() {
        current += increment;
        count++;

        // Clamp to avoid floating point drift
        if (count >= steps) {
            current = end;
        }

        onUpdate(current);

        if (count < steps) {
            setTimeout(tick, stepTime);
        } else {
            onComplete(current);
        }
    }

    // initial call
    onUpdate(current);
    setTimeout(tick, stepTime);
}

/**
 * Schedule the fade-in ramp for a sound that was started silent by
 * playSoundWithFade. Must run after every sound in the play batch has started:
 * Foundry's PlaylistSound#sync() rewrites the gain on every PlaylistSound
 * update across the playlist, so a ramp scheduled mid-batch is wiped out by
 * the next sound's playing:true update.
 *
 * @param {SoundConfig|GroupConfig} soundConfig
 * @param {PlaylistSound} playlistSound
 */
// export async function applyFadeIn(soundConfig, playlistSound) {
//     if (!soundConfig?.fadeIn || soundConfig.fadeIn <= 0) return;
//     const audio = await playlistSound?.sound.load();
//     if (!audio) return;

//     if (soundConfig.fadeIn)


//         const playlist = game.playlists.get('DrfStAXnoHRnNuOo');
//     const playlistSound = playlist.sounds.get('wvWioCZRgLotn2FP');

//     const s = playlistSound.sound;

//     const context = s.context;

//     const fadeNode = context.createGain();
//     fadeNode.gain.value = 0;

//     // disconnect source from foundry gain
//     s.sourceNode.disconnect();

//     // reconnect through your private node
//     s.sourceNode.connect(fadeNode);
//     fadeNode.connect(s.gainNode);

//     // fade in
//     const now = context.currentTime;

//     fadeNode.gain.setValueAtTime(0, now);
//     const target = soundConfig.volume;
//     fadeNode.gain.linearRampToValueAtTime(
//         target,
//         now + 20
//     );




//     rampVolume({
//         start: 0,
//         end: parseFloat(soundConfig.volume),
//         durationSeconds: soundConfig.fadeIn,
//         onUpdate: (value) => {
//             //console.warn(`Fading in sound ${playlistSound.name}: volume ${value}`);
//             playlistSound.update({ volume: value.toFixed(4) });
//         },
//         onComplete: (value) => {
//             //console.warn(`Fade finished in sound ${playlistSound.name}: volume ${value.toFixed(4)}`);
//             playlistSound.update({ volume: value.toFixed(4) });
//         }
//     });

//     //await playlistSound.update({ volume: soundConfig.volume });



//     // const now = audio.context.currentTime;
//     // const currentGain = audio.gain.value;
//     // audio.gain.cancelScheduledValues(now);
//     // audio.gain.setValueAtTime(0, now);
//     // audio.gain.linearRampToValueAtTime(soundConfig.volume, now + soundConfig.fadeIn);
//     // //audio.gain.linearRampToValueAtTime(1, now + soundConfig.fadeIn);
// }

/**
 * Helper to stop a sound with fade out
 * @param {SoundConfig} soundConfig
 * @param {PlaylistSound} playlistSound
 * @param {Playlist} playlist
 */
async function stopSoundWithFade(soundConfig, playlistSound, playlist) {
    if (!playlistSound) return;

    await playlistSound.load();
    if (!playlistSound.playing) return;

    await playlistSound.sound.load();


    //if (soundConfig.fadeOut > 0) {
    // playlistSound.sound.fade(0, {
    //     duration: soundConfig.fadeOut > 0 ? soundConfig.fadeOut * 1000 : 0,
    //     from: playlistSound.sound.volume,
    //     type: "linear"
    // });
    // playlistSound.sound.fade(0, {
    //     duration: soundConfig.fadeOut * 1000,
    //     from: playlistSound.sound.volume
    // }).then(async () => {
    //     console.warn(`Stopped sound ${playlistSound.name}:${playlistSound.volume} with fade out ${soundConfig.fadeOut}`);
    //     await playlist.stopSound(playlistSound);
    // });
    //} //else {
    await playlist.stopSound(playlistSound);
    //}
}

/**
 * Handler for LOOP sounds (type 1)
 */
const loopHandler = {
    async play(soundConfig, context) {
        const sound = await context.playlist.sounds.get(soundConfig.id);
        if (sound) {
            context.mood.enableSound(soundConfig.id);
            await playSoundWithFade(soundConfig, sound, context.playlist);
        }
    },

    async stop(soundConfig, context) {
        const playlistSound = await context.playlist.sounds.get(soundConfig.id);
        await stopSoundWithFade(soundConfig, playlistSound, context.playlist);
    }
};

/** 
 * Handler for RANDOM sounds (type 2)
 */
const randomHandler = {
    async play(soundConfig, context) {
        context.randomSoundManager.start(
            context.playlistId,
            soundConfig.id,
            soundConfig
        );
    },

    async stop(soundConfig, context) {
        if (soundConfig.group !== "") {
            const group = context.mood.groups.find(el => el.id === soundConfig.group);
            if (group) {
                context.randomSoundManager.stop(context.playlistId, group.sounds.map(s => s.id));
            }
        } else {
            context.randomSoundManager.stop(context.playlistId, soundConfig.id);
        }
    }
};

/**
 * Handler for SOUNDPAD sounds (type 3) and SOUNDPADUI (type 7)
 */
const soundpadHandler = {
    async play(soundConfig, context) {
        const sound = await context.playlist.sounds.get(soundConfig.id);
        if (sound) {
            sound.update({ "repeat": false });
            await playSoundWithFade(soundConfig, sound, context.playlist);
        }
    },

    async stop(soundConfig, context) {
        const playlistSound = await context.playlist.sounds.get(soundConfig.id);
        await stopSoundWithFade(soundConfig, playlistSound, context.playlist);
    }
};

/**
 * Handler for GROUP_LOOP sounds (type 4)
 */
const groupLoopHandler = {
    async play(soundConfig, context) {
        // Set all sounds in group to repeat
        for (let i = 0; i < soundConfig.sounds.length; i++) {
            const sound = await context.playlist.sounds.get(soundConfig.sounds[i].id);
            if (sound) {
                sound.update({ "repeat": true });
            }
        }
        // Play the current sound based on intensity
        await context.playFromGroup(soundConfig.id, context.moodId);
    },

    async stop(soundConfig, context) {
        const playlistSound = await context.playlist.sounds.get(soundConfig.current);
        await stopSoundWithFade(soundConfig, playlistSound, context.playlist);
    }
};

/**
 * Handler for GROUP_RANDOM sounds (type 5)
 */
const groupRandomHandler = {
    async play(soundConfig, context) {
        // Set all sounds in group to not repeat
        for (let i = 0; i < soundConfig.sounds.length; i++) {
            const sound = await context.playlist.sounds.get(soundConfig.sounds[i].id);
            if (sound) {
                sound.update({ "repeat": false });
            }
        }
        // Start random sound manager for the group
        const groupOfSounds = soundConfig.sounds.map(sound => sound.id);
        context.randomSoundManager.start(
            context.playlistId,
            groupOfSounds,
            soundConfig
        );
    },

    async stop(soundConfig, context) {
        const soundIds = soundConfig.sounds.map(s => s.id);
        context.randomSoundManager.stop(context.playlistId, soundIds);
        // Also stop any playing sounds
        for (const soundId of soundIds) {
            await context.playlist.stopSound({ id: soundId });
        }
    }
};

/**
 * Handler for GROUP_SOUNDPAD sounds (type 6)
 */
const groupSoundpadHandler = {
    async play(soundConfig, context) {
        const sound = await context.playlist.sounds.get(soundConfig.id);
        if (sound) {
            sound.update({ "repeat": false });
            await playSoundWithFade(soundConfig, sound, context.playlist);
        }
    },

    async stop(soundConfig, context) {
        const sounds = context.mood.getSoundByGroup(soundConfig.id);
        for (let i = 0; i < sounds.length; i++) {
            await context.playlist.stopSound({ id: sounds[i].id });
        }
    }
};

/**
 * Registry of handlers by sound type
 */
const handlers = {
    [constants.SOUNDTYPE.AMBIENCE]: loopHandler,  // Treat ambience like loop
    [constants.SOUNDTYPE.LOOP]: loopHandler,
    [constants.SOUNDTYPE.RANDOM]: randomHandler,
    [constants.SOUNDTYPE.SOUNDPAD]: soundpadHandler,
    [constants.SOUNDTYPE.GROUP_LOOP]: groupLoopHandler,
    [constants.SOUNDTYPE.GROUP_RANDOM]: groupRandomHandler,
    [constants.SOUNDTYPE.GROUP_SOUNDPAD]: groupSoundpadHandler,
    [constants.SOUNDTYPE.SOUNDPADUI]: soundpadHandler,  // Same as soundpad
};

/**
 * Get the handler for a sound type
 * @param {number} soundType - The sound type constant
 * @returns {Object} Handler with play() and stop() methods
 */
export function getHandler(soundType) {
    return handlers[soundType] || soundpadHandler;  // Default to soundpad handler
}

/**
 * Check if a sound type is a group type
 * @param {number} soundType - The sound type constant
 * @returns {boolean}
 */
export function isGroupType(soundType) {
    return soundType === constants.SOUNDTYPE.GROUP_LOOP ||
        soundType === constants.SOUNDTYPE.GROUP_RANDOM ||
        soundType === constants.SOUNDTYPE.GROUP_SOUNDPAD;
}

export default {
    getHandler,
    isGroupType,
    playSoundWithFade,
    stopSoundWithFade,
    //applyFadeIn
};
