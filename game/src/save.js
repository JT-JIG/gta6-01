// save.js — progress lives in localStorage: money, story mission, the
// player's position and health. The game autosaves on mission completion
// and every 30 seconds of play; the start screen offers Continue when a
// save exists.

const SAVE_KEY = 'solmar-city-save-v1';

export function hasSave() {
  try {
    return !!window.localStorage.getItem(SAVE_KEY);
  } catch (err) {
    return false;
  }
}

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      money: Math.round(state.money || 0),
      missionIndex: state.missionIndex || 0,
      completedMissions: state.completedMissions || 0,
      health: Math.round(state.health || 100),
      position: state.position || [0, 0],
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    // Storage is a nicety; a missing save never blocks play.
  }
}
