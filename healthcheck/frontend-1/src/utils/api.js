// ========== 通用微信云托管 callContainer 请求 ==========
function callContainer(path, method, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: 'cloud1-d1g1vvlxna9e01dc4' },
      path: path,
      method: method,
      header: {
        'X-WX-SERVICE': 'health-backend',
        'Content-Type': 'application/json'
      },
      data: data,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error('HTTP ' + res.statusCode))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络错误'))
      }
    })
  })
}

/**
 * 获取所有疾病列表
 */
export function getDiseases() {
  return callContainer('/api/diseases', 'GET')
}

/**
 * 获取指定疾病的症状列表
 */
export function getSymptoms(diseaseId) {
  return callContainer('/api/diseases/' + diseaseId + '/symptoms', 'GET')
}

/**
 * 生成健康报告
 */
export function generateReport(params) {
  return callContainer('/api/reports', 'POST', params)
}

export default {
  getDiseases,
  getSymptoms,
  generateReport
}
