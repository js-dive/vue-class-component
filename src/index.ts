import Vue, { ComponentOptions } from 'vue'
import { VueClass } from './declarations'
import { componentFactory, $internalHooks } from './component'

export { createDecorator, VueDecorator, mixins } from './util'

/**
 * Component 装饰器入口
 *
 * vue-class-component实质：
 * 将class风格组件中的类成员转换为vue组件option中对应的内容，并最终使用Vue.extends来获得组件构造函数
 * —— 因此最终用于构造组件的是通过Vue.extends获得的组件函数，而不是我们定义的class
 * @param options Vue options
 */
function Component <V extends Vue>(options: ComponentOptions<V> & ThisType<V>): <VC extends VueClass<V>>(target: VC) => VC
function Component <VC extends VueClass<Vue>>(target: VC): VC
function Component (options: ComponentOptions<Vue> | VueClass<Vue>): any {
  if (typeof options === 'function') {
    return componentFactory(options)
  }
  return function (Component: VueClass<Vue>) {
    return componentFactory(Component, options)
  }
}

Component.registerHooks = function registerHooks (keys: string[]): void {
  $internalHooks.push(...keys)
}

export default Component
