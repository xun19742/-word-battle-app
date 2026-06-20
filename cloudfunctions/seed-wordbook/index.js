const cloud = require('wx-server-sdk');
const wordbook = require('./data');
const {
  validateSeedData,
  buildWordDocuments,
} = require('./seed-rules');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function writeInBatches(documents, batchSize = 20) {
  // 分批写入避免同时发起过多数据库请求。
  for (let index = 0; index < documents.length; index += batchSize) {
    const batch = documents.slice(index, index + batchSize);
    await Promise.all(batch.map((document) => (
      db.collection('words').doc(document._id).set({ data: document })
    )));
  }
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const adminOpenid = process.env.SEED_ADMIN_OPENID;
  // 种子函数会改写公共词库，必须显式配置唯一管理员 OpenID。
  if (!adminOpenid || OPENID !== adminOpenid) {
    throw new Error('没有初始化词书的权限');
  }

  validateSeedData(wordbook);
  const timestamp = db.serverDate();
  await db.collection('wordbooks').doc(wordbook.id).set({
    data: {
      _id: wordbook.id,
      name: wordbook.name,
      description: wordbook.description,
      wordCount: wordbook.words.length,
      enabled: true,
      updatedAt: timestamp,
    },
  });
  await writeInBatches(buildWordDocuments(wordbook));
  return {
    wordbookId: wordbook.id,
    wordCount: wordbook.words.length,
  };
};
