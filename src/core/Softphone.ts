import { BASE_URL } from '../constants';
import * as Exceptions from '../exceptions';
import type { Listeners } from '../types';
import { validatePhoneNumber } from '../utils/validation';
import Auth from './Auth';
import type { VirtualNumber } from './Auth';
import UserAgent from './UserAgent';
import { TokenManager } from "../services/TokenManager";
import { AppState, type AppStateStatus } from 'react-native';

class Softphone {
    static #clientId: string | null = null;
    static #clientSecret: string | null = null;
    static #isInitialized = false;
    #primaryVN: any;
    #server: any;
    #clientListeners: any;
    #appStateSubscription: any;

    #auth: Auth;
    #userAgent: UserAgent | null = null;

    private constructor(auth: Auth) { this.#auth = auth; }

    public static async initialize({ clientId, clientSecret }: { clientId: string, clientSecret: string }): Promise<Softphone | null> {
        if (!clientId || !clientSecret) throw new Exceptions.MissingParameterException('initialize', ['clientId', 'clientSecret']);
        this.#clientId = clientId;
        this.#clientSecret = clientSecret;
        this.#isInitialized = true;

        const auth = await Auth.initialize();
        if (auth) {
            const softphone = new Softphone(auth);
            try {
                await auth.retrieveUserRoles();
                return softphone;
            } catch (e) {
                console.log('Softphone: Token might be expired on initialize. Attempting refresh...');
                const refreshed = await auth.refreshAccessToken(clientId, clientSecret);
                if (refreshed) return softphone;
                await TokenManager.clear();
                return null;
            }
        }
        return null;
    }

    public static async login(): Promise<void> {
        this.ensureInitialized('login');
        const tempAuth = new Auth();
        await tempAuth.login({ clientId: this.#clientId! });
    }

    public static async handleRedirect(url: string): Promise<Softphone> {
        this.ensureInitialized('handleRedirect');
        const auth = new Auth();
        await auth.handleRedirect(url, { clientId: this.#clientId!, clientSecret: this.#clientSecret! });
        if (auth.isLoggedIn()) return new Softphone(auth);
        throw new Exceptions.UnauthorizedException('handleRedirect', 'Authentication failed.');
    }

    private async executeWithRetry<T>(action: () => Promise<T>): Promise<T> {
        try {
            return await action();
        } catch (error) {
            if (error instanceof Exceptions.InvalidTokenException) {
                console.log('Softphone: ⚠️ Caught 401. Initiating Auto-Refresh...');
                if (!Softphone.#clientId || !Softphone.#clientSecret) throw new Exceptions.UnauthorizedException('executeWithRetry', 'Missing Credentials');
                const success = await this.#auth.refreshAccessToken(Softphone.#clientId, Softphone.#clientSecret);
                if (success) return await action();
                await this.logout();
                throw new Exceptions.UnauthorizedException('executeWithRetry', 'Session expired.');
            }
            throw error;
        }
    }

    public async start(listeners: Listeners): Promise<void> {
        return this.executeWithRetry(async () => {
            this.ensureLoggedIn('start');
            if (this.#userAgent) return;

            const sipCredentials = await this.#auth.registerSoftphone();
            const edgeDomain = await this.#auth.retrieveUserProfile();

            this.#server = edgeDomain;
            this.#clientListeners = listeners;

            const config = { auth: this.#auth, listeners, sipCredentials, edgeDomain };
            if (!this.#userAgent) {
                this.#userAgent = new UserAgent(config);
                await this.#userAgent.startUA();
            }

            if (!this.#appStateSubscription) {
                console.log('Softphone: Setting up AppState listener for auto-reconnect.');
                this.#appStateSubscription = AppState.addEventListener('change', this.#handleAppStateChange);
            }
        });
    }

    #handleAppStateChange = async (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
            console.log('Softphone: App came to FOREGROUND. Checking connection...');
            if (this.#userAgent) {
                // Small delay to allow network to wake up
                setTimeout(async () => {
                    await this.#userAgent?.reconnect();
                }, 1000);
            }
        } else if (nextAppState === 'background') {
            console.log('Softphone: App went to BACKGROUND.');
            // Note: On iOS, the socket WILL die here unless you use VoIP Push.
            // On Android, it might survive if you use a Foreground Service (see below).
        }
    };

    public async connect(): Promise<void> {
        this.ensureLoggedIn('connect');
        console.log('Softphone: Manual connection requested.');

        if (this.#userAgent) {
            await this.#userAgent.reconnect();
        } else if (this.#clientListeners) {
            // If UA was destroyed or never started, do a full start
            await this.start(this.#clientListeners);
        } else {
            console.warn('Softphone: Cannot connect. Call start(listeners) at least once first.');
        }
    }

    get primaryVN() {
        return this.#primaryVN;
    }

    /**
         * Initiates an outbound call.
         * @param number The destination phone number (e.g., "+91...")
         * @param virtualNumber (Optional) The caller ID to use. If omitted, uses the user's default.
         * @param options Additional options for the call.
         */
    public async makeCall(number: any, virtualNumber?: string | null, options = {}) {
        // Wrap logic in retry mechanism (handles 401s automatically)
        return this.executeWithRetry(async () => {
            this.ensureLoggedIn('makeCall');

            // 1. Permission Check
            if (!this.#auth.permissions.find(p => p.action === 'outbound calls')) {
                throw new Exceptions.PermissionDeniedException('Softphone.makeCall', 'You do not have permission to make outbound calls');
            }

            // 2. Destination Validation
            if (!number || !number.trim()?.length) {
                throw new Exceptions.MissingParameterException('Softphone.makeCall', ['number']);
            }

            if (!validatePhoneNumber(number)) {
                throw new Exceptions.InvalidValueException(
                    'Softphone.makeCall', 
                    'number', 
                    number, 
                    ['E.164 format (e.g., +[Country Code][Number])']
                );
            }

            // 3. Determine the "From" Number (Caller ID)
            const currentProfileVN = this.#auth.getPrimaryVN; // Retrieved from Auth cache
            const targetVirtualNumber = virtualNumber || currentProfileVN;

            if (!targetVirtualNumber) {
                // Fail if user didn't provide one AND we couldn't find one in the profile
                throw new Exceptions.MissingParameterException('Softphone.makeCall', ['virtualNumber (Not provided and not found in profile)']);
            }

            console.log(`Softphone: Initiating call. To: ${number}, From: ${targetVirtualNumber}`);

            // 4. Handle Virtual Number Switching
            // We only hit the API if the user EXPLICITLY requested a specific number (virtualNumber is set)
            // AND that number is different from what is currently active on the profile.
            if (virtualNumber && currentProfileVN && virtualNumber !== currentProfileVN) {
                console.log(`Softphone: Requested VN (${virtualNumber}) differs from Profile VN (${currentProfileVN}). Updating profile...`);

                const response = await this.#updatePrimaryVirtualNumber(virtualNumber);

                // If the update caused an Edge Domain change (server switch), reconnect WS
                if (response?.edgeDomain && response.edgeDomain !== this.#server) {
                    console.log('Softphone: Edge domain changed. Reconnecting...');
                    await this.#handleEdgeDomainChange(response.edgeDomain);
                }
            }

            // 5. Execute Call
            // The SIP Invite doesn't explicitly need the 'from' number here because 
            // the server uses the configured Primary VN (which we just ensured is correct above).
            return await this.#userAgent?.makeCall(number, options);
        });
    }



    /**
     * Returns the list of virtual numbers available to the user.
     */
    public getVirtualNumbers(): VirtualNumber[] {
        this.ensureLoggedIn('getVirtualNumbers');
        return this.#auth.getVirtualNumbers;
    }

    async #updatePrimaryVirtualNumber(virtualNumber: any) {
        const Url = BASE_URL + `/v1/auth/update-userprofile/?email=${encodeURIComponent(this.#auth.getEmail || "")}`;
        const response = await fetch(Url, {
            method: 'PATCH',
            headers: { 'authorization': `Bearer ${this.#auth.getAccessToken()}`, 'Content-type': 'application/json' },
            body: JSON.stringify({ 'primary_vn': virtualNumber })
        });
        if (response.status === 401) throw new Exceptions.InvalidTokenException('updatePrimaryVirtualNumber', 'EXPIRED');
        const responseData = await response.json();
        if (response.status !== 200) throw new Exceptions.UnknownException('Softphone.makeCall', JSON.stringify(responseData.message || ''));

        this.#primaryVN = responseData.data?.primary_virtual_number?.country_code + responseData.data?.primary_virtual_number?.number;
        return { success: true, edgeDomain: responseData.data?.edge_domain };
    }

    public async logout(): Promise<void> {

        if (this.#appStateSubscription) {
            this.#appStateSubscription.remove();
            this.#appStateSubscription = null;
        }

        if (this.#userAgent) {
            await this.#userAgent.stopUA();
            this.#userAgent = null;
        }
        await this.#auth.logout();
    }

    private static ensureInitialized(methodName: string): void {
        console.log('Softphone: Ensuring initialized...', methodName);
        if (!this.#isInitialized) throw new Error(`Softphone SDK not initialized.`);
    }

    private ensureLoggedIn(methodName: string): void {
        if (!this.#auth.isLoggedIn()) throw new Exceptions.UnauthorizedException(methodName, `Login is required.`);
    }

    async #handleEdgeDomainChange(edgeDomain: string) {
        if (!this.#userAgent) throw new Exceptions.UnknownException('Softphone', 'UserAgent not initialized');
        await this.#userAgent.unregister();
        await this.#userAgent.stopUA();
        this.#server = edgeDomain;
        this.#userAgent = null;

        const sipCredentials = await this.#auth.registerSoftphone();
        const config = { auth: this.#auth, listeners: this.#clientListeners, sipCredentials, edgeDomain };
        this.#userAgent = new UserAgent(config);
        await this.#userAgent.startUA();
    }
}

export default Softphone;