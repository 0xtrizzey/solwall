import { Message, MessageV0, Transaction, SystemProgram, PublicKey } from "@solana/web3.js";
const tx = new Transaction().add(SystemProgram.transfer({
  fromPubkey: new PublicKey("11111111111111111111111111111111"),
  toPubkey: new PublicKey("11111111111111111111111111111111"),
  lamports: 1000
}));
tx.recentBlockhash = "11111111111111111111111111111111";
tx.feePayer = new PublicKey("11111111111111111111111111111111");
const msgBytes = tx.compileMessage().serialize();
console.log("msgBytes starts with:", msgBytes[0]);
let caught = false;
try {
  Message.from(msgBytes);
  caught = true;
  console.log("Legacy parsed!");
} catch (e) { console.log("Legacy fail", e.message); }

try {
  MessageV0.deserialize(msgBytes);
  caught = true;
  console.log("V0 parsed!");
} catch (e) { console.log("V0 fail", e.message); }

console.log("Caught?", caught);
