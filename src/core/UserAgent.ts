import {
    UserAgent as SIPUserAgent,
    Inviter,
    Registerer,
    RegistererState,
    type LogLevel,
    Invitation,
    UserAgentState
} from 'sip.js';
import { Session } from './Session';
import type Auth from './Auth';
import type { Listeners } from '../types';
import type { SipCredentials } from './Auth';
import { REGISTRATION_EXPIRES } from '../constants';
import { isTokenValid, SessionType } from '../utils/validation';
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
    #updatingAuth = false;
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
            logLevel: 'debug' as LogLevel,
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
                    this.#listeners.onConnectionStateChange("UserAgentState", "Connected", false);
                }
                this.startRegistration();
            },
            onDisconnect: (error) => {
                console.log('SIP UserAgent disconnected.', error);
                if (this.#listeners.onConnectionStateChange) {
                    this.#listeners.onConnectionStateChange("UserAgentState", "Disconnected", !!error, error);
                }
            },
            onInvite: (invitation: Invitation) => {
                console.log('Incoming call invitation received');
                this.#session = new Session(invitation, SessionType, this, this.#listeners);
                const remoteIdentity = invitation.remoteIdentity.uri.user;
                this.#session.remoteContact = remoteIdentity;

                if (this.#listeners.onCallCreated) {
                    // @ts-ignore
                    this.#listeners.onCallCreated(SessionType.Incoming, this.#session, { candidate: remoteIdentity });
                }
            }
        }
    }

    public isConnected(): boolean {
        return this.transport.isConnected();
    }

    public async reconnect(): Promise<void> {
        console.log('UserAgent: Reconnect requested...');

        // 1. If UA is stopped, start it
        if (this.state === UserAgentState.Stopped) {
            console.log('UserAgent: UA is stopped. Starting...');
            await this.start();
            return; // onConnect delegate will handle registration
        }

        // 2. If Transport (WebSocket) is disconnected, connect it
        if (!this.transport.isConnected) {
            console.log('UserAgent: Transport disconnected. Reconnecting transport...');
            await this.transport.connect();
            return; // onConnect delegate will handle registration
        }

        // 3. If Transport is connected but not registered, register
        if (this.#registerer && this.#registerer.state !== RegistererState.Registered) {
            console.log('UserAgent: Transport connected but not registered. Sending REGISTER...');
            await this.#registerer.register();
        } else {
            console.log('UserAgent: Already connected and registered.');
        }
    }

    get server() { return this.#server; }
    get listeners() { return this.#listeners; }
    get reConnectAttempts() { return this.#reConnectAttempts; }

    async startUA() { await this.start(); }

    async startRegistration() {
        console.log('in UserAgent.startRegistration');
        const options = {
            expires: REGISTRATION_EXPIRES,
            ["extraHeaders"]: [`token: ${this.#auth.getSipToken}`],
        }
        this.#registerer = new Registerer(this, options);

        this.#registerer.stateChange.addListener(async (newState) => {
            if (this.#listeners.onConnectionStateChange) {
                this.#listeners.onConnectionStateChange("RegistererState", newState, this.#reRegisterAttempts >= this.#maxRetryAttempts);
            }
            switch (newState) {
                case RegistererState.Unregistered:
                    if (!this.#updatingAuth && this.#auth.isLoggedIn() && this.#reRegisterAttempts < this.#maxRetryAttempts) {
                        this.#reRegisterAttempts++;
                        await this.reRegister();
                    }
                    break;
                case RegistererState.Registered:
                    console.log('SIP Registration Successful');
                    this.#reRegisterAttempts = 0;
                    break;
            }
        })
        console.log('Sending SIP REGISTER request...');
        await this.#registerer.register();
    }

    async reRegister() {
        try {
            await this.unregister();
        } catch (e) {
            console.warn(e);
        }
        const token = this.#auth.getSipToken;
        if (token && isTokenValid(token) !== true) await this.#updateToken();
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
        if (this.#registerer) await this.#registerer.unregister({ all: true });
    }

    async stopUA() {
        this.#reRegisterAttempts = 3;
        await this.stop();
    }

    async makeCall(candidateNumber: any, options: any) {
        try {
            const candidate = UserAgent.makeURI("sip:" + candidateNumber + "@" + this.#server);
            if (!candidate) throw new Error("Invalid candidate URI");

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

            this.#session = new Session(inviter, SessionType, this, this.#listeners);
            this.#session.remoteContact = candidateNumber;

            if (this.#listeners.onCallCreated) {
                // @ts-ignore
                this.#listeners.onCallCreated(SessionType.Outgoing, this.#session, { candidate: candidateNumber });
            }

            await inviter.invite();
            return true;
        } catch (err) {
            if (err instanceof InvalidValueException || err instanceof UnknownException) throw err;
            console.error('Error in UserAgent.makeCall', err);
            return false;
        }
    }

    public clearSession(): void { this.#session = null; }
}

export default UserAgent;