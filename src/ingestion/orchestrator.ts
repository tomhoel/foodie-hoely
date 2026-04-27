/**
 * Orchestrator — single registry of all IngestionAdapters.
 *
 * Callers ask for an adapter by name OR by (chain, capability) routing key.
 * Enforces the source-of-truth invariant from spec §3:
 * each (chain, capability) combo has exactly one adapter.
 *
 * No adapter ever calls another adapter; they all go through this registry
 * if cross-source data is ever needed (rare — usually a DB query suffices).
 */

import type { AdapterCapability, ChainCode, IngestionAdapter } from './adapter.interface';

export class Orchestrator {
  private byName = new Map<string, IngestionAdapter>();
  private routes = new Map<string, IngestionAdapter>();

  register(adapter: IngestionAdapter): void {
    if (this.byName.has(adapter.name)) {
      throw new Error(`Adapter "${adapter.name}" is already registered`);
    }
    for (const chain of adapter.chains) {
      for (const capability of adapter.capabilities) {
        const key = this.routeKey(chain, capability);
        const existing = this.routes.get(key);
        if (existing) {
          throw new Error(
            `Route (${chain}, ${capability}) is already registered to "${existing.name}", ` +
              `cannot register "${adapter.name}" for the same combo. ` +
              `See spec §3 source-of-truth matrix.`
          );
        }
        this.routes.set(key, adapter);
      }
    }
    this.byName.set(adapter.name, adapter);
  }

  getByName(name: string): IngestionAdapter | undefined {
    return this.byName.get(name);
  }

  routeFor(chain: ChainCode, capability: AdapterCapability): IngestionAdapter | undefined {
    return this.routes.get(this.routeKey(chain, capability));
  }

  listAdapters(): IngestionAdapter[] {
    return Array.from(this.byName.values());
  }

  private routeKey(chain: ChainCode, capability: AdapterCapability): string {
    return `${chain}::${capability}`;
  }
}
