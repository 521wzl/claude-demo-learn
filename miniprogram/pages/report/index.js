Page({
  data: {
    isFullReport: false, // 满10条解锁完整报告
    progress: 0, // 数据收集进度
    recordCount: 0,
    targetCount: 10,

    // 当前月份数据
    currentMonth: '',
    totalExpense: 0,
    totalIncome: 0,

    // 完整报告数据
    personalityType: '', // 精明规划型/冲动消费型/弹性平衡型/美食享受型
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
    expenseChange: 0, // 百分比
    incomeChange: 0
  },

  onLoad() {
    this.loadReportData()
  },

  onShow() {
    // 每次显示时刷新数据
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
    this.setData({ currentMonth: `${year}年${month}月` })

    // 获取记录数据
    this.getRecordsFromCloud()
  },

  async getRecordsFromCloud() {
    try {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = this._getMonthEnd(year, month)

      const res = await wx.cloud.callFunction({
        name: 'getRecords',
        data: { page: 1, pageSize: 1000, startDate, endDate }
      })

      const records = (res.result || {}).data?.list || []
      this.processRecords(records, year, month)
    } catch (err) {
      console.error('getRecords failed', err)
      this.setData({ recordCount: 0, progress: 0 })
    }
  },

  processRecords(records, year, month) {
    // 筛选当月记录
    const monthRecords = records.filter(r => {
      const d = new Date(r.timestamp)
      return d.getFullYear() === year && d.getMonth() + 1 === month
    })

    // 计算总支出总收入
    let totalExpense = 0
    let totalIncome = 0
    let categoryTotals = {}
    let dailyTotals = {}

    monthRecords.forEach(r => {
      if (r.type === 'expense') {
        totalExpense += r.amount
      } else {
        totalIncome += r.amount
      }

      // 类目统计
      if (!categoryTotals[r.category]) {
        categoryTotals[r.category] = { expense: 0, income: 0 }
      }
      if (r.type === 'expense') {
        categoryTotals[r.category].expense += r.amount
      } else {
        categoryTotals[r.category].income += r.amount
      }

      // 日统计
      const day = new Date(r.timestamp).getDate()
      if (!dailyTotals[day]) {
        dailyTotals[day] = { expense: 0, income: 0 }
      }
      if (r.type === 'expense') {
        dailyTotals[day].expense += r.amount
      } else {
        dailyTotals[day].income += r.amount
      }
    })

    // 计算月均日支出
    const daysWithRecords = Object.keys(dailyTotals).length
    const avgDailyExpense = daysWithRecords > 0 ? totalExpense / daysWithRecords : 0

    // 计算冲动日
    const impulseCategories = ['餐饮', '购物', '娱乐', '其他', '通讯']
    const excludeCategories = ['医疗', '旅行', '居住']
    let impulseDays = 0

    Object.keys(dailyTotals).forEach(day => {
      const dayData = dailyTotals[day]
      if (dayData.expense > avgDailyExpense * 3) {
        // 检查是否有冲动类目消费
        const dayRecords = monthRecords.filter(r => {
          const d = new Date(r.timestamp).getDate()
          return d === parseInt(day) && r.type === 'expense'
        })
        const hasImpulseCategory = dayRecords.some(r =>
          impulseCategories.includes(r.category) && !excludeCategories.includes(r.category)
        )
        if (hasImpulseCategory) {
          impulseDays++
        }
      }
    })

    // 记账天数
    const recordDays = Object.keys(dailyTotals).length

    // 冲动系数
    const impulseRatio = recordDays > 0 ? impulseDays / recordDays : 0

    // 餐饮占比
    const foodExpense = categoryTotals['餐饮'] ? categoryTotals['餐饮'].expense : 0
    const foodRatio = totalExpense > 0 ? foodExpense / totalExpense : 0

    // 最高单笔
    let maxSingleExpense = 0
    let highestCategory = ''
    monthRecords.forEach(r => {
      if (r.type === 'expense' && r.amount > maxSingleExpense) {
        maxSingleExpense = r.amount
        highestCategory = r.category
      }
    })

    // 判定性格类型
    const personalityType = this.judgePersonality(impulseRatio, foodRatio, totalExpense)

    // 生成亮点卡片数据
    const insights = this.generateInsights(categoryTotals, totalExpense, avgDailyExpense, monthRecords)

    // 获取上月数据进行对比
    const lastMonthData = this.getLastMonthData(monthRecords, year, month)

    // 计算进度
    const recordCount = monthRecords.length
    const progress = Math.min(100, Math.round(recordCount / this.data.targetCount * 100))
    const isFullReport = recordCount >= this.data.targetCount

    this.setData({
      recordCount,
      progress,
      isFullReport,
      totalExpense,
      totalIncome,
      recordDays,
      maxSingleExpense,
      highestExpense: { category: highestCategory, amount: maxSingleExpense },
      personalityType,
      personalityDesc: this.getPersonalityDesc(personalityType),
      insights,
      expenseChange: lastMonthData.expense > 0 ? Math.round((totalExpense - lastMonthData.expense) / lastMonthData.expense * 100) : 0,
      incomeChange: lastMonthData.income > 0 ? Math.round((totalIncome - lastMonthData.income) / lastMonthData.income * 100) : 0
    })
  },

  judgePersonality(impulseRatio, foodRatio, totalExpense) {
    // 获取预算设置
    const budget = this.getBudgetSetting()
    const withinBudget = totalExpense <= budget.total_budget

    // 精明规划型：预算内支出 + 冲动日占比 ≤ 5%
    if (withinBudget && impulseRatio <= 0.05) {
      return '精明规划型'
    }

    // 冲动消费型：冲动日占比 > 20%，或冲动日占比 > 10% 且餐饮占比 > 35%
    if (impulseRatio > 0.2 || (impulseRatio > 0.1 && foodRatio > 0.35)) {
      return '冲动消费型'
    }

    // 美食享受型：餐饮占比 > 40%（且非冲动消费型）
    if (foodRatio > 0.4) {
      return '美食享受型'
    }

    // 弹性平衡型：其余情况
    return '弹性平衡型'
  },

  getBudgetSetting() {
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

  getPersonalityDesc(type) {
    const descs = {
      '精明规划型': '你善于规划支出，餐饮控制得当，但购物偶尔冲动，建议关注每周支出峰值。',
      '冲动消费型': '本月冲动消费较多，建议设置冷静期，购买前列清单，避免不必要的开支。',
      '弹性平衡型': '你的消费整体平衡，但仍有一定优化空间，建议留意偶发性大额支出。',
      '美食享受型': '你对美食有较高的追求，建议尝试自己烹饪，每周设定2天"无外卖日"来平衡支出。'
    }
    return descs[type] || ''
  },

  generateInsights(categoryTotals, totalExpense, avgDailyExpense, monthRecords) {
    const insights = {
      bestValue: { show: false, category: '', amount: 0, desc: '' },
      overspend: { show: false, category: '', percent: 0, desc: '' },
      suggestion: { show: false, desc: '' }
    }

    // 找出最值消费（单笔最高且合理的消费）
    let bestValueRecord = null
    let maxAmount = 0
    monthRecords.forEach(r => {
      if (r.type === 'expense' && r.amount > maxAmount) {
        // 排除异常高值（如医疗大额）
        if (r.category !== '医疗' && r.category !== '旅行') {
          maxAmount = r.amount
          bestValueRecord = r
        }
      }
    })

    if (bestValueRecord) {
      insights.bestValue = {
        show: true,
        category: bestValueRecord.category,
        amount: bestValueRecord.amount,
        desc: `书籍 ¥${bestValueRecord.amount.toFixed(2)}`
      }
    }

    // 检查超支提醒
    const budget = this.getBudgetSetting()
    if (totalExpense > budget.total_budget) {
      const percent = Math.round((totalExpense - budget.total_budget) / budget.total_budget * 100)
      insights.overspend = {
        show: true,
        category: '娱乐',
        percent,
        desc: `娱乐超预算${percent}%`
      }
    }

    // 生成建议
    const foodRatio = categoryTotals['餐饮'] ? categoryTotals['餐饮'].expense / totalExpense : 0
    if (foodRatio > 0.3) {
      insights.suggestion = {
        show: true,
        desc: '外卖频率偏高，建议每周设定2天"无外卖日"'
      }
    } else if (totalExpense > budget.total_budget * 0.8) {
      insights.suggestion = {
        show: true,
        desc: '本月支出接近预算，建议留意非必要消费'
      }
    } else {
      insights.suggestion = {
        show: true,
        desc: '继续保持良好的记账习惯，财务状况健康'
      }
    }

    return insights
  },

  getLastMonthData(records, year, month) {
    let lastYear = year
    let lastMonth = month - 1
    if (lastMonth < 1) {
      lastMonth = 12
      lastYear--
    }

    let totalExpense = 0
    let totalIncome = 0

    records.forEach(r => {
      const d = new Date(r.timestamp)
      if (d.getFullYear() === lastYear && d.getMonth() + 1 === lastMonth) {
        if (r.type === 'expense') {
          totalExpense += r.amount
        } else {
          totalIncome += r.amount
        }
      }
    })

    return { expense: totalExpense, income: totalIncome }
  },

  // 生成分享图片
  onShareTap() {
    wx.showLoading({ title: '生成中...' })

    // 模拟生成分享图片
    setTimeout(() => {
      wx.hideLoading()
      wx.showToast({
        title: '分享图片已保存',
        icon: 'success'
      })
      // 实际应使用 canvas 或 webview 生成分享图片
    }, 1500)
  },

  // 格式化金额
  formatAmount(amount) {
    return amount.toFixed(2)
  },

  // 格式化百分比变化
  formatChange(change) {
    if (change === 0) return '0%'
    return change > 0 ? `↑${change}%` : `↓${Math.abs(change)}%`
  }
})
