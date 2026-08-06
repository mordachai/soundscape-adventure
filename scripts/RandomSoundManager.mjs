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

  /**
   * Strictly alternates between the low and high half of [from, to] on every
   * call — "avoid the same band as last time" (thirds) still let consecutive
   * picks land right next to each other across a band boundary (e.g. 19 then
   * 20), and got swamped by the sound's own duration once you look at total
   * time-between-plays. Forcing a hard flip to the *other* half every time
   * guarantees roughly half the full range as a minimum swing, every replay.
   * @param {number} from
   * @param {number} to
   * @param {number|null} [lastHalf] Previous pick's half (0=low, 1=high) to flip away from.
   * @returns {{ms:number, half:number}}
   */
  _getRandomDelay(from, to, lastHalf = null) {
    const minCeiled = Math.ceil(from);
    const maxFloored = Math.floor(to);
    const range = maxFloored - minCeiled;
    if (range <= 0) return { ms: minCeiled * 1000, half: 0 };

    const mid = minCeiled + Math.ceil((range + 1) / 2);
    const half = lastHalf === null ? (Math.random() < 0.5 ? 0 : 1) : (lastHalf === 0 ? 1 : 0);

    let seconds;
    if (half === 0) {
      const hi = Math.min(mid - 1, maxFloored);
      seconds = minCeiled + Math.floor(Math.random() * (hi - minCeiled + 1));
    } else {
      const lo = Math.min(mid, maxFloored);
      seconds = lo + Math.floor(Math.random() * (maxFloored - lo + 1));
    }

    // Snap up to the nearest 2-second step — fewer distinct values on offer
    // means less chance of two picks landing on basically-the-same number.
    seconds = Math.min(Math.ceil(seconds / 2) * 2, maxFloored);

    return { ms: seconds * 1000, half };
  }

  _getRandomIndexExcluding(max, excludeIndex) {
    if (max <= 1) return 0;
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * max);
    } while (newIndex === excludeIndex);
    return newIndex;
  }

  /**
   * Wait for a PlaylistSound's own `playing` flag to settle back to false,
   * event-driven instead of polling. Foundry's own playback scheduler patches
   * playing/pausedTime through a bulk update on the *parent* Playlist doc
   * (`changes.sounds` is an array of per-embedded-sound diffs) rather than an
   * `updatePlaylistSound` embedded-doc update — confirmed elsewhere in this
   * module (see soundpad-adventure.mjs's own updatePlaylist listener) that
   * updatePlaylistSound never fires for this. Bounded by the same 500ms worst
   * case the old poll loop had, in case the cleanup update never lands.
   */
  _waitUntilNotPlaying(playlistSound, maxWaitMs = 500) {
    if (!playlistSound.playing) return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        Hooks.off('updatePlaylist', onUpdate);
        clearTimeout(timer);
        resolve();
      };
      const onUpdate = (playlist, changes) => {
        if (!Array.isArray(changes.sounds)) return;
        const settled = changes.sounds.some(s => s._id === playlistSound.id && Object.hasOwn(s, 'playing') && !s.playing);
        if (settled) finish();
      };
      Hooks.on('updatePlaylist', onUpdate);
      const timer = setTimeout(finish, maxWaitMs);
    });
  }

  async _playSound(playlistId, soundKey) {
    const key = this._makeKey(playlistId, soundKey);
    const job = this.jobs.get(key);
    if (!job) return;
    const { from, to, volume, volumeVariation, playOnce, soundIds, fadeIn, fadeOut, lastPlayedIndex, sequential } = job.config;
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
    await this._waitUntilNotPlaying(playlistSound);

    // Play the sound — recomputed each trigger so variation actually varies across replays.
    const effectiveVolume = utils.randomizedVolume(volume, volumeVariation);
    await playSoundWithFade({ ...job.config, volume: effectiveVolume }, playlistSound, playlist);

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
      let delay = 0;
      if (!sequential) {
        const picked = this._getRandomDelay(from, to, job.lastDelayHalf);
        delay = picked.ms;
        job.lastDelayHalf = picked.half;
      }

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
    // Groups store their interval under `random` (from/to); single random sounds use top-level from/to.
    const from = soundConfig.random?.from ?? soundConfig.from
    const to = soundConfig.random?.to ?? soundConfig.to
    const volume = soundConfig.volume
    const volumeVariation = soundConfig.volumeVariation ?? 0
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
      from, to, volume, volumeVariation, playOnce,
      soundIds,
      fadeIn,
      fadeOut,
      lastPlayedIndex: -1,
      sequential,

    };

    const initialPick = sequential ? { ms: 0, half: null } : this._getRandomDelay(from, to);
    const timeoutId = setTimeout(() => this._playSound(playlistId, soundKey), initialPick.ms);

    this.jobs.set(key, { timeoutId, config, lastDelayHalf: initialPick.half });



  }

  /**
   * @param {string} playlistId
   * @param {string|string[]} soundKeyOrId
   * @param {string} [jobKey] Explicit job-map key — see start(). Must match what start() was called with.
   */
  stop(playlistId, soundKeyOrId, jobKey = null) {
    const key = this._makeKey(playlistId, jobKey ?? soundKeyOrId);
    const job = this.jobs.get(key);

    if (job) {
      const { soundIds } = job.config;
      clearTimeout(job.timeoutId);
      job.pendingCleanup?.();
      this.jobs.delete(key);
      const playlist = game.playlists.get(playlistId);
      if (!playlist) return;
      const ids = Array.isArray(soundIds) ? soundIds : [soundIds];
      for (const id of ids) {
        const playlistSound = playlist.sounds.get(id);
        if (playlistSound) playlist.stopSound(playlistSound);
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
