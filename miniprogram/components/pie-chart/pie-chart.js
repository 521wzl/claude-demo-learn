// components/pie-chart/pie-chart.js
Component({
  properties: {
    data: {
      type: Array,
      default: []
    },
    total: {
      type: Number,
      default: 0
    }
  },

  data: {
    canvasWidth: 300,
    canvasHeight: 300
  },

  lifetimes: {
    attached() {
      this.renderChart()
    }
  },

  observers: {
    'data': function() {
      this.renderChart()
    }
  },

  methods: {
    renderChart() {
      const data = this.data.data
      if (!data || data.length === 0) return

      const ctx = wx.createCanvasContext('pieCanvas', this)
      const width = 300
      const height = 300
      const centerX = width / 2
      const centerY = height / 2
      const radius = Math.min(width, height) / 2 - 10

      // 计算总量
      const total = data.reduce((sum, item) => sum + item.amount, 0)
      if (total === 0) return

      // 绘制饼图
      let startAngle = -Math.PI / 2
      data.forEach((item, index) => {
        const sliceAngle = (item.amount / total) * 2 * Math.PI
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

    onTap(e) {
      const { x, y } = e.detail || e.touches?.[0] || {}
      if (x === undefined) {
        this.triggerEvent('tap')
        return
      }
      const width = 300, height = 300
      const centerX = width / 2, centerY = height / 2
      const dx = x - centerX, dy = y - centerY
      let angle = Math.atan2(dy, dx) + Math.PI / 2
      if (angle < 0) angle += 2 * Math.PI

      const data = this.data.data
      const total = data.reduce((sum, item) => sum + item.amount, 0)
      if (total === 0) return

      let startAngle = 0
      for (let i = 0; i < data.length; i++) {
        const sliceAngle = (data[i].amount / total) * 2 * Math.PI
        const endAngle = startAngle + sliceAngle
        if (angle >= startAngle && angle < endAngle) {
          this.triggerEvent('tap', { index: i, category: data[i].category })
          return
        }
        startAngle = endAngle
      }
      this.triggerEvent('tap')
    }
  }
})
