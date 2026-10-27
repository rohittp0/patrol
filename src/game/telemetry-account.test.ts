import test from "node:test";
import assert from "node:assert/strict";
import { accountProperties, type EventAccount } from "../telemetry/account";
import { POSTHOG_CONFIG, POSTHOG_TOKEN } from "../telemetry/posthog.config";
import { COLLECTED_EVENTS, PERFORMANCE_TRACES } from "../telemetry/events";

const user: EventAccount = {
  isAnonymous: false, email: "officer@example.test", displayName: "Officer Ada",
  emailVerified: true, providerData: [{ providerId: "google.com" }],
};
test("signed-in event properties use the requested Auth fields only", () => {
  assert.deepEqual(accountProperties({ ...user, ...{ uid: "private", accessToken: "private", photoURL: "private" } }), {
    signed_in: true, email: "officer@example.test", name: "Officer Ada",
    email_verified: true, auth_provider: "google.com",
  });
  assert.equal(accountProperties({ ...user, displayName: null, providerData: [{ providerId: "google.com", displayName: "Linked name" }] }).name, "Linked name");
  assert.deepEqual(accountProperties(null), { signed_in: false });
  assert.deepEqual(accountProperties({ ...user, isAnonymous: true }), { signed_in: false });
  assert.deepEqual(accountProperties({ ...user, email: null, displayName: null, providerData: [] }), { signed_in: true, email_verified: true });
});
test("every funnel and timing event retains signed-in account properties without creating a person", () => {
  for (const event of [...COLLECTED_EVENTS, ...Object.keys(PERFORMANCE_TRACES)]) {
    const sent = POSTHOG_CONFIG.before_send({
      uuid: crypto.randomUUID(), event,
      properties: { token: POSTHOG_TOKEN, ...accountProperties(user), uid: "private", accessToken: "private", photoURL: "private", $set: { email: "private" } },
    });
    assert(sent);
    for (const [key, value] of Object.entries(accountProperties(user))) assert.equal(sent.properties[key], value, event);
    assert.equal(sent.properties.$process_person_profile, false);
    assert.equal(sent.properties.$is_identified, false);
    assert(!JSON.stringify(sent).includes("private"));
  }
});
test("guest transport drops account details and account snapshots cannot leak after sign-out", () => {
  const signedIn = accountProperties(user);
  const guest = accountProperties(null);
  const sent = POSTHOG_CONFIG.before_send({ uuid: crypto.randomUUID(), event: "page_view", properties: { ...signedIn, ...guest } });
  assert(sent);
  assert.equal(sent.properties.signed_in, false);
  for (const key of ["email", "name", "email_verified", "auth_provider"]) assert.equal(sent.properties[key], undefined);
  assert.equal(signedIn.email, user.email);
});
