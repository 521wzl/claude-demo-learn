const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const { id } = event

    if (!id) return { code: -1, errMsg: '缺少 id 参数' }

    const record = await db.collection('records').doc(id).get()
    if (!record.data) {
      return { code: -1, errMsg: '记录不存在' }
    }
    if (record.data._openid !== OPENID) {
      return { code: -1, errMsg: '无权操作' }
    }

    const deleted = record.data
    await db.collection('records').doc(id).remove()

    // 增量减少 reports_cache（删除记录的反向操作）
    const ts = deleted.timestamp || Date.now()
    const year = new Date(ts).getFullYear()
    const month = new Date(ts).getMonth() + 1
    const cacheId = `${OPENID}-${year}-${month}`
    const numAmount = Number(deleted.amount) || 0
    try {
      await db.collection('reports_cache').doc(cacheId).update({
        data: {
          total_expense: deleted.type === 'expense' ? db.command.inc(-numAmount) : db.command.inc(0),
          total_income: deleted.type === 'income' ? db.command.inc(-numAmount) : db.command.inc(0),
          [`category_amounts.${deleted.category}`]: db.command.inc(-numAmount),
          updated_at: db.serverDate()
        }
      })
    } catch (cacheErr) {
      console.error('[reports_cache] delete update failed:', cacheErr.message)
    }

    return { code: 0, data: { success: true } }
  } catch (err) {
    return { code: -1, errMsg: err.message }
  }
}