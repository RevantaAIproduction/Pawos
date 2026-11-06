import { NextResponse } from "next/server";
import { ToolError } from "../connectedTools/tools";
import { WebCapabilityError } from "../webPolicy/webCapabilities";
import { AutonomousError } from "./localAutonomous";

/** One response shape for the Autonomous Work routes; never leaks an internal error. */
export function autonomousFailure(error: unknown): NextResponse {
  if (error instanceof AutonomousError || error instanceof ToolError) return NextResponse.json({ ok: false, code: error.code, message: error.message, ...error.extra }, { status: error.status });
  if (error instanceof WebCapabilityError) return NextResponse.json({ ok: false, code: "capability_locked", message: error.message, capability: error.capability }, { status: 403 });
  console.error("[autonomous] unexpected failure");
  return NextResponse.json({ ok: false, code: "failed", message: "Something went wrong. Please try again." }, { status: 500 });
}
