async function login(localSettings) {
  if (!wx.cloud) {
    return { cloudAvailable: false, openid: '' };
  }
  const options = { name: 'login' };
  if (localSettings) {
    options.data = { settings: localSettings };
  }
  const response = await wx.cloud.callFunction(options);
  return {
    cloudAvailable: true,
    openid: response.result.openid,
    settings: response.result.settings,
    profile: response.result.profile,
  };
}

async function saveSettingsToCloud(settings) {
  if (!wx.cloud) {
    return false;
  }
  const response = await wx.cloud.callFunction({
    name: 'login',
    data: {
      action: 'saveSettings',
      settings,
    },
  });
  return Boolean(response.result && response.result.success);
}

async function saveProfileToCloud(profile) {
  if (!wx.cloud) {
    return false;
  }
  const response = await wx.cloud.callFunction({
    name: 'login',
    data: {
      action: 'saveProfile',
      profile,
    },
  });
  if (!response.result || !response.result.success) {
    return false;
  }
  return response.result.profile;
}

async function syncLearning(summary) {
  if (!wx.cloud) {
    return false;
  }
  const response = await wx.cloud.callFunction({
    name: 'sync-learning',
    data: summary,
  });
  return Boolean(response.result && response.result.success);
}

module.exports = {
  login,
  saveProfileToCloud,
  syncLearning,
  saveSettingsToCloud,
};
