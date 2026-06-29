import React, { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'

export default function Report() {
  const [report, setReport] = useState(null)

  // 激活转发 / 分享到朋友圈菜单
  Taro.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  })

  // 分享给好友 / 群聊
  useShareAppMessage(function () {
    return {
      title: '我的健康评估报告：「' + (report ? report.disease || report.title : '健康评估') + '」',
      path: '/pages/index/index'
    }
  })

  // 分享到朋友圈
  useShareTimeline(function () {
    return {
      title: '我的健康评估报告 - 慢病健康指导',
      query: ''
    }
  })

  useEffect(() => {
    // 从全局读取报告数据
    var app = Taro.getApp()
    if (app && app.reportData) {
      setReport(app.reportData)
    } else {
      Taro.showToast({ title: '未找到报告数据', icon: 'none' })
      setTimeout(function () {
        Taro.navigateBack()
      }, 1500)
    }
  }, [])

  // 返回首页
  function goHome() {
    Taro.navigateBack({ delta: 2 })
  }

  if (!report) {
    return (
      <View className="page-container">
        <View className="header">
          <Text className="header-title">📋 健康评估报告</Text>
        </View>
        <View className="content">
          <View className="loading">加载中...</View>
        </View>
      </View>
    )
  }

  var lines = report.content ? report.content.split('\n') : []

  return (
    <View className="page-container">
      {/* Header */}
      <View className="header">
        <View>
          <Text className="header-title">📋 {report.title || '健康评估报告'}</Text>
          {report.symptoms && (
            <View style={{ fontSize: '26rpx', opacity: 0.9, marginTop: '8rpx' }}>
              症状：{report.symptoms.join('、')}
            </View>
          )}
        </View>
      </View>

      {/* 报告内容 */}
      <View className="content">
        <View className="report-card">
          {lines.map(function (line, i) {
            var cls = 'report-para'

            if (line && (line.indexOf('本报告') === 0 || line.indexOf('⚠️') === 0)) {
              cls = 'report-para warning'
            }

            // 标题行（一、二、三、四、五）
            if (line && (
              line.indexOf('一、') === 0 ||
              line.indexOf('二、') === 0 ||
              line.indexOf('三、') === 0 ||
              line.indexOf('四、') === 0 ||
              line.indexOf('五、') === 0
            )) {
              return <Text key={i} className="section-title">{line}</Text>
            }

            // 分隔线
            if (line && line.indexOf('===') === 0) {
              return <View key={i} className="divider" />
            }

            return <Text key={i} className={cls}>{line}</Text>
          })}
        </View>
      </View>

      {/* 底部 */}
      <View className="footer">
        <View className="btn primary" onClick={goHome}>返回首页</View>
      </View>
    </View>
  )
}
