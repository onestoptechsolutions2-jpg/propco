import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Credentials provider requires JWT sessions; the adapter still links
  // Google accounts to Users and stores them in the DB as normal.
  // 90-day rolling session so an installed app stays signed in.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
  // Required behind any reverse proxy (Coolify's Traefik, Nginx, etc.) —
  // without this, Auth.js rejects incoming requests with
  // "UntrustedHost: Host must be trusted" because the Host header it sees
  // doesn't match what it expects from a direct connection. Safe here
  // specifically because the proxy in front of this app is trusted
  // infrastructure, not arbitrary user input.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Google verifies email ownership, so it is safe to attach a Google
      // login to an existing account with the same email (e.g. one created
      // by email/password or by a team invite). Without this, Auth.js throws
      // OAuthAccountNotLinked.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Also refresh while orgId is missing so a brand-new user's token picks
      // it up right after onboarding/signup without signing out and in.
      if (user || (token.sub && !token.orgId)) {
        // On first sign-in, `user` comes from `authorize()` (credentials)
        // or is created via the adapter (Google) — either way, look up role
        // fresh from the DB so it's always current.
        const dbUser = await prisma.user.findUnique({
          where: { id: (user?.id ?? token.sub) as string },
          select: { role: true, ownerId: true, orgId: true },
        });
        token.role = dbUser?.role ?? "STAFF";
        token.ownerId = dbUser?.ownerId ?? null;
        token.orgId = dbUser?.orgId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as Role;
        session.user.ownerId = (token.ownerId as string | null) ?? null;
        session.user.orgId = (token.orgId as string | null) ?? null;
      }
      return session;
    },
  },
});
