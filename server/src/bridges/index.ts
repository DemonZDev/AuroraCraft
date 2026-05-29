import type { BridgeInterface } from './types.js'
import { OpenCodeBridge } from './opencode.js'
import { KiroBridge } from './kiro.js'
import { processManager } from './opencode-process-manager.js'
import { kiroProcessManager } from './kiro-process-manager.js'
import { litellmProcessManager } from './litellm-process-manager.js'
import { sessionEventBus } from './session-event-bus.js'

class BridgeRegistry {
  private bridges = new Map<string, BridgeInterface>()

  register(bridge: BridgeInterface) {
    this.bridges.set(bridge.name, bridge)
  }

  get(name: string): BridgeInterface | undefined {
    return this.bridges.get(name)
  }

  getDefault(): BridgeInterface | undefined {
    // Return the first available bridge, or first bridge overall
    const available = this.getAvailable()
    return available.length > 0 ? available[0] : this.bridges.values().next().value
  }

  getAvailable(): BridgeInterface[] {
    return Array.from(this.bridges.values()).filter((b) => b.isAvailable())
  }

  getAll(): BridgeInterface[] {
    return Array.from(this.bridges.values())
  }
}

export const bridgeRegistry = new BridgeRegistry()

// Register built-in bridges
export const opencodeBridge = new OpenCodeBridge()
bridgeRegistry.register(opencodeBridge)

export const kiroBridge = new KiroBridge()
bridgeRegistry.register(kiroBridge)

// Graceful shutdown: stop all bridge processes
process.on('SIGTERM', () => {
  processManager.shutdown().catch(() => {})
  kiroProcessManager.shutdown()
  litellmProcessManager.shutdown().catch(() => {})
})
process.on('SIGINT', () => {
  processManager.shutdown().catch(() => {})
  kiroProcessManager.shutdown()
  litellmProcessManager.shutdown().catch(() => {})
})

export { processManager, kiroProcessManager, litellmProcessManager, sessionEventBus }
export type { BridgeInterface, BridgeTask, BridgeResult, BridgeStreamEvent, MessagePart, TodoItem, StreamEvent, StreamTodoItem } from './types.js'
export { SubscriptionManager } from './opencode.js'
