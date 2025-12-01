import { Session as SipSession, SessionState, Invitation, Inviter } from "sip.js";
import { SessionType } from "../utils/validation";
import UserAgent from "./UserAgent";
import type { Listeners } from "../types";

export class Session {
    #state: SessionState;
    #sipSession: SipSession;
    #sessionType: typeof SessionType;
    #userAgent: UserAgent;
    #remoteContact?: string;
    #listeners: Listeners;

    constructor(
        session: Invitation | Inviter,
        type: typeof SessionType,
        userAgent: UserAgent,
        listeners: Listeners
    ) {
        console.log("Session constructor called.");
        this.#sipSession = session;
        this.#sessionType = type;
        this.#userAgent = userAgent;
        this.#listeners = listeners;
        this.#state = session.state;

        session.stateChange.addListener((newState) => {
            console.log(`Session state changed from ${this.#state} to ${newState}`);
            this.#state = newState;
            switch (newState) {
                case SessionState.Establishing:
                    if (this.#listeners.onCallRinging) this.#listeners.onCallRinging(this);
                    break;
                case SessionState.Established:
                    if (this.#listeners.onCallAnswered) this.#listeners.onCallAnswered(this);
                    break;
                case SessionState.Terminated:
                    if (this.#listeners.onCallHangup) this.#listeners.onCallHangup(this);
                    this.#userAgent.clearSession();
                    break;
            }
        });
    }

    get userAgent(): UserAgent { return this.#userAgent; }
    get state(): SessionState { return this.#state; }
    get sipSession(): SipSession { return this.#sipSession; }
    get sessionType(): typeof SessionType { return this.#sessionType; }
    get remoteContact(): string | undefined { return this.#remoteContact; }
    set remoteContact(contact: string | undefined) { this.#remoteContact = contact; }

    public async answer(): Promise<void> {
        console.log('Session.answer() called');
        if (this.#sipSession instanceof Invitation) {
            const options = {
                sessionDescriptionHandlerOptions: {
                    constraints: { audio: true, video: false },
                },
            };
            // @ts-ignore
            await this.#sipSession.accept(options);
        } else {
            console.warn('Cannot answer an outgoing call or established session.');
        }
    }

    public async hangup(): Promise<void> {
        console.log('Session.hangup() called');
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
}