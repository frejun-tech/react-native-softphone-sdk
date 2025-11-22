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
        this.#accessToken = tokenData.access_token;
        this.#refreshToken = tokenData.refresh_token;
        this.#email = email;

        await this.retrieveUserRoles();

        await TokenManager.save({ accessToken: this.#accessToken, refreshToken: this.#refreshToken, email: this.#email });
    }

    public async registerSoftphone(): Promise<SipCredentials> {
        if (!this.#accessToken || !this.#email) {
            throw new Exceptions.UnauthorizedException('registerSoftphone', 'Access token or email is missing.');
        }

        const tokenValidity = isTokenValid(this.#accessToken);

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

        return { username: response.username, accessToken: response.access_token };
    }

    public async retrieveUserProfile(): Promise<string> {
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

    public async refreshAccessToken(clientId: string, clientSecret: string): Promise<boolean> {
        console.log('Auth: 🔄 Attempting to refresh access token...');

        try {
            // Header: Authorization: Bearer Base64Encoded(Client ID:Client Secret)
            const credentials = `${clientId}:${clientSecret}`;
            const encodedCredentials = Buffer.from(credentials).toString('base64');

            const response = await fetch(`${BASE_URL}/oauth/token/refresh/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${encodedCredentials}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    refresh: this.#refreshToken
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                console.log('Auth: ✅ Token refresh successful.');

                // 1. Update Local State
                this.#accessToken = data.access;
                this.#refreshToken = data.refresh;

                // 2. Save to Storage
                if (this.#email) {
                    await TokenManager.save({
                        accessToken: this.#accessToken!,
                        refreshToken: this.#refreshToken!,
                        email: this.#email
                    });
                }

                // 3. Refetch Permissions and Profile as requested
                console.log('Auth: 🔄 Refetching Roles and Profile after refresh...');
                await this.retrieveUserRoles();
                await this.retrieveUserProfile();

                return true;
            } else {
                console.error('Auth: Token refresh API failed.', data);
                return false;
            }
        } catch (error) {
            console.error('Auth: Error during token refresh.', error);
            return false;
        }

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
        const credentials = `${clientId}:${clientSecret}`;
        const encodedCredentials = Buffer.from(credentials).toString('base64');
        const url = `${BASE_URL}/oauth/token/?code=${code}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${encodedCredentials}` },
        });

        const data = await response.json();
        if (response.ok && data.success) {
            return { access_token: data.access_token, refresh_token: data.refresh_token };
        } else {
            throw new Exceptions.UnauthorizedException('exchangeCodeForToken', data.message);
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