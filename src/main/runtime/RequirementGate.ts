import type { ActionResult } from '../../shared/actions/ActionTypes';
import type { ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';
import type { Requirement, RequirementKind, RequirementResolution } from '../../shared/runtime/RequirementTypes';

export interface RequirementResolver<K extends RequirementKind = RequirementKind> {
  kind: K;
  resolve(requirement: Extract<Requirement, { kind: K }>, ctx: { scope?: ConnectivityScope }): Promise<RequirementResolution>;
}

/**
 * The runtime's general requirement-resolution engine. Contains zero requirement-kind-specific
 * logic itself — it only dispatches to whichever resolver is registered for a given `kind`.
 * Today exactly one resolver is registered (CapabilityRequirementResolver, from the Connectivity
 * Runtime). Adding a future kind (confirmation/approval/selection/etc.) means writing one more
 * resolver and registering it here, never touching this class.
 */
class RequirementGate {
  private resolvers = new Map<RequirementKind, RequirementResolver>();

  registerResolver(resolver: RequirementResolver): void {
    this.resolvers.set(resolver.kind, resolver);
  }

  /**
   * Resolves every requirement in order and returns the first unsatisfied one's blocking
   * ActionResult, or null once all are satisfied. Throws if a requirement's kind has no
   * registered resolver, rather than silently letting it through.
   *
   * Combining several simultaneously-unsatisfied requirements into one batched ask is deferred
   * until a real call site actually passes more than one requirement at a time — none does yet,
   * so no merge logic is built speculatively here.
   */
  async check(requirements: Requirement[], ctx: { scope?: ConnectivityScope }): Promise<ActionResult | null> {
    for (const requirement of requirements) {
      const resolver = this.resolvers.get(requirement.kind);
      if (!resolver) {
        throw new Error(`RequirementGate: no resolver registered for requirement kind "${requirement.kind}".`);
      }
      const resolution = await resolver.resolve(requirement, ctx);
      if (!resolution.satisfied) {
        return resolution.blockingResult ?? { ok: false, reason: 'failed', message: `Requirement "${requirement.kind}" is not satisfied.` };
      }
    }
    return null;
  }
}

export const requirementGate = new RequirementGate();
