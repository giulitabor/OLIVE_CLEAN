// src/init.ts
import { Program } from "@coral-xyz/anchor";

export async function waitForProgram(timeout = 10000): Promise<Program> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const program = (window as any)._program;
    if (program) {
      console.log("[INIT] Program found");
      return program;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error("Program initialization timeout");
}

export async function waitForConnection(timeout = 10000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const provider = (window as any)._provider;
    const program = (window as any)._program;
    if (provider && program) {
      console.log("[INIT] Connection ready");
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return false;
}
