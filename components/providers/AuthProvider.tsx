"use client";

import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export interface UserSession {
  user: User;
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

    const loadAuthenticatedUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (isMounted) {
        setSession(user ? { user } : null);
      }
    };

    loadAuthenticatedUser().catch(() => {
      if (isMounted) setSession(null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        return;
      }
      loadAuthenticatedUser().catch(() => {
        if (isMounted) setSession(null);
      });
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
