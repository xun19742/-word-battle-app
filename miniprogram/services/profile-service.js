const { saveProfileToCloud } = require('./cloud-api');

const PROFILE_KEY = 'wordrush.profile';

const DEFAULT_PROFILE = {
  nickname: 'WordRush 用户',
  avatarUrl: '',
  battleScore: 0,
  battleWins: 0,
  battleLosses: 0,
  battleDraws: 0,
  battlePlayed: 0,
};

function normalizeProfile(profile = {}) {
  const nickname = String(profile.nickname || DEFAULT_PROFILE.nickname).trim()
    || DEFAULT_PROFILE.nickname;
  return {
    ...DEFAULT_PROFILE,
    ...profile,
    nickname: nickname.slice(0, 32),
    avatarUrl: String(profile.avatarUrl || ''),
  };
}

function loadProfile() {
  return normalizeProfile(wx.getStorageSync(PROFILE_KEY));
}

function saveProfileLocal(profile) {
  const normalized = normalizeProfile(profile);
  wx.setStorageSync(PROFILE_KEY, normalized);
  return normalized;
}

async function saveProfile(profile) {
  // 先写本地，云端失败时仍可在小程序内展示用户资料。
  const localProfile = saveProfileLocal(profile);
  const cloudProfile = await saveProfileToCloud({
    nickname: localProfile.nickname,
    avatarUrl: localProfile.avatarUrl,
  });
  if (cloudProfile) {
    return saveProfileLocal(cloudProfile);
  }
  return localProfile;
}

module.exports = {
  DEFAULT_PROFILE,
  loadProfile,
  normalizeProfile,
  saveProfile,
  saveProfileLocal,
};
