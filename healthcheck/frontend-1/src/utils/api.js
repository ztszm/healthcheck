import Taro from '@tarojs/taro'

// ========== 本地开发 VS 云托管切换 ==========
// 由构建命令自动决定：npm run dev:weapp → localhost，npm run build:weapp → 云托管
var API_MODE = __API_MODE__

// 本地后端地址（根据实际情况修改端口）
var LOCAL_BASE = 'http://localhost:8080'

// 云托管配置
var CLOUD_ENV = 'cloud1-d1g1vvlxna9e01dc4'
var CLOUD_SERVICE = 'health-backend'

function request(path, method, data) {
  if (API_MODE === 'local') {
    // 本地开发：直接用 Taro.request
    return Taro.request({
      url: LOCAL_BASE + path,
      method: method,
      data: data,
      header: { 'Content-Type': 'application/json' }
    }).then(function (res) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return res.data
      }
      throw new Error('HTTP ' + res.statusCode)
    })
  } else {
    // 云托管：用 callContainer
    return new Promise(function (resolve, reject) {
      wx.cloud.callContainer({
        config: { env: CLOUD_ENV },
        path: path,
        method: method,
        header: {
          'X-WX-SERVICE': CLOUD_SERVICE,
          'Content-Type': 'application/json'
        },
        data: data,
        success: function (res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
          } else {
            reject(new Error('HTTP ' + res.statusCode))
          }
        },
        fail: function (err) {
          reject(new Error(err.errMsg || '网络错误'))
        }
      })
    })
  }
}

/**
 * 获取所有疾病列表
 */
export function getDiseases() {
  return request('/api/diseases', 'GET')
}

/**
 * 获取指定疾病的症状列表
 */
export function getSymptoms(diseaseId) {
  return request('/api/diseases/' + diseaseId + '/symptoms', 'GET')
}

/**
 * 生成健康报告
 */
export function generateReport(params) {
  return request('/api/reports', 'POST', params)
}

/**
 * 发送对话消息（在已有报告基础上追问）
 * @param {object} params - { message: string, disease_id: number, history: array }
 */
export function chatMessage(params) {
  return request('/api/reports', 'POST', params)
}

export default {
  getDiseases,
  getSymptoms,
  generateReport,
  chatMessage
}
