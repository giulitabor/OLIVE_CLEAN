import { program } from "./connection";
import { getConfigPda } from "./pda";

export async function fetchConfig() {
  const [configPda] = getConfigPda();
  return await program.account.globalConfig.fetch(configPda);
}

export async function fetchAllFields() {
  return await program.account.field.all();
}

export async function fetchAllTrees() {
  return await program.account.tree.all();
}

export async function fetchAllTreePositions() {
  return await program.account.treePosition.all();
}

export async function fetchAllRevenueEpochs() {
  return await program.account.revenueEpoch.all();
}
