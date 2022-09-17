import Vue, { VueConstructor } from 'vue'
import { VueClass } from './declarations'

// The rational behind the verbose Reflect-feature check below is the fact that there are polyfills
// which add an implementation for Reflect.defineMetadata but not for Reflect.getOwnMetadataKeys.
// Without this check consumers will encounter hard to track down runtime errors.
export function reflectionIsSupported () {
  return typeof Reflect !== 'undefined' && Reflect.defineMetadata && Reflect.getOwnMetadataKeys
}

export function copyReflectionMetadata (
  to: VueConstructor,
  from: VueClass<Vue>
) {
  // 转发组件构造函数（相当于类）的metadata
  forwardMetadata(to, from)

  // 转发原型上的metadata
  Object.getOwnPropertyNames(from.prototype).forEach(key => {
    forwardMetadata(to.prototype, from.prototype, key)
  })

  // TODO: 转发类静态方法的metadata？
  Object.getOwnPropertyNames(from).forEach(key => {
    forwardMetadata(to, from, key)
  })
}

function forwardMetadata (to: object, from: object, propertyKey?: string): void {
  const metaKeys = propertyKey
    ? Reflect.getOwnMetadataKeys(from, propertyKey)
    : Reflect.getOwnMetadataKeys(from)

  metaKeys.forEach(metaKey => {
    const metadata = propertyKey
      ? Reflect.getOwnMetadata(metaKey, from, propertyKey)
      : Reflect.getOwnMetadata(metaKey, from)

    if (propertyKey) {
      Reflect.defineMetadata(metaKey, metadata, to, propertyKey)
    } else {
      Reflect.defineMetadata(metaKey, metadata, to)
    }
  })
}
