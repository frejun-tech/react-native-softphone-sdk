import EncryptedStorage from 'react-native-encrypted-storage';
import { AUTH_TOKEN_STORAGE_KEY } from '../constants';

export interface TokenData {
    accessToken: string;
    refreshToken: string;
    email: string;
}

export class TokenManager {
    public static async save(tokenData: TokenData): Promise<void> {
        try {
            await EncryptedStorage.setItem(AUTH_TOKEN_STORAGE_KEY, JSON.stringify(tokenData));
            console.log('TokenManager: Tokens saved successfully.');
        } catch (error) {
            console.error('TokenManager: Failed to save tokens.', error);
        }
    }

    public static async get(): Promise<TokenData | null> {
        try {
            const jsonString = await EncryptedStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
            if (jsonString) {
                return JSON.parse(jsonString) as TokenData;
            }
            return null;
        } catch (error) {
            console.error('TokenManager: Failed to retrieve tokens.', error);
            return null;
        }
    }

    public static async clear(): Promise<void> {
        try {
            await EncryptedStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            console.log('TokenManager: Tokens cleared successfully.');
        } catch (error) {
            console.error('TokenManager: Failed to clear tokens.', error);
        }
    }
}