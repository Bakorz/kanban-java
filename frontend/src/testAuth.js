import { vi } from 'vitest';
export const testSession = { access_token: 'unit-test-token', user: { id: 'test-user', email: 'person@example.test' } };
export function mockAuth(initial = null) {
  let session = initial;
  const listeners = new Set();
  const emit = (event, next) => { session = next; listeners.forEach((fn) => fn(event, next)); };
  const unsubscribe = vi.fn();
  const client = { auth: {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((callback) => { listeners.add(callback); return { data: { subscription: { unsubscribe: () => { unsubscribe(); listeners.delete(callback); } } } }; }),
    signInWithPassword: vi.fn(async () => { emit('SIGNED_IN', testSession); return { data: { session: testSession }, error: null }; }),
    signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    updateUser: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => { emit('SIGNED_OUT', null); return { error: null }; }),
    refreshSession: vi.fn(async () => ({ data: { session }, error: null })),
  } };
  return { client, emit, unsubscribe };
}
