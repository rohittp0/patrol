import type { AnalyticsParams } from "./events";

/** Auth fields used by telemetry. The uid is identity only, never an event property. */
export interface EventAccount {
  uid: string;
  isAnonymous: boolean;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  providerData: readonly { providerId: string; email?: string | null; displayName?: string | null }[];
}

export function accountProperties(user: EventAccount | null): AnalyticsParams {
  if (!user || user.isAnonymous) return { signed_in: false };
  const email = user.email || user.providerData.find(provider => provider.email)?.email;
  const name = user.displayName || user.providerData.find(provider => provider.displayName)?.displayName;
  return {
    signed_in: true,
    ...(email ? { email: email.slice(0, 254) } : {}),
    ...(name ? { name: name.slice(0, 100) } : {}),
    email_verified: user.emailVerified,
    ...(user.providerData[0]?.providerId
      ? { auth_provider: user.providerData[0].providerId.slice(0, 40) }
      : {}),
  };
}
