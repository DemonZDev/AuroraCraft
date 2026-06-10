import type { BridgeInterface } from './types.js'
import { OpenCodeBridge } from './opencode.js'
import { processManager } from './opencode-process-manager.js'
import { litellmProcessManager } from './litellm-process-manager.js'

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

// Graceful shutdown: stop all bridge processes
process.on('SIGTERM', () => {
  processManager.shutdown().catch(() => {})
  litellmProcessManager.shutdown().catch(() => {})
})
process.on('SIGINT', () => {
  processManager.shutdown().catch(() => {})
  litellmProcessManager.shutdown().catch(() => {})
})

export { processManager, litellmProcessManager }
export type { BridgeInterface, BridgeTask, BridgeResult, BridgeStreamEvent, MessagePart, TodoItem, StreamEvent, StreamTodoItem } from './types.js'
export { SubscriptionManager } from './opencode.js'
