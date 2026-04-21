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
        const d = new Date(startDate)
        d.setHours(0, 0, 0, 0)
        query.timestamp.$gte = d.getTime()
      }
      if (endDate) {
        const d = new Date(endDate)
        d.setHours(23, 59, 59, 999)
        query.timestamp.$lte = d.getTime()
      }
    }

    const countResult = await db.collection('records').where(query).count()
    const total = countResult.total

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
        total,
        hasMore: page * pageSize < total
      }
    }
  } catch (err) {
    return { code: -1, errMsg: err.message }
  }
}