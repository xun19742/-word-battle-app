const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  // OpenID 只从可信云上下文读取，不接受客户端自报身份。
  const { OPENID } = cloud.getWXContext();
  return { openid: OPENID };
};
