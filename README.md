# React Native Softphone SDK

A robust TypeScript SDK for integrating FreJun VoIP softphone capabilities into React Native applications.

## 🌟 Features

*   **VoIP Calling**: Built on \`sip.js\` and \`react-native-webrtc\` for high-quality audio calls.
*   **Flexible Auth**: Support for **Standard Browser OAuth** and **Direct Code Exchange**.
*   **Secure Auth**: OAuth2 flow with **Automatic Token Refresh** (handles 401 Unauthorized automatically).
*   **Resilience**: Auto-reconnection logic when the app comes to the foreground.
*   **Call Forking Support**: Intelligently handles duplicate SIP invites to prevent "Ghost Hangups".
*   **Multiple Caller IDs**: Fetch and switch between available Virtual Numbers from the user profile.
*   **Encrypted Storage**: Securely persists session tokens.

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

2.  **Deep Linking (OAuth Redirect)**:
    Required only if using **Standard Browser Login**. Add this intent filter inside your \`<activity>\` tag.

    \`\`\`xml
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <!-- Replace 'frejun' with your specific scheme -->
        <data android:scheme="frejun" /> 
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
    Enable **"Audio, AirPlay, and Picture in Picture"** and **"Voice over IP"** in Xcode Project Capabilities.

---

## 🚀 Usage Guide

### 1. Initialization
Initialize the SDK once, preferably in your App's root component.

\`\`\`typescript
import { Softphone } from 'react-native-softphone-sdk';

const CREDENTIALS = {
    clientId: 'YOUR_CLIENT_ID',
    clientSecret: 'YOUR_CLIENT_SECRET',
};

// ... inside useEffect
const init = async () => {
    // Restore session from storage
    const restoredSoftphone = await Softphone.initialize(CREDENTIALS);
    if (restoredSoftphone) {
        setSoftphone(restoredSoftphone); 
    }
};
init();
\`\`\`

### 2. Authentication (Login)

You have two options for logging in users.

#### Option A: Standard Browser Flow
Use this if you want the SDK to open the system browser for FreJun login.

\`\`\`typescript
import { Linking } from 'react-native';

const handleLogin = async () => {
    // 1. Opens Browser
    await Softphone.login(); 
};

// 2. Handle Redirect (Deep Link)
useEffect(() => {
    const sub = Linking.addEventListener('url', async (event) => {
        if (event.url.includes('?code=')) {
            try {
                // Exchange code for token
                const softphoneInstance = await Softphone.handleRedirect(event.url);
                setSoftphone(softphoneInstance);
            } catch (e) {
                console.error("Login failed", e);
            }
        }
    });
    return () => sub.remove();
}, []);
\`\`\`

#### Option B: Direct Login (Custom Integration)
Use this if you have already obtained an **Authorization Code** via your own API or WebView and want to initialize the SDK directly without opening a browser.

\`\`\`typescript
const handleDirectLogin = async () => {
    try {
        const authCode = "CODE_FROM_YOUR_BACKEND";
        const userEmail = "user@example.com";

        // Pass parameters to login directly
        const softphoneInstance = await Softphone.login({ 
            code: authCode, 
            email: userEmail 
        });

        if (softphoneInstance) {
            setSoftphone(softphoneInstance);
            console.log("Logged in successfully!");
        }
    } catch (e) {
        console.error("Direct login failed", e);
    }
};
\`\`\`

### 3. Starting the Engine & Event Listeners
You must call \`start()\` to connect to the WebSocket.

\`\`\`typescript
useEffect(() => {
    if (!softphone) return;

    const listeners = {
        onConnectionStateChange: (type, state, isError) => {
            console.log(\`Status: \${state}\`); // Registered, Connected, Disconnected
        },

        // ARGS: Type ('Incoming'/'Outgoing'), Session Object, Details
        onCallCreated: (type, session, details) => {
            console.log(\`Call: \${type}, Candidate: \${details.candidate}\`);
            activeSession.current = session; // IMPORTANT: Store session ref
            
            if (type === 'Incoming') {
                // Show Answer UI
            }
        },

        onCallAnswered: (session) => { /* Call is live */ },

        onCallHangup: (session) => {
            // IGNORE "Ghost Hangups" from call forking
            if (activeSession.current && activeSession.current !== session) return;
            activeSession.current = null;
        }
    };

    softphone.start(listeners).then(() => {
        console.log("Ready to make calls!");
    });
}, [softphone]);
\`\`\`

### 4. Managing Calls

\`\`\`typescript
// --- OUTGOING ---
// Option 1: Use default caller ID
await softphone.makeCall('+919876543210');

// Option 2: Use specific Virtual Number (Caller ID)
await softphone.makeCall('+919876543210', '+918012345678');

// --- INCOMING ---
// Answer
await activeSession.current.answer();

// Hangup / Reject
await activeSession.current.hangup();
\`\`\`

### 5. Using Virtual Numbers
Fetch the list of numbers assigned to the user to build a "Select Caller ID" UI.

\`\`\`typescript
const numbers = softphone.getVirtualNumbers();
// Returns: [{ name: "Office", country_code: "+91", number: "...", default_calling_number: true }, ...]
\`\`\`

### 6. Manual Reconnect
If the user goes offline, you can offer a retry button.

\`\`\`typescript
try {
    await softphone.connect();
} catch (e) {
    Alert.alert("Still offline");
}
\`\`\`

---

## 📡 Handling Background/Killed State

Standard WebSockets die when the app is killed. To receive calls in this state, you must implement **Native VoIP Push**.

1.  **Background (App Minimized):** The SDK listens to \`AppState\` changes and automatically reconnects the socket when the app comes to the foreground.
2.  **Killed (App Closed):**
    *   **Android:** Requires FCM Data Messages + \`react-native-callkeep\` + Foreground Service.
    *   **iOS:** Requires APNs PushKit (VoIP Push) + \`react-native-callkeep\` + \`CallKit\`.

---

## 📚 API Reference

### \`Softphone\` Class

| Method | Returns | Description |
| :--- | :--- | :--- |
| \`static initialize(creds)\` | \`Promise<Softphone \| null>\` | Configures SDK, restores session, checks permissions. |
| \`static login(params?)\` | \`Promise<Softphone \| void>\` | If params \`{code, email}\` provided, logs in directly. Else, opens browser. |
| \`static handleRedirect(url)\` | \`Promise<Softphone>\` | Completes browser login from deep link. |
| \`start(listeners)\` | \`Promise<void>\` | Connects WebSocket, registers SIP, fetches Profile. |
| \`connect()\` | \`Promise<void>\` | Manually attempts to reconnect the transport. |
| \`makeCall(to, [from])\` | \`Promise<boolean>\` | Starts a call. Updates user profile if \`from\` differs from default. |
| \`getVirtualNumbers()\` | \`VirtualNumber[]\` | Returns array of available caller IDs. |
| \`logout()\` | \`Promise<void>\` | Destroys session, unregisters SIP, clears storage. |

### \`Session\` Class

| Method | Description |
| :--- | :--- |
| \`answer()\` | Accepts incoming call (sends 200 OK). |
| \`hangup()\` | Ends call (Cancel/Reject/Bye). |

---

## ⚠️ Troubleshooting

**Q: \`TypeError: answer is not a function\`**
*   **Fix:** Ensure \`onCallCreated\` listener receives **3 arguments**: \`(type, session, details)\`. You are likely trying to call \`.answer()\` on the \`details\` object instead of the \`session\`.

**Q: Calls drop immediately with "Ghost Hangup"**
*   **Fix:** This happens due to SIP Call Forking. Ensure your \`onCallHangup\` listener checks \`if (activeSession.current !== session) return;\`.

**Q: 401 Unauthorized Errors**
*   **Fix:** The SDK has **Auto-Refresh**. It will catch the error, refresh the token, retry the request, and update storage automatically. No action needed.

---

**License:** Proprietary. Copyright 2025.