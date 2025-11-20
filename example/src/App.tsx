import { useState, useEffect, useRef } from 'react';
import {
    View,
    Button,
    Text,
    ActivityIndicator,
    Linking,
    Platform,
    PermissionsAndroid,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity,
    ScrollView
} from 'react-native';
import { Softphone } from 'react-native-softphone-sdk';

const FREJUN_CREDENTIALS = {
    clientId: '<Client-Id>',
    clientSecret: '<Client-Secret>',
};

const App = () => {
    const [softphone, setSoftphone] = useState<Softphone | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState<'Disconnected' | 'Connecting' | 'Connected'>('Disconnected');

    const [callStatus, setCallStatus] = useState<'Idle' | 'Incoming' | 'Dialing' | 'Ringing' | 'Active'>('Idle');
    const [remoteContact, setRemoteContact] = useState('');

    const activeSession = useRef<any>(null);

    useEffect(() => {
        const initializeSdk = async () => {
            console.log('[App] 🚀 Starting Initialization...');
            try {
                const restoredSoftphone = await Softphone.initialize(FREJUN_CREDENTIALS);
                if (restoredSoftphone) {
                    setSoftphone(restoredSoftphone);
                }
            } catch (error) {
                console.error('[App] ❌ Initialization failed:', error);
            } finally {
                setIsLoading(false);
            }
        };
        initializeSdk();

        const deepLinkSub = Linking.addEventListener('url', async (event) => {
            if (event.url.includes('?code=')) {
                setIsLoading(true);
                try {
                    const newSoftphone = await Softphone.handleRedirect(event.url);
                    console.log('[App] 🎉 Login successful!');
                    setSoftphone(newSoftphone);
                } catch (error) {
                    console.error('[App] ❌ Login failed:', error);
                } finally {
                    setIsLoading(false);
                }
            }
        });
        return () => deepLinkSub.remove();
    }, []);

    useEffect(() => {
        if (softphone) {
            const listeners = {
                onConnectionStateChange: (type: any, state: any, isError: boolean, error: any) => {
                    console.log(`[App] 📡 Status: ${state}`);
                    console.log(`[App] 📡 Type: ${type}`);
                    console.log(`[App] 📡 Error: ${error}`);
                    console.log(`[App] 📡 IsError: ${isError}`);
                    if (state === 'Registered' || state === 'Connected') {
                        setConnectionStatus('Connected');
                    } else if (state === 'Unregistered' || state === 'Disconnected') {
                        setConnectionStatus('Disconnected');
                    } else {
                        setConnectionStatus('Connecting');
                    }
                },

                onCallCreated: (type: any, session: any, details: any) => {
                    console.log(`[App] 📞 Call Created. Type: ${type}`);

                    // Logic to handle multiple incoming invites for the same call
                    if (type === 'Incoming' && callStatus === 'Incoming') {
                        console.log('[App] ⚠️ Duplicate Invite received. Updating session reference.');
                        // We update the ref to the latest session invite, as that's likely the one we will answer
                        activeSession.current = session;
                        return;
                    }

                    activeSession.current = session;

                    const candidate = details?.candidate || 'Unknown';
                    setRemoteContact(candidate);

                    if (type === 'Incoming') {
                        setCallStatus('Incoming');
                    } else {
                        setCallStatus('Dialing');
                    }
                },

                onCallRinging: (session: any) => {
                    console.log('[App] 🔔 Ringing', session);
                    setCallStatus('Ringing');
                },

                onCallAnswered: (session: any) => {
                    console.log('[App] 🗣️ Answered');
                    setCallStatus('Active');
                    activeSession.current = session;
                },

                // *** CRITICAL FIX HERE ***
                onCallHangup: (session: any) => {
                    console.log('[App] 📵 Hangup received');

                    // Check if the session hanging up is the one we are currently using
                    if (activeSession.current && activeSession.current !== session) {
                        console.log('[App] 🛡️ Ignoring hangup for a session that is not active (Duplicate Invite Cancellation)');
                        return;
                    }

                    console.log('[App] ✅ Valid Hangup. Resetting UI.');
                    setCallStatus('Idle');
                    setRemoteContact('');
                    activeSession.current = null;
                }
            };

            setConnectionStatus('Connecting');
            softphone.start(listeners).catch(err => {
                console.error("[App] ❌ Start failed:", err);
                setConnectionStatus('Disconnected');
            });
        }
    }, [softphone, callStatus]); // Added callStatus to dependency array so we can check it inside listeners

    const handleLogin = async () => {
        if (Platform.OS === 'android') {
            await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        }
        await Softphone.login();
    };

    const handleMakeCall = async () => {
        if (!softphone) return;
        await softphone.makeCall('+916361710745', '+918065428342');
    };

    const handleAnswer = async () => {
        if (activeSession.current) {
            console.log('[App] Answering call...');
            try {
                await activeSession.current.answer();
            } catch (e) { console.error(e); }
        } else {
            console.warn('[App] No active session to answer!');
        }
    };

    const handleHangup = async () => {
        if (activeSession.current) {
            console.log('[App] Hanging up...');
            try {
                await activeSession.current.hangup();
            } catch (e) { console.error(e); }
        }
    };

    const handleLogout = async () => {
        if (softphone) {
            await softphone.logout();
            setSoftphone(null);
            setConnectionStatus('Disconnected');
        }
    }

    if (isLoading) return <ActivityIndicator size="large" style={styles.loader} />;

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.header}>Softphone</Text>

                {!softphone ? (
                    <Button title="Login with FreJun" onPress={handleLogin} />
                ) : (
                    <View style={styles.dashboard}>
                        <View style={[
                            styles.badge,
                            { backgroundColor: connectionStatus === 'Connected' ? '#4CAF50' : '#F44336' }
                        ]}>
                            <Text style={styles.badgeText}>{connectionStatus.toUpperCase()}</Text>
                        </View>

                        {callStatus === 'Incoming' && (
                            <View style={[styles.card, styles.incomingCard]}>
                                <Text style={styles.incomingTitle}>📞 Incoming Call</Text>
                                <Text style={styles.contactName}>{remoteContact}</Text>
                                <View style={styles.row}>
                                    <TouchableOpacity style={[styles.btn, styles.btnReject]} onPress={handleHangup}>
                                        <Text style={styles.btnText}>Reject</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.btn, styles.btnAnswer]} onPress={handleAnswer}>
                                        <Text style={styles.btnText}>Answer</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {callStatus === 'Active' && (
                            <View style={styles.card}>
                                <Text style={styles.activeTitle}>On Call</Text>
                                <Text style={styles.contactName}>{remoteContact}</Text>
                                <Text style={{ color: 'green', marginBottom: 20 }}>00:00</Text>
                                <TouchableOpacity style={[styles.btn, styles.btnReject, { width: '80%' }]} onPress={handleHangup}>
                                    <Text style={styles.btnText}>End Call</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {(callStatus === 'Dialing' || callStatus === 'Ringing') && (
                            <View style={styles.card}>
                                <Text style={styles.activeTitle}>Calling...</Text>
                                <Text style={styles.contactName}>{remoteContact}</Text>
                                <ActivityIndicator size="small" color="#0000ff" style={{ marginBottom: 10 }} />
                                <Button title="Cancel" color="red" onPress={handleHangup} />
                            </View>
                        )}

                        {callStatus === 'Idle' && connectionStatus === 'Connected' && (
                            <View style={styles.card}>
                                <Text style={{ marginBottom: 10 }}>Ready to make calls</Text>
                                <Button title="Call Test Number" onPress={handleMakeCall} />
                            </View>
                        )}

                        <View style={{ marginTop: 50 }}>
                            <Button title="Logout" color="gray" onPress={handleLogout} />
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0f0f0' },
    loader: { flex: 1, justifyContent: 'center' },
    content: { padding: 20, alignItems: 'center' },
    header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#333' },
    dashboard: { width: '100%', alignItems: 'center' },
    badge: { paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20, marginBottom: 20 },
    badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
    card: { width: '100%', backgroundColor: '#fff', borderRadius: 15, padding: 20, alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, marginBottom: 20 },
    incomingCard: { backgroundColor: '#E3F2FD', borderColor: '#2196F3', borderWidth: 1 },
    incomingTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5, color: '#000' },
    contactName: { fontSize: 20, marginBottom: 20, color: '#333' },
    row: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
    btn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, minWidth: 100, alignItems: 'center' },
    btnAnswer: { backgroundColor: '#4CAF50' },
    btnReject: { backgroundColor: '#F44336' },
    btnText: { color: 'white', fontWeight: 'bold' },
    activeTitle: { fontSize: 16, color: '#666' },
});

export default App;