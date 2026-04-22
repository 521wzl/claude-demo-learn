// pages/records/index.js — 记录列表

const CATEGORY_MAP = {
  餐饮: { emoji: '🍜', color: '#FF6B6B' },
  交通: { emoji: '🚗', color: '#4ECDC4' },
  购物: { emoji: '🛒', color: '#7B68EE' },
  娱乐: { emoji: '🎮', color: '#FF9F43' },
  居住: { emoji: '🏠', color: '#6B8E23' },
  医疗: { emoji: '💊', color: '#FF7F50' },
  教育: { emoji: '📚', color: '#4A90D9' },
  通讯: { emoji: '📱', color: '#9B59B6' },
  投资理财: { emoji: '💹', color: '#27AE60' },
  生活用品: { emoji: '🎁', color: '#8E44AD' },
  水费: { emoji: '💧', color: '#3498DB' },
  电费: { emoji: '🔌', color: '#F39C12' },
  燃气费: { emoji: '🔥', color: '#E74C3C' },
  物业费: { emoji: '🏢', color: '#95A5A6' },
  其他: { emoji: '📦', color: '#6B6B8D' },
  收入: { emoji: '💰', color: '#2ECC71' }
}

const ALL_CATEGORIES = Object.keys(CATEGORY_MAP)
const PAGE_SIZE = 20

