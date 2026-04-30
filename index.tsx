import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getContractAddress,
  makeReadClient,
  makeWriteClient,
  getOrCreateAccount,
  getWalletMode,
  setWalletMode,
  connectMetaMask,
  hasMetaMask,
  DEFAULT_CONTRACT_ADDRESS,
  type Proposal,
  type WalletMode,
} from "@/lib/genlayer";
import { TransactionStatus } from "genlayer-js/types";
import { Button } from "@/components/ui/button";

import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast, Toaster } from "sonner";
import { Loader2, ShieldCheck, ShieldX, Settings, Sparkles, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function short(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";
}

function Index() {
  const [contractAddr, setContractAddrState] = useState<string>(DEFAULT_CONTRACT_ADDRESS);
  
  const [proposalText, setProposalText] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [walletMode, setWalletModeState] = useState<WalletMode>("burner");
  const [burnerAddress, setBurnerAddress] = useState<string>("");
  const [mmAddress, setMmAddress] = useState<string>("");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const a = getContractAddress();
    setContractAddrState(a);
    
    setBurnerAddress(getOrCreateAccount().address);

    const mode = getWalletMode();
    setWalletModeState(mode);

    const eth = (window as any).ethereum;
    if (mode === "metamask" && eth) {
      eth
        .request({ method: "eth_accounts" })
        .then((accts: string[]) => {
          if (accts?.length) setMmAddress(accts[0]);
        })
        .catch(() => {});
      const onAccountsChanged = (accts: string[]) => {
        setMmAddress(accts?.[0] ?? "");
        if (!accts?.length) {
          setWalletMode("burner");
          setWalletModeState("burner");
        }
      };
      const onChainChanged = () => window.location.reload();
      eth.on?.("accountsChanged", onAccountsChanged);
      eth.on?.("chainChanged", onChainChanged);
      return () => {
        eth.removeListener?.("accountsChanged", onAccountsChanged);
        eth.removeListener?.("chainChanged", onChainChanged);
      };
    }
  }, []);

  useEffect(() => {
    if (contractAddr) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddr]);

  async function refresh() {
    if (!contractAddr) return;
    setLoading(true);
    try {
      const client = makeReadClient();
      const result = (await client.readContract({
        address: contractAddr as `0x${string}`,
        functionName: "get_all_proposals",
        args: [],
      })) as Proposal[];
      setProposals(Array.isArray(result) ? [...result].reverse() : []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to read proposals", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }


  async function handleConnectMetaMask() {
    if (!hasMetaMask()) {
      toast.error("MetaMask not detected", {
        description: "Install MetaMask from metamask.io to continue.",
      });
      return;
    }
    setConnecting(true);
    try {
      const addr = await connectMetaMask();
      setMmAddress(addr);
      setWalletModeState("metamask");
      toast.success("MetaMask connected", { description: short(addr) });
    } catch (e) {
      console.error(e);
      toast.error("Failed to connect MetaMask", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setConnecting(false);
    }
  }

  function useBurner() {
    setWalletMode("burner");
    setWalletModeState("burner");
    toast.success("Using burner wallet", { description: short(burnerAddress) });
  }

  async function submit() {
    if (!contractAddr) {
      toast.error("Set the contract address first");
      return;
    }
    if (proposalText.trim().length < 5) {
      toast.error("Proposal too short");
      return;
    }
    setSubmitting(true);
    const tId = toast.loading("Submitting to GenLayer…", {
      description: "AI validators are evaluating your proposal. This can take ~30–60s.",
    });
    try {
      const client = makeWriteClient();
      const hash = await client.writeContract({
        address: contractAddr as `0x${string}`,
        functionName: "submit_proposal",
        args: [proposalText],
        value: BigInt(0),
      });
      try {
        await client.waitForTransactionReceipt({
          hash,
          status: TransactionStatus.ACCEPTED,
        });
      } catch (waitErr) {
        // Studio sometimes takes longer than the SDK's poll window even though
        // the tx finalizes successfully. Treat timeouts as soft — just refresh.
        console.warn("waitForTransactionReceipt timed out, refreshing anyway", waitErr);
      }
      toast.success("Proposal submitted", {
        id: tId,
        description: "Refreshing decisions…",
      });
      setProposalText("");
      // small delay so the validators have time to write state
      await new Promise((r) => setTimeout(r, 1500));
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error("Submission failed", {
        id: tId,
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const activeAddress = walletMode === "metamask" ? mmAddress : burnerAddress;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="dark" position="top-right" richColors />

      {/* gradient bg */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.72_0.18_155/0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,oklch(0.55_0.2_280/0.14),transparent_50%)]" />
      </div>

      <header className="border-b border-border/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">AI Governance</h1>
              <p className="text-xs text-muted-foreground">Powered by GenLayer Studio · Gasless</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-xs text-muted-foreground">
                {walletMode === "metamask" ? "MetaMask" : "Burner wallet"}
              </p>
              <p className="font-mono text-xs">{short(activeAddress)}</p>
            </div>
            {walletMode === "metamask" && mmAddress ? (
              <Button variant="outline" size="sm" onClick={useBurner}>
                Use burner
              </Button>
            ) : (
              <Button size="sm" onClick={handleConnectMetaMask} disabled={connecting}>
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4" />
                )}
                Connect MetaMask
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Hero */}
        <section className="mb-10">
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Submit a proposal.{" "}
            <span className="bg-gradient-to-r from-primary to-[oklch(0.7_0.2_200)] bg-clip-text text-transparent">
              Let AI validators decide.
            </span>
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            An on-chain governance contract running on GenLayer Studio. Each proposal is evaluated
            by an LLM through equivalence-principle consensus and finalized with an APPROVE or
            REJECT decision. Studio is gasless — no GEN required.
          </p>
        </section>

        {/* Contract status */}
        <Card className="mb-6 border-border/60 bg-card/60 backdrop-blur">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/30">
                <Settings className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Connected contract</p>
                <p className="font-mono text-sm break-all">{contractAddr}</p>
              </div>
            </div>
            <a
              href={`https://explorer-studio.genlayer.com/address/${contractAddr}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              View on explorer
            </a>
          </CardContent>
        </Card>

        {/* Submit form */}
        <Card className="mb-10 border-border/60 bg-card/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-base">New proposal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              rows={6}
              placeholder="Describe your proposal in detail. e.g. 'Allocate 5% of treasury to a community grants program for open-source contributors…'"
              value={proposalText}
              onChange={(e) => setProposalText(e.target.value)}
              className="resize-none"
            />
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <p className="text-xs text-muted-foreground">
                {proposalText.length} chars · evaluated by AI consensus ·{" "}
                {walletMode === "metamask" ? "signing with MetaMask" : "signing with burner"}
              </p>
              <Button onClick={submit} disabled={submitting || !contractAddr}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Evaluating…
                  </>
                ) : (
                  "Submit proposal"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Proposals list */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight">Decisions</h3>
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading || !contractAddr}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>

          {contractAddr && proposals.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">No proposals yet. Be the first.</p>
          )}

          <div className="grid gap-3">
            {proposals.map((p) => {
              const approved = p.decision === "APPROVE";
              return (
                <Card
                  key={p.id}
                  className="border-border/60 bg-card/60 backdrop-blur transition hover:bg-card/80"
                >
                  <CardContent className="space-y-3 pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">#{p.id}</span>
                        {approved ? (
                          <Badge className="gap-1 bg-primary/15 text-primary ring-1 ring-primary/30 hover:bg-primary/20">
                            <ShieldCheck className="h-3 w-3" /> APPROVE
                          </Badge>
                        ) : (
                          <Badge
                            variant="destructive"
                            className="gap-1 bg-destructive/15 text-destructive ring-1 ring-destructive/30 hover:bg-destructive/20"
                          >
                            <ShieldX className="h-3 w-3" /> REJECT
                          </Badge>
                        )}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.proposer ? short(p.proposer) : ""}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{p.proposal}</p>
                    <div className="rounded-md border border-border/60 bg-background/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        AI reasoning
                      </p>
                      <p className="mt-1 text-sm">{p.reason}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <footer className="mt-16 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
          GenLayer Studio · Chain ID 61999 · Gasless ·{" "}
          <a
            href="https://explorer-studio.genlayer.com/"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            Explorer
          </a>
        </footer>
      </main>
    </div>
  );
}
