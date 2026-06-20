async function login() {
  if (!wx.cloud) {
    return { cloudAvailable: false, openid: '' };
  }
  const response = await wx.cloud.callFunction({ name: 'login' });
  return {
    cloudAvailable: true,
    openid: response.result.openid,
  };
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
  syncLearning,
};
