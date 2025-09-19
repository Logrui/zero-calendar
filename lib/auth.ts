import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { kv } from "@/lib/kv-config"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { getServerSession } from "next-auth/next"

// Define a User type for better type safety
interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  password?: string | null;
  [key: string]: any; // Allow other properties
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar",
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await getUserByEmail(credentials.email)

        if (!user) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password)

        if (!isPasswordValid) {
          return null
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      console.log("[Auth] JWT Callback triggered!");
      console.log("[Auth] Has account:", !!account);
      console.log("[Auth] Has user:", !!user);
      console.log("[Auth] Account provider:", account?.provider);
      
      if (account && user) {
        console.log("[Auth] JWT Callback: Account and User found, processing new sign-in...");
        console.log("[Auth] JWT Callback: Account details", account);

        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.provider = account.provider;
        token.id = user.id;

        // Persist the user's credentials and provider info to the database
        try {
          console.log(`[Auth] JWT Callback: Saving credentials for user ${user.id} to KV store...`);
          await kv.hset(`user:${user.id}`, {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            expiresAt: account.expires_at,
            provider: account.provider,
          });
          console.log("[Auth] JWT Callback: Successfully saved credentials.");
        } catch (error) {
          console.error("[Auth] JWT Callback: Error saving user data to KV store:", error);
        }
      } else if (token.id && token.accessToken && token.refreshToken && token.provider) {
        console.log("[Auth] JWT Callback: Existing session with credentials, checking if saved to Redis...");
        
        // Check if user data exists in Redis, if not, save it
        try {
          const existingData = await kv.hgetall(`user:${token.id}`);
          if (!existingData || !existingData.accessToken) {
            console.log(`[Auth] JWT Callback: User ${token.id} not found in Redis, saving from existing token...`);
            await kv.hset(`user:${token.id}`, {
              id: token.id,
              accessToken: token.accessToken,
              refreshToken: token.refreshToken,
              expiresAt: token.expiresAt,
              provider: token.provider,
            });
            console.log("[Auth] JWT Callback: Successfully saved existing credentials to Redis.");
          } else {
            console.log("[Auth] JWT Callback: User credentials already exist in Redis.");
          }
        } catch (error) {
          console.error("[Auth] JWT Callback: Error checking/saving existing credentials:", error);
        }
      } else {
        console.log("[Auth] JWT Callback: No account/user and no existing credentials in token");
      }

      return token
    },
    async session({ session, token }) {
      console.log("[Auth] Session Callback triggered!");
      console.log("[Auth] Session user ID:", token.id);
      console.log("[Auth] Session has accessToken:", !!token.accessToken);
      session.user.id = token.id as string
      session.user.accessToken = token.accessToken as string
      session.user.refreshToken = token.refreshToken as string
      session.user.expiresAt = token.expiresAt as number
      session.user.provider = token.provider as string
      return session
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const userId = (await kv.get(`email:${email}`)) as string | null;
  if (!userId) return null;

  const user = await kv.hgetall<User>(`user:${userId}`);
  return user ? { ...user, id: userId } : null;
}

export async function createUser(name: string, email: string, password: string) {
  const hashedPassword = await bcrypt.hash(password, 10)
  const randomString = crypto.randomBytes(6).toString("base64url") // Generate a secure random string
  const userId = `user_${Date.now()}_${randomString}`

  await kv.hset(`user:${userId}`, {
    id: userId,
    name,
    email,
    password: hashedPassword,
    createdAt: Date.now(),
  })

  await kv.set(`email:${email}`, userId)

  return { id: userId, name, email }
}

export async function saveUserPreferences(userId: string, preferences: any) {

  if (!preferences.timezone) {
    try {

      preferences.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    } catch (error) {
      preferences.timezone = "UTC"
    }
  }

  await kv.hset(`user:${userId}`, { preferences: JSON.stringify(preferences) })
}

export async function getUserPreferences(userId: string) {
  const data = await kv.hgetall(`user:${userId}`)
  return data?.preferences ? JSON.parse(data.preferences as string) : {}
}


export async function getUserTimezone(userId: string): Promise<string> {
  try {
    const userData = await kv.hgetall(`user:${userId}`)
    if (userData?.preferences) {
      const preferences = JSON.parse(userData.preferences as string)
      return preferences.timezone || "UTC"
    }
    return "UTC"
  } catch (error) {
    console.error("Error getting user timezone:", error)
    return "UTC"
  }
}


export async function auth() {
  return await getServerSession(authOptions)
}
