"use client";

import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export interface UserSession extends Session {
  role?: string;
}

interface AuthContextValue {
  userSession: UserSession | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps extends PropsWithChildren {
  userSession?: UserSession | null;
}

export default function AuthProvider({ children, userSession = null }: AuthProviderProps) {
  const [session, setSession] = useState<UserSession | null>(userSession);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (isMounted) {
          setSession((data.session as UserSession | null) ?? null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSession(null);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession((nextSession as UserSession | null) ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ userSession: session }}>
      {children}
    </AuthContext.Provider>
  );
}
