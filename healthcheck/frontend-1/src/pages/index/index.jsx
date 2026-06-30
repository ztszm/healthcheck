import React, { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

export default function Index() {
  useDidShow(function () {
    var page = Taro.getCurrentInstance().page
    if (page) {
      page.onShareAppMessage = function () {
        return {
          title: '慢病健康指导 - 选择疾病，获取个性化健康建议',
          path: '/pages/index/index'
        }
      }
      page.onShareTimeline = function () {
        return {
          title: '慢病健康指导 - 智能健康评估工具',
          query: ''
        }
      }
    }
    // 激活分享菜单
    Taro.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  })

  const [diseases, setDiseases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(function () {
    getDiseases().then(function (res) {
        setDiseases(res.data)
        setLoading(false)
      }).catch(function (err) {
        setError('网络失败: ' + (err.errMsg || JSON.stringify(err)))
        setLoading(false)
      })
    }, [diseaseId])
 

  function selectDisease(d) {
    Taro.navigateTo({
      url: '/pages/symptoms/index?diseaseId=' + d.id + '&diseaseName=' + encodeURIComponent(d.name) + '&diseaseIcon=' + encodeURIComponent(d.icon)
    })
  }

  return (
    <View className="page-container">
      <View className="header">
        <View>
          <Text className="header-title">慢病健康指导</Text>
        </View>
      </View>

      <View className="content">
        {loading && !error && <View className="loading">加载中...</View>}
        {error && <View className="error" style="color:#e74c3c">❌ {error}</View>}
        {!loading && !error && diseases.length === 0 && <View className="empty">暂无数据</View>}
        {diseases.map(function (d) {
          return (
            <View key={d.id} className="disease-card" onClick={function () { selectDisease(d) }}>
              <Text className="icon">{d.icon}</Text>
              <View className="info">
                <View className="name">{d.name}</View>
                <View className="desc">{d.desc}</View>
              </View>
              <Text className="arrow">›</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
