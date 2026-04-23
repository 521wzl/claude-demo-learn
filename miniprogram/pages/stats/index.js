// miniprogram/pages/stats/index.js - 统计报表页
const { formatAmount } = require('../../utils/format.js')
const { categories } = require('../../utils/category.js')
const { add, subtract } = require('../../utils/amount.js')

Page({
  data: {
    totalExpense: '0.00',
    totalIncome: '0.00',
    netAmount: '0.00',
    overBudget: false,
    fullList: []
  },

  onLoad() {
    this._initialized = false
    this.loadData()
  },

  onShow() {
    if (this._initialized) {
      this.loadData(true)
    } else {
      this._initialized = true
    }
  },

  _getMonthEnd(year, month) {
    const lastDay = new Date(year, month, 0).getDate()
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  },

  async loadData(silent) {
    try {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      const monthStr = `${year}-${String(month).padStart(2, '0')}`
      const startDate = `${monthStr}-01`
      const endDate = this._getMonthEnd(year, month)

      const res = await wx.cloud.callFunction({
        name: 'getRecords',
        data: { page: 1, pageSize: 100, startDate, endDate }
      })

      const result = res.result || {}
      const data = result.data || {}
      const records = data.list || []

      console.log('[DEBUG] stats getRecords, records count:', records.length)

      if (records.length === 0) {
        this.setData({
          totalExpense: '0.00',
          totalIncome: '0.00',
          netAmount: '0.00',
          fullList: [],
          overBudget: false
        })
        return
      }

      // 计算统计数据
      let totalExpense = 0
      let totalIncome = 0
      const categoryBreakdown = {}

      records.forEach(r => {
        if (r.type === 'expense') {
          totalExpense = add(totalExpense, r.amount)
          const cat = r.category || '其他'
          categoryBreakdown[cat] = add(categoryBreakdown[cat] || 0, r.amount)
        } else if (r.type === 'income') {
          totalIncome = add(totalIncome, r.amount)
        }
      })

      const netAmount = subtract(totalIncome, totalExpense)

      this.setData({
        totalExpense: formatAmount(totalExpense),
        totalIncome: formatAmount(totalIncome),
        netAmount: formatAmount(netAmount),
        fullList: this._buildCategoryData(categoryBreakdown, totalExpense),
        overBudget: false
      })
    } catch (err) {
      console.error('加载数据失败', err)
    }
  },

  _buildCategoryData(categoryBreakdown, totalExpense) {
    const categoryData = Object.entries(categoryBreakdown).map(([category, amount]) => {
      const exactPercent = totalExpense > 0 ? (amount / totalExpense) * 100 : 0
      return {
        category,
        emoji: categories[category]?.emoji || '📦',
        color: categories[category]?.color || '#6B6B8D',
        amountRaw: amount,
        amount: formatAmount(amount),
        exactPercent,
        percent: Math.round(exactPercent)
      }
    })

    // 最大余数法：确保百分比总和为100%
    const roundedSum = categoryData.reduce((sum, item) => sum + item.percent, 0)
    if (roundedSum !== 100 && categoryData.length > 0) {
      const diff = 100 - roundedSum
      categoryData.sort((a, b) => {
        const remA = a.exactPercent - Math.floor(a.exactPercent)
        const remB = b.exactPercent - Math.floor(b.exactPercent)
        return remB - remA
      })
      categoryData[0].percent += diff
    }

    // 按金额降序排列
    categoryData.sort((a, b) => b.amountRaw - a.amountRaw)

    // 构建显示用百分比：小占比显示<1，非零占比至少显示1%
    return categoryData.map(({ exactPercent, ...rest }) => ({
      ...rest,
      displayPercent: exactPercent >= 1 ? Math.round(exactPercent) : (exactPercent > 0 ? '<1' : 0)
    }))
  },

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    wx.navigateTo({
      url: `/pages/records/index?category=${category}`
    })
  },

  goToCalendar() {
    wx.navigateTo({
      url: '/pages/calendar/index'
    })
  }
})
