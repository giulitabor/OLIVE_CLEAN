// portfolio.ts

import { sb } from "./supabase"; // <-- adjust
import { Wallet, getTrees, getAllPositions } from "./dashboard"; // <-- adjust

export interface PortfolioTree {
  treeId: string;
  sharesOwned: number;
  ownershipPercent: number;
  guardian: boolean;

  tree: any;
  metadata: any;
}

export interface Portfolio {
  wallet: string;
  olvBalance: number;

  totalTrees: number;
  totalShares: number;

  trees: PortfolioTree[];
}

export async function loadPortfolio(): Promise<Portfolio> {

  //---------------------------------------------------------
  // Connected wallet
  //---------------------------------------------------------

  const wallet = Wallet();

  if (!wallet)
    throw new Error("Wallet not connected.");

  //---------------------------------------------------------
  // Load everything in parallel
  //---------------------------------------------------------

  const [positions, trees, metaResult] = await Promise.all([

    getAllPositions(),

    getTrees(),

    sb
      .from("tree_metadata")
      .select("*")

  ]);

  if (metaResult.error)
    throw metaResult.error;

  const metadata = metaResult.data ?? [];

  //---------------------------------------------------------
  // Build lookup maps
  //---------------------------------------------------------

  const treeMap = new Map<string, any>();

  for (const t of trees) {

    treeMap.set(
      String(t.account.treeId),
      t
    );

  }

  const metadataMap = new Map<string, any>();

  for (const row of metadata) {

    metadataMap.set(
      String(row.tree_id),
      row
    );

  }

  //---------------------------------------------------------
  // Filter positions for connected wallet
  //---------------------------------------------------------

  const myPositions = positions.filter(

    p =>

      p.account.owner.toBase58() === wallet &&
      p.account.sharesOwned.toNumber() > 0

  );

  //---------------------------------------------------------
  // Merge
  //---------------------------------------------------------

  const ownedTrees: PortfolioTree[] = myPositions.map(position => {

    const treeId = String(position.account.treeId);

    const tree = treeMap.get(treeId);

    const meta = metadataMap.get(treeId);

    const sharesOwned =
      position.account.sharesOwned.toNumber();

    const totalShares =
      tree?.account?.totalShares?.toNumber?.() ??
      meta?.total_shares ??
      1000;

    return {

      treeId,

      sharesOwned,

      ownershipPercent:
        totalShares > 0
          ? (sharesOwned / totalShares) * 100
          : 0,

      guardian:
        position.account.isGuardian,

      tree,

      metadata: meta

    };

  });

  //---------------------------------------------------------
  // Totals
  //---------------------------------------------------------

  const totalShares = ownedTrees.reduce(

    (sum, t) => sum + t.sharesOwned,

    0

  );

  //---------------------------------------------------------
  // OLV balance
  //---------------------------------------------------------
  // We'll wire this up next.
  //---------------------------------------------------------

  const olvBalance = 0;

  //---------------------------------------------------------
  // Debug
  //---------------------------------------------------------

  console.log("========== PORTFOLIO ==========");

  console.log("Wallet:", wallet);

  console.log("Trees Owned:", ownedTrees.length);

  console.log("Shares:", totalShares);

  console.table(

    ownedTrees.map(t => ({

      Tree: t.treeId,

      Shares: t.sharesOwned,

      Guardian: t.guardian,

      Variety: t.metadata?.variety,

      Health: t.metadata?.health_score

    }))

  );

  //---------------------------------------------------------
  // Return
  //---------------------------------------------------------

  return {

    wallet,

    olvBalance,

    totalTrees: ownedTrees.length,

    totalShares,

    trees: ownedTrees

  };

}
