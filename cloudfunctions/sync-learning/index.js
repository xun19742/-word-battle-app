const cloud = require('wx-server-sdk');
const {
  mergeLearningRecord,
  validateSummary,
} = require('./learning-rules');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function safeDocumentId(value) {
  // 云数据库文档 ID 不允许斜杠，统一替换外部标识中的特殊字符。
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

exports.main = async (event) => {
  const summary = validateSummary(event);
  const { OPENID } = cloud.getWXContext();
  const roundDocumentId = safeDocumentId(`${OPENID}_${summary.roundId}`);

  return db.runTransaction(async (transaction) => {
    const existingRound = await transaction
      .collection('learning_rounds')
      .where({ _id: roundDocumentId })
      .limit(1)
      .get();
    if (existingRound.data.length) {
      return { success: true, duplicate: true, roundId: summary.roundId };
    }

    const timestamp = db.serverDate();
    for (const answer of summary.answers) {
      const recordId = safeDocumentId(`${OPENID}_${answer.wordId}`);
      const existing = await transaction
        .collection('learning_records')
        .where({ _id: recordId })
        .limit(1)
        .get();
      const current = existing.data[0] || {};
      await transaction.collection('learning_records').doc(recordId).set({
        data: {
          _openid: OPENID,
          wordbookId: 'cet4-core-100',
          wordId: answer.wordId,
          ...mergeLearningRecord(current, answer),
          lastStudiedAt: timestamp,
          updatedAt: timestamp,
        },
      });
    }

    const existingUser = await transaction
      .collection('users')
      .where({ _id: OPENID })
      .limit(1)
      .get();
    const user = existingUser.data[0] || {};
    await transaction.collection('users').doc(OPENID).set({
      data: {
        _openid: OPENID,
        nickname: user.nickname || 'WordRush 用户',
        avatarUrl: user.avatarUrl || '',
        defaultMode: user.defaultMode || 'flashcard',
        roundSize: user.roundSize || 10,
        totalScore: (user.totalScore || 0) + summary.score,
        createdAt: user.createdAt || timestamp,
        updatedAt: timestamp,
      },
    });

    await transaction.collection('learning_rounds').doc(roundDocumentId).set({
      data: {
        _openid: OPENID,
        roundId: summary.roundId,
        score: summary.score,
        total: summary.total,
        completedAt: summary.completedAt || timestamp,
        createdAt: timestamp,
      },
    });

    return { success: true, duplicate: false, roundId: summary.roundId };
  });
};
