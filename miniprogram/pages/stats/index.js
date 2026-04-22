// miniprogram/pages/stats/index.js - 统计报表页
const { formatAmount } = require('../../utils/format.js')
const { categories } = require('../../utils/category.js')
const { add, subtract, multiply, divide } = require('../../utils/amount.js')

Page({
  data: {
    viewType: 'month',
    totalExpense: '0.00',
    totalIncome: '0.00',
    netAmount: '0.00',
    expenseChange: '0%',
    incomeChange: '0%',
    expenseTrend: 'up',
    incomeTrend: 'up',
    overBudget: false,
    categoryData: [],
    lineData: []
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
          categoryData: [],
          lineData: [],
          overBudget: false
        }, () => {
          this.renderPieChart()
          this.renderLineChart()
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

      const lineData = this._buildLineData(records)

      this.setData({
        totalExpense: formatAmount(totalExpense),
        totalIncome: formatAmount(totalIncome),
        netAmount: formatAmount(netAmount),
        categoryData: this._buildCategoryData(categoryBreakdown, totalExpense),
        lineData,
        overBudget: false // 预算数据需从 settings 获取，这里简化处理
      }, () => {
        this.renderPieChart()
        this.renderLineChart()
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

    categoryData.sort((a, b) => b.percent - a.percent)
    return categoryData.map(({ exactPercent, ...rest }) => rest)
  },

  _buildLineData(records) {
    const daily = {}
    records.forEach(r => {
      if (r.type === 'expense') {
        const date = new Date(r.timestamp)
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`
        daily[dateStr] = (daily[dateStr] || 0) + r.amount
      }
    })
    return Object.entries(daily)
      .sort((a, b) => {
        const [ma, da] = a[0].split('/').map(Number)
        const [mb, db] = b[0].split('/').map(Number)
        return new Date(2024, ma - 1, da) - new Date(2024, mb - 1, db)
      })
      .map(([date, amount]) => ({ date, amount }))
  },

  renderPieChart() {
    const data = this.data.categoryData
    if (!data || data.length === 0) return

    const ctx = wx.createCanvasContext('pieCanvas', this)
    const width = 300
    const height = 300
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) / 2 - 10

    const total = data.reduce((sum, item) => sum + item.amountRaw, 0)
    if (total === 0) return

    let startAngle = -Math.PI / 2
    data.forEach((item) => {
      const sliceAngle = (item.amountRaw / total) * 2 * Math.PI
      const endAngle = startAngle + sliceAngle

      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, startAngle, endAngle)
      ctx.closePath()
      ctx.setFillStyle(item.color || '#7B68EE')
      ctx.fill()

      startAngle = endAngle
    })

    // 中心白色圆形
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius * 0.6, 0, 2 * Math.PI)
    ctx.setFillStyle('#FFFFFF')
    ctx.fill()

    ctx.draw()
  },

  renderLineChart() {
    const data = this.data.lineData
    if (!data || data.length === 0) return

    const ctx = wx.createCanvasContext('lineCanvas', this)
    const width = 320
    const height = 200
    const padding = { top: 20, right: 20, bottom: 30, left: 50 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const maxAmount = Math.max(...data.map(item => item.amount), 1)

    // Y轴
    ctx.setStrokeStyle('#E8E8F0')
    ctx.setLineWidth(1)
    ctx.beginPath()
    ctx.moveTo(padding.left, padding.top)
    ctx.lineTo(padding.left, height - padding.bottom)
    ctx.stroke()

    // X轴
    ctx.beginPath()
    ctx.moveTo(padding.left, height - padding.bottom)
    ctx.lineTo(width - padding.right, height - padding.bottom)
    ctx.stroke()

    if (data.length > 1) {
      ctx.beginPath()
      ctx.setStrokeStyle('#7B68EE')
      ctx.setLineWidth(2)

      data.forEach((item, index) => {
        const x = padding.left + (index / (data.length - 1)) * chartWidth
        const y = padding.top + (1 - item.amount / maxAmount) * chartHeight

        if (index === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })
      ctx.stroke()

      // 数据点
      ctx.setFillStyle('#7B68EE')
      data.forEach((item, index) => {
        const x = padding.left + (index / (data.length - 1)) * chartWidth
        const y = padding.top + (1 - item.amount / maxAmount) * chartHeight
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, 2 * Math.PI)
        ctx.fill()
      })
    }

    ctx.setFillStyle('#6B6B8D')
    ctx.setFontSize(10)
    ctx.fillText('0', padding.left - 8, height - padding.bottom)
    ctx.fillText(maxAmount.toFixed(0), padding.left - 8, padding.top + 4)

    ctx.draw()
  },

  switchView(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ viewType: type })
    this.loadData()
  },

  onPieTap(e) {
    const { category } = e.detail || {}
    if (category) {
      wx.navigateTo({
        url: `/pages/records/index?category=${encodeURIComponent(category)}`
      })
    }
  },

  onLegendTap(e) {
    const category = e.currentTarget.dataset.category
    wx.navigateTo({
      url: `/pages/records/index?category=${category}`
    })
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
