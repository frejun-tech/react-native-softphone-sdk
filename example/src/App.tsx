import { useState, useEffect } from 'react';
import { View, Button, Text, ActivityIndicator, Linking, Platform, PermissionsAndroid, StyleSheet } from 'react-native';
import { Softphone } from 'react-native-softphone-sdk';

const FREJUN_CREDENTIALS = {
  clientId: '<ClientId>',
  clientSecret: '<ClientSecret>',
};

const App = () => {
  const [softphone, setSoftphone] = useState<Softphone | null>(null);
  const [isLoading, setIsLoading] = useState(true);
//   const [callState, setCallState] = useState('Idle');
//   const [activeSession, setActiveSession] = useState(null);
  
  useEffect(() => {
      // --- This is now the single point of SDK configuration ---
      const initializeSdk = async () => {
          try {
              // Initialize with credentials and see if a session can be restored.
              const restoredSoftphone = await Softphone.initialize(FREJUN_CREDENTIALS);
              if (restoredSoftphone) {
                  setSoftphone(restoredSoftphone);
              }
          } catch (error) {
              console.error("SDK Initialization failed:", error);
              // You might want to show an error state to the user
          } finally {
              setIsLoading(false);
          }
      };

      initializeSdk();
      
      // --- The deep link handler no longer needs credentials ---
      const deepLinkSub = Linking.addEventListener('url', async (event) => {
        console.log("Deep link received:", event.url);
          if (event.url.includes('?code=')) {
              setIsLoading(true);
              console.log("Handling redirect for login...");
              try {
                  // handleRedirect now knows the credentials from the initialize step.
                  const newSoftphone = await Softphone.handleRedirect(event.url);
                  console.log("Login successful, Softphone instance obtained.");
                  setSoftphone(newSoftphone);
              } catch (error) {
                  console.error("Login failed during redirect:", error);
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
                onConnectionStateChange: (type:any, state:any, isError:any, error:any) => {
                    console.log(`Connection State Change: ${type} - ${state} - Error: ${isError ? 'Yes' : 'No'} - ${error ? error : ''}`);
                    // if (isError) console.error('Connection Error:', error);
                },
                onCallCreated: (type:any, details:any) => {
                    console.log(`Call Created: ${type} to ${details.candidate}`);
                    // setCallState(`Call created (${type})`);
                    // setActiveSession(softphone.getSession());
                },
                onCallAnswered: (session:any) => {
                    console.log('Call Answered',session);
                    // setCallState('Established');
                },
                onCallHangup: (session:any) => {
                    console.log('Call Hung up',session);
                    // setCallState('Idle');
                    // setActiveSession(null);
                }
            };

            softphone.start(listeners).catch(error => {
                console.error("Failed to start softphone:", error);
                // handleLogout();
            });
        }
    },[softphone]);

  // --- login() is now simpler ---
  const handleLogin = async () => {
    // 1. ADD THIS BLOCK: Request Microphone Permission on Android
    if (Platform.OS === 'android') {
        try {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                {
                    title: 'Microphone Permission',
                    message: 'This app needs access to your microphone to make calls.',
                    buttonNeutral: 'Ask Me Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                },
            );
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                console.log('Microphone permission denied');
                return;
            }
        } catch (err) {
            console.warn(err);
            return;
        }
    }

    // 2. Proceed with Login
    try {
        await Softphone.login();
    } catch(error) {
        console.error(error);
    }
    };

  /* const handleLogout = async () => {
      if (softphone) {
          await softphone.logout();
          setSoftphone(null);
      }
  }; */

  if (isLoading) {
      return <ActivityIndicator size="large" />;
  }

  return (
      <View
      style={styles.container}
      >
          {softphone ? (
              <>
                  <Text>Welcome! You are logged in.</Text>
                  <Button title="Make a Test Call" onPress={async() => {
                    try{
                        let res = await softphone.makeCall('To','From');
                        console.log('Call initiated',res);
                    }catch(err){
                        console.log('Error making call',err);
                    }
                  }} />
                  <Button title="Logout" onPress={() => {}} />
              </>
          ) : (
              <Button title="Login with FreJun" onPress={handleLogin} />
          )}
      </View>
  );
};

const styles = StyleSheet.create({
    container:{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: '#f5f5f5'
    }
});

export default App;
