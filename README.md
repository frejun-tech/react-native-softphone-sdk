# React Native Softphone SDK

A robust TypeScript SDK for integrating FreJun VoIP softphone capabilities into React Native applications. This SDK handles OAuth2 authentication, SIP signaling (via WebSockets), media management (WebRTC), and securely manages user sessions.

## Features

- 📞 **SIP VoIP Support**: Built on top of `sip.js` and `react-native-webrtc`.
- 🔐 **Secure Authentication**: OAuth2 flow with PKCE and **Automatic Token Refresh**.
- 💾 **Secure Storage**: Encrypted storage for session persistence.
- 📡 **Network Resilience**: Automatic reconnection and Edge Domain switching.
- 📱 **Call Handling**: Support for Outgoing calls, Incoming calls, Answering, and Rejecting.
- 🧵 **Call Forking Handling**: Intelligently handles duplicate SIP invites (Ghost Hangups).

## Installation

### 1. Install the SDK and Peer Dependencies

```bash
npm install react-native-softphone-sdk
# OR
yarn add react-native-softphone-sdk
```

### 2. Install Required Native Libraries

This SDK relies on native modules that must be installed in your project:

```bash
npm install react-native-webrtc react-native-encrypted-storage google-libphonenumber jwt-decode sip.js buffer events
```

### 3. iOS Setup

Navigate to your iOS folder and install pods:

```bash
cd ios
pod install
cd ..
```

## Platform Configuration

### Android

#### 1. Permissions

Add the following to your `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

#### 2. Deep Linking (OAuth Redirect)

Inside the `<application>` tag in `AndroidManifest.xml`, add an intent filter for the redirect URL (e.g., `frejun://` or `app://`). This must match the redirect URI configured in the FreJun Dashboard.

```xml
<activity android:name=".MainActivity" ...>
    <!-- ... other intent filters ... -->
    
    <!-- Add this for OAuth Redirect -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="frejun" /> <!-- Replace with your scheme -->
    </intent-filter>
</activity>
```

### iOS

#### 1. Permissions

Add the usage description to `ios/YourProject/Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>We need access to your microphone to make VoIP calls.</string>
```

#### 2. Deep Linking (OAuth Redirect)
To enable OAuth redirect on iOS, add a URL scheme.
**Steps:**
1. Open Xcode → Select target → Info tab
2. Under **URL Types**, click **+**
3. Add:
- Identifier: `<Your app identifier>`
- URL Schemes:
```
<Your app scheme>
```

## Usage Guide

### 1. Initialization

Initialize the SDK once, preferably in your App's root component.

```javascript
import { Softphone } from 'react-native-softphone-sdk';

const CREDENTIALS = {
    clientId: 'YOUR_CLIENT_ID',
    clientSecret: 'YOUR_CLIENT_SECRET',
};

// Inside your component
useEffect(() => {
    const init = async () => {
        const restoredSoftphone = await Softphone.initialize(CREDENTIALS);
        if (restoredSoftphone) {
            // Session restored automatically!
            setSoftphone(restoredSoftphone);
        }
    };
    init();
}, []);
```

### 2. Authentication (Login)

The SDK uses browser-based OAuth. You must handle the Deep Link in your app to complete the login.

```javascript
import { Linking } from 'react-native';

// 1. Trigger Login
const handleLogin = async () => {
    await Softphone.login(); // Opens system browser
};

// 2. Listen for Redirect
useEffect(() => {
    const sub = Linking.addEventListener('url', async (event) => {
        if (event.url.includes('?code=')) {
            try {
                // Exchange code for token
                const softphone = await Softphone.handleRedirect(event.url);
                setSoftphone(softphone);
            } catch (e) {
                console.error("Login failed", e);
            }
        }
    });
    return () => sub.remove();
}, []);
```

### 3. Starting SIP & Handling Events

Once initialized, start the Softphone engine and listen for call events.

