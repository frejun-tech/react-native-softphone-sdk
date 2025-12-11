import * as Exceptions from '../exceptions';
import { BASE_URL } from "../constants";
import type { TokenData } from "../services/TokenManager";
import { TokenManager } from "../services/TokenManager";
import { Linking } from "react-native";
import { Buffer } from 'buffer';
import { isTokenValid } from '../utils/validation';

export interface SipCredentials {
    username: string;
    accessToken: string;
}

export interface VirtualNumber {
    id: number;
    name: string;
    country_code: string;
    number: string;
    location: string;
    type: string;
    default_calling_number: boolean;
    default_sms_number: boolean;
}

class Auth {
    #accessToken: string | null = null;
    #refreshToken: string | null = null;
    #email: string | null = null;
    public permissions: any[] = [];
    public sipUsername: string | null = null;
    public sipToken: string | null = null;
    #virtualNumbers: VirtualNumber[] = [];
    #primaryVirtualNumber: string | null = null;

    public constructor(tokenData?: TokenData) {
        if (tokenData) {
            this.#accessToken = tokenData.accessToken;
            this.#refreshToken = tokenData.refreshToken;
            this.#email = tokenData.email;
        }
    }

    public static async initialize(): Promise<Auth | null> {
        console.log('Auth: Initializing...');
        const tokenData = await TokenManager.get();
        if (tokenData) {
            console.log('Auth: Session found in storage.');
            return new Auth(tokenData);
        }
        return null;
    }

public async manualLogin(accessToken: string, email: string, refreshToken: string): Promise<void> {
    console.log('Auth: processing manual login...');

    // 1. Validation: Added !refreshToken check requested by reviewer
    if (!accessToken || !email || !refreshToken) {
        throw new Exceptions.MissingParameterException('manualLogin', ['accessToken', 'email', 'refreshToken']);
    }

    const tokenValidationStatus = isTokenValid(accessToken);

    if (tokenValidationStatus !== true) {
        console.error(`Auth: Manual login failed. Token is ${tokenValidationStatus}`);
        throw new Exceptions.InvalidTokenException('manualLogin', tokenValidationStatus);
    }

    this.#accessToken = accessToken;
    this.#email = email;
    this.#refreshToken = refreshToken; // No longer nullable

    // Verify the provided token immediately by fetching roles
    try {
        console.log('Auth: Verifying provided access token...');
        await this.retrieveUserRoles();
    } catch (error) {
        console.error('Auth: Manual login failed verification.', error);
        this.#accessToken = null;
        this.#email = null;
        this.#refreshToken = null;
        throw error;
    }

    // If successful, persist to storage
    await TokenManager.save({
        accessToken: this.#accessToken!,
        refreshToken: this.#refreshToken!, 
        email: this.#email!
    });

    console.log('Auth: Manual session verified and saved.');
    }

    public async login({ clientId }: { clientId: string }): Promise<void> {
        await Linking.openURL(`https://product.frejun.com/oauth/authorize/?client_id=${clientId}`);
    }

