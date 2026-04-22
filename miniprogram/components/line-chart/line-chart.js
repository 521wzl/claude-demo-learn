// components/line-chart/line-chart.js
Component({
  properties: {
    data: {
      type: Array,
      default: []
    }
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

      const ctx = wx.createCanvasContext('lineCanvas', this)
      const width = 320
      const height = 200
      const padding = { top: 20, right: 20, bottom: 30, left: 50 }
      const chartWidth = width - padding.left - padding.right
      const chartHeight = height - padding.top - padding.bottom

      // 计算最大值
      const maxAmount = Math.max(...data.map(item => item.amount), 1)

      // 绘制坐标轴
      ctx.setStrokeStyle('#E8E8F0')
      ctx.setLineWidth(1)

      // Y轴
      ctx.beginPath()
      ctx.moveTo(padding.left, padding.top)
      ctx.lineTo(padding.left, height - padding.bottom)
      ctx.stroke()

      // X轴
      ctx.beginPath()
      ctx.moveTo(padding.left, height - padding.bottom)
      ctx.lineTo(width - padding.right, height - padding.bottom)
      ctx.stroke()

      // 绘制折线
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

        // 绘制数据点
        ctx.setFillStyle('#7B68EE')
        data.forEach((item, index) => {
          const x = padding.left + (index / (data.length - 1)) * chartWidth
          const y = padding.top + (1 - item.amount / maxAmount) * chartHeight
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, 2 * Math.PI)
          ctx.fill()
        })
      }

      // Y轴标签
      ctx.setFillStyle('#6B6B8D')
      ctx.setFontSize(10)
      ctx.fillText('0', padding.left - 8, height - padding.bottom)
      ctx.fillText(maxAmount.toFixed(0), padding.left - 8, padding.top + 4)

      ctx.draw()
    },

    onTap() {
      this.triggerEvent('tap')
    }
  }
})
