import { Session as SipSession, SessionState, Invitation, Inviter } from "sip.js";
// import { mediaDevices } from 'react-native-webrtc';
import { SessionType } from "../utils/validation.js";
// import * as Exceptions from "../exceptions/index.js";
import UserAgent from "./UserAgent.js";

export class Session {
    #state: SessionState;
    #sipSession: SipSession;
    #sessionType: typeof SessionType;
    #userAgent: UserAgent;
    #remoteContact?: string;

    constructor(session: Invitation | Inviter, type: typeof SessionType, userAgent: UserAgent) {
        this.#sipSession = session;
        this.#sessionType = type;
        this.#userAgent = userAgent;
        this.#state = session.state;

        session.stateChange.addListener((newState) => {
            this.#state = newState;
            switch (newState) {
                case SessionState.Initial:
                    // this.#setupLocalMedia();
                    break;
                case SessionState.Established:
                    // this.#userAgent.getListeners().onCallAnswered?.(this);
                    // this.#setupRemoteMedia();
                    break;
                case SessionState.Terminating:
                case SessionState.Terminated:
                    // this.#userAgent.getListeners().onCallHangup?.(this);
                    // this.#cleanupMedia();
                    break;
            }
        });
    }

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
}