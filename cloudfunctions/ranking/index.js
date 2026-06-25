const cloud = require('wx-server-sdk');
const {
  buildRankingList,
  getRankingSortField,
  isValidRankingType,
} = require('./ranking-rules');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  const type = event.action || 'battleScore';
  if (!isValidRankingType(type)) {
    return {
      success: false,
      message: '排行榜类型无效',
      list: [],
    };
  }

  const sortField = getRankingSortField(type);
  const snapshot = await db
    .collection('users')
    .orderBy(sortField, 'desc')
    .limit(50)
    .get();

  return {
    success: true,
    list: buildRankingList(snapshot.data, type),
  };
};
