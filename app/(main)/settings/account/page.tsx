"use client";

import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Github, Mail, LogOut, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useI18n } from "@/lib/web-i18n";
import { Button } from "@/components/ui/button";

export default function AccountSettingsPage() {
  const { userSession } = useAuth();
  const user = userSession?.user;
  const router = useRouter();
  const { t, language } = useI18n();

  const userName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || t("notAvailable");
  const userImage = user?.user_metadata?.avatar_url;

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t("notAvailable");
    return new Date(dateString).toLocaleDateString(language, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case "google":
        return (
          <svg className="size-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        );
      case "github":
        return <Github className="size-4 text-foreground" />;
      case "email":
        return <Mail className="size-4 text-muted-foreground" />;
      default:
        return (
          <div className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-mono">
            {provider.charAt(0).toUpperCase()}
          </div>
        );
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto scrollbar-minimal w-full">
      <div className="w-full max-w-3xl px-6 py-8 pb-20 space-y-7 animate-in fade-in duration-200">
        {/* Header */}
        <div className="space-y-1 pb-4 border-b border-border">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{t("accountTitle")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("manageAccount")}
          </p>
        </div>

        <div className="space-y-6">
          {/* Section 1: Profile & Identity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-4 border-t border-border first:pt-0 first:border-t-0">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground">{t("profile")}</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Your profile name and email address.
              </p>
            </div>

            <div className="md:col-span-2 bg-card border border-border rounded-md p-4 space-y-4 shadow-xs">
              <div className="flex items-center gap-3">
                {userImage ? (
                  <Image
                    src={userImage}
                    alt={userName}
                    width={40}
                    height={40}
                    className="rounded-full border border-border object-cover shrink-0"
                  />
                ) : (
                  <div className="size-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{userName}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{user?.email}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Account Telemetry */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-4 border-t border-border">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground">{t("accountInfo")}</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Metadata and creation timestamp.
              </p>
            </div>

            <div className="md:col-span-2 bg-card border border-border rounded-md p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between text-xs py-1 border-b border-border/40">
                <span className="text-muted-foreground">User ID</span>
                <span className="font-mono text-[11px] text-foreground select-all">{user?.id || "N/A"}</span>
              </div>

              <div className="flex items-center justify-between text-xs py-1 border-b border-border/40">
                <span className="text-muted-foreground">Joined Workspace</span>
                <span className="text-foreground font-mono text-[11px]">{formatDate(user?.created_at)}</span>
              </div>

              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-muted-foreground">Last Active</span>
                <div className="flex items-center gap-1.5 text-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono text-[11px]">Active now</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Connected Providers */}
          {user?.identities && user.identities.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-4 border-t border-border">
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-foreground">{t("connectedProviders")}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  OAuth providers linked to your account.
                </p>
              </div>

              <div className="md:col-span-2 bg-card border border-border rounded-md p-4 space-y-2 shadow-xs">
                {user.identities.map((identity) => (
                  <div
                    key={identity.id}
                    className="flex items-center justify-between py-1 border-b border-border/40 last:border-b-0"
                  >
                    <div className="flex items-center gap-2.5">
                      {getProviderIcon(identity.provider)}
                      <span className="text-xs font-medium text-foreground capitalize">
                        {identity.provider}
                      </span>
                    </div>

                    <span className="text-[11px] text-muted-foreground font-mono">
                      Connected {formatDate(identity.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Sign Out Action */}
          <div className="pt-4 border-t border-border flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">Sign out of workspace</p>
              <p className="text-[11px] text-muted-foreground">End your active session on this browser.</p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="h-7 px-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-border"
            >
              <LogOut className="size-3 mr-1.5" />
              {t("signOut")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
