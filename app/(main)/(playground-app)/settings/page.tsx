"use client";

import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Github, Mail } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useI18n } from "@/lib/web-i18n";

export default function SettingsPage() {
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
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case "google":
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
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
        return <Github className="w-5 h-5" />;
      case "email":
        return <Mail className="w-5 h-5" />;
      default:
        return (
          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs">
            {provider.charAt(0).toUpperCase()}
          </div>
        );
    }
  };

  return (
    <div className="px-1 md:px-6 pb-16">
      <div className="mb-6">
        <h1 className="text-3xl mb-1">{t("accountTitle")}</h1>
        <p className="text-[15px] text-muted-foreground">
          {t("manageAccount")}
        </p>
      </div>

      <div className="space-y-8 max-w-2xl">
        <section className="space-y-4">
          <h3 className="text-sm uppercase tracking-[0.16em] text-muted-foreground">{t("profile")}</h3>

          <div className="flex items-center gap-4">
            {userImage ? (
              <Image
                src={userImage}
                alt={userName}
                width={64}
                height={64}
                className="rounded-full"
              />
            ) : (
              <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center text-white font-semibold text-xl">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <p className="text-[18px] font-medium">{userName}</p>
              {user?.email && (
                <p className="text-[15px] text-muted-foreground">{user.email}</p>
              )}
            </div>
          </div>
        </section>

        <div className="border-t border-border"></div>

        <section className="space-y-4">
          <h3 className="text-sm font-instrument-serif font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {t("accountInfo")}
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <p className="text-xs font-instrument-serif font-medium uppercase tracking-[0.14em] text-muted-foreground mb-1.5">{t("userId")}</p>
                <p className="text-sm font-mono break-all">{user?.id || t("notAvailable")}</p>
              </div>
              <div>
                <p className="text-xs font-instrument-serif font-medium uppercase tracking-[0.14em] text-muted-foreground mb-1.5">{t("phone")}</p>
                <p className="text-[15px] font-instrument-serif tracking-wide">{user?.phone || t("notProvided")}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <p className="text-xs font-instrument-serif font-medium uppercase tracking-[0.14em] text-muted-foreground mb-1.5">{t("memberSince")}</p>
                <p className="text-[15px] font-instrument-serif tracking-wide">{formatDate(user?.created_at)}</p>
              </div>
              <div>
                <p className="text-xs font-instrument-serif font-medium uppercase tracking-[0.14em] text-muted-foreground mb-1.5">{t("lastUpdated")}</p>
                <p className="text-[15px] font-instrument-serif tracking-wide">{formatDate(user?.updated_at)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <p className="text-xs font-instrument-serif font-medium uppercase tracking-[0.14em] text-muted-foreground mb-1.5">{t("lastSignIn")}</p>
                <p className="text-[15px] font-instrument-serif tracking-wide">{formatDate(user?.last_sign_in_at)}</p>
              </div>
              <div>
                <p className="text-xs font-instrument-serif font-medium uppercase tracking-[0.14em] text-muted-foreground mb-1.5">{t("emailConfirmed")}</p>
                <p className="text-[15px] font-instrument-serif tracking-wide">{formatDate(user?.email_confirmed_at)}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-border"></div>

        {user?.identities && user.identities.length > 0 && (
          <>
            <section className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t("connectedProviders")}
              </h3>
              <div className="space-y-3">
                {user.identities.map((identity) => (
                  <div
                    key={identity.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-3">
                      {getProviderIcon(identity.provider)}
                      <div className="flex flex-col gap-0.5">
                        <p className="text-sm font-medium capitalize">
                          {identity.provider}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("connectedOn")}: {formatDate(identity.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {identity.last_sign_in_at && (
                        <p>{t("lastUsed")}: {formatDate(identity.last_sign_in_at)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <div className="border-t border-border"></div>
          </>
        )}

        <section>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors cursor-pointer text-sm"
          >
            {t("signOut")}
          </button>
        </section>
      </div>
    </div>
  );
}
