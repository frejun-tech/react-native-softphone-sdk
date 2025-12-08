# React Native Softphone SDK

A robust TypeScript SDK for integrating FreJun VoIP softphone capabilities into React Native applications.

## 🌟 Features

*   **VoIP Calling**: Built on \`sip.js\` and \`react-native-webrtc\` for high-quality audio calls.
*   **Flexible Auth**: Support for standard **OAuth2** (Browser) and **Direct Login** (Access Token).
*   **Auto-Refresh**: Automatically handles 401 errors by refreshing tokens (if a refresh token is provided).
*   **Resilience**: Auto-reconnection logic when the app comes to the foreground.
*   **Call Forking Support**: Intelligently handles duplicate SIP invites to prevent "Ghost Hangups".
*   **Multiple Caller IDs**: Fetch and switch between available Virtual Numbers from the user profile.
*   **Encrypted Storage**: Securely persists session tokens using hardware-backed storage.

---

## 📦 Installation

1.  **Install the SDK**:
    \`\`\`bash
    npm install react-native-softphone-sdk
    # or
    yarn add react-native-softphone-sdk
    \`\`\`

2.  **Install Peer Dependencies**:
    You must install these native modules in your project:
    \`\`\`bash
    npm install react-native-webrtc react-native-encrypted-storage google-libphonenumber jwt-decode sip.js buffer events
    \`\`\`

3.  **iOS Installation**:
    \`\`\`bash
    cd ios && pod install && cd ..
    \`\`\`

---

## ⚙️ Platform Configuration

### Android Setup

1.  **Permissions (\`AndroidManifest.xml\`)**:
    Add the following permissions. Note the Bluetooth permissions required for Android 12+ (API 31).

    \`\`\`xml
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    
    <!-- Android 12+ Bluetooth Requirements -->
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    \`\`\`

2.  **Deep Linking (For OAuth Flow Only)**:
    If you use the standard OAuth login, add this intent filter to your \`<activity>\` tag.

    \`\`\`xml
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="frejun" /> <!-- Replace with your specific scheme -->
    </intent-filter>
    \`\`\`

### iOS Setup

1.  **Info.plist**:
    Add the Microphone usage description.
    \`\`\`xml
    <key>NSMicrophoneUsageDescription</key>
    <string>We need access to your microphone to make VoIP calls.</string>
    \`\`\`

2.  **Background Modes**:
    Enable **"Audio, AirPlay, and Picture in Picture"** and **"Voice over IP"** in Xcode capabilities.

---

## 🚀 Usage Guide

### 1. Initialization
Initialize the SDK in your root component. This checks for an existing session in storage and attempts to restore it.

\`\`\`typescript
import { Softphone } from 'react-native-softphone-sdk';

const CREDENTIALS = {
    clientId: 'YOUR_CLIENT_ID',
    clientSecret: 'YOUR_CLIENT_SECRET',
};

// ... inside useEffect
const init = async () => {
    const softphoneInstance = await Softphone.initialize(CREDENTIALS);
    if (softphoneInstance) {
        setSoftphone(softphoneInstance); // User is already logged in
    }
};
init();
\`\`\`

### 2. Authentication
The SDK supports two ways to log in.

#### Option A: Standard OAuth (Browser Flow)
Use this if you want the user to log in via the FreJun web interface.

\`\`\`typescript
// 1. Trigger Login (Opens Browser)
const handleLogin = async () => {
    await Softphone.login(); 
};

// 2. Handle Deep Link Redirect
useEffect(() => {
    const sub = Linking.addEventListener('url', async (event) => {
        if (event.url.includes('?code=')) {
            try {
                const instance = await Softphone.handleRedirect(event.url);
                setSoftphone(instance);
            } catch (e) {
                console.error("Login failed", e);
            }
        }
    });
    return () => sub.remove();
}, []);
\`\`\`

#### Option B: Direct Login (Manual)
Use this if you already have the \`accessToken\` (e.g., from your own backend API).

\`\`\`typescript
const handleDirectLogin = async () => {
    try {
        const instance = await Softphone.login({
            accessToken: 'YOUR_ACCESS_TOKEN',
            email: 'user@example.com',
            refreshToken: 'OPTIONAL_REFRESH_TOKEN' // Highly recommended for auto-refresh
        });
        
        // Login successful, session validated and saved
        setSoftphone(instance);
    } catch (error) {
        console.error("Invalid token provided", error);
    }
};
\`\`\`

### 3. Starting the Engine
Once authenticated, you must call \`start()\` to connect to the VoIP server.

\`\`\`typescript
useEffect(() => {
    if (!softphone) return;

    const listeners = {
        onConnectionStateChange: (type, state, isError) => {
            console.log(\`Status: \${state}\`); // Registered, Connected, Disconnected
        },

        // ARGS: Type ('Incoming'/'Outgoing'), Session Object, Details
        onCallCreated: (type, session, details) => {
            console.log(\`Call: \${type}, From/To: \${details.candidate}\`);
            activeSession.current = session; // IMPORTANT: Store the session
            
            if (type === 'Incoming') { /* Show Incoming UI */ }
        },

        onCallAnswered: (session) => { /* Call is live */ },

        onCallHangup: (session) => {
            // Check against active session to avoid "Ghost Hangups" from call forking
            if (activeSession.current && activeSession.current !== session) return;
            activeSession.current = null;
        }
    };

    softphone.start(listeners).then(() => {
        console.log("Ready to make calls!");
    });
}, [softphone]);
\`\`\`

### 4. Making Calls (Outgoing)

\`\`\`typescript
// Option 1: Use default caller ID from profile
await softphone.makeCall('+919876543210');

// Option 2: Use specific Virtual Number
await softphone.makeCall('+919876543210', '+918012345678');
\`\`\`
*Note: Phone numbers must be in E.164 format (e.g., +91...)*

### 5. Managing Incoming Calls

\`\`\`typescript
// Answer
await activeSession.current.answer();

// Hangup / Reject
await activeSession.current.hangup();
\`\`\`

### 6. Using Virtual Numbers
\`\`\`typescript
const numbers = softphone.getVirtualNumbers();
// Returns: [{ name: "Office", country_code: "+91", number: "...", ... }, ...]
\`\`\`

---

## 📡 Handling Background/Killed State

Standard WebSockets close when the app is killed.

1.  **Background (Minimized):** The SDK automatically listens to \`AppState\` and reconnects the socket when the app comes to the foreground.
2.  **Killed (Closed):**
    *   **Android:** Requires FCM Data Messages + \`react-native-callkeep\`.
    *   **iOS:** Requires APNs PushKit (VoIP Push) + \`react-native-callkeep\`.

*This SDK handles the SIP logic once the app is running. You must implement the native push handling in your app layer to wake the device.*

---

## 📚 API Reference

### \`Softphone\` Class

| Method | Description |
| :--- | :--- |
| \`static initialize(creds)\` | Configures SDK, checks storage for existing session. |
| \`static login()\` | **(OAuth)** Opens system browser for login flow. |
| \`static login(credentials)\` | **(Direct)** Logs in via \`{ accessToken, email, refreshToken }\`. |
| \`static handleRedirect(url)\` | Completes OAuth login from deep link. |
| \`start(listeners)\` | Connects WebSocket, registers SIP, fetches Profile. |
| \`connect()\` | Manually attempts to reconnect (e.g., after network loss). |
| \`makeCall(to, [from])\` | Starts a call. Automatically switches caller ID if needed. |
| \`getVirtualNumbers()\` | Returns array of available caller IDs. |
| \`logout()\` | Destroys session, unregisters SIP, clears storage. |

### \`Session\` Class

Passed in \`onCallCreated\`.

| Method | Description |
| :--- | :--- |
| \`answer()\` | Accepts an incoming call. |
| \`hangup()\` | Ends the call (Cancel, Reject, or Bye). |

---

## ⚠️ Troubleshooting

**Q: \`TypeError: answer is not a function\`**
*   **Fix:** Ensure your \`onCallCreated\` listener handles 3 arguments: \`(type, session, details)\`. You call \`answer()\` on the \`session\` object.

**Q: 401 Unauthorized**
*   **Fix:** If you used **Direct Login**, ensure you provided a valid \`refreshToken\`. Without it, the SDK cannot auto-renew the session when the \`accessToken\` expires.

**Q: Calls drop immediately ("Ghost Hangup")**
*   **Fix:** Ensure your \`onCallHangup\` listener checks if the hanging-up session matches your \`activeSession.current\`. This filters out termination events from duplicate SIP registration paths.

---

**License:** Proprietary. Copyright 2025.