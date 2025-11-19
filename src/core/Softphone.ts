import { BASE_URL } from '../constants';
import * as Exceptions from '../exceptions';
import type { Listeners } from '../types';
import { isTokenValid, validatePhoneNumber } from '../utils/validation';
import Auth from './Auth';
import UserAgent from './UserAgent';

class Softphone{

    static #clientId: string | null = null;
    static #clientSecret: string | null = null;
    static #isInitialized = false;
    #primaryVN:any;
    #server:any;
    #clientListeners:any;

    #auth: Auth;
    #userAgent: UserAgent | null = null;

    /**
     * The constructor is private.
     * Use the static methods Softphone.initialize() or Softphone.handleRedirect() to get an instance.
     */
    private constructor(auth: Auth) {
        this.#auth = auth;
        console.log('Softphone instance created for an authenticated session.');
    }

    /**
     * Configures the SDK with your credentials and tries to restore a session.
     * This method MUST be called once when your application starts.
     * @param credentials Your client ID and client secret.
     * @returns A Softphone instance if a valid session was restored, otherwise null.
     */
    public static async initialize(
        { 
            clientId, 
            clientSecret 
        }: { 
            clientId: string, 
            clientSecret: string 
        }): Promise<Softphone | null> 
        {
    if (!clientId || !clientSecret) {
        throw new Exceptions.MissingParameterException('initialize', ['clientId', 'clientSecret']);
    }
    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
    this.#isInitialized = true;
    console.log('Softphone SDK initialized with client credentials.');

    const auth = await Auth.initialize();
    if (auth) {
        return new Softphone(auth);
    }

    return null;
    
    }

