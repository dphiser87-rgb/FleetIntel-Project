import * as SecureStore from "expo-secure-store";

// Access + refresh tokens are credentials, not app state -- SecureStore (Keychain/Keystore-backed),
// not AsyncStorage.
const ACCESS_KEY = "fleetintel.token";
const REFRESH_KEY = "fleetintel.refresh_token";

export async function getTokens() {
  const [token, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return { token, refreshToken };
}

export async function setTokens({ token, refreshToken }) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, token),
    refreshToken ? SecureStore.setItemAsync(REFRESH_KEY, refreshToken) : Promise.resolve(),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
