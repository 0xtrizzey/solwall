import { useEffect, useState } from "react";
import { makeConnection } from "../../lib/rpc";
import { fetchOnchainMeta } from "../../lib/tokens";
import type { Snapshot } from "../../lib/types";
import { usePortfolio } from "../balances";
import { Btn, EmptyState, SkeletonRows } from "../components";
import { IconGem, IconWarning } from "../icons";

interface NftCard {
  mint: string;
  name: string;
  image: string | null;
  pendingHttpMetaUri?: string;
  pendingHttpImageUri?: string;
}

const resolveGateway = (uri: string): string => {
  if (uri.startsWith("ipfs://")) return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
  if (uri.startsWith("ar://")) return uri.replace("ar://", "https://arweave.net/");
  return uri;
};

const cardCache = new Map<string, NftCard>();

export function Collectibles({ snap }: { snap: Snapshot }) {
  const active = snap.pub.active!;
  const { portfolio } = usePortfolio(active.pubkey, snap.pub.network, snap.pub.customRpcUrl);
  const [cards, setCards] = useState<NftCard[] | null>(null);

  const loadHttp = async (mint: string) => {
    // Optimistic UI update (could add a loading state here if needed)
    setCards((prev) => (prev ? [...prev] : null));

    const card = cardCache.get(mint);
    if (!card) return;

    try {
      if (card.pendingHttpMetaUri) {
        const json = await fetch(card.pendingHttpMetaUri, { signal: AbortSignal.timeout(5000), referrerPolicy: "no-referrer" }).then((r) => r.json());
        if (typeof json?.name === "string" && json.name) card.name = json.name;
        if (typeof json?.image === "string") {
          if (json.image.startsWith("http")) card.image = json.image;
          else if (/^(ipfs|ar):\/\//.test(json.image)) card.image = resolveGateway(json.image);
        }
        card.pendingHttpMetaUri = undefined;
      } else if (card.pendingHttpImageUri) {
        card.image = card.pendingHttpImageUri;
        card.pendingHttpImageUri = undefined;
      }
    } catch {
      // Failed to load
    }
    
    // Trigger re-render
    setCards((prev) => (prev ? [...prev] : null));
  };

  useEffect(() => {
    if (portfolio.status !== "ready") return;
    let cancelled = false;
    (async () => {
      if (snap.pub.hideNfts) return;

      const conn = makeConnection(snap.pub.network, snap.pub.customRpcUrl);
      const results = await Promise.all(
        portfolio.nfts.slice(0, 24).map(async (nft): Promise<NftCard> => {
          const hit = cardCache.get(nft.mint);
          if (hit) return hit;
          const card: NftCard = { mint: nft.mint, name: "Collectible", image: null };
          try {
            const meta = await fetchOnchainMeta(conn, nft.mint);
            if (meta?.name) card.name = meta.name;
            if (meta?.uri) {
              if (/^(ipfs|ar):\/\//.test(meta.uri)) {
                const json = await fetch(resolveGateway(meta.uri), { signal: AbortSignal.timeout(5000), referrerPolicy: "no-referrer" }).then((r) => r.json());
                if (typeof json?.name === "string" && json.name) card.name = json.name;
                if (typeof json?.image === "string") {
                  if (json.image.startsWith("http")) card.pendingHttpImageUri = json.image;
                  else if (/^(ipfs|ar):\/\//.test(json.image)) card.image = resolveGateway(json.image);
                }
              } else if (meta.uri.startsWith("http")) {
                card.pendingHttpMetaUri = meta.uri;
              }
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

  if (snap.pub.hideNfts) {
    return (
      <EmptyState
        icon={<IconGem size={22} />}
        title="Privacy Mode Active"
        body="NFT fetching is blocked to protect your IP address."
      />
    );
  }

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
            <img src={c.image} alt={c.name} loading="lazy" referrerPolicy="no-referrer" />
          ) : c.pendingHttpImageUri || c.pendingHttpMetaUri ? (
            <div className="nft-fallback blocked-http" style={{ flexDirection: "column", gap: "6px", padding: "8px", textAlign: "center" }}>
              <IconWarning size={18} color="var(--red)" />
              <div style={{ fontSize: "10px", lineHeight: 1.2, color: "var(--red)" }}>HTTP Server may log your IP</div>
              <Btn size="sm" variant="outline" onClick={() => loadHttp(c.mint)}>Reveal</Btn>
            </div>
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
