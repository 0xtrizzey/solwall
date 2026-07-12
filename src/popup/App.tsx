import { useState } from "react";
import { truncateAddress } from "../lib/format";
import type { Snapshot } from "../lib/types";
import { ToastHost } from "./components";
import { IconActivity, IconChevronD, IconGear, IconGem, IconWallet, Logo } from "./icons";
import { useRoute, useStore } from "./store";
import { Accounts } from "./screens/Accounts";
import { Activity } from "./screens/Activity";
import { Approval } from "./screens/Approval";
import { Collectibles } from "./screens/Collectibles";
import { Home } from "./screens/Home";
import { Onboarding } from "./screens/Onboarding";
import { Receive } from "./screens/Receive";
import { Send } from "./screens/Send";
import { Settings } from "./screens/Settings";
import { Swap } from "./screens/Swap";
import { Unlock } from "./screens/Unlock";

export function App() {
  const { snap } = useStore();
  const [route, nav] = useRoute();

  if (!snap) {
    return (
      <div className="screen splash">
        <Logo size={48} />
      </div>
    );
  }

  const [path, queryString] = route.split("?");
  const query = new URLSearchParams(queryString ?? "");

  // dApp approval windows route here; unlock first if needed.
  if (path.startsWith("/approve/")) {
    if (!snap.hasVault) return wrap(<Onboarding />);
    if (snap.locked) return wrap(<Unlock />);
    return wrap(<Approval snap={snap} id={path.slice("/approve/".length)} />);
  }

  if (!snap.hasVault) return wrap(<Onboarding />);
  if (snap.locked) return wrap(<Unlock />);
  if (!snap.pub.active) return wrap(<Onboarding />);

  if (path === "/send") return wrap(<Send snap={snap} nav={nav} query={query} />);
  if (path === "/receive") return wrap(<Receive snap={snap} nav={nav} />);
  if (path === "/swap") return wrap(<Swap snap={snap} nav={nav} />);
  if (path === "/accounts") return wrap(<Accounts snap={snap} nav={nav} />);

  const tab = path === "/activity" ? "activity" : path === "/collectibles" ? "collectibles" : path === "/settings" ? "settings" : "home";

  return wrap(
    <div className="shell">
      <TopBar snap={snap} nav={nav} />
      <main className="shell-main">
        {tab === "home" && <Home snap={snap} nav={nav} />}
        {tab === "activity" && <Activity snap={snap} />}
        {tab === "collectibles" && <Collectibles snap={snap} />}
        {tab === "settings" && <Settings snap={snap} nav={nav} />}
      </main>
      <nav className="bottom-nav" aria-label="Main">
        <NavBtn label="Wallet" active={tab === "home"} onClick={() => nav("/")} icon={<IconWallet size={20} />} />
        <NavBtn label="Activity" active={tab === "activity"} onClick={() => nav("/activity")} icon={<IconActivity size={20} />} />
        <NavBtn label="Items" active={tab === "collectibles"} onClick={() => nav("/collectibles")} icon={<IconGem size={20} />} />
        <NavBtn label="Settings" active={tab === "settings"} onClick={() => nav("/settings")} icon={<IconGear size={20} />} />
      </nav>
    </div>,
  );
}

function wrap(children: React.ReactNode) {
  return (
    <>
      {children}
      <ToastHost />
    </>
  );
}

function TopBar({ snap, nav }: { snap: Snapshot; nav: (r: string) => void }) {
  const active = snap.pub.active!;
  const wallet = snap.pub.wallets.find((w) => w.id === active.walletId);
  const account = wallet?.accounts.find((a) => a.pubkey === active.pubkey);
  const network = snap.pub.network;

  return (
    <header className="top-bar">
      <button className="account-chip" onClick={() => nav("/accounts")} title={active.pubkey}>
        <span className="account-chip-dot" aria-hidden />
        <span className="account-chip-name">{account?.name ?? "Account"}</span>
        <span className="account-chip-addr mono">{truncateAddress(active.pubkey, 3)}</span>
        <IconChevronD size={13} />
      </button>
      {network !== "mainnet-beta" && <span className={`net-pill net-${network}`}>{network === "custom" ? "custom RPC" : network}</span>}
    </header>
  );
}

function NavBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-btn ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
