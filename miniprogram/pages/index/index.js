// pages/index/index.js — 首页（记账入口）
const { add, subtract, multiply, divide, format } = require('../../utils/amount.js')

const CATEGORY_MAP = {
  早餐: { emoji: '🍳', color: '#FF6B6B', bgColor: '#FFF0F0' },
  午餐: { emoji: '🍱', color: '#FF9F43', bgColor: '#FFF8E6' },
  晚餐: { emoji: '🍲', color: '#E74C3C', bgColor: '#FFF5EE' },
  夜宵: { emoji: '🌙', color: '#9B59B6', bgColor: '#F8EEFF' },
  水果零食: { emoji: '🍎', color: '#27AE60', bgColor: '#F0FFF5' },
  蔬菜: { emoji: '🥬', color: '#2ECC71', bgColor: '#E8F8F0' },
  肉类: { emoji: '🥩', color: '#E74C3C', bgColor: '#FDEDEC' },
  海鲜: { emoji: '🦐', color: '#3498DB', bgColor: '#EBF5FB' },
  粮油调味品: { emoji: '🧂', color: '#F39C12', bgColor: '#FEF9E7' },
  咖啡茶饮: { emoji: '☕', color: '#8B4513', bgColor: '#F5DEB3' },
  烟酒茶叶: { emoji: '🍵', color: '#D2691E', bgColor: '#FFF5EE' },
  日常交通: { emoji: '🚌', color: '#4ECDC4', bgColor: '#F0FFFE' },
  远行交通: { emoji: '🚄', color: '#3498DB', bgColor: '#EEF6FF' },
  养车: { emoji: '🚙', color: '#95A5A6', bgColor: '#F5F5FA' },
  电器数码: { emoji: '📱', color: '#7B68EE', bgColor: '#F5F0FF' },
  春装: { emoji: '🌸', color: '#FF69B4', bgColor: '#FFF0F5' },
  夏装: { emoji: '🩱', color: '#00CED1', bgColor: '#F0FFFF' },
  秋装: { emoji: '🍂', color: '#D2691E', bgColor: '#FFF5EE' },
  冬装: { emoji: '🧥', color: '#4A4A4A', bgColor: '#F5F5F5' },
  美妆: { emoji: '💄', color: '#FF69B4', bgColor: '#FFF0F5' },
  医美: { emoji: '✨', color: '#FFD700', bgColor: '#FFFEF0' },
  美发: { emoji: '✂️', color: '#8B4513', bgColor: '#F5DEB3' },
  娱乐: { emoji: '🎮', color: '#FF9F43', bgColor: '#FFF8E6' },
  运动: { emoji: '⚽', color: '#E67E22', bgColor: '#FEF5E7' },
  旅行: { emoji: '✈️', color: '#3498DB', bgColor: '#EBF6FF' },
  房租: { emoji: '🏠', color: '#6B8E23', bgColor: '#F5FFE5' },
  物业费: { emoji: '🏢', color: '#95A5A6', bgColor: '#F5F5FA' },
  房贷: { emoji: '🏦', color: '#2C3E50', bgColor: '#EBEDEF' },
  装修: { emoji: '🏗️', color: '#8B4513', bgColor: '#F5DEB3' },
  水费: { emoji: '💧', color: '#3498DB', bgColor: '#EEF6FF' },
  电费: { emoji: '🔌', color: '#F39C12', bgColor: '#FFF8E6' },
  燃气费: { emoji: '🔥', color: '#E74C3C', bgColor: '#FFF5EE' },
  医疗: { emoji: '💊', color: '#FF7F50', bgColor: '#FFF5EE' },
  教育: { emoji: '📚', color: '#4A90D9', bgColor: '#EEF6FF' },
  通讯: { emoji: '📱', color: '#9B59B6', bgColor: '#F8EEFF' },
  人情: { emoji: '🎁', color: '#DAA520', bgColor: '#FFF8DC' },
  赡养: { emoji: '👨‍👩‍👧', color: '#E74C3C', bgColor: '#FDEDEC' },
  养娃: { emoji: '🧒', color: '#FF69B4', bgColor: '#FFF0F5' },
  宠物: { emoji: '🐱', color: '#9B59B6', bgColor: '#F8EEFF' },
  投资理财: { emoji: '💹', color: '#27AE60', bgColor: '#F0FFF5' },
  生活用品: { emoji: '🏷️', color: '#95A5A6', bgColor: '#F5F5FA' },
  其他: { emoji: '📦', color: '#6B6B8D', bgColor: '#F5F5FA' },
  收入: { emoji: '💰', color: '#2ECC71', bgColor: '#F0FFF5' }
}