    public async handleRedirect(url: string, { clientId, clientSecret }: { clientId: string, clientSecret: string }): Promise<void> {
        console.log("Auth: Handling redirect URL...");
        const queryString = url.split('?')[1];
        if (!queryString) throw new Exceptions.InvalidValueException('handleRedirect', 'url', url);

        const params = new URLSearchParams(queryString);
        const code = params.get('code');
        const email = params.get('email') ? decodeURIComponent(params.get('email')!) : null;

        if (!code || !email) throw new Exceptions.MissingParameterException('handleRedirect', ['code', 'email']);
        console.log('Auth: Exchanging code for tokens...');

        const tokenData = await this.exchangeCodeForToken(code, clientId, clientSecret);

        this.#accessToken = tokenData.access_token;
        this.#refreshToken = tokenData.refresh_token;
        this.#email = email;

        await this.retrieveUserRoles();
        await TokenManager.save({ accessToken: this.#accessToken, refreshToken: this.#refreshToken, email: this.#email });
        console.log('Auth: Session saved to storage.');
    }

    public async refreshAccessToken(clientId: string, clientSecret: string): Promise<boolean> {
        console.log('Auth: 🔄 Attempting to refresh access token...');
        if (!this.#refreshToken) return false;

        try {
            const credentials = `${clientId}:${clientSecret}`;
            const encodedCredentials = Buffer.from(credentials).toString('base64');

            const response = await fetch(`${BASE_URL}/oauth/token/refresh/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${encodedCredentials}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refresh: this.#refreshToken })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                console.log('Auth: ✅ Token refresh successful.');
                this.#accessToken = data.access;
                this.#refreshToken = data.refresh;

                if (this.#email) {
                    await TokenManager.save({
                        accessToken: this.#accessToken!,
                        refreshToken: this.#refreshToken!,
                        email: this.#email
                    });
                }
                await this.retrieveUserRoles();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Auth: Error during token refresh.', error);
            return false;
        }
    }

    public async registerSoftphone(): Promise<SipCredentials> {
        if (!this.#accessToken || !this.#email) {
            throw new Exceptions.InvalidTokenException('registerSoftphone', 'INVALID');
        }
        const res = await fetch(BASE_URL + `/calls/register-softphone/?email=${encodeURIComponent(this.#email)}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${this.#accessToken}` }
        });

        if (res.status === 401) throw new Exceptions.InvalidTokenException('registerSoftphone', 'EXPIRED');
        if (!res.ok) throw new Exceptions.UnknownException('registerSoftphone', `Server responded with status ${res.status}`);

        const response = await res.json();
        if (!response.success) throw new Exceptions.UnknownException('registerSoftphone', response.message);

        this.sipUsername = response.username;
        this.sipToken = response.access_token;
        return { username: response.username, accessToken: response.access_token };
    }

    public async retrieveUserProfile(): Promise<string> {
        console.log('Auth: Retrieving user profile...');
        if (!this.#accessToken || !this.#email) throw new Exceptions.InvalidTokenException('retrieveUserProfile', 'INVALID');

        const res = await fetch(`${BASE_URL}/integrations/profile/?email=${encodeURIComponent(this.#email)}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${this.#accessToken}` }
        });

        if (res.status === 401) throw new Exceptions.InvalidTokenException('retrieveUserProfile', 'EXPIRED');
        if (!res.ok) throw new Exceptions.UnknownException('retrieveUserProfile', `Server responded with status ${res.status}`);

        const response = await res.json();
        if (!response.success || !response.data?.edge_domain) throw new Exceptions.UnknownException('retrieveUserProfile', response.message || 'Edge domain not found.');

        if (Array.isArray(response.data.virtual_numbers)) {
            this.#virtualNumbers = response.data.virtual_numbers;
            console.log(`Auth: Stored ${this.#virtualNumbers.length} virtual numbers.`);

            // Find default
            const defaultVN = this.#virtualNumbers.find(vn => vn.default_calling_number === true);
            if (defaultVN) {
                this.#primaryVirtualNumber = `${defaultVN.country_code}${defaultVN.number}`;
            }
        }

        return response.data.edge_domain;
    }

    get getVirtualNumbers(): VirtualNumber[] {
        return this.#virtualNumbers;
    }

    get getPrimaryVN(): string | null {
        return this.#primaryVirtualNumber;
    }

    public async retrieveUserRoles(): Promise<void> {
        console.log('Auth: Retrieving user roles...');
        if (!this.#accessToken || !this.#email) throw new Exceptions.InvalidTokenException('retrieveUserRoles', 'INVALID');

        const res = await fetch(`${BASE_URL}/auth/retrieve-user-roles/?email=${encodeURIComponent(this.#email)}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${this.#accessToken}` }
        });

        if (res.status === 401) throw new Exceptions.InvalidTokenException('retrieveUserRoles', 'EXPIRED');
        if (!res.ok) throw new Exceptions.UnknownException('retrieveUserRoles', `Server responded with status ${res.status}`);

        const response = await res.json();
        this.permissions = response?.data?.map((role: any) => role.permissions)?.flat(2) || [];

        const hasSDKPermission = this.permissions.find(p => p.action === "integrations (iframe and sdk)");
        if (!hasSDKPermission) {
            await this.logout();
            throw new Exceptions.PermissionDeniedException('retrieveUserRoles', 'User does not have permission to use the SDK.');
        }
    }

    public async logout(): Promise<void> {
        this.#accessToken = null;
        this.#refreshToken = null;
        this.#email = null;
        this.permissions = [];
        await TokenManager.clear();
        console.log('Auth: Logged out.');
    }

    public isLoggedIn(): boolean {
        return !!this.#accessToken;
    }

    public getAccessToken(): string | null {
        return this.#accessToken;
    }

    public getPermissions(): any[] {
        return this.permissions;
    }

    private async exchangeCodeForToken(code: string, clientId: string, clientSecret: string): Promise<{ access_token: string, refresh_token: string }> {
        console.log('Auth: Exchanging authorization code for tokens...');
        try {
            const credentials = `${clientId}:${clientSecret}`;
            const encodedCredentials = Buffer.from(credentials).toString('base64');
            const url = `${BASE_URL}/oauth/token/?code=${code}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${encodedCredentials}` },
            });

            if (!response.ok) {
                let errorMessage = `Server responded with status ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData.message) errorMessage = errorData.message;
                } catch (e) { console.warn('Auth: JSON parse failed for error response'); }
                throw new Exceptions.UnauthorizedException('exchangeCodeForToken', errorMessage);
            }

            const data = await response.json();

            if (data.success) {
                return { access_token: data.access_token, refresh_token: data.refresh_token };
            } else {
                throw new Exceptions.UnauthorizedException('exchangeCodeForToken', data.message || 'Token exchange failed.');
            }
        } catch (error) {
            console.error('Auth: Error in exchangeCodeForToken:', error);
            if (error instanceof Exceptions.UnauthorizedException) throw error;
            throw new Exceptions.UnknownException('exchangeCodeForToken', error instanceof Error ? error.message : 'Unknown error');
        }
    }

    get getSipToken() { return this.sipToken }
    get getEmail(): string | null { return this.#email; }
}

export default Auth;