import React, { useState, useEffect, useRef } from 'react';
import {
    StyleSheet,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Linking,
    Platform,
    PermissionsAndroid,
    StatusBar,
    Alert,
    SafeAreaView,
    Modal,
    FlatList
} from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { Softphone } from 'react-native-softphone-sdk';

const FREJUN_CREDENTIALS = {
    clientId: '<Client-id>',
    clientSecret: '<Client-Secret>',
};

type CallState = 'Idle' | 'Dialing' | 'Ringing' | 'Incoming' | 'Active';

async function startForegroundService() {
    if (Platform.OS !== 'android') return;
    const channelId = await notifee.createChannel({
        id: 'voip-service',
        name: 'VoIP Background Service',
        importance: AndroidImportance.LOW,
    });
    await notifee.displayNotification({
        id: 'foreground-service',
        title: 'Softphone Active',
        body: 'Listening for incoming calls...',
        android: {
            channelId,
            asForegroundService: true,
            ongoing: true,
            pressAction: { id: 'default' },
        },
    });
}

const App = () => {
    const [softphone, setSoftphone] = useState<Softphone | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // UI State
    const [connectionStatus, setConnectionStatus] = useState<'Disconnected' | 'Connecting' | 'Connected'>('Disconnected');
    const [callState, setCallState] = useState<CallState>('Idle');

    // Refs for Logic (To avoid stale closures in listeners)
    const callStateRef = useRef<CallState>('Idle');
    const activeSession = useRef<any>(null);

    const [remoteContact, setRemoteContact] = useState('');
    const [dialNumber, setDialNumber] = useState('');
    const [virtualNumbers, setVirtualNumbers] = useState<any[]>([]);
    const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
    const [showVnPicker, setShowVnPicker] = useState(false);

    // Helper to update state and ref simultaneously
    const updateCallState = (newState: CallState) => {
        setCallState(newState);
        callStateRef.current = newState;
    };

    useEffect(() => {
        if (softphone) {
            startForegroundService();
        }
    }, [softphone]);

    // 1. INITIALIZATION
    useEffect(() => {
        const init = async () => {
            try {
                const restored = await Softphone.initialize(FREJUN_CREDENTIALS);
                if (restored) setSoftphone(restored);
            } catch (error) {
                console.error("Init Error:", error);
            } finally {
                setIsLoading(false);
            }
        };
        init();

        const sub = Linking.addEventListener('url', async (event) => {
            if (event.url.includes('?code=')) {
                setIsLoading(true);
                try {
                    const instance = await Softphone.handleRedirect(event.url);
                    setSoftphone(instance);
                } catch (error) {
                    Alert.alert("Login Failed", "Could not complete authentication.");
                } finally {
                    setIsLoading(false);
                }
            }
        });
        return () => sub.remove();
    }, []);

    // 2. LISTENERS & STARTUP
    useEffect(() => {
        if (!softphone) return;

        const listeners = {
            onConnectionStateChange: (type: any, state: any, isError: boolean) => {
                console.log(`📡 Connection Update: ${state} (Error: ${isError})`);

                // Normalizing statuses (SDKs often have 'Registering', 'Unregistering', etc.)
                switch (state) {
                    case 'Registered':
                    case 'Connected':
                    case 'Ready':
                        setConnectionStatus('Connected');
                        break;
                    case 'Unregistered':
                    case 'Disconnected':
                    case 'Terminated':
                    case 'RegistrationFailed':
                        setConnectionStatus('Disconnected');
                        break;
                    default:
                        // Keeps 'Connecting' for states like 'Registering' or 'Initializing'
                        setConnectionStatus('Connecting');
                        break;
                }
            },
            onCallCreated: (type: any, session: any, details: any) => {
                console.log("Call Created:", type);

                // Use Ref here to check current state without dependency issues
                if (type === 'Incoming' && callStateRef.current === 'Incoming') {
                    activeSession.current = session;
                    return;
                }

                activeSession.current = session;
                const contact = details?.candidate || 'Unknown';
                setRemoteContact(contact);
                updateCallState(type === 'Incoming' ? 'Incoming' : 'Dialing');
            },
            onCallRinging: () => {
                console.log("Call Ringing");
                updateCallState('Ringing');
            },
            onCallAnswered: (session: any) => {
                console.log("Call Answered");
                updateCallState('Active');
                activeSession.current = session;
            },
            onCallHangup: (session: any) => {
                console.log("Call Hangup");
                // Ensure we don't clear state if a different session ended (edge case)
                if (activeSession.current && activeSession.current !== session) return;

                updateCallState('Idle');
                setRemoteContact('');
                activeSession.current = null;
            }
        };

        setConnectionStatus('Connecting');

        // Start the SDK
        softphone.start(listeners)
            .then(() => {
                console.log("✅ SDK Started Successfully");

                // Fetch numbers only after successful start
                try {
                    const numbers = softphone.getVirtualNumbers();
                    setVirtualNumbers(numbers);
                    if (numbers.length > 0) {
                        const defaultVn = numbers.find((n: any) => n.default_calling_number) || numbers[0];
                        setSelectedNumber(`${defaultVn.country_code}${defaultVn.number}`);
                    }
                } catch (e) {
                    console.error("Error fetching numbers", e);
                }
            })
            .catch(err => {
                console.error("Failed to start softphone", err);
                setConnectionStatus('Disconnected');
            });

        // Cleanup function (Optional: depends on if SDK supports stop/destroy)
        return () => {
            console.log("SDK Startup Effect Cleanup");
            // If the SDK has a method to remove listeners or stop, call it here.
            // softphone.stop(); 
        };

        // 🔴 IMPORTANT: Removed `callState` from dependencies. 
        // This effect now only runs when `softphone` instance changes (login/logout).
    }, [softphone]);

    const handleLogin = async () => {
        if (Platform.OS === 'android') {
            await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS // Required for Android 13+ foreground service
            ]);
        }
        await Softphone.login();
    };

    const handleLogout = async () => {
        if (softphone) {
            await softphone.logout();
            setSoftphone(null);
            setConnectionStatus('Disconnected');
        }
    };

    const handleMakeCall = async () => {
        if (!softphone || dialNumber.length < 3) return;
        await softphone.makeCall(dialNumber, selectedNumber);
    };

    const handleAnswer = async () => {
        if (activeSession.current) {
            try { await activeSession.current.answer(); } catch (e) { console.error(e); }
        }
    };

    const handleHangup = async () => {
        if (activeSession.current) {
            try { await activeSession.current.hangup(); } catch (e) { console.error(e); }
        }
    };

    if (isLoading) return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#2196F3" /></View>;

    if (!softphone) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.title}>FreJun Softphone</Text>
                <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
                    <Text style={styles.btnText}>Login with FreJun</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const isDarkCard = callState === 'Active' || callState === 'Dialing' || callState === 'Ringing';

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Softphone</Text>
                <View style={[styles.badge, { backgroundColor: connectionStatus === 'Connected' ? '#4CAF50' : '#F44336' }]}>
                    <Text style={styles.badgeText}>{connectionStatus.toUpperCase()}</Text>
                </View>
                <TouchableOpacity onPress={handleLogout}><Text style={styles.logoutText}>Logout</Text></TouchableOpacity>
            </View>

            <View style={styles.content}>
                {callState === 'Incoming' && (
                    <View style={[styles.card, styles.incomingCard]}>
                        <Text style={[styles.cardTitle, { color: '#333' }]}>📞 Incoming Call</Text>
                        <Text style={[styles.callerId, { color: '#333' }]}>{remoteContact}</Text>
                        <View style={styles.row}>
                            <TouchableOpacity style={[styles.circleBtn, { backgroundColor: '#F44336' }]} onPress={handleHangup}><Text style={styles.iconText}>✕</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.circleBtn, { backgroundColor: '#4CAF50' }]} onPress={handleAnswer}><Text style={styles.iconText}>✓</Text></TouchableOpacity>
                        </View>
                    </View>
                )}

                {isDarkCard && (
                    <View style={[styles.card, styles.activeCard]}>
                        <Text style={[styles.cardTitle, { color: '#CCC' }]}>{callState === 'Active' ? 'In Call' : 'Calling...'}</Text>
                        <Text style={[styles.callerId, { color: '#FFF' }]}>{remoteContact}</Text>
                        {callState === 'Active' && <Text style={styles.timer}>00:00</Text>}
                        {callState === 'Dialing' && <ActivityIndicator color="#FFF" style={{ marginBottom: 20 }} />}
                        <TouchableOpacity style={[styles.circleBtn, { backgroundColor: '#F44336', width: 70, height: 70 }]} onPress={handleHangup}><Text style={styles.iconText}>📞</Text></TouchableOpacity>
                    </View>
                )}

                {callState === 'Idle' && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Make a Call</Text>
                        <TouchableOpacity style={styles.vnSelector} onPress={() => setShowVnPicker(true)}>
                            <Text style={styles.label}>Calling From:</Text>
                            <Text style={styles.vnText}>{selectedNumber || "Loading..."} ▼</Text>
                        </TouchableOpacity>
                        <TextInput
                            style={styles.input}
                            placeholder="+91..."
                            placeholderTextColor="#999"
                            keyboardType="phone-pad"
                            value={dialNumber}
                            onChangeText={setDialNumber}
                        />
                        <TouchableOpacity
                            style={[styles.callBtn, { opacity: connectionStatus !== 'Connected' ? 0.5 : 1 }]}
                            onPress={handleMakeCall}
                            disabled={connectionStatus !== 'Connected'}
                        >
                            <Text style={styles.btnText}>Call</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <Modal visible={showVnPicker} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Caller ID</Text>
                        <FlatList
                            data={virtualNumbers}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({ item }) => {
                                const fullNumber = `${item.country_code}${item.number}`;
                                return (
                                    <TouchableOpacity style={styles.modalItem} onPress={() => { setSelectedNumber(fullNumber); setShowVnPicker(false); }}>
                                        <Text style={styles.modalItemName}>{item.name}</Text>
                                        <Text style={styles.modalItemNumber}>{fullNumber} {selectedNumber === fullNumber && '✅'}</Text>
                                    </TouchableOpacity>
                                )
                            }}
                        />
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowVnPicker(false)}><Text style={styles.modalCloseText}>Cancel</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F7FA', paddingVertical: 40 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7FA' },
    content: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 20 },
    loginBtn: { backgroundColor: '#2196F3', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30, elevation: 5 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#FFF', elevation: 2 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    logoutText: { color: '#F44336', fontWeight: '600' },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
    card: { width: '100%', backgroundColor: '#FFF', borderRadius: 20, padding: 25, alignItems: 'center', elevation: 4 },
    incomingCard: { backgroundColor: '#E3F2FD', borderWidth: 1, borderColor: '#2196F3' },
    activeCard: { backgroundColor: '#263238' },
    cardTitle: { fontSize: 16, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
    callerId: { fontSize: 26, fontWeight: 'bold', marginBottom: 20 },
    timer: { fontSize: 18, color: '#4CAF50', fontWeight: 'bold', marginBottom: 20 },
    row: { flexDirection: 'row', width: '100%', justifyContent: 'space-around', marginTop: 10 },
    circleBtn: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
    iconText: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
    btnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    vnSelector: { width: '100%', marginBottom: 20, padding: 10, backgroundColor: '#FAFAFA', borderRadius: 10, borderWidth: 1, borderColor: '#EEE' },
    label: { fontSize: 12, color: '#666', marginBottom: 2 },
    vnText: { fontSize: 16, color: '#333', fontWeight: '600' },
    input: { width: '100%', backgroundColor: '#F0F0F0', borderRadius: 10, padding: 15, fontSize: 18, color: '#333', marginBottom: 20, textAlign: 'center' },
    callBtn: { width: '100%', backgroundColor: '#4CAF50', padding: 15, borderRadius: 10, alignItems: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#333' },
    modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
    modalItemName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    modalItemNumber: { fontSize: 14, color: '#666' },
    modalCloseBtn: { marginTop: 20, alignItems: 'center', padding: 15, backgroundColor: '#f5f5f5', borderRadius: 10 },
    modalCloseText: { color: '#333', fontWeight: 'bold' }
});

export default App;