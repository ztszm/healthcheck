import React, { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

export default function Index() {
  const [diseases, setDiseases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(function () {
    async function fetchData() {
      try {
        const res = await wx.cloud.callContainer({
            config: {
              env: "cloud1-d1g1vvlxna9e01dc4" // 与小程序已关联的云开发环境 ID
            },
            path: "/api/diseases", // 业务自定义路径，根目录为 /
            method: "GET", // 依业务选择
            header: {
              "X-WX-SERVICE": "health-backend" // 云托管服务名称
              // 其他 header
            }
        })
        console.log('当前请求头:', {
            'X-WX-SERVICE': 'health-backend'
          });
        if (res.statusCode === 200) {
          setDiseases(res.data)
          setLoading(false)
        } else {
          setError('HTTP ' + res.statusCode)
          setLoading(false)
        }
      } catch (err) {
        setError('网络失败: ' + (err.errMsg || JSON.stringify(err)))
        setLoading(false)
      }
    }
    fetchData()
    console.log('当前请求头:', {
        'X-WX-SERVICE': 'health-backend'
    });
  }, [])

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
