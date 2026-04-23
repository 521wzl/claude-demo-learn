const { add, subtract, multiply, divide, format } = require('../../utils/amount.js')

Page({
  data: {
    isFullReport: false,
    progress: 0,
    recordCount: 0,
    targetCount: 10,

    // 当前月份数据
    currentMonth: '',
    totalExpense: 0,
    totalIncome: 0,
    netBalance: 0,

    // 完整报告数据
    personalityType: '',
    personalityDesc: '',
    highestExpense: { category: '', amount: 0 },
    recordDays: 0,
    maxSingleExpense: 0,

    // 亮点卡片
    insights: {
      bestValue: { show: false, category: '', amount: 0, desc: '' },
      overspend: { show: false, category: '', percent: 0, desc: '' },
      suggestion: { show: false, desc: '' }
    },

    // 对比数据
    expenseChange: 0,
    incomeChange: 0
  },

  onLoad() {
    this.loadReportData()
  },

  onShow() {
    this.loadReportData()
  },

  _getMonthEnd(year, month) {
    const lastDay = new Date(year, month, 0).getDate()
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  },

  loadReportData() {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const monthStr = `${year}年${month}月`
    const monthStrForCloud = `${year}-${String(month).padStart(2, '0')}`
    this.setData({ currentMonth: monthStr })
    this.getRecordsAndCalc(monthStrForCloud, year, month)
  },

  async getRecordsAndCalc(monthStr, year, month) {
    try {
      const startDate = `${monthStr}-01`
      const endDate = this._getMonthEnd(year, month)

      const res = await wx.cloud.callFunction({
        name: 'getRecords',
        data: { page: 1, pageSize: 100, startDate, endDate }
      })

      // 解析云函数返回值
      const result = res.result || {}
      const resultData = result.data || {}
      const records = resultData.list || []

      console.log('[DEBUG] getRecords result, code:', result.code, 'records count:', records.length)

      if (records.length === 0) {
        // 当月没有数据
        this.setData({
          totalExpense: 0, totalIncome: 0, netBalance: 0,
          recordCount: 0, progress: 0, isFullReport: false,
          recordDays: 0, maxSingleExpense: 0,
          highestExpense: { category: '', amount: 0 },
          insights: { bestValue: { show: false }, overspend: { show: false }, suggestion: { show: false } }
        })
        return
      }

      // 计算统计数据
      const { totalExpense, totalIncome, categoryTotals, dailyTotals } = this._calcStats(records)
      const recordDays = Object.keys(dailyTotals).length
      const netBalance = subtract(totalIncome, totalExpense)

      // 最高单笔
      let maxSingleExpense = 0
      let highestCategory = ''
      records.forEach(r => {
        if (r.type === 'expense' && r.amount > maxSingleExpense) {
          maxSingleExpense = r.amount
          highestCategory = r.category || ''
        }
      })

      // 记账天数
      const recordCount = records.length
      const progress = Math.min(100, Math.round(recordCount / this.data.targetCount * 100))
      const isFullReport = recordCount >= this.data.targetCount

      // 判定性格类型
      const impulseRatio = this._calcImpulseRatio(records, dailyTotals, totalExpense)
      const foodRatio = categoryTotals['餐饮'] ? divide(categoryTotals['餐饮'], totalExpense) : 0
      const personalityType = this._judgePersonality(impulseRatio, foodRatio, totalExpense)

      // 生成亮点卡片
      const insights = this._generateInsights(records, categoryTotals, totalExpense)

      // 获取上月对比数据
      const lastMonthData = await this._getLastMonthData(year, month)
      const expenseChange = lastMonthData.expense > 0
        ? Math.round(divide(multiply(subtract(totalExpense, lastMonthData.expense), 100), lastMonthData.expense)) : 0
      const incomeChange = lastMonthData.income > 0
        ? Math.round(divide(multiply(subtract(totalIncome, lastMonthData.income), 100), lastMonthData.income)) : 0

      this.setData({
        totalExpense: parseFloat(totalExpense.toFixed(2)),
        totalIncome: parseFloat(totalIncome.toFixed(2)),
        netBalance: parseFloat(netBalance.toFixed(2)),
        recordCount,
        progress,
        isFullReport,
        recordDays,
        maxSingleExpense: parseFloat(maxSingleExpense.toFixed(2)),
        highestExpense: { category: highestCategory, amount: parseFloat(maxSingleExpense.toFixed(2)) },
        personalityType,
        personalityDesc: this.getPersonalityDesc(personalityType),
        insights,
        expenseChange,
        incomeChange
      })
    } catch (err) {
      console.error('[DEBUG] getRecordsAndCalc error:', err)
      this.setData({ recordCount: 0, progress: 0, totalExpense: 0, totalIncome: 0 })
    }
  },

  _calcStats(records) {
    let totalExpense = 0
    let totalIncome = 0
    const categoryTotals = {}
    const dailyTotals = {}

    records.forEach(r => {
      if (r.type === 'expense') {
        totalExpense = add(totalExpense, r.amount)
      } else if (r.type === 'income') {
        totalIncome = add(totalIncome, r.amount)
      }

      // 类目统计
      const cat = r.category || '其他'
      if (!categoryTotals[cat]) categoryTotals[cat] = 0
      if (r.type === 'expense') categoryTotals[cat] = add(categoryTotals[cat], r.amount)

      // 日统计
      const day = new Date(r.timestamp).getDate()
      if (!dailyTotals[day]) dailyTotals[day] = { expense: 0, income: 0 }
      if (r.type === 'expense') dailyTotals[day].expense = add(dailyTotals[day].expense, r.amount)
      else if (r.type === 'income') dailyTotals[day].income = add(dailyTotals[day].income, r.amount)
    })

    return { totalExpense, totalIncome, categoryTotals, dailyTotals }
  },

  _calcImpulseRatio(records, dailyTotals, totalExpense) {
    const impulseCategories = ['餐饮', '购物', '娱乐', '其他', '通讯']
    const expenseDays = Object.keys(dailyTotals).length
    if (expenseDays === 0 || totalExpense === 0) return 0

    const avgDaily = totalExpense / expenseDays
    let impulseDays = 0

    Object.keys(dailyTotals).forEach(day => {
      const dayData = dailyTotals[day]
      if (dayData.expense > avgDaily * 3) {
        const dayNum = parseInt(day)
        const hasImpulse = records.some(r => {
          const d = new Date(r.timestamp).getDate()
          return d === dayNum && r.type === 'expense' && impulseCategories.includes(r.category)
        })
        if (hasImpulse) impulseDays++
      }
    })

    return impulseDays / expenseDays
  },

  _judgePersonality(impulseRatio, foodRatio, totalExpense) {
    const budget = this._getBudgetSetting()
    const withinBudget = totalExpense <= budget.total_budget

    if (impulseRatio > 0.2 || (impulseRatio > 0.1 && foodRatio > 0.35)) return '冲动消费型'
    if (foodRatio > 0.4) return '美食享受型'
    if (withinBudget && impulseRatio <= 0.05) return '精明规划型'
    return '弹性平衡型'
  },

  _getBudgetSetting() {
    try {
      const settings = wx.getStorageSync('settings') || {}
      return {
        total_budget: settings.budget || 5000,
        category_budgets: settings.categoryBudgets || {}
      }
    } catch (e) {
      return { total_budget: 5000, category_budgets: {} }
    }
  },

  _generateInsights(records, categoryTotals, totalExpense) {
    const insights = {
      bestValue: { show: false, category: '', amount: 0, desc: '' },
      overspend: { show: false, category: '', percent: 0, desc: '' },
      suggestion: { show: false, desc: '' }
    }

    // 最值消费
    let maxRecord = null
    let maxAmount = 0
    records.forEach(r => {
      if (r.type === 'expense' && r.amount > maxAmount && r.category !== '医疗' && r.category !== '旅行') {
        maxAmount = r.amount
        maxRecord = r
      }
    })
    if (maxRecord) {
      insights.bestValue = {
        show: true,
        category: maxRecord.category || '其他',
        amount: parseFloat(maxAmount.toFixed(2)),
        desc: `${maxRecord.category || '其他'} ¥${maxAmount.toFixed(2)}`
      }
    }

    // 超支提醒
    const budget = this._getBudgetSetting()
    if (totalExpense > budget.total_budget) {
      const percent = Math.round(divide(multiply(subtract(totalExpense, budget.total_budget), 100), budget.total_budget))
      insights.overspend = { show: true, percent, desc: `超预算 ${percent}%` }
    }

    // 优化建议
    const foodRatio = categoryTotals['餐饮'] ? divide(categoryTotals['餐饮'], totalExpense) : 0
    if (foodRatio > 0.3) {
      insights.suggestion = { show: true, desc: '外卖频率偏高，建议每周设定2天"无外卖日"' }
    } else if (totalExpense > budget.total_budget * 0.8) {
      insights.suggestion = { show: true, desc: '本月支出接近预算，建议留意非必要消费' }
    } else {
      insights.suggestion = { show: true, desc: '继续保持良好的记账习惯，财务状况健康' }
    }

    return insights
  },

  async _getLastMonthData(year, month) {
    let lastYear = year
    let lastMonth = month - 1
    if (lastMonth < 1) { lastMonth = 12; lastYear-- }

    const startDate = `${lastYear}-${String(lastMonth).padStart(2, '0')}-01`
    const endDate = this._getMonthEnd(lastYear, lastMonth)

    try {
      const res = await wx.cloud.callFunction({
        name: 'getRecords',
        data: { page: 1, pageSize: 100, startDate, endDate }
      })
      const records = (res.result || {}).data || {}
      const list = records.list || []
      let expense = 0, income = 0
      list.forEach(r => {
        if (r.type === 'expense') expense = add(expense, r.amount)
        else if (r.type === 'income') income = add(income, r.amount)
      })
      return { expense, income }
    } catch {
      return { expense: 0, income: 0 }
    }
  },

  getPersonalityDesc(type) {
    const descs = {
      '精明规划型': '你善于规划支出，餐饮控制得当，但购物偶尔冲动，建议关注每周支出峰值。',
      '冲动消费型': '本月冲动消费较多，建议设置冷静期，购买前列清单，避免不必要的开支。',
      '弹性平衡型': '你的消费整体平衡，但仍有一定优化空间，建议留意偶发性大额支出。',
      '美食享受型': '你对美食有较高的追求，建议尝试自己烹饪，每周设定2天"无外卖日"来平衡支出。'
    }
    return descs[type] || ''
  },

  onShareTap() {
    wx.showLoading({ title: '生成中...' })
    setTimeout(() => {
      wx.hideLoading()
      wx.showToast({ title: '分享图片已保存', icon: 'success' })
    }, 1500)
  }
})
