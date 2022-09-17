import Vue, { ComponentOptions } from 'vue'
import { copyReflectionMetadata, reflectionIsSupported } from './reflect'
import { VueClass, DecoratedClass } from './declarations'
import { collectDataFromConstructor } from './data'
import { hasProto, isPrimitive, warn } from './util'

export const $internalHooks = [
  'data',
  'beforeCreate',
  'created',
  'beforeMount',
  'mounted',
  'beforeDestroy',
  'destroyed',
  'beforeUpdate',
  'updated',
  'activated',
  'deactivated',
  'render',
  'errorCaptured', // 2.5
  'serverPrefetch' // 2.6
]

/**
 * 组件工厂函数
 * @param Component 我们所编写的class
 * @param options 组件选项
 * @returns 通过Vue.extends得到的组件
 */
export function componentFactory (
  Component: VueClass<Vue>,
  options: ComponentOptions<Vue> = {}
): VueClass<Vue> {
  options.name = options.name || (Component as any)._componentTag || (Component as any).name
  // prototype props.
  // 获得class上所有在原形上的属性
  const proto = Component.prototype
  // 把这些属性给遍历一遍
  Object.getOwnPropertyNames(proto).forEach(function (key) {
    if (key === 'constructor') {
      return
    }

    // hooks
    // 如果属性名是生命周期钩子名称名，那么就把对应属性值赋到option里
    if ($internalHooks.indexOf(key) > -1) {
      options[key] = proto[key]
      return
    }
    // 获得原型上各个属性描述符
    const descriptor = Object.getOwnPropertyDescriptor(proto, key)!

    // 如果属性值不是undefined
    if (descriptor.value !== void 0) {
      // methods
      /**
       * 如果属性值为函数，那么就把对应属性值赋到option.methods里
       */
      if (typeof descriptor.value === 'function') {
        (options.methods || (options.methods = {}))[key] = descriptor.value
      } else {
        // typescript decorated data
        /**
         * 如果属性值是正常的值，那就通过mixin把原有属性值给混入进去
         *
         * 一般来说，使用class语法，prototype上不会存在属性值
         *
         * 因此准确来说，这里处理一些额外的情况而导致的、使得prototype上出现属性值的改变，例如：
         * 1. 对属性使用了属性装饰器
         * 2. 在外部通过Component.prototype手动更改了原型
         */
        (options.mixins || (options.mixins = [])).push({
          data (this: Vue) {
            return { [key]: descriptor.value }
          }
        })
      }
    } else if (descriptor.get || descriptor.set) {
      /**
       * 如果属性描述符中包含get、set，那么就认为它是计算属性，因此赋值到option.computed里
       *
       * 值得注意的是：使用class语法，prototype上会存在get/set计算属性
       */
      // computed properties
      (options.computed || (options.computed = {}))[key] = {
        get: descriptor.get,
        set: descriptor.set
      }
    }
  })

  // add data hook to collect class properties as Vue instance's data
  // 添加data mixin，以收集类的属性，来作为Vue实例的数据
  ;(options.mixins || (options.mixins = [])).push({
    data (this: Vue) {
      /**
       * 由于使用class语法，prototype上不会存在属性，只存在方法（属性将会在constructor中赋值）：
       *
       * class A {
       *   constructor () {
       *     console.log(this.a, this.b)
       *   }
       *   a = 1
       *   b = 2
       * }
       *
       * 相当于 ->
       *
       * class A {
       *   constructor() {
       *       this.a = 1;
       *       this.b = 2;
       *       console.log(this.a, this.b);
       *   }
       * }
       *
       * 因此要拿到在类中写的属性，就需要将类在下列调用中实例化一次我们通过class定义的类
       */
      // this 为vm，Vue实例（真实实例）
      // Component 为我们通过class定义的类
      return collectDataFromConstructor(this, Component)
    }
  })

  // decorate options
  const decorators = (Component as DecoratedClass).__decorators__
  if (decorators) {
    decorators.forEach(fn => fn(options))
    delete (Component as DecoratedClass).__decorators__
  }

  // find super
  // 查找父类
  const superProto = Object.getPrototypeOf(Component.prototype)
  const Super = superProto instanceof Vue
    ? superProto.constructor as VueClass<Vue>
    : Vue
  const Extended = Super.extend(options)

  // TODO:
  forwardStaticMembers(Extended, Component, Super)

  // 如果支持reflect-metadata，则复制metadata
  if (reflectionIsSupported()) {
    copyReflectionMetadata(Extended, Component)
  }

  // 经过以上一堆操作，就得到了一个被extend后组件类
  return Extended
}

const reservedPropertyNames = [
  // Unique id
  'cid',

  // Super Vue constructor
  'super',

  // Component options that will be used by the component
  'options',
  'superOptions',
  'extendOptions',
  'sealedOptions',

  // Private assets
  'component',
  'directive',
  'filter'
]

const shouldIgnore = {
  prototype: true,
  arguments: true,
  callee: true,
  caller: true
}

/**
 * 转发静态成员
 * @param Extended TODO: 扩展？
 * @param Original TODO: 原始？
 * @param Super TODO: 父类？
 */
function forwardStaticMembers (
  Extended: typeof Vue,
  Original: typeof Vue,
  Super: typeof Vue
): void {
  // We have to use getOwnPropertyNames since Babel registers methods as non-enumerable
  Object.getOwnPropertyNames(Original).forEach(key => {
    // Skip the properties that should not be overwritten
    if (shouldIgnore[key]) {
      return
    }

    // Some browsers does not allow reconfigure built-in properties
    const extendedDescriptor = Object.getOwnPropertyDescriptor(Extended, key)
    if (extendedDescriptor && !extendedDescriptor.configurable) {
      return
    }

    const descriptor = Object.getOwnPropertyDescriptor(Original, key)!

    // If the user agent does not support `__proto__` or its family (IE <= 10),
    // the sub class properties may be inherited properties from the super class in TypeScript.
    // We need to exclude such properties to prevent to overwrite
    // the component options object which stored on the extended constructor (See #192).
    // If the value is a referenced value (object or function),
    // we can check equality of them and exclude it if they have the same reference.
    // If it is a primitive value, it will be forwarded for safety.
    if (!hasProto) {
      // Only `cid` is explicitly exluded from property forwarding
      // because we cannot detect whether it is a inherited property or not
      // on the no `__proto__` environment even though the property is reserved.
      if (key === 'cid') {
        return
      }

      const superDescriptor = Object.getOwnPropertyDescriptor(Super, key)

      if (
        !isPrimitive(descriptor.value) &&
        superDescriptor &&
        superDescriptor.value === descriptor.value
      ) {
        return
      }
    }

    // Warn if the users manually declare reserved properties
    if (
      process.env.NODE_ENV !== 'production' &&
      reservedPropertyNames.indexOf(key) >= 0
    ) {
      warn(
        `Static property name '${key}' declared on class '${Original.name}' ` +
        'conflicts with reserved property name of Vue internal. ' +
        'It may cause unexpected behavior of the component. Consider renaming the property.'
      )
    }

    Object.defineProperty(Extended, key, descriptor)
  })
}
