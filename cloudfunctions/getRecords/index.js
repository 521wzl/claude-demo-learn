const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const { page = 1, pageSize = 20, category, type, startDate, endDate } = event

    const query = { _openid: OPENID }
    if (category) query.category = category
    if (type) query.type = type
    if (startDate || endDate) {
      query.timestamp = {}
      if (startDate) {
        // 明确在本地时区设置 00:00:00.000
        const [y, m, day] = startDate.split('-').map(Number)
        const d = new Date(y, m - 1, day, 0, 0, 0, 0)
        query.timestamp.$gte = d.getTime()
      }
      if (endDate) {
        // 明确在本地时区设置 23:59:59.999
        const [y, m, day] = endDate.split('-').map(Number)
        const d = new Date(y, m - 1, day, 23, 59, 59, 999)
        query.timestamp.$lte = d.getTime()
      }
    }

    const listRes = await db.collection('records')
      .where(query)
      .orderBy('timestamp', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    return {
      code: 0,
      data: {
        list: listRes.data,
        total: listRes.data.length,
        hasMore: listRes.data.length === pageSize
      }
    }
  } catch (err) {
    return { code: -1, errMsg: err.message }
  }
}