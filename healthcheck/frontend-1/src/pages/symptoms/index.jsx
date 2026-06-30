import React, { useState, useEffect } from 'react'
import { View, Text, Textarea } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { getSymptoms, generateReport } from '../../utils/api'

export default function Symptoms() {
  const router = useRouter()
  const { diseaseId, diseaseName, diseaseIcon } = router.params

  useDidShow(function () {
    var page = Taro.getCurrentInstance().page
    if (page) {
      page.onShareAppMessage = function () {
        return {
          title: decodeURIComponent(diseaseName || '') + ' ' + (decodeURIComponent(diseaseIcon || '')) + ' - 慢病健康指导',
          path: '/pages/symptoms/index?diseaseId=' + diseaseId + '&diseaseName=' + encodeURIComponent(diseaseName || '') + '&diseaseIcon=' + encodeURIComponent(diseaseIcon || '')
        }
      }
      page.onShareTimeline = function () {
        return {
          title: decodeURIComponent(diseaseName || '') + '健康评估 - 慢病健康指导',
          query: 'diseaseId=' + diseaseId + '&diseaseName=' + diseaseName + '&diseaseIcon=' + diseaseIcon
        }
      }
    }
    Taro.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  })

  const [symptoms, setSymptoms] = useState([])
  const [chosen, setChosen] = useState([])
  const [symptomDetails, setSymptomDetails] = useState({})
  const [loading, setLoading] = useState(true)

  // 加载症状列表
  useEffect(() => {
    getSymptoms(parseInt(diseaseId)).then(function (res) {
      setSymptoms(res)
      setLoading(false)
    }).catch(function (err) {
      Taro.showToast({ title: '加载失败: ' + (err.message || err), icon: 'none', duration: 3000 })
      setLoading(false)
    })
  }, [diseaseId])

  // 切换选中
  function toggle(id) {
    if (chosen.includes(id)) {
      setChosen(chosen.filter(function (s) { return s !== id }))
      setSymptomDetails(function (prev) {
        var newDetails = { ...prev }
        delete newDetails[id]
        return newDetails
      })
    } else {
      setChosen([...chosen, id])
    }
  }

  // 更新症状详情
  function updateDetail(symptomId, detail) {
    setSymptomDetails(function (prev) {
      var newDetails = { ...prev }
      if (detail && detail.trim()) {
        newDetails[symptomId] = detail.trim()
      } else {
        delete newDetails[symptomId]
      }
      return newDetails
    })
  }

  // 生成报告
  function doGenerate() {
    if (chosen.length === 0) {
      Taro.showToast({ title: '请至少选择一个症状', icon: 'none' })
      return
    }
    setLoading(true)

    // 构建症状详情数组
    var symptomDetailsArray = []
    chosen.forEach(function (id) {
      if (symptomDetails[id] && symptomDetails[id].trim()) {
        symptomDetailsArray.push({
          symptomId: id,
          detail: symptomDetails[id].trim()
        })
      }
    })

    var params = {
      disease_id: parseInt(diseaseId),
      selected_symptom_ids: chosen,
      symptom_details: symptomDetailsArray
    }

    generateReport(params).then(function (res) {
      setLoading(false)
      // 将报告数据和生成参数存储到全局，供报告页读取和重新生成
      var app = Taro.getApp()
      app.reportData = res
      app.reportParams = params
      app.reportSymptomNames = symptoms
        .filter(function (s) { return chosen.includes(s.id) })
        .map(function (s) { return { id: s.id, name: s.name } })
      Taro.navigateTo({ url: '/pages/report/index' })
    }).catch(function (err) {
      Taro.showToast({ title: '生成失败: ' + (err.message || err), icon: 'none', duration: 3000 })
      setLoading(false)
    })
  }

  // 返回
  function goBack() {
    Taro.navigateBack()
  }

  return (
    <View className="page-container">
      {/* Header */}
      <View className="header">
        <View>
          <Text className="header-title">{decodeURIComponent(diseaseIcon || '')} {decodeURIComponent(diseaseName || '')}</Text>
        </View>
        <Text className="badge">已选 {chosen.length} 项</Text>
      </View>

      {/* 症状列表 */}
      <View className="content">
        {loading ? (
          <View className="loading">加载中...</View>
        ) : (
          symptoms.map(function (s) {
            var active = chosen.includes(s.id) ? 'active' : ''
            var detail = symptomDetails[s.id] || ''

            return (
              <View key={s.id} className="symptom-wrapper">
                {/* 症状选项 */}
                <View
                  className={'symptom-item ' + active}
                  onClick={function () { toggle(s.id) }}
                >
                  <View className="symptom-info">
                    <Text className="symptom-name">{s.name}</Text>
                    {s.desc && <Text className="symptom-desc">{s.desc}</Text>}
                  </View>
                  <View className={'checkbox ' + (chosen.includes(s.id) ? 'checked' : '')}>
                    {chosen.includes(s.id) ? '✓' : ''}
                  </View>
                </View>

                {/* 详情输入框 */}
                {chosen.includes(s.id) && (
                  <View className="detail-input-wrapper">
                    <View className="quick-templates">
                      <Text className="quick-tag" onClick={function () { updateDetail(s.id, '持续约1周，每天都有') }}>持续约1周</Text>
                      <Text className="quick-tag" onClick={function () { updateDetail(s.id, '症状较重，影响正常工作生活') }}>症状较重</Text>
                      <Text className="quick-tag" onClick={function () { updateDetail(s.id, '时好时坏，发作时难以忍受') }}>时好时坏</Text>
                      <Text className="quick-tag" onClick={function () { updateDetail(s.id, '已持续3个月以上') }}>持续3个月以上</Text>
                    </View>
                    <Textarea
                      className="detail-textarea"
                      placeholder={'请详细描述「' + s.name + '」的症状（如：持续时间、频率、严重程度等）'}
                      value={detail}
                      onInput={function (e) { updateDetail(s.id, e.detail.value) }}
                      maxlength={500}
                    />
                    <Text className="char-count">{detail.length}/500</Text>
                  </View>
                )}
              </View>
            )
          })
        )}
      </View>

      {/* 底部操作 */}
      <View className="footer">
        <View className="footer-info">
          <Text>已选 {chosen.length} 个症状</Text>
          {Object.keys(symptomDetails).length > 0 && (
            <Text className="detail-info">已补充 {Object.keys(symptomDetails).length} 项详情</Text>
          )}
        </View>
        <View className="footer-buttons">
          <View className="btn" onClick={goBack}>返回</View>
          <View className={'btn primary' + (loading ? ' disabled' : '')} onClick={doGenerate}>
            {loading ? '生成中...' : '生成报告'}
          </View>
        </View>
      </View>
    </View>
  )
}
