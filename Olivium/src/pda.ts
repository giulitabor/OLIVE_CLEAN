import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./connection";

export function getConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID
  );
}

export function getFieldPda(authority: PublicKey, name: string) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("field"), authority.toBuffer(), Buffer.from(name)],
    PROGRAM_ID
  );
}

export function getTreePda(field: PublicKey, treeId: string) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tree"), field.toBuffer(), Buffer.from(treeId)],
    PROGRAM_ID
  );
}
