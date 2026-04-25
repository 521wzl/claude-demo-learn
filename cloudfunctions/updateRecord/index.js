const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const { id, type, amount, category, remark, timestamp } = event

    if (!id) return { code: -1, errMsg: '缺少 id 参数' }

    const record = await db.collection('records').doc(id).get()
    if (!record.data) {
      return { code: -1, errMsg: '记录不存在' }
    }
    if (record.data._openid !== OPENID) {
      return { code: -1, errMsg: '无权操作' }
    }

    const oldRecord = record.data
    const updateData = {}
    if (type !== undefined) updateData.type = type
    if (amount !== undefined) updateData.amount = Number(amount)
    if (category !== undefined) updateData.category = category
    if (remark !== undefined) updateData.remark = remark
    if (timestamp !== undefined) {
      updateData.timestamp = timestamp
      updateData.date = new Date(timestamp).toISOString().substring(0, 10)
    }

    await db.collection('records').doc(id).update({ data: updateData })

    // 重建缓存（处理金额/类目/月份变更）
    const newTs = timestamp || oldRecord.timestamp
    const oldTs = oldRecord.timestamp
    const oldYear = new Date(oldTs).getFullYear()
    const oldMonth = new Date(oldTs).getMonth() + 1
    const newYear = new Date(newTs).getFullYear()
    const newMonth = new Date(newTs).getMonth() + 1

    // 旧月份缓存 -dec
    const oldCacheId = `${OPENID}-${oldYear}-${oldMonth}`
    const oldNumAmount = Number(oldRecord.amount) || 0
    try {
      await db.collection('reports_cache').doc(oldCacheId).update({
        data: {
          total_expense: oldRecord.type === 'expense' ? db.command.inc(-oldNumAmount) : db.command.inc(0),
          total_income: oldRecord.type === 'income' ? db.command.inc(-oldNumAmount) : db.command.inc(0),
          [`category_amounts.${oldRecord.category}`]: db.command.inc(-oldNumAmount),
          updated_at: db.serverDate()
        }
      })
    } catch (e) { /* cache may not exist */ }

    // 新月份缓存 +inc（如果跨月，新月份可能不同于旧月份）
    const newType = type !== undefined ? type : oldRecord.type
    const newNumAmount = amount !== undefined ? Number(amount) : oldNumAmount
    const newCategory = category !== undefined ? category : oldRecord.category
    const newCacheId = `${OPENID}-${newYear}-${newMonth}`

    if (oldYear === newYear && oldMonth === newMonth) {
      // 同月：需要把旧月的减少改回来（因为 dec 又 inc 抵消了，但实际上应该只处理差值）
      // 简化处理：直接重建
      const startDate = `${oldYear}-${String(oldMonth).padStart(2, '0')}-01`
      const endDateObj = new Date(oldYear, oldMonth, 1)
      const endDate = endDateObj.toISOString().substring(0, 10)
      await rebuildMonthCache(OPENID, oldYear, oldMonth, startDate, endDate)
    } else {
      // 跨月：新月份 +inc
      try {
        await db.collection('reports_cache').doc(newCacheId).update({
          data: {
            total_expense: newType === 'expense' ? db.command.inc(newNumAmount) : db.command.inc(0),
            total_income: newType === 'income' ? db.command.inc(newNumAmount) : db.command.inc(0),
            [`category_amounts.${newCategory}`]: db.command.inc(newNumAmount),
            updated_at: db.serverDate()
          }
        })
      } catch (e) { /* cache may not exist */ }
    }

    return { code: 0, data: { success: true } }
  } catch (err) {
    return { code: -1, errMsg: err.message }
  }
}

// 重建指定用户指定月的缓存
async function rebuildMonthCache(openid, year, month, startDate, endDate) {
  const cacheId = `${openid}-${year}-${month}`
  const recordsRes = await db.collection('records')
    .where({
      _openid: openid,
      date: _.gte(startDate).and(_.lt(endDate))
    })
    .limit(5000)
    .get()

  let totalExpense = 0
  let totalIncome = 0
  const categoryAmounts = {}

  for (const r of recordsRes.data) {
    const amt = r.amount || 0
    if (r.type === 'expense') {
      totalExpense += amt
    } else if (r.type === 'income') {
      totalIncome += amt
    }
    categoryAmounts[r.category] = (categoryAmounts[r.category] || 0) + amt
  }

  try {
    await db.collection('reports_cache').doc(cacheId).set({
      data: {
        _openid: openid,
        year,
        month,
        total_expense: totalExpense,
        total_income: totalIncome,
        category_amounts: categoryAmounts,
        updated_at: db.serverDate()
      }
    })
  } catch (e) {
    console.error('[reports_cache] rebuild failed:', e.message)
  }
}