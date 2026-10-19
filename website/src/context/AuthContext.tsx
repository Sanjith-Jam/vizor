import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import type { UserProfile } from "../types";

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isDemoMode: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isDemoMode = !isSupabaseConfigured;

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email || "",
            name:
              session.user.user_metadata?.name ||
              session.user.email?.split("@")[0] ||
              "Rider",
          });
        }
        setLoading(false);
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email || "",
            name:
              session.user.user_metadata?.name ||
              session.user.email?.split("@")[0] ||
              "Rider",
          });
        } else {
          setUser(null);
        }
        setLoading(false);
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      // Local demo mode for unconfigured environment
      const stored = null;
      localStorage.removeItem("vizor_demo_user");
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {
          localStorage.removeItem("vizor_demo_user");
        }
      }
      setLoading(false);
    }
  }, []);

  const signIn = async (
    email: string,
    password: string,
  ): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };
      if (data.session && data.user) {
        setUser({
          id: data.user.id,
          email: data.user.email || "",
          name:
            data.user.user_metadata?.name ||
            data.user.email?.split("@")[0] ||
            "Rider",
        });
      }
      return { error: null };
    } else {
      return {
        error: "Live accounts are not configured. Explore the demo instead.",
      };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
  ): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });
      if (error) return { error: error.message };
      if (data.session && data.user) {
        setUser({
          id: data.user.id,
          email: data.user.email || "",
          name: name || data.user.email?.split("@")[0] || "Rider",
        });
      }
      return { error: null };
    } else {
      return {
        error: "Live accounts are not configured. Explore the demo instead.",
      };
    }
  };

  const signOut = async (): Promise<void> => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem("vizor_demo_user");
    }
    setUser(null);
  };

  const resetPassword = async (
    email: string,
  ): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return { error: error ? error.message : null };
    } else {
      return { error: "Password reset is not configured." };
    }
  };

  const updatePassword = async (
    password: string,
  ): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.updateUser({ password });
      return { error: error ? error.message : null };
    } else {
      return { error: null };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isDemoMode,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
