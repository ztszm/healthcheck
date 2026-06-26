import React, { Component } from 'react'
import './app.scss'
import Taro from '@tarojs/taro'
Taro.cloud.init({
  env: 'cloud1-d1g1vvlxna9e01dc4',
  traceUser: true
})
class App extends Component {
  componentDidMount() {
    wx.cloud.init({ env: 'cloud1-d1g1vvlxna9e01dc4' })
  }

  render() {
    return this.props.children
  }
}

export default App
