import { useEffect, useState } from "react";
import { makeConnection } from "../../lib/rpc";
import { fetchOnchainMeta } from "../../lib/tokens";
import type { Snapshot } from "../../lib/types";
import { usePortfolio } from "../balances";
import { EmptyState, SkeletonRows } from "../components";
import { IconGem } from "../icons";

interface NftCard {
  mint: string;
  name: string;
  image: string | null;
}

const cardCache = new Map<string, NftCard>();

export function Collectibles({ snap }: { snap: Snapshot }) {
  const active = snap.pub.active!;
  const { portfolio } = usePortfolio(active.pubkey, snap.pub.network, snap.pub.customRpcUrl);
  const [cards, setCards] = useState<NftCard[] | null>(null);

  useEffect(() => {
    if (portfolio.status !== "ready") return;
    let cancelled = false;
    (async () => {
      const conn = makeConnection(snap.pub.network, snap.pub.customRpcUrl);
      const results = await Promise.all(
        portfolio.nfts.slice(0, 24).map(async (nft): Promise<NftCard> => {
          const hit = cardCache.get(nft.mint);
          if (hit) return hit;
          const card: NftCard = { mint: nft.mint, name: "Collectible", image: null };
          try {
            const meta = await fetchOnchainMeta(conn, nft.mint);
            if (meta?.name) card.name = meta.name;
            if (meta?.uri && /^https?:/.test(meta.uri)) {
              const json = await fetch(meta.uri).then((r) => r.json());
              if (typeof json?.image === "string" && /^https?:/.test(json.image)) card.image = json.image;
              if (typeof json?.name === "string" && json.name) card.name = json.name;
            }
          } catch {
            // leave placeholder card
          }
          cardCache.set(nft.mint, card);
          return card;
        }),
      );
      if (!cancelled) setCards(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [portfolio.status, portfolio.nfts, snap.pub.network, snap.pub.customRpcUrl]);

  if (portfolio.status === "loading" || (portfolio.status === "ready" && portfolio.nfts.length > 0 && cards == null)) {
    return <div className="pad-screen"><SkeletonRows count={3} /></div>;
  }

  if (portfolio.status !== "ready" || portfolio.nfts.length === 0) {
    return (
      <EmptyState
        icon={<IconGem size={22} />}
        title="No collectibles"
        body="NFTs held by this account will appear here."
      />
    );
  }

  return (
    <div className="nft-grid stagger">
      {(cards ?? []).map((c) => (
        <div key={c.mint} className="nft-card">
          {c.image ? (
            <img src={c.image} alt={c.name} loading="lazy" />
          ) : (
            <div className="nft-fallback">
              <IconGem size={24} />
            </div>
          )}
          <div className="nft-name">{c.name}</div>
        </div>
      ))}
    </div>
  );
}
