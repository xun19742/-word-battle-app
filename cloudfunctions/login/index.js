const cloud = require('wx-server-sdk');
const {
  createDefaultUser,
  getPublicUserProfile,
  normalizeProfileInput,
  validateCloudSettings,
} = require('./user-rules');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function getUserSettings(user) {
  // 老用户缺字段时按 MVP 默认值补齐，避免登录后设置页出现空值。
  return {
    defaultMode: ['flashcard', 'quiz'].includes(user.defaultMode)
      ? user.defaultMode
      : 'flashcard',
    selectedWordbookId: user.selectedWordbookId || 'cet4',
    dailyNewWords: Number.isInteger(user.dailyNewWords) ? user.dailyNewWords : 25,
    reviewRatio: [1, 2, 3].includes(user.reviewRatio) ? user.reviewRatio : 2,
  };
}

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

  if (event.action === 'saveProfile') {
    const profile = normalizeProfileInput(event.profile);
    if (user) {
      await users.doc(OPENID).update({
        data: { ...profile, updatedAt: db.serverDate() },
      });
      user = { ...user, ...profile };
    } else {
      user = createDefaultUser(OPENID);
      await users.doc(OPENID).set({
        data: {
          ...user,
          ...profile,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });
      user = { ...user, ...profile };
    }
    return {
      success: true,
      profile: getPublicUserProfile(user),
    };
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
    settings: getUserSettings(user),
    profile: getPublicUserProfile(user),
  };
};