const QUICK_CATEGORIES = ['早餐', '午餐', '晚餐', '咖啡茶饮', '水果零食', '日常交通', '生活用品', '房租', '水费', '电费', '燃气费', '物业费', '通讯', '医疗', '赡养']

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

    // 缓存优先：先显示上次数据
    const cachedBudget = wx.getStorageSync('cache_budgetInfo')
    const cachedRecords = wx.getStorageSync('cache_recentRecords')
    if (cachedBudget) this.setData({ budgetInfo: cachedBudget })
    if (cachedRecords) this.setData({ recentRecords: cachedRecords })

    // 后台静默刷新
    this._loadBudgetInfo(true)
    this._loadRecentRecords(true)
  },

  onShow() {
    // 返回时静默刷新，不闪骨架屏
    if (this._initialized) {
      // 缓存优先：先显示上次数据
      const cachedBudget = wx.getStorageSync('cache_budgetInfo')
      const cachedRecords = wx.getStorageSync('cache_recentRecords')
      if (cachedBudget) this.setData({ budgetInfo: cachedBudget })
      if (cachedRecords) this.setData({ recentRecords: cachedRecords })
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

      const budgetInfo = { expense, income, balance, budget: totalBudget, percent }
      this.setData({ budgetStatus, warningText, budgetInfo })
      wx.setStorageSync('cache_budgetInfo', budgetInfo)
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
      const recentRecords = list.map(r => this._formatRecord(r))
      this.setData({ recentRecords, recentLoading: false })
      wx.setStorageSync('cache_recentRecords', recentRecords)
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
      早餐: ['早餐', '早点', '早饭店'],
      午餐: ['午餐', '午饭', '中饭'],
      晚餐: ['晚餐', '晚饭'],
      夜宵: ['夜宵', '宵夜'],
      水果零食: ['水果', '零食', '糕点', '面包', '生鲜'],
      蔬菜: ['青菜', '豆腐', '菌菇', '蔬菜', '凉菜'],
      肉类: ['猪肉', '牛肉', '羊肉', '鸡肉', '肉类', '熟食'],
      海鲜: ['鱼', '虾', '蟹', '海鲜', '贝类', '海带'],
      粮油调味品: ['油', '盐', '酱', '醋', '调料', '调味品', '酱油', '料酒'],
      咖啡茶饮: ['咖啡', '奶茶', '茶饮', '果汁', '水果茶', '喜茶', '奈雪'],
      烟酒茶叶: ['烟', '香烟', '酒', '白酒', '啤酒', '红酒', '茶叶', '茶具'],
      日常交通: ['公交', '地铁', '出租', '打车', '滴滴', '日常出行'],
      远行交通: ['高铁', '火车', '飞机', '动车', '长途汽车'],
      养车: ['充电', '加油', '保养', '保险', '停车', '维修', '年检', '洗车', '违章'],
      电器数码: ['手机', '电脑', '相机', '家电', '数码', '平板', '笔记本'],
      春装: ['春装', '春季衣服', '外套', '风衣', '毛衣'],
      夏装: ['夏装', '夏季衣服', '短袖', '裙子', 'T恤'],
      秋装: ['秋装', '秋季衣服', '长袖', '卫衣', '外套'],
      冬装: ['冬装', '冬季衣服', '羽绒服', '大衣', '棉衣'],
      美妆: ['化妆品', '护肤', '香水', '美妆', '美容', '口红', '粉底'],
      医美: ['医美', '整形', '整容', '美白', '玻尿酸', '瘦脸针', '水光针'],
      美发: ['理发', '剪发', '染发', '烫发', '造型', '美发', '洗头', '吹发', 'Tony'],
      娱乐: ['游戏', '电影', '音乐', '演出', '展览', '演唱会', '话剧'],
      运动: ['健身', '跑步', '游泳', '球类', '瑜伽', '体育', '羽毛球', '篮球'],
      旅行: ['旅游', '酒店', '景点', '门票', '旅行', '度假'],
      房租: ['房租', '租金'],
      物业费: ['物业费', '管理费', '物业'],
      房贷: ['房贷', '住房贷款', '月供'],
      装修: ['家具', '装修', '建材', '人工费', '搬家', '家居'],
      水费: ['水费', '水', '自来水', '水务'],
      电费: ['电费', '电', '电价', '电力'],
      燃气费: ['燃气', '天然气', '煤气', '燃气费'],
      医疗: ['医院', '挂号', '看病', '体检', '牙科', '疫苗', '买药'],
      教育: ['学费', '书籍', '培训', '考试', '网课', '补习', '文具'],
      通讯: ['话费', '流量', '宽带', '充值', '通讯'],
      人情: ['请客', '红包', '礼物', '社交', '聚会', '人情'],
      赡养: ['父母', '赡养', '给父母', '生活费', '过节费', '老人', '爸妈', '长辈', '给老人', '老年人'],
      养娃: ['奶粉', '尿不湿', '奶瓶', '婴儿车', '婴儿床', '婴儿服装', '婴儿玩具', '婴儿游泳', '婴儿摄影', '疫苗', '体检', '托班', '幼儿园', '学费', '书本费', '资料费', '试卷费', '校服', '书包', '文具', '校车', '托管', '兴趣班', '辅导班', '住宿费', '学习资料', '考试费', '生活费', '手机', '电脑', '毕业旅行', '考研', '留学', '游学', '夏令营', '辅食', '绘本', '玩具'],
      宠物: ['宠物', '猫', '狗', '宠物食品', '宠物医疗', '宠物用品'],
      投资理财: ['基金', '股票', '理财', '保险', '债券', '黄金', '存款'],
      生活用品: ['日用品', '清洁', '纸品', '厨房', '家庭用品', '洗发水', '沐浴露'],
      其他: ['其他', '杂项', '无法分类'],
      收入: ['工资', '奖金', '收入', '到账', '红包', '退款', '回收', '稿费', '劳务', '介绍费', '佣金', '外快', '理财收益', '理赔', '报销', '转账', '收款']
    }

    // === 0. 买卖方向优先判断 ===
    const SELL_WORDS = ['卖', '卖出', '赎回', '兑现', '变现', '套现', '减持',
      '理财赎回', '基金赎回', '股票赎回', '理财收益', '基金收益', '股票收益',
      '股息', '红利', '分红', '利息', '金收益', '股息红利', '到期', '回款']
    const BUY_WORDS = ['买', '购买', '申购', '买入', '充值',
      '买股', '买理财', '买黄金', '买基金', '买金条', '炒股']

    const hasSell = SELL_WORDS.some(w => text.includes(w))
    const hasBuy = BUY_WORDS.some(w => text.includes(w))

    // 投资理财类目的买卖判断（优先于普通关键词匹配）
    if (['股票', '基金', '理财', '黄金'].some(w => text.includes(w))) {
      if (hasSell) return { category: '投资理财', type: 'income', amount, remark: text }
      if (hasBuy) return { category: '投资理财', type: 'expense', amount, remark: text }
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
