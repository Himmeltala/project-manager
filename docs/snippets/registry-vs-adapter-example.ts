/*
 * @Author: zhengrenfu
 * @Date: 2026-07-27
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-27 22:24:05
 * @FilePath: \docs\snippets\registry-vs-adapter-example.ts
 * @Description: 注册表模式 vs 适配器模式 对比示例
 */

// 注册表模式
interface Logger {
  readonly name: string
  log(msg: string): void
}

class ConsoleLogger implements Logger {
  readonly name = 'console'
  log(msg: string) {
    console.log(msg)
  }
}

class FileLogger implements Logger {
  readonly name = 'file'
  log(msg: string) {
    /* write to file */
  }
}

class LoggerRegistry {
  private providers = new Map<string, Logger>()

  register(p: Logger) {
    this.providers.set(p.name, p)
  }

  /** 根据配置选一个 */
  get(name: string): Logger | undefined {
    return this.providers.get(name)
  }
}

// 使用：业务代码根据条件选一个实现
const loggerReg = new LoggerRegistry()
loggerReg.register(new ConsoleLogger())
loggerReg.register(new FileLogger())

// loggerReg.get('console') > 选哪个，不改业务代码

// 适配器模式

// 三个不同工具的原始 API
class StripeSDK {
  charge(amount: number, token: string) {
    return `stripe:${amount}`
  }
}

class WechatPaySDK {
  unifiedOrder(amount: number, openId: string) {
    return `wechat:${amount}`
  }
}

class AlipaySDK {
  tradeCreate(amount: number, buyerId: string) {
    return `alipay:${amount}`
  }
}

// 适配器：统一接口
interface PaymentAdapter {
  readonly name: string
  pay(amount: number, account: string): string
}

class StripeAdapter implements PaymentAdapter {
  readonly name = 'stripe'
  private sdk = new StripeSDK()

  pay(amount: number, account: string): string {
    return this.sdk.charge(amount, account)
  }
}

class WechatAdapter implements PaymentAdapter {
  readonly name = 'wechat'
  private sdk = new WechatPaySDK()

  pay(amount: number, account: string): string {
    return this.sdk.unifiedOrder(amount, account)
  }
}

class AlipayAdapter implements PaymentAdapter {
  readonly name = 'alipay'
  private sdk = new AlipaySDK()

  pay(amount: number, account: string): string {
    return this.sdk.tradeCreate(amount, account)
  }
}

// 使用：业务代码只看 PaymentAdapter，不关心具体 SDK
function checkout(adapter: PaymentAdapter, amount: number, account: string) {
  return adapter.pay(amount, account) // 统一调用，不管背后是 Stripe 还是微信
}

// 两种模式配合
// 注册表先选适配器，再走统一接口
class PaymentRegistry {
  private adapters = new Map<string, PaymentAdapter>()

  register(a: PaymentAdapter) {
    this.adapters.set(a.name, a)
  }

  /** 根据用户选择的支付方式返回对应适配器 */
  get(name: string): PaymentAdapter | undefined {
    return this.adapters.get(name)
  }
}

const paymentReg = new PaymentRegistry()
paymentReg.register(new StripeAdapter())
paymentReg.register(new WechatAdapter())
paymentReg.register(new AlipayAdapter())

// 用户选了微信支付 > registry 查出适配器 > 统一接口调用
const adapter = paymentReg.get('wechat')!
checkout(adapter, 100, 'user_open_id')
