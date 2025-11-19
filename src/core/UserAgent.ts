import {
    UserAgent as SIPUserAgent, 
    Inviter, 
    Registerer, 
    RegistererState,
    type LogLevel, 
    // UserAgentState, 
    // Invitation
} from 'sip.js';
import { Session } from './Session';
import type Auth from './Auth';
import type { Listeners } from '../types';
import type { SipCredentials } from './Auth';
import { REGISTRATION_EXPIRES } from '../constants';
import { isTokenValid,SessionType } from '../utils/validation';
import { InvalidValueException, UnknownException } from '../exceptions';

interface UserAgentConfig {
    auth: Auth;
    listeners: Listeners;
    sipCredentials: SipCredentials;
    edgeDomain: string;
}

class UserAgent extends SIPUserAgent {

    #server: string;
    #auth: Auth;
    #listeners: Listeners;
    #reConnectAttempts: number = 0;
    #registerer: Registerer | null = null;
    #updatingAuth=false;
    #maxRetryAttempts = 3;
    #reRegisterAttempts = 0;
    #session: Session | null = null;

    constructor(config: UserAgentConfig) {

        const options = {
            transportOptions: {
                server: `wss://${config.edgeDomain}:9080/`,
                traceSip: true,
                connectionTimeout: 15,
            },
            logLevel:  'debug' as LogLevel, // Cast to LogLevel type
            autostart: false,
            register: false,
            uri: SIPUserAgent.makeURI(`sip:${config.auth.sipUsername}@${config.edgeDomain}:9080`),
        }

        super(options);

        this.#server = config.edgeDomain;
        this.#auth = config.auth;
        this.#listeners = config.listeners;

        this.delegate = {
            onConnect: () => {
                console.log('SIP UserAgent connected.');
                this.#reConnectAttempts = 0;
                if (this.#listeners.onConnectionStateChange) {
                    this.#listeners.onConnectionStateChange("UserAgentState", this.state, false); // Assuming the last two arguments are boolean flags
                }
                console.log('in onConnect, calling startRegistration');
                this.startRegistration();
            },
            onDisconnect: (error) => {
                console.log('SIP UserAgent disconnected.', error);
            },
            onInvite: (Invitation) => {
                console.log('Incoming call invitation received', Invitation);
            }
        }
    }

    get server() {
        return this.#server;
    }

    get listeners() {
        return this.#listeners;
    }

    get reConnectAttempts() {
        return this.#reConnectAttempts;
    }

    async startUA() {
        console.log('calling start on UserAgent');
        await this.start();
    }

    async startRegistration() {
        console.log('in UserAgent.startRegistration');
        const options = {
            // refreshFrequency: 90,
            expires: REGISTRATION_EXPIRES,
            ["extraHeaders"]: [`token: ${this.#auth.getSipToken}`],
        }
        this.#registerer = new Registerer(this, options);
        console.log('Registerer created');

        this.#registerer.stateChange.addListener(async (newState) => {
            if (this.#listeners.onConnectionStateChange) {
                this.#listeners.onConnectionStateChange("RegistererState", newState, this.#reRegisterAttempts >= this.#maxRetryAttempts);
            }
            switch (newState) {
                case RegistererState.Unregistered:
                    if(!this.#updatingAuth && this.#auth.isLoggedIn() && this.#reRegisterAttempts < this.#maxRetryAttempts) {
                        console.log('Registerer state is Unregistered, reRegisterAttempts: ', this.#reRegisterAttempts, 'calling reRegister');
                        this.#reRegisterAttempts++;
                        await this.reRegister();
                    }
                    break;
                case RegistererState.Registered:
                    this.#reRegisterAttempts = 0;
                    break;
                default:
                    break;
            }
        })
    }

    async reRegister() {
        console.log('in UserAgent.reRegister');
        try {
            await this.unregister();
        }
        catch(error) {
            // ignore invalid state transition error
            console.warn(error);
        }
        const token = this.#auth.getSipToken;
        if (token && isTokenValid(token) !== true) {
            // Handle the case where the token is invalid
            const accessToken = this.#auth.getAccessToken(); // Call the method to get the token
            if (accessToken && isTokenValid(accessToken) !== true) {
                // Handle invalid access token
                console.log('in reRegister, expired access token, cannot refresh expired sipToken');
                this.#reRegisterAttempts = 3;
                return;
            }
            else await this.#updateToken();
        }
        console.log('in reRegister, calling startRegistration');
        this.#registerer = null;
        await this.startRegistration();
    }

    async #updateToken() {
        this.#updatingAuth = true;
        await this.#auth.registerSoftphone();
        this.#updatingAuth = false;
    }

    async unregister() {
        this.#reRegisterAttempts = 3;
        if (this.#registerer) {
            await this.#registerer.unregister({
                all: true,
                requestOptions: {
                    ["extraHeaders"]: [`token: ${this.#auth.getSipToken}`],
                },
            });
        } else {
            console.warn('Registerer is null, cannot unregister.');
        }
    }

    async stopUA() {
        this.#reRegisterAttempts = 3;
        this.#reConnectAttempts = 3;
        await this.stop();
    }

    async makeCall(candidateNumber:any, options:any) {
        try {
            const candidate = UserAgent.makeURI("sip:" + candidateNumber + "@" + this.#server);
            if (!candidate) {
                throw new Error("Invalid candidate URI");
            }
            const metadata = options.metadata ?? {};
            const inviter = new Inviter(this, candidate, {
                sessionDescriptionHandlerOptions: {
                    constraints: { audio: true, video: false },
                },
                extraHeaders: [
                    `token: ${this.#auth.getSipToken}`,
                    `X-Transaction-Id: ${metadata.transactionId ?? ""}`,
                    `X-Job-Id: ${metadata.jobId ?? ""}`,
                    `X-Reference-Id: ${metadata.candidateId ?? ""}`,
                ]
            });
            console.log('Inviter created:', inviter);
            this.#session = new Session(inviter, SessionType, this);
            this.#session.remoteContact = candidateNumber;
            if (this.#listeners.onCallCreated) {
                this.#listeners.onCallCreated(SessionType.Outgoing, {candidate: candidateNumber});
            }
            console.log('Calling invite on SIP session');
            await inviter.invite();
            console.log('Call invitation sent successfully');
            return true;
        } catch (err) {
            if(err instanceof InvalidValueException || err instanceof UnknownException)
                throw err;
            console.error('Error in UserAgent.makeCall', err);
            return false;
        }
    }

    public clearSession(): void {
        this.#session = null;
    }
}

export default UserAgent;