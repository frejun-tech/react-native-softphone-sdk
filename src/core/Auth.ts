import {
    isTokenValid
} from "../utils/validation";
import * as Exceptions from '../exceptions';
import {
    BASE_URL
} from "../constants";
import type { TokenData } from "../services/TokenManager";
import { TokenManager } from "../services/TokenManager";
import { Linking } from "react-native";
import { Buffer } from 'buffer';

export interface SipCredentials {
    username: string;
    accessToken: string; // This is the SIP token
}

class Auth {
    #accessToken: string | null = null;
    #refreshToken: string | null = null;
    #email: string | null = null;
    public permissions: any[] = [];
    public sipUsername: string | null = null;
    public sipToken: string | null = null;

    public constructor(tokenData?: TokenData) {
        if (tokenData) {
            this.#accessToken = tokenData.accessToken;
            this.#refreshToken = tokenData.refreshToken;
            this.#email = tokenData.email;
        }
    }

    /**
     * Initializes and attempts to restore a session from storage.
     * @returns An authenticated Auth instance if successful, otherwise null.
     */
    public static async initialize(): Promise<Auth | null> {
        console.log('Auth: Initializing...');
        const tokenData = await TokenManager.get();

        if (tokenData && isTokenValid(tokenData.accessToken) === true) {
            console.log('Auth: Session restored from storage.');
            const auth = new Auth(tokenData);
            try {
                // After restoring the session, we must verify permissions.
                await auth.retrieveUserRoles();
                console.log('Auth: Session restored and permissions verified.');
                return auth;
            } catch (error) {
                // If permission is denied or token is invalid on the server-side, treat as logged out.
                console.error('Auth: Failed to verify roles for restored session.', error);
                await TokenManager.clear(); // Clean up invalid session
                return null;
            }
        }

        console.log('Auth: No valid session found in storage.');
        // If tokens exist but are expired, clear them
        if (tokenData) {
            await TokenManager.clear();
        }
        return null;
    }

    public async login({ clientId }: { clientId: string }): Promise<void> {
        await Linking.openURL(`https://dev.frejun.com/oauth/authorize/?client_id=${clientId}`);
    }

