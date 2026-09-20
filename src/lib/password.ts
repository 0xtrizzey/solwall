// Password policy for the vault.
//
// Argon2id makes each offline guess expensive, but it cannot rescue a password
// that is in the attacker's first thousand guesses. Both halves are needed: a
// memory-hard KDF *and* a password that isn't trivially guessable.
//
// Deliberately dependency-free — a wallet should not pull a multi-megabyte
// wordlist into the bundle. This catches the failure modes that actually show
// up (short, single-class, common word, keyboard run, repetition) rather than
// pretending to be a full zxcvbn.

export const MIN_PASSWORD_LENGTH = 10;

export interface PasswordAssessment {
  /** 0 unusable … 4 excellent */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  issues: string[];
  /** meets the minimum policy required to create/change a vault password */
  ok: boolean;
}

// The passwords that appear at the top of every breach corpus, plus the
// crypto-flavoured ones people reach for on a wallet.
const COMMON = new Set([
  "password", "passw0rd", "password1", "password123", "123456", "1234567", "12345678", "123456789",
  "1234567890", "qwerty", "qwertyui", "qwerty123", "abc123", "111111", "000000", "iloveyou",
  "admin", "welcome", "monkey", "dragon", "letmein", "football", "baseball", "sunshine",
  "princess", "trustno1", "master", "shadow", "superman", "michael", "solana", "bitcoin",
  "ethereum", "crypto", "wallet", "phantom", "seedphrase", "notyourkeys", "satoshi", "blockchain",
  "solwall", "moonboy", "hodlhodl", "tothemoon",
]);

const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

function hasRun(pw: string, minLen = 4): boolean {
  const lower = pw.toLowerCase();
  for (const seq of SEQUENCES) {
    const rev = [...seq].reverse().join("");
    for (let i = 0; i + minLen <= seq.length; i++) {
      if (lower.includes(seq.slice(i, i + minLen)) || lower.includes(rev.slice(i, i + minLen))) return true;
    }
  }
  return false;
}

function stripped(pw: string): string {
  // "P@ssw0rd!" -> "password" so leetspeak doesn't dodge the common-word check.
  return pw
    .toLowerCase()
    .replace(/[@]/g, "a")
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "l")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z]/g, "");
}

export function assessPassword(pw: string): PasswordAssessment {
  const issues: string[] = [];
  if (!pw) return { score: 0, label: "empty", issues: ["Enter a password."], ok: false };

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const unique = new Set(pw).size;
  const base = stripped(pw);

  let score = 0;
  // Length is the dominant factor, as it should be.
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (pw.length >= 20) score++;
  if (classes >= 3 && pw.length >= 12) score++;
  if (classes >= 2) score++;

  if (pw.length < MIN_PASSWORD_LENGTH) {
    issues.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    score = 0;
  }
  if (COMMON.has(pw.toLowerCase()) || (base.length >= 4 && COMMON.has(base))) {
    issues.push("This is a commonly used password.");
    score = 0;
  }
  if (unique <= Math.max(2, Math.ceil(pw.length / 4))) {
    issues.push("Too few different characters.");
    score = Math.min(score, 1);
  }
  if (hasRun(pw)) {
    issues.push("Avoid keyboard or alphabet runs like \"abcd\" or \"qwerty\".");
    score = Math.min(score, 1);
  }
  if (classes === 1 && pw.length < 16) {
    issues.push("Mix in another character type, or make it longer.");
    score = Math.min(score, 1);
  }

  const clamped = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;
  const label = ["unusable", "very weak", "fair", "strong", "excellent"][clamped];
  // Policy: long enough, not obviously guessable, at least "fair".
  const ok = pw.length >= MIN_PASSWORD_LENGTH && clamped >= 2 && issues.length === 0;
  return { score: clamped, label, issues, ok };
}

/** Throws with a user-facing reason when the password fails the policy. */
export function assertPasswordPolicy(pw: string): void {
  const a = assessPassword(pw);
  if (!a.ok) {
    throw new Error(a.issues[0] ?? `Password is too weak (${a.label}). Use a longer, less predictable password.`);
  }
}
