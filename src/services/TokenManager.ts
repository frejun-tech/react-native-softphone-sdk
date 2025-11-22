import EncryptedStorage from 'react-native-encrypted-storage';
import { AUTH_TOKEN_STORAGE_KEY } from '../constants';

// Define a type for our stored data for clarity
export interface TokenData {
    accessToken: string;
    refreshToken: string;
    email: string;
}

export class TokenManager {

    /**
     * Securely saves token data.
     * @param tokenData The token data to store.
     */
    public static async save(tokenData: TokenData): Promise<void> {
        try {
            // 2. Use setItem with a key and a stringified value
            await EncryptedStorage.setItem(
                AUTH_TOKEN_STORAGE_KEY,
                JSON.stringify(tokenData)
            );
            console.log('TokenManager: Tokens saved successfully to EncryptedStorage.', tokenData);
        } catch (error) {
            console.error('TokenManager: Could not save tokens.', error);
            // Consider re-throwing or handling this error based on your SDK's strategy
        }
    }

    /**
     * Retrieves stored token data.
     * @returns The stored token data, or null if none is found.
     */
    public static async get(): Promise<TokenData | null> {
        try {
            // 3. Use getItem with the same key
            const jsonString = await EncryptedStorage.getItem(AUTH_TOKEN_STORAGE_KEY);

            if (jsonString) {
                console.log('TokenManager: Tokens retrieved successfully from EncryptedStorage.');
                // 4. Parse the string back into an object
                return JSON.parse(jsonString) as TokenData;
            }
            return null;
        } catch (error) {
            console.error('TokenManager: Could not retrieve tokens.', error);
            return null;
        }
    }

    /**
     * Clears all stored token data for the SDK.
    */
    public static async clear(): Promise<void> {
        try {
            // 5. Use removeItem to clear the specific key
            await EncryptedStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            console.log('TokenManager: Tokens cleared successfully from EncryptedStorage.');
        } catch (error) {
            console.error('TokenManager: Could not clear tokens.', error);
        }
    }

}
