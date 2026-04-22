// pages/index/index.js — 首页（记账入口）
const { add, subtract, multiply, divide, format } = require('../../utils/amount.js')

const CATEGORY_MAP = {
  餐饮: { emoji: '🍜', color: '#FF6B6B', bgColor: '#FFF0F0' },
  交通: { emoji: '🚗', color: '#4ECDC4', bgColor: '#F0FFFE' },
  购物: { emoji: '🛒', color: '#7B68EE', bgColor: '#F5F0FF' },
  娱乐: { emoji: '🎮', color: '#FF9F43', bgColor: '#FFF8E6' },
  居住: { emoji: '🏠', color: '#6B8E23', bgColor: '#F5FFE5' },
  医疗: { emoji: '💊', color: '#FF7F50', bgColor: '#FFF5EE' },
  教育: { emoji: '📚', color: '#4A90D9', bgColor: '#EEF6FF' },
  通讯: { emoji: '📱', color: '#9B59B6', bgColor: '#F8EEFF' },
  投资理财: { emoji: '💹', color: '#27AE60', bgColor: '#F0FFF5' },
  生活用品: { emoji: '🎁', color: '#8E44AD', bgColor: '#F5F0FF' },
  水费: { emoji: '💧', color: '#3498DB', bgColor: '#EEF6FF' },
  电费: { emoji: '🔌', color: '#F39C12', bgColor: '#FFF8E6' },
  燃气费: { emoji: '🔥', color: '#E74C3C', bgColor: '#FFF5EE' },
  物业费: { emoji: '🏢', color: '#95A5A6', bgColor: '#F5F5FA' },
  其他: { emoji: '📦', color: '#6B6B8D', bgColor: '#F5F5FA' },
  收入: { emoji: '💰', color: '#2ECC71', bgColor: '#F0FFF5' }
}

const QUICK_CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '教育', '通讯', '水费', '电费', '燃气费', '物业费', '其他', '收入']