    /**
     * Handles the redirect from the OAuth provider and completes the login.
     * @param url The redirect URL received via deep linking.
     */
    public async handleRedirect(url: string, { clientId, clientSecret }: { clientId: string, clientSecret: string }): Promise<void> {
        console.log("Auth: Handling redirect URL...");
        // ... (logic to parse code and email from URL is unchanged)
        const queryString = url.split('?')[1];
        console.log(`Auth: Extracted query string - ${queryString}`);
        if (!queryString) throw new Exceptions.InvalidValueException('handleRedirect', 'url', url);
        console.log('Auth: Parsing query parameters...');
        const params = new URLSearchParams(queryString);
        console.log('Auth: Query parameters parsed successfully.');
        const code = params.get('code');
        console.log(`Auth: Extracted code - ${code}`);
        const email = params.get('email') ? decodeURIComponent(params.get('email')!) : null;
        console.log(`Auth: Extracted email - ${email}`);
        if (!code || !email) throw new Exceptions.MissingParameterException('handleRedirect', ['code', 'email']);
        console.log('Auth: Exchanging code for tokens...');

        // It now uses the passed-in credentials
        const tokenData = await this.exchangeCodeForToken(code, clientId, clientSecret);
        console.log('Auth: Token exchange successful.');

        this.#accessToken = tokenData.access_token;
        this.#refreshToken = tokenData.refresh_token;
        this.#email = email;

        console.log('Auth: Retrieving user roles and permissions...');

        await this.retrieveUserRoles();

        console.log('Auth: Login process completed successfully. Saving session to storage...');

        await TokenManager.save({ accessToken: this.#accessToken, refreshToken: this.#refreshToken, email: this.#email });
        console.log('Auth: Session saved to storage.');
    }

    public async registerSoftphone(): Promise<SipCredentials> {
        console.log('in registerSoftphone');

        if (!this.#accessToken || !this.#email) {
            throw new Exceptions.UnauthorizedException('retrieveUserRoles', 'Access token or email is missing.');
        }

        const tokenValidity = isTokenValid(this.#accessToken);

        console.log(`Auth: Access token validity - ${tokenValidity}`);

        if (tokenValidity && typeof tokenValidity !== 'boolean') {
            throw new Exceptions.InvalidTokenException('registerSoftphone', tokenValidity);
        }

        const res = await fetch(BASE_URL + `/calls/register-softphone/?email=${encodeURIComponent(this.#email)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.#accessToken}`
            }
        });

        if (res.status === 401) {
            throw new Exceptions.InvalidTokenException('retrieveUserRoles', 'INVALID');
        }
        if (!res.ok) {
            throw new Exceptions.UnknownException('retrieveUserRoles', `Server responded with status ${res.status}`);
        }

        const response = await res.json();
        if (!response.success) {
            throw new Exceptions.UnknownException('retrieveUserRoles', response.message);
        }

        this.sipUsername = response.username;
        this.sipToken = response.access_token;
        console.log('Auth: SIP credentials retrieved successfully.');

        return { username: response.username, accessToken: response.access_token };
    }

    public async retrieveUserProfile(): Promise<string> {
        console.log('Auth: Retrieving user profile for edge domain...');
        if (!this.#accessToken || !this.#email) throw new Exceptions.UnauthorizedException('retrieveUserProfile', 'Access token or email is missing.');
        if (isTokenValid(this.#accessToken) !== true) throw new Exceptions.InvalidTokenException('retrieveUserProfile', 'EXPIRED');

        const res = await fetch(`${BASE_URL}/integrations/profile/?email=${encodeURIComponent(this.#email)}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${this.#accessToken}` }
        });

        if (res.status === 401) throw new Exceptions.InvalidTokenException('retrieveUserProfile', 'INVALID');
        if (!res.ok) throw new Exceptions.UnknownException('retrieveUserProfile', `Server responded with status ${res.status}`);

        const response = await res.json();
        if (!response.success || !response.data?.edge_domain) {
            throw new Exceptions.UnknownException('retrieveUserProfile', response.message || 'Edge domain not found.');
        }

        console.log(`Auth: Edge domain is ${response.data.edge_domain}`);
        return response.data.edge_domain;
    }

    /**
     * Fetches user roles and permissions from the server and validates SDK access.
     * Throws PermissionDeniedException if the user is not allowed to use the SDK.
     */
    public async retrieveUserRoles(): Promise<void> {
        console.log('Auth: Retrieving user roles and permissions...');

        if (!this.#accessToken || !this.#email) {
            throw new Exceptions.UnauthorizedException('retrieveUserRoles', 'Access token or email is missing.');
        }

        const tokenValidity = isTokenValid(this.#accessToken);

        console.log(`Auth: Access token validity - ${tokenValidity}`);

        if (tokenValidity && typeof tokenValidity !== 'boolean') {
            throw new Exceptions.InvalidTokenException('Softphone.login', tokenValidity);
        }

        const res = await fetch(`${BASE_URL}/auth/retrieve-user-roles/?email=${encodeURIComponent(this.#email)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.#accessToken}`
            }
        });

        if (res.status === 401) {
            throw new Exceptions.InvalidTokenException('retrieveUserRoles', 'INVALID');
        }
        if (!res.ok) {
            throw new Exceptions.UnknownException('retrieveUserRoles', `Server responded with status ${res.status}`);
        }

        const response = await res.json();
        if (!response.success) {
            throw new Exceptions.UnknownException('retrieveUserRoles', response.message);
        }

        this.permissions = response?.data?.map((role: any) => role.permissions)?.flat(2) || [];

        // CRITICAL: Check if the user has the specific permission to use this SDK
        const hasSDKPermission = this.permissions.find(p => p.action === "integrations (iframe and sdk)");

        if (!hasSDKPermission) {
            this.logout();
            // If they don't have permission, the login process fails here.
            throw new Exceptions.PermissionDeniedException('retrieveUserRoles', 'User does not have permission to use the SDK.');
        }

        console.log('Auth: SDK access permission verified.');
    }

    /**
     * Logs out the user and clears the session.
     */
    public async logout(): Promise<void> {
        this.#accessToken = null;
        this.#refreshToken = null;
        this.#email = null;
        this.permissions = [];
        await TokenManager.clear();
        console.log('Auth: Logged out.');
    }

    // --- Getters for state and tokens ---
    public isLoggedIn(): boolean {
        console.log('Auth: Checking login status...');
        return !!this.#accessToken && this.permissions.length > 0;
    }

    public getAccessToken(): string | null {
        // You could add logic here to check for expiry and auto-refresh
        return this.#accessToken;
    }

    public getPermissions(): any[] {
        return this.permissions;
    }

    private async exchangeCodeForToken(code: string, clientId: string, clientSecret: string): Promise<{ access_token: string, refresh_token: string }> {
        console.log('Auth: Exchanging authorization code for tokens...');
        try {
            const credentials = `${clientId}:${clientSecret}`;
            console.log(`Auth: Using credentials - ${credentials}`);
            const encodedCredentials = Buffer.from(credentials).toString('base64');
            console.log(`Auth: Encoded credentials - ${encodedCredentials}`);
            const url = `${BASE_URL}/oauth/token/?code=${code}`;
            console.log(`Auth: Token endpoint URL - ${url}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${encodedCredentials}` },
            });

            console.log(`Auth: Token endpoint response status - ${response.status}`);

            const data = await response.json();
            if (response.ok && data.success) {
                return { access_token: data.access_token, refresh_token: data.refresh_token };
            } else {
                throw new Exceptions.UnauthorizedException('exchangeCodeForToken', data.message);
            }

        } catch (error) {
            console.error('Auth: Error in exchangeCodeForToken:', error);

            // If we already threw a specific SDK exception, rethrow it
            if (error instanceof Exceptions.UnauthorizedException) {
                throw error;
            }

            // Catch generic network errors (e.g., "Network request failed") or JSON syntax errors
            throw new Exceptions.UnknownException(
                'exchangeCodeForToken',
                error instanceof Error ? error.message : 'Unknown error during token exchange'
            );
        }
    }

    get getSipToken() {
        return this.sipToken
    }

    get getEmail(): string | null {
        return this.#email;
    }

}

export default Auth;