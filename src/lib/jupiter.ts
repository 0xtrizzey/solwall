// Jupiter swap integration (mainnet only) via the free lite-api tier.

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routeLabels: string[];
  raw: unknown;
}

const BASE = "https://lite-api.jup.ag/swap/v1";

export async function getQuote(
  inputMint: string,
  outputMint: string,
  rawAmount: string,
  slippageBps = 50,
): Promise<SwapQuote> {
  const url = `${BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippageBps}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error || json.errorCode) {
    throw new Error(json.error ?? json.errorCode ?? `Quote failed (${res.status})`);
  }
  const labels: string[] = (json.routePlan ?? [])
    .map((r: any) => r?.swapInfo?.label)
    .filter(Boolean);
  return {
    inputMint,
    outputMint,
    inAmount: json.inAmount,
    outAmount: json.outAmount,
    priceImpactPct: json.priceImpactPct ?? "0",
    routeLabels: labels,
    raw: json,
  };
}

/** Returns a base64-serialized VersionedTransaction ready for signing. */
export async function getSwapTransaction(quote: SwapQuote, userPublicKey: string): Promise<string> {
  const res = await fetch(`${BASE}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote.raw,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.swapTransaction) {
    throw new Error(json.error ?? `Swap build failed (${res.status})`);
  }
  return json.swapTransaction as string;
}
