// Proves the signMessage fix: dApp-compatible AND still replay-safe.
import { Keypair, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { looksLikeTransactionPayload } from "../src/lib/txbytes";

const kp = Keypair.generate();
const to = Keypair.generate();
const bh = "11111111111111111111111111111111";
let pass = true;
const check = (cond: boolean, label: string) => {
  if (!cond) pass = false;
  console.log(`${cond ? "OK  " : "FAIL"} ${label}`);
};

// 1) COMPATIBILITY: a real sign-in message must verify against the RAW bytes,
//    which is what every dApp and the Wallet Standard `signedMessage` compares.
const siws = new TextEncoder().encode(
  `jup.ag wants you to sign in with your Solana account:\n${kp.publicKey.toBase58()}\n\nNonce: 8f3a91b2\nIssued At: 2026-09-19T10:00:00.000Z`,
);
check(!looksLikeTransactionPayload(siws), "SIWS message passes the guard (not blocked)");
const sig = nacl.sign.detached(siws, kp.secretKey); // exactly what resolveApproval now does
check(nacl.sign.detached.verify(siws, sig, kp.publicKey.toBytes()), "dApp verifies signature against raw message");

// 2) REPLAY SAFETY: the bare compiled message is the payload whose signature is
//    directly usable as an on-chain transaction signature. Must be refused.
const legacyTx = new Transaction().add(
  SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: to.publicKey, lamports: 1_000_000_000 }),
);
legacyTx.recentBlockhash = bh;
legacyTx.feePayer = kp.publicKey;
check(looksLikeTransactionPayload(legacyTx.compileMessage().serialize()), "BARE legacy message refused (drain vector)");
check(
  looksLikeTransactionPayload(new Uint8Array(legacyTx.serialize({ requireAllSignatures: false, verifySignatures: false }))),
  "full legacy transaction refused",
);
const v0 = new TransactionMessage({
  payerKey: kp.publicKey,
  recentBlockhash: bh,
  instructions: [SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: to.publicKey, lamports: 1_000_000_000 })],
}).compileToV0Message();
check(looksLikeTransactionPayload(v0.serialize()), "BARE v0 message refused (drain vector)");
check(looksLikeTransactionPayload(new VersionedTransaction(v0).serialize()), "full v0 transaction refused");

// 3) Proof the drain actually works if unguarded — signature over the bare
//    message is a valid transaction signature.
const bareMsg = legacyTx.compileMessage().serialize();
const drainSig = nacl.sign.detached(bareMsg, kp.secretKey);
check(
  nacl.sign.detached.verify(bareMsg, drainSig, kp.publicKey.toBytes()),
  "(context) unguarded message-signing WOULD yield a valid tx signature",
);

console.log(pass ? "\nSIGNMESSAGE: compatible + replay-safe" : "\n*** SIGNMESSAGE CHECK FAILED ***");
process.exit(pass ? 0 : 1);
