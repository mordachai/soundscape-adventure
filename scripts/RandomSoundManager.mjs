import utils from './utils/utils.mjs';
import constants from './utils/constants.mjs';
import { playSoundWithFade } from './soundTypeHandlers.mjs';

export class RandomSoundManager {
  constructor() {
    this.jobs = new Map();
  }

  _makeKey(playlistId, soundKey) {
    return `${playlistId}-${soundKey}`;
  }

  _getRandomDelay(from, to) {
    const num_random = Math.random();
    utils.log(utils.getCallerInfo(),`Random time from ${from} to ${to}: ${num_random}`, constants.LOGLEVEL.INFO);
    const minCeiled = Math.ceil(from);
    const maxFloored = Math.floor(to);
    return Math.floor(Math.random() * (maxFloored - minCeiled + 1) + minCeiled) * 1000;
    //return delay;
  }

  _getRandomIndexExcluding(max, excludeIndex) {
    if (max <= 1) return 0;
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * max);
    } while (newIndex === excludeIndex);
    return newIndex;
  }

  async _playSound(playlistId, soundKey) {
    const key = this._makeKey(playlistId, soundKey);
    const job = this.jobs.get(key);
    if (!job) return;
    const { from, to, volume, playOnce, soundIds, fadeIn, fadeOut, lastPlayedIndex, sequential } = job.config;
    const playlist = game.playlists.get(playlistId);
    if (!playlist) return;

    let nextSoundId;
    let nextIndex = 0;

    if (Array.isArray(soundIds)) {
      // Sequential loop groups walk the members in order and wrap back to the
      // first; random groups pick any member except the one just played.
      nextIndex = sequential
        ? (lastPlayedIndex + 1) % soundIds.length
        : this._getRandomIndexExcluding(soundIds.length, lastPlayedIndex);
      nextSoundId = soundIds[nextIndex];
      job.config.lastPlayedIndex = nextIndex;
    } else {
      nextSoundId = soundIds;
    }

    const playlistSound = playlist.sounds.get(nextSoundId);
    if (!playlistSound) return;

    // When this call is itself the continuation of a loop (the previous play just
    // naturally ended), Foundry's own PlaylistSound#_onEnd cleanup — update({playing:
    // false}) — was kicked off by that same "end" event and may still be in flight.
    // Racing it with our own update({playing:true}) below is a coin flip: if the
    // cleanup lands second, it silently clobbers us back to not-playing, nothing is
    // actually playing, and no further "end" ever fires — the loop just dies with no
    // error. Wait for that cleanup to actually settle first.
    let settleGuard = 0;
    while (playlistSound.playing && settleGuard++ < 50) {
      await new Promise(r => setTimeout(r, 10));
    }

    // Play the sound
    await playSoundWithFade(job.config, playlistSound, playlist);
    //await playlist.playSound(playlistSound);

    // Wait for the internal Sound instance to be ready
    const audioSound = playlistSound.sound;
    if (!audioSound) {
      // Fallback to polling
      await this._waitForSoundToStop(playlistSound);
    } else {
      // Wait for the "end" event
      await new Promise(resolve => {
        const done = () => {
          audioSound.removeEventListener('end', done);
          job.pendingCleanup = null;
          resolve();
        };
        audioSound.addEventListener('end', done);
        // stop() calls this to release the listener immediately instead of
        // leaving it dangling: a manual stop dispatches "stop", never "end",
        // so without this the listener never fires on its own. If it survives
        // to the sound's *next* natural end (cell stopped then restarted before
        // then), it fires as a stale duplicate alongside the new job's own
        // listener and injects an extra out-of-turn play into the live loop —
        // audible as the sound cutting early. The identity check below makes
        // any such stale wakeup a no-op regardless.
        job.pendingCleanup = done;
      });
    }

    // The job may have been stopped (or replaced by a fresh start() on the same
    // key) while awaiting "end" above — only the current job may reschedule.
    if (this.jobs.get(key) !== job) return;

    if (playOnce) {

      this.stop(playlistId, soundKey);
    } else {
      // Sequential playback chains the next member as soon as the current one
      // ends (no gap); random playback waits a random interval in between.
      const delay = sequential ? 0 : this._getRandomDelay(from, to);

      const timeoutId = setTimeout(() => this._playSound(playlistId, soundKey), delay);
      job.timeoutId = timeoutId;
    }
  }


  /**
   * Inicia um som ou grupo de sons aleatórios.
   * @param {string} playlistId
   * @param {string|string[]} soundIds
   * @param {number} from
   * @param {number} to
   * @param {number} volume
   * @param {boolean} playOnce
   * @param {string} [jobKey] Explicit job-map key, overriding the default (soundIds-derived) one.
   *   Needed by Soundpad: several cells can reference the same shared PlaylistSound, and each
   *   must still get its own independent schedule instead of cancelling/replacing the others'.
   */
  start(playlistId, soundIds, soundConfig, jobKey = null) {
    //const soundIds = soundConfig.soundIds
    // Groups store their interval under `random` (from/to); single random sounds use top-level from/to.
    const from = soundConfig.random?.from ?? soundConfig.from
    const to = soundConfig.random?.to ?? soundConfig.to
    const volume = soundConfig.volume
    const playOnce = soundConfig.playOnce;
    const isGroup = Array.isArray(soundIds);
    const soundKey = jobKey ?? (isGroup ? soundIds.join(',') : soundIds);
    const key = this._makeKey(playlistId, soundKey);
    const fadeOut = soundConfig.fadeOut || 0;
    const fadeIn = soundConfig.fadeIn || 0;
    // Loop groups set to sequential play their members in order with no interval.
    const sequential = soundConfig.playMode === constants.GROUPLOOPMODE.SEQUENTIAL;
    if (isGroup && this.jobs.has(key)) {
      return;
    }
    this.stop(playlistId, soundIds, jobKey);

    const config = {
      from, to, volume, playOnce,
      soundIds,
      fadeIn,
      fadeOut,
      lastPlayedIndex: -1,
      sequential,

    };

    const delay = sequential ? 0 : this._getRandomDelay(from, to);
    const timeoutId = setTimeout(() => this._playSound(playlistId, soundKey), delay);

    this.jobs.set(key, { timeoutId, config });



  }

  /**
   * @param {string} playlistId
   * @param {string|string[]} soundKeyOrId
   * @param {string} [jobKey] Explicit job-map key — see start(). Must match what start() was called with.
   */
  stop(playlistId, soundKeyOrId, jobKey = null) {
    const isGroup = Array.isArray(soundKeyOrId);
    const key = this._makeKey(playlistId, jobKey ?? soundKeyOrId);
    const job = this.jobs.get(key);

    if (job) {
      const { from, to, volume, playOnce, soundIds, fadeIn, fadeOut, lastPlayedIndex } = job.config;
      clearTimeout(job.timeoutId);
      job.pendingCleanup?.();
      this.jobs.delete(key);
      const playlist = game.playlists.get(playlistId);
      if (!Array.isArray(soundIds)) {
        const playlistSound = playlist.sounds.get(soundIds);
        playlist.stopSound(playlistSound);

      } else {
        soundIds.forEach(element => {
          const playlistSound = playlist.sounds.get(element);
        playlist.stopSound(playlistSound);

        });
      }

    }
  }

  stopAll() {
    for (const { timeoutId } of this.jobs.values()) {
      clearTimeout(timeoutId);
    }
    this.jobs.clear();
  }
}
