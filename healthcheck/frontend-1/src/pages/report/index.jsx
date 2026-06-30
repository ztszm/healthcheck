import React, { useState, useEffect, useRef } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { generateReport } from '../../utils/api'

export default function Report() {
  const [report, setReport] = useState(null)
  // 聊天消息列表 [{ role: 'ai'|'user', content, time }]
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)
  // 原始报告生成参数，后续追问时带上
  const [baseParams, setBaseParams] = useState(null)

  useDidShow(function () {
    var page = Taro.getCurrentInstance().page
    if (page) {
      page.onShareAppMessage = function () {
        var title = report
          ? '我的健康评估报告：' + (report.title || '健康报告')
          : '慢病健康指导 - 智能健康评估'
        return { title: title, path: '/pages/index/index' }
      }
      page.onShareTimeline = function () {
        return { title: '我的健康评估报告 - 慢病健康指导', query: '' }
      }
    }
    Taro.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  })

  useEffect(function () {
    var app = Taro.getApp()
    if (app && app.reportData) {
      setReport(app.reportData)
      // 保存原始生成参数，后续追问时复用
      setBaseParams(app.reportParams || {})
      // 初始化消息：报告作为第一条 AI 消息
      var firstMsg = {
        role: 'ai',
        content: app.reportData.content || '',
        title: app.reportData.title || '健康评估报告',
        time: formatTime(new Date())
      }
      setMessages([firstMsg])
    } else {
      Taro.showToast({ title: '未找到报告数据', icon: 'none' })
      setTimeout(function () { Taro.navigateBack() }, 1500)
    }
  }, [])

  // 格式化时间
  function formatTime(date) {
    var h = date.getHours()
    var m = date.getMinutes()
    return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m)
  }

  // 发送消息 - 调 /api/reports，把聊天历史也带上
  function doSend() {
    var text = inputValue.trim()
    if (!text || sending) return

    setInputValue('')
    setSending(true)

    var now = new Date()

    // 添加用户消息
    var userMsg = { role: 'user', content: text, time: formatTime(now) }
    var updatedMessages = messages.concat(userMsg)
    setMessages(updatedMessages)

    // 提取纯文本对话历史
    var chatHistory = updatedMessages.map(function (m) {
      return { role: m.role, content: m.content }
    })

    // 用 baseParams 为基础，追加 chat_history
    var params = Object.assign({}, baseParams, {
      chat_history: chatHistory
    })

    generateReport(params).then(function (res) {
      setSending(false)
      var replyContent = res.content || res.reply || '抱歉，暂时无法回复。'
      var aiMsg = { role: 'ai', content: replyContent, time: formatTime(new Date()) }
      setMessages(function (prev) { return prev.concat(aiMsg) })
      // 更新报告数据（保持最新）
      setReport(res)
      scrollToBottom()
    }).catch(function (err) {
      setSending(false)
      var errMsg = { role: 'ai', content: '网络错误，请稍后重试。', time: formatTime(new Date()) }
      setMessages(function (prev) { return prev.concat(errMsg) })
    })
  }

  // 滚动到底部
  function scrollToBottom() {
    setTimeout(function () {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 99999
      }
    }, 100)
  }

  // 输入框回车
  function handleConfirm() {
    doSend()
  }

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
        <View className="content"><View className="loading">加载中...</View></View>
      </View>
    )
  }

  return (
    <View className="page-container">
      {/* 紧凑头部 */}
      <View className="chat-header">
        <View className="chat-header-left">
          <Text className="chat-back" onClick={goHome}>‹ 返回</Text>
          <Text className="chat-header-title">{report.title || '健康评估报告'}</Text>
        </View>
        {report.symptoms && (
          <Text className="chat-header-tags">{report.symptoms.slice(0, 3).join(' · ')}</Text>
        )}
      </View>

      {/* 聊天消息区域 */}
      <ScrollView
        className="chat-body"
        scrollY
        scrollWithAnimation
        ref={scrollRef}
        onContentSizeChange={scrollToBottom}
      >
        <View className="chat-messages">
          {messages.map(function (msg, i) {
            var isAi = msg.role === 'ai'
            // 第一条 AI 消息展示为报告卡片
            var isReport = isAi && i === 0 && msg.title
            return (
              <View key={i} className={'chat-bubble-row ' + (isAi ? 'ai-row' : 'user-row')}>
                {/* AI 头像 */}
                {isAi && (
                  <View className="chat-avatar ai-avatar">🤖</View>
                )}
                <View className={'chat-bubble-wrapper ' + (isAi ? 'ai-wrapper' : 'user-wrapper')}>
                  {isReport ? (
                    // 报告卡片样式
                    <View className="chat-bubble report-bubble">
                      <View className="report-bubble-title">{msg.title}</View>
                      <View className="report-bubble-divider" />
                      {msg.content.split('\n').map(function (line, li) {
                        if (line && line.indexOf('===') === 0) {
                          return <View key={li} className="report-bubble-dash" />
                        }
                        if (line && (
                          line.indexOf('一、') === 0 ||
                          line.indexOf('二、') === 0 ||
                          line.indexOf('三、') === 0 ||
                          line.indexOf('四、') === 0 ||
                          line.indexOf('五、') === 0
                        )) {
                          return <Text key={li} className="report-bubble-h3">{line}</Text>
                        }
                        var isWarn = line && (line.indexOf('本报告') === 0 || line.indexOf('⚠️') === 0)
                        return (
                          <Text key={li} className={'report-bubble-line' + (isWarn ? ' warn' : '')}>
                            {line}
                          </Text>
                        )
                      })}
                    </View>
                  ) : (
                    <View className={'chat-bubble ' + (isAi ? 'ai-bubble' : 'user-bubble')}>
                      <Text className="chat-bubble-text">{msg.content}</Text>
                    </View>
                  )}
                  <Text className="chat-time">{msg.time}</Text>
                </View>
                {/* 用户头像 */}
                {!isAi && (
                  <View className="chat-avatar user-avatar">👤</View>
                )}
              </View>
            )
          })}

          {/* 发送中 loading */}
          {sending && (
            <View className="chat-bubble-row ai-row">
              <View className="chat-avatar ai-avatar">🤖</View>
              <View className="chat-bubble-wrapper ai-wrapper">
                <View className="chat-bubble ai-bubble typing">
                  <View className="typing-dot" />
                  <View className="typing-dot" />
                  <View className="typing-dot" />
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 底部输入栏 */}
      <View className="chat-input-bar">
        <View className="chat-input-wrapper">
          <Input
            className="chat-input"
            placeholder="对报告有疑问？在此追问…"
            value={inputValue}
            onInput={function (e) { setInputValue(e.detail.value) }}
            onConfirm={handleConfirm}
            confirmType="send"
            maxlength={500}
            adjustPosition
          />
          <View
            className={'chat-send-btn' + (inputValue.trim() && !sending ? ' active' : '')}
            onClick={doSend}
          >
            发送
          </View>
        </View>
      </View>
    </View>
  )
}
