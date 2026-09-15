"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LogoBadge } from "@/components/common/Logo";
import { ArrowRight, Github, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

function getSafeRedirectPath(redirect: string | null | undefined): string {
  if (!redirect?.startsWith("/") || redirect.startsWith("//")) {
    return "/mcp";
  }

  return redirect;
}

export default function SignInPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const getRedirectPath = () => getSafeRedirectPath(searchParams.get("redirect"));

  const getAuthCallbackUrl = () => {
    const callbackUrl = new URL("/auth/callback", location.origin);
    callbackUrl.searchParams.set("next", getRedirectPath());
    return callbackUrl.toString();
  };

  const handleSocialLogin = async (provider: "github" | "google") => {
    try {
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: getAuthCallbackUrl() },
      });
    } catch (error) {
      console.error("Social login error:", error);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: getAuthCallbackUrl() },
      });

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        setMessage({ type: "success", text: "Check your email for the magic link to sign in!" });
        setEmail("");
      }
    } catch (error) {
      setMessage({ type: "error", text: "An unexpected error occurred" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="h-dvh min-h-dvh overflow-hidden bg-[#0d0d0d] text-white lg:p-[18px]">
      <div className="mx-auto flex h-full min-h-0 max-w-[1440px] overflow-hidden rounded-none bg-[#0d0d0d] lg:rounded-[18px]">
        <section className="flex min-h-0 w-full items-center justify-center overflow-y-auto px-6 py-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-12 lg:w-[43%] lg:px-16 xl:px-24">
          <div className="w-full max-w-[360px]">
            <div className="mb-12 flex items-center gap-3">
              <Link href="/" aria-label="Go to LinkOS home" className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                <LogoBadge size={34} className="brightness-0 invert" />
              </Link>
            </div>

            <div className="mb-8">
              <h1 className="whitespace-nowrap text-[28px] font-medium leading-[1.08] tracking-[-0.055em] sm:text-[30px]">
                Access your workspace.
              </h1>
              <p className="mt-3 text-sm leading-6 text-white/50">
                Sign in or create an account to get started.
              </p>
            </div>

            <div className="space-y-3">
              <Button
                variant="outline"
                className="h-10 w-full justify-center border-white/10 bg-white/[0.03] text-sm text-white hover:bg-white/[0.08] hover:text-white"
                type="button"
                onClick={() => handleSocialLogin("google")}
              >
                <svg className="mr-2 h-4 w-4" aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </Button>
              <Button
                variant="outline"
                className="h-10 w-full justify-center border-white/10 bg-white/[0.03] text-sm text-white hover:bg-white/[0.08] hover:text-white"
                type="button"
                onClick={() => handleSocialLogin("github")}
              >
                <Github className="mr-2 h-4 w-4" />
                Continue with GitHub
              </Button>
            </div>

            <div className="relative my-7">
              <div className="absolute inset-0 flex items-center"><Separator className="bg-white/10" /></div>
              <div className="relative flex justify-center"><span className="bg-[#0d0d0d] px-3 text-[11px] uppercase tracking-[0.18em] text-white/30">or</span></div>
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-3">
              <Input
                id="email"
                type="email"
                placeholder="Email address"
                aria-label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 border-white/10 bg-white/[0.03] text-white placeholder:text-white/35 focus-visible:ring-white/30"
              />

              {message && (
                <Alert variant={message.type === "error" ? "destructive" : "default"} className="border-white/10 bg-white/[0.05] text-white">
                  <AlertDescription>{message.text}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="h-10 w-full bg-white text-sm font-medium text-black hover:bg-white/90" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                {isLoading ? "Sending link..." : "Log in with email"}
                {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>

            <p className="mt-8 text-center text-[11px] leading-5 text-white/35">
              By continuing, you agree to our{" "}
              <Link href="/privacy" className="text-white/60 underline underline-offset-4 hover:text-white">Privacy Policy</Link>.
            </p>
          </div>
        </section>

        <aside className="relative hidden flex-1 overflow-hidden rounded-[18px] bg-[#252525] lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(255,255,255,0.12),transparent_24%),radial-gradient(circle_at_80%_78%,rgba(255,255,255,0.12),transparent_25%),#252525]" />
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:52px_52px]" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="signin-panel-glow absolute -right-24 top-10 h-72 w-72 rounded-full bg-cyan-200/15 blur-3xl" />
            <div className="signin-panel-glow signin-panel-glow-delay absolute left-1/3 top-1/3 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute bottom-[-18%] left-[-10%] h-80 w-80 rounded-full bg-indigo-200/10 blur-3xl" />
          </div>
          <div className="relative flex h-full min-h-0 items-center justify-center p-12 pr-6">
            <div className="relative z-10 grid h-full w-full max-w-none grid-cols-[minmax(0,1fr)_minmax(230px,0.9fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-8 gap-y-6 self-stretch py-3 text-white">
              <div className="pointer-events-none relative col-start-2 row-start-1 h-full min-h-0 w-full max-w-[560px] justify-self-end opacity-90">
                {[
                  { name: "GitHub", icon: "https://logos.composio.dev/api/github", invert: true, position: "left-[6%] top-[2%]", delay: "-1s" },
                  { name: "X", icon: "https://logos.composio.dev/api/twitter", invert: true, position: "left-[42%] top-[8%]", delay: "-5s" },
                  { name: "Calendly", icon: "https://logos.composio.dev/api/calendly", position: "right-[4%] top-0", delay: "-8s" },
                  { name: "Supabase", icon: "https://logos.composio.dev/api/supabase", position: "left-[17%] top-[13%]", delay: "-6s" },
                  { name: "Higgsfield", icon: "https://logos.composio.dev/api/higgsfield", position: "right-[14%] top-[17%]", delay: "-2s" },
                  { name: "Notion", icon: "https://logos.composio.dev/api/notion", position: "left-[25%] top-[28%]", delay: "-3s" },
                  { name: "Perplexity", icon: "https://logos.composio.dev/api/perplexityai", position: "right-[29%] top-[30%]", delay: "-10s" },
                  { name: "Gmail", icon: "https://logos.composio.dev/api/gmail", position: "left-[2%] top-[54%]", delay: "-6s" },
                  { name: "Apify", icon: "https://logos.composio.dev/api/apify", position: "left-[45%] top-[58%]", delay: "-12s" },
                  { name: "Google Docs", icon: "https://logos.composio.dev/api/googledocs", position: "right-[3%] top-[66%]", delay: "-4s" },
                  { name: "Mem0", icon: "https://logos.composio.dev/api/mem0", position: "left-[28%] top-[80%]", delay: "-9s" },
                  { name: "Netlify", icon: "https://logos.composio.dev/api/netlify", position: "right-[31%] top-[86%]", delay: "-2s" },
                  { name: "Parallel Search", icon: "https://logos.composio.dev/api/parallel", invert: true, position: "left-[61%] top-[43%]", delay: "-7s" },
                  { name: "Heroku", icon: "https://logos.composio.dev/api/heroku", position: "right-0 top-[46%]", delay: "-11s" },
                ].map((platform) => (
                  <div
                    key={platform.name}
                    className={`signin-tool-float absolute flex h-11 w-11 items-center justify-center rounded-xl border-0 bg-white/[0.12] shadow-[0_10px_26px_rgba(0,0,0,0.16)] backdrop-blur-lg ${platform.position}`}
                    style={{ animationDelay: platform.delay }}
                  >
                    <Image
                      src={platform.icon}
                      alt=""
                      width={36}
                      height={36}
                      className={`h-6 w-6 rounded-xs object-contain ${platform.invert ? "invert" : ""}`}
                      unoptimized
                    />
                  </div>
                ))}
              </div>
              <div className="col-start-1 row-start-1 self-start">
                <h2 className="max-w-[370px] text-[clamp(3.8rem,6.5vw,6.5rem)] font-medium leading-[0.9] tracking-[-0.08em] text-white">
                  Give AI
                  <br />
                  <span className="text-white/35">the right</span>
                  <br />
                  tools.
                </h2>
                <p className="mt-9 max-w-[360px] text-[15px] leading-7 text-white/55">
                  Manage tools, data sources, and actions from one single place.
                </p>
              </div>

              <div className="col-span-2 row-start-2 grid w-full grid-cols-3 gap-3 pt-5">
                <div>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/35">01</div>
                  <div className="text-xs font-medium text-white/85">Connect anything</div>
                  <div className="mt-1 text-[11px] leading-5 text-white/40">Your tools, in one place.</div>
                </div>
                <div>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/35">02</div>
                  <div className="text-xs font-medium text-white/85">Stay in control</div>
                  <div className="mt-1 text-[11px] leading-5 text-white/40">Clear access, every time.</div>
                </div>
                <div>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/35">03</div>
                  <div className="text-xs font-medium text-white/85">Move with intent</div>
                  <div className="mt-1 text-[11px] leading-5 text-white/40">Less setup. More making.</div>
                </div>
              </div>
            </div>
            <div className="hidden">
              <div className="rounded-[20px] border border-white/30 bg-white/95 p-7 text-[#17242a] shadow-2xl shadow-black/20 backdrop-blur-sm">
                <div className="mb-5 text-[15px] leading-6 sm:text-[17px]">
                  “The fastest way to make an AI assistant useful is to give it the right tools.”
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#111111] text-xs font-semibold text-white">L</div>
                  <div>
                    <div className="text-sm font-semibold">LinkOS</div>
                    <div className="text-xs text-slate-500">Your MCP workspace</div>
                  </div>
                </div>
              </div>

            </div>
            <div
              aria-hidden="true"
              className="hidden"
            >
              <div className="absolute left-1/2 top-1/2 z-10 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-white/50 bg-[#171717]/90 shadow-[0_0_80px_rgba(255,255,255,0.16)] backdrop-blur-xl">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-lg font-bold text-[#171717] shadow-lg shadow-black/20">L</div>
                <span className="text-sm font-semibold tracking-tight text-white">LinkOS</span>
                <span className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-white/45">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399] motion-reduce:animate-none" />
                  workspace ready
                </span>
              </div>

              <div className="absolute left-[11%] top-[18%] h-px w-[29%] origin-left rotate-[27deg] bg-gradient-to-r from-white/45 to-white/10"><span className="absolute -top-1 left-[40%] h-2 w-2 animate-ping rounded-full bg-white shadow-[0_0_12px_#fff] motion-reduce:animate-none" /></div>
              <div className="absolute right-[11%] top-[18%] h-px w-[29%] origin-right -rotate-[27deg] bg-gradient-to-l from-white/45 to-white/10"><span className="absolute -top-1 right-[40%] h-2 w-2 animate-ping rounded-full bg-white shadow-[0_0_12px_#fff] [animation-delay:700ms] motion-reduce:animate-none" /></div>
              <div className="absolute bottom-[18%] left-[11%] h-px w-[29%] origin-left -rotate-[27deg] bg-gradient-to-r from-white/45 to-white/10"><span className="absolute -top-1 left-[40%] h-2 w-2 animate-ping rounded-full bg-white shadow-[0_0_12px_#fff] [animation-delay:1200ms] motion-reduce:animate-none" /></div>
              <div className="absolute bottom-[18%] right-[11%] h-px w-[29%] origin-right rotate-[27deg] bg-gradient-to-l from-white/45 to-white/10"><span className="absolute -top-1 right-[40%] h-2 w-2 animate-ping rounded-full bg-white shadow-[0_0_12px_#fff] [animation-delay:1700ms] motion-reduce:animate-none" /></div>
              <div className="absolute bottom-[7%] left-1/2 h-[21%] w-px -translate-x-1/2 bg-gradient-to-b from-white/35 to-transparent"><span className="absolute -left-1 top-[42%] h-2 w-2 animate-ping rounded-full bg-white shadow-[0_0_12px_#fff] [animation-delay:400ms] motion-reduce:animate-none" /></div>

              <div className="absolute left-[3%] top-[5%] rounded-2xl border border-white/20 bg-black/20 p-3 backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-xs font-semibold">GH</span><span className="text-xs font-medium text-white">GitHub</span></div>
                <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] text-white/50">search · read</span>
              </div>
              <div className="absolute right-[3%] top-[5%] rounded-2xl border border-white/20 bg-black/20 p-3 backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-xs font-semibold">N</span><span className="text-xs font-medium text-white">Notion</span></div>
                <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] text-white/50">query · create</span>
              </div>
              <div className="absolute bottom-[5%] left-[3%] rounded-2xl border border-white/20 bg-black/20 p-3 backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-xs font-semibold">Li</span><span className="text-xs font-medium text-white">Linear</span></div>
                <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] text-white/50">issues · update</span>
              </div>
              <div className="absolute bottom-[5%] right-[3%] rounded-2xl border border-white/20 bg-black/20 p-3 backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-xs font-semibold">PG</span><span className="text-xs font-medium text-white">Postgres</span></div>
                <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] text-white/50">tables · query</span>
              </div>

              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/50 backdrop-blur-md">
                4 connected servers · 28 tools
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