    /**
     * Starts the OAuth login flow.
     * `initialize` must be called before this method.
     */
    public static async login(): Promise<void> {
        this.ensureInitialized('login');
        const tempAuth = new Auth();
        await tempAuth.login({ clientId: this.#clientId! });
    }

    /**
     * Handles the redirect from the OAuth provider and creates a new Softphone instance.
     * `initialize` must be called before this method.
     * @param url The redirect URL from a deep link.
     * @returns A new, authenticated Softphone instance.
     */
    public static async handleRedirect(url: string): Promise<Softphone> {
        console.log('Softphone.handleRedirect called with URL:', url);
        this.ensureInitialized('handleRedirect');
        console.log('Using stored clientId and clientSecret for handleRedirect.');
        const auth = new Auth();
        console.log('Auth instance created for handleRedirect.');
        // It now uses the statically stored credentials
        await auth.handleRedirect(
            url,
            {
                clientId: this.#clientId!, 
                clientSecret: this.#clientSecret! 
            }
        );

        console.log('Auth handleRedirect completed. Checking login status...');
        
        if (auth.isLoggedIn()) {
            console.log('Authentication successful in handleRedirect. Creating Softphone instance.');
            return new Softphone(auth);
        } else {
            throw new Exceptions.UnauthorizedException('handleRedirect', 'Authentication failed.');
        }
    }

    public async logout(): Promise<void> {
        await this.#auth.logout();
    }

    /**
     * A guard clause to ensure the SDK has been configured.
     * @param methodName The name of the method being called.
     */
    private static ensureInitialized(methodName: string): void {
        console.log('Checking if Softphone SDK is initialized for method:', methodName);
        if (!this.#isInitialized) {
            throw new Error(`Softphone SDK has not been initialized. Please call Softphone.initialize({ clientId, clientSecret }) before calling '${methodName}'.`);
        }
    }

    /**
     * A guard clause to ensure the user is authenticated.
     */
    private ensureLoggedIn(methodName: string): void {
        if (!this.#auth.isLoggedIn()) {
            throw new Exceptions.UnauthorizedException(methodName, `Login is required before calling '${methodName}'.`);
        }
    }

    /**
     * Starts the SIP User Agent, connects to the VoIP server, and registers the user.
     * This must be called after a successful login or session restoration.
     * @param listeners Event listeners for call states (onCallCreated, onCallRinging, etc.).
     */
    public async start(listeners: Listeners): Promise<void> {
        this.ensureLoggedIn('start');

        if (this.#userAgent) {
            console.warn('Softphone.start() called, but the User Agent is already running.');
            return;
        }

        try{
            console.log('Softphone: Starting...');
            const sipCredentials = await this.#auth.registerSoftphone();
            const edgeDomain = await this.#auth.retrieveUserProfile();

            this.#server = edgeDomain;

            this.#clientListeners = listeners;

            console.log('Softphone: SIP credentials and edge domain retrieved.', sipCredentials);
            console.log('Softphone: edgeDomain', edgeDomain);

            const config = {
                auth: this.#auth,
                listeners,
                sipCredentials,
                edgeDomain
            };

            console.log('Softphone: Initializing User Agent with config.', config);

            if(!this.#userAgent){
                this.#userAgent = new UserAgent(config);
                console.log('Softphone: User Agent initialized. Starting User Agent...',this.#userAgent);
                await this.#userAgent.startUA();
            }

        }catch(error){
            console.log('Softphone: Error during start process', error);
        }
    }

    isTokenValid(source='') {
        const isValid = isTokenValid(this.#auth.getAccessToken()||"");
        if(source && isValid !== true){
            throw new Exceptions.InvalidTokenException(source, isValid === "INVALID" ? "INVALID" : "EXPIRED");
        }
        return isValid;
    }

    public async makeCall(number:any,virtualNumber:any,options={}){
        try{
            this.ensureLoggedIn('makeCall');
            this.isTokenValid('Softphone.makeCall')
    
            if(!this.#auth.permissions.find(p => p.action === 'outbound calls')){
                throw new Exceptions.PermissionDeniedException('Softphone.makeCall', 'You do not have permission to make outbound calls');
            }
    
            if(!number || !number.trim()?.length){
                throw new Exceptions.MissingParameterException('Softphone.makeCall', ['number']);
            }
    
            if(!validatePhoneNumber(number)) {
                throw new Exceptions.InvalidValueException('Softphone.makeCall', 'number', number, ['[+][country calling code][national number]']);
            }
    
            console.log('in Softphone.makeCall');
            console.log('Making call to number:', number);
            console.log('Using virtual number:', virtualNumber);
            console.log('With options:', options);
            console.log('condition check :- ',(virtualNumber && this.#primaryVN !== virtualNumber))
    
            if(virtualNumber && this.#primaryVN !== virtualNumber){
    
              console.log('Primary virtual number differs from requested. Updating primary virtual number...');
    
              const response = await this.#updatePrimaryVirtualNumber(virtualNumber);
              console.log('Primary virtual number updated:', this.#primaryVN);
              console.log('Response from updating primary VN:', response);
              const edgeDomain = response?.edgeDomain; // Safely access edgeDomain
              console.log(edgeDomain,this.#server);
              if(edgeDomain !== this.#server) {
                await this.#handleEdgeDomainChange(edgeDomain);
              }
            }
    
            return await this.#userAgent?.makeCall(number, options);
        }catch(err){
            console.log("Error in Softphone.makeCall:", err);
            return null;
        }
    }

    async #handleEdgeDomainChange(edgeDomain:string) {
        //   this.endCurrentSession();

        if(!this.#userAgent){
           throw new Exceptions.UnknownException('Softphone.#handleEdgeDomainChange', 'UserAgent is not initialized');
        }
        await this.#userAgent.unregister();
        await this.#userAgent.stopUA();
        this.#server = edgeDomain;
        this.#userAgent = null;
        const sipCredentials = await this.#auth.registerSoftphone();
        const config = {
            auth: this.#auth,
            listeners: this.#clientListeners,
            sipCredentials,
            edgeDomain
        };

        if(!this.#userAgent){
            this.#userAgent = new UserAgent(config);
            console.log('Softphone: User Agent initialized. Starting User Agent...',this.#userAgent);
            await this.#userAgent.startUA();
        }
    }

    /* endCurrentSession(){
        console.log('in Softphone.endCurrentSession');
        const sessionState = this.getSession?.getSessionState;
    }

    get getSession() {
        this.ensureLoggedIn('getSession');
        return this.#userAgent?.
    } */

    async #updatePrimaryVirtualNumber(virtualNumber:any){
        console.log('Updating primary virtual number to:', virtualNumber);
        const Url = BASE_URL+`/auth/update-userprofile/?email=${encodeURIComponent(this.#auth.getEmail || "")}`;
        console.log('Update User Profile URL:', Url);
        console.log('Current Access Token:', this.#auth.getAccessToken());
        let response = await fetch(Url,{
            method:'PATCH',
            headers:{
                'authorization': `Bearer ${this.#auth.getAccessToken()}`,
                'Content-type':'application/json'
            },
            body: JSON.stringify({'primary_vn': virtualNumber})
        });
        console.log('Response received from update-userprofile endpoint:', response);
        const status = response.status;
        console.log('Response status:', status);
        const responseData = await response.json();
        console.log('Response data:', responseData);

        if(status === 400){
            throw new Exceptions.InvalidValueException('Softphone.makeCall', 'virtualNumber', virtualNumber, ['A virtual number linked to your account']);
        }
        else if(status !== 200){
            throw new Exceptions.UnknownException('Softphone.makeCall', JSON.stringify(responseData.message || ''));
        }

        console.log('Update primary virtual number successful.');

        if(status === 200){
            console.log('Setting new primary virtual number:', responseData.data?.primary_virtual_number);
            this.#primaryVN = responseData.data?.primary_virtual_number?.country_code + responseData.data?.primary_virtual_number?.number
            console.log('New primary virtual number set to:', this.#primaryVN);
            return {
                success: true,
                edgeDomain: responseData.data?.edge_domain
            };
        }

        return { success: false }; // Added return statement for other code paths
    }
}

export default Softphone;