Page({
  data: {
    // 月份
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,

    // 列表
    groupedRecords: [],   // [{ dateLabel, records: [...] }]
    loading: true,        // 骨架屏
    loadingMore: false,
    hasMore: true,
    page: 1,

    // 筛选
    showFilter: false,
    filter: {
      categories: [],   // 空=全部
      type: 'all',      // all / expense / income
      minAmount: '',
      maxAmount: ''
    },
    filterDraft: {},    // 未提交的草稿
    filterActive: false,

    // 删除
    swipeRecordId: null,  // 当前左滑记录ID

    // 骨架屏条数
    skeletonRows: [1, 2, 3, 4, 5]
  },

  onLoad() {
    this._initFilter()
    this._initialized = false
    this._loadRecords(true)
  },

  onShow() {
    // 返回时静默刷新，不闪骨架屏
    if (this._initialized) {
      this._loadRecords(true, true) // silent = true
    } else {
      this._initialized = true
    }
  },

  onPullDownRefresh() {
    this._loadRecords(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this._loadRecords(false)
  },

  // ─── 初始化筛选 ───────────────────────────────────
  _initFilter() {
    this.setData({
      filterDraft: {
        categories: [],
        type: 'all',
        minAmount: '',
        maxAmount: ''
      }
    })
  },

  // ─── 加载数据 ─────────────────────────────────────
  async _loadRecords(reset, silent) {
    if (reset) {
      if (silent) {
        // 静默刷新：保留当前数据，page 复位
        this.setData({ page: 1, hasMore: true })
      } else {
        // 首次/下拉刷新：显示骨架屏
        this.setData({ page: 1, groupedRecords: [], loading: true, hasMore: true })
      }
    } else {
      this.setData({ loadingMore: true })
    }

    const { currentYear, currentMonth, filter, page } = this.data
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
    const endDate = this._getMonthEnd(currentYear, currentMonth)

    try {
      const res = await wx.cloud.callFunction({
        name: 'getRecords',
        data: {
          page: reset ? 1 : page,
          pageSize: PAGE_SIZE,
          startDate,
          endDate,
          category: filter.categories.length ? filter.categories.join(',') : undefined,
          type: filter.type !== 'all' ? filter.type : undefined,
          minAmount: filter.minAmount ? parseFloat(filter.minAmount) : undefined,
          maxAmount: filter.maxAmount ? parseFloat(filter.maxAmount) : undefined
        }
      })

      const data = (res.result || {}).data || {}
      const list = data.list || []
      const total = data.total || 0
      const hasMore = data.hasMore || false

      const formatted = list.map(r => this._formatRecord(r))
      const grouped = reset
        ? this._groupByDate(formatted)
        : this._groupByDate([...this._flattenGroups(), ...formatted])

      this.setData({
        groupedRecords: grouped,
        loading: false,
        loadingMore: false,
        hasMore,
        page: reset ? 2 : this.data.page + 1
      })
    } catch (err) {
      console.error('_loadRecords 失败', err)
      this.setData({ loading: false, loadingMore: false })
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    }
  },

  _flattenGroups() {
    return this.data.groupedRecords.reduce((acc, g) => [...acc, ...g.records], [])
  },

  _getMonthEnd(year, month) {
    // 用 JS Date 正确获取月末日期（避免 04-31 溢出为 05-01）
    const lastDay = new Date(year, month, 0).getDate()
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
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

  _groupByDate(records) {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const todayStr = this._toDateStr(today)
    const yesterdayStr = this._toDateStr(yesterday)

    const groups = {}
    for (const r of records) {
      const d = new Date(r.timestamp)
      const dStr = this._toDateStr(d)
      let label
      if (dStr === todayStr) label = '今天'
      else if (dStr === yesterdayStr) label = '昨天'
      else label = `${d.getMonth() + 1}月${d.getDate()}日`

      if (!groups[dStr]) groups[dStr] = { dateLabel: label, dateStr: dStr, records: [] }
      groups[dStr].records.push(r)
    }

    return Object.values(groups).sort((a, b) => b.dateStr.localeCompare(a.dateStr))
  },

  _toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },

  // ─── 月份切换 ─────────────────────────────────────
  onPrevMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth -= 1
    if (currentMonth < 1) { currentMonth = 12; currentYear -= 1 }
    this.setData({ currentYear, currentMonth })
    this._loadRecords(true)
  },

  onNextMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth += 1
    if (currentMonth > 12) { currentMonth = 1; currentYear += 1 }
    this.setData({ currentYear, currentMonth })
    this._loadRecords(true)
  },

  // ─── 左滑删除 ─────────────────────────────────────
  _touchStart(e) {
    this._touchStartX = e.touches[0].clientX
    this._touchStartY = e.touches[0].clientY
  },

  _touchMove(e) {
    // 可选：实时跟踪滑动距离做动画
  },

  _touchEnd(e) {
    if (!this._touchStartX) return
    const deltaX = e.changedTouches[0].clientX - this._touchStartX
    const deltaY = e.changedTouches[0].clientY - this._touchStartY
    const targetId = e.currentTarget.dataset.swipeTarget
    // 水平滑动超过 50px 且向左滑
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      this.setData({ swipeRecordId: deltaX < 0 ? targetId : null })
    } else {
      this.setData({ swipeRecordId: null })
    }
    this._touchStartX = null
  },

  onSwipe(e) {
    const id = e.currentTarget.dataset.id
    if (e.detail.direction === 'left') {
      this.setData({ swipeRecordId: id })
    } else {
      this.setData({ swipeRecordId: null })
    }
  },

  onDeleteRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除记录',
      content: '删除后不可恢复，确认删除？',
      confirmText: '删除',
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const result = await wx.cloud.callFunction({ name: 'deleteRecord', data: { id } })
          if (result.result && result.result.code === 0) {
            wx.showToast({ title: '已删除', icon: 'none' })
            this._loadRecords(true, true) // silent refresh, keep skeleton hidden
          } else {
            throw new Error(result.result.errMsg)
          }
        } catch (err) {
          console.error('onDeleteRecord 失败', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
    this.setData({ swipeRecordId: null })
  },

  // ─── 筛选面板 ─────────────────────────────────────
  onFilterOpen() {
    this.setData({
      showFilter: true,
      filterDraft: JSON.parse(JSON.stringify(this.data.filter)),
      allCategories: ALL_CATEGORIES.map(name => ({
        name,
        emoji: CATEGORY_MAP[name].emoji,
        color: CATEGORY_MAP[name].color,
        selected: this.data.filter.categories.includes(name)
      }))
    })
  },

  onFilterClose() { this.setData({ showFilter: false }) },

  onFilterCategoryToggle(e) {
    const name = e.currentTarget.dataset.name
    let cats = [...this.data.filterDraft.categories]
    const idx = cats.indexOf(name)
    if (idx >= 0) cats.splice(idx, 1)
    else cats.push(name)
    this.setData({
      'filterDraft.categories': cats,
      allCategories: this.data.allCategories.map(c => ({
        ...c, selected: cats.includes(c.name)
      }))
    })
  },

  onFilterTypeSelect(e) {
    this.setData({ 'filterDraft.type': e.currentTarget.dataset.type })
  },

  onFilterMinInput(e) {
    this.setData({ 'filterDraft.minAmount': e.detail.value })
  },

  onFilterMaxInput(e) {
    this.setData({ 'filterDraft.maxAmount': e.detail.value })
  },

  onFilterReset() {
    this.setData({
      filterDraft: { categories: [], type: 'all', minAmount: '', maxAmount: '' },
      allCategories: ALL_CATEGORIES.map(name => ({
        name,
        emoji: CATEGORY_MAP[name].emoji,
        color: CATEGORY_MAP[name].color,
        selected: false
      }))
    })
  },

  onFilterConfirm() {
    const draft = this.data.filterDraft
    const filterActive =
      draft.categories.length > 0 ||
      draft.type !== 'all' ||
      draft.minAmount !== '' ||
      draft.maxAmount !== ''

    this.setData({ filter: { ...draft }, filterActive, showFilter: false })
    this._loadRecords(true)
  },

  // ─── 导航 ────────────────────────────────────────
  onRecordTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/edit/index?id=${id}` })
  },

  onEditRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/edit/index?id=${id}` })
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/index' })
  }
})
