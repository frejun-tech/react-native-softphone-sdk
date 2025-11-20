import { Session as SipSession, SessionState, Invitation, Inviter } from "sip.js";
// import { MediaStream } from 'react-native-webrtc';
import { SessionType } from "../utils/validation.js";
// import * as Exceptions from "../exceptions/index.js";
import UserAgent from "./UserAgent.js";
import type { Listeners } from "../types/index.js";

export class Session {

    #state: SessionState;
    #sipSession: SipSession;
    #sessionType: typeof SessionType;
    #userAgent: UserAgent;
    #remoteContact?: string;
    #listeners: Listeners;
    // #localStream: MediaStream | null = null;

    constructor(session: Invitation | Inviter, type: typeof SessionType, userAgent: UserAgent, listeners: Listeners) {
        console.log("Session constructor called.");
        this.#sipSession = session;
        this.#sessionType = type;
        this.#userAgent = userAgent;
        this.#state = session.state;
        this.#listeners = listeners;

        session.stateChange.addListener((newState) => {

            console.log(`Session state changed from ${this.#state} to ${newState}`);

            this.#state = newState;

            switch (newState) {
                case SessionState.Initial:
                    console.log("Call Status: Initializing...");
                    break;

                case SessionState.Establishing:
                    console.log("Call Status: Ringing...");
                    if (this.#listeners.onCallRinging) {
                        this.#listeners.onCallRinging(this);
                    }
                    break;
                case SessionState.Established:
                    console.log("Call Status: Established (Answered).");
                    // This is where audio usually starts
                    if (this.#listeners.onCallAnswered) {
                        this.#listeners.onCallAnswered(this);
                    }
                    break;
                case SessionState.Terminating:
                    console.log("Call Status: Terminating...");
                    if (this.#listeners.onCallTerminating) {
                        this.#listeners.onCallTerminating(this);
                    }
                    break;
                case SessionState.Terminated:
                    console.log("Call Status: Terminated (Hangup).");
                    if (this.#listeners.onCallHangup) {
                        this.#listeners.onCallHangup(this);
                    }
                    // this.#cleanupMedia();
                    this.#userAgent.clearSession();
                    break;
            }

        });
    }

    /* async #setupMedia(): Promise<void> {
        // Placeholder for media setup logic
        console.log("Setting up media...");
        // this.#localStream = await MediaStream.getUserMedia({ audio: true, video: false }) as MediaStream;
    }

    #cleanupMedia(): void {
        console.log("Cleaning up media...");
    } */

    get userAgent(): UserAgent {
        return this.#userAgent;
    }

    get state(): SessionState {
        return this.#state;
    }

    get sipSession(): SipSession {
        return this.#sipSession;
    }

    get sessionType(): typeof SessionType {
        return this.#sessionType;
    }

    get remoteContact(): string | undefined {
        return this.#remoteContact;
    }

    set remoteContact(contact: string | undefined) {
        this.#remoteContact = contact;
    }

    public async hangup(): Promise<void> {
        switch (this.#state) {
            case SessionState.Initial:
            case SessionState.Establishing:
                if (this.#sipSession instanceof Inviter) {
                    await this.#sipSession.cancel();
                } else if (this.#sipSession instanceof Invitation) {
                    await this.#sipSession.reject();
                }
                break;
            case SessionState.Established:
                await this.#sipSession.bye();
                break;
        }
    }

    public async answer(): Promise<void> {
        console.log('Session.answer() called');

        if (this.#sipSession instanceof Invitation) {
            const options = {
                sessionDescriptionHandlerOptions: {
                    constraints: { audio: true, video: false },
                },
            };
            console.log('Accepting SIP Invitation...');
            // @ts-ignore 
            await this.#sipSession.accept(options);
        } else {
            console.warn('Cannot answer an outgoing call or an already established session.');
        }
    }
}
