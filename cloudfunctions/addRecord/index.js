const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const { type, amount, category, remark, timestamp } = event

    if (!type || amount === undefined || !category) {
      return { code: -1, errMsg: '缺少必填参数' }
    }
    if (type !== 'expense' && type !== 'income') {
      return { code: -1, errMsg: 'type 必须是 expense 或 income' }
    }

    const ts = timestamp || Date.now()
    const dateStr = new Date(ts).toISOString().substring(0, 10)

    const res = await db.collection('records').add({
      data: {
        _openid: OPENID,
        type,
        amount: Number(amount),
        category,
        remark: remark || '',
        timestamp: ts,
        date: dateStr,
        createTime: db.serverDate()
      }
    })

    // 增量更新 reports_cache（detectAbnormal 有完整性校验，缓存不存在时会重建）
    const year = new Date(ts).getFullYear()
    const month = new Date(ts).getMonth() + 1
    const cacheId = `${OPENID}-${year}-${month}`
    const numAmount = Number(amount)
    try {
      await db.collection('reports_cache').doc(cacheId).update({
        data: {
          total_expense: type === 'expense' ? db.command.inc(numAmount) : db.command.inc(0),
          total_income: type === 'income' ? db.command.inc(numAmount) : db.command.inc(0),
          [`category_amounts.${category}`]: db.command.inc(numAmount),
          updated_at: db.serverDate()
        }
      })
    } catch (cacheErr) {
      console.error('[reports_cache] update failed:', cacheErr.message)
    }

    return { code: 0, data: { success: true, id: res._id } }
  } catch (err) {
    return { code: -1, errMsg: err.message }
  }
}