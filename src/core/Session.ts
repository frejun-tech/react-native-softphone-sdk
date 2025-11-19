import { Session as SipSession, SessionState, Invitation, Inviter } from "sip.js";
// import { MediaStream } from 'react-native-webrtc';
import { SessionType } from "../utils/validation.js";
// import * as Exceptions from "../exceptions/index.js";
import UserAgent from "./UserAgent.js";

export class Session {
    
    #state: SessionState;
    #sipSession: SipSession;
    #sessionType: typeof SessionType;
    #userAgent: UserAgent;
    #remoteContact?: string;
    // #localStream: MediaStream | null = null;

    constructor(session: Invitation | Inviter, type: typeof SessionType, userAgent: UserAgent) {
        console.log("Session constructor called.");
        this.#sipSession = session;
        this.#sessionType = type;
        this.#userAgent = userAgent;
        this.#state = session.state;

        session.stateChange.addListener((newState) => {

            console.log(`Session state changed from ${this.#state} to ${newState}`);

            this.#state = newState;

            /* switch (newState) {
                case SessionState.Initial:
                    console.log("Session is in Initial state.");
                    this.#setupMedia();
                    break;
                case SessionState.Established:
                    console.log("Session is Established.");
                    this.#userAgent.listeners.onCallAnswered?.(this);
                    // this.#setupRemoteMedia();
                    break;
                case SessionState.Terminating:
                case SessionState.Terminated:
                    this.#userAgent.listeners.onCallHangup?.(this);
                    this.#cleanupMedia();
                    this.#userAgent.clearSession();
                    break;
            } */

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
}
