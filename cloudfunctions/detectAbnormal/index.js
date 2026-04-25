const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 异常消费检测 - 定时触发（每日 09:00）
 * 读取 reports_cache 缓存快速判断超支，缓存缺失时回退扫描 records 并重建缓存
 *
 * 部署前需在微信公众平台配置订阅消息模板，
 * 并将 TEMPLATE_ID 替换为实际模板 ID。
 */
const TEMPLATE_ID = 'YOUR_SUBSCRIBE_TEMPLATE_ID' // 替换为实际模板 ID

// 获取当前月份的起始和结束日期
function getMonthRange() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDateObj = new Date(year, month, 1)
  const endDate = endDateObj.toISOString().substring(0, 10)
  return { year, month, startDate, endDate }
}

// 重建单个用户当月缓存
async function rebuildCache(openid, year, month, startDate, endDate) {
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

  return { total_expense: totalExpense, total_income: totalIncome, category_amounts: categoryAmounts }
}

exports.main = async (event, context) => {
  console.log('detectAbnormal triggered, event:', event)
  try {
    const { year, month, startDate, endDate } = getMonthRange()
    let processedCount = 0
    let alertCount = 0
    let cacheMissCount = 0

    // 拉取所有有预算设置的用户
    let skip = 0
    const pageSize = 100

    while (true) {
      const settingsRes = await db.collection('settings')
        .where(_.exists('total_budget'))
        .skip(skip)
        .limit(pageSize)
        .get()

      if (settingsRes.data.length === 0) break

      for (const setting of settingsRes.data) {
        const openid = setting._openid
        const totalBudget = setting.total_budget || 0
        if (totalBudget <= 0) continue

        const cacheId = `${openid}-${year}-${month}`
        let totalExpense = 0

        // 尝试从缓存读取
        try {
          const cacheRes = await db.collection('reports_cache').doc(cacheId).get()
          if (cacheRes.data) {
            totalExpense = cacheRes.data.total_expense || 0
          } else {
            throw new Error('cache empty')
          }
        } catch (cacheErr) {
          // 缓存不存在或为空，回退扫描 records 并重建缓存
          cacheMissCount++
          const rebuilt = await rebuildCache(openid, year, month, startDate, endDate)
          totalExpense = rebuilt.total_expense
        }

        if (totalExpense > totalBudget) {
          try {
            await cloud.openapi.subscribeMessage.send({
              touser: openid,
              templateId: TEMPLATE_ID,
              page: 'pages/report/report',
              data: {
                thing1: { value: `本月已超支 ¥${(totalExpense - totalBudget).toFixed(2)}` },
                amount2: { value: `¥${totalExpense.toFixed(2)}` },
                amount3: { value: `¥${totalBudget.toFixed(2)}` },
                date4: { value: `${year}-${String(month).padStart(2, '0')}` }
              }
            })
            alertCount++
          } catch (msgErr) {
            console.error(`向 ${openid} 发送超支提醒失败:`, msgErr.message)
          }
        }

        processedCount++
      }

      skip += pageSize
      if (settingsRes.data.length < pageSize) break
    }

    console.log(`detectAbnormal done: processed=${processedCount}, alerts=${alertCount}, cacheMiss=${cacheMissCount}`)
    return { code: 0, data: { processedCount, alertCount, cacheMissCount } }
  } catch (err) {
    console.error('detectAbnormal error:', err)
    return { code: -1, errMsg: err.message }
  }
}
