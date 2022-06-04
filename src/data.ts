import Vue from 'vue'
import { VueClass } from './declarations'
import { warn } from './util'

/**
 * 从构造函数收集data
 * @param vm Vue实例（真实实例）
 * @param Component 我们通过class定义的类
 * @returns 纯数据
 */
export function collectDataFromConstructor (vm: Vue, Component: VueClass<Vue>) {
  // override _init to prevent to init as Vue instance
  /**
   * 我们这里仅仅是获取data，不需要进行其他操作。因此，首先我们：
   *
   * 覆盖类中原有的_init方法并暂存，避免被实例化为一个Vue实例
   *
   * _init中包含有真实的组件生成、挂载逻辑，我们这里只需要取到data，不需要做更多的事情
   */
  const originalInit = Component.prototype._init
  Component.prototype._init = function (this: Vue) {
    /**
     * Component.prototype._init函数中的this指向我们通过class定义的类的实例
     */
    // proxy to actual vm
    // 获取vm上的key；这些key将会被以代理到真实的vm上
    const keys = Object.getOwnPropertyNames(vm)
    // 2.2.0 compat (props are no longer exposed as self properties)
    // TODO: ???
    if (vm.$options.props) {
      for (const key in vm.$options.props) {
        if (!vm.hasOwnProperty(key)) {
          keys.push(key)
        }
      }
    }
    // 将Vue实例（真实实例）中的key赋值给class定义的类的实例
    /**
     * TODO: 看起来这是collectDataFromConstructor的副作用？
     */
    keys.forEach(key => {
      Object.defineProperty(this, key, {
        get: () => vm[key],
        set: value => { vm[key] = value },
        configurable: true
      })
    })
  }

  // should be acquired class property values
  // 通过实例化组件，来获得data
  // new 流程中会调用上方覆写掉的 _init
  const data = new Component()

  // restore original _init to avoid memory leak (#209)
  // 恢复原始 _init 来避免内存泄露
  Component.prototype._init = originalInit

  // create plain data object
  // 建立一个纯的、用于存储data的对象
  const plainData = {}
  Object.keys(data).forEach(key => {
    if (data[key] !== undefined) {
      plainData[key] = data[key]
    }
  })

  if (process.env.NODE_ENV !== 'production') {
    if (!(Component.prototype instanceof Vue) && Object.keys(plainData).length > 0) {
      warn(
        'Component class must inherit Vue or its descendant class ' +
        'when class property is used.'
      )
    }
  }

  return plainData
}
