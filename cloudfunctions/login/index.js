const cloud = require('wx-server-sdk');
const {
  createDefaultUser,
  validateCloudSettings,
} = require('./user-rules');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event = {}) => {
  // OpenID 只从可信云上下文读取，不接受客户端自报身份。
  const { OPENID } = cloud.getWXContext();
  const users = db.collection('users');
  const existing = await users.where({ _id: OPENID }).limit(1).get();
  let user = existing.data[0] || null;

  if (event.action === 'saveSettings') {
    const settings = validateCloudSettings(event.settings);
    if (user) {
      await users.doc(OPENID).update({
        data: { ...settings, updatedAt: db.serverDate() },
      });
    } else {
      user = createDefaultUser(OPENID, settings);
      await users.doc(OPENID).set({
        data: {
          ...user,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });
    }
    return { success: true, settings };
  }

  if (!user) {
    const initialSettings = event.settings
      ? validateCloudSettings(event.settings)
      : undefined;
    user = createDefaultUser(OPENID, initialSettings);
    await users.doc(OPENID).set({
      data: {
        ...user,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    });
  }

  return {
    openid: OPENID,
    settings: {
      defaultMode: user.defaultMode,
      roundSize: user.roundSize,
    },
  };
};