Page({
  data: {
    // 预算状态：normal / warning / danger
    budgetStatus: 'normal',
    budgetInfo: {
      expense: 0,
      income: 0,
      balance: 0,
      budget: 0,
      percent: 0
    },
    warningText: '',

    // 输入状态：idle / inputting / recognizing / result / saving / success / error
    inputState: 'idle',
    inputText: '',
    aiResult: null,

    // 快捷类目
    quickCategories: QUICK_CATEGORIES.map(name => ({
      name,
      emoji: CATEGORY_MAP[name].emoji,
      color: CATEGORY_MAP[name].color,
      bgColor: CATEGORY_MAP[name].bgColor,
      selected: false
    })),

    // 最近记录
    recentRecords: [],
    recentLoading: false,

    // 金额键盘（快捷记账 bottom-sheet）
    showAmountSheet: false,
    selectedCategory: null,
    inputAmount: '',

    // 新手引导
    showGuide: false
  },

  onLoad() {
    const app = getApp()
    this.setData({ showGuide: app.globalData.showGuide || false })
    this._initialized = false
    this._loadBudgetInfo()
    this._loadRecentRecords()
  },

  onShow() {
    // 返回时静默刷新，不闪骨架屏
    if (this._initialized) {
      this._loadBudgetInfo(true)
      this._loadRecentRecords(true)
    } else {
      this._initialized = true
    }
  },

  // ─── 新手引导 ───────────────────────────────────
  onGuideStart() {
    wx.setStorageSync('hasVisited', true)
    wx.removeStorageSync('guideDelayUntil')
    const app = getApp()
    app.globalData.showGuide = false
    this.setData({ showGuide: false })
  },

  onGuideLater() {
    const delay = Date.now() + 7 * 24 * 60 * 60 * 1000
    wx.setStorageSync('guideDelayUntil', delay)
    const app = getApp()
    app.globalData.showGuide = false
    this.setData({ showGuide: false })
  },

  // ─── 预算信息 ────────────────────────────────────
  _getMonthEnd(year, month) {
    const lastDay = new Date(year, month, 0).getDate()
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  },

  async _loadBudgetInfo(silent) {
    try {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = this._getMonthEnd(year, month)

      const [budgetRes, recordsRes] = await Promise.all([
        wx.cloud.callFunction({ name: 'getBudget', data: { year, month } }),
        wx.cloud.callFunction({
          name: 'getRecords',
          data: { page: 1, pageSize: 100, startDate, endDate }
        })
      ])

      const budget = (budgetRes.result || {}).data || {}
      const records = (recordsRes.result || {}).data?.list || []

      const expense = records
        .filter(r => r.type === 'expense')
        .reduce((s, r) => add(s, r.amount), 0)
      const income = records
        .filter(r => r.type === 'income')
        .reduce((s, r) => add(s, r.amount), 0)
      const balance = subtract(income, expense)
      const totalBudget = budget.total_budget || 0
      const percent = totalBudget > 0 ? Math.round(divide(multiply(expense, 100), totalBudget)) : 0

      let budgetStatus = 'normal'
      let warningText = ''
      if (totalBudget > 0) {
        if (expense >= totalBudget) {
          budgetStatus = 'danger'
          warningText = `⚠️ 本月支出已超预算 ¥${format(subtract(expense, totalBudget))}`
        } else if (expense >= totalBudget * 0.8) {
          budgetStatus = 'warning'
          warningText = `⚠️ 本月支出已达预算的 ${percent}%`
        }
      }

      this.setData({
        budgetStatus,
        warningText,
        budgetInfo: { expense, income, balance, budget: totalBudget, percent }
      })
    } catch (err) {
      console.error('_loadBudgetInfo 失败', err)
    }
  },

  // ─── 最近记录 ────────────────────────────────────
  async _loadRecentRecords(silent) {
    if (!silent) {
      this.setData({ recentLoading: true })
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'getRecords',
        data: { page: 1, pageSize: 10 }
      })
      const list = (res.result || {}).data?.list || []
      this.setData({
        recentRecords: list.map(r => this._formatRecord(r)),
        recentLoading: false
      })
    } catch (err) {
      console.error('_loadRecentRecords 失败', err)
      this.setData({ recentLoading: false })
    }
  },

  _formatRecord(r) {
    const cat = CATEGORY_MAP[r.category] || CATEGORY_MAP['其他']
    return {
      ...r,
      emoji: cat.emoji,
      color: cat.color,
      displayAmount: r.type === 'expense' ? `-${r.amount.toFixed(2)}` : `+${r.amount.toFixed(2)}`
    }
  },

  // ─── 文字输入 ────────────────────────────────────
  onInputChange(e) {
    this.setData({ inputText: e.detail.value, inputState: 'inputting' })
  },

  onInputConfirm() {
    const text = this.data.inputText.trim()
    if (!text) return
    this._recognizeText(text)
  },

  // ─── 语音输入 ────────────────────────────────────
  onVoiceStart() {
    this.setData({ inputState: 'recognizing' })
    const recorderManager = wx.getRecorderManager()
    this._recorderManager = recorderManager
    recorderManager.onStop(async (res) => {
      // 语音识别后拿到文字（示例：直接调用云函数）
      try {
        const voiceText = res.tempFilePath // 实际需要语音转文字 API
        if (voiceText) this._recognizeText(voiceText)
        else this.setData({ inputState: 'idle' })
      } catch (err) {
        this.setData({ inputState: 'idle' })
      }
    })
    recorderManager.start({ duration: 60000 })
  },

  onVoiceStop() {
    if (this._recorderManager) this._recorderManager.stop()
  },

  // ─── AI 识别 ─────────────────────────────────────
  async _recognizeText(text) {
    this.setData({ inputState: 'recognizing' })
    try {
      // 本地简单规则识别（减少云函数调用）
      const localResult = this._localClassify(text)
      if (localResult) {
        this._showAiResult(localResult)
        return
      }
      // 本地识别失败时调用云函数
      const res = await wx.cloud.callFunction({ name: 'classifyAI', data: { text } })
      if (res.result && res.result.code === 0) {
        this._showAiResult(res.result.data)
      } else {
        this.setData({ inputState: 'error' })
      }
    } catch (err) {
      console.error('_recognizeText 失败', err)
      this.setData({ inputState: 'error' })
    }
  },

  _localClassify(text) {
    // 简单本地规则：匹配金额 + 常见关键词
    const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*[元块圆]?/)
    if (!amountMatch) return null

    const amount = parseFloat(amountMatch[1])
    const keywords = {
      餐饮: ['吃', '午餐', '晚餐', '早餐', '饭', '外卖', '餐', '奶茶', '咖啡', '零食'],
      交通: ['打车', '出租车', '地铁', '公交', '高铁', '飞机', '停车', '加油'],
      购物: ['超市', '购物', '买', '淘宝', '京东', '网购', '衣服', '鞋'],
      娱乐: ['游戏', '电影', '视频', '音乐', 'KTV', '娱乐'],
      居住: ['房租', '物业', '水电', '燃气', '房'],
      医疗: ['药', '医院', '挂号', '看病', '医疗'],
      教育: ['课程', '书', '学费', '培训', '教育'],
      通讯: ['话费', '流量', '宽带', '充值', '通讯'],
      收入: ['工资', '奖金', '收入', '到账', '红包']
    }

    for (const [cat, words] of Object.entries(keywords)) {
      if (words.some(w => text.includes(w))) {
        return {
          category: cat,
          type: cat === '收入' ? 'income' : 'expense',
          amount,
          remark: text
        }
      }
    }
    return { category: '其他', type: 'expense', amount, remark: text }
  },

  _showAiResult(result) {
    const cat = CATEGORY_MAP[result.category] || CATEGORY_MAP['其他']
    this.setData({
      inputState: 'result',
      aiResult: {
        ...result,
        emoji: cat.emoji,
        color: cat.color,
        displayAmount: result.amount.toFixed(2)
      }
    })
  },

  // ─── 修改 AI 结果 ─────────────────────────────────
  onModifyCategory() {
    // 弹出类目选择（可复用快捷类目的交互）
    // 此处简化：直接从快捷类目列表选取
  },

  onSelectAiCategory(e) {
    const name = e.currentTarget.dataset.name
    const cat = CATEGORY_MAP[name] || CATEGORY_MAP['其他']
    this.setData({
      'aiResult.category': name,
      'aiResult.emoji': cat.emoji,
      'aiResult.color': cat.color,
      'aiResult.type': name === '收入' ? 'income' : 'expense'
    })
  },

  // ─── 确认记账 ─────────────────────────────────────
  async onConfirmRecord() {
    if (this.data.inputState === 'saving') return
    const result = this.data.aiResult
    if (!result) return

    this.setData({ inputState: 'saving' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'addRecord',
        data: {
          type: result.type,
          amount: result.amount,
          category: result.category,
          remark: result.remark || this.data.inputText,
          timestamp: Date.now()
        }
      })
      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '记账成功 ✓', icon: 'none', duration: 1500 })
        this.setData({ inputState: 'idle', inputText: '', aiResult: null })
        this._loadRecentRecords()
        this._loadBudgetInfo()
      } else {
        throw new Error(res.result.errMsg || '保存失败')
      }
    } catch (err) {
      console.error('onConfirmRecord 失败', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none', duration: 2000 })
      this.setData({ inputState: 'result' })
    }
  },

  // ─── 快捷类目 ─────────────────────────────────────
  onQuickCategory(e) {
    const name = e.currentTarget.dataset.name
    const cat = CATEGORY_MAP[name] || CATEGORY_MAP['其他']
    this.setData({
      showAmountSheet: true,
      inputAmount: '',
      selectedCategory: { name, ...cat }
    })
  },

  onAmountSheetClose() {
    this.setData({ showAmountSheet: false, inputAmount: '', selectedCategory: null })
  },

  onAmountKeyPress(e) {
    const key = e.currentTarget.dataset.key
    let amount = this.data.inputAmount

    if (key === '⌫') {
      amount = amount.slice(0, -1)
    } else if (key === '.') {
      if (!amount.includes('.')) amount += '.'
    } else {
      // 限制最大金额 999999.99
      const next = amount + key
      const num = parseFloat(next)
      if (num > 999999.99) return
      // 限制小数点后两位
      if (amount.includes('.')) {
        const decimals = amount.split('.')[1]
        if (decimals && decimals.length >= 2) return
      }
      amount = next
    }

    this.setData({ inputAmount: amount })
  },

  async onAmountConfirm() {
    const { inputAmount, selectedCategory } = this.data
    const amount = parseFloat(inputAmount)
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }
    this.setData({ showAmountSheet: false })

    try {
      const res = await wx.cloud.callFunction({
        name: 'addRecord',
        data: {
          type: selectedCategory.name === '收入' ? 'income' : 'expense',
          amount,
          category: selectedCategory.name,
          remark: '',
          timestamp: Date.now()
        }
      })
      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '记账成功 ✓', icon: 'none', duration: 1500 })
        this._loadRecentRecords()
        this._loadBudgetInfo()
      } else {
        throw new Error(res.result.errMsg || '保存失败')
      }
    } catch (err) {
      console.error('onAmountConfirm 失败', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ selectedCategory: null, inputAmount: '' })
    }
  },

  // ─── 导航 ────────────────────────────────────────
  onViewAll() {
    wx.switchTab({ url: '/pages/records/index' })
  },

  onRecordTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/edit/index?id=${id}` })
  },

  onCalendarTap() {
    wx.navigateTo({ url: '/pages/calendar/index' })
  }
})