```javascript
const [connectionStatus, setConnectionStatus] = useState('Disconnected');
const activeSession = useRef(null); // Store session to Answer/Hangup

useEffect(() => {
    if (!softphone) return;

    const listeners = {
        onConnectionStateChange: (type, state, isError) => {
            if (state === 'Registered') setConnectionStatus('Connected');
            else setConnectionStatus('Disconnected');
        },
        
        // Triggered for Incoming AND Outgoing calls
        onCallCreated: (type, session, details) => {
            console.log(`Call Type: ${type}`); // 'Incoming' | 'Outgoing'
            activeSession.current = session; // IMPORTANT: Save this!
            
            if(type === 'Incoming') {
                // Show Answer UI
            }
        },

        onCallAnswered: (session) => {
            // Call is live, audio is flowing
        },

        onCallHangup: (session) => {
            // Call ended
            activeSession.current = null;
        }
    };

    softphone.start(listeners);
}, [softphone]);
```

### 4. Managing Calls

#### Make an Outgoing Call

```javascript
// makeCall(destinationNumber, callerId)
await softphone.makeCall('+919876543210', '+918012345678');
```

#### Answer an Incoming Call

```javascript
const handleAnswer = async () => {
    if (activeSession.current) {
        await activeSession.current.answer();
    }
};
```

#### Hangup / Reject Call

```javascript
const handleHangup = async () => {
    if (activeSession.current) {
        await activeSession.current.hangup();
    }
};
```

### 5. Using Virtual Numbers

Fetch the list of numbers assigned to the user to build a "Select Caller ID" UI.

```javascript
const numbers = softphone.getVirtualNumbers();
// Returns: [{ name: "Office", country_code: "+91", number: "...", ... }, ...]
```

### 6. Manual Reconnect

If the user goes offline, you can offer a retry button.

```javascript
try {
    await softphone.connect();
} catch (e) {
    Alert.alert("Still offline");
}
```

## API Reference

### `Softphone` Class

| Method | Return Type | Description |
|--------|-------------|-------------|
| `static initialize(creds)` | `Promise<Softphone \| null>` | Configures SDK and attempts to restore session from storage. |
| `static login()` | `Promise<void>` | Opens system browser for OAuth login. |
| `static handleRedirect(url)` | `Promise<Softphone>` | Processes the deep link, exchanges token, and returns SDK instance. |
| `start(listeners)` | `Promise<void>` | Connects to WebSocket and registers SIP user. |
| `makeCall(to, from)` | `Promise<boolean>` | Initiates an outbound call. Updates Primary VN if needed. |
| `logout()` | `Promise<void>` | Clears session, stops UserAgent, and removes tokens. |
connect() | `Promise<void>` | Connects to WebSocket and registers SIP user. |
getVirtualNumbers() | `Promise<void>` | Connects to WebSocket and registers SIP user. |

### `Session` Class

Passed to you in the `onCallCreated` event.

| Method | Return Type | Description |
|--------|-------------|-------------|
| `answer()` | `Promise<void>` | Answers an incoming SIP invitation. |
| `hangup()` | `Promise<void>` | Ends the call (Cancel, Reject, or Bye). |

## Troubleshooting

**Q: I get `TypeError: answer is not a function`**

- **Fix:** Ensure you are using the updated `UserAgent.ts` which passes 3 arguments to `onCallCreated`. Rebuild your app (`npx react-native start --reset-cache`).

**Q: Calls drop immediately with "Ghost Hangup"**

- **Cause:** You have multiple tabs or devices registered.
- **Fix:** The SDK handles this by verifying session IDs in `onCallHangup`. Ensure your UI code checks `activeSession.current === session` before hiding the call screen.

**Q: Incoming calls don't show up.**

- **Fix:** Ensure you call `softphone.start(listeners)` immediately after login/initialization. The SDK must be "Registered" to receive invites.

---

*Confidential and Proprietary. Copyright 2025 FreJun.*