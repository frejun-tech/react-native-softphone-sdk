# React Native Softphone SDK

A robust TypeScript SDK for integrating FreJun VoIP softphone capabilities into React Native applications.

## 🌟 Features

*   **VoIP Calling**: Built on `sip.js` and `react-native-webrtc` for high-quality audio calls.
*   **Flexible Auth**: Support for **Standard Browser OAuth** and **Direct Code Exchange**.
*   **Secure Auth**: OAuth2 flow with **Automatic Token Refresh** (handles 401 Unauthorized automatically).
*   **Resilience**: Auto-reconnection logic when the app comes to the foreground.
*   **Call Forking Support**: Intelligently handles duplicate SIP invites to prevent "Ghost Hangups".
*   **Multiple Caller IDs**: Fetch and switch between available Virtual Numbers from the user profile.
*   **Encrypted Storage**: Securely persists session tokens.

---

## 📦 Installation

1.  **Install the SDK**:
    ```bash
    npm install react-native-softphone-sdk
    # or
    yarn add react-native-softphone-sdk
    ```

2.  **Install Peer Dependencies**:
    You must install these native modules in your project:
    ```bash
    npm install react-native-webrtc react-native-encrypted-storage google-libphonenumber jwt-decode sip.js buffer events
    ```

3.  **iOS Installation**:
    ```bash
    cd ios && pod install && cd ..
    ```

---

## ⚙️ Platform Configuration

### Android Setup

1.  **Permissions (`AndroidManifest.xml`)**:
    Add the following permissions. Note the Bluetooth permissions required for Android 12+ (API 31).

    ```xml
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    
    <!-- Android 12+ Bluetooth Requirements -->
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    ```

2.  **Deep Linking (OAuth Redirect)**:
    Required only if using **Standard Browser Login**. Add this intent filter inside your `<activity>` tag.

    ```xml
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <!-- Replace 'frejun' with your specific scheme -->
        <data android:scheme="frejun" /> 
    </intent-filter>
    ```

### iOS Setup

1.  **Info.plist**:
    Add the Microphone usage description.
    ```xml
    <key>NSMicrophoneUsageDescription</key>
    <string>We need access to your microphone to make VoIP calls.</string>
    ```

2.  **Background Modes**:
    Enable **"Audio, AirPlay, and Picture in Picture"** and **"Voice over IP"** in Xcode Project Capabilities.

---

## 🚀 Usage Guide

### 1. Initialization
Initialize the SDK once, preferably in your App's root component.

```typescript
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
```

### 2. Authentication (Login)

You have two options for logging in users.

#### Option A: Standard Browser Flow
Use this if you want the SDK to open the system browser for FreJun login.

```typescript
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
```

#### Option B: Direct Login (Custom Integration)
Use this if you have already obtained an **Authorization Code** or tokens via your own API or WebView and want to initialize the SDK directly.

```typescript
const handleDirectLogin = async () => {
    try {
        // Pass credentials (accessToken, email, refreshToken) directly
        // Note: refreshToken is mandatory to ensure session continuity
        const softphoneInstance = await Softphone.login({ 
            accessToken: "YOUR_ACCESS_TOKEN", 
            email: "user@example.com",
            refreshToken: "YOUR_REFRESH_TOKEN",
            // Optional: Provide these to enable auto-refresh if the accessToken is already expired
            clientId: "YOUR_CLIENT_ID",
            clientSecret: "YOUR_CLIENT_SECRET"
        });

        if (softphoneInstance) {
            setSoftphone(softphoneInstance);
            console.log("Logged in successfully!");
        }
    } catch (e) {
        console.error("Direct login failed", e);
    }
};
```

### 3. Starting the Engine & Event Listeners
You must call `start()` to connect the WebSocket and register for events.

```typescript
useEffect(() => {
    if (!softphone) return;

    const listeners = {
        onConnectionStateChange: (type, state, isError) => {
            console.log(`Status: ${state}`); // e.g., Registered, Connected, Disconnected
        },

        // ARGS: Type ('Incoming'/'Outgoing'), Session Object, Details
        onCallCreated: (type, session, details) => {
            console.log(`Call: ${type}, Candidate: ${details.candidate}`);
            activeSession.current = session; // IMPORTANT: Store session ref
            
            if (type === 'Incoming') {
                // Show incoming call UI
            }
        },

        onCallAnswered: (session) => { /* Call is live */ },

        onCallHangup: (session) => {
            // IGNORE "Ghost Hangups" from call forking
            if (activeSession.current && activeSession.current !== session) return;
            activeSession.current = null;
        },
        
        onSessionRefresh: (payload) => {
            console.log("Session was refreshed automatically. New tokens:", payload);
            // Optionally, save these new tokens to your app's state management or storage
        }
    };

    softphone.start(listeners).then(() => {
        console.log("SDK started and ready to make calls!");
    });
}, [softphone]);
```

### 4. Managing Calls

```typescript
// --- OUTGOING ---
// Option 1: Use default caller ID from user profile
await softphone.makeCall('+919876543210');

// Option 2: Use a specific Virtual Number (Caller ID)
await softphone.makeCall('+919876543210', '+918012345678');

// --- INCOMING ---
// Answer an incoming call
await activeSession.current.answer();

// Hangup or Reject a call
await activeSession.current.hangup();
```

### 5. Using Virtual Numbers
Fetch the list of numbers assigned to the user to build a "Select Caller ID" UI.

```typescript
const numbers = softphone.getVirtualNumbers();
// Returns: [{ name: "Office", country_code: "+91", number: "...", default_calling_number: true }, ...]
```

### 6. Manual Reconnect
If the connection drops, you can provide a manual reconnection trigger.

```typescript
try {
    await softphone.connect();
} catch (e) {
    Alert.alert("Reconnection failed", "Please check your network connection.");
}
```

---

## 📡 Handling Background/Killed State

Standard WebSockets are terminated when an app is killed. To receive calls in this state, you must implement a native VoIP push notification solution.

1.  **Background (App Minimized):** The SDK listens to `AppState` changes and automatically attempts to reconnect the socket when the app is brought to the foreground.
2.  **Killed (App Closed):**
    *   **Android:** Requires a solution using FCM Data Messages, `react-native-callkeep`, and a Foreground Service.
    *   **iOS:** Requires APNs PushKit (VoIP Push) integrated with `react-native-callkeep` and Apple's `CallKit` framework.

---

## 📚 API Reference

### `Softphone` Class

| Method | Returns | Description |
| :--- | :--- | :--- |
| `static initialize(creds)` | `Promise<Softphone \| null>` | Configures SDK with credentials, restores a previous session from storage, and checks permissions. |
| `static login(params?)` | `Promise<Softphone \| void>` | If params `{accessToken, email, refreshToken, clientId?, clientSecret?}` are provided, logs in directly. `refreshToken` is required. <br> **Note:** `clientId` and `clientSecret` are only used to refresh the token if the provided `accessToken` is already expired. If no params are given, it initiates the standard browser OAuth flow. |
| `static handleRedirect(url)` | `Promise<Softphone>` | Exchanges the authorization code from a deep link URL for session tokens and completes the browser login flow. |
| `start(listeners)` | `Promise<void>` | Connects the WebSocket, registers the SIP user agent, fetches the user profile, and attaches event listeners. Includes `onSessionRefresh` listener. |
| `connect()` | `Promise<void>` | Manually attempts to reconnect the transport and re-register the SIP user agent. |
| `makeCall(to, [from])` | `Promise<boolean>` | Initiates an outbound call. Updates the user's primary virtual number if `from` differs from the current default. |
| `getVirtualNumbers()` | `VirtualNumber[]` | Returns an array of available caller IDs (virtual numbers) for the authenticated user. |
| `getTokens()` | `TokenPayload \| null` | Returns the current session tokens (`accessToken`, `refreshToken`, `email`). |
| `logout()` | `Promise<void>` | Destroys the current session, unregisters the SIP user agent, and clears all credentials from secure storage. |

### `Session` Class

| Method | Description |
| :--- | :--- |
| `answer()` | Accepts an incoming call. |
| `hangup()` | Ends the current call (can be used to cancel, reject, or terminate). |

---

## ⚠️ Troubleshooting

**Q: `TypeError: answer is not a function`**
*   **Fix:** Ensure your `onCallCreated` listener receives **3 arguments**: `(type, session, details)`. You are likely trying to call `.answer()` on the `details` object instead of the `session` object.

**Q: Calls drop immediately with "Ghost Hangup"**
*   **Fix:** This is caused by SIP Call Forking. To prevent this, your `onCallHangup` listener must check if the session being hung up is the currently active one: `if (activeSession.current !== session) return;`.

**Q: 401 Unauthorized Errors**
*   **Fix:** The SDK handles this automatically with its **Auto-Refresh** mechanism. It will detect the error, refresh the session tokens using the stored refresh token, and retry the failed request. No action is required from you.
*   **Note**: If you need to be notified when tokens are refreshed (e.g., to update your own app's state or storage), use the `onSessionRefresh` event listener passed to the `start()` method.

---

**License:** MIT